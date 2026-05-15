"""
Multi-provider LLM client with automatic rate-limit fallback.

Priority order (best error-rate first, then configured order):
  OpenRouter - Google Gemini - Grok (xAI) - Scaleway

When a provider returns 429 it is marked rate-limited for `Retry-After`
seconds (default 60 s).  The next available provider is tried automatically.
If all providers are exhausted, an alert is added and an exception is raised.
"""
import json
import logging
import time
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import httpx

from app.config import settings
from app.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

# ── Prompts ───────────────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a high-precision financial email classifier for Indian banking, UPI, and payment emails. "
    "Determine whether an email represents a real financial transaction, classify the "
    "direction of money flow, and extract normalized transaction metadata. "
    "Ignore marketing, OTPs, reminders, and informational emails. "
    "Prioritize PRECISION over recall. If uncertain, return null values and lower "
    "confidence instead of guessing. "
    "Respond ONLY with valid JSON. No explanation, no markdown, no code blocks."
)

# Full classify + extract - used during initial sync / reclassify
_PRE_EXTRACTION_BLOCK = """
PRE-EXTRACTED FACTS (regex-based - verify against email; override if contradicted):
{lines}
"""


def _build_pre_extraction_block(pre: dict) -> str:
    lines = []
    if pre.get("amount") is not None:
        lines.append(f"- Amount: {pre['amount']} INR")
    if pre.get("date"):
        lines.append(f"- Date: {pre['date']}")
    if pre.get("direction") not in (None, "unknown"):
        lines.append(f"- Direction: {pre['direction']}")
    if pre.get("mode") not in (None, "unknown"):
        lines.append(f"- Mode: {pre['mode']}")
    if pre.get("merchant"):
        lines.append(f"- Merchant: {pre['merchant']}")
    if pre.get("category_hint"):
        lines.append(f"- Category hint: {pre['category_hint']}")
    if not lines:
        return ""
    return _PRE_EXTRACTION_BLOCK.format(lines="\n".join(lines))


