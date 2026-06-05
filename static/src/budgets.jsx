// Budgets tracking view

const { useState, useEffect, useRef, useMemo } = React;

const fmtMoneyB = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

const ConfidenceBadge = ({ confidence }) => {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "var(--pos)" : pct >= 50 ? "var(--amber)" : "var(--neg)";
  return (
    <span style={{
      fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 3,
      background: color + "18", color, border: "1px solid " + color + "30",
    }}>
      {pct}%
    </span>
  );
};

const ProcessingAnimation = ({ message, subMessage, loading, onDone }) => {
  const [exiting, setExiting] = useState(false);
  const hasLoaded = useRef(false);
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (loading) hasLoaded.current = true;
    if (!loading && hasLoaded.current && !exiting) {
      setExiting(true);
    }
  }, [loading, exiting]);

  useEffect(() => {
    if (exiting) {
      const t = setTimeout(() => { setMounted(false); onDone?.(); }, 450);
      return () => clearTimeout(t);
    }
  }, [exiting, onDone]);

  const stars = useMemo(() =>
    Array.from({ length: 10 }, (_, i) => ({
      left: `${12 + (i * 8.3) % 76}%`,
      top: `${15 + (i * 13.7) % 60}%`,
      delay: `${(i * 0.23) % 1.8}s`,
      size: 3 + (i % 4) * 1.8,
      duration: 2 + (i % 3) * 0.6,
    })), []
  );

  if (!mounted && !loading) return null;

  return (
    <div className={"processing-overlay" + (exiting ? " exit" : "")}>
      <div className="processing-ring" />
      <div className="processing-sine">
        {Array.from({ length: 14 }, (_, i) => (
          <div key={i} className="processing-sine-dot" style={{ '--i': i }} />
        ))}
      </div>
      {stars.map((s, i) => (
        <div key={i} className="processing-star" style={{
          left: s.left, top: s.top,
          width: s.size + 'px', height: s.size + 'px',
          animationDelay: s.delay,
          animationDuration: s.duration + 's',
        }} />
      ))}
      <div className="processing-message">{message || 'Analyzing'}</div>
      {subMessage && <div className="processing-sub">{subMessage}</div>}
    </div>
  );
};

const SuggestionRow = ({ label, amount, sub, accent, onApply }) => (
  <div onClick={() => onApply(amount)}
    className="row-clickable"
    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 4, cursor: "pointer", background: "var(--card)", border: accent ? "1px solid var(--accent)" : "1px solid transparent" }}
    role="button" tabIndex="0"
    onKeyDown={e => { if (e.key === 'Enter') onApply(amount); }}>
    <div>
      <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{label}</div>
      <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{sub}</div>
    </div>
    <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, fontWeight: 600, color: accent ? "var(--accent)" : "var(--ink-2)" }}>
      {fmtMoneyB(amount)}
    </div>
  </div>
);

