// Recurring expenses view

const { useState, useEffect, useRef } = React;

const FREQ_LABELS = { monthly: "Monthly", weekly: "Weekly", "bi-weekly": "Bi-weekly", yearly: "Yearly" };
const FREQ_COLORS = {
  monthly:    { bg: "var(--cat-other)",   ink: "var(--cat-other-ink)" },
  weekly:     { bg: "var(--cat-travel)",  ink: "var(--cat-travel-ink)" },
  "bi-weekly":{ bg: "var(--cat-util)",    ink: "var(--cat-util-ink)" },
  yearly:     { bg: "var(--cat-sub)",     ink: "var(--cat-sub-ink)" },
};

const defaultForm = () => ({ name: "", amount: "", category: "", frequency: "monthly", notes: "", active: true });

const RecurringModal = ({ item, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState(item ? { ...item, amount: item.amount ?? "" } : defaultForm());
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    setSaving(true); setErr(null);
    try {
      const body = {
        name: form.name.trim(),
        amount: form.amount !== "" ? parseFloat(form.amount) : null,
        category: form.category || null,
        frequency: form.frequency,
        notes: form.notes || null,
        active: form.active,
      };
      const result = item
        ? await API.patch(`/api/recurring/${item.id}`, body)
        : await API.post("/api/recurring", body);
      onSave(result, !!item);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const del = async () => {
    setSaving(true);
    try {
      await API.delete(`/api/recurring/${item.id}`);
      onDelete(item.id);
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const inp = { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(26,24,20,0.44)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px -16px rgba(0,0,0,0.3)" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 500 }}>{item ? "Edit Recurring" : "Add Recurring"}</span>
          <button onClick={onClose} style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}><Icon name="x" size={16}/></button>
        </div>
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={lbl}>Name *</label>
            <input style={inp} value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Netflix, Rent" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={lbl}>Amount (₹)</label>
              <input style={inp} type="number" min="0" value={form.amount} onChange={e => set("amount", e.target.value)} placeholder="0" />
            </div>
            <div>
              <label style={lbl}>Frequency</label>
              <select style={inp} value={form.frequency} onChange={e => set("frequency", e.target.value)}>
                {Object.entries(FREQ_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label style={lbl}>Category</label>
            <select style={inp} value={form.category} onChange={e => set("category", e.target.value)}>
              <option value="">— None —</option>
              {Object.entries(CATEGORIES).map(([k, c]) => <option key={k} value={k}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Notes</label>
            <textarea style={{ ...inp, resize: "vertical", minHeight: 60 }} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes" />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={form.active} onChange={e => set("active", e.target.checked)} />
            Active
          </label>
          {err && <div style={{ fontSize: 12, color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          {item && !confirming && (
            <button onClick={() => setConfirming(true)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--neg)", fontSize: 13, cursor: "pointer" }}>Delete</button>
          )}
          {item && confirming && (
            <button onClick={del} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--neg)", color: "#fff", fontSize: 13, cursor: "pointer" }}>Confirm Delete</button>
          )}
          <button onClick={onClose} style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 18px", borderRadius: 6, border: "none", background: "var(--ink)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1 }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
};

const RecurringView = () => {
  const [items, setItems] = useState([]);
  const [monthly, setMonthly] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("active");
  const [modal, setModal] = useState(null); // null | "new" | item object

  const load = () => {
    setLoading(true);
    API.get("/api/recurring")
      .then(d => { setItems(d.items); setMonthly(d.monthly_total); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };
  useEffect(load, []);

  const toggleActive = async (item) => {
    const updated = { ...item, active: !item.active };
    setItems(its => its.map(i => i.id === item.id ? { ...i, active: !i.active } : i));
    try {
      await API.patch(`/api/recurring/${item.id}`, { name: item.name, amount: item.amount, category: item.category, frequency: item.frequency, notes: item.notes, active: !item.active });
    } catch (_) { setItems(its => its.map(i => i.id === item.id ? item : i)); }
  };

  const onSave = (result, isEdit) => {
    if (isEdit) setItems(its => its.map(i => i.id === result.id ? result : i));
    else setItems(its => [...its, result]);
    setModal(null);
    load();
  };
  const onDelete = (id) => { setItems(its => its.filter(i => i.id !== id)); setModal(null); load(); };

  const visible = filter === "active" ? items.filter(i => i.active) : items;

  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 500, color: "var(--ink-2)" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <div style={{ width: 24, height: 24, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }} />
    </div>
  );

  if (error) return <div style={{ padding: 28, color: "var(--neg)", fontSize: 13 }}>{error}</div>;

  return (
    <div className="fade-in">
      {modal && (
        <RecurringModal
          item={modal === "new" ? null : modal}
          onSave={onSave}
          onDelete={onDelete}
          onClose={() => setModal(null)}
        />
      )}

      <div style={secBand}>
        <span style={secTitle}>Recurring Expenses</span>
        <span style={{ marginLeft: 12, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "var(--ink-3)" }}>
          ₹{monthly.toLocaleString("en-IN", { maximumFractionDigits: 0 })}/mo
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {[["active","Active"],["all","All"]].map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{ padding: "5px 12px", borderRadius: 5, border: "1px solid var(--line)", background: filter === k ? "var(--ink)" : "var(--card)", color: filter === k ? "var(--paper)" : "var(--ink-2)", fontSize: 12, cursor: "pointer" }}>{l}</button>
          ))}
          <button onClick={() => setModal("new")} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--accent)", color: "#fff", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="plus" size={12} stroke="#fff"/> Add
          </button>
        </div>
      </div>

      <div style={{ padding: "16px 28px" }}>
        {!visible.length ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            {filter === "active" ? "No active recurring items." : "No recurring items yet."} <button onClick={() => setModal("new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13 }}>Add one</button>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {visible.map(item => {
              const cat = CATEGORIES[item.category];
              const freq = FREQ_COLORS[item.frequency] || FREQ_COLORS.monthly;
              return (
                <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--card)", opacity: item.active ? 1 : 0.55 }}>
                  {cat && <span style={{ width: 10, height: 10, borderRadius: 3, flexShrink: 0, background: cat.bg, border: `1px solid ${cat.ink}22` }} />}
                  <span style={{ flex: 1, fontWeight: 500, fontSize: 13, color: "var(--ink)" }}>{item.name}</span>
                  {item.amount != null && (
                    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, color: "var(--neg)", fontWeight: 600 }}>
                      ₹{item.amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                    </span>
                  )}
                  <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: freq.bg, color: freq.ink, fontWeight: 500 }}>
                    {FREQ_LABELS[item.frequency] || item.frequency}
                  </span>
                  <button
                    onClick={() => toggleActive(item)}
                    title={item.active ? "Deactivate" : "Activate"}
                    style={{ width: 28, height: 16, borderRadius: 99, border: "none", background: item.active ? "var(--pos)" : "var(--line)", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 140ms" }}>
                    <span style={{ position: "absolute", top: 2, left: item.active ? 14 : 2, width: 12, height: 12, borderRadius: 99, background: "#fff", transition: "left 140ms" }} />
                  </button>
                  <button onClick={() => setModal(item)} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-4)", padding: 4, borderRadius: 4 }}>
                    <Icon name="edit" size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

window.RecurringView = RecurringView;