_USER_TEMPLATE = """# CLASSIFICATION RULES

## EXPENSE — money going OUT:
Triggers: debited, charged, paid, purchase, spent, payment, withdrawal, fee, invested, SIP, subscribed (mutual fund), purchased (shares/units)
Bank debits, UPI payments, card transactions, bill payments, EMIs, subscriptions, ATM withdrawals, wallet deductions, insurance premiums, SIP investments, mutual fund/stock purchases, demat transactions, e-commerce orders with confirmed payment
→ label: "expense"

## INCOME — money coming IN:
Triggers: credited, deposited, salary, refund, cashback, reversal, interest
You received, received from, credited to your account
Salary credits, refunds, cashback, UPI/IMPS receipts, interest/dividend credits, reward points redeemed
→ label: "income"

REFUND / REVERSAL → always "income" (money returning to you)

## IGNORE — no real transaction occurred:
- OTP / 2FA codes — "OTP for transaction", "login OTP", "verification code"
- Security alerts — "new device login", "password changed", "unusual activity"
- Balance/limit alerts — "low balance", "minimum amount due", "credit limit"
- Statement ready — "monthly statement", "account summary", "transaction report"
- Offers / promos — "special offer", "festive sale", "discount", "cashback offer"
- Delivery/shipment notifications (standalone tracking only — "order shipped", "out for delivery", "item delivered", "package delivered").
  NOTE: App-level savings/discount numbers ("₹145 saved", "₹69 saved") are promotional, NOT transaction amounts. Ignore them.
  IMPORTANT: Delivery notifications that list ordered items with prices (e.g. "1 x Butter ₹122") are still DELIVERY notifications — no money moved in this email. These are IGNORE, not expenses.
  IMPORTANT: Order confirmation / receipt emails ("Thanks for your order", "Order confirmation", "Your order of") that contain product details AND a total amount are EXPENSES, not delivery notifications.
  Distinction: order confirmation = payment was processed → expense. Delivery notification = items were delivered → ignore. If the body says "delivered", "out for delivery", or "shipped", it is a delivery notification regardless of whether it lists items.
- Newsletters — "weekly digest", "tips & tricks", "recommendations"
- KYC / compliance — "update KYC", "Aadhaar linking", "PAN verification"
- Password resets — "reset password", "password change request"
- Confirmations — welcome email, terms updated, fee change notification
- CREDIT CARD BILL PAYMENTS — user is paying their card bill, not making a new purchase. The individual transactions were already recorded. These are "ignore", category=CC Payment:
  "Credit card bill payment of Rs.X"                                      → ignore, category=CC Payment
  "We have received payment of Rs.X on your Credit Card"                  → ignore, category=CC Payment
  "Payment received towards your credit card"                             → ignore, category=CC Payment
  "Thank you for your payment of Rs.X"                                    → ignore, category=CC Payment
  "Autopay: Rs.X debited for credit card bill"                            → ignore, category=CC Payment
  WARNING: "received payment" / "payment received" in a credit card context means the BANK received your payment. This is NOT income. It is money going OUT from you.
→ label: "ignore", category: "CC Payment"

# PRIORITY RULES (apply in order)
1. OTP/security verification → IGNORE immediately
2. Credit card bill payment received by bank → IGNORE, category=CC Payment (NOT income!)
3. Explicit money movement confirmed → classify transaction
4. Reminder or informational only → IGNORE
5. Both promotional and transactional text → classify based ONLY on the transactional section
6. Never extract merchants from footer/marketing text
7. Prefer explicit transaction amounts over promotional/savings amounts

# INPUT
From: {sender}
Subject: {subject}
Body: {body_snippet}

Available categories: {categories}

# AMOUNT EXTRACTION
INR in rupees (number only, no currency symbols or commas).
"Rs.499.00" → 499, "INR 1,200.50" → 1200.5, "₹1,299" → 1299
null if no INR amount found or email is non-transaction
DO NOT extract savings, cashback offers, discounts, credit limits, or statement totals unless payment executed.

# MERCHANT EXTRACTION
Payee / store / service — NOT bank, NOT payment gateway, NOT payment platform.
Clean raw merchant codes to readable names:
"WWW SWIGGY IN"/"SWIGGY*"/"BUNDL TECHNOLOGIES"/"BUNDL" → "Swiggy"
"AMZN MKTP IN"/"AMAZON.IN"/"AMZ*" → "Amazon"
"ZOMATO*ORDER"/"ZOMATO"/"ZOMATO ONLINE" → "Zomato"
"NETFLIX.COM"/"Netflix" → "Netflix"
"SPOTIFY" → "Spotify"
"UBER TRIP"/"UBER" → "Uber"
"BLINKIT IN" → "Blinkit"
"ZEITO" → "Zepto"
"PHONEPE*"/"PHONEPE" → "PhonePe" (UPI app, not merchant)

WARNING: Payment gateway descriptors (Razorpay, Billdesk, CC Avenue, PayU, CCAvenue, Paytm) are NOT merchants — the real merchant is in the email body. null merchant rather than using gateway name.
WARNING: Bank emails contain marketing footers ("offers", "discounts", "recommendations in your city"). NEVER use footer text as merchant.
IMPORTANT: If the merchant code is a parent/entity company, scan the email subject and body for the consumer-facing brand name. "BUNDL TECHNOLOGIES" in debit alert → body says "Swiggy".
Read only the transaction body. null if no identifiable payee.

# CATEGORY MAPPING
Pick closest match from: {categories}. If none fits, use "Other".
UPI payment → UPI Payment | Mutual fund/SIP → Investment | Insurance premium → Insurance
Refund/reversal → Refund | Salary credit → Income | EMI debit → EMI
ATM withdrawal → Cash | P2P transfer → Bank Transfer | Streaming → Subscription
Credit card BILL PAYMENTS are IGNORE, category CC Payment (underlying purchases already recorded).

# DATE EXTRACTION
Actual transaction date (YYYY-MM-DD). NOT email received date.
"on 18-Apr-2026" → "2026-04-18" | "dated 15/03/2026" → "2026-03-15" | "on 18 April 2026" → "2026-04-18"
null if date is absent or ambiguous

# EMAIL TYPE CLASSIFICATION
bank_alert — bank debit/credit notification | upi_notification — UPI confirmation
merchant_receipt — e-commerce / service receipt | bill_reminder — due date reminder
otp — one-time password / 2FA | offer — marketing / promotional
alert — security / low-balance | newsletter — tips / updates
statement — account summary | null — unsure or other

========================================
COMMON INDIAN EMAIL PATTERNS:
========================================

BANK DEBIT:
  "Rs.X debited from your account/card ... towards MERCHANT"              → expense
  "INR X has been debited from a/c XXXX"                                 → expense (merchant in body)
  "Card purchase of INR X at MERCHANT"                                    → expense
  "X spent on your card at MERCHANT"                                      → expense
  "Your card has been used for INR X at MERCHANT"                         → expense

INVESTMENT / SIP — money going OUT to buy financial assets:
  "Order Sent to AMC", "investment placed with the AMC", "SIP mandate"
  "Your SIP has been processed", "investment successfully placed",
  "mutual fund units purchased", "demat transaction"
  IMPORTANT: These are expenses (money leaving your account to buy assets).
  Do NOT classify as "ignore" — a real financial outflow occurred.
  → label: "expense", category: "Investment"
  merchant: the fund/stock name (e.g. "ICICI Prudential BHARAT 22 FOF Direct - Growth")
  If the email only says "Order Sent to AMC" with a fund name below, use that fund name as merchant.

INSURANCE — money going OUT for insurance premiums:
  "Payment Receipt for your ... Insurance Policy", "insurance premium paid",
  "policy payment received", "insurance renewal", "premium receipt"
  "Thank you for renewing your insurance policy", "Amount Paid"
  with policy number and insurance company name
  → label: "expense", category: "Insurance"
  merchant: the insurance company name (e.g. "Axis Max Life Insurance",
            "HDFC Life", "ICICI Prudential Life")
  If the email says "Payment Receipt for your [Company] Insurance Policy",
  use the company name as merchant.

UPI:
  "You have paid Rs.X to MERCHANT via UPI"                                → expense, category=UPI Payment
  "UPI transaction of Rs.X debited"                                       → expense
  "Rs.X has been sent to MERCHANT via UPI"                                → expense
  "Rs.X received from SENDER via UPI"                                     → income
  "You have received Rs.X from SENDER"                                    → income

IMPS / NEFT / RTGS BANK TRANSFERS:
  "debited with INR X ... by IMPS / NEFT / RTGS"                         → expense (money out)
  "INR X transferred from your account via IMPS"                          → expense
  "Funds transferred from your a/c XXXX via NEFT"                         → expense
  "INR X credited to your account via IMPS"                               → income (money in)
  "IMPS credit of INR X from SENDER NAME"                                 → income, merchant=SENDER NAME
  "NEFT credit — INR X from SENDER NAME"                                  → income, merchant=SENDER NAME
  WARNING: The transaction reference (e.g. "IMPS/P2A/612320192552")
  contains a coded recipient. Read the body for the actual sender/recipient
  name. NEVER use email footer/marketing text as the merchant name.

CREDIT / INCOME:
  "INR X credited to your account"                                        → income
  "Salary of Rs.X credited"                                               → income, category=Income
  "Rs.X deposited in your account"                                        → income
  "NEFT / IMPS credit of Rs.X from SENDER"                                → income
  "Interest of Rs.X credited to your account"                             → income

REFUND / CASHBACK:
  "Rs.X refunded / reversed to your account"                              → income, category=Refund
  "Cashback of Rs.X credited"                                             → income, category=Cashback
  "Refund of Rs.X processed for MERCHANT"                                 → income, category=Refund

CARD / EMI:
  "EMI of Rs.X debited for MERCHANT"                                      → expense, category=EMI

  "Minimum amount due: Rs.X"                                              → ignore (reminder)
  "Your credit card statement is ready"                                   → ignore

ATM:
  "Rs.X withdrawn from ATM"                                               → expense, category=Cash
  "Cash withdrawal of Rs.X at ATM location"                               → expense, category=Cash

OFFER / PROMO:
  "Special offer just for you" / "Festive sale" / "Get X% cashback"      → ignore
  "Book now at discounted prices" / "Limited period offer"                → ignore

E-COMMERCE / ORDER CONFIRMATION — contains product details + total:
  "Thanks for your order" / "Order confirmation" / "Your order of"        → expense
  "Order #..." + product name + quantity + total amount                    → expense
  Email contains both delivery status AND purchase details with total      → expense

========================================
# CONFIDENCE SCORING
0.95–1.00: structured bank/UPI alert with explicit amount + merchant
0.85–0.94: clear merchant receipt / order confirmation
0.70–0.84: partial ambiguity but likely correct
0.50–0.69: weak evidence / incomplete extraction
0.00:      ignore / non-transaction

# HARD SAFETY RULES
NEVER: hallucinate merchants, infer missing amounts, use footer text, use bank name as merchant (unless bank is payee), classify reminders as transactions, treat offers as cashback credits.
When uncertain → null fields + lower confidence.

========================================
Respond ONLY with valid JSON:
{{"label":"expense|income|ignore","amount":0.00,"merchant":"name or null","category":"category or null","txn_date":"YYYY-MM-DD or null","confidence":0.0,"email_type":"type or null"}}"""

