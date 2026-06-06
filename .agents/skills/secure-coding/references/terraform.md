# Terraform — Secure IaC

Covers Terraform 1.x and OpenTofu across AWS, Azure, and GCP (the three biggest surface areas, though most principles apply to any provider). Also covers Terragrunt usage patterns.

Terraform's job is to codify infrastructure. Insecure Terraform doesn't *compromise* anything on its own — it declares insecure infrastructure that will run for years. Two categories dominate real-world breaches: **public exposure** (S3 buckets, open security groups, public IPs) and **secrets in state / config**.

## Secrets management

### Never commit secrets to `.tf` files

```hcl
# BAD — committed to git, visible in plan output, stored in state
resource "aws_db_instance" "db" {
  password = "hunter2"
}
```

Options, in order of preference:

1. **Secrets manager lookup at apply time:**
   ```hcl
   data "aws_secretsmanager_secret_version" "db" {
     secret_id = "prod/db/password"
   }
   resource "aws_db_instance" "db" {
     password = data.aws_secretsmanager_secret_version.db.secret_string
   }
   ```
2. **Variables marked `sensitive = true`**, passed via env (`TF_VAR_db_password`) or a secrets-injected CI:
   ```hcl
   variable "db_password" {
     type      = string
     sensitive = true
   }
   ```
