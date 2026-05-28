// Cashflow Planner — projected income vs expenses (inspired by Cashkey)

const STORAGE_KEY = "mf_cashflow_plan";

const loadPlan = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return { incomes: [], expenses: [] };
};

const savePlan = (plan) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
};

const genId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const plannerStyles = {
  wrap: { padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)", maxWidth: 1200, margin: "0 auto" },
  secHead: { borderRadius: "8px 8px 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  secTitle: { fontSize: 11, fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" },
  secSub: { fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "var(--paper)", opacity: 0.4 },
  secBody: { background: "var(--card)", border: "1px solid var(--line)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "20px" },
};

const fmtAmt = (n) => {
  if (n >= 10000000) return `₹${(n/10000000).toFixed(2)}Cr`;
  if (n >= 100000) return `₹${(n/100000).toFixed(2)}L`;
  if (n >= 1000) return `₹${(n/1000).toFixed(1)}K`;
  return `₹${n}`;
};

const fmtFull = (n) => `₹${n.toLocaleString("en-IN")}`;

const CashflowPlannerView = () => {
  const { isMobile, isTablet } = useViewport();

  const [plan, setPlan] = React.useState(loadPlan);
  const [incomeSection, setIncomeSection] = React.useState({ name: "", amount: "", period: "annual" });
  const [expenseSection, setExpenseSection] = React.useState({ name: "", amount: "", period: "annual", category: "" });
  const [editingId, setEditingId] = React.useState(null);
  const [editFields, setEditFields] = React.useState({ name: "", amount: "" });
  const [showSankey, setShowSankey] = React.useState(false);

  const updatePlan = (updated) => {
    setPlan(updated);
    savePlan(updated);
  };

  const addIncome = () => {
    const { name, amount, period } = incomeSection;
    if (!name.trim() || !amount) return;
    let amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (isNaN(amt) || amt <= 0) return;
    if (period === "monthly") amt *= 12;
    const item = { id: genId(), name: name.trim(), amount: amt, period: "annual" };
    updatePlan({ ...plan, incomes: [...plan.incomes, item] });
    setIncomeSection({ name: "", amount: "", period: "annual" });
  };

  const addExpense = () => {
    const { name, amount, period, category } = expenseSection;
    if (!name.trim() || !amount) return;
    let amt = parseInt(amount.replace(/[^0-9]/g, ""), 10);
    if (isNaN(amt) || amt <= 0) return;
    if (period === "monthly") amt *= 12;
    const item = { id: genId(), name: name.trim(), amount: amt, period: "annual", category: category || "other" };
    updatePlan({ ...plan, expenses: [...plan.expenses, item] });
    setExpenseSection({ name: "", amount: "", period: "annual", category: "" });
  };

  const deleteItem = (type, id) => {
    updatePlan({ ...plan, [type]: plan[type].filter(i => i.id !== id) });
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditFields({ name: item.name, amount: String(item.amount) });
  };

  const saveEdit = (type) => {
    if (!editingId || !editFields.name.trim() || !editFields.amount) return;
    let amt = parseInt(editFields.amount.replace(/[^0-9]/g, ""), 10);
    if (isNaN(amt) || amt <= 0) return;
    updatePlan({
      ...plan,
      [type]: plan[type].map(i => i.id === editingId ? { ...i, name: editFields.name.trim(), amount: amt } : i),
    });
    setEditingId(null);
  };

  const cancelEdit = () => setEditingId(null);

  const totalIncome = plan.incomes.reduce((a, i) => a + i.amount, 0);
  const totalExpense = plan.expenses.reduce((a, e) => a + e.amount, 0);
  const surplus = totalIncome - totalExpense;
  const savingsRate = totalIncome > 0 ? ((surplus / totalIncome) * 100).toFixed(1) : "0.0";
  const hasDeficit = surplus < 0;

  const expenseByCat = {};
  for (const e of plan.expenses) {
    const key = e.category || "other";
    expenseByCat[key] = (expenseByCat[key] || 0) + e.amount;
  }
  const catEntries = Object.entries(expenseByCat).sort((a, b) => b[1] - a[1]);
  const maxCat = catEntries.length > 0 ? catEntries[0][1] : 1;

  const resetAll = () => {
    updatePlan({ incomes: [], expenses: [] });
  };

  const sampleData = () => {
    if (plan.incomes.length > 0 || plan.expenses.length > 0) return;
    updatePlan({
      incomes: [
        { id: genId(), name: "Salary", amount: 1800000, period: "annual" },
        { id: genId(), name: "Freelance", amount: 360000, period: "annual" },
      ],
      expenses: [
        { id: genId(), name: "Rent", amount: 360000, period: "annual", category: "rent" },
        { id: genId(), name: "Groceries", amount: 180000, period: "annual", category: "groceries" },
        { id: genId(), name: "Transport", amount: 72000, period: "annual", category: "transport" },
        { id: genId(), name: "Dining Out", amount: 96000, period: "annual", category: "food" },
        { id: genId(), name: "Shopping", amount: 120000, period: "annual", category: "shop" },
        { id: genId(), name: "Subscriptions", amount: 60000, period: "annual", category: "sub" },
        { id: genId(), name: "Utilities", amount: 48000, period: "annual", category: "util" },
        { id: genId(), name: "Travel", amount: 200000, period: "annual", category: "travel" },
      ],
    });
  };

  const incomeList = (
    <div>
      <div style={plannerStyles.secHead}>
        <span style={plannerStyles.secTitle}>Income sources</span>
        <span style={plannerStyles.secSub}>{plan.incomes.length} sources · {fmtAmt(totalIncome)}</span>
      </div>
      <div style={plannerStyles.secBody}>
        {plan.incomes.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic", padding: "8px 0" }}>
            No income sources added yet.
          </div>
        ) : (
          plan.incomes.map((item, idx) => (
            <div key={item.id} className="anim-row" style={{"--i": idx, display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: idx < plan.incomes.length - 1 ? "1px dashed var(--line)" : "none"}}>
              {editingId === item.id ? (
                <>
                  <input value={editFields.name} onChange={e => setEditFields(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") saveEdit("incomes"); if (e.key === "Escape") cancelEdit(); }} style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }} placeholder="Name" autoFocus onClick={e => e.stopPropagation()}/>
                  <input value={editFields.amount} onChange={e => setEditFields(p => ({ ...p, amount: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") saveEdit("incomes"); if (e.key === "Escape") cancelEdit(); }} style={{ width: 100, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontSize: 12, fontFamily: "'Geist Mono', monospace", textAlign: "right" }} placeholder="Amount" onClick={e => e.stopPropagation()}/>
                  <button onClick={() => saveEdit("incomes")} className="btn-press" style={{ border: "none", background: "var(--pos)", color: "white", borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>Save</button>
                  <button onClick={cancelEdit} className="btn-press" style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--pos)", flexShrink: 0 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{item.name}</span>
                  </div>
                  <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, color: "var(--pos)", fontWeight: 500, cursor: "pointer" }} onClick={() => startEdit(item)}>{fmtAmt(item.amount)}</span>
                  <button onClick={() => deleteItem("incomes", item.id)} className="btn-press" style={{ border: "none", background: "none", color: "var(--ink-4)", cursor: "pointer", padding: "2px 4px", fontSize: 14, lineHeight: 1 }} title="Delete">×</button>
                </>
              )}
            </div>
          ))
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input value={incomeSection.name} onChange={e => setIncomeSection(p => ({ ...p, name: e.target.value }))} placeholder="Income source" style={{ flex: "1 1 140px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12, minWidth: 0 }} onKeyDown={e => { if (e.key === "Enter") addIncome(); }}/>
          <input value={incomeSection.amount} onChange={e => setIncomeSection(p => ({ ...p, amount: e.target.value }))} placeholder="Amount" style={{ flex: "0 0 90px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12, fontFamily: "'Geist Mono', monospace", textAlign: "right" }} onKeyDown={e => { if (e.key === "Enter") addIncome(); }}/>
          <select value={incomeSection.period} onChange={e => setIncomeSection(p => ({ ...p, period: e.target.value }))} style={{ flex: "0 0 80px", padding: "7px 6px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }}>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
          <button onClick={addIncome} className="pill-btn btn-press" style={{ padding: "7px 14px", border: "none", background: "var(--pos)", color: "white", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
        </div>
      </div>
    </div>
  );

  const expenseList = (
    <div>
      <div style={plannerStyles.secHead}>
        <span style={plannerStyles.secTitle}>Expenses</span>
        <span style={plannerStyles.secSub}>{plan.expenses.length} items · {fmtAmt(totalExpense)}</span>
      </div>
      <div style={plannerStyles.secBody}>
        {plan.expenses.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic", padding: "8px 0" }}>
            No expenses added yet.
          </div>
        ) : (
          plan.expenses.map((item, idx) => {
            const catInfo = CategoryService.display(item.category || "other");
            return (
              <div key={item.id} className="anim-row" style={{"--i": idx, display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: idx < plan.expenses.length - 1 ? "1px dashed var(--line)" : "none"}}>
                {editingId === item.id ? (
                  <>
                    <input value={editFields.name} onChange={e => setEditFields(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") saveEdit("expenses"); if (e.key === "Escape") cancelEdit(); }} style={{ flex: 1, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }} placeholder="Name" autoFocus onClick={e => e.stopPropagation()}/>
                    <input value={editFields.amount} onChange={e => setEditFields(p => ({ ...p, amount: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") saveEdit("expenses"); if (e.key === "Escape") cancelEdit(); }} style={{ width: 100, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)", color: "var(--ink)", fontSize: 12, fontFamily: "'Geist Mono', monospace", textAlign: "right" }} placeholder="Amount" onClick={e => e.stopPropagation()}/>
                    <button onClick={() => saveEdit("expenses")} className="btn-press" style={{ border: "none", background: "var(--neg)", color: "white", borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>Save</button>
                    <button onClick={cancelEdit} className="btn-press" style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", borderRadius: 4, padding: "6px 10px", fontSize: 11, cursor: "pointer" }}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: catInfo.bg, border: `1px solid ${catInfo.ink}33`, flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{item.name}</span>
                      <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{catInfo.label}</span>
                    </div>
                    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, color: "var(--neg)", fontWeight: 500, cursor: "pointer" }} onClick={() => startEdit(item)}>{fmtAmt(item.amount)}</span>
                    <button onClick={() => deleteItem("expenses", item.id)} className="btn-press" style={{ border: "none", background: "none", color: "var(--ink-4)", cursor: "pointer", padding: "2px 4px", fontSize: 14, lineHeight: 1 }} title="Delete">×</button>
                  </>
                )}
              </div>
            );
          })
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <input value={expenseSection.name} onChange={e => setExpenseSection(p => ({ ...p, name: e.target.value }))} placeholder="Expense name" style={{ flex: "1 1 140px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12, minWidth: 0 }} onKeyDown={e => { if (e.key === "Enter") addExpense(); }}/>
          <input value={expenseSection.amount} onChange={e => setExpenseSection(p => ({ ...p, amount: e.target.value }))} placeholder="Amount" style={{ flex: "0 0 90px", padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12, fontFamily: "'Geist Mono', monospace", textAlign: "right" }} onKeyDown={e => { if (e.key === "Enter") addExpense(); }}/>
          <select value={expenseSection.period} onChange={e => setExpenseSection(p => ({ ...p, period: e.target.value }))} style={{ flex: "0 0 80px", padding: "7px 6px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }}>
            <option value="annual">Annual</option>
            <option value="monthly">Monthly</option>
          </select>
          <select value={expenseSection.category} onChange={e => setExpenseSection(p => ({ ...p, category: e.target.value }))} style={{ flex: "0 0 110px", padding: "7px 6px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--paper)", color: "var(--ink)", fontSize: 12 }}>
            <option value="">Category</option>
            {CategoryService.expenseCategories().map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button onClick={addExpense} className="pill-btn btn-press" style={{ padding: "7px 14px", border: "none", background: "var(--neg)", color: "white", borderRadius: 5, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add</button>
        </div>
      </div>
    </div>
  );

  const emptyState = plan.incomes.length === 0 && plan.expenses.length === 0 ? (
    <div style={{ textAlign: "center", padding: "40px 20px" }}>
      <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>╲ ╱</div>
      <div style={{ color: "var(--ink-3)", fontSize: 14, fontWeight: 500 }}>Plan your cashflow</div>
      <div style={{ color: "var(--ink-3)", fontSize: 12, marginTop: 4, maxWidth: 360, margin: "8px auto 20px" }}>
        Add your expected income sources and expenses to see your projected annual surplus or deficit.
      </div>
      <button onClick={sampleData} className="pill-btn btn-press" style={{ padding: "9px 18px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontWeight: 500 }}>
        Load sample data
      </button>
    </div>
  ) : null;

  return (
    <div className="view-enter" style={{ ...plannerStyles.wrap, ...(isMobile ? { padding: "20px 14px 56px", height: "calc(100dvh - 115px)" } : isTablet ? { padding: "24px 22px 64px" } : {}) }}>
      {/* Summary hero */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <div className="anim-row-spring" style={{"--i": 0, padding: "20px 22px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)"}}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>Projected income</div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, color: "var(--pos)" }}>{fmtAmt(totalIncome)}</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            <span style={{ fontFamily: "'Geist Mono', monospace" }}>{fmtAmt(Math.round(totalIncome / 12))}</span>/month
          </div>
        </div>
        <div className="anim-row-spring" style={{"--i": 1, padding: "20px 22px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)"}}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>Projected expenses</div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, color: "var(--neg)" }}>{fmtAmt(totalExpense)}</div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            <span style={{ fontFamily: "'Geist Mono', monospace" }}>{fmtAmt(Math.round(totalExpense / 12))}</span>/month
          </div>
        </div>
        <div className="anim-row-spring" style={{"--i": 2, padding: "20px 22px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)"}}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>{hasDeficit ? "Deficit" : "Surplus"}</div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, color: hasDeficit ? "var(--neg)" : "var(--pos)" }}>
            {hasDeficit ? "−" : "+"}{fmtAmt(Math.abs(surplus))}
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            <span style={{ fontFamily: "'Geist Mono', monospace" }}>{fmtAmt(Math.round(Math.abs(surplus) / 12))}</span>/month
          </div>
        </div>
        <div className="anim-row-spring" style={{"--i": 3, padding: "20px 22px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)"}}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>Savings rate</div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 24, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, color: hasDeficit ? "var(--neg)" : "var(--pos)" }}>
            {savingsRate}%
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4 }}>
            of projected income
          </div>
        </div>
      </div>

      {/* Main content */}
      {emptyState}

      {plan.incomes.length > 0 || plan.expenses.length > 0 ? (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
          {incomeList}
          {expenseList}
        </div>
      ) : null}

      {/* Category breakdown */}
      {catEntries.length > 0 && (
        <div className="anim-row-spring" style={{"--i": 4}}>
          <div style={plannerStyles.secHead}>
            <span style={plannerStyles.secTitle}>Expense breakdown by category</span>
            <span style={plannerStyles.secSub}>{fmtAmt(totalExpense)} total</span>
          </div>
          <div style={plannerStyles.secBody}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {catEntries.map(([cat, amt], idx) => {
                const pct = totalExpense > 0 ? (amt / totalExpense) * 100 : 0;
                const catInfo = CategoryService.display(cat);
                return (
                  <div key={cat} className="anim-row" style={{"--i": idx, padding: "12px 14px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)"}}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: catInfo.bg, border: `1px solid ${catInfo.ink}33`, flexShrink: 0 }}/>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{catInfo.label}</span>
                    </div>
                    <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 16, fontWeight: 600, color: "var(--neg)", letterSpacing: "-0.02em" }}>
                      {fmtAmt(amt)}
                    </div>
                    <div style={{ background: "var(--line)", height: 3, borderRadius: 10, overflow: "hidden", margin: "8px 0 4px" }}>
                      <div style={{ width: "100%", height: "100%", background: catInfo.ink, borderRadius: 10, transform: `scaleX(${pct / 100})`, transformOrigin: "left", transition: "transform 400ms cubic-bezier(.2,.8,.2,1)" }}/>
                    </div>
                    <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{pct.toFixed(0)}% of spend</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      {plan.incomes.length > 0 || plan.expenses.length > 0 ? (
        <div style={{ display: "flex", gap: 12, marginTop: 20, justifyContent: "center" }}>
          <button onClick={resetAll} className="pill-btn btn-press" style={{ padding: "8px 16px", background: "var(--card)", color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
            Reset all
          </button>
        </div>
      ) : null}
    </div>
  );
};

Object.assign(window, { CashflowPlannerView });
