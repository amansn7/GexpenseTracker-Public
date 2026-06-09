// @ts-nocheck
// budget-llm-sections.tsx — AI suggestion modals and LLM-powered sections

const { useState, useEffect, useRef, useMemo } = React;

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

const ConfidenceBadge = ({ confidence }) => {
  if (confidence == null) return null;
  const pct = Math.round(confidence * 100);
  const color = pct >= 80 ? "var(--pos)" : pct >= 50 ? "var(--amber)" : "var(--neg)";
  return (
    <span style={{
      fontSize: "0.625rem", fontWeight: 500, padding: "1px 6px", borderRadius: 3,
      background: color + "18", color, border: "1px solid " + color + "30",
    }}>
      {pct}%
    </span>
  );
};

const SuggestAllModal = ({ suggestions, onClose, onApply, loading, error }) => {
  const { isMobile } = useViewport();
  const [appliedSet, setAppliedSet] = useState(new Set());
  const [applyingCategory, setApplyingCategory] = useState(null);

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
      <div style={{ padding: "0 16px 16px", overflowY: "auto" }}>
        {loading ? (
          <ProcessingAnimation message="Generating budget suggestions" subMessage="Analyzing spending history" loading />
        ) : error ? (
          <div style={{ fontSize: "0.75rem", color: "var(--neg)", padding: "10px", background: "var(--neg-soft)", borderRadius: 5 }}>{error}</div>
        ) : suggestions?.budgets?.length ? (
          <div className="stagger-group">
            {suggestions.summary && (
              <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.5 }}>{suggestions.summary}</div>
            )}
            <div style={{ display: "flex", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
              {suggestions.total_budget != null && (
                <div><span style={{ fontSize: "0.625rem", color: "var(--ink-4)", display: "block" }}>Total Budget</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600 }}>{window.formatMoney(suggestions.total_budget)}</span></div>
              )}
              {suggestions.total_income != null && (
                <div><span style={{ fontSize: "0.625rem", color: "var(--ink-4)", display: "block" }}>Total Income</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600 }}>{window.formatMoney(suggestions.total_income)}</span></div>
              )}
              {suggestions.projected_savings != null && (
                <div><span style={{ fontSize: "0.625rem", color: "var(--ink-4)", display: "block" }}>Projected Savings</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600, color: "var(--pos)" }}>{window.formatMoney(suggestions.projected_savings)}</span></div>
              )}
              {suggestions.savings_rate_pct != null && (
                <div><span style={{ fontSize: "0.625rem", color: "var(--ink-4)", display: "block" }}>Savings Rate</span><span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600, color: "var(--pos)" }}>{suggestions.savings_rate_pct}%</span></div>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 4 }}>Suggested Budgets</div>
              {suggestions.budgets.map((b, i) => {
                const isApplied = appliedSet.has(b.category);
                const isApplying = applyingCategory === b.category;
                return (
                <div key={i} style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 12px", opacity: isApplied ? 0.6 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)" }}>{b.category}</span>
                      <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: 2 }}>
                        {window.formatMoney(b.suggested_limit)}
                        {b.current_limit != null && <span style={{ color: "var(--ink-4)" }}> (was {window.formatMoney(b.current_limit)})</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <ConfidenceBadge confidence={b.confidence} />
                      {isApplied ? (
                        <span style={{ fontSize: "0.625rem", color: "var(--pos)", fontWeight: 500 }}>Applied</span>
                      ) : (
                        <button onClick={() => handleApply(b)} disabled={!!applyingCategory} style={{ padding: "3px 12px", borderRadius: 4, border: "1px solid var(--accent)", background: "none", color: "var(--accent)", fontSize: "0.625rem", cursor: applyingCategory ? "default" : "pointer", fontFamily: "inherit", minHeight: 44, opacity: applyingCategory ? 0.5 : 1 }}>
                          {isApplying ? "\u2026" : "Apply"}
                        </button>
                      )}
                    </div>
                  </div>
                  {b.rationale && (
                    <details style={{ marginTop: 6 }}>
                      <summary style={{ fontSize: "0.625rem", color: "var(--ink-4)", cursor: "pointer" }}>Rationale</summary>
                      <p style={{ fontSize: "0.6875rem", color: "var(--ink-3)", margin: "4px 0 0", lineHeight: 1.4 }}>{b.rationale}</p>
                    </details>
                  )}
                </div>
                );
              })}
            </div>
            {pendingCount > 0 && (
            <div style={{ marginTop: 16 }}>
              <Button onClick={handleApplyAll} disabled={!!applyingCategory} variant="primary" style={{ width: "100%", justifyContent: "center" }}>
                {applyingCategory ? "Applying\u2026" : `Apply All (${pendingCount})`}
              </Button>
            </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-3)", fontSize: "0.8125rem" }}>No budget suggestions available.</div>
        )}
      </div>
    </>
  );

  return isMobile ? (
    <BottomSheet open title="AI-Suggested Budget Plan" onClose={onClose}>
      {formContent}
    </BottomSheet>
  ) : (
    <Modal open title="AI-Suggested Budget Plan" onClose={onClose} width={520}>
      {formContent}
    </Modal>
  );
};