const SuggestAllModal = ({ suggestions, onClose, onApply, loading, error }) => {
  const { isMobile } = useViewport();
  const [appliedSet, setAppliedSet] = useState(new Set());
  const [applyingCategory, setApplyingCategory] = useState(null);
  const [suggestDone, setSuggestDone] = useState(false);
  const suggestRef = React.useRef(null);
  window.useFocusTrap(suggestRef, true);

  React.useEffect(() => {
    function onKey(e) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const handleApply = async (suggestion) => {
    setApplyingCategory(suggestion.category);
    try {
      await onApply(suggestion);
      setAppliedSet(prev => new Set(prev).add(suggestion.category));
    } catch (_) {}
    setApplyingCategory(null);
  };

  const handleApplyAll = async () => {
    if (!suggestions?.budgets) return;
    for (const s of suggestions.budgets) {
      setApplyingCategory(s.category);
      try {
        await onApply(s);
        setAppliedSet(prev => new Set(prev).add(s.category));
      } catch (_) {}
    }
    setApplyingCategory(null);
    onClose();
  };

  const pendingCount = suggestions?.budgets ? suggestions.budgets.filter(s => !appliedSet.has(s.category)).length : 0;

  const formContent = (
    <>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
        <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500 }}>AI-Suggested Budget Plan</span>
        <button onClick={onClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}><Icon name="x" size={16}/></button>
      </div>
      <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
        {loading ? (
          <ProcessingAnimation message="Generating budget suggestions" subMessage="Analyzing spending history" loading />
        ) : error ? (
          <div style={{ fontSize: 12, color: "var(--neg)", padding: "10px", background: "var(--neg-soft)", borderRadius: 5 }}>{error}</div>
        ) : suggestions?.budgets?.length ? (
          <div className="stagger-group">
            {suggestions.summary && (
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.5, '--i': 0 }}>{suggestions.summary}</div>
            )}
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap", '--i': 1 }}>
              {suggestions.total_budget != null && (
                <div><span style={{ fontSize: 10, color: "var(--ink-4)", display: "block" }}>Total Budget</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 600 }}>{fmtMoneyB(suggestions.total_budget)}</span></div>
              )}
              {suggestions.total_income != null && (
                <div><span style={{ fontSize: 10, color: "var(--ink-4)", display: "block" }}>Total Income</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 600 }}>{fmtMoneyB(suggestions.total_income)}</span></div>
              )}
              {suggestions.projected_savings != null && (
                <div><span style={{ fontSize: 10, color: "var(--ink-4)", display: "block" }}>Projected Savings</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 600, color: "var(--pos)" }}>{fmtMoneyB(suggestions.projected_savings)}</span></div>
              )}
              {suggestions.savings_rate_pct != null && (
                <div><span style={{ fontSize: 10, color: "var(--ink-4)", display: "block" }}>Savings Rate</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 600, color: "var(--pos)" }}>{suggestions.savings_rate_pct}%</span></div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4 }}>Suggested Budgets</div>
              {suggestions.budgets.map((b, i) => {
                const isApplied = appliedSet.has(b.category);
                const isApplying = applyingCategory === b.category;
                return (
                <div key={i} style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", opacity: isApplied ? 0.6 : 1, '--i': i + 2 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{b.category}</span>
                      <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                        {fmtMoneyB(b.suggested_limit)}
                        {b.current_limit != null && <span style={{ color: "var(--ink-4)" }}> (was {fmtMoneyB(b.current_limit)})</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ConfidenceBadge confidence={b.confidence} />
                      {isApplied ? (
                        <span style={{ fontSize: 10, color: "var(--pos)", fontWeight: 500 }}>Applied</span>
                      ) : (
                        <button onClick={() => handleApply(b)} disabled={!!applyingCategory} style={{ padding: "3px 12px", borderRadius: 4, border: "1px solid var(--accent)", background: "none", color: "var(--accent)", fontSize: 10, cursor: applyingCategory ? "default" : "pointer", fontFamily: "inherit", minHeight: 44, opacity: applyingCategory ? 0.5 : 1 }}>
                          {isApplying ? "…" : "Apply"}
                        </button>
                      )}
                    </div>
                  </div>
                  {b.rationale && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: 10, color: "var(--ink-4)", cursor: "pointer" }}>Rationale</summary>
                      <p style={{ fontSize: 11, color: "var(--ink-3)", margin: "4px 0 0", lineHeight: 1.4 }}>{b.rationale}</p>
                    </details>
                  )}
                </div>
                );
              })}
            </div>
            {pendingCount > 0 && (
            <div style={{ marginTop: 16 }}>
              <button onClick={handleApplyAll} disabled={!!applyingCategory} style={{ width: "100%", padding: "10px", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 13, cursor: applyingCategory ? "default" : "pointer", opacity: applyingCategory ? 0.65 : 1, minHeight: 44 }}>
                {applyingCategory ? "Applying…" : `Apply All (${pendingCount})`}
              </button>
            </div>
            )}
            </div>
          ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-3)", fontSize: 13 }}>No budget suggestions available.</div>
        )}
      </div>
    </>
  );

  return isMobile ? (
    <div onClick={onClose} style={bottomSheetStyles.overlay}>
      <div ref={suggestRef} onClick={e => e.stopPropagation()} style={bottomSheetStyles.sheet}>
        <div style={bottomSheetStyles.handle} />
        <div style={bottomSheetStyles.content}>
          {formContent}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className="backdrop-in">
      <div ref={suggestRef} className="modal-in" style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px -16px var(--shadow-lg)", maxHeight: "85vh", display: "flex", flexDirection: "column" }}>
        {formContent}
      </div>
    </div>
  );
};

