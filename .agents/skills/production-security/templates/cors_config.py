"""
CORS Configuration Examples for FastAPI and Express.

Complete examples of both secure (production-ready) and dangerous (anti-pattern)
CORS configurations. Use the GOOD patterns as a starting point and replace the
example domains with your own.

Reference: production-security SKILL.md, Section 2 — CORS Configuration.
"""

# =============================================================================
# PYTHON / FASTAPI
# =============================================================================

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# ---------------------------------------------------------------------------
# GOOD — Specific origins, explicit methods and headers
# ---------------------------------------------------------------------------
# Replace these with your actual frontend domains.  Every origin must be an
# exact match (scheme + host + port).  No trailing slashes.

ALLOWED_ORIGINS = [
    "https://app.example.com",
    "https://staging.example.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,                          # cookies / Authorization header
    allow_methods=["GET", "POST", "PUT", "DELETE"],  # only methods your API uses
    allow_headers=["Authorization", "Content-Type"],  # only headers your API needs
    max_age=600,                                      # preflight cache: 10 minutes
)

# ---------------------------------------------------------------------------
# DANGEROUS — Never do this in production
# ---------------------------------------------------------------------------
# These settings are shown so you can recognize and remove them in code review.
#
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["*"],         # Any site on the internet can call your API
#     allow_credentials=True,      # Combined with "*", this is a security hole.
#                                  #   Browsers actually reject this combination,
#                                  #   but its presence signals a policy that has
#                                  #   not been thought through.
#     allow_methods=["*"],         # Exposes every HTTP method including PATCH,
#                                  #   OPTIONS, etc. even if you don't use them.
#     allow_headers=["*"],         # Accepts any request header — no reason to
#                                  #   allow headers you never read.
# )
#
# WHY THIS IS DANGEROUS:
#   - allow_origins=["*"] means evil.com can make fetch() requests to your API
#     using your user's browser session.
#   - allow_credentials=True with "*" is specifically forbidden by the spec
#     (the browser will block the response), but it shows intent to allow
#     credentialed cross-origin requests from everywhere.
#   - allow_methods=["*"] and allow_headers=["*"] widen the attack surface
#     for no reason.


# =============================================================================
# NODE.JS / EXPRESS
# =============================================================================

EXPRESS_GOOD_EXAMPLE = """
// --- GOOD: explicit whitelist with a validation callback ---

const cors = require('cors');

const allowedOrigins = [
  'https://app.example.com',
  'https://staging.example.com',
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, mobile apps)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,                              // cookies / Authorization header
  methods: ['GET', 'POST', 'PUT', 'DELETE'],      // only methods your API uses
  allowedHeaders: ['Authorization', 'Content-Type'],  // only headers your API needs
  maxAge: 600,                                     // preflight cache: 10 minutes
}));
"""

EXPRESS_DANGEROUS_EXAMPLE = """
// --- DANGEROUS: never do this in production ---

const cors = require('cors');

app.use(cors({
  origin: '*',            // Any site on the internet
  credentials: true,      // Browsers reject this combination, but it signals
                          // a policy that hasn't been thought through
}));

// This is equivalent to removing CORS protection entirely.
"""


# =============================================================================
# CORS RULES — Quick Reference
# =============================================================================
#
# 1. Never allow_origins=["*"] when allow_credentials=True.
#    Browsers reject this, but it signals you haven't thought about CORS.
#
# 2. Whitelist specific origins — your frontend domain(s), your staging
#    domain, nothing else.
#
# 3. allow_methods — only the methods your API actually uses.  If you don't
#    support PATCH, don't allow PATCH.
#
# 4. allow_headers — only "Authorization" and "Content-Type" for most APIs.
#    Adding more headers means more attack surface.
#
# 5. max_age — set to 600 (10 min) to reduce preflight requests.  Don't set
#    to 86400 in dev (causes stale CORS debugging nightmares).
#
# 6. Remember: CORS is a BROWSER-ONLY mechanism.  It does NOT protect against
#    server-to-server attacks, curl, or bots.  It protects your users' browsers
#    from malicious sites making authenticated requests on their behalf.
