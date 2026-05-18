"""Prompt building functions, system prompts, and user prompts."""
from typing import Optional

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM = (
    "You are a high-precision financial email classifier for Indian banking, UPI, and payment emails. "
    "Determine whether an email represents a real financial transaction, classify the "
    "direction of money flow, and extract normalized transaction metadata. "
    "Ignore marketing, OTPs, reminders, and informational emails. "
    "Prioritize PRECISION over recall. If uncertain, return null values and lower "
    "confidence instead of guessing. "
    "Respond ONLY with valid JSON. No explanation, no markdown, no code blocks."
)

# ── Pre-extraction block ──────────────────────────────────────────────────────

_PRE_EXTRACTION_BLOCK = """
═══════════════════════════════════════════════════════════════
PRE-EXTRACTED FACTS (regex-based — these are GROUND TRUTH from the email body)
═══════════════════════════════════════════════════════════════
IMPORTANT: You MUST use these values exactly as shown. Do NOT override them unless the email body clearly shows a DIFFERENT transaction (not the same one).
{lines}
═══════════════════════════════════════════════════════════════
"""


def build_pre_extraction_block(pre: dict) -> str:
    lines = []
    if pre.get("amount") is not None:
        currency_label = pre.get("source_currency") or "INR"
        lines.append(f"- Amount: {pre['amount']} {currency_label}")
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

# ── Single-email user prompt ─────────────────────────────────────────────────

