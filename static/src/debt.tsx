// @ts-nocheck
const { useState, useEffect } = React;

const defaultDebtForm = () => ({ name: "", total_amount: "", paid_amount: "0", interest_rate: "", target_date: "", notes: "" });

const DebtModal = ({ item, onSave, onDelete, onClose }) => {
  const { isMobile } = useViewport();
  const [form, setForm] = useState(item ? {
    name: item.name,
    total_amount: String(item.total_amount),
    paid_amount: String(item.paid_amount),
    interest_rate: item.interest_rate != null ? String(item.interest_rate) : "",
    target_date: item.target_date || "",
    notes: item.notes || "",
  } : defaultDebtForm());
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    const total = parseFloat(form.total_amount);
    const paid = parseFloat(form.paid_amount || "0");
    if (!total || total <= 0) { setErr("Total amount must be positive"); return; }
    if (paid < 0) { setErr("Paid amount cannot be negative"); return; }
    if (paid > total) { setErr("Paid amount cannot exceed total amount"); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        name: form.name.trim(),
        total_amount: total,
        paid_amount: paid,
        interest_rate: form.interest_rate ? parseFloat(form.interest_rate) : null,
        target_date: form.target_date || null,
        notes: form.notes || null,
      };
      const result = item
        ? await API.patch(`/api/debts/${item.id}`, body)
        : await API.post("/api/debts", body);
      onSave(result, !!item);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const del = async () => {
    setSaving(true);
    try {
      await API.delete(`/api/debts/${item.id}`);
      onDelete(item.id);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const formContent = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Name *" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Car Loan, Credit Card" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Total Amount (\u20B9) *" type="number" min="0" value={form.total_amount} onChange={e => set("total_amount", e.target.value)} placeholder="500000" />
          <Input label="Paid So Far (\u20B9)" type="number" min="0" value={form.paid_amount} onChange={e => set("paid_amount", e.target.value)} placeholder="0" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Interest Rate % (p.a.)" type="number" min="0" step="0.1" value={form.interest_rate} onChange={e => set("interest_rate", e.target.value)} placeholder="8.5" />
          <Input label="Target Payoff Date" type="date" value={form.target_date} onChange={e => set("target_date", e.target.value)} />
        </div>
        <Input label="Notes" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes" />
        {err && <div style={{ fontSize: "0.75rem", color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
      </div>
      <div style={{ padding: "14px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
        {item && !confirming && (
          <Button onClick={() => setConfirming(true)} variant="danger" style={{ background: "none", border: "1px solid var(--neg)" }}>Delete</Button>
        )}
        {item && confirming && (
          <Button onClick={() => { window.hapticHeavy?.(); del(); }} style={{ background: "var(--neg)", color: "var(--paper)", border: "none" }}>Confirm Delete</Button>
        )}
        <Button onClick={onClose} style={{ marginLeft: "auto" }}>Cancel</Button>
        <Button onClick={() => { window.hapticLight?.(); save(); }} disabled={saving} variant="primary">{saving ? "Saving\u2026" : "Save"}</Button>
      </div>
    </>
  );

  return isMobile ? (
    <BottomSheet open title={item ? "Edit Debt" : "Add Debt"} onClose={onClose}>
      {formContent}
    </BottomSheet>
  ) : (
    <Modal open title={item ? "Edit Debt" : "Add Debt"} onClose={onClose}>
      {formContent}
    </Modal>
  );
};

const DebtView = React.memo(() => {
  const { isMobile, isTablet } = useViewport();
  const [debts, setDebts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);

  const load = () => {
    setLoading(true);
    API.get("/api/debts")
      .then(d => { setDebts(d.items); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };
  useEffect(load, []);

  const onSave = (result, isEdit) => {
    if (isEdit) setDebts(ds => ds.map(d => d.id === result.id ? result : d));
    else setDebts(ds => [...ds, result]);
    setModal(null);
  };
  const onDelete = (id) => { setDebts(ds => ds.filter(d => d.id !== id)); setModal(null); };

  const totalDebt = debts.reduce((a, d) => a + d.total_amount, 0);
  const totalPaid = debts.reduce((a, d) => a + d.paid_amount, 0);
  const totalRemaining = debts.reduce((a, d) => a + d.remaining, 0);
  const overallPct = totalDebt > 0 ? Math.round(totalPaid / totalDebt * 100) : 0;

  const fmt = (v) => `\u20B9${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink-2)" };
  const today = new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <span role="status" className="spinner-lg" />
    </div>
  );

  if (error) return <div role="alert" style={{ padding: 28, color: "var(--neg)", fontSize: "0.8125rem" }}>{error}</div>;

  return (
    <div className="fade-in">
      {modal && (
        <DebtModal
          item={modal === "new" ? null : modal}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setModal(null)}
        />
      )}

      <div style={{ ...secBand, ...(isMobile ? { padding: "10px 14px" } : {}) }}>
        <span style={secTitle}>Debt Reduction</span>
        <Button onClick={() => setModal("new")} variant="primary" size="sm" icon={<Icon name="plus" size={12} stroke="var(--paper)"/>} style={{ marginLeft: "auto" }}>Add Debt</Button>
      </div>

      {debts.length > 0 && (
        <div style={{ padding: "16px 28px 0", ...(isMobile ? { padding: "16px 14px 0" } : {}), display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          {[["Total Debt", fmt(totalDebt), "var(--ink-2)"], ["Total Paid", fmt(totalPaid), "var(--pos)"], ["Remaining", fmt(totalRemaining), "var(--neg)"]].map(([label, val, color]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>{label}</span>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1rem", fontWeight: 600, color }}>{val}</span>
            </div>
          ))}
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.6875rem", color: "var(--ink-4)", marginBottom: 4 }}>
              <span>Overall progress</span><span>{overallPct}% paid</span>
            </div>
            <ProgressBar value={overallPct} size="sm" color={overallPct >= 100 ? "pos" : overallPct >= 50 ? "amber" : "neg"} />
          </div>
        </div>
      )}

      <div style={{ padding: "20px 28px", ...(isMobile ? { padding: "20px 14px", gridTemplateColumns: "1fr" } : {}), display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {!debts.length ? (
          <div style={{ gridColumn: "1/-1", padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: "0.8125rem" }}>
            No debts tracked. <Button onClick={() => setModal("new")} variant="ghost" size="sm" style={{ textDecoration: "underline", display: "inline" }}>Add a loan, credit card, or EMI</Button> to start tracking payoff progress.
          </div>
        ) : debts.map(debt => {
          const isPastDue = debt.target_date && debt.target_date < today;
          return (
            <div key={debt.id} role="button" tabIndex={0} aria-selected={modal === debt} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} onClick={() => { window.hapticLight?.(); setModal(debt); }} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, ...(isMobile ? { padding: "12px 14px" } : {}), display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4 }}>
                <Button onClick={e => { e.stopPropagation(); setModal(debt); }} variant="ghost" size="sm" style={{ padding: 4, color: "var(--ink-4)" }}>
                  <Icon name="edit" size={14} />
                </Button>
              </div>
              <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: "1rem", color: "var(--ink)", paddingRight: 40 }}>{debt.name}</span>
              <div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.375rem", fontWeight: 700, color: "var(--neg)" }}>{fmt(debt.remaining)}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: 2 }}>{fmt(debt.paid_amount)} of {fmt(debt.total_amount)}</div>
              </div>
              <ProgressBar value={debt.pct_paid} size="sm" color={debt.pct_paid >= 100 ? "pos" : debt.pct_paid >= 50 ? "amber" : "neg"} />
              <div style={{ fontSize: "0.75rem", color: debt.pct_paid >= 100 ? "var(--pos)" : "var(--ink-4)", fontWeight: debt.pct_paid >= 100 ? 600 : 400 }}>{debt.pct_paid >= 100 ? "Paid off!" : `${debt.pct_paid}% paid`}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {debt.interest_rate != null && (
                  <span style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 99, background: "var(--cat-sub)", color: "var(--cat-sub-ink)", fontWeight: 500 }}>
                    {debt.interest_rate}% p.a.
                  </span>
                )}
                {debt.target_date && (
                  <span style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 99, background: isPastDue ? "var(--neg-soft)" : "var(--paper-2)", color: isPastDue ? "var(--neg)" : "var(--ink-3)", fontWeight: 500 }}>
                    Goal: {new Date(debt.target_date + "T00:00:00").toLocaleString("en-IN", { month: "short", year: "numeric" })}
                    {isPastDue ? " \u00B7 Past due" : ""}
                  </span>
                )}
              </div>
              {debt.notes && <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{debt.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
});

(window as any).DebtView = DebtView;
