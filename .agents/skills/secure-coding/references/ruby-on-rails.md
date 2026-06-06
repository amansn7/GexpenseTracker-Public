# Ruby on Rails — Secure Coding

Covers Rails 6.1, 7.x, and 8.x. Rails has strong secure defaults — most issues come from disabling them or using older "raw" patterns.

## Injection

### SQL injection

ActiveRecord parameterizes by default. Common ways to break that:

```ruby
# UNSAFE — string interpolation in where
User.where("email = '#{params[:email]}'")
User.where("name = '#{name}' AND active = true")

# UNSAFE — order/group/select with user input
User.order(params[:sort])
User.group(params[:by])

# UNSAFE — find_by_sql with interpolation
User.find_by_sql("SELECT * FROM users WHERE id = #{id}")
```

Safe equivalents:
```ruby
User.where("email = ?", params[:email])
User.where(email: params[:email])
User.where("name = ? AND active = ?", name, true)
User.find_by_sql(["SELECT * FROM users WHERE id = ?", id])

# For dynamic order, allowlist
ALLOWED_SORTS = %w[name created_at email].freeze
User.order(params[:sort]) if ALLOWED_SORTS.include?(params[:sort])
```

`Arel.sql(string)` bypasses Rails' SQL injection protection — only use it with strings you control, never with user input.

### Command injection

```ruby
# UNSAFE
system("convert #{filename} out.png")
`convert #{filename} out.png`
IO.popen("convert #{filename} out.png")
exec("convert #{filename} out.png")

# SAFE: argv form bypasses the shell
system("convert", filename, "out.png")
IO.popen(["convert", filename, "out.png"])
```

### Template injection (ERB)

`render inline: params[:template]` and `ERB.new(user_input).result` are RCE. Don't.

`render template: params[:t]` lets the user pick which template — also dangerous (can render admin templates with user-context locals). Always render from a fixed allowlist.

## AuthN / AuthZ

### Auth gems

- **Devise** is the standard. Use `bcrypt` (default) for passwords; configure `config.password_length = 12..128`.
- **`has_secure_password`** (built into Rails) for simpler apps — uses bcrypt.
- For tokens, use `has_secure_token` (Rails 5+) which generates URL-safe random tokens.

Don't store passwords with `Digest::SHA1` or any unsalted hash. If migrating from a legacy system, `BCrypt::Password.create(legacy_hash)` to wrap the old hash, then re-hash on next login.

### Authorization

- **Pundit** (policy classes) or **CanCanCan** (ability rules). Pick one and apply to every action — `verify_authorized` in `ApplicationController` raises if a controller action forgets to call `authorize`.

```ruby
class ApplicationController < ActionController::Base
  include Pundit::Authorization
  after_action :verify_authorized, except: :index, unless: :devise_controller?
  after_action :verify_policy_scoped, only: :index
end
```

### Strong parameters

Always use `permit` / `require`. Never `params.permit!` or `params[:user]` directly to mass-assign:
```ruby
# UNSAFE — user can set is_admin
User.create!(params[:user])

# SAFE
def user_params
  params.require(:user).permit(:email, :name)   # is_admin NOT permitted
end
User.create!(user_params)
```
Be careful with nested attributes — `accepts_nested_attributes_for` requires explicit permits for the nested keys too.

### IDOR

```ruby
# UNSAFE: any user can fetch any order
order = Order.find(params[:id])

# SAFE
order = current_user.orders.find(params[:id])
# OR with Pundit
order = Order.find(params[:id])
authorize order
```

### Session & cookie config

Rails defaults are good but verify:
```ruby
# config/initializers/session_store.rb
Rails.application.config.session_store :cookie_store,
  key: "_app_session",
  secure: Rails.env.production?,
  httponly: true,
  same_site: :lax        # :strict if no cross-site flows