const BudgetModal = ({ item, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState(item ? {
    category: item.category,
    monthly_limit: String(item.monthly_limit),
  } : { category: "", monthly_limit: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const budgetRef = React.useRef(null);
  window.useFocusTrap(budgetRef, !closing);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const [suggestions, setSuggestions] = useState(null);

  const [anomalyEnabled, setAnomalyEnabled] = useState(false);
  const [anomalyResult, setAnomalyResult] = useState(null);
  const [merchantSplit, setMerchantSplit] = useState(null);
  const [adaptivePlanResult, setAdaptivePlanResult] = useState(null);
  const [showAdaptiveDetail, setShowAdaptiveDetail] = useState(false);
  const [llmLoading, setLlmLoading] = useState(false);
  const [llmErr, setLlmErr] = useState(null);
  const { isMobile } = useViewport();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  React.useEffect(() => {
    if (closing) return;
    function onKey(e) { if (e.key === "Escape") handleClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [closing]);

  const handleClose = () => { if (closing) return; setClosing(true); setTimeout(onClose, 150); };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const loadSuggestions = async () => {
    const cat = form.category.trim();
    if (!cat) { setErr("Enter a category first"); return; }
    setSuggestLoading(true);
    setErr(null);
    setSuggestions(null);
    setAnomalyResult(null);
    setMerchantSplit(null);
    setAdaptivePlanResult(null);
    setShowAdaptiveDetail(false);
    setLlmErr(null);
    try {
      const today = new Date();
      const threeMoAgo = new Date(today.getFullYear(), today.getMonth() - 3, 1);
      const from = threeMoAgo.toISOString().slice(0, 10);
      const to = today.toISOString().slice(0, 10);
      const result = await API.get(
        `/api/stats?sections=summary,categoryBreakdown&date_from=${from}&date_to=${to}`
      );
      if (!result) return;
      const breakdown = result.categoryBreakdown;
      const summary = result.summary;
      if (!breakdown || !summary) { setErr("No historical data available"); setSuggestLoading(false); return; }

      const totalSpend = breakdown.total || 0;
      const monthlyIncome = summary.total_income || 0;
      const totalExpense = summary.total_expenses || 0;

      let catAmount = 0;
      for (const c of breakdown.categories) {
        const key = normCat(c.category, false);
        if (key === normCat(cat, false)) { catAmount += c.amount; break; }
      }

      const avgMonthly = Math.round(catAmount / 3);
      const suggested = Math.round(avgMonthly * 1.1);
      const idealSavingsRate = 0.20;
      const idealSpend = monthlyIncome * (1 - idealSavingsRate);
      const catPct = totalSpend > 0 ? catAmount / totalSpend : 0;
      const ideal = Math.round(idealSpend * catPct);

      setSuggestions({ avgMonthly, suggested, ideal, monthlyIncome, totalExpense, catAmount });
    } catch (_) { setErr("Could not fetch spending data"); }
    setSuggestLoading(false);

    if (cat) {
      setLlmLoading(true);
      try {
        const [adaptive, split] = await Promise.all([
          API.post("/api/budgets/llm/adaptive-plan", {}).catch(() => null),
          API.post("/api/budgets/llm/merchant-split", {}).catch(() => null),
        ]);
        if (adaptive) setAdaptivePlanResult(adaptive);
        if (split?.reallocations) setMerchantSplit(split);
      } catch (_) { setLlmErr("Could not load AI insights"); }

      if (anomalyEnabled) {
        try {
          const anomaly = await API.post(`/api/budgets/llm/anomaly-adjust?category=${encodeURIComponent(cat)}`, {});
          if (anomaly) setAnomalyResult(anomaly);
        } catch (_) {}
      }
      setLlmLoading(false);
    }
  };

  const applySuggestion = (amount) => {
    set("monthly_limit", String(amount));
    setSuggestions(null);
    setAnomalyResult(null);
    setMerchantSplit(null);
    setAdaptivePlanResult(null);
    setShowAdaptiveDetail(false);
  };

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

  const isVariableIncome = adaptivePlanResult?.income_profile?.type === "variable";

  const adaptiveDetail = showAdaptiveDetail && adaptivePlanResult;

  const formContent = (
    <>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center" }}>
          <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 16, fontWeight: 500 }}>{item ? "Edit Budget" : "Add Budget"}</span>
          <button onClick={handleClose} aria-label="Close" style={{ marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4 }}><Icon name="x" size={16}/></button>
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
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <label style={lbl}>Monthly Limit (₹) *</label>
              {!item && (
                <button onClick={loadSuggestions} disabled={suggestLoading}
                  style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "none", color: "var(--accent)", fontSize: 10, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3, minHeight: 44 }}>
                  <Icon name="sparkle" size={10} stroke="var(--accent)"/> {suggestLoading ? "Loading…" : "Suggest"}
                </button>
              )}
            </div>
            <input style={inp} type="number" min="0" value={form.monthly_limit} onChange={e => set("monthly_limit", e.target.value)} placeholder="5000" />
          </div>
          {!item && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)", cursor: "pointer" }}>
              <input type="checkbox" checked={anomalyEnabled} onChange={e => setAnomalyEnabled(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              Analyze for anomalies
            </label>
          )}
          {suggestLoading && (
            <ProcessingAnimation message="Finding spending patterns" subMessage="Analyzing your transaction history" loading />
          )}
          {suggestions && (
            <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Suggestions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SuggestionRow label="Avg monthly spend" amount={suggestions.avgMonthly} sub={`Last 3 months · ${fmtMoneyB(suggestions.catAmount)} total`} onApply={applySuggestion} />
                <SuggestionRow label="Suggested budget" amount={suggestions.suggested} sub="Avg spend + 10% buffer" onApply={applySuggestion} accent />
                <SuggestionRow label="Ideal budget" amount={suggestions.ideal} sub={`Based on income (${fmtMoneyB(suggestions.monthlyIncome)}) with 20% savings rate`} onApply={applySuggestion} />
              </div>

              {llmLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <div className="processing-sine" style={{ height: 20, marginBottom: 0 }}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="processing-sine-dot" style={{ '--i': i, width: 4, height: 4 }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--ink-3)" }}>AI analysis…</span>
                </div>
              )}

              {anomalyResult && (
                <div style={{ padding: "6px 8px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 4 }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4 }}>Anomaly Adjustment</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    Adjusted baseline: <strong>{fmtMoneyB(anomalyResult.adjusted_baseline)}</strong>
                  </div>
                  {anomalyResult.rationale && (
                    <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 2 }}>{anomalyResult.rationale}</div>
                  )}
                  <button onClick={() => applySuggestion(anomalyResult.adjusted_baseline)}
                    style={{ marginTop: 4, padding: "2px 8px", borderRadius: 3, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 10, cursor: "pointer", minHeight: 44 }}>
                    Apply
                  </button>
                </div>
              )}

              {isVariableIncome && !showAdaptiveDetail && (
                <div style={{ background: "var(--paper-2)", border: "1px dashed var(--accent)", borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4, marginBottom: 8 }}>
                    Your income varies month-to-month. Try proportional budgets instead.
                  </div>
                  <button onClick={() => setShowAdaptiveDetail(true)}
                    style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid var(--accent)", background: "none", color: "var(--accent)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}>
                    Set up adaptive plan
                  </button>
                </div>
              )}

              {adaptiveDetail && (
                <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 6 }}>Adaptive Plan</div>
                  <div style={{ fontSize: 11, color: "var(--ink-2)", marginBottom: 4 }}>
                    Plan type: <strong>{adaptivePlanResult.plan_type}</strong>
                  </div>
                  {adaptivePlanResult.income_profile && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>
                      Income: {adaptivePlanResult.income_profile.type} · mean {fmtMoneyB(adaptivePlanResult.income_profile.mean)}
                      {adaptivePlanResult.income_profile.cv != null && ` · CV ${adaptivePlanResult.income_profile.cv.toFixed(2)}`}
                    </div>
                  )}
                  {adaptivePlanResult.essentials && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>
                      Essentials: <strong>{fmtMoneyB(adaptivePlanResult.essentials.fixed_total)}</strong>
                    </div>
                  )}
                  {adaptivePlanResult.discretionary && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 2 }}>
                      Discretionary: <strong>{adaptivePlanResult.discretionary.total_pct_of_income}%</strong> of income
                    </div>
                  )}
                  {adaptivePlanResult.savings_plan && (
                    <div style={{ fontSize: 11, color: "var(--pos)", lineHeight: 1.4 }}>
                      {typeof adaptivePlanResult.savings_plan === "object"
                        ? Object.entries(adaptivePlanResult.savings_plan).map(([k, v]) => (
                            <div key={k} style={{ fontSize: 10, marginTop: 1 }}>
                              {k.replace(/_/g, " ")}: {typeof v === "object" ? JSON.stringify(v) : v}
                            </div>
                          ))
                        : `Savings: ${adaptivePlanResult.savings_plan}`}
                    </div>
                  )}
                </div>
              )}

              {merchantSplit?.reallocations?.length > 0 && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 10, color: "var(--ink-4)", cursor: "pointer", padding: "4px 0" }}>
                    Merchant Reallocations ({merchantSplit.reallocations.length})
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {merchantSplit.reallocations.map((r, i) => (
                      <div key={i} style={{ padding: "6px 8px", background: "var(--card)", borderRadius: 4, border: "1px solid var(--line)" }}>
                        <div style={{ fontSize: 11, fontWeight: 500, color: "var(--ink)" }}>{r.merchant}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-3)" }}>
                          {fmtMoneyB(r.amount)} · {r.from_category} → {r.to_category}
                        </div>
                        {r.rationale && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{r.rationale}</div>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
          {llmErr && <div style={{ fontSize: 11, color: "var(--ink-3)", padding: "4px 0" }}>{llmErr}</div>}
          {err && <div style={{ fontSize: 12, color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          {item && !confirming && (
            <button onClick={() => setConfirming(true)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--neg)", background: "none", color: "var(--neg)", fontSize: 13, cursor: "pointer", minHeight: 44 }}>Delete</button>
          )}
          {item && confirming && (
            <>
              <button onClick={del} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--neg)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer", minHeight: 44 }}>Confirm Delete</button>
              <button onClick={() => setConfirming(false)} style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 13, cursor: "pointer", minHeight: 44 }}>Cancel</button>
            </>
          )}
          <button onClick={handleClose} style={{ marginLeft: confirming ? 0 : "auto", padding: "8px 14px", borderRadius: 6, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 13, cursor: "pointer", minHeight: 44 }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ padding: "8px 14px", borderRadius: 6, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 13, cursor: saving ? "default" : "pointer", opacity: saving ? 0.65 : 1, minHeight: 44 }}>{saving ? "Saving…" : item ? "Save" : "Add Budget"}</button>
        </div>
    </>
  );

  return isMobile ? (
    <div onClick={handleClose} style={bottomSheetStyles.overlay}>
      <div ref={budgetRef} onClick={e => e.stopPropagation()} style={bottomSheetStyles.sheet}>
        <div style={bottomSheetStyles.handle} />
        <div style={bottomSheetStyles.content}>
          {formContent}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} className={closing ? "backdrop-out" : "backdrop-in"}>
      <div ref={budgetRef} className={closing ? "modal-out" : "modal-in"} style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 400, boxShadow: "0 24px 64px -16px var(--shadow-lg)", maxHeight: "90vh", overflowY: "auto" }}>
        {formContent}
      </div>
    </div>
  );
};