_BATCH_USER_TEMPLATE = """You have {count} financial emails to classify. Process ALL of them.

{email_blocks}

# CLASSIFICATION RULES

## EXPENSE — money going OUT:
Triggers: debited, charged, paid, purchase, spent, payment, withdrawal, fee, invested, SIP, subscribed (mutual fund), purchased (shares/units)
Bank debits, UPI payments, card transactions, bill payments, EMIs, subscriptions, ATM withdrawals, wallet deductions, insurance premiums, SIP investments, mutual fund/stock purchases
→ label: "expense"

## INCOME — money coming IN:
Triggers: credited, deposited, salary, refund, cashback, reversal, interest
You received, received from, credited to your account
Salary credits, refunds, cashback, UPI/IMPS receipts, interest/dividend credits, reward points redeemed
→ label: "income"

REFUND / REVERSAL → always "income" (money returning to you)

## IGNORE — no real transaction occurred:
- OTP / 2FA codes
- Security alerts — new device login, password changed, unusual activity
- Balance/limit alerts — low balance, minimum amount due, credit limit
- Statement ready — monthly statement, account summary, transaction report
- Offers / promos — special offer, festive sale, discount, cashback offer
- Delivery/shipment notifications (standalone tracking only)
- Newsletters — weekly digest, tips, recommendations
- KYC / compliance — update KYC, Aadhaar linking, PAN verification
- Password resets, welcome emails, terms updates, fee change notifications
- CREDIT CARD BILL PAYMENTS — "We have received payment on your Credit Card", "payment received towards credit card". Bank received your payment = money going OUT from you, NOT income. → ignore, category=CC Payment
→ label: "ignore"

E-COMMERCE / ORDER CONFIRMATION — "Thanks for your order", "Your order of",
  Order # + product + quantity + total. These are EXPENSES, not delivery notifications.
  CRITICAL: Delivery notifications that list ordered items with prices are still DELIVERY notifications — no money moved. IGNORE them.

INVESTMENT / SIP — money going OUT to buy financial assets:
  "Order Sent to AMC", "investment placed with the AMC", "SIP mandate"
  "Your SIP has been processed", "mutual fund units purchased"
  These are expenses (real outflow). Do NOT classify as "ignore".
  → label: "expense", category: "Investment"
  merchant: the fund/stock name

INSURANCE — money going OUT for insurance premiums:
  "Payment Receipt for your ... Insurance Policy", "insurance premium paid",
  "policy payment received", "insurance renewal", "Amount Paid" with policy number
  → label: "expense", category: "Insurance"
  merchant: the insurance company name (e.g. "Axis Max Life Insurance")

========================================
EXTRACTION RULES:
========================================
- amount: INR in rupees (number only, no symbols or commas). "Rs.499" → 499, "INR 1200.50" → 1200.5. null if no amount found.

- merchant: payee / store / service — NOT bank, NOT payment gateway.
  Clean codes: "WWW SWIGGY IN"/"SWIGGY*"/"BUNDL TECHNOLOGIES"/"BUNDL" → "Swiggy",
  "AMZN MKTP IN" → "Amazon", "ZOMATO*ORDER"/"ZOMATO"/"ZOMATO ONLINE" → "Zomato",
  "NETFLIX.COM" → "Netflix", "UBER TRIP" → "Uber", "BLINKIT IN" → "Blinkit"
  WARNING: Payment gateways (Razorpay, Billdesk, CC Avenue, PayU, CCAvenue, Paytm) are NOT merchants — null instead.
  WARNING: Bank emails have marketing footers. NEVER use footer text as merchant.

- category: one of — {categories}. Use "Other" if none fits. Refunds → Refund. EMIs → EMI. CC bill payments → CC Payment.

- txn_date: actual transaction date from body (YYYY-MM-DD). null if absent.

- confidence: 0.95–1.00 clear bank/UPI alerts · 0.85–0.94 merchant receipts · 0.70–0.84 partial ambiguity · 0.50–0.69 weak evidence · 0.00 ignore

- email_type: classify the EMAIL itself: "bank_alert" | "upi_notification" | "merchant_receipt" | "bill_reminder" | "otp" | "offer" | "alert" | "newsletter" | "statement" | null

========================================
Respond ONLY with a JSON array — one object per email, in order:
[{{"label":"expense|income|ignore","amount":0.00,"merchant":"...","category":"...","txn_date":"...","confidence":0.0,"email_type":"..."}},...]"""


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class LLMClassification:
    label: str
    amount: Optional[float]
    merchant: Optional[str]
    category: Optional[str]
    txn_date: Optional[str]
    confidence: float
    email_type: Optional[str] = None


