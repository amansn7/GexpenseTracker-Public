// Goals tracking view

const { useState, useEffect } = React;

const fmtMoney = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const defaultGoalForm = () => ({ name: "", target_amount: "", target_date: "", category: "", notes: "", active: true });

const GoalModal = ({ item, onSave, onDelete, onClose }) => {
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
  const [closing, setClosing] = useState(false);
  const [contribAmount, setContribAmount] = useState("");
  const [contribNote, setContribNote] = useState("");
  const [contribSaving, setContribSaving] = useState(false);
  const [contribErr, setContribErr] = useState(null);
  const [contribDone, setContribDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleClose = () => { if (closing) return; setClosing(true); setTimeout(onClose, 150); };

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
      onSave(null, true); // trigger reload
    } catch (e) { setContribErr(e.message); setContribSaving(false); }
    setContribSaving(false);
  };

  const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className={closing ? "backdrop-out" : "backdrop-in"}>
      <div className={closing ? "modal-out" : "modal-in"} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px -16px var(--shadow-lg)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500 }}>{item ? "Edit Goal" : "Add Goal"}</span>
          <button onClick={handleClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Name *</label>
            <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Emergency Fund, Vacation" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Target Amount (₹) *</label>
              <input style={inp} type="number" min="0" value={form.target_amount} onChange={e => set("target_amount", e.target.value)} placeholder="100000" />
            </div>
            <div>
              <label style={lbl}>Target Date</label>
              <input style={inp} type="date" value={form.target_date} onChange={e => set("target_date", e.target.value)} />
            </div>
          </div>
          <div>
            <label style={lbl}>Category</label>
            <input style={inp} value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Savings, Travel (optional)" />
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes" />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <label style={{ ...lbl, marginBottom: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} style={{ width: 14, height: 14 }} />
              Active
            </label>
          </div>
          {err && <div style={{ fontSize: 12, color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
        </div>

        {item && (
          <div style={{ padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
              <label style={{ ...lbl, marginBottom: 8 }}>Add Contribution</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  style={{ ...inp, flex: 1 }}
                  type="number"
                  min="0"
                  placeholder="Amount (₹)"
                  value={contribAmount}
                  onChange={e => setContribAmount(e.target.value)}
                />
                <input
                  style={{ ...inp, flex: 2 }}
                  placeholder="Note (optional)"
                  value={contribNote}
                  onChange={e => setContribNote(e.target.value)}
                />
                <button
                  onClick={addContrib}
                  disabled={contribSaving}
                  style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--pos)", color: "var(--paper)", fontSize: 12, cursor: contribSaving ? "default" : "pointer", opacity: contribSaving ? 0.65 : 1, whiteSpace: "nowrap" }}
                >
                  {contribDone ? <Icon name="check" size={14} stroke="var(--paper)" /> : "+ Add"}
                </button>
              </div>
              {contribErr && <div style={{ fontSize: 12, color: "var(--neg)", marginTop: 6 }}>{contribErr}</div>}
            </div>
          </div>
        )}

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
          <button onClick={handleClose} style={{ marginLeft: confirming ? 0 : "auto", padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : item ? "Save" : "Add Goal"}</button>
        </div>
      </div>
    </div>
  );
};

const GoalsView = () => {
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
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--ink-2)" };
  const today = new Date().toISOString().slice(0, 10);

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <span className="spinner-lg" />
    </div>
  );

  if (error) return <div style={{ padding: 28, color: "var(--neg)", fontSize: 13 }}>{error}</div>;

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

      <div style={secBand}>
        <span style={secTitle}>Goals</span>
        {activeGoals.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginLeft: 24 }}>
            {[
              ["Active Goals", activeGoals.length, "var(--ink-2)"],
              ["Total Target", fmtMoney(activeGoals.reduce((s, g) => s + g.target_amount, 0)), "var(--ink-2)"],
              ["Total Saved", fmtMoney(activeGoals.reduce((s, g) => s + g.current_amount, 0)), "var(--pos)"],
            ].map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>{label}</span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setModal("new")} style={{ marginLeft: "auto", padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
          <Icon name="plus" size={12} stroke="var(--paper)"/> Add Goal
        </button>
      </div>

      <div style={{ padding: "20px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
        {!goals.length ? (
          <div style={{ gridColumn: "1/-1", padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No goals yet. <button onClick={() => setModal("new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>Add one to start tracking.</button>
          </div>
        ) : activeGoals.map(goal => {
          const isPastDue = goal.target_date && goal.target_date < today && goal.pct < 100;
          const pct = Math.min(goal.pct || 0, 100);
          const done = goal.pct >= 100;
          return (
            <div key={goal.id} onClick={() => setModal(goal)} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 10, cursor: "pointer", position: "relative" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 15, color: "var(--ink)", paddingRight: 8 }}>{goal.name}</span>
                {goal.category && (
                  <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "var(--paper-2)", color: "var(--ink-3)", whiteSpace: "nowrap", flexShrink: 0 }}>{goal.category}</span>
                )}
              </div>
              <div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 20, fontWeight: 700, color: done ? "var(--pos)" : "var(--ink)" }}>
                  {fmtMoney(goal.current_amount)}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                  of {fmtMoney(goal.target_amount)} · {fmtMoney(goal.remaining)} remaining
                </div>
              </div>
              <div style={{ background: "var(--line)", borderRadius: 4, height: 6 }}>
                <div style={{ background: done ? "var(--pos)" : "var(--accent)", width: pct + "%", height: "100%", borderRadius: 4, transition: "width 400ms ease" }} />
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: done ? "var(--pos)" : "var(--ink-4)", fontWeight: done ? 600 : 400 }}>
                  {done ? "Goal reached!" : `${goal.pct || 0}% saved`}
                </span>
                {goal.target_date && (
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: isPastDue ? "var(--neg-soft)" : "var(--paper-2)", color: isPastDue ? "var(--neg)" : "var(--ink-3)", fontWeight: 500 }}>
                    {new Date(goal.target_date + "T00:00:00").toLocaleString("en-IN", { month: "short", year: "numeric" })}
                    {isPastDue ? " · Overdue" : ""}
                  </span>
                )}
              </div>
              {goal.notes && (
                <div style={{ fontSize: 12, color: "var(--ink-3)", borderTop: "1px solid var(--line)", paddingTop: 8 }}>{goal.notes}</div>
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
          <div style={{ padding: "16px 28px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {inactiveGoals.map(goal => (
              <div key={goal.id} onClick={() => setModal(goal)} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 18, display: "flex", flexDirection: "column", gap: 8, cursor: "pointer", opacity: 0.65 }}>
                <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 15, color: "var(--ink-3)" }}>{goal.name}</span>
                <div style={{ fontSize: 12, color: "var(--ink-4)" }}>
                  {fmtMoney(goal.current_amount)} of {fmtMoney(goal.target_amount)} · {goal.pct || 0}%
                </div>
                <div style={{ background: "var(--line)", borderRadius: 4, height: 4 }}>
                  <div style={{ background: "var(--ink-4)", width: Math.min(goal.pct || 0, 100) + "%", height: "100%", borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

window.GoalsView = GoalsView;
