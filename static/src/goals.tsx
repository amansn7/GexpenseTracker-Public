// @ts-nocheck
const { useState, useEffect } = React;

const defaultGoalForm = () => ({ name: "", target_amount: "", target_date: "", category: "", notes: "", active: true });

const GoalModal = ({ item, onSave, onDelete, onClose }) => {
  const { isMobile } = useViewport();
  const [form, setForm] = useState(item ? {
    name: item.name,
    target_amount: String(item.target_amount),
    target_date: item.target_date || "",
    category: item.category || "",
    notes: item.notes || "",
    active: item.active !== false,
  } : defaultGoalForm());
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [contribAmount, setContribAmount] = useState("");
  const [contribNote, setContribNote] = useState("");
  const [contribSaving, setContribSaving] = useState(false);
  const [contribErr, setContribErr] = useState(null);
  const [contribDone, setContribDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    const target = parseFloat(form.target_amount);
    if (!target || target <= 0) { setErr("Target amount must be positive"); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        name: form.name.trim(),
        target_amount: target,
        target_date: form.target_date || null,
        category: form.category || null,
        notes: form.notes || null,
        active: form.active,
      };
      const result = item
        ? await API.patch(`/api/goals/${item.id}`, body)
        : await API.post("/api/goals", body);
      onSave(result, !!item);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const del = async () => {
    setSaving(true);
    try {
      await API.delete(`/api/goals/${item.id}`);
      onDelete(item.id);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const addContrib = async () => {
    const amt = parseFloat(contribAmount);
    if (!amt || amt <= 0) { setContribErr("Enter a positive amount"); return; }
    setContribSaving(true); setContribErr(null);
    try {
      await API.post(`/api/goals/${item.id}/contributions`, { amount: amt, note: contribNote || null });
      setContribAmount("");
      setContribNote("");
      setContribDone(true);
      setTimeout(() => setContribDone(false), 2000);
      onSave(null, true);
    } catch (e) { setContribErr(e.message); setContribSaving(false); }
    setContribSaving(false);
  };

  const formContent = (
    <>
      <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
        <Input label="Name *" value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Emergency Fund, Vacation" />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Input label="Target Amount (\u20B9) *" type="number" min="0" value={form.target_amount} onChange={e => set("target_amount", e.target.value)} placeholder="100000" />
          <Input label="Target Date" type="date" value={form.target_date} onChange={e => set("target_date", e.target.value)} />
        </div>
        <Input label="Category" value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Savings, Travel (optional)" />
        <Input label="Notes" value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes" />
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} style={{ width: 14, height: 14 }} />
            Active
          </label>
        </div>
        {err && <div style={{ fontSize: "0.75rem", color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
      </div>

      {item && (
        <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <span style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 8, display: "block" }}>Add Contribution</span>
            <div style={{ display: "flex", gap: 8 }}>
              <Input type="number" min="0" placeholder="Amount (\u20B9)" value={contribAmount} onChange={e => setContribAmount(e.target.value)} />
              <Input placeholder="Note (optional)" value={contribNote} onChange={e => setContribNote(e.target.value)} />
              <Button onClick={addContrib} disabled={contribSaving} style={{ background: "var(--pos)", whiteSpace: "nowrap", border: "none", color: "var(--paper)" }}>
                {contribDone ? <Icon name="check" size={14} stroke="var(--paper)" /> : "+ Add"}
              </Button>
            </div>
            {contribErr && <div style={{ fontSize: "0.75rem", color: "var(--neg)", marginTop: 6 }}>{contribErr}</div>}
          </div>
        </div>
      )}

      <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
        {item && !confirming && (
          <Button onClick={() => setConfirming(true)} variant="danger" style={{ background: "none", border: "1px solid var(--neg)" }}>Delete</Button>
        )}
        {item && confirming && (
          <>
            <Button onClick={() => { window.hapticHeavy?.(); del(); }} disabled={saving} style={{ background: "var(--neg)", color: "var(--paper)", border: "none" }}>Confirm Delete</Button>
            <Button onClick={() => setConfirming(false)}>Cancel</Button>
          </>
        )}
        <Button onClick={onClose} style={{ marginLeft: confirming ? 0 : "auto"}}>Cancel</Button>
        <Button onClick={() => { window.hapticLight?.(); save(); }} disabled={saving} variant="primary">{saving ? "Saving\u2026" : item ? "Save" : "Add Goal"}</Button>
      </div>
    </>
  );

  return isMobile ? (
    <BottomSheet open title={item ? "Edit Goal" : "Add Goal"} onClose={onClose}>
      {formContent}
    </BottomSheet>
  ) : (
    <Modal open title={item ? "Edit Goal" : "Add Goal"} onClose={onClose}>
      {formContent}
    </Modal>
  );
};

const GoalsView = React.memo(() => {
  const { isMobile, isTablet } = useViewport();
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);

  const load = () => {
    setLoading(true);
    API.get("/api/goals")
      .then(d => { setGoals(d.goals); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };
  useEffect(load, []);

  const onSave = (result, isEdit) => {
    setModal(null);
    load();
  };
  const onDelete = (id) => { setGoals(gs => gs.filter(g => g.id !== id)); setModal(null); };

  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink-2)" };
  const today = new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <span role="status" className="spinner-lg" />
    </div>
  );

  if (error) return <div role="alert" style={{ padding: 28, color: "var(--neg)", fontSize: "0.8125rem" }}>{error}</div>;

  const activeGoals = goals.filter(g => g.active);
  const inactiveGoals = goals.filter(g => !g.active);

  return (
    <div className="fade-in">
      {modal && (
        <GoalModal
          item={modal === "new" ? null : modal}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setModal(null)}
        />
      )}

      <div style={{ ...secBand, ...(isMobile ? { padding: "10px 14px", flexWrap: "wrap" } : {}) }}>
        <span style={secTitle}>Goals</span>
        {activeGoals.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginLeft: 24 }}>
            {[
              ["Active Goals", activeGoals.length, "var(--ink-2)"],
              ["Total Target", window.formatMoney(activeGoals.reduce((s, g) => s + g.target_amount, 0)), "var(--ink-2)"],
              ["Total Saved", window.formatMoney(activeGoals.reduce((s, g) => s + g.current_amount, 0)), "var(--pos)"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>{label}</span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.8125rem", fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </div>
        )}
        <Button onClick={() => setModal("new")} variant="primary" size="sm" icon={<Icon name="plus" size={12} stroke="var(--paper)"/>} style={{ marginLeft: "auto" }}>Add Goal</Button>
      </div>

      <div style={{ padding: "20px 28px", ...(isMobile ? { padding: "20px 14px", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" } : {}), display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {!goals.length ? (
          <div style={{ gridColumn: "1/-1", padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: "0.8125rem" }}>
            No goals yet. <Button onClick={() => setModal("new")} variant="ghost" size="sm" style={{ textDecoration: "underline", display: "inline" }}>Add one to start tracking.</Button>
          </div>
        ) : activeGoals.map(goal => {
          const isPastDue = goal.target_date && goal.target_date < today && goal.pct < 100;
          const pct = Math.min(goal.pct || 0, 100);
          const done = goal.pct >= 100;
          return (
            <div key={goal.id} role="button" tabIndex={0} aria-selected={modal === goal} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} onClick={() => { window.hapticLight?.(); setModal(goal); }} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, ...(isMobile ? { padding: "12px 14px" } : {}), display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: "0.9375rem", color: "var(--ink)", paddingRight: 8 }}>{goal.name}</span>
                {goal.category && (
                  <span style={{ fontSize: "0.625rem", padding: "2px 8px", borderRadius: 99, background: "var(--paper-2)", color: "var(--ink-3)", whiteSpace: "nowrap", flexShrink: 0 }}>{goal.category}</span>
                )}
              </div>
              <div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.25rem", fontWeight: 700, color: done ? "var(--pos)" : "var(--ink)" }}>
                  {window.formatMoney(goal.current_amount)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: 2 }}>
                  of {window.formatMoney(goal.target_amount)} \u00B7 {window.formatMoney(goal.remaining)} remaining
                </div>
              </div>
              <ProgressBar value={pct} size="sm" color={done ? "pos" : "accent"} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "0.75rem", color: done ? "var(--pos)" : "var(--ink-4)", fontWeight: done ? 600 : 400 }}>
                  {done ? "Goal reached!" : `${goal.pct || 0}% saved`}
                </span>
                {goal.target_date && (
                  <span style={{ fontSize: "0.6875rem", padding: "2px 8px", borderRadius: 99, background: isPastDue ? "var(--neg-soft)" : "var(--paper-2)", color: isPastDue ? "var(--neg)" : "var(--ink-3)", fontWeight: 500 }}>
                    {new Date(goal.target_date + "T00:00:00").toLocaleString("en-IN", { month: "short", year: "numeric" })}
                    {isPastDue ? " \u00B7 Overdue" : ""}
                  </span>
                )}
              </div>
              {goal.notes && (
                <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{goal.notes}</div>
              )}
            </div>
          );
        })}
      </div>

      {inactiveGoals.length > 0 && (
        <>
          <div style={{ ...secBand, background: "none", borderTop: "1px solid var(--line)" }}>
            <span style={{ ...secTitle, color: "var(--ink-4)" }}>Inactive Goals ({inactiveGoals.length})</span>
          </div>
          <div style={{ padding: "16px 28px", ...(isMobile ? { padding: "16px 14px", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))" } : {}), display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {inactiveGoals.map(goal => (
              <div key={goal.id} role="button" tabIndex={0} aria-selected={modal === goal} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }} onClick={() => { window.hapticLight?.(); setModal(goal); }} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", opacity: 0.65 }}>
                <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: "0.9375rem", color: "var(--ink-3)" }}>{goal.name}</span>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>
                  {window.formatMoney(goal.current_amount)} of {window.formatMoney(goal.target_amount)} \u00B7 {goal.pct || 0}%
                </div>
                <ProgressBar value={goal.pct || 0} size="sm" color="amber" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
});

(window as any).GoalsView = GoalsView;