@dataclass
class _Provider:
    name: str
    base_url: str
    api_key: str
    model: str
    extra_headers: dict = field(default_factory=dict)
    rate_limited_until: float = field(default=0.0)
    rate_limit_count: int = field(default=0)   # cumulative hits - used for persistent demotion
    success_count: int = field(default=0)
    fail_count: int = field(default=0)

    @property
    def available(self) -> bool:
        return bool(self.api_key) and time.time() >= self.rate_limited_until

    def mark_rate_limited(self, retry_after: int = 60) -> None:
        self.rate_limit_count += 1
        self.rate_limited_until = time.time() + retry_after
        logger.warning(
            "LLM provider '%s' rate limited (hit #%d) - backing off %ds",
            self.name, self.rate_limit_count, retry_after,
        )
        from app.alerts import add_alert
        add_alert(
            "warning",
            f"LLM provider '{self.name}' hit rate limit (#{self.rate_limit_count}). "
            f"Priority lowered. Switching to next provider for {retry_after}s.",
            source="llm",
        )

    @property
    def priority_score(self) -> float:
        """Lower score = higher priority.
        Each rate-limit hit adds 0.25 to the score, persistently demoting the provider.
        Ties broken by error rate.
        """
        return self.rate_limit_count * 0.25 + self.error_rate

    @property
    def error_rate(self) -> float:
        total = self.success_count + self.fail_count
        return self.fail_count / total if total > 0 else 0.0


# ── Parser ────────────────────────────────────────────────────────────────────

import re