_USER_TEMPLATE = """# CLASSIFICATION RULES

## EXPENSE — money going OUT:
Triggers: debited, charged, paid, purchase, spent, payment, withdrawal, fee, subscribed (mutual fund), purchased (shares/units)
Bank debits, UPI payments, card transactions, bill payments, EMIs, subscriptions, ATM withdrawals, wallet deductions, insurance premiums, mutual fund/stock purchases, demat transactions, e-commerce orders with confirmed payment
→ label: "expense"

## INCOME — money coming IN:
Triggers: credited, deposited, salary, refund, cashback, reversal, interest
You received, received from, credited to your account
Salary credits, refunds, cashback, UPI/IMPS receipts, interest/dividend credits, reward points redeemed
→ label: "income"

REFUND / REVERSAL → always "income" (money returning to you)

## IGNORE — no real transaction occurred (no money moved in this email):
- OTP / 2FA codes — "OTP for transaction", "login OTP", "verification code"
- Security alerts — "new device login", "password changed", "unusual activity"
- Balance/limit alerts — "low balance", "minimum amount due", "credit limit"
- Statement ready — "monthly statement", "account summary", "transaction report"
- Offers / promos — "special offer", "festive sale", "discount", "cashback offer"
- Delivery/shipment notifications ("order shipped", "out for delivery", "item delivered", "package delivered") — these are pure status updates with no payment info → IGNORE.
  NOTE: App-level savings/discount numbers ("₹145 saved", "₹69 saved") are promotional, NOT transaction amounts. Ignore them.
  IMPORTANT: Delivery notifications that list ordered items with prices (e.g. "1 x Butter ₹122") are still DELIVERY notifications — no money moved in this email. These are IGNORE, not expenses.
  IMPORTANT: Order confirmation / receipt emails ("Thanks for your order", "Order confirmation", "Your order of") that state a total amount paid ARE expenses, even if they include delivery tracking statuses in a secondary progress bar or timeline. The presence of a total amount + order confirmation takes priority over delivery keywords in a tracking UI.
  Distinction: order confirmation with total amount paid → expense. Pure delivery status update with no payment info → ignore.
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
0. DELIVERY OVERRIDE: If the email's primary purpose is delivery/shipment status AND it does NOT contain a confirmed total amount paid → IGNORE. Delivery notifications with itemized order lines are still IGNORE — no money moved in this email.
   EXCEPTION: Order confirmation/receipt emails that state a total amount paid ARE expenses, even if they include delivery tracking statuses in a secondary timeline/progress bar.
1. OTP/security verification → IGNORE immediately
2. Credit card bill payment received by bank → IGNORE, category=CC Payment (NOT income!)
3. Order/receipt emails are EXPENSE ONLY if they confirm PAYMENT with a stated total amount (e.g. "paid", "debited", "charged", "payment of", "receipt"). NEVER classify a pure delivery/shipment status email as expense.
4. Explicit money movement confirmed → classify transaction
5. Reminder or informational only → IGNORE
6. Both promotional and transactional text → classify based ONLY on the transactional section
7. Never extract merchants from footer/marketing text
8. AMOUNT: Extract ONLY a single total paid amount. Itemized line prices ("1 x Item ₹94") are NOT transaction amounts. Return null if no paid total is found.
9. Prefer explicit transaction amounts over promotional/savings amounts

# INPUT
From: {sender}
Subject: {subject}
Body: {body_snippet}

Available categories: {categories}

# AMOUNT EXTRACTION
CRITICAL: If PRE-EXTRACTED FACTS above shows an Amount, you MUST use that exact value. Do NOT invent, estimate, or substitute a different number. The pre-extracted amount is ground truth from regex parsing of the email.
Extract amount as a pure number (no symbols, no commas) in whatever currency is shown in the email.
"Rs.499.00" → amount=499, source_currency="INR"
"INR 1,200.50" → amount=1200.5, source_currency="INR"
"₹1,299" → amount=1299, source_currency="INR"
"USD5.90" → amount=5.90, source_currency="USD"
"$99.99" → amount=99.99, source_currency="USD"
"EUR 50.00" → amount=50.0, source_currency="EUR"
"5.90 USD" → amount=5.90, source_currency="USD"

source_currency must be a 3-letter ISO code (INR, USD, EUR, GBP, etc.). Default to "INR" for rupee transactions.
Do NOT convert currencies — just extract the raw amount and its source currency.
Our system applies the correct FX conversion automatically.

null if no amount found or email is non-transaction
DO NOT extract savings, cashback offers, discounts, credit limits, or statement totals unless payment executed.
DO NOT extract itemized line prices ("1 x Item ₹94", "1 × Butter ₹122") as the amount. Only extract a single total paid amount if stated explicitly.

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
AI services (Anthropic, OpenAI, ChatGPT, Claude) → Subscriptions
Software/SaaS subscriptions → Subscriptions
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
  IMPORTANT: These are TRANSFERS (money moving from cash to investment assets), NOT expenses.
  The money is not spent — it's converted to an asset.
  → label: "expense", category: "Investment"
  NOTE: The label is "expense" because money left your account, but this is tracked separately as type=investment for analytics.
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
  "debited ... by IMPS/P2A/612320181396/MEIYAPPA"                        → expense, merchant=MEIYAPPA (recipient name in IMPS reference)
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

E-COMMERCE / ORDER CONFIRMATION — contains product details + total and confirms PAYMENT:
  "Thanks for your order" / "Order confirmation" / "Your order of"        → expense
  "Order #..." + product name + quantity + total amount                    → expense
  IMPORTANT: Delivery notifications are NEVER expenses. If the email says "delivered", "shipped", or "out for delivery", it is a delivery/status notification — classify as IGNORE even if it lists items with prices. Payment happened in a separate email.

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
{{"label":"expense|income|ignore","amount":0.00,"merchant":"name or null","category":"category or null","txn_date":"YYYY-MM-DD or null","confidence":0.0,"email_type":"type or null","source_currency":"USD or null"}}"""

# ── Batch user prompt ─────────────────────────────────────────────────────────