const BudgetsView = React.memo(() => {
  const { isMobile, isTablet } = useViewport();
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
      const result = await API.post("/api/budgets/links", {
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

  const healthScore = healthCheck?.score;
  const healthColor = healthScore >= 80 ? "var(--pos)" : healthScore >= 50 ? "var(--amber)" : "var(--neg)";

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
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={loadSuggestPlan} disabled={suggestLoading}
            style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--accent)", background: "none", color: "var(--accent)", fontSize: 11, cursor: suggestLoading ? "default" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4, minHeight: 44 }}>
            {suggestLoading ? <span className="spinner-sm" /> : <Icon name="sparkle" size={10} stroke="var(--accent)"/>}
            {suggestLoading ? "…" : "Suggest All"}
          </button>
          <button onClick={loadGoalOptimize} disabled={goalLoading}
            style={{ padding: "5px 10px", borderRadius: 5, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 11, cursor: goalLoading ? "default" : "pointer", fontFamily: "inherit", minHeight: 44 }}>
            {goalLoading ? "…" : "Check Goals"}
          </button>
          <button onClick={() => setModal("new")} style={{ padding: "5px 12px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, minHeight: 44 }}>
            <Icon name="plus" size={12} stroke="var(--paper)"/> Add Budget
          </button>
        </div>
      </div>

      <div className="health-card">
        <div className="health-card-header" onClick={handleHealthToggle}>
          <span aria-label={healthCheck ? `Health score: ${healthCheck.score} — ${healthCheck.score_label || ""}` : "Budget health not checked"} className="health-score-badge" style={{
            background: (healthCheck ? healthColor + "18" : "var(--line)"), color: healthCheck ? healthColor : "var(--ink-4)",
            border: "2px solid " + (healthCheck ? healthColor + "40" : "var(--line)"),
          }}>
            {healthCheck?.score != null ? healthCheck.score : "—"}
          </span>
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>Budget Health</span>
          {healthLoading && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Checking…</span>}
          {healthCheck?.score_label && !healthLoading && <span style={{ fontSize: 11, color: healthColor, fontWeight: 500 }}>{healthCheck.score_label}</span>}
          {!healthCheck && !healthLoading && !healthError && <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 500 }}>Check</span>}
          {healthError && !healthLoading && <span style={{ fontSize: 11, color: "var(--neg)" }}>Failed</span>}
          <span className={"chevron" + (healthExpanded ? " open" : "")}>&#8963;</span>
        </div>
        <div className={"expandable-body" + (healthExpanded ? " open" : "")}>
          <div className="expandable-inner">
          {!healthProcessingDone && (
            <ProcessingAnimation
              message="Checking budget health"
              subMessage="Analyzing spending patterns"
              loading={healthLoading}
              onDone={() => setHealthProcessingDone(true)}
            />
          )}
          {healthProcessingDone && healthError && (
            <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
              Health check unavailable. <button onClick={loadHealthCheck} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, textDecoration: "underline", fontFamily: "inherit", minHeight: 44 }}>Retry</button>
            </div>
          )}
          {healthProcessingDone && healthCheck && (
              <div className="stagger-group">{healthCheck.issues?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="section-label">Issues</div>
                  {healthCheck.issues.map((issue, i) => (
                    <div key={i} className="health-issue" style={{ '--i': i }}>
                      <span role="img" aria-label={issue.severity === "critical" ? "Critical" : "Warning"} className="health-issue-icon">{issue.severity === "critical" ? "❌" : "⚠️"}</span>
                      <div className="health-issue-content">
                        <div className="health-issue-category">{issue.category}</div>
                        <div className="health-issue-message">{issue.message}</div>
                        {issue.action && (
                          <button onClick={() => openBudgetForCategory(issue.category)}
                            className="health-issue-action">
                            {issue.action}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {healthCheck.praise?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="section-label">Doing Well</div>
                  {healthCheck.praise.map((p, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--pos)", '--i': (healthCheck.issues?.length || 0) + i }}>
                      <span role="img" aria-label="Positive">✅</span> {p.category}: {p.message}
                    </div>
                  ))}
                </div>
              )}
              {healthCheck.projection && (
                <div style={{ display: "flex", flexDirection: "column", gap: 2, '--i': (healthCheck.issues?.length || 0) + (healthCheck.praise?.length || 0) }}>
                  <div className="section-label">Projection</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)" }}>
                    Month-end spend: {fmtMoneyB(healthCheck.projection.month_end_spend)}
                    {healthCheck.projection.vs_budget != null && (
                      <span style={{ color: healthCheck.projection.vs_budget > 0 ? "var(--neg)" : "var(--pos)", marginLeft: 4 }}>
                        ({healthCheck.projection.vs_budget > 0 ? "+" : ""}{fmtMoneyB(healthCheck.projection.vs_budget)} vs budget)
                      </span>
                    )}
                  </div>
                  {healthCheck.projection.concern && (
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{healthCheck.projection.concern}</div>
                  )}
                </div>
              )}
              {healthCheck.goal_impact && typeof healthCheck.goal_impact === "object" && (
                <div style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 4, '--i': (healthCheck.issues?.length || 0) + (healthCheck.praise?.length || 0) + 1 }}>
                  <span style={{ fontWeight: 500 }}>Goal impact</span>
                  {Object.entries(healthCheck.goal_impact).map(([goal, msg]) => (
                    <div key={goal} style={{ padding: "4px 6px", background: "var(--paper-2)", borderRadius: 4, fontSize: 11, lineHeight: 1.4 }}>
                      <strong>{goal}</strong>: {typeof msg === "object" ? (msg.message || msg.threat || JSON.stringify(msg)) : msg}
                    </div>
                  ))}
                </div>
              )}
            </div>)}
          </div>
        </div>
      </div>


      {!goalProcessingDone && (
        <ProcessingAnimation
          message="Analyzing goals"
          subMessage="Optimizing budget allocation"
          loading={goalLoading}
          onDone={() => setGoalProcessingDone(true)}
        />
      )}
      {goalProcessingDone && goalError && (
        <div style={{ margin: "12px 28px", ...(isMobile ? { margin: "12px 14px" } : {}), padding: "8px 16px", fontSize: 12, color: "var(--neg)", background: "var(--neg-soft)", borderRadius: 6 }}>
          {goalError} <button onClick={loadGoalOptimize} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 12, textDecoration: "underline", fontFamily: "inherit", minHeight: 44, marginLeft: 8 }}>Retry</button>
        </div>
      )}
      {goalProcessingDone && goalOptimize && (
        <div style={{ margin: "12px 28px 12px", ...(isMobile ? { margin: "12px 14px" } : {}), border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
          <div onClick={() => setGoalExpanded(h => !h)} className="health-card-header">
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>Goal Optimization</span>
            {goalOptimize.total_savings_found != null && (
              <span style={{ fontSize: 11, color: "var(--pos)", fontWeight: 500 }}>Found {fmtMoneyB(goalOptimize.total_savings_found)}</span>
            )}
            <span className={"chevron" + (goalExpanded ? " open" : "")}>&#8963;</span>
          </div>
          <div className={"expandable-body" + (goalExpanded ? " open" : "")}>
            <div className="expandable-inner">
              <div className="stagger-group">
              {goalOptimize.goal_analysis?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <div className="section-label">Goals</div>
                  {goalOptimize.goal_analysis.map((g, i) => (
                    <div key={i} style={{ padding: "8px 10px", background: "var(--paper-2)", borderRadius: 4, border: "1px solid var(--line)", '--i': i }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span role="img" aria-label={g.on_track ? "On track" : "Off track"}>{g.on_track ? "✅" : "⚠️"}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{g.goal_name}</span>
                        <span style={{ fontSize: 11, color: g.on_track ? "var(--pos)" : "var(--neg)" }}>
                          {g.on_track ? "On track" : "Off track"}
                        </span>
                      </div>
                      {g.required_monthly != null && (
                        <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                          Required monthly: {fmtMoneyB(g.required_monthly)}
                          {g.suggestion && <span style={{ marginLeft: 4 }}>· {g.suggestion}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {goalOptimize.adjustments?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, '--i': (goalOptimize.goal_analysis?.length || 0) }}>
                  <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Suggested Adjustments</div>
                  {goalOptimize.adjustments.map((adj, i) => (
                    <div key={i} style={{ padding: "8px 10px", background: "var(--paper-2)", borderRadius: 4, border: "1px solid var(--line)", '--i': (goalOptimize.goal_analysis?.length || 0) + 1 + i }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>{adj.category}</div>
                          <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
                            {fmtMoneyB(adj.current_limit)} → {fmtMoneyB(adj.suggested_limit)}
                            {adj.savings > 0 && <span style={{ color: "var(--pos)", marginLeft: 4 }}>(save {fmtMoneyB(adj.savings)})</span>}
                          </div>
                          {adj.rationale && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 1 }}>{adj.rationale}</div>}
                        </div>
                        <button onClick={() => openBudgetForCategory(adj.category)}
                          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "none", color: "var(--accent)", fontSize: 10, cursor: "pointer", flexShrink: 0, fontFamily: "inherit", minHeight: 44 }}>
                          Adjust
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {goalOptimize.remaining_shortfall != null && (
                <div style={{ fontSize: 11, color: "var(--ink-3)", '--i': (goalOptimize.goal_analysis?.length || 0) + (goalOptimize.adjustments?.length || 0) + 1 }}>
                  Remaining shortfall: <strong>{fmtMoneyB(goalOptimize.remaining_shortfall)}</strong>
                </div>
              )}
              {goalOptimize.recommendation && (
                <div style={{ fontSize: 11, color: "var(--ink-2)", padding: "6px 8px", background: "var(--paper-2)", borderRadius: 4, border: "1px solid var(--line)", lineHeight: 1.4, '--i': (goalOptimize.goal_analysis?.length || 0) + (goalOptimize.adjustments?.length || 0) + 2 }}>
                  {goalOptimize.recommendation}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "20px 28px", ...(isMobile ? { padding: "20px 14px" } : {}), display: "flex", flexDirection: "column", gap: 8 }}>
        {!budgets.length ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
            No budgets set. <button onClick={() => setModal("new")} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", fontSize: 13, minHeight: 44 }}>Add one per category to track monthly spend.</button>
          </div>
        ) : budgets.map((budget, idx) => {
          const pct = Math.min(budget.pct || 0, 100);
          const over = budget.over_budget;
          return (
            <div
              key={budget.id}
              className="stagger-card"
              onClick={() => setModal(budget)}
              style={{ '--i': idx,
                background: over ? "var(--neg-soft)" : "var(--card)",
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

      {/* Category Links */}
      <div style={{ margin: "0 28px 20px", ...(isMobile ? { margin: "0 14px 20px" } : {}), border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
        <div
          onClick={() => setLinksExpanded(e => !e)}
          style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}
        >
          <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)" }}>Category Links</span>
          {links.length > 0 && (
            <span style={{ fontSize: 10, color: "var(--ink-4)" }}>{links.length} link{links.length !== 1 ? "s" : ""}</span>
          )}
          <button
            onClick={e => {
              e.stopPropagation();
              if (!showAddLink) loadRecurring();
              setShowAddLink(v => !v);
              setLinksExpanded(true);
              setLinkErr(null);
            }}
            style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 4, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 11, cursor: "pointer", minHeight: 44 }}
          >
            + Add Link
          </button>
          <span className={"chevron" + (linksExpanded ? " open" : "")}>&#8963;</span>
        </div>
        <div className={"expandable-body" + (linksExpanded ? " open" : "")}>
          <div className="expandable-inner" style={{ padding: "0 14px 12px" }}>
            {showAddLink && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>New Link</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 3 }}>Source category</div>
                    <input
                      list="link-source-list"
                      value={linkForm.source_category}
                      onChange={e => setLinkForm(f => ({ ...f, source_category: e.target.value }))}
                      placeholder="e.g. Rent"
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                    <datalist id="link-source-list">
                      {budgets.map(b => <option key={b.id} value={b.category} />)}
                    </datalist>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2, fontSize: 14, color: "var(--ink-3)" }}>→</div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 3 }}>Target budget</div>
                    <select
                      value={linkForm.target_category}
                      onChange={e => {
                        const v = e.target.value;
                        setLinkForm(f => ({ ...f, target_category: v }));
                        prefillSplitFromRecurring(v);
                      }}
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
                    >
                      <option value="">Select budget…</option>
                      {budgets
                        .filter(b => normCat(b.category, false) !== normCat(linkForm.source_category, false))
                        .map(b => <option key={b.id} value={b.category}>{b.category}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1, minWidth: 100 }}>
                    <div style={{ fontSize: 10, color: "var(--ink-4)", marginBottom: 3 }}>Split amount (₹/txn)</div>
                    <input
                      type="number"
                      min="1"
                      value={linkForm.split_amount}
                      onChange={e => setLinkForm(f => ({ ...f, split_amount: e.target.value }))}
                      placeholder="2000"
                      style={{ width: "100%", padding: "6px 8px", border: "1px solid var(--line)", borderRadius: 5, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", boxSizing: "border-box" }}
                    />
                  </div>
                </div>
                {linkErr && <div style={{ fontSize: 11, color: "var(--neg)" }}>{linkErr}</div>}
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={addLink} disabled={linkSaving} style={{ padding: "5px 14px", borderRadius: 5, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: 12, cursor: linkSaving ? "default" : "pointer", opacity: linkSaving ? 0.65 : 1, minHeight: 44 }}>
                    {linkSaving ? "Saving…" : "Save Link"}
                  </button>
                  <button onClick={() => { setShowAddLink(false); setLinkErr(null); setLinkForm({ source_category: "", target_category: "", split_amount: "" }); }} style={{ padding: "5px 14px", borderRadius: 5, border: "1px solid var(--line)", background: "none", color: "var(--ink-2)", fontSize: 12, cursor: "pointer", minHeight: 44 }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
            {links.length === 0 && !showAddLink ? (
              <div style={{ fontSize: 12, color: "var(--ink-4)", padding: "4px 0" }}>No links. Add one to split a source category's spend into another budget.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {links.map(lnk => (
                  <div key={lnk.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--paper-2)", borderRadius: 5, border: "1px solid var(--line)" }}>
                    <span style={{ fontSize: 12, color: "var(--ink)", fontWeight: 500 }}>{lnk.source_category}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-4)" }}>→</span>
                    <span style={{ fontSize: 12, color: "var(--ink)" }}>{lnk.target_category}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>{fmtMoneyB(lnk.split_amount)}/txn</span>
                    <button onClick={() => deleteLink(lnk.id)} style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "none", color: "var(--ink-3)", fontSize: 10, cursor: "pointer", minHeight: 44 }}>×</button>
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

window.BudgetsView = BudgetsView;
