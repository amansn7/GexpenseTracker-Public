// Money Flow view — Sankey + weekly timeline

const flowStyles = {
  wrap: { padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100vh - 72px)" },
  kpis: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 28 },
  kpi: { padding: "18px 20px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, minWidth: 0, overflow: "hidden" },
  kpiLabel: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 },
  kpiValue: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  kpiSub: { fontSize: 12, color: "var(--ink-3)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 },
  // Section band system
  secWrap: { marginTop: 28 },
  secHead: { borderRadius: "8px 8px 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  secTitle: { fontSize: 11, fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" },
  secSub: { fontSize: 11, fontFamily: "'Instrument Serif', serif", fontStyle: "italic", color: "var(--paper)", opacity: 0.45 },
  secBody: { background: "var(--card)", border: "1px solid var(--line)", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "20px 16px" },
};

const SankeyDiagram = ({ data }) => {
  const { isMobile } = useViewport();
  const W = 1120, H = 520;
  const LEFT_X = 30, LEFT_W = 160;
  const MID_X = 480, MID_W = 180;
  const RIGHT_X = 910, RIGHT_W = 180;
  const PAD_Y = 40;

  const totalIncome = data.income.reduce((a,i)=>a+i.amount, 0);
  const totalExpense = data.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").reduce((a,e)=>a+e.amount, 0);
  const totalCCPayments = data.expenses.filter(e => e.cat === "card").reduce((a,e)=>a+e.amount, 0);
  const totalInvestments = data.expenses.filter(e => e.cat === "investment").reduce((a,e)=>a+e.amount, 0);
  const savings = totalIncome - totalExpense - totalCCPayments - totalInvestments;
  const USABLE_H = H - PAD_Y * 2;
  const scale = totalIncome > 0 ? USABLE_H / totalIncome : 0;

  // Layout income nodes (left)
  let yi = PAD_Y;
  const incomeNodes = data.income.map(i => {
    const h = Math.max(6, i.amount * scale);
    const node = { ...i, y: yi, h };
    yi += h + 10;
    return node;
  });

  // Hub (middle) — represents total money pool
  const hubH = USABLE_H;
  const hubY = PAD_Y;

  // Right nodes: expenses + CC payments + investments + savings, each proportional
  let yo = PAD_Y;
  const rightNodes = [
    ...data.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").map(e => {
      const h = Math.max(6, e.amount * scale);
      const node = { ...e, y: yo, h, kind: "exp" };
      yo += h + 10;
      return node;
    }),
    ...(totalCCPayments > 0 ? [{
      label: "CC Payments", amount: totalCCPayments, cat: "card",
      y: yo, h: Math.max(6, totalCCPayments * scale), kind: "cc",
    }].map(n => { yo += n.h + 10; return n; }) : []),
    ...(totalInvestments > 0 ? [{
      label: "Investments", amount: totalInvestments, cat: "investment",
      y: yo, h: Math.max(6, totalInvestments * scale), kind: "inv",
    }].map(n => { yo += n.h + 10; return n; }) : []),
    (() => {
      const h = Math.max(6, savings * scale);
      const node = { label: "Remaining", amount: savings, y: yo, h, kind: "sav" };
      yo += h + 10;
      return node;
    })(),
  ];

  // Track offset into hub for incoming / outgoing
  let hubInOff = 0, hubOutOff = 0;

  const buildPath = (x1, y1, h1, x2, y2, h2) => {
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cx2 = x1 + (x2 - x1) * 0.5;
    return `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2} L${x2},${y2+h2} C${cx2},${y2+h2} ${cx1},${y1+h1} ${x1},${y1+h1} Z`;
  };

  return (
    <div style={{ overflowX: isMobile ? "auto" : "visible", WebkitOverflowScrolling: "touch" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", maxHeight: 560, minWidth: isMobile ? 760 : 0 }}>
        <defs>
          <pattern id="diag" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--line)" strokeWidth="1"/>
          </pattern>
        </defs>

        {/* Hub */}
        <rect x={MID_X} y={hubY} width={MID_W} height={hubH} fill="var(--paper-2)" stroke="var(--line)" rx="4"/>
        <text x={MID_X + MID_W/2} y={hubY + hubH/2 - 8} textAnchor="middle" fontFamily="'Fraunces', serif" fontSize="13" fill="var(--ink-3)" letterSpacing="0.08em">TOTAL INFLOW</text>
        <text x={MID_X + MID_W/2} y={hubY + hubH/2 + 18} textAnchor="middle" fontFamily="'Fraunces', serif" fontSize="28" fill="var(--ink)">₹{(totalIncome/1000).toFixed(0)}K</text>

        {/* Income → Hub flows */}
        {incomeNodes.map((n, idx) => {
          const p = buildPath(LEFT_X + LEFT_W, n.y, n.h, MID_X, hubY + hubInOff, n.h);
          hubInOff += n.h + 10;
          return (
            <g key={`in-${idx}`}>
              <path d={p} fill="var(--pos)" fillOpacity="0.18" stroke="none">
                <animate attributeName="fill-opacity" from="0" to="0.18" dur="600ms" fill="freeze"/>
              </path>
            </g>
          );
        })}

        {/* Income nodes */}
        {incomeNodes.map((n, idx) => {
          const pct = totalIncome > 0 ? ((n.amount / totalIncome) * 100).toFixed(1) : "0";
          return (
            <g key={`ni-${idx}`}>
              <rect x={LEFT_X} y={n.y} width={LEFT_W} height={n.h} fill="var(--pos)" fillOpacity="0.88" rx="3"/>
              <text x={LEFT_X + 10} y={n.y + n.h/2 - 2} fontSize="11" fill="white" fontWeight="600" fontFamily="'Geist', sans-serif">{n.label.split(" · ")[0]}</text>
              <text x={LEFT_X + 10} y={n.y + n.h/2 + 14} fontSize="11" fill="white" fontFamily="'Geist Mono', monospace" opacity="0.9">₹{n.amount.toLocaleString("en-IN")} · {pct}%</text>
            </g>
          );
        })}

        {/* Hub → Right flows */}
        {(() => {
          let off = 0;
          return rightNodes.map((n, idx) => {
            const color = n.kind === "sav" ? "var(--pos)" : n.kind === "cc" ? "var(--cat-card-ink)" : n.kind === "inv" ? "var(--cat-investment-ink)" : CategoryService.colorVar(n.cat);
            const p = buildPath(MID_X + MID_W, hubY + off, n.h, RIGHT_X, n.y, n.h);
            off += n.h + 10 * (n.h / n.h);
            return (
              <g key={`out-${idx}`}>
                <title>{n.label} · ₹{n.amount.toLocaleString("en-IN")}</title>
                <path d={p} fill={color} fillOpacity={n.kind === "sav" ? 0.35 : 0.55} stroke="none" style={{ transition: "fill-opacity 200ms" }}
                  onMouseEnter={e=>e.currentTarget.setAttribute("fill-opacity", n.kind==="sav"?0.55:0.8)}
                  onMouseLeave={e=>e.currentTarget.setAttribute("fill-opacity", n.kind==="sav"?0.35:0.55)}
                />
              </g>
            );
          });
        })()}

        {/* Right nodes */}
        {rightNodes.map((n, idx) => {
          const isSav = n.kind === "sav";
          const isCC = n.kind === "cc";
          const isInv = n.kind === "inv";
          const catInfo = (!isSav && !isCC && !isInv) ? CategoryService.display(n.cat) : null;
          const fill = isSav ? "var(--pos)" : isCC ? "var(--cat-card-ink)" : isInv ? "var(--cat-investment-ink)" : CategoryService.colorInk(n.cat);
          const label = isSav ? "Remaining" : isCC ? "CC Payments" : isInv ? "Investments" : catInfo.label;
          return (
            <g key={`nr-${idx}`}>
              <rect x={RIGHT_X} y={n.y} width={RIGHT_W} height={n.h} fill={fill} rx="3"/>
              <text x={RIGHT_X + 12} y={n.y + Math.min(16, n.h/2 + 4)} fontSize="11" fill="white" fontWeight="600" fontFamily="'Geist', sans-serif">
                {label}
              </text>
              {n.h > 26 && (
                <text x={RIGHT_X + 12} y={n.y + n.h/2 + 16} fontSize="11" fill="white" fontFamily="'Geist Mono', monospace" opacity="0.9">
                  ₹{n.amount.toLocaleString("en-IN")}
                </text>
              )}
            </g>
          );
        })}

        {/* column labels */}
        <text x={LEFT_X} y={20} fontSize="10" fill="var(--ink-4)" letterSpacing="0.12em" fontWeight="500">INCOME SOURCES</text>
        <text x={MID_X} y={20} fontSize="10" fill="var(--ink-4)" letterSpacing="0.12em" fontWeight="500">POOL</text>
        <text x={RIGHT_X} y={20} fontSize="10" fill="var(--ink-4)" letterSpacing="0.12em" fontWeight="500">WHERE IT WENT</text>
      </svg>
    </div>
  );
};