const BudgetHealthSection = ({ isMobile, healthCheck, healthLoading, healthError, healthExpanded, healthProcessingDone, onLoadHealthCheck, onToggle, onProcessingDone, onOpenBudget }) => {
  const healthScore = healthCheck?.score;
  const healthColor = healthScore >= 80 ? "var(--pos)" : healthScore >= 50 ? "var(--amber)" : "var(--neg)";
  return (
    <div className="health-card">
      <div className="health-card-header" onClick={onToggle}>
        <span aria-label={healthCheck ? `Health score: ${healthCheck.score} \u2014 ${healthCheck.score_label || ""}` : "Budget health not checked"} className="health-score-badge" style={{
          background: (healthCheck ? healthColor + "18" : "var(--line)"), color: healthCheck ? healthColor : "var(--ink-4)",
          border: "2px solid " + (healthCheck ? healthColor + "40" : "var(--line)"),
        }}>
          {healthCheck?.score != null ? healthCheck.score : "\u2014"}
        </span>
        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>Budget Health</span>
        {healthLoading && <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>Checking\u2026</span>}
        {healthCheck?.score_label && !healthLoading && <span style={{ fontSize: "0.6875rem", color: healthColor, fontWeight: 500 }}>{healthCheck.score_label}</span>}
        {!healthCheck && !healthLoading && !healthError && <span style={{ fontSize: "0.6875rem", color: "var(--accent)", fontWeight: 500 }}>Check</span>}
        {healthError && !healthLoading && <span style={{ fontSize: "0.6875rem", color: "var(--neg)" }}>Failed</span>}
        <span className={"chevron" + (healthExpanded ? " open" : "")}>&#8963;</span>
      </div>
      <div className={"expandable-body" + (healthExpanded ? " open" : "")}>
        <div className="expandable-inner">
        {!healthProcessingDone && (
          <ProcessingAnimation
            message="Checking budget health"
            subMessage="Analyzing spending patterns"
            loading={healthLoading}
            onDone={() => onProcessingDone(true)}
          />
        )}
        {healthProcessingDone && healthError && (
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>
            Health check unavailable. <button onClick={onLoadHealthCheck} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline", fontFamily: "inherit", minHeight: 44 }}>Retry</button>
          </div>
        )}
        {healthProcessingDone && healthCheck && (
            <div className="stagger-group">{healthCheck.issues?.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div className="section-label">Issues</div>
                {healthCheck.issues.map((issue, i) => (
                  <div key={i} className="health-issue" style={{ '--i': i }}>
                    <span className="health-issue-icon">{issue.severity === "critical" ? <Icon name="x" size={12} stroke="var(--neg)"/> : <Icon name="info" size={12} stroke="var(--amber)"/>}</span>
                    <div className="health-issue-content">
                      <div className="health-issue-category">{issue.category}</div>
                      <div className="health-issue-message">{issue.message}</div>
                      {issue.action && (
                        <button onClick={() => onOpenBudget(issue.category)}
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
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.6875rem", color: "var(--pos)", '--i': (healthCheck.issues?.length || 0) + i }}>
                    <Icon name="check" size={12} stroke="var(--pos)"/> {p.category}: {p.message}
                  </div>
                ))}
              </div>
            )}
            {healthCheck.projection && (
              <div style={{ display: "flex", flexDirection: "column", gap: 2, '--i': (healthCheck.issues?.length || 0) + (healthCheck.praise?.length || 0) }}>
                <div className="section-label">Projection</div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-2)" }}>
                  Month-end spend: {window.formatMoney(healthCheck.projection.month_end_spend)}
                  {healthCheck.projection.vs_budget != null && (
                    <span style={{ color: healthCheck.projection.vs_budget > 0 ? "var(--neg)" : "var(--pos)", marginLeft: 4 }}>
                      ({healthCheck.projection.vs_budget > 0 ? "+" : ""}{window.formatMoney(healthCheck.projection.vs_budget)} vs budget)
                    </span>
                  )}
                </div>
                {healthCheck.projection.concern && (
                  <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>{healthCheck.projection.concern}</div>
                )}
              </div>
            )}
            {healthCheck.goal_impact && typeof healthCheck.goal_impact === "object" && (
              <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", display: "flex", flexDirection: "column", gap: 4, '--i': (healthCheck.issues?.length || 0) + (healthCheck.praise?.length || 0) + 1 }}>
                <span style={{ fontWeight: 500 }}>Goal impact</span>
                {Object.entries(healthCheck.goal_impact).map(([goal, msg]) => (
                  <div key={goal} style={{ padding: "4px 6px", background: "var(--paper-2)", borderRadius: 4, fontSize: "0.6875rem", lineHeight: 1.4 }}>
                    <strong>{goal}</strong>: {typeof msg === "object" ? (msg.message || msg.threat || JSON.stringify(msg)) : msg}
                  </div>
                ))}
              </div>
            )}
          </div>)}
        </div>
      </div>
    </div>
  );
};

