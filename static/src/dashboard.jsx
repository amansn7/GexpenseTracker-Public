// Dashboard — minimal monthly summary

const dashStyles = {
  wrap: { padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)", maxWidth: 1300, margin: "0 auto" },
  hero: { padding: "36px 40px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 24, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40, alignItems: "center" },
  heroLabel: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, marginBottom: 6 },
  heroAmount: { fontFamily: "'Geist Mono', monospace", fontSize: 72, fontWeight: 400, letterSpacing: "-0.035em", lineHeight: 1, margin: "4px 0 8px" },
  heroSub: { fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: 16, color: "var(--ink-3)" },
  barSplit: { display: "flex", height: 12, borderRadius: 20, overflow: "hidden", border: "1px solid var(--line)", background: "var(--paper-2)", marginTop: 12 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 },
  card: { padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 },
  cardH: { fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" },
  cardBig: { fontFamily: "'Geist Mono', monospace", fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1 },
  grid2: { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 },
  // Section band system — editorial dark header + card body
  secHead: { borderRadius: "8px 8px 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  secTitle: { fontSize: 11, fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" },
  secSub: { fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "var(--paper)", opacity: 0.4 },
  secBody: { background: "var(--card)", border: "1px solid var(--line)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "20px" },
  // Category card grid
  catGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))", gap: 10 },
  catCard: { padding: "14px 16px", background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)" },
};

