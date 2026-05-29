// Budgets tracking view

const { useState, useEffect } = React;

const fmtMoneyB = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const BudgetModal = ({ item, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState(item ? {
    category: item.category,
    monthly_limit: String(item.monthly_limit),
  } : { category: "", monthly_limit: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!item && !form.category.trim()) { setErr("Category is required"); return; }
    const limit = parseFloat(form.monthly_limit);
    if (!limit || limit <= 0) { setErr("Monthly limit must be positive"); return; }
    setSaving(true); setErr(null);
    try {
      const result = item
        ? await API.patch(`/api/budgets/${item.id}`, { monthly_limit: limit })
        : await API.post("/api/budgets", { category: form.category.trim(), monthly_limit: limit });
      onSave(result, !!item);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const del = async () => {
    setSaving(true);
    try {
      await API.delete(`/api/budgets/${item.id}`);
      onDelete(item.id);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className="backdrop-in">
      <div className="modal-in" style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 400, boxShadow: "0 24px 64px -16px var(--shadow-lg)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500 }}>{item ? "Edit Budget" : "Add Budget"}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Category {item ? "" : "*"}</label>
            {item ? (
              <div style={{ ...inp, color: "var(--ink-3)", cursor: "default" }}>{item.category}</div>
            ) : (
              <input style={inp} value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Food, Transport, Entertainment" />
            )}
          </div>
          <div>
            <label style={lbl}>Monthly Limit (₹) *</label>
            <input style={inp} type="number" min="0" value={form.monthly_limit} onChange={e => set("monthly_limit", e.target.value)} placeholder="5000" />
          </div>
          {err && <div style={{ fontSize: 12, color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          {item && !confirming && (
            <button onClick={() => setConfirming(true)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--neg)", background: "none", color: "var(--neg)", fontSize: 13, cursor: "pointer" }}>Delete</button>
          )}
          {item && confirming && (
            <>
              <button onClick={del} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--neg)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer" }}>Confirm Delete</button>
              <button onClick={() => setConfirming(false)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            </>
          )}
          <button onClick={onClose} style={{ marginLeft: confirming ? 0 : "auto", padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : item ? "Save" : "Add Budget"}</button>
        </div>
      </div>
    </div>
  );
};

const BudgetsView = () => {
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);

  const load = () => {
    setLoading(true);
    API.get("/api/budgets")
      .then(d => { setBudgets(d.budgets); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };
  useEffect(load, []);

  const onSave = (result, isEdit) => {
    setModal(null);
    load();
  };
  const onDelete = (id) => { setBudgets(bs => bs.filter(b => b.id !== id)); setModal(null); };

  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--ink-2)" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <span className="spinner-lg" />
    </div>
  );

  if (error) return <div style={{ padding: 28, color: "var(--neg)", fontSize: 13 }}>{error}</div>;

  const overBudget = budgets.filter(b => b.over_budget);
  const totalLimit = budgets.reduce((s, b) => s + b.monthly_limit, 0);
  const totalSpent = budgets.reduce((s, b) => s + b.spent_this_month, 0);

  return (
    <div className="fade-in">
      {modal && (
        <BudgetModal
          item={modal === "new" ? null : modal}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setModal(null)}
        />
      )}

      <div style={secBand}>
        <span style={secTitle}>Budgets</span>
        {budgets.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginLeft: 24 }}>
            {[
              ["Spent", fmtMoneyB(totalSpent), totalSpent > totalLimit ? "var(--neg)" : "var(--ink-2)"],
              ["Limit", fmtMoneyB(totalLimit), "var(--ink-2)"],
              overBudget.length > 0 ? ["Over Budget", overBudget.length + " categor" + (overBudget.length === 1 ? "y" : "ies"), "var(--neg)"] : null,
            ].filter(Boolean).map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>{label}</span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setModal("new")} style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Icon name="plus" size={12} stroke="var(--paper)"/> Add Budget
        </button>
      </div>

      <div style={{ padding: "20px 28px", display: "flex", flexDirection: "column", gap: 8 }}>
        {!budgets.length ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No budgets set. <button onClick={() => setModal("new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>Add one per category to track monthly spend.</button>
          </div>
        ) : budgets.map(budget => {
          const pct = Math.min(budget.pct || 0, 100);
          const over = budget.over_budget;
          return (
            <div
              key={budget.id}
              onClick={() => setModal(budget)}
              style={{
                background: over ? "var(--neg-soft, #fff0f0)" : "var(--card)",
                border: "1px solid " + (over ? "var(--neg)" : "var(--line)"),
                borderRadius: 8,
                padding: "14px 16px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 14, color: over ? "var(--neg)" : "var(--ink)" }}>
                  {budget.category}
                  {over && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "var(--neg)" }}>Over budget</span>}
                </span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, color: over ? "var(--neg)" : "var(--ink-2)" }}>
                  {fmtMoneyB(budget.spent_this_month)}
                  <span style={{ color: "var(--ink-4)", fontWeight: 400 }}> / {fmtMoneyB(budget.monthly_limit)}</span>
                </span>
              </div>
              <div style={{ background: "var(--line)", borderRadius: 4, height: 6 }}>
                <div style={{
                  background: over ? "var(--neg)" : "var(--pos)",
                  width: pct + "%",
                  height: "100%",
                  borderRadius: 4,
                  transition: "width 400ms ease",
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: over ? "var(--neg)" : "var(--ink-4)" }}>
                  {over
                    ? `${fmtMoneyB(budget.spent_this_month - budget.monthly_limit)} over limit`
                    : `${fmtMoneyB(budget.monthly_limit - budget.spent_this_month)} remaining`}
                </span>
                <span style={{ fontSize: 11, color: over ? "var(--neg)" : "var(--ink-4)", fontWeight: 500 }}>
                  {budget.pct || 0}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

window.BudgetsView = BudgetsView;
