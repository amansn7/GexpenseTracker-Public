// @ts-nocheck
// budget-modal.tsx — Budget creation/editing modal

const { useState, useEffect } = React;

const SuggestionRow = ({ label, amount, sub, accent, onApply }) => (
  <div onClick={() => onApply(amount)}
    className="row-clickable"
    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 8px", borderRadius: 4, cursor: "pointer", background: "var(--card)", border: accent ? "1px solid var(--accent)" : "1px solid transparent" }}
    role="button" tabIndex="0"
    onKeyDown={e => { if (e.key === 'Enter') onApply(amount); }}>
    <div>
      <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>{label}</div>
      <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginTop: 1 }}>{sub}</div>
    </div>
    <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.8125rem", fontWeight: 600, color: accent ? "var(--accent)" : "var(--ink-2)" }}>
      {window.formatMoney(amount)}
    </div>
  </div>
);

const BudgetModal = ({ item, onSave, onDelete, onClose }) => {
  const [form, setForm] = useState(item ? {
    category: item.category,
    monthly_limit: String(item.monthly_limit),
  } : { category: "", monthly_limit: "" });
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
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

  const isVariableIncome = adaptivePlanResult?.income_profile?.type === "variable";

  const adaptiveDetail = showAdaptiveDetail && adaptivePlanResult;

  const formContent = (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {item ? (
          <Input label="Category" value={item.category} disabled />
        ) : (
          <Input label="Category *" value={form.category} onChange={e => set("category", e.target.value)} placeholder="e.g. Food, Transport, Entertainment" />
        )}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4, display: "block" }}>Monthly Limit (\u20B9) *</span>
            {!item && (
              <Button onClick={loadSuggestions} disabled={suggestLoading} size="sm" style={{ border: "1px solid var(--line)", background: "none", color: "var(--accent)", fontSize: "0.625rem", minHeight: 44 }}>
                <Icon name="sparkle" size={10} stroke="var(--accent)"/> {suggestLoading ? "Loading\u2026" : "Suggest"}
              </Button>
            )}
          </div>
          <Input type="number" min="0" value={form.monthly_limit} onChange={e => set("monthly_limit", e.target.value)} placeholder="5000" />
        </div>
          {!item && (
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.6875rem", color: "var(--ink-3)", cursor: "pointer" }}>
              <input type="checkbox" checked={anomalyEnabled} onChange={e => setAnomalyEnabled(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
              Analyze for anomalies
            </label>
          )}
          {suggestLoading && (
            <ProcessingAnimation message="Finding spending patterns" subMessage="Analyzing your transaction history" loading />
          )}
          {suggestions && (
            <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Suggestions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <SuggestionRow label="Avg monthly spend" amount={suggestions.avgMonthly} sub={`Last 3 months \u00b7 ${window.formatMoney(suggestions.catAmount)} total`} onApply={applySuggestion} />
                <SuggestionRow label="Suggested budget" amount={suggestions.suggested} sub="Avg spend + 10% buffer" onApply={applySuggestion} accent />
                <SuggestionRow label="Ideal budget" amount={suggestions.ideal} sub={`Based on income (${window.formatMoney(suggestions.monthlyIncome)}) with 20% savings rate`} onApply={applySuggestion} />
              </div>

              {llmLoading && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0" }}>
                  <div className="processing-sine" style={{ height: 20, marginBottom: 0 }}>
                    {Array.from({ length: 6 }, (_, i) => (
                      <div key={i} className="processing-sine-dot" style={{ '--i': i, width: 4, height: 4 }} />
                    ))}
                  </div>
                  <span style={{ fontSize: "0.625rem", color: "var(--ink-3)" }}>AI analysis\u2026</span>
                </div>
              )}

              {anomalyResult && (
                <div style={{ padding: "6px 8px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 4 }}>
                  <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4 }}>Anomaly Adjustment</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>
                    Adjusted baseline: <strong>{window.formatMoney(anomalyResult.adjusted_baseline)}</strong>
                  </div>
                  {anomalyResult.rationale && (
                    <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginTop: 2 }}>{anomalyResult.rationale}</div>
                  )}
                  <button onClick={() => applySuggestion(anomalyResult.adjusted_baseline)}
                    style={{ marginTop: 4, padding: "2px 8px", borderRadius: 3, border: "none", background: "var(--accent)", color: "var(--paper)", fontSize: "0.625rem", cursor: "pointer", minHeight: 44 }}>
                    Apply
                  </button>
                </div>
              )}

              {isVariableIncome && !showAdaptiveDetail && (
                <div style={{ background: "var(--paper-2)", border: "1px dashed var(--accent)", borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", lineHeight: 1.4, marginBottom: 8 }}>
                    Your income varies month-to-month. Try proportional budgets instead.
                  </div>
                  <button onClick={() => setShowAdaptiveDetail(true)}
                    style={{ padding: "5px 10px", borderRadius: 4, border: "1px solid var(--accent)", background: "none", color: "var(--accent)", fontSize: "0.6875rem", cursor: "pointer", fontFamily: "inherit", minHeight: 44 }}>
                    Set up adaptive plan
                  </button>
                </div>
              )}

              {adaptiveDetail && (
                <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px" }}>
                  <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 6 }}>Adaptive Plan</div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--ink-2)", marginBottom: 4 }}>
                    Plan type: <strong>{adaptivePlanResult.plan_type}</strong>
                  </div>
                  {adaptivePlanResult.income_profile && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 4 }}>
                      Income: {adaptivePlanResult.income_profile.type} \u00b7 mean {window.formatMoney(adaptivePlanResult.income_profile.mean)}
                      {adaptivePlanResult.income_profile.cv != null && ` \u00b7 CV ${adaptivePlanResult.income_profile.cv.toFixed(2)}`}
                    </div>
                  )}
                  {adaptivePlanResult.essentials && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 2 }}>
                      Essentials: <strong>{window.formatMoney(adaptivePlanResult.essentials.fixed_total)}</strong>
                    </div>
                  )}
                  {adaptivePlanResult.discretionary && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 2 }}>
                      Discretionary: <strong>{adaptivePlanResult.discretionary.total_pct_of_income}%</strong> of income
                    </div>
                  )}
                  {adaptivePlanResult.savings_plan && (
                    <div style={{ fontSize: "0.6875rem", color: "var(--pos)", lineHeight: 1.4 }}>
                      {typeof adaptivePlanResult.savings_plan === "object"
                        ? Object.entries(adaptivePlanResult.savings_plan).map(([k, v]) => (
                            <div key={k} style={{ fontSize: "0.625rem", marginTop: 1 }}>
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
                  <summary style={{ fontSize: "0.625rem", color: "var(--ink-4)", cursor: "pointer", padding: "4px 0" }}>
                    Merchant Reallocations ({merchantSplit.reallocations.length})
                  </summary>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                    {merchantSplit.reallocations.map((r, i) => (
                      <div key={i} style={{ padding: "6px 8px", background: "var(--card)", borderRadius: 4, border: "1px solid var(--line)" }}>
                        <div style={{ fontSize: "0.6875rem", fontWeight: 500, color: "var(--ink)" }}>{r.merchant}</div>
                        <div style={{ fontSize: "0.625rem", color: "var(--ink-3)" }}>
                          {window.formatMoney(r.amount)} \u00b7 {r.from_category} \u2192 {r.to_category}
                        </div>
                        {r.rationale && <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginTop: 1 }}>{r.rationale}</div>}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
          {llmErr && <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", padding: "4px 0" }}>{llmErr}</div>}
          {err && <div style={{ fontSize: "0.75rem", color: "var(--neg)", padding: "6px 10px", background: "var(--neg-soft)", borderRadius: 5 }}>{err}</div>}
        </div>
        <div style={{ padding: "14px 0", borderTop: "1px solid var(--line)", display: "flex", gap: 8 }}>
          {item && !confirming && (
            <Button onClick={() => setConfirming(true)} variant="ghost" style={{ border: "1px solid var(--neg)", color: "var(--neg)" }}>Delete</Button>
          )}
          {item && confirming && (
            <>
              <Button onClick={() => { window.hapticHeavy?.(); del(); }} disabled={saving} style={{ background: "var(--neg)", color: "var(--paper)", border: "none" }}>Confirm Delete</Button>
              <Button onClick={() => setConfirming(false)} variant="ghost">Cancel</Button>
            </>
          )}
          <Button onClick={onClose} variant="ghost" style={{ marginLeft: confirming ? 0 : "auto" }}>Cancel</Button>
          <Button onClick={() => { window.hapticLight?.(); save(); }} disabled={saving} variant="primary">{saving ? "Saving\u2026" : item ? "Save" : "Add Budget"}</Button>
        </div>
    </>
  );

  return isMobile ? (
    <BottomSheet open title={item ? "Edit Budget" : "Add Budget"} onClose={onClose}>
      {formContent}
    </BottomSheet>
  ) : (
    <Modal open title={item ? "Edit Budget" : "Add Budget"} onClose={onClose} width={420}>
      {formContent}
    </Modal>
  );
};

(window as any).SuggestionRow = SuggestionRow;
(window as any).BudgetModal = BudgetModal;