const WeeklyBurn = ({ data }) => {
  const max = Math.max(...data.weeklyBurn.map(w => w.spent));
  const { isMobile } = useViewport();
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, alignItems: "end", height: isMobile ? 160 : 200, borderBottom: "1px solid var(--line)", paddingBottom: 12, position: "relative" }}>
        {data.weeklyBurn.map((w, idx) => {
          const pct = max > 0 ? (w.spent / max) * 100 : 0;
          return (
            <div key={idx} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", borderLeft: idx === 0 ? "none" : "1px dashed var(--line)", height: "100%", padding: isMobile ? "0 6px" : "0 20px", position: "relative" }}>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>
                ₹{w.spent.toLocaleString("en-IN")}
              </div>
              <div style={{ width: "100%", maxWidth: 120, background: w.projected ? "url(#diag) var(--paper-2)" : "var(--accent)", opacity: w.projected ? 0.4 : 0.85, height: "100%", borderRadius: "3px 3px 0 0", border: w.projected ? "1px dashed var(--ink-4)" : "none", transform: `scaleY(${Math.max(pct, 2) / 100})`, transformOrigin: "bottom", transition: "transform 400ms cubic-bezier(.2,.8,.2,1)" }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginTop: 10 }}>
        {data.weeklyBurn.map((w, idx) => (
          <div key={idx} style={{ textAlign: "center", fontSize: 11, color: "var(--ink-3)", padding: "0 10px" }}>
            <div style={{ fontWeight: 500, color: w.projected ? "var(--ink-4)" : "var(--ink-2)" }}>{w.week}</div>
            {w.projected && <div style={{ fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: 12, color: "var(--ink-4)" }}>projected</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

const fmtK = (n) => n >= 100000 ? `₹${(n/100000).toFixed(2)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n}`;

const skeleton = (h, w) => (
  <div style={{ height: h, width: w || "100%", background: "var(--paper-2)", borderRadius: 4, animation: "pulse 1.2s infinite" }}/>
);

const FlowView = ({ transactions, categoryFilter }) => {
  const { isMobile, isTablet } = useViewport();
  const todayStr = new Date().toISOString().slice(0, 10);
  var thirtyDaysAgo = DateUtils.getLastNDays(29).from;

  const [rangeFrom, setRangeFrom] = React.useState(thirtyDaysAgo);
  const [rangeTo, setRangeTo] = React.useState(todayStr);
  const [activePreset, setActivePreset] = React.useState("30d");
  const [stats, setStats] = React.useState(null);
  const [catBreakdown, setCatBreakdown] = React.useState(null);
  const [flowLoading, setFlowLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setFlowLoading(true);
      try {
        const dateQP = rangeFrom ? `date_from=${rangeFrom}&date_to=${rangeTo}` : "";
        const catQP = categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : "";
        const [s, c] = await Promise.all([
          API.get(`/api/stats/summary?${dateQP}${catQP}`),
          API.get(`/api/stats/category-breakdown?${dateQP}${catQP}`),
        ]);
        if (!cancelled) { setStats(s); setCatBreakdown(c); }
      } catch (_) {}
      if (!cancelled) setFlowLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [rangeFrom, rangeTo]);

  const rangeTxs = !rangeFrom
    ? transactions.filter(t => !categoryFilter || t.cat === categoryFilter)
    : transactions.filter(t => t.date >= rangeFrom && t.date <= rangeTo && (!categoryFilter || t.cat === categoryFilter));
  const flow = stats && catBreakdown ? buildFlowSummary(rangeTxs, stats, catBreakdown, rangeFrom, rangeTo) : null;

  const totalIncome = flow ? flow.income.reduce((a, i) => a + i.amount, 0) : 0;
  const totalExpense = flow ? flow.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").reduce((a, e) => a + e.amount, 0) : 0;
  const totalCCPayments = flow ? flow.expenses.filter(e => e.cat === "card").reduce((a, e) => a + e.amount, 0) : 0;
  const totalInvestments = flow ? flow.expenses.filter(e => e.cat === "investment").reduce((a, e) => a + e.amount, 0) : 0;
  const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpense - totalCCPayments - totalInvestments) / totalIncome * 100).toFixed(1) : "0.0";
  const rangeDays = Math.max(1, Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1);
  const daily = flow ? Math.round(totalExpense / rangeDays) : 0;
  const incomeSources = flow ? flow.income.length : 0;
  const pctOfIncome = totalIncome > 0 ? Math.round(totalExpense / totalIncome * 100) : 0;

  return (
    <div style={{ ...flowStyles.wrap, ...(isMobile ? { padding: "20px 14px 56px", height: "calc(100dvh - 115px)" } : isTablet ? { padding: "24px 22px 64px" } : {}) }}>
      <div style={{ ...flowStyles.kpis, gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(2, minmax(0, 1fr))" : flowStyles.kpis.gridTemplateColumns, gap: isMobile ? 10 : 12 }}>
        {flowLoading
          ? [["Income", "var(--pos)"], ["Spent", "var(--ink)"], ["Remaining", "var(--pos)"], ["Daily burn", "var(--ink)"]].map(([label, _], i) => (
              <div key={i} style={flowStyles.kpi}>
                <div style={flowStyles.kpiLabel}>{label}</div>
                <div style={{ marginTop: 8 }}>{skeleton(26, "70%")}</div>
                <div style={{ marginTop: 8 }}>{skeleton(12, "40%")}</div>
              </div>
            ))
          : <>
              <div style={flowStyles.kpi}>
                <div style={flowStyles.kpiLabel}>Income</div>
                <div style={{ ...flowStyles.kpiValue, color: "var(--pos)" }} title={`₹${totalIncome.toLocaleString("en-IN")}`}>{fmtK(totalIncome)}</div>
                <div style={flowStyles.kpiSub}><Icon name="trend-u" size={11}/> {incomeSources} source{incomeSources !== 1 ? "s" : ""}</div>
              </div>
              <div style={flowStyles.kpi}>
                <div style={flowStyles.kpiLabel}>Spent</div>
                <div style={flowStyles.kpiValue} title={`₹${totalExpense.toLocaleString("en-IN")}`}>{fmtK(totalExpense)}</div>
                <div style={flowStyles.kpiSub}><Icon name="trend-d" size={11}/> {pctOfIncome}% of income</div>
              </div>
              <div style={flowStyles.kpi}>
                <div style={flowStyles.kpiLabel}>Remaining</div>
                <div style={{ ...flowStyles.kpiValue, color: "var(--pos)" }} title={`₹${(totalIncome - totalExpense - totalCCPayments - totalInvestments).toLocaleString("en-IN")}`}>{fmtK(totalIncome - totalExpense - totalCCPayments - totalInvestments)}</div>
                <div style={flowStyles.kpiSub}>{savingsRate}% savings rate</div>
              </div>
              <div style={flowStyles.kpi}>
                <div style={flowStyles.kpiLabel}>Daily burn</div>
                <div style={flowStyles.kpiValue}>{fmtK(daily)}</div>
                <div style={flowStyles.kpiSub}>over {rangeDays} day{rangeDays !== 1 ? "s" : ""}</div>
              </div>
            </>
        }
      </div>

      <div style={flowStyles.secWrap}>
        <div style={flowStyles.secHead}>
          <span style={flowStyles.secTitle}>How money moved · {rangeTxs.length} emails</span>
        </div>
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderTop: "none", padding: isMobile ? "10px 12px" : "8px 20px", display: "flex", justifyContent: "flex-end", overflowX: "auto" }}>
          <DateRangeControl
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            activePreset={activePreset}
            onChange={(f, t, p) => { setRangeFrom(f); setRangeTo(t); setActivePreset(p); }}
          />
        </div>
        <div style={{ ...flowStyles.secBody, borderRadius: "0 0 8px 8px" }}>
          {flowLoading
            ? <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", gap: 16 }}>{[1,2,3,4,5,6].map(i => <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>{skeleton(12, `${30 + i * 8}%`)}<div style={{ flex: 1 }}>{skeleton(20, "100%")}</div></div>)}</div>
            : flow
              ? <SankeyDiagram data={flow}/>
              : <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>No data for range</div>
          }
        </div>
      </div>

      {!flowLoading && flow && (
        <div style={flowStyles.secWrap}>
          <div style={flowStyles.secHead}>
            <span style={flowStyles.secTitle}>Weekly burn</span>
            <span style={flowStyles.secSub}>when the money actually leaves</span>
          </div>
          <div style={flowStyles.secBody}>
            <WeeklyBurn data={flow}/>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { FlowView });
