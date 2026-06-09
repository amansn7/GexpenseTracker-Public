// @ts-nocheck
// Reports — monthly summary table

interface MonthlySummary {
  month: string;
  label: string;
  income: number;
  expenses: number;
  net: number;
  savings_rate: number;
}

interface StatsSectionsResponse {
  monthlySummary?: {
    months: MonthlySummary[];
  };
}

const ReportsView = React.memo(() => {
  const { isMobile } = useViewport();
  const { loading, data, error, retry } = window.useAsync<MonthlySummary[]>(
    () => API.get<StatsSectionsResponse>("/api/stats?sections=monthlySummary")
      .then(d => d.monthlySummary?.months || []),
    []
  );
  const months = data || [];
  const reportsScrollRef = React.useRef(null);
  const { pulling: rPulling, refreshing: rRefreshing, pullY: rPullY, handleTouchStart: rTouchStart, handleTouchMove: rTouchMove, handleTouchEnd: rTouchEnd } = window.usePullToRefresh(retry, { scrollRef: reportsScrollRef });

  const savingsBadge = (rate: number) => {
    const bg = rate >= 20 ? "var(--pos-soft)" : rate >= 10 ? "color-mix(in srgb, var(--amber) 20%, transparent)" : "var(--neg-soft)";
    const ink = rate >= 20 ? "var(--pos)" : rate >= 10 ? "var(--amber)" : "var(--neg)";
    return (
      <span style={{ background: bg, color: ink, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: "'Geist Mono', monospace" }}>
        {rate.toFixed(1)}%
      </span>
    );
  };

  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 500, color: "var(--ink-2)", letterSpacing: "0.01em" };
  const secBody = { padding: "0 28px 32px" };

  if (loading) return (
    <div className="fade-in">
      <div style={{ ...secBand }}>
        <span style={secTitle}>Monthly Summary</span>
      </div>
      <div style={secBody}>
        <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 12, marginTop: 16 }}>
          Monthly Expenses
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
          {[50, 65, 30, 70, 45, 55, 40, 60, 35, 65, 50, 45].map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <Skeleton width="100%" height={h} style={{ borderRadius: "3px 3px 0 0" }} />
              <Skeleton width="100%" height={8} style={{ borderRadius: 2 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  if (error) return (
    <div role="alert" style={{ padding: 28, color: "var(--neg)", fontSize: 13 }}>
        Could not load reports. <button onClick={retry} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
    </div>
  );

  if (!months.length) return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
      No transaction data yet. Sync your Gmail to get started.
    </div>
  );

  const totalIncome = months.reduce((a, m) => a + m.income, 0);
  const totalExpenses = months.reduce((a, m) => a + m.expenses, 0);
  const totalNet = months.reduce((a, m) => a + m.net, 0);
  const avgSavings = months.length ? months.reduce((a, m) => a + m.savings_rate, 0) / months.length : 0;

  const colHdr = { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--line)", background: "var(--paper-2)" };
  const colHdrL = { ...colHdr, textAlign: "left" };
  const cell = (v: number | null, style: Record<string, any> = {}) => ({ padding: "11px 12px", fontSize: 13, fontFamily: "'Geist Mono', monospace", textAlign: "right", borderBottom: "1px solid var(--line)", color: "var(--ink-2)", ...style });

  return (
    <div ref={reportsScrollRef} style={{ overflowY: "auto", overflowX: "hidden", height: isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)", ...(isMobile ? { touchAction: "pan-y" } : {}) }}
      onTouchStart={isMobile ? rTouchStart : undefined}
      onTouchMove={isMobile ? rTouchMove : undefined}
      onTouchEnd={isMobile ? rTouchEnd : undefined}>
      {(rPulling || rRefreshing) && (
        <div style={{
          height: rRefreshing ? 36 : rPullY,
          display: "flex", alignItems: "center",
          justifyContent: "center", gap: 8, fontSize: "0.8125rem", color: "var(--ink-3)",
          flexShrink: 0,
          transition: rPullY === 0 && !rPulling ? "height 0.2s ease" : "none"
        }}>
          {rRefreshing ? (
            <><span className="spinner-sm" /> Refreshing…</>
          ) : (
            <><Icon name={rPullY > 80 ? "refresh" : "arrow-down"}
              style={{ transform: rPullY > 80 ? "rotate(180deg)" : "none",
                       transition: "transform 0.2s ease" }} />
              {rPullY > 80 ? "Release to refresh" : "Pull to refresh"}</>
          )}
        </div>
      )}
    <div className="fade-in">
      <div style={{ ...secBand, ...(isMobile ? { padding: "10px 14px" } : {}) }}>
        <span style={secTitle}>Monthly Summary</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>Last 12 months</span>
      </div>
      <div style={{ ...secBody, ...(isMobile ? { padding: "0 14px 24px" } : {}) }}>
        {/* Monthly Expense Trend Bars */}
        {(() => {
          const maxExpense = Math.max(...months.map(m => m.expenses), 1);
          return (
            <div style={{ marginBottom: 24, marginTop: 16 }}>
              <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 12 }}>
                Monthly Expenses
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
                {months.slice(-12).map(m => {
                  const h = Math.max(4, Math.round((m.expenses / maxExpense) * 72));
                  const isCurrentMonth = m.month === new Date().toISOString().slice(0, 7);
                  return (
                    <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
                      title={`${m.month}: ₹${m.expenses.toLocaleString("en-IN")}`}>
                      <div style={{
                        width: "100%",
                        height: h,
                        background: isCurrentMonth ? "var(--accent)" : "var(--ink-4)",
                        borderRadius: "3px 3px 0 0",
                        opacity: isCurrentMonth ? 1 : 0.5
                      }} />
                      <span style={{ fontSize: 9, color: "var(--ink-4)", whiteSpace: "nowrap" }}>
                        {m.month.slice(5)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 0 }}>
            <thead>
              <tr>
                <th style={colHdrL}>Month</th>
                <th style={colHdr}>Income</th>
                <th style={colHdr}>Expenses</th>
                <th style={colHdr}>Net</th>
                <th style={colHdr}>Savings Rate</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m, i) => (
                <tr key={m.month} className="report-row"
                  style={{ background: i % 2 === 0 ? "var(--card)" : "var(--paper-2)" }}>
                  <td style={{ ...cell(null, {}), textAlign: "left", fontFamily: "'Geist', sans-serif", fontWeight: 500, color: "var(--ink)", fontSize: 14 }}>{m.label}</td>
                  <td style={cell(null, { color: "var(--pos)" })}>{window.formatMoney(m.income)}</td>
                  <td style={cell(null, { color: "var(--neg)" })}>{window.formatMoney(m.expenses)}</td>
                  <td style={cell(null, { color: m.net >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 })}>{window.formatMoney(m.net, { showSign: true })}</td>
                  <td style={{ ...cell(null, {}), textAlign: "right" }}>{savingsBadge(m.savings_rate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--paper-2)", borderTop: "2px solid var(--line)" }}>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Total</td>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist Mono', monospace", fontSize: 13, textAlign: "right", color: "var(--pos)", fontWeight: 600 }}>{window.formatMoney(totalIncome)}</td>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist Mono', monospace", fontSize: 13, textAlign: "right", color: "var(--neg)", fontWeight: 600 }}>{window.formatMoney(totalExpenses)}</td>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist Mono', monospace", fontSize: 13, textAlign: "right", color: totalNet >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>{window.formatMoney(totalNet, true)}</td>
                <td style={{ padding: "12px 12px", textAlign: "right" }}>{savingsBadge(avgSavings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    </div>
  );
});

window.ReportsView = ReportsView;