def _extract_json(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
            elif text.startswith("xml"):
                text = text[3:]
    text = text.strip()
    text = re.sub(r"^```.*$", "", text, flags=re.MULTILINE)
    text = text.strip()
    if text.startswith('"') and text.endswith('"'):
        text = text[1:-1]
    if text.startswith("'") and text.endswith("'"):
        text = text[1:-1]
    bracket_open = text.find("[")
    if bracket_open >= 0 and text.rfind("]") > bracket_open and (bracket_open < text.find("{") or text.find("{") < 0):
        brace_close = text.rfind("]")
        text = text[bracket_open : brace_close + 1]
    else:
        brace_open = text.find("{")
        brace_close = text.rfind("}")
        if brace_open >= 0 and brace_close > brace_open:
            text = text[brace_open : brace_close + 1]
    return text


_REPAIRERS = [
    ("original", lambda t: t),
    ("trailing commas", lambda t: re.sub(r",(\s*[}\]])", r"\1", t)),
    ("single quotes", lambda t: t.replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")),
    ("unquoted keys", lambda t: re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', t)),
    ("trailing commas + single quotes", lambda t: re.sub(r",(\s*[}\]])", r"\1", t).replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")),
    ("trailing commas + unquoted keys", lambda t: re.sub(r",(\s*[}\]])", r"\1", re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', t))),
    ("all fixes", lambda t: re.sub(r",(\s*[}\]])", r"\1", re.sub(r'([{,])\s*(\w+)\s*:', r'\1"\2":', t.replace("'", '"').replace("None", "null").replace("True", "true").replace("False", "false")))),
]


def _parse_response(raw: str) -> LLMClassification:
    cleaned = _extract_json(raw)
    for name, fix in _REPAIRERS:
        try:
            data = json.loads(fix(cleaned))
            if name != "original":
                logger.info("Repair strategy '%s' succeeded", name)
            break
        except json.JSONDecodeError:
            continue
    else:
        raise ValueError(f"Cannot parse response: {cleaned[:200]}")
    return LLMClassification(
        label=data.get("label", "ignore"),
        amount=float(data["amount"]) if data.get("amount") is not None else None,
        merchant=data.get("merchant"),
        category=data.get("category"),
        txn_date=data.get("txn_date"),
        confidence=float(data.get("confidence", 0.5)),
        email_type=data.get("email_type"),
    )


def _parse_batch_response(raw: str, expected_count: int) -> List[LLMClassification]:
    """Parse a JSON array response into individual LLMClassification objects."""
    cleaned = _extract_json(raw)
    for _, fix in _REPAIRERS:
        try:
            data = json.loads(fix(cleaned))
            break
        except json.JSONDecodeError:
            continue
    else:
        raise ValueError(f"Cannot parse batch response: {cleaned[:200]}")

    if not isinstance(data, list):
        data = [data]

    results: List[LLMClassification] = []
    for item in data:
        if not isinstance(item, dict):
            results.append(LLMClassification(
                label="ignore", amount=None, merchant=None,
                category=None, txn_date=None, confidence=0.0,
            ))
            continue
        results.append(LLMClassification(
            label=str(item.get("label", "ignore")),
            amount=float(item["amount"]) if item.get("amount") is not None else None,
            merchant=item.get("merchant"),
            category=item.get("category"),
            txn_date=item.get("txn_date"),
            confidence=float(item.get("confidence", 0.5)),
            email_type=item.get("email_type"),
        ))

    if len(results) != expected_count:
        logger.warning("LLM returned %d results for batch of %d; padding/truncating", len(results), expected_count)
    while len(results) < expected_count:
        results.append(LLMClassification(
            label="ignore", amount=None, merchant=None,
            category=None, txn_date=None, confidence=0.0,
            email_type=None,
        ))
    return results[:expected_count]


# ── Multi-provider client ─────────────────────────────────────────────────────

class MultiLLMClient:
    _user_clients: Dict[str, "MultiLLMClient"] = {}

    def __init__(self, user_id: Optional[str] = None):
        self._providers: List[_Provider] = []
        self._user_id = user_id
        self._build_providers()

    def _build_providers(self) -> None:
        """
        Register providers in default priority order (lowest score = tried first).
        Default order: Google - Grok - Scaleway - OpenRouter.
        OpenRouter starts last because it has the tightest free-tier rate limits.
        At runtime _ranked_providers() re-sorts by priority_score so any provider
        that accumulates rate-limit hits falls further down automatically.
        """
        if settings.GOOGLE_AI_API_KEY:
            self._providers.append(_Provider(
                name="google",
                base_url="https://generativelanguage.googleapis.com/v1beta/openai",
                api_key=settings.GOOGLE_AI_API_KEY,
                model="gemini-2.0-flash-exp",
            ))
        if settings.GROK_API_KEY:
            self._providers.append(_Provider(
                name="grok",
                base_url="https://api.x.ai/v1",
                api_key=settings.GROK_API_KEY,
                model="grok-3-mini",
            ))
        if settings.GROQ_API_KEY:
            self._providers.append(_Provider(
                name="groq",
                base_url="https://api.groq.com/openai/v1",
                api_key=settings.GROQ_API_KEY,
                model="llama-3.3-70b-versatile",
            ))
        if settings.SCALEWAY_API_KEY:
            self._providers.append(_Provider(
                name="scaleway",
                base_url="https://api.scaleway.ai/v1",
                api_key=settings.SCALEWAY_API_KEY,
                model="llama-3.3-70b-instruct",
            ))
        if settings.OPENROUTER_API_KEY:
            self._providers.append(_Provider(
                name="openrouter",
                base_url="https://openrouter.ai/api/v1",
                api_key=settings.OPENROUTER_API_KEY,
                model=settings.LLM_MODEL,
                extra_headers={
                    "HTTP-Referer": "http://localhost:8000",
                    "X-Title": "Expense Tracker",
                },
            ))
        if settings.CLOUDFLARE_API_TOKEN and settings.CLOUDFLARE_ACCOUNT_ID:
            account_id_str = str(settings.CLOUDFLARE_ACCOUNT_ID)
            api_token_str = str(settings.CLOUDFLARE_API_TOKEN)
            self._providers.append(_Provider(
                name="cloudflare",
                base_url=f"https://api.cloudflare.com/client/v4/accounts/{account_id_str}/ai/v1/run",
                api_key=api_token_str,
                model="@cf/meta/llama-3.1-8b-instruct",
            ))

    def _ranked_providers(self) -> List[_Provider]:
        """
        Available providers sorted by priority_score ascending (best first).
        priority_score = (rate_limit_count * 0.25) + error_rate
        - each rate-limit hit persistently demotes the provider by 0.25 points.
        """
        return sorted(
            [p for p in self._providers if p.available],
            key=lambda p: p.priority_score,
        )

    def get_status(self) -> List[dict]:
        now = time.time()
        ranked_names = [p.name for p in self._ranked_providers()]
        all_providers = sorted(
            self._providers,
            key=lambda p: ranked_names.index(p.name) if p.name in ranked_names else 999,
        )
        return [
            self._provider_status_dict(p, now)
            for p in all_providers
        ]

    @staticmethod
    def _provider_status_dict(p: _Provider, now: float) -> dict:
        return {
            "name": p.name,
            "available": p.available,
            "rate_limited_secs": max(0, round(p.rate_limited_until - now)) if p.rate_limited_until > now else 0,
            "rate_limit_count": p.rate_limit_count,
            "priority_score": round(p.priority_score, 3),
            "success": p.success_count,
            "fail": p.fail_count,
            "error_rate": round(p.error_rate, 3),
        }

    async def get_user_client(self, user_id: str) -> Optional["MultiLLMClient"]:
        """Return user-specific LLM client from their DB config, or None if not configured.
        Clients are cached per user_id so provider stats (rate-limit, success/fail) persist."""
        if not user_id:
            return None
        cached = self._user_clients.get(user_id)
        if cached is not None:
            return cached

        from sqlalchemy import select
        from app.models import UserAIService
        from app.api._account_helpers import _decrypt_secret

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(UserAIService).where(UserAIService.user_id == user_id).order_by(UserAIService.created_at)
            )
            services = result.scalars().all()
        config = next((s for s in services if s.enabled), services[0] if services else None)
        if not config:
            self._user_clients[user_id] = None
            return None


        decrypted_key = _decrypt_secret(config.encrypted_api_key) if config.encrypted_api_key else None
        client = build_user_client(
            user_id=user_id,
            provider=config.provider,
            base_url=config.base_url,
            api_key=decrypted_key,
            model_id=config.model_id,
        )
        self._user_clients[user_id] = client
        return client

    _DEFAULT_CATEGORIES = (
        "Food & Dining, Groceries, Rent, Transport, Travel, Shopping, "
        "Entertainment, Healthcare, Education, Subscriptions, Utilities, "
        "CC Payment, Transfers, Income, Other"
    )

    async def classify(
        self, sender: str, subject: str, body_snippet: str,
        categories: Optional[str] = None,
        pre_extraction: Optional[dict] = None,
    ) -> LLMClassification:
        ranked = self._ranked_providers()
        if not ranked:
            from app.alerts import add_alert
            add_alert(
                "error",
                "All LLM providers unavailable (rate limited or unconfigured). "
                "Classification falling back to rules only.",
                source="llm",
            )
            raise RuntimeError("No LLM providers available")

        prompt = _USER_TEMPLATE.format(
            sender=sender, subject=subject, body_snippet=body_snippet,
            categories=categories or self._DEFAULT_CATEGORIES,
        )
        if pre_extraction:
            prompt = _build_pre_extraction_block(pre_extraction) + prompt
        last_error: Optional[Exception] = None
        for provider in ranked:
            try:
                result = await self._call_provider_raw(provider, prompt)
                provider.success_count += 1
                return result
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    retry_after = int(exc.response.headers.get("Retry-After", "60"))
                    provider.mark_rate_limited(retry_after)
                    last_error = exc
                    continue
                provider.fail_count += 1
                logger.error(
                    "Provider '%s' HTTP %d: %s",
                    provider.name, exc.response.status_code, exc.response.text[:200],
                )
                last_error = exc
                continue
            except Exception as exc:
                provider.fail_count += 1
                logger.error("Provider '%s' error: %s", provider.name, exc)
                last_error = exc
                continue

        raise last_error or RuntimeError("All LLM providers failed")

    async def _call_provider_raw(
        self, provider: _Provider, user_prompt: str
    ) -> LLMClassification:
        result, _ = await self._call_provider_verbose(provider, user_prompt)
        return result

    async def _provider_http_call(
        self, provider: _Provider, user_prompt: str,
        timeout: float = 30.0, max_tokens: int = 500,
        system_override: Optional[str] = None,
    ) -> str:
        """Execute HTTP call to a provider and return raw response text."""
        system = system_override or _SYSTEM
        if provider.name == "groq":
            try:
                from app.classifier.groq_rate_limiter import get_groq_limiter

                limiter = get_groq_limiter(user_id=self._user_id, api_key=provider.api_key)
                if limiter is not None and not await limiter.acquire(provider.model, estimated_tokens=150, timeout=30.0):
                    provider.mark_rate_limited(retry_after=60)
                    provider.fail_count += 1
                    raise httpx.HTTPStatusError(
                        "Groq rate limit exceeded",
                        request=httpx.Request("POST", provider.base_url or "https://api.groq.com/openai/v1/chat/completions"),
                        response=httpx.Response(429),
                    )
            except httpx.HTTPStatusError:
                raise
            except Exception as e:
                logger.warning("Groq rate limiter error: %s", e)

        api_key_val = provider.api_key
        if hasattr(api_key_val, 'decode'):
            api_key_val = api_key_val.decode('utf-8')
        api_key_str = str(api_key_val) if api_key_val else ""
        api_key_str = api_key_str.encode('ascii', 'ignore').decode('ascii')

        logger.debug("LLM request: provider=%s model=%s base_url=%s", provider.name, provider.model, provider.base_url)

        headers: dict = {
            "Authorization": "Bearer " + api_key_str,
            "Content-Type": "application/json",
        }
        if provider.extra_headers:
            for k, v in provider.extra_headers.items():
                if v is not None:
                    headers[str(k)] = str(v)

        base_url = str(provider.base_url)

        if provider.name == "cloudflare":
            url = f"{base_url}/{provider.model}"
            payload = {
                "messages": [
                    {"role": "system", "content": str(system)},
                    {"role": "user", "content": str(user_prompt)},
                ],
                "temperature": 0.1,
                "max_tokens": max_tokens,
            }
        else:
            url = f"{base_url}/chat/completions"
            payload = {
                "model": str(provider.model),
                "messages": [
                    {"role": "system", "content": str(system)},
                    {"role": "user", "content": str(user_prompt)},
                ],
                "temperature": 0.1,
                "max_tokens": max_tokens,
            }

        async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
            response = await client.post(url, json=payload)
            response.raise_for_status()

        if provider.name == "cloudflare":
            raw = response.json()
            result = raw.get("result", {})
            text = result.get("response", "") if isinstance(result, dict) else str(result)
            return str(text).strip()
        return response.json()["choices"][0]["message"]["content"].strip()

    async def _call_provider_verbose(
        self, provider: _Provider, user_prompt: str
    ) -> tuple:
        """Returns (LLMClassification, raw_response_str)."""
        raw = await self._provider_http_call(provider, user_prompt)
        logger.debug("Raw LLM response: %s", raw[:500])
        return _parse_response(raw), raw

    async def classify_verbose(
        self, sender: str, subject: str, body_snippet: str,
        categories: Optional[str] = None,
        pre_extraction: Optional[dict] = None,
    ) -> dict:
        """Like classify() but also returns prompt, raw response, and provider name."""
        ranked = self._ranked_providers()
        logger.debug("classify_verbose: %d providers available: %s", len(ranked), [p.name for p in ranked])
        if not ranked:
            raise RuntimeError("No LLM providers available")

        prompt = _USER_TEMPLATE.format(
            sender=sender, subject=subject, body_snippet=body_snippet,
            categories=categories or self._DEFAULT_CATEGORIES,
        )
        if pre_extraction:
            prompt = _build_pre_extraction_block(pre_extraction) + prompt
        last_error: Optional[Exception] = None
        logger.debug("classify_verbose: trying %d providers: %s", len(ranked), [p.name for p in ranked])
        for provider in ranked:
            logger.debug("  Trying provider: %s", provider.name)
            try:
                result, raw = await self._call_provider_verbose(provider, prompt)
                provider.success_count += 1
                return {"result": result, "provider": provider.name, "model": provider.model,
                        "prompt": prompt, "raw_response": raw}
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    provider.mark_rate_limited(int(exc.response.headers.get("Retry-After", "60")))
                    last_error = exc
                    continue
                provider.fail_count += 1
                last_error = exc
                continue
            except Exception as exc:
                logger.warning("Provider %s failed: %s", provider.name, str(exc)[:200])
                provider.fail_count += 1
                last_error = exc
                continue
        raise last_error or RuntimeError("All LLM providers failed")

    _MAX_BATCH_TOKENS = 2500

    async def batch_classify_verbose(
        self,
        email_list: List[Tuple[str, str, str, Optional[dict]]],
        categories: Optional[str] = None,
    ) -> dict:
        """Classify multiple emails in one LLM call.

        Args:
            email_list: (sender, subject, body_snippet, pre_extraction) tuples
            categories: Comma-separated category names

        Returns:
            dict with "results" (list of LLMClassification), "provider", "model",
            "raw_response", "prompt"
        """
        ranked = self._ranked_providers()
        logger.debug("batch_classify_verbose: %d providers available: %s", len(ranked), [p.name for p in ranked])
        if not ranked:
            raise RuntimeError("No LLM providers available")

        email_blocks: List[str] = []
        for i, (sender, subject, body, pre) in enumerate(email_list, 1):
            body = (body or "")[:600]
            block = f"Email {i}:\nFrom: {sender}\nSubject: {subject}\nBody: {body}"
            if pre:
                pre_text = _build_pre_extraction_block(pre)
                if pre_text:
                    block += "\n" + pre_text
            email_blocks.append(block)

        email_text = "\n---\n".join(email_blocks)

        prompt = _BATCH_USER_TEMPLATE.format(
            count=len(email_list),
            email_blocks=email_text,
            categories=categories or self._DEFAULT_CATEGORIES,
        )

        last_error: Optional[Exception] = None
        for provider in ranked:
            logger.debug("  Trying batch provider: %s", provider.name)
            try:
                raw = await self._provider_http_call(
                    provider, prompt,
                    timeout=60.0,
                    max_tokens=min(max(500, 500 * len(email_list)), self._MAX_BATCH_TOKENS),
                )
                provider.success_count += 1
                results = _parse_batch_response(raw, len(email_list))
                return {
                    "results": results,
                    "provider": provider.name,
                    "model": provider.model,
                    "raw_response": raw,
                    "prompt": prompt,
                }
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    provider.mark_rate_limited(int(exc.response.headers.get("Retry-After", "60")))
                    last_error = exc
                    continue
                provider.fail_count += 1
                last_error = exc
                continue
            except Exception as exc:
                logger.warning("Provider %s batch failed: %s", provider.name, str(exc)[:200])
                provider.fail_count += 1
                last_error = exc
                continue
        raise last_error or RuntimeError("All LLM providers failed")

    async def batch_classify(
        self,
        email_list: List[Tuple[str, str, str, Optional[dict]]],
        categories: Optional[str] = None,
    ) -> List[Optional[LLMClassification]]:
        result = await self.batch_classify_verbose(email_list, categories=categories)
        return result["results"]

    async def chat(
        self, system_prompt: str, user_prompt: str,
        max_tokens: int = 1000, timeout: float = 45.0,
    ) -> str:
        """Send a generic chat prompt to the best available provider. Returns raw text response."""
        ranked = self._ranked_providers()
        if not ranked:
            raise RuntimeError("No LLM providers available")
        last_error: Optional[Exception] = None
        for provider in ranked:
            try:
                raw = await self._provider_http_call(provider, user_prompt, timeout=timeout, max_tokens=max_tokens, system_override=system_prompt)
                provider.success_count += 1
                return raw
            except httpx.HTTPStatusError as exc:
                if exc.response.status_code == 429:
                    provider.mark_rate_limited(int(exc.response.headers.get("Retry-After", "60")))
                    last_error = exc
                    continue
                provider.fail_count += 1
                last_error = exc
                continue
            except Exception as exc:
                provider.fail_count += 1
                logger.error("Provider '%s' chat error: %s", provider.name, exc)
                last_error = exc
                continue
        raise last_error or RuntimeError("All LLM providers failed")


llm_client = MultiLLMClient()
LLMClient = MultiLLMClient


_KNOWN_BASE_URLS: dict[str, str] = {
    "google": "https://generativelanguage.googleapis.com/v1beta/openai",
    "grok": "https://api.x.ai/v1",
    "groq": "https://api.groq.com/openai/v1",
    "scaleway": "https://api.scaleway.ai/v1",
    "openrouter": "https://openrouter.ai/api/v1",
    "cloudflare": "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/run",
}


def build_user_client(user_id: str, provider: str, base_url: Optional[str], api_key: str, model_id: str) -> MultiLLMClient:
    """Return a MultiLLMClient with the user's DB-configured provider first, env-var providers as fallback."""
    if not api_key:
        logger.warning("No API key for provider %r - skipping user provider", provider)
        return llm_client
    
    provider_str = str(provider) if provider else ""
    resolved_url = str(base_url) if base_url else None
    if not resolved_url:
        resolved_url = _KNOWN_BASE_URLS.get(provider_str)
    # For Cloudflare, substitute account_id from env if user didn't provide custom URL
    if provider_str == "cloudflare" and not base_url and settings.CLOUDFLARE_ACCOUNT_ID:
        resolved_url = f"https://api.cloudflare.com/client/v4/accounts/{settings.CLOUDFLARE_ACCOUNT_ID}/ai/v1/run"
    if not resolved_url:
        logger.warning("No base_url for provider %r and not in known list - using env-var client only", provider_str)
        return llm_client

    client = MultiLLMClient(user_id=user_id)
    user_provider = _Provider(name=provider_str, base_url=str(resolved_url), api_key=str(api_key), model=str(model_id))
    # Add user's provider first, then fallbacks from global llm_client (exclude duplicate provider names)
    global_fallbacks = [p for p in llm_client._providers if p.name != provider_str]
    client._providers = [user_provider] + global_fallbacks
    return client