const BudgetGoalSection = ({ isMobile, goalOptimize, goalLoading, goalError, goalExpanded, goalProcessingDone, onLoadGoalOptimize, onSetExpanded, onProcessingDone, onOpenBudget }) => {
  return (
    <>
      {!goalProcessingDone && (
        <ProcessingAnimation
          message="Analyzing goals"
          subMessage="Optimizing budget allocation"
          loading={goalLoading}
          onDone={() => onProcessingDone(true)}
        />
      )}
      {goalProcessingDone && goalError && (
        <div style={{ margin: "12px 28px", ...(isMobile ? { margin: "12px 14px" } : {}), padding: "8px 16px", fontSize: "0.75rem", color: "var(--neg)", background: "var(--neg-soft)", borderRadius: 6 }}>
          {goalError} <button onClick={onLoadGoalOptimize} style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: "0.75rem", textDecoration: "underline", fontFamily: "inherit", minHeight: 44, marginLeft: 8 }}>Retry</button>
        </div>
      )}
      {goalProcessingDone && goalOptimize && (
        <div style={{ margin: "12px 28px 12px", ...(isMobile ? { margin: "12px 14px" } : {}), border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
          <div onClick={() => onSetExpanded(h => !h)} className="health-card-header">
            <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>Goal Optimization</span>
            {goalOptimize.total_savings_found != null && (
              <span style={{ fontSize: "0.6875rem", color: "var(--pos)", fontWeight: 500 }}>Found {window.formatMoney(goalOptimize.total_savings_found)}</span>
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
                        {g.on_track ? <Icon name="check" size={12} stroke="var(--pos)"/> : <Icon name="info" size={12} stroke="var(--amber)"/>}
                        <span style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>{g.goal_name}</span>
                        <span style={{ fontSize: "0.6875rem", color: g.on_track ? "var(--pos)" : "var(--neg)" }}>
                          {g.on_track ? "On track" : "Off track"}
                        </span>
                      </div>
                      {g.required_monthly != null && (
                        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 }}>
                          Required monthly: {window.formatMoney(g.required_monthly)}
                          {g.suggestion && <span style={{ marginLeft: 4 }}>\u00b7 {g.suggestion}</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {goalOptimize.adjustments?.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, '--i': (goalOptimize.goal_analysis?.length || 0) }}>
                  <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Suggested Adjustments</div>
                  {goalOptimize.adjustments.map((adj, i) => (
                    <div key={i} style={{ padding: "8px 10px", background: "var(--paper-2)", borderRadius: 4, border: "1px solid var(--line)", '--i': (goalOptimize.goal_analysis?.length || 0) + 1 + i }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>{adj.category}</div>
                          <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>
                            {window.formatMoney(adj.current_limit)} \u2192 {window.formatMoney(adj.suggested_limit)}
                            {adj.savings > 0 && <span style={{ color: "var(--pos)", marginLeft: 4 }}>(save {window.formatMoney(adj.savings)})</span>}
                          </div>
                          {adj.rationale && <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginTop: 1 }}>{adj.rationale}</div>}
                        </div>
                        <button onClick={() => onOpenBudget(adj.category)}
                          style={{ padding: "3px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "none", color: "var(--accent)", fontSize: "0.625rem", cursor: "pointer", flexShrink: 0, fontFamily: "inherit", minHeight: 44 }}>
                          Adjust
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {goalOptimize.remaining_shortfall != null && (
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", '--i': (goalOptimize.goal_analysis?.length || 0) + (goalOptimize.adjustments?.length || 0) + 1 }}>
                  Remaining shortfall: <strong>{window.formatMoney(goalOptimize.remaining_shortfall)}</strong>
                </div>
              )}
              {goalOptimize.recommendation && (
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-2)", padding: "6px 8px", background: "var(--paper-2)", borderRadius: 4, border: "1px solid var(--line)", lineHeight: 1.4, '--i': (goalOptimize.goal_analysis?.length || 0) + (goalOptimize.adjustments?.length || 0) + 2 }}>
                  {goalOptimize.recommendation}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

(window as any).ProcessingAnimation = ProcessingAnimation;
(window as any).ConfidenceBadge = ConfidenceBadge;
(window as any).SuggestAllModal = SuggestAllModal;
(window as any).BudgetHealthSection = BudgetHealthSection;
(window as any).BudgetGoalSection = BudgetGoalSection;
