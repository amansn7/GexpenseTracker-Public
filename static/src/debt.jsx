// Debt tracking view

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
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleClose = () => { if (closing) return; setClosing(true); setTimeout(onClose, 150); };

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

  const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4, display: "block" };

  const formContent = (
    <>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500 }}>{item ? "Edit Debt" : "Add Debt"}</span>
          <button onClick={handleClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Name *</label>
            <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Car Loan, Credit Card" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Total Amount (₹) *</label>
              <input style={inp} type="number" min="0" value={form.total_amount} onChange={e => set("total_amount", e.target.value)} placeholder="500000" />
            </div>
            <div>
              <label style={lbl}>Paid So Far (₹)</label>
              <input style={inp} type="number" min="0" value={form.paid_amount} onChange={e => set("paid_amount", e.target.value)} placeholder="0" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Interest Rate % (p.a.)</label>
              <input style={inp} type="number" min="0" step="0.1" value={form.interest_rate} onChange={e => set("interest_rate", e.target.value)} placeholder="8.5" />
            </div>
            <div>
              <label style={lbl}>Target Payoff Date</label>
              <input style={inp} type="date" value={form.target_date} onChange={e => set("target_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes" />
          </div>
          {err && <div style={{ fontSize: 12, color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          {item && !confirming && (
            <button onClick={() => setConfirming(true)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--neg)", fontSize: 13, cursor: "pointer" }}>Delete</button>
          )}
          {item && confirming && (
            <button onClick={del} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--neg)", color: "var(--paper)", fontSize: 13, cursor: "pointer" }}>Confirm Delete</button>
          )}
          <button onClick={handleClose} style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "var(--ink)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
    </>
  );

  return isMobile ? (
    <div onClick={handleClose} style={bottomSheetStyles.overlay}>
      <div onClick={e => e.stopPropagation()} style={bottomSheetStyles.sheet}>
        <div style={bottomSheetStyles.handle} />
        <div style={bottomSheetStyles.content}>
          {formContent}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className={closing ? "backdrop-out" : "backdrop-in"}>
      <div className={closing ? "modal-out" : "modal-in"} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px -16px var(--shadow-lg)", maxHeight: "90vh", overflowY: "auto" }}>
        {formContent}
      </div>
    </div>
  );
};

const ProgressBar = ({ pct }) => {
  const done = pct >= 100;
  const color = done ? "var(--pos)" : pct >= 50 ? "var(--amber)" : "var(--neg)";
  return (
    <div style={{ width: "100%", height: 6, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
      <div style={{ width: "100%", height: "100%", borderRadius: 99, background: color, transition: "transform 400ms ease", transform: `scaleX(${Math.min(pct, 100) / 100})`, transformOrigin: "left", animation: done ? "pulse 1.5s ease-in-out infinite" : "none" }} />
    </div>
  );
};

const DebtView = () => {
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

  const fmt = (v) => `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--ink-2)" };
  const today = new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <span className="spinner-lg" />
    </div>
  );

  if (error) return <div style={{ padding: 28, color: "var(--neg)", fontSize: 13 }}>{error}</div>;

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
        <button onClick={() => setModal("new")} style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Icon name="plus" size={12} stroke="var(--paper)"/> Add Debt
        </button>
      </div>

      {debts.length > 0 && (
        <div style={{ padding: "16px 28px 0", ...(isMobile ? { padding: "16px 14px 0" } : {}), display: "flex", gap: 20, alignItems: "center", flexWrap: "wrap" }}>
          {[["Total Debt", fmt(totalDebt), "var(--ink-2)"], ["Total Paid", fmt(totalPaid), "var(--pos)"], ["Remaining", fmt(totalRemaining), "var(--neg)"]].map(([label, val, color]) => (
            <div key={label} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>{label}</span>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 16, fontWeight: 600, color }}>{val}</span>
            </div>
          ))}
          <div style={{ flex: 1, minWidth: 120 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-4)", marginBottom: 4 }}>
              <span>Overall progress</span><span>{overallPct}% paid</span>
            </div>
            <ProgressBar pct={overallPct} />
          </div>
        </div>
      )}

      <div style={{ padding: "20px 28px", ...(isMobile ? { padding: "20px 14px", gridTemplateColumns: "1fr" } : {}), display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {!debts.length ? (
          <div style={{ gridColumn: "1/-1", padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No debts tracked. <button onClick={() => setModal("new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>Add a loan, credit card, or EMI</button> to start tracking payoff progress.
          </div>
        ) : debts.map(debt => {
          const isPastDue = debt.target_date && debt.target_date < today;
          return (
            <div key={debt.id} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, ...(isMobile ? { padding: "12px 14px" } : {}), display: "flex", flexDirection: "column", gap: 10, position: "relative" }}>
              <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4 }}>
                <button onClick={() => setModal(debt)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-4)", padding: 4, borderRadius: 4 }}>
                  <Icon name="edit" size={14} />
                </button>
              </div>
              <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 16, color: "var(--ink)", paddingRight: 40 }}>{debt.name}</span>
              <div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 22, fontWeight: 700, color: "var(--neg)" }}>{fmt(debt.remaining)}</div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{fmt(debt.paid_amount)} of {fmt(debt.total_amount)}</div>
              </div>
              <ProgressBar pct={debt.pct_paid} />
              <div style={{ fontSize: 12, color: debt.pct_paid >= 100 ? "var(--pos)" : "var(--ink-4)", fontWeight: debt.pct_paid >= 100 ? 600 : 400 }}>{debt.pct_paid >= 100 ? "Paid off!" : `${debt.pct_paid}% paid`}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {debt.interest_rate != null && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "var(--cat-sub)", color: "var(--cat-sub-ink)", fontWeight: 500 }}>
                    {debt.interest_rate}% p.a.
                  </span>
                )}
                {debt.target_date && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: isPastDue ? "var(--neg-soft)" : "var(--paper-2)", color: isPastDue ? "var(--neg)" : "var(--ink-3)", fontWeight: 500 }}>
                    Goal: {new Date(debt.target_date + "T00:00:00").toLocaleString("en-IN", { month: "short", year: "numeric" })}
                    {isPastDue ? " · Past due" : ""}
                  </span>
                )}
              </div>
              {debt.notes && <div style={{ fontSize: 12, color: "var(--ink-3)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{debt.notes}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};

window.DebtView = DebtView;