const DashboardView = ({ transactions, categoryFilter, dateRange, setDateRange }) => {
  var { isMobile, isTablet } = useViewport();
  var todayStr = new Date().toISOString().slice(0, 10);
  const [activePreset, setActivePreset] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [catBreakdown, setCatBreakdown] = React.useState(null);
  const [topMerchants, setTopMerchants] = React.useState([]);
  const [compareStats, setCompareStats] = React.useState(null);
  const [statsLoading, setStatsLoading] = React.useState(false);
  const [budgets, setBudgets] = React.useState([]);
  const [health, setHealth] = React.useState(null);

  React.useEffect(() => {
    API.get("/api/budgets").then(d => setBudgets(d.budgets || [])).catch(() => {});
    API.get("/api/stats/health?months=6").then(d => setHealth(d)).catch(() => {});
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setStatsLoading(true);
      try {
        const dateQP = (dateRange.from && dateRange.to) ? `date_from=${dateRange.from}&date_to=${dateRange.to}` : "";
        const catQP = categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : "";
        const [s, c, tm] = await Promise.all([
          API.get(`/api/stats/summary?${dateQP}${catQP}`),
          API.get(`/api/stats/category-breakdown?${dateQP}${catQP}`),
          API.get(`/api/stats/top-merchants?${dateQP}`),
        ]);
        if (!cancelled) { setStats(s); setCatBreakdown(c); setTopMerchants(tm.merchants || []); }
      } catch (_) {}
      if (!cancelled) setStatsLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dateRange.from, dateRange.to]);

  // Compare stats for previous equivalent period
  React.useEffect(() => {
    if (!dateRange.from || !dateRange.to) { setCompareStats(null); return; }
    const rangeMs = new Date(dateRange.to) - new Date(dateRange.from);
    const prevFrom = new Date(new Date(dateRange.from).getTime() - rangeMs - 1).toISOString().slice(0, 10);
    const prevTo = new Date(new Date(dateRange.from).getTime() - 1).toISOString().slice(0, 10);
    API.get(`/api/stats/summary?date_from=${prevFrom}&date_to=${prevTo}`)
      .then(d => setCompareStats(d))
      .catch(() => {});
  }, [dateRange.from, dateRange.to]);

  // Filter transactions to selected range for client-side charts
  const rangeTxs = !dateRange.from
    ? transactions.filter(t => !categoryFilter || t.cat === categoryFilter)
    : transactions.filter(t => t.date >= dateRange.from && t.date <= dateRange.to && (!categoryFilter || t.cat === categoryFilter));
  const totalIncome = stats?.total_income ?? 0;
  const totalExpense = stats?.total_expenses ?? 0;
  const totalCCPayments = stats?.total_cc_payments ?? 0;
  const totalInvestments = stats?.total_investments ?? 0;
  const remaining = totalIncome - totalExpense - totalCCPayments - totalInvestments;
  const cashOutflow = totalExpense + totalCCPayments + totalInvestments;
  const pctSpent = totalIncome > 0 ? (cashOutflow / totalIncome) * 100 : 0;
  const rangeDays = Math.max(1, Math.round((new Date(dateRange.to) - new Date(dateRange.from)) / 86400000) + 1);
  const daily = Math.round(totalExpense / rangeDays);
  const subsTotal = rangeTxs.filter(t=>t.tag==="subscription").reduce((a,t)=>a+Math.abs(t.amount),0);
  const subsCount = rangeTxs.filter(t=>t.tag==="subscription").length;
  const unread = transactions.filter(t=>!t.read).length;
  const flagged = transactions.filter(t=>t.conf<0.7).length;

  const deltaPct = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };
  const prevExpense = compareStats?.total_expenses ?? null;
  const prevIncome = compareStats?.total_income ?? null;
  const expDelta = deltaPct(totalExpense, prevExpense);
  const incDelta = deltaPct(totalIncome, prevIncome);
  const prevNeedsReview = compareStats?.needs_review_count ?? null;
  const attentionDelta = prevNeedsReview != null ? (unread + flagged) - prevNeedsReview : null;
  const midpoint = new Date((new Date(dateRange.from).getTime() + new Date(dateRange.to).getTime()) / 2).toISOString().slice(0, 10);
  const firstHalf = rangeTxs.filter(t => t.date < midpoint && t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const secondHalf = rangeTxs.filter(t => t.date >= midpoint && t.amount < 0).reduce((a, t) => a + Math.abs(t.amount), 0);
  const burnTrend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf * 100).toFixed(1) : null;

  // Chart dates array for the selected range
  const chartDates = !dateRange.from
    ? []
    : (() => {
        const dates = [];
        for (let d = new Date(dateRange.from); d <= new Date(dateRange.to); d.setDate(d.getDate() + 1)) {
          dates.push(d.toISOString().slice(0, 10));
        }
        return dates;
      })();
  const cumulative = [];
  let running = 0;
  const dailyIncomeSeries = [];
  const dailyExpenseSeries = [];
  for (const dateStr of chartDates) {
    const dayExp = rangeTxs.filter(t=>t.date===dateStr && t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);
    const dayInc = rangeTxs.filter(t=>t.date===dateStr && t.amount>0).reduce((a,t)=>a+t.amount,0);
    running += dayInc - dayExp;
    cumulative.push({ d: dateStr, val: running, isPast: dateStr <= todayStr });
    dailyIncomeSeries.push(dayInc);
    dailyExpenseSeries.push(dayExp);
  }
  const sparklineDays = Math.min(dailyExpenseSeries.length, 14);
  const sparkIncome = dailyIncomeSeries.slice(-sparklineDays);
  const sparkExpense = dailyExpenseSeries.slice(-sparklineDays);

  const catSorted = (catBreakdown?.categories || []).map(c => ({
    cat: normCat(c.category, false),
    amount: c.amount,
  })).sort((a,b) => b.amount - a.amount);

  return (
    <div style={{ ...dashStyles.wrap, ...(isMobile ? { padding: "20px 14px 56px", height: "calc(100dvh - 115px)" } : isTablet ? { padding: "24px 22px 64px" } : {}) }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>{dateRange.from} → {dateRange.to} · Snapshot</div>
          <h2 style={{ fontFamily: "'Geist', sans-serif", fontSize: isMobile ? 28 : 36, fontWeight: 400, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            You're <span className="italic-serif" style={{ color: "var(--pos)" }}>₹{remaining.toLocaleString("en-IN")}</span> ahead.
          </h2>
        </div>
      </div>

      {/* Date range controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
        <DateRangeControl
          rangeFrom={dateRange.from}
          rangeTo={dateRange.to}
          activePreset={activePreset}
          onChange={(f, t, p) => { setDateRange({ from: f, to: t }); setActivePreset(p); }}
        />
        {statsLoading && <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>Loading…</span>}
      </div>

      <div className="view-enter" style={{ ...dashStyles.hero, ...(isMobile ? { padding: 18, gridTemplateColumns: "1fr", gap: 22, borderRadius: 8 } : isTablet ? { gridTemplateColumns: "1fr", gap: 28 } : {}) }}>
        <div>
          <div style={dashStyles.heroLabel}>Net position · selected range</div>
          <div style={{ ...dashStyles.heroAmount, ...(isMobile ? { fontSize: 44 } : {}), color: "var(--pos)" }}>₹{remaining.toLocaleString("en-IN")}</div>
          <div style={dashStyles.heroSub}>
            after ₹{totalExpense.toLocaleString("en-IN")} in expenses{expDelta != null && <span style={{ color: "var(--neg)", marginLeft: 4, fontSize: 13 }}>↑{Math.abs(expDelta)}% vs prev</span>}
            {totalCCPayments > 0 && <span> · ₹{totalCCPayments.toLocaleString("en-IN")} in CC payments</span>}
            {totalInvestments > 0 && <span> · ₹{totalInvestments.toLocaleString("en-IN")} invested</span>}
            · {(100-pctSpent).toFixed(0)}% saved so far
          </div>
          <div style={dashStyles.barSplit} title={`${pctSpent.toFixed(0)}% spent`}>
            <div style={{ width: `${(totalExpense / (totalIncome || 1)) * 100}%`, background: "var(--accent)" }} />
          {totalCCPayments > 0 && <div style={{ width: `${(totalCCPayments / (totalIncome || 1)) * 100}%`, background: "var(--cat-card-ink)" }} />}
          {totalInvestments > 0 && <div style={{ width: `${(totalInvestments / (totalIncome || 1)) * 100}%`, background: "var(--cat-investment-ink)" }} />}
          <div style={{ width: `${(remaining / (totalIncome || 1)) * 100}%`, background: "var(--pos)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace", flexWrap: "wrap", gap: "4px 12px" }}>
            <span>Expenses ₹{totalExpense.toLocaleString("en-IN")}{expDelta != null && <span style={{ color: "var(--neg)", marginLeft: 4 }}>↑{Math.abs(expDelta)}%</span>}</span>
            {totalCCPayments > 0 && <span>CC ₹{totalCCPayments.toLocaleString("en-IN")}</span>}
            {totalInvestments > 0 && <span>Invest ₹{totalInvestments.toLocaleString("en-IN")}</span>}
            <span>Income ₹{totalIncome.toLocaleString("en-IN")}{incDelta != null && <span style={{ color: "var(--pos)", marginLeft: 4 }}>↑{Math.abs(incDelta)}%</span>}</span>
            <span>Saved ₹{remaining.toLocaleString("en-IN")}</span>
          </div>
        </div>

        {/* Cumulative balance line chart */}
        <div>
          <div style={dashStyles.heroLabel}>Balance over time</div>
          <svg width="100%" height="180" viewBox="0 0 420 180" preserveAspectRatio="none" style={{ marginTop: 10 }}>
            {(() => {
              const maxV = Math.max(...cumulative.map(c=>c.val));
              const minV = Math.min(0, ...cumulative.map(c=>c.val));
              const range = maxV - minV || 1;
              const toX = idx => chartDates.length > 1 ? (idx / (chartDates.length - 1)) * 400 + 10 : 210;
              const toY = v => 170 - ((v - minV)/range)*150;
              const indexedCumulative = cumulative.map((c, i) => ({ ...c, idx: i }));
              const pastPts = indexedCumulative.filter(c => c.isPast);
              const futPts  = indexedCumulative.filter(c => !c.isPast);
              const pathPast = pastPts.map((c,i) => `${i===0?"M":"L"}${toX(c.idx)},${toY(c.val)}`).join(" ");
              const areaPast = pastPts.length ? pathPast + ` L${toX(pastPts[pastPts.length-1].idx)},170 L${toX(pastPts[0].idx)},170 Z` : "";
              const pathFut  = pastPts.length && futPts.length ? `M${toX(pastPts[pastPts.length-1].idx)},${toY(pastPts[pastPts.length-1].val)} ` + futPts.map(c=>`L${toX(c.idx)},${toY(c.val)}`).join(" ") : "";
              const todayIdx = indexedCumulative.findIndex(c => c.d === todayStr);
              const todayPt  = todayIdx >= 0 ? indexedCumulative[todayIdx] : null;
              return (
                <>
                  <line x1="10" y1={toY(0)} x2="410" y2={toY(0)} stroke="var(--line)" strokeDasharray="2 3"/>
                  <path d={areaPast} fill="var(--pos)" fillOpacity="0.12"/>
                  <path d={pathPast} fill="none" stroke="var(--pos)" strokeWidth="2" strokeLinecap="round"/>
                  <path d={pathFut} fill="none" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3"/>
                  {todayPt && (
                    <>
                      <circle cx={toX(todayPt.idx)} cy={toY(todayPt.val)} r="4" fill="var(--pos)" stroke="var(--card)" strokeWidth="2"/>
                      <text x={toX(todayPt.idx)} y={toY(todayPt.val)-10} fontSize="10" fill="var(--ink-2)" textAnchor="middle" fontFamily="'Geist Mono', monospace">Today</text>
                    </>
                  )}
                </>
              );
            })()}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginTop: -6, paddingLeft: 10, paddingRight: 10 }}>
            <span>{dateRange.from}</span><span>{dateRange.to}</span>
          </div>
        </div>
      </div>

      {/* Net worth section */}
      {health && (
        <div className="anim-row-spring" style={{"--i": 3, marginBottom: 24 }}>
          <div style={dashStyles.secHead}>
            <span style={dashStyles.secTitle}>Net worth</span>
            <span style={dashStyles.secSub}>{health.balance_mode === "anchored" ? "anchored" : "computed"}</span>
          </div>
          <div style={{ ...dashStyles.secBody, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "12px 24px" }}>
            <div>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 36, fontWeight: 400, letterSpacing: "-0.025em", color: health.current_balance >= 0 ? "var(--pos)" : "var(--neg)" }}>
                ₹{health.current_balance.toLocaleString("en-IN")}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>
                {health.starting_balance != null && <span>Starting balance ₹{health.starting_balance.toLocaleString("en-IN")} · </span>}
                {health.runway_months != null && <span>{health.runway_months} months runway</span>}
              </div>
            </div>
            <div style={{ display: "flex", gap: 24, fontSize: 12, fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>
              <div><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>Savings rate</div><div style={{ fontSize: 18, color: "var(--pos)", marginTop: 2 }}>{health.savings_rate}%</div></div>
              <div><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>CC total</div><div style={{ fontSize: 18, marginTop: 2 }}>₹{health.total_cc_payments?.toLocaleString("en-IN") || "0"}</div></div>
              <div><div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)" }}>Invested</div><div style={{ fontSize: 18, color: "var(--cat-investment-ink)", marginTop: 2 }}>₹{health.total_investments?.toLocaleString("en-IN") || "0"}</div></div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "2fr 1fr", gap: 14, marginBottom: 24 }}>
        <div className="anim-row-spring" style={{"--i": 0, ...dashStyles.card, ...(isMobile ? {} : { gridRow: "span 2" }) }}>
          <div style={dashStyles.cardH}><span>Daily burn</span><Icon name="bolt" size={12} stroke="var(--accent)"/></div>
          <div style={dashStyles.cardBig}>₹{daily.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            at this pace, <span style={{ color: "var(--ink)", fontWeight: 500 }}>₹{(daily*30).toLocaleString("en-IN")}</span>/month
            {burnTrend != null && <span style={{ color: burnTrend > 0 ? "var(--neg)" : "var(--pos)", marginLeft: 6 }}>{burnTrend > 0 ? "↑" : "↓"} {Math.abs(burnTrend)}%</span>}
          </div>
          {sparkExpense.length > 1 && (
            <svg width="100%" height="36" viewBox="0 0 200 36" preserveAspectRatio="none" style={{ marginTop: 10 }}>
              {(() => {
                const maxV = Math.max(...sparkExpense, ...sparkIncome, 1);
                const barW = 200 / sparkExpense.length;
                return sparkExpense.map((exp, i) => {
                  const inc = sparkIncome[i] || 0;
                  const expH = (exp / maxV) * 30;
                  const incH = (inc / maxV) * 30;
                  const x = i * barW;
                  return (
                    <g key={i}>
                      <rect x={x + 1} y={30 - expH} width={barW - 2} height={expH} fill="var(--accent)" rx="1" opacity="0.7"/>
                      {inc > 0 && <rect x={x + 1} y={30 - expH - incH} width={barW - 2} height={incH} fill="var(--pos)" rx="1" opacity="0.5"/>}
                    </g>
                  );
                });
              })()}
            </svg>
          )}
        </div>
        <div className="anim-row-spring" style={{"--i": 1, ...dashStyles.card}}>
          <div style={dashStyles.cardH}><span>Subscriptions</span><span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-4)" }}>{subsCount}</span></div>
          <div style={dashStyles.cardBig}>₹{subsTotal.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            Netflix, Spotify, iCloud+ … <span onClick={() => window._goRecurring && window._goRecurring()} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>review recurring</span>
          </div>
        </div>
        <div className="anim-row-spring" style={{"--i": 2, ...dashStyles.card}}>
          <div style={dashStyles.cardH}><span>Needs attention</span><Icon name="sparkle" size={12} stroke="var(--accent)"/></div>
          <div style={dashStyles.cardBig}>{unread + flagged}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            {unread} unread · {flagged} low-confidence
            {attentionDelta != null && <span style={{ color: attentionDelta > 0 ? "var(--neg)" : "var(--pos)", marginLeft: 4 }}>{attentionDelta > 0 ? "+" : ""}{attentionDelta} vs prev</span>}
          </div>
        </div>
      </div>

      <div style={{ ...dashStyles.grid2, gridTemplateColumns: isTablet ? "1fr" : dashStyles.grid2.gridTemplateColumns }}>
        {/* Category breakdown — banded section + card grid */}
        <div className="anim-row-spring" style={{"--i": 4}}>
          <div style={dashStyles.secHead}>
            <span style={dashStyles.secTitle}>Where money went</span>
            <span style={dashStyles.secSub}>₹{totalExpense.toLocaleString("en-IN")} total</span>
          </div>
          <div style={dashStyles.secBody}>
            {catSorted.length === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)" }}>No data for range</div>
              : <div style={dashStyles.catGrid}>
                  {catSorted.filter(c => c.cat !== "card" && c.cat !== "investment").map((e, idx) => {
                    const pct = totalExpense > 0 ? (e.amount / totalExpense) * 100 : 0;
                    const c = CategoryService.display(e.cat);
                    return (
                      <div key={idx} style={dashStyles.catCard}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: `1px solid ${c.ink}33`, flexShrink: 0 }}/>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", lineHeight: 1.2 }}>{c.label}</span>
                        </div>
                        <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                          ₹{e.amount.toLocaleString("en-IN")}
                        </div>
                          <div style={{ background: "var(--line)", height: 3, borderRadius: 10, overflow: "hidden", margin: "8px 0 4px" }}>
                            <div style={{ width: "100%", height: "100%", background: c.ink, borderRadius: 10, transition: "transform 400ms cubic-bezier(.2,.8,.2,1)", transform: `scaleX(${pct / 100})`, transformOrigin: "left" }}/>
                        </div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{pct.toFixed(0)}% of spend</div>
                      </div>
                    );
                  })}
                </div>
            }
          </div>
        </div>

        {/* Investments & CC Payments panel */}
        <div>
          <div style={dashStyles.secHead}>
            <span style={dashStyles.secTitle}>Investments & CC</span>
            <span style={dashStyles.secSub}>₹{(totalInvestments + totalCCPayments).toLocaleString("en-IN")}</span>
          </div>
          <div style={dashStyles.secBody}>
            {totalInvestments === 0 && totalCCPayments === 0
              ? <div style={{ fontSize: 12, color: "var(--ink-4)" }}>No investments or CC payments in range</div>
              : <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {totalInvestments > 0 && (
                    <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--cat-investment)", border: "1px solid var(--cat-investment-ink)33", flexShrink: 0 }}/>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Investments</span>
                      </div>
                      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 22, fontWeight: 600, color: "var(--pos)", letterSpacing: "-0.02em" }}>
                        ₹{totalInvestments.toLocaleString("en-IN")}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginTop: 4 }}>
                        {totalIncome > 0 ? ((totalInvestments / totalIncome) * 100).toFixed(1) : 0}% of income
                      </div>
                    </div>
                  )}
                  {totalCCPayments > 0 && (
                    <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--cat-card)", border: "1px solid var(--cat-card-ink)33", flexShrink: 0 }}/>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>CC Payments</span>
                        <span
                          title="Credit card payments you made to pay off your card balance. These are transfers from your bank to your CC account, not new expenses."
                          style={{ fontSize: 11, color: "var(--ink-4)", cursor: "help", marginLeft: 2 }}
                        >
                          ⓘ
                        </span>
                      </div>
                      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 22, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em" }}>
                        ₹{totalCCPayments.toLocaleString("en-IN")}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginTop: 4 }}>
                        {totalIncome > 0 ? ((totalCCPayments / totalIncome) * 100).toFixed(1) : 0}% of income
                      </div>
                    </div>
                  )}
                </div>
            }
          </div>
        </div>

        {/* Top merchants — banded section */}
        <div className="anim-row-spring" style={{"--i": 5}}>
          <div style={dashStyles.secHead}>
            <span style={dashStyles.secTitle}>Top merchants</span>
          </div>
          <div style={dashStyles.secBody}>
          {statsLoading
            ? <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{[1,2,3].map(i => <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}><div style={{ width: 24, height: 24, borderRadius: 6, background: "var(--paper-2)", animation: "pulse 1.2s infinite" }}/><div style={{ flex: 1 }}><div style={{ height: 12, width: `${40 + i * 15}%`, background: "var(--paper-2)", borderRadius: 3, animation: "pulse 1.2s infinite" }}/><div style={{ height: 4, width: "100%", background: "var(--paper-2)", borderRadius: 3, marginTop: 6, animation: "pulse 1.2s infinite" }}/></div><div style={{ height: 12, width: 60, background: "var(--paper-2)", borderRadius: 3, animation: "pulse 1.2s infinite" }}/></div>)}</div>
            : topMerchants.length === 0
            ? <div style={{ fontSize: 12, color: "var(--ink-4)" }}>No data for range</div>
            : (() => {
              const maxAmt = topMerchants[0].amount;
              return topMerchants.map((m, i) => (
                <div key={m.merchant || i} className="anim-row" style={{"--i": i, display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < topMerchants.length - 1 ? "1px dashed var(--line)" : "none"}}>
                  <MerchantLogo merchant={m.merchant} size={24}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{m.merchant}</div>
                    <div style={{ background: "var(--paper-2)", height: 4, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                      <div style={{ width: `${(m.amount/maxAmt)*100}%`, height: "100%", background: "var(--accent)", opacity: 0.7 }}/>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, fontWeight: 600 }}>₹{m.amount.toLocaleString("en-IN")}</div>
                </div>
              ));
            })()
          }
          </div>
        </div>
      </div>

      {/* Budget section */}
      <div className="anim-row-spring" style={{"--i": 6, marginTop: 16 }}>
        <div style={dashStyles.secHead}>
          <span style={dashStyles.secTitle}>Budgets · this month</span>
          <span style={dashStyles.secSub}>{budgets.length} tracked</span>
        </div>
        <div style={dashStyles.secBody}>
          {budgets.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--ink-4)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic" }}>
              No budgets set — <span onClick={() => window._goBudgets && window._goBudgets()} style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }}>add one in Budgets</span> to track monthly limits per category.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
              {budgets.map(b => {
                const over = b.over_budget;
                const pct = Math.min(b.pct, 100);
                const barColor = over ? "var(--neg)" : b.pct >= 80 ? "var(--accent)" : "var(--pos)";
                return (
                  <div key={b.id} style={{ padding: "14px 16px", background: over ? "var(--neg-soft)" : "var(--paper-2)", borderRadius: 8, border: `1px solid ${over ? "var(--neg)" : "var(--line)"}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{b.category}</span>
                      <span style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace", fontWeight: 600, padding: "2px 6px", background: over ? "var(--neg)" : "var(--line)", color: over ? "white" : "var(--ink-2)", borderRadius: 4 }}>
                        {b.pct.toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ background: "var(--line)", height: 6, borderRadius: 10, overflow: "hidden", marginBottom: 8 }}>
                      <div style={{ width: "100%", height: "100%", background: barColor, borderRadius: 10, transition: "transform 400ms cubic-bezier(.2,.8,.2,1)", transform: `scaleX(${pct / 100})`, transformOrigin: "left" }}/>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>
                      <span>₹{b.spent_this_month.toLocaleString("en-IN")} spent</span>
                      <span>₹{b.monthly_limit.toLocaleString("en-IN")} limit</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { DashboardView });