_BATCH_USER_TEMPLATE = """You have {count} financial emails to classify. Process ALL of them.

{email_blocks}

# CLASSIFICATION RULES

## EXPENSE — money going OUT:
Triggers: debited, charged, paid, purchase, spent, payment, withdrawal, fee, subscribed (mutual fund), purchased (shares/units)
Bank debits, UPI payments, card transactions, bill payments, EMIs, subscriptions, ATM withdrawals, wallet deductions, insurance premiums, mutual fund/stock purchases
→ label: "expense"

## INCOME — money coming IN:
Triggers: credited, deposited, salary, refund, cashback, reversal, interest
You received, received from, credited to your account
Salary credits, refunds, cashback, UPI/IMPS receipts, interest/dividend credits, reward points redeemed
→ label: "income"

REFUND / REVERSAL → always "income" (money returning to you)

## IGNORE — no real transaction occurred (no money moved):
- OTP / 2FA codes
- Security alerts — new device login, password changed, unusual activity
- Balance/limit alerts — low balance, minimum amount due, credit limit
- Statement ready — monthly statement, account summary, transaction report
- Offers / promos — special offer, festive sale, discount, cashback offer
- Delivery/shipment notifications — pure status updates with no total paid amount. Delivery tracking statuses in a progress bar/timeline within an order confirmation are NOT delivery notifications.
- Newsletters — weekly digest, tips, recommendations
- KYC / compliance — update KYC, Aadhaar linking, PAN verification
- Password resets, welcome emails, terms updates, fee change notifications
- CREDIT CARD BILL PAYMENTS — "We have received payment on your Credit Card", "payment received towards credit card". Bank received your payment = money going OUT from you, NOT income. → ignore, category=CC Payment
→ label: "ignore"

DELIVERY OVERRIDE: If body contains delivery keywords ("delivered", "out for delivery", "shipped") AND the email does NOT contain a total amount paid → IGNORE. Exception: order confirmation emails with a stated total amount ARE expenses even if they include delivery tracking as a secondary timeline. Only emails confirming PAYMENT with a total (paid, debited, charged) are expenses.

AMOUNT: Extract ONLY a single total paid amount. Itemized line prices ("1 x Item ₹94", "1 × Butter ₹122") are NOT transaction amounts. Return null amount if no paid total is found.

INVESTMENT / SIP — money going OUT to buy financial assets:
  "Order Sent to AMC", "investment placed with the AMC", "SIP mandate"
  "Your SIP has been processed", "mutual fund units purchased"
  These are TRANSFERS (money moving from cash to investment assets), NOT expenses.
  The money is not spent — it's converted to an asset.
  → label: "expense", category: "Investment"
  NOTE: The label is "expense" because money left your account, but this is tracked separately as type=investment for analytics.
  merchant: the fund/stock name

INSURANCE — money going OUT for insurance premiums:
  "Payment Receipt for your ... Insurance Policy", "insurance premium paid",
  "policy payment received", "insurance renewal", "Amount Paid" with policy number
  → label: "expense", category: "Insurance"
  merchant: the insurance company name (e.g. "Axis Max Life Insurance")

========================================
EXTRACTION RULES:
========================================
- amount: INR in rupees (number only, no symbols or commas). "Rs.499" → 499, "INR 1200.50" → 1200.5. For foreign currencies, convert to INR and set source_currency.
- source_currency: 3-letter currency code if amount is in a foreign currency (e.g. "USD", "EUR", "GBP"). null if INR.
- 
- merchant: payee / store / service — NOT bank, NOT payment gateway.
  Clean codes: "WWW SWIGGY IN"/"SWIGGY*"/"BUNDL TECHNOLOGIES"/"BUNDL" → "Swiggy",
  "AMZN MKTP IN" → "Amazon", "ZOMATO*ORDER"/"ZOMATO"/"ZOMATO ONLINE" → "Zomato",
  "NETFLIX.COM" → "Netflix", "UBER TRIP" → "Uber", "BLINKIT IN" → "Blinkit"
  WARNING: Payment gateways (Razorpay, Billdesk, CC Avenue, PayU, CCAvenue, Paytm) are NOT merchants — null instead.
  For IMPS/NEFT/RTGS debit emails, the recipient name after the transaction ref ("IMPS/P2A/6123.../RECIPIENT") is the merchant.
  WARNING: Bank emails have marketing footers. NEVER use footer text as merchant.

- category: one of — {categories}. Use "Other" if none fits. Refunds → Refund. EMIs → EMI. CC bill payments → CC Payment.

- txn_date: actual transaction date from body (YYYY-MM-DD). null if absent.

- confidence: 0.95–1.00 clear bank/UPI alerts · 0.85–0.94 merchant receipts · 0.70–0.84 partial ambiguity · 0.50–0.69 weak evidence · 0.00 ignore

- email_type: classify the EMAIL itself: "bank_alert" | "upi_notification" | "merchant_receipt" | "bill_reminder" | "otp" | "offer" | "alert" | "newsletter" | "statement" | null

========================================
Respond ONLY with a JSON array — one object per email, in order:
[{{"label":"expense|income|ignore","amount":0.00,"merchant":"...","category":"...","txn_date":"...","confidence":0.0,"email_type":"...","source_currency":"USD or null"}},...]"""


_DEFAULT_CATEGORIES = (
    "Food & Dining, Groceries, Rent, Transport, Travel, Shopping, "
    "Entertainment, Healthcare, Education, Subscriptions, Utilities, "
    "CC Payment, Transfers, Income, Other"
)
