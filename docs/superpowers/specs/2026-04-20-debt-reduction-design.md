# Debt Reduction — Design

## Goal

Manual debt tracking: users add debts (loans, credit cards, EMIs), log payments, and see payoff progress with a visual progress bar per debt.

## Architecture

New `Debt` SQLAlchemy model + Alembic migration. New `app/api/debt.py` CRUD router. New `static/src/debt.jsx` frontend. No Gmail/classifier integration — fully manual.

---

## Backend

### Model: `app/models.py`

```python
class Debt(Base):
    __tablename__ = "debts"

    id: Mapped[str] = _uuid_col()
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    total_amount: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    paid_amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0.0, nullable=False)
    interest_rate: Mapped[Optional[float]] = mapped_column(Float)       # annual %, optional
    target_date: Mapped[Optional[date]] = mapped_column(Date)           # payoff goal date, optional
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
```

### API: `app/api/debt.py`

Pydantic body:
```python
class DebtBody(BaseModel):
    name: str
    total_amount: float
    paid_amount: float = 0.0
    interest_rate: Optional[float] = None
    target_date: Optional[date] = None
    notes: Optional[str] = None
```

Routes:
- `GET /debts` → list all debts, sorted by `(total_amount - paid_amount) DESC`
- `POST /debts` → create, validates `total_amount > 0`, `paid_amount >= 0`, `paid_amount <= total_amount`
- `PATCH /debts/{id}` → full update (same body)
- `DELETE /debts/{id}` → delete

Serialized response per debt:
```json
{
  "id": "...",
  "name": "Car Loan",
  "total_amount": 500000.0,
  "paid_amount": 120000.0,
  "remaining": 380000.0,
  "pct_paid": 24.0,
  "interest_rate": 8.5,
  "target_date": "2028-06-01",
  "notes": null,
  "created_at": "..."
}
```

`remaining = total_amount - paid_amount`. `pct_paid = paid_amount / total_amount * 100` rounded to 1 decimal.

Register router in `app/main.py` with prefix `/api`.

---

## Frontend: `static/src/debt.jsx`

**DebtView** component:

- Topbar: "Debt Reduction", subtitle showing total remaining across all debts (mono)
- "Add Debt" button → opens add/edit modal
- **Card grid** (2 columns on desktop, 1 on narrow):
  Each card:
  - Name (serif, bold)
  - `₹{remaining} remaining` (large mono, `--neg`)
  - `₹{paid} of ₹{total}` (small, `--ink-3`)
  - Progress bar: fill = `pct_paid`, color transitions from `--neg` (0%) to `--pos` (100%)
  - `{pct_paid}% paid` caption
  - Interest rate badge (if set): e.g. "8.5% p.a."
  - Target date (if set): "Goal: Jun 2028", red if past due
  - Edit / Delete icon buttons (top-right of card)

**Add/Edit modal**:
- Name (text, required)
- Total Amount (number, required)
- Paid So Far (number, default 0)
- Interest Rate % (number, optional)
- Target Payoff Date (date, optional)
- Notes (textarea, optional)

**Summary row** above cards: Total Debt · Total Paid · Remaining (all mono, horizontal bar showing overall progress)

**Empty state**: "No debts tracked. Add a loan, credit card, or EMI to start tracking payoff progress."

---

## Sidebar nav

Add "Debt" nav item under Tools section in `shell.jsx` (alongside Admin). Icon: `"trending-down"` (new icon in `icons.jsx`).

---

## Data flow

```
DebtView mounts → GET /api/debts → local state
Add/Edit modal → POST or PATCH /api/debts → refetch list
Delete → DELETE /api/debts/{id} with confirm dialog → refetch list
```

---

## Error handling

- Validation errors (paid > total, negative amounts) shown inline in modal
- API errors: inline error text in modal
- Delete confirm: "Delete [name]? This cannot be undone."

---

## Testing

- `tests/test_debt.py`:
  - POST creates debt, `remaining` and `pct_paid` computed correctly
  - PATCH updates paid_amount, recomputes remaining
  - Validation: `paid_amount > total_amount` → 422
  - DELETE removes debt
  - GET returns sorted by remaining DESC

---

## Alembic migration

New file `alembic/versions/XXXX_add_debts_table.py` creating `debts` table with all columns above.

---

## Files to modify/create

| File | Change |
|---|---|
| `app/models.py` | Add `Debt` model |
| `app/api/debt.py` | New file — CRUD router |
| `app/main.py` | Register debt router |
| `alembic/versions/XXXX_add_debts.py` | New migration |
| `static/src/debt.jsx` | New file — DebtView |
| `static/src/icons.jsx` | Add `trending-down` icon |
| `static/src/shell.jsx` | Add Debt nav item |
| `static/src/app.jsx` | Add DebtView route |
| `templates/index.html` | Add debt.jsx script tag |