# config/application.rb
config.force_ssl = true   # in production
```

The default cookie session store is **encrypted** in modern Rails (`config.action_dispatch.cookies_serializer = :json`). Don't switch to `:marshal` (CVE territory).

## CSRF

`protect_from_forgery with: :exception` is on by default in `ApplicationController`. Common ways to break it:

- `skip_before_action :verify_authenticity_token` — sometimes needed for API endpoints, but only those authed by Bearer tokens, not session cookies.
- Using `protect_from_forgery with: :null_session` for the entire app means CSRF failures silently null out the session — tolerable for APIs, dangerous for HTML.
- API-only Rails apps (`--api`) don't include CSRF middleware. If you add session-based auth back, you must add `protect_from_forgery`.

For SPAs that share session cookies, expose the CSRF token via meta tags (Rails' `csrf_meta_tags`) and have the SPA echo it as `X-CSRF-Token`.

## XSS / output encoding

ERB auto-escapes `<%= %>`. Bypasses:

- `<%= raw user_input %>` — disables escape.
- `<%= user_input.html_safe %>` — same.
- `content_tag(:div, user_input)` — auto-escapes content; safe.
- `link_to name, url` — escapes `name`, but `url` is rendered raw — never put `javascript:user_input` there.

For JSON in HTML (e.g., bootstrapping SPA state):
```erb
<%= javascript_tag do %>
  window.__data = <%= raw @data.to_json %>;
<% end %>
```
This is unsafe if `@data` contains user-controlled strings with `</script>`. Use `json_escape` (Rails 4.1+) or render via `<script type="application/json">`.

## CORS

Add `rack-cors` and configure restrictively:
```ruby
# config/initializers/cors.rb
Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins "https://app.example.com"     # not "*"
    resource "/api/*",
      headers: :any,
      methods: [:get, :post, :put, :delete],
      credentials: true
  end
end
```
`origins "*"` with `credentials: true` is rejected — but rack-cors will quietly drop the credentials. Always list explicit origins.

## Secrets & config

- Use Rails 5.1+ encrypted credentials: `bin/rails credentials:edit`. The `master.key` must NOT be committed; deploy via env var `RAILS_MASTER_KEY`.
- Different envs: use `config/credentials/production.yml.enc` etc.
- `secret_key_base` is auto-managed via credentials. Rotation invalidates sessions and signed cookies.
- `config.consider_all_requests_local = false` in production so error pages don't leak info.

## Crypto

- Use `SecureRandom` for tokens (`SecureRandom.urlsafe_base64(32)`), never `Random` or `rand`.
- `ActiveSupport::MessageEncryptor` and `MessageVerifier` for app-level encryption / signing.
- AES via OpenSSL — use AES-256-GCM, never AES-CBC without a separate MAC, never AES-ECB.
- Don't roll JWT — use the `jwt` gem and pin `algorithm:` on decode.

## File upload & path traversal

Active Storage handles uploads with reasonable defaults:
```ruby
class User < ApplicationRecord
  has_one_attached :avatar
end

# In model — validate type and size
validate :avatar_validation
def avatar_validation
  return unless avatar.attached?
  errors.add(:avatar, "too big") if avatar.byte_size > 5.megabytes
  errors.add(:avatar, "wrong type") unless avatar.content_type.in?(%w[image/png image/jpeg])
end
```

Active Storage uses signed blob URLs that don't leak storage paths. If you self-roll uploads:
- Sanitize filenames with `ActiveStorage::Filename.new(name).sanitized` or strip path separators yourself.
- Validate content type by sniffing magic bytes (`Marcel::MimeType.for(io)`), not the client's `content_type`.
- Store outside the public dir, serve via controller with auth.
- `ActionController::Parameters#file_field_value` doesn't exist — don't trust filename for type detection.

## Deserialization

- `Marshal.load(user_data)` = RCE. Never. Same for `YAML.load(user_data)` — use `YAML.safe_load`.
- Cookies serializer should be `:json`, not `:marshal` (the latter is RCE on session-secret leak). Modern Rails defaults to `:json`; verify.
- `JSON.parse` is safe. `Oj.load(s, mode: :object)` is NOT — use `mode: :strict` or `:safe`.
- ActiveRecord serialized columns: `serialize :data, JSON` is safe; `serialize :data` (default uses YAML) is dangerous if anyone can write to the column.

## SSRF