3. **Generate and store**: use `random_password` + store the output in a secrets manager with `aws_secretsmanager_secret_version` (so it's never in a human-written file).

`sensitive = true` hides values from `plan`/`apply` output — but they still end up in state. Don't assume `sensitive` means "encrypted" — see state section.

### Terraform state contains everything

```hcl
# Whatever value is here — even if marked sensitive — lands in state
resource "aws_db_instance" "db" {
  password = var.db_password         # in state file, plaintext
}
```

State files MUST be stored encrypted, with access locked down:

```hcl
terraform {
  backend "s3" {
    bucket         = "company-tf-state"
    key            = "prod/network/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true                           # SSE-S3 or SSE-KMS
    kms_key_id     = "arn:aws:kms:..."              # customer-managed key preferred
    dynamodb_table = "tf-state-lock"                # prevent concurrent apply
  }
}
```

Rules for state:
- Never commit `terraform.tfstate` or `*.tfstate.backup` to git. `.gitignore`:
  ```
  *.tfstate
  *.tfstate.*
  .terraform/
  crash.log
  *.tfvars
  !example.tfvars
  ```
- Use a remote backend (S3 + DynamoDB, Terraform Cloud, Azure Storage, GCS) — never local state for shared infra.
- IAM on the state bucket: only the CI role and operators who need apply access.
- Versioning + MFA-delete on the state bucket. Log access via CloudTrail / equivalent.
- Never share state files via email, Slack, or tickets. Even "redacted" state leaks structure.

### Provider credentials

- Use OIDC federation (GitHub Actions → AWS, GitLab → GCP, etc.) so no long-lived keys live in CI secrets.
- If you must use static keys, rotate on a schedule and scope to the minimum needed.
- Never put `access_key` / `secret_key` in `.tf` files:
  ```hcl
  # BAD
  provider "aws" {
    access_key = "AKIA..."
    secret_key = "..."
  }
  ```
  Let the provider pick up env vars / credential chain / assumed role.

## Public exposure — the common misconfigurations

### AWS S3

```hcl
# BAD: world-readable bucket
resource "aws_s3_bucket" "public" {
  bucket = "my-data"
}
resource "aws_s3_bucket_acl" "public" {
  bucket = aws_s3_bucket.public.id
  acl    = "public-read"                        # publicly listable
}

# GOOD: private, with explicit public-access blocks
resource "aws_s3_bucket" "data" {
  bucket = "my-data"
}
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.data.arn
    }
  }
}
resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration { status = "Enabled" }
}
```

Apply `aws_s3_bucket_public_access_block` to **every** bucket by default. For buckets that must serve public content, use CloudFront in front and keep the bucket itself private.

### AWS security groups

```hcl
# BAD: SSH open to the world
resource "aws_security_group_rule" "ssh" {
  type        = "ingress"
  from_port   = 22
  to_port     = 22
  protocol    = "tcp"
  cidr_blocks = ["0.0.0.0/0"]
  security_group_id = aws_security_group.web.id
}
```

Default posture:
- Ingress: never `0.0.0.0/0` or `::/0` for management ports (SSH/22, RDP/3389, DB ports, internal services).
- HTTPS/443 from `0.0.0.0/0` on public load balancers is expected, not a finding.
- Egress: restrict where possible; "allow all" egress is common but SSRF / data exfiltration surface.

### GCP firewalls

```hcl
resource "google_compute_firewall" "bad" {
  name         = "allow-ssh"
  network      = google_compute_network.vpc.name
  source_ranges = ["0.0.0.0/0"]                   # DON'T
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
}
```

Use Identity-Aware Proxy (IAP) for SSH: `35.235.240.0/20` as the only allowed source for port 22, then restrict IAP access via IAM.

### Azure NSGs

Same principle — never source `*` / `Internet` for management ports. Use Bastion or JIT access.

## IAM

### Wildcards in policies

```hcl
# BAD: admin on everything
resource "aws_iam_role_policy" "bad" {
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "*"
      Resource = "*"
    }]
  })
}
```

Real-world allowlist pattern:
```hcl
data "aws_iam_policy_document" "lambda_s3_read" {
  statement {
    actions = ["s3:GetObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.data.arn,
      "${aws_s3_bucket.data.arn}/*",
    ]
  }
}
```

Audit for: `Action = "*"`, `Resource = "*"`, `NotAction`, `NotResource`, `iam:PassRole` without a `Condition`.

### Assume-role trust policies

```hcl
# BAD: any principal in any account can assume
data "aws_iam_policy_document" "bad_trust" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "AWS"
      identifiers = ["*"]                         # never
    }
  }
}
```

For cross-account: list specific account IDs / role ARNs. For OIDC federation (e.g., GitHub Actions): pin `token.actions.githubusercontent.com:sub` to the specific repo, branch, or environment:

```hcl
statement {
  actions = ["sts:AssumeRoleWithWebIdentity"]
  principals {
    type        = "Federated"
    identifiers = [aws_iam_openid_connect_provider.github.arn]
  }
  condition {
    test     = "StringEquals"
    variable = "token.actions.githubusercontent.com:sub"
    values   = ["repo:myorg/myrepo:environment:production"]
  }
  condition {
    test     = "StringEquals"
    variable = "token.actions.githubusercontent.com:aud"
    values   = ["sts.amazonaws.com"]
  }
}
```

Without the `sub` condition, **any GitHub Actions workflow in the world** can assume your role.

### Service accounts (GCP) / managed identities (Azure)

- Don't download and commit JSON key files. Use Workload Identity Federation or managed identities.
- Scope bindings to specific resources, not project-level.
- Avoid `roles/owner` / `roles/editor` — create custom roles with needed permissions.

## Encryption

### At rest

- S3: `aws_s3_bucket_server_side_encryption_configuration` with KMS (not SSE-S3) for sensitive data.
- RDS: `storage_encrypted = true`, `kms_key_id = ...` (customer-managed). `false` is the default on some older resource blocks.
- EBS: account-level default encryption enabled (`aws_ebs_encryption_by_default`) + use CMK.
- Azure: `encryption { key_vault_key_id = ... }` on storage accounts, SQL, disks.
- GCP: CMEK via `customer_managed_encryption_key` on GCS, BigQuery, Compute disks.

### In transit

- Load balancers: `ssl_policy = "ELBSecurityPolicy-TLS13-1-2-2021-06"` or newer, not `TLS-1-0`.
- RDS: `require_ssl`, rds_force_ssl parameter group.
- API Gateway: `minimum_tls_version = "TLS_1_2"` (or 1.3).
- CloudFront: `minimum_protocol_version = "TLSv1.2_2021"`.

## Logging and audit

- CloudTrail enabled, multi-region, log file validation on, logs to a separate account if possible.
- VPC flow logs → S3 or CloudWatch.
- S3 access logging on buckets that hold sensitive data.
- GCP: Cloud Audit Logs (Admin + Data Access) enabled.
- Azure: Azure Monitor Diagnostic Settings on every resource that supports them; send to a secure Log Analytics workspace.

## Networking

- Default VPC: don't deploy prod into it. Create purpose-built VPCs.
- Public vs private subnets: explicit. Database subnets should not route to IGW.
- No public IPs on EC2 unless required (`associate_public_ip_address = false` by default).
- VPC endpoints / Private Link for S3, DynamoDB, secrets manager — avoids traffic traversing the public internet.

## Resource defaults to always set

Many AWS resources default to insecure. Explicitly set:

| Resource | Required setting |
| --- | --- |
| `aws_s3_bucket` | `public_access_block` + encryption + versioning |
| `aws_db_instance` | `storage_encrypted`, `deletion_protection`, `skip_final_snapshot = false`, `publicly_accessible = false`, `iam_database_authentication_enabled` |
| `aws_instance` | `metadata_options { http_tokens = "required", http_endpoint = "enabled" }` — requires IMDSv2, blocks SSRF-to-metadata |
| `aws_lambda_function` | `tracing_config`, `dead_letter_config`, environment variables via KMS |
| `aws_cloudtrail` | `enable_log_file_validation = true`, `kms_key_id`, `is_multi_region_trail = true` |
| `aws_ecs_task_definition` | `execution_role_arn` separate from `task_role_arn` — principle of least privilege |
| `aws_api_gateway_stage` | `xray_tracing_enabled`, access logs enabled |

For Azure / GCP: similar lists. The theme is the same: **each resource should explicitly declare encryption, access control, and logging** — defaults are the enemy.

## Supply chain

### Module sources

```hcl
# BAD: unversioned, can change under you
module "vpc" {
  source = "git::https://github.com/random-user/modules.git//vpc"
}

# GOOD: pinned version
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.1.2"
}
```

- Pin to exact versions (or a tight range with `~>`).
- Use the Terraform Registry for well-known modules; review community modules before use.
- Private module registry (Terraform Cloud, Spacelift, Artifactory) for internal modules, so you control distribution.

### Provider versions

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.40"
    }
  }
}
```

Pin providers. `~>` gives patch upgrades but stops at the minor boundary. Run `terraform init -upgrade` intentionally.

### `.terraform.lock.hcl`

Commit it. Provider hashes are verified at init; without the lockfile you can't detect provider tampering.

## CI/CD

- `terraform plan` output should be reviewed by a human before apply for production.
- Run policy-as-code: `tfsec`, `checkov`, `terrascan`, `trivy config`, `Sentinel` (Terraform Cloud), `OPA/conftest`. Fail the PR on policy violations.
- Output from `terraform plan` can contain secrets even when `sensitive`-marked — don't post raw plan to public PRs. Use plan summaries via `tf-plan-summary` or an OIDC-gated bot.
- Don't `terraform apply -auto-approve` to prod without a prior reviewed plan.

## Dangerous patterns

### `local-exec` / `remote-exec` provisioners

```hcl
# BAD: user input → shell command
resource "null_resource" "setup" {
  provisioner "local-exec" {
    command = "curl ${var.endpoint} | sh"
  }
}
```

Any user/attacker who can modify `var.endpoint` can execute arbitrary commands on the machine running `apply`. Provisioners are an escape hatch — use them only as a last resort, and treat every input as attacker-controlled.

### `count` / `for_each` on sensitive resources

If you control parallelism by list length and the list comes from a data source, changes in upstream data can silently expand the blast radius. Review `for_each` inputs as security-relevant state.

### Ignoring changes on sensitive fields

```hcl
lifecycle {
  ignore_changes = [tags, policy]           # policy drift becomes invisible
}
```

Don't ignore changes on IAM policies, SG rules, encryption configs — that's the drift you most want to see.

## Policy / linting — run in CI

- **tfsec** — fast, rule-based, strong AWS/Azure/GCP coverage.
- **checkov** — broadest coverage (Terraform, CloudFormation, K8s, Dockerfiles).
- **trivy config** — combined vulnerability + misconfig scanner.
- **terraform-compliance** — BDD-style compliance tests.
- **Sentinel / OPA (conftest)** — policy-as-code for organization standards.

Configure them to fail the build on `CRITICAL` and `HIGH` findings; triage `MEDIUM`.

## Terragrunt specifics

- `inputs = { db_password = ... }` — same rules: never literal secrets, pull from a secrets manager.
- `remote_state` config should enforce encryption and DynamoDB locking at the Terragrunt level.
- `dependency` blocks create implicit read access to other stack outputs — audit what crosses stack boundaries.

## Multi-account / multi-environment hygiene

- Separate AWS accounts for prod / staging / dev. Cross-account access via explicit role-assumption, never shared credentials.
- Don't use `terraform workspace` for prod/dev separation on the same backend — workspaces share IAM access and state bucket. Use separate backends per environment.

## Framework-specific footguns

- `aws_iam_user_policy` with inline `"*"` actions frequently slip through review because the policy is small — read every policy's `Action` / `Resource` explicitly.
- `aws_security_group` with `ingress { ... }` blocks inline vs `aws_security_group_rule` resources — use the latter for modularity; mixing both causes drift.
- `aws_db_instance.password` is a required arg for master password — if you omit it, TF prompts interactively. Automate via secrets manager data source, don't hardcode.
- `lifecycle { create_before_destroy = true }` on resources with unique names (S3 bucket names, DB identifiers) can fail mid-apply, leaving orphan resources.
- Data source `aws_caller_identity` and similar are fine, but `data "http"` can leak secrets if called with user input (request/response cached in state).
- `random_password` result is stored in state — fine as long as state is encrypted and access-controlled.
- `sensitive = true` hides from UI but not from state, not from logs, not from providers sending to APIs. Treat it as a display hint, not a security control.
- Using `count = var.enable ? 1 : 0` with `.` attribute access (e.g., `aws_foo.x[0].id`) — if `enable` flips, the resource is destroyed. Verify before applying.
- Import existing resources with `terraform import` — the state captures current config, but missing attributes in HCL will cause drift and potentially remove config (e.g., public access blocks) on next apply.
- `aws_instance.user_data` is passed in base64 — but plain `user_data` is stored in state plaintext. If it contains secrets, use `user_data_base64` with a separately-fetched secret, or SSM Parameter Store at boot.

## Review checklist

1. No secrets in `.tf` or `.tfvars` files checked into git
2. Remote state backend configured with encryption + locking + versioning
3. `.gitignore` covers `*.tfstate*`, `.terraform/`, `*.tfvars` (except examples)
4. Provider credentials via OIDC / instance profile / env vars, never in provider blocks
5. All S3 buckets have `public_access_block` + encryption
6. No security-group or firewall rules with `0.0.0.0/0` for management ports
7. IAM policies use specific actions/resources; no `"*"`/`"*"` grants
8. Trust policies for assumed roles have tight `Condition` blocks (OIDC sub, account ID, aud)
9. Databases: `storage_encrypted = true`, `publicly_accessible = false`, `deletion_protection = true`
10. EC2: IMDSv2 enforced (`http_tokens = "required"`)
11. CloudTrail / Cloud Audit Logs / Azure Diagnostic Settings enabled on all accounts
12. Modules pinned to exact versions; `.terraform.lock.hcl` committed
13. `terraform plan` output not posted to public PRs without redaction
14. `tfsec` / `checkov` / `trivy config` run in CI; findings triaged
15. Provisioners avoided; no `local-exec` with user-controlled input
16. `lifecycle { ignore_changes }` not covering security-sensitive fields
17. Separate state / backends per environment (not just workspaces)
