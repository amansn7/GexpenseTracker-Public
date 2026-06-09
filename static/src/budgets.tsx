// @ts-nocheck
// Budgets tracking view
const { useState, useEffect } = React;

const BudgetsView = React.memo(() => {
  const { isMobile } = useViewport();
  const [budgets, setBudgets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);
  const [healthCheck, setHealthCheck] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);
  const [healthExpanded, setHealthExpanded] = useState(false);
  const [healthProcessingDone, setHealthProcessingDone] = useState(true);
  const [suggestPlan, setSuggestPlan] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestError, setSuggestError] = useState(null);
  const [goalOptimize, setGoalOptimize] = useState(null);
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalError, setGoalError] = useState(null);
  const [goalExpanded, setGoalExpanded] = useState(false);
  const [goalProcessingDone, setGoalProcessingDone] = useState(true);
  const [links, setLinks] = useState([]);
  const [linksExpanded, setLinksExpanded] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkForm, setLinkForm] = useState({ source_category: "", target_category: "", split_amount: "" });
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkErr, setLinkErr] = useState(null);
  const [recurringExpenses, setRecurringExpenses] = useState([]);

  const load = () => {
    setLoading(true);
    Promise.all([
      API.get("/api/budgets"),
      API.get("/api/budgets/links"),
    ])
      .then(([d, l]) => { setBudgets(d.budgets); setLinks(l.links || []); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };
  useEffect(load, []);

  const loadRecurring = async () => {
    try {
      const r = await API.get("/api/recurring");
      setRecurringExpenses(r.items || []);
    } catch (_) {}
  };

  const prefillSplitFromRecurring = (targetCat) => {
    const match = recurringExpenses.find(r =>
      normCat(r.category || r.name, false) === normCat(targetCat, false)
    );
    if (match?.amount) {
      setLinkForm(f => ({ ...f, split_amount: String(match.amount) }));
    }
  };

  const addLink = async () => {
    const amount = parseFloat(linkForm.split_amount);
    if (!linkForm.source_category) { setLinkErr("Source category required"); return; }
    if (!linkForm.target_category) { setLinkErr("Target budget required"); return; }
    if (!amount || amount <= 0) { setLinkErr("Split amount must be positive"); return; }
    setLinkSaving(true); setLinkErr(null);
    try {
      await API.post("/api/budgets/links", {
        source_category: linkForm.source_category,
        target_category: linkForm.target_category,
        split_amount: amount,
      });
      setShowAddLink(false);
      setLinkForm({ source_category: "", target_category: "", split_amount: "" });
      load();
    } catch (e) { setLinkErr(e.message); }
    setLinkSaving(false);
  };

  const deleteLink = async (id) => {
    try {
      await API.delete(`/api/budgets/links/${id}`);
      load();
    } catch (e) { setLinkErr(e.message); }
  };

  const loadHealthCheck = async () => {
    const cached = sessionStorage.getItem("budget_health_cache");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        if (Date.now() - parsed.ts < 300000) {
          setHealthCheck(parsed.data);
          setHealthExpanded(true);
          return;
        }
      } catch (_) {}
    }
    setHealthLoading(true);
    setHealthProcessingDone(false);
    setHealthError(null);
    setHealthCheck(null);
    let result = null;
    try {
      result = await API.post("/api/budgets/llm/health-check", {});
      setHealthCheck(result);
    } catch (e) {
      setHealthError(e.message || "Could not load health check");
    }
    if (result) {
      sessionStorage.setItem("budget_health_cache", JSON.stringify({ data: result, ts: Date.now() }));
    }
    setHealthExpanded(true);
    setHealthLoading(false);
  };

  const handleHealthToggle = () => {
    if (!healthCheck && !healthLoading && !healthError) {
      setHealthProcessingDone(false);
      loadHealthCheck();
    } else {
      setHealthExpanded(h => !h);
      if (healthError) { setHealthError(null); setHealthProcessingDone(false); setHealthExpanded(h => !h); }
    }
  };

  const loadSuggestPlan = async () => {
    setSuggestLoading(true);
    setSuggestError(null);
    setSuggestPlan(null);
    try {
      const result = await API.post("/api/budgets/llm/suggest-plan", {});
      setSuggestPlan(result);
    } catch (e) {
      setSuggestError(e.message || "Could not load suggestions");
      setSuggestPlan(null);
    }
    setSuggestLoading(false);
  };

  const loadGoalOptimize = async () => {
    setGoalLoading(true);
    setGoalProcessingDone(false);
    setGoalError(null);
    setGoalOptimize(null);
    try {
      const result = await API.post("/api/budgets/llm/goal-optimize", {});
      setGoalOptimize(result);
      setGoalExpanded(true);
    } catch (e) {
      setGoalError(e.message || "Could not load goal analysis");
    }
    setGoalLoading(false);
  };

  const applySuggestPlanItem = async (suggestion) => {
    setSuggestError(null);
    const existing = budgets.find(b => normCat(b.category, false) === normCat(suggestion.category, false));
    try {
      let result;
      if (existing) {
        result = await API.patch(`/api/budgets/${existing.id}`, { monthly_limit: suggestion.suggested_limit });
      } else {
        result = await API.post("/api/budgets", { category: suggestion.category, monthly_limit: suggestion.suggested_limit });
      }
      setBudgets(prev => {
        const idx = prev.findIndex(b => b.id === result.id);
        if (idx >= 0) {
          return prev.map(b => b.id === result.id ? {
            ...b, monthly_limit: result.monthly_limit,
            pct: b.spent_this_month > 0 ? Math.round((b.spent_this_month / result.monthly_limit) * 1000) / 10 : 0,
            over_budget: b.spent_this_month > result.monthly_limit,
          } : b);
        }
        return [...prev, { ...result, spent_this_month: 0, pct: 0, over_budget: false }];
      });
    } catch (e) {
      setSuggestError(`Failed to apply for ${suggestion.category}`);
      throw e;
    }
  };

  const openBudgetForCategory = (category) => {
    const existing = budgets.find(b => normCat(b.category, false) === normCat(category, false));
    setModal(existing || "new");
  };

  const onSave = (result, isEdit) => {
    setModal(null);
    load();
  };
  const onDelete = (id) => { setBudgets(bs => bs.filter(b => b.id !== id)); setModal(null); };

  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink-2)" };

  if (loading) return (
    <div aria-live="polite" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <span role="status" className="spinner-lg" />
    </div>
  );

  if (error) return <div role="alert" style={{ padding: 28, color: "var(--neg)", fontSize: "0.8125rem" }}>{error}</div>;

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

      {(suggestLoading || suggestPlan) && (
        <SuggestAllModal
          suggestions={suggestPlan}
          onClose={() => { setSuggestPlan(null); setSuggestError(null); }}
          onApply={applySuggestPlanItem}
          loading={suggestLoading && !suggestPlan}
          error={suggestError}
        />
      )}

      <div style={{ ...secBand, ...(isMobile ? { padding: "10px 14px", flexWrap: "wrap" } : {}) }}>
        <span style={secTitle}>Budgets</span>
        {budgets.length > 0 && (
          <div style={{ display: "flex", gap: 20, marginLeft: 24 }}>
            {[
              ["Spent", window.formatMoney(totalSpent), totalSpent > totalLimit ? "var(--neg)" : "var(--ink-2)"],
              ["Limit", window.formatMoney(totalLimit), "var(--ink-2)"],
              overBudget.length > 0 ? ["Over Budget", overBudget.length + " categor" + (overBudget.length === 1 ? "y" : "ies"), "var(--neg)"] : null,
            ].filter(Boolean).map(([label, val, color]) => (
              <div key={label} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>{label}</span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.8125rem", fontWeight: 600, color }}>{val}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={loadSuggestPlan} disabled={suggestLoading}
            style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--accent)", background: "none", color: "var(--accent)", fontSize: "0.6875rem", cursor: suggestLoading ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, minHeight: 44 }}>
            {suggestLoading ? <span className="spinner-sm" /> : <Icon name="sparkle" size={10} stroke="var(--accent)"/>}
            {suggestLoading ? "\u2026" : "Suggest All"}
          </button>
          <button onClick={loadGoalOptimize} disabled={goalLoading}
            style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: "0.6875rem", cursor: goalLoading ? "default" : "pointer", fontFamily: "inherit", minHeight: 44 }}>
            {goalLoading ? "\u2026" : "Check Goals"}
          </button>
          <button onClick={() => setModal("new")} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, minHeight: 44 }}>
            <Icon name="plus" size={12} stroke="var(--paper)"/> Add Budget
          </button>
        </div>
      </div>

      <BudgetHealthSection
        isMobile={isMobile}
        healthCheck={healthCheck}
        healthLoading={healthLoading}
        healthError={healthError}
        healthExpanded={healthExpanded}
        healthProcessingDone={healthProcessingDone}
        onLoadHealthCheck={loadHealthCheck}
        onToggle={handleHealthToggle}
        onProcessingDone={setHealthProcessingDone}
        onOpenBudget={openBudgetForCategory}
      />

      <BudgetGoalSection
        isMobile={isMobile}
        goalOptimize={goalOptimize}
        goalLoading={goalLoading}
        goalError={goalError}
        goalExpanded={goalExpanded}
        goalProcessingDone={goalProcessingDone}
        onLoadGoalOptimize={loadGoalOptimize}
        onSetExpanded={setGoalExpanded}
        onProcessingDone={setGoalProcessingDone}
        onOpenBudget={openBudgetForCategory}
      />

      <div style={{ padding: "20px 28px", ...(isMobile ? { padding: "20px 14px" } : {}), display: "flex", flexDirection: "column", gap: 8 }}>
        {!budgets.length ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: "0.8125rem" }}>
            No budgets set. <button onClick={() => setModal("new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: "0.8125rem", minHeight: 44 }}>Add one per category to track monthly spend.</button>
          </div>
        ) : budgets.map((budget, idx) => {
          const pct = Math.min(budget.pct || 0, 100);
          const over = budget.over_budget;
          return (
            <div key={budget.id} className="stagger-card" onClick={() => { window.hapticLight?.(); setModal(budget); }}
              style={{ '--i': idx, background: over ? "var(--neg-soft)" : "var(--card)", border: "1px solid " + (over ? "var(--neg)" : "var(--line)"), borderRadius: 8, padding: "14px 16px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: "0.875rem", color: over ? "var(--neg)" : "var(--ink)" }}>
                  {budget.category}
                  {over && <span style={{ marginLeft: 8, fontSize: "0.6875rem", fontWeight: 500, color: "var(--neg)" }}>Over budget</span>}
                </span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.8125rem", color: over ? "var(--neg)" : "var(--ink-2)" }}>
                  {window.formatMoney(budget.spent_this_month)}
                  <span style={{ color: "var(--ink-4)", fontWeight: 400 }}> / {window.formatMoney(budget.monthly_limit)}</span>
                </span>
              </div>
              <div style={{ background: "var(--line)", borderRadius: 4, height: 6 }}>
                <div style={{ background: over ? "var(--neg)" : "var(--pos)", width: pct + "%", height: "100%", borderRadius: 4, transition: "width 400ms ease" }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "0.6875rem", color: over ? "var(--neg)" : "var(--ink-4)" }}>
                  {over ? `${window.formatMoney(budget.spent_this_month - budget.monthly_limit)} over limit` : `${window.formatMoney(budget.monthly_limit - budget.spent_this_month)} remaining`}
                </span>
                <span style={{ fontSize: "0.6875rem", color: over ? "var(--neg)" : "var(--ink-4)", fontWeight: 500 }}>
                  {budget.pct || 0}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ margin: "0 28px 20px", ...(isMobile ? { margin: "0 14px 20px" } : {}), border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
        <div onClick={() => setLinksExpanded(e => !e)} style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>Category Links</span>
          {links.length > 0 && (
            <span style={{ fontSize: "0.625rem", color: "var(--ink-4)" }}>{links.length} link{links.length !== 1 ? "s" : ""}</span>
          )}
          <button onClick={e => { e.stopPropagation(); if (!showAddLink) loadRecurring(); setShowAddLink(v => !v); setLinksExpanded(true); setLinkErr(null); }}
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 4, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: "0.6875rem", cursor: "pointer", minHeight: 44 }}>
            + Add Link
          </button>
          <span className={"chevron" + (linksExpanded ? " open" : "")}>&#8963;</span>
        </div>
        <div className={"expandable-body" + (linksExpanded ? " open" : "")}>
          <div className="expandable-inner" style={{ padding: "0 14px 12px" }}>
            {showAddLink && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
                <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>New Link</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginBottom: 3 }}>Source category</div>
                    <input list="link-source-list" value={linkForm.source_category} onChange={e => setLinkForm(f => ({ ...f, source_category: e.target.value }))}
                      placeholder="e.g. Rent"
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: "0.75rem", fontFamily: "inherit", boxSizing: "border-box" }} />
                    <datalist id="link-source-list">{budgets.map(b => <option key={b.id} value={b.category} />)}</datalist>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2, fontSize: "0.875rem", color: "var(--ink-3)" }}>\u2192</div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginBottom: 3 }}>Target budget</div>
                    <select value={linkForm.target_category} onChange={e => { const v = e.target.value; setLinkForm(f => ({ ...f, target_category: v })); prefillSplitFromRecurring(v); }}
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: "0.75rem", fontFamily: "inherit", boxSizing: "border-box" }}>
                      <option value="">Select budget\u2026</option>
                      {budgets.filter(b => normCat(b.category, false) !== normCat(linkForm.source_category, false)).map(b => <option key={b.id} value={b.category}>{b.category}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginBottom: 3 }}>Split amount (\u20B9/txn)</div>
                    <input type="number" min="1" value={linkForm.split_amount} onChange={e => setLinkForm(f => ({ ...f, split_amount: e.target.value }))} placeholder="2000"
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: "0.75rem", fontFamily: "inherit", boxSizing: "border-box" }} />
                  </div>
                </div>
                {linkErr && <div style={{ fontSize: "0.6875rem", color: "var(--neg)" }}>{linkErr}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={addLink} disabled={linkSaving} style={{ padding: "5px 14px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: "0.75rem", cursor: linkSaving ? "default" : "pointer", opacity: linkSaving ? 0.65 : 1, minHeight: 44 }}>
                    {linkSaving ? "Saving\u2026" : "Save Link"}
                  </button>
                  <button onClick={() => { setShowAddLink(false); setLinkErr(null); setLinkForm({ source_category: "", target_category: "", split_amount: "" }); }}
                    style={{ padding: "5px 14px", borderRadius: 5, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: "0.75rem", cursor: "pointer", minHeight: 44 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {links.length === 0 && !showAddLink ? (
              <div style={{ fontSize: "0.75rem", color: "var(--ink-4)", padding: "4px 0" }}>No links. Add one to split a source category's spend into another budget.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {links.map(lnk => (
                  <div key={lnk.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--paper-2)", borderRadius: 5, border: "1px solid var(--line)" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink)", fontWeight: 500 }}>{lnk.source_category}</span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>\u2192</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--ink)" }}>{lnk.target_category}</span>
                    <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>{window.formatMoney(lnk.split_amount)}/txn</span>
                    <button onClick={() => deleteLink(lnk.id)} style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "none", color: "var(--ink-3)", fontSize: "0.625rem", cursor: "pointer", minHeight: 44 }}>\u00d7</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

(window as any).BudgetsView = BudgetsView;