For URL-fetching features:
- Use `Net::HTTP` or `HTTParty` with a vetted URL — resolve hostname, reject private IPs.
- `OpenURI.open_uri(url)` follows redirects to any target — dangerous for user-supplied URLs.
- `Down` gem has `Down.download(url, max_size: ...)` and integrates with `private_address_check` gem for SSRF protection.

## Security headers

Rails sets some by default:
```ruby
# config/application.rb
config.action_dispatch.default_headers = {
  "X-Frame-Options" => "SAMEORIGIN",
  "X-XSS-Protection" => "0",        # modern browsers; Rails 7 default
  "X-Content-Type-Options" => "nosniff",
  "X-Permitted-Cross-Domain-Policies" => "none",
  "Referrer-Policy" => "strict-origin-when-cross-origin"
}
```
For CSP, use Rails' built-in DSL:
```ruby
# config/initializers/content_security_policy.rb
Rails.application.config.content_security_policy do |policy|
  policy.default_src :self
  policy.script_src  :self
  policy.object_src  :none
end
```
HSTS is enabled when `force_ssl = true`.

## Logging & error handling

- `Rails.logger.info params.inspect` leaks passwords. Use `config.filter_parameters` (defaults filter `:password`, `:secret`, `:token` etc.) — add domain-specific fields like `:ssn`, `:credit_card`.
- `config.action_dispatch.show_exceptions = true` and `config.consider_all_requests_local = false` in production so users get generic error pages, not stack traces.
- `Rails.logger.error e.full_message` in dev is fine, but in prod centralize via Sentry/Honeybadger and don't log to stdout that's tailed by users.
- The default Rails error page in dev (`/rails/info`) leaks routes and config — never expose in prod.

## Dependencies

- `bundler-audit` in CI — checks Gemfile.lock against advisory DB.
- Rails security mailing list: rubyonrails-security@googlegroups.com.
- Common high-impact CVEs: ActionPack (CVE-2019-5418 file content disclosure), Marshalling/cookie serializer issues, Nokogiri (libxml2/libxslt), Devise.

## Framework-specific footguns

- `render file: params[:f]` reads any file the Rails process can — use `render template:` with allowlist.
- `redirect_to params[:url]` is an open redirect. Use `url_from(params[:url])` (Rails 7+) which returns nil for off-host URLs.
- `Marshal`-serialized session cookies + leaked `secret_key_base` = RCE.
- `find_by_sql`, `pluck("name; DROP TABLE users")`, `from(params[:t])` all accept raw SQL fragments.
- ActiveJob with `retry_on Exception` can mask failures; with serialized GlobalIDs of arbitrary records, can lead to mass-assignment-style bugs.
- ActionMailer URL helpers default to `localhost:3000` if `default_url_options` isn't set in production — embedded links in emails point to localhost.
- `before_action :require_login` skipped on a single action (`skip_before_action :require_login, only: :foo`) is easy to add and forget — use `verify_authorized` (Pundit) as a backstop.
- ActiveStorage direct uploads issue signed URLs — but if you set `config.active_storage.draw_routes = false` and self-roll, you may serve blobs without auth.
- `params.to_unsafe_h` returns the full hash including unpermitted keys — never pass to `update` / `create`.
- ERB partials rendered with `locals: params.to_unsafe_h` can be a path-traversal magnet if used with `render params[:partial]`.

## Review checklist

1. No string interpolation inside `where`, `order`, `find_by_sql`, `from`, `joins`
2. No backticks, `system "..."`, or `IO.popen "..."` (string form) with user input
3. Strong parameters used everywhere; no `params.permit!`, no `params[:model]` direct
4. Pundit/CanCanCan applied; `verify_authorized` enforced
5. `current_user.orders.find(...)` pattern (or equivalent) for ownership
6. CSRF protection not skipped on session-authed endpoints
7. ERB has no `raw` / `html_safe` on user input; SPA bootstrap uses `json_escape`
8. CORS origins explicit
9. File uploads validated for type (magic bytes) and size
10. `Marshal.load` and unsafe `YAML.load` not used on untrusted data
11. Security headers (CSP, HSTS via `force_ssl`)
12. `filter_parameters` covers all sensitive fields
13. `config.consider_all_requests_local = false` in production
14. `bundler-audit` clean
