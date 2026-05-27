// Money Flow view — Sankey + weekly timeline

const flowStyles = {
  wrap: { padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)" },
  kpis: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 28 },
  kpi: { padding: "18px 20px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", minWidth: 0, overflow: "hidden" },
  kpiLabel: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 },
  kpiValue: { fontFamily: "'Geist Mono', monospace", fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  kpiSub: { fontSize: 12, color: "var(--ink-3)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 },
  secWrap: { marginTop: 28 },
  secHead: { borderRadius: "var(--r) var(--r) 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  secTitle: { fontSize: 11, fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" },
  secSub: { fontSize: 11, fontFamily: "'Instrument Serif', serif", fontStyle: "italic", color: "var(--paper)", opacity: 0.45 },
  secBody: { background: "var(--card)", border: "1px solid var(--line)", borderTop: "none", borderRadius: "0 0 var(--r) var(--r)", padding: "20px 16px" },
};

const fmtK = (n) => n >= 100000 ? `₹${(n/100000).toFixed(2)}L` : n >= 1000 ? `₹${(n/1000).toFixed(1)}K` : `₹${n}`;

const TxnTooltip = ({ tip, style }) => {
  if (!tip) return null;
  return (
    <div className="fade-in" style={{
      position: "fixed", zIndex: 9999, pointerEvents: "none",
      background: "var(--ink)", color: "var(--paper)", borderRadius: 8,
      padding: "10px 14px", fontSize: 12, lineHeight: 1.5,
      boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
      maxWidth: 260,
      left: style.left, top: style.top,
      transform: "translate(-50%, -100%)",
      marginTop: -10,
    }}>
      <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{tip.label}</div>
      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 15, color: tip.color || "var(--paper)", marginBottom: 6 }}>
        {tip.amount}
      </div>
      {tip.txnCount != null && (
        <div style={{ color: "var(--ink-4)", fontSize: 11 }}>
          {tip.txnCount} transaction{tip.txnCount !== 1 ? "s" : ""}
          {tip.pct != null ? ` · ${tip.pct}% of total` : ""}
        </div>
      )}
      {tip.merchants && tip.merchants.length > 0 && (
        <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6 }}>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 3 }}>Top merchants</div>
          {tip.merchants.map((m, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ink-3)" }}>
              <span>{m.name}</span>
              <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--paper)" }}>{fmtK(m.amount)}</span>
            </div>
          ))}
        </div>
      )}
      {tip.committed != null && (
        <div style={{ marginTop: 6, borderTop: "1px solid rgba(255,255,255,0.1)", paddingTop: 6, fontSize: 11 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-4)" }}>Committed</span>
            <span style={{ fontFamily: "'Geist Mono', monospace" }}>{tip.committed}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-4)" }}>Free to spend</span>
            <span style={{ fontFamily: "'Geist Mono', monospace" }}>{tip.free}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const SankeyDiagram = ({ data, viewMode, txnCounts, topMerchants, budgetMap, onCategoryClick }) => {
  const { isMobile } = useViewport();
  const [tip, setTip] = React.useState(null);
  const [tipPos, setTipPos] = React.useState({ left: 0, top: 0 });
  const svgRef = React.useRef(null);
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

  const poolTotal = Math.max(totalIncome, totalExpense + totalCCPayments + totalInvestments, 1);
  const scale = USABLE_H / poolTotal;
  const hasIncome = totalIncome > 0;
  const hasExpenses = totalExpense + totalCCPayments + totalInvestments > 0;

  let yi = PAD_Y;
  const incomeNodes = data.income.map(i => {
    const h = Math.max(6, i.amount * scale);
    const node = { ...i, y: yi, h };
    yi += h + 10;
    return node;
  });

  const incomeRatio = hasIncome ? totalIncome / poolTotal : 0;
  const hubH = Math.max(USABLE_H * incomeRatio, hasExpenses && !hasIncome ? USABLE_H : 60);
  const hubY = PAD_Y + (USABLE_H - hubH) / 2;

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
      txnCount: txnCounts?.card || 0, topMerchants: [],
    }].map(n => { yo += n.h + 10; return n; }) : []),
    ...(totalInvestments > 0 ? [{
      label: "Investments", amount: totalInvestments, cat: "investment",
      y: yo, h: Math.max(6, totalInvestments * scale), kind: "inv",
      txnCount: txnCounts?.investment || 0, topMerchants: [],
    }].map(n => { yo += n.h + 10; return n; }) : []),
    (() => {
      const h = Math.max(6, Math.abs(savings) * scale);
      const isOverspend = savings < 0 && viewMode === "overspend";
      const node = { label: isOverspend ? "Overspend" : "Remaining", amount: savings, y: yo, h, kind: "sav" };
      yo += h + 10;
      return node;
    })(),
  ];

  let hubInOff = 0;
  const totalRightHeight = rightNodes.reduce((sum, n) => sum + n.h, 0) + (rightNodes.length - 1) * 10;
  const flowY = hubY + Math.max(0, hubH - totalRightHeight);

  const buildPath = (x1, y1, h1, x2, y2, h2) => {
    const cx1 = x1 + (x2 - x1) * 0.5;
    const cx2 = x1 + (x2 - x1) * 0.5;
    return `M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2} L${x2},${y2+h2} C${cx2},${y2+h2} ${cx1},${y1+h1} ${x1},${y1+h1} Z`;
  };

  const hubLabel = hasIncome ? "TOTAL INFLOW" : "OUTFLOW";
  const hubAmount = hasIncome ? totalIncome : totalExpense + totalCCPayments + totalInvestments;

  const showTooltip = (e, content) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTip(content);
    setTipPos({ left: e.clientX, top: e.clientY - 8 });
  };
  const hideTooltip = () => setTip(null);

  const handleClick = (cat) => {
    if (onCategoryClick) onCategoryClick(cat);
  };

  if (isMobile) {
    const isOverspend = savings < 0 && viewMode === "overspend";
    const incomeItems = data.income.map(i => ({ ...i, kind: "inc" }));
    const expenseItems = [
      ...data.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").map(e => ({ ...e, kind: "exp" })),
      ...(totalCCPayments > 0 ? [{ label: "CC Payments", amount: totalCCPayments, cat: "card", kind: "cc", txnCount: 0 }] : []),
      ...(totalInvestments > 0 ? [{ label: "Investments", amount: totalInvestments, cat: "investment", kind: "inv", txnCount: 0 }] : []),
      { label: isOverspend ? "Overspend" : "Remaining", amount: Math.abs(savings), cat: "sav", kind: "sav", txnCount: 0 },
    ];
    const maxInc = incomeItems.length > 0 ? Math.max(...incomeItems.map(i => i.amount)) : 0;
    const maxExp = Math.max(...expenseItems.map(e => e.amount), 1);
    return (
      <div style={{ padding: "0 0 12px" }}>
        {incomeItems.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 8 }}>Income</div>
            {incomeItems.map((i, idx) => {
              const pct = maxInc > 0 ? (i.amount / maxInc) * 100 : 0;
              return (
                <div key={idx} onClick={() => handleClick("__income__")} style={{ cursor: "pointer", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ color: "var(--ink-2)", fontWeight: 500 }}>{i.label}</span>
                    <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "var(--pos)" }}>{fmtK(i.amount)}</span>
                  </div>
                  <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${pct}%`, background: "var(--pos)", borderRadius: 3, opacity: 0.7, transition: "width 300ms ease" }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 8 }}>Spending</div>
        {expenseItems.map((e, idx) => {
          const pct = (e.amount / maxExp) * 100;
          const catColor = e.kind === "sav" ? (savings < 0 && viewMode === "overspend" ? "var(--neg)" : "var(--pos)")
            : e.kind === "cc" ? "var(--cat-card-ink)"
            : e.kind === "inv" ? "var(--cat-investment-ink)"
            : e.kind === "exp" ? CategoryService.colorInk(e.cat)
            : "var(--ink-3)";
          return (
            <div key={idx} onClick={() => e.kind !== "sav" && handleClick(e.cat === "sav" ? null : e.cat === "__income__" ? "income" : e.cat)}
              style={{ cursor: e.kind === "sav" ? "default" : "pointer", marginBottom: 6, opacity: e.kind === "sav" ? 0.7 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                <span style={{ color: "var(--ink-2)", fontWeight: e.kind === "sav" ? 600 : 400 }}>
                  {e.label}
                  {e.txnCount > 0 && <span style={{ color: "var(--ink-4)", fontSize: 10, marginLeft: 4 }}>({e.txnCount})</span>}
                </span>
                <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, color: e.kind === "sav" ? (isOverspend ? "var(--neg)" : "var(--pos)") : "var(--neg)" }}>{fmtK(e.amount)}</span>
              </div>
              <div style={{ height: 6, background: "var(--line)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.max(2, pct)}%`, background: catColor, borderRadius: 3, opacity: e.kind === "sav" ? 0.5 : 0.7, transition: "width 300ms ease" }}/>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ overflowX: "visible", position: "relative" }}>
      <TxnTooltip tip={tip} style={tipPos} />
      <svg ref={svgRef} width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", maxHeight: 560 }}>
        <defs>
          <pattern id="diag" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--line)" strokeWidth="1"/>
          </pattern>
        </defs>

        {/* Hub — informative pool column */}
        <rect x={MID_X} y={hubY} width={MID_W} height={hubH} fill="var(--paper-2)" stroke="var(--line)" rx="4"/>
        <text x={MID_X + MID_W/2} y={hubY + 28} textAnchor="middle" fontFamily="'Geist', sans-serif" fontSize="12" fill="var(--ink-3)" letterSpacing="0.08em">{hubLabel}</text>
        <text x={MID_X + MID_W/2} y={hubY + 56} textAnchor="middle" fontFamily="'Geist Mono', monospace" fontSize="26" fill="var(--ink)">{fmtK(hubAmount)}</text>
        {hasIncome && hasExpenses && (() => {
          const usedPct = Math.min(100, Math.round((totalExpense / totalIncome) * 100));
          const barH = 6;
          const barW = MID_W - 32;
          const barY = hubY + 74;
          return (
            <g>
              <text x={MID_X + MID_W/2} y={barY + 14} textAnchor="middle" fontFamily="'Geist', sans-serif" fontSize="10" fill="var(--ink-4)">
                {usedPct}% of income spent
              </text>
              <rect x={MID_X + 16} y={barY + 22} width={barW} height={barH} rx={3} fill="var(--line)"/>
              <rect x={MID_X + 16} y={barY + 22} width={Math.max(barH, (barW * usedPct) / 100)} height={barH} rx={3} fill={usedPct > 80 ? "var(--neg)" : usedPct > 60 ? "var(--accent)" : "var(--pos)"} opacity="0.8"/>
            </g>
          );
        })()}
        {hasIncome && hasExpenses && (() => {
          const committed = (totalCCPayments + totalInvestments);
          const free = totalIncome - totalExpense - committed;
          const detailsY = hubY + hubH - 50;
          return (
            <g>
              <text x={MID_X + 16} y={detailsY} fontFamily="'Geist', sans-serif" fontSize="9" fill="var(--ink-4)" letterSpacing="0.06em">
                COMMITTED
              </text>
              <text x={MID_X + MID_W - 16} y={detailsY} textAnchor="end" fontFamily="'Geist Mono', monospace" fontSize="11" fill="var(--ink-3)">
                {fmtK(committed)}
              </text>
              <text x={MID_X + 16} y={detailsY + 18} fontFamily="'Geist', sans-serif" fontSize="9" fill="var(--ink-4)" letterSpacing="0.06em">
                FREE TO SPEND
              </text>
              <text x={MID_X + MID_W - 16} y={detailsY + 18} textAnchor="end" fontFamily="'Geist Mono', monospace" fontSize="11" fill={free > 0 ? "var(--pos)" : "var(--neg)"}>
                {fmtK(Math.max(0, free))}
              </text>
            </g>
          );
        })()}

        {/* Income → Hub flows */}
        {hasIncome && incomeNodes.map((n, idx) => {
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
        {hasIncome && incomeNodes.map((n, idx) => {
          const pct = totalIncome > 0 ? ((n.amount / totalIncome) * 100).toFixed(1) : "0";
          const tipContent = {
            label: n.label, amount: fmtK(n.amount), color: "var(--pos)",
            pct, txnCount: 1,
          };
          return (
            <g key={`ni-${idx}`}>
              <rect x={LEFT_X} y={n.y} width={LEFT_W} height={n.h} fill="var(--pos)" fillOpacity="0.88" rx="3"
                style={{ cursor: "pointer", transition: "filter 120ms" }}
                onClick={() => handleClick("__income__")}
                onMouseEnter={(e) => showTooltip(e, tipContent)}
                onMouseMove={(e) => setTipPos({ left: e.clientX, top: e.clientY - 8 })}
                onMouseLeave={hideTooltip}
              />
              <text x={LEFT_X + 10} y={n.y + n.h/2 - 2} fontSize="12" fill="white" fontWeight="600" fontFamily="'Geist', sans-serif">{n.label.split(" · ")[0]}</text>
              <text x={LEFT_X + 10} y={n.y + n.h/2 + 14} fontSize="12" fill="white" fontFamily="'Geist Mono', monospace" opacity="0.9">{fmtK(n.amount)} · {pct}%</text>
            </g>
          );
        })}

        {/* Hub → Right flows */}
        {(() => {
          let off = 0;
          return rightNodes.map((n, idx) => {
            const flowColor = n.kind === "sav"
              ? (savings < 0 && viewMode === "overspend" ? "var(--neg)" : "var(--pos)")
              : n.kind === "cc" ? "var(--cat-card-ink)"
              : n.kind === "inv" ? "var(--cat-investment-ink)"
              : CategoryService.colorVar(n.cat);
            const flowOpacity = n.kind === "sav" ? (savings < 0 && viewMode === "overspend" ? 0.4 : 0.35) : 0.55;
            const p = buildPath(MID_X + MID_W, flowY + off, n.h, RIGHT_X, n.y, n.h);
            off += n.h + 10;
            return (
              <g key={`out-${idx}`} style={{ animation: "fadeSlideUp 300ms var(--ease-out-expo) both", animationDelay: `${idx * 40}ms` }}>
                <path d={p} fill={flowColor} fillOpacity={flowOpacity} stroke="none" className="sankey-flow" data-kind={n.kind === "sav" ? "sav" : "exp"}/>
              </g>
            );
          });
        })()}

        {/* Right nodes */}
        {rightNodes.map((n, idx) => {
          const isSav = n.kind === "sav";
          const isCC = n.kind === "cc";
          const isInv = n.kind === "inv";
          const canClick = !isSav;
          const catInfo = (!isSav && !isCC && !isInv) ? CategoryService.display(n.cat) : null;
          const fill = isSav
            ? (n.amount < 0 && viewMode === "overspend" ? "var(--neg)" : "var(--pos)")
            : isCC ? "var(--cat-card-ink)"
            : isInv ? "var(--cat-investment-ink)"
            : CategoryService.colorInk(n.cat);
          const label = isSav
            ? (n.amount < 0 && viewMode === "overspend" ? "Overspend" : "Remaining")
            : isCC ? "CC Payments"
            : isInv ? "Investments"
            : catInfo.label;
          const textFill = isSav ? "white" : "var(--ink)";
          const clickCat = isSav ? null : isCC ? "card" : isInv ? "investment" : n.cat;
          const total = isSav ? totalIncome : (totalExpense + totalCCPayments + totalInvestments);
          const pct = total > 0 ? ((Math.abs(n.amount) / total) * 100).toFixed(1) : "0";
          const txnCount = n.txnCount || 0;
          const topM = n.topMerchants || [];
          const budgetInfo = !isSav && budgetMap ? budgetMap[clickCat] : null;
          const tipContent = isSav ? null : {
            label, amount: fmtK(n.amount), txnCount, pct,
            merchants: topM,
            color: isCC ? "var(--cat-card)" : isInv ? "var(--cat-investment)" : CategoryService.colorVar(n.cat),
          };

          return (
            <g key={`nr-${idx}`}>
              <rect x={RIGHT_X} y={n.y} width={RIGHT_W} height={n.h} fill={fill} rx="3"
                style={{
                  cursor: canClick ? "pointer" : "default",
                  transition: "filter 120ms",
                }}
                onClick={() => canClick && handleClick(clickCat)}
                onMouseEnter={(e) => tipContent && showTooltip(e, tipContent)}
                onMouseMove={(e) => tipContent && setTipPos({ left: e.clientX, top: e.clientY - 8 })}
                onMouseLeave={hideTooltip}
              />
              <text x={RIGHT_X + 12} y={n.y + Math.min(16, n.h/2 + 4)} fontSize="12" fill={textFill} fontWeight="600" fontFamily="'Geist', sans-serif">
                {label}
              </text>
              {n.h > 16 && (
                <text x={RIGHT_X + 12} y={n.y + n.h/2 + 14} fontSize="11" fill={textFill} fontFamily="'Geist Mono', monospace" opacity="0.9">
                  {fmtK(n.amount)}
                </text>
              )}
              {n.h > 16 && txnCount > 0 && (
                <text x={RIGHT_X + 12} y={n.y + n.h/2 + 28} fontSize="10" fill={textFill} fontFamily="'Geist', sans-serif" opacity="0.7">
                  {txnCount} txn
                </text>
              )}
              {budgetInfo && n.h > 20 && (
                <g>
                  <rect x={RIGHT_X + 4} y={n.y + n.h - 8} width={RIGHT_W - 8} height={4} rx={2} fill="rgba(0,0,0,0.15)"/>
                  <rect x={RIGHT_X + 4} y={n.y + n.h - 8} width={Math.min(1, budgetInfo.pct / 100) * (RIGHT_W - 8)} height={4} rx={2} fill={budgetInfo.over_budget ? "var(--neg)" : "var(--pos)"} opacity="0.8"/>
                </g>
              )}
            </g>
          );
        })}

        {/* column labels */}
        {hasIncome && <text x={LEFT_X} y={20} fontSize="10" fill="var(--ink-4)" letterSpacing="0.12em" fontWeight="500">INCOME SOURCES</text>}
        {!hasIncome && <text x={LEFT_X} y={20} fontSize="10" fill="var(--ink-4)" letterSpacing="0.12em" fontWeight="500" opacity="0.4">—</text>}
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
            <div key={idx} className="anim-row" style={{"--i": idx, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", borderLeft: idx === 0 ? "none" : "1px dashed var(--line)", height: "100%", padding: isMobile ? "0 6px" : "0 20px", position: "relative" }}>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>
                {fmtK(w.spent)}
              </div>
              <div style={{ width: "100%", maxWidth: 120, background: w.projected ? "url(#diag) var(--paper-2)" : "var(--accent)", opacity: w.projected ? 0.4 : 0.85, height: "100%", borderRadius: "3px 3px 0 0", border: w.projected ? "1px dashed var(--ink-4)" : "none", transform: `scaleY(${Math.max(pct, 2) / 100})`, transformOrigin: "bottom", transition: `transform 400ms cubic-bezier(.2,.8,.2,1) ${idx * 60}ms` }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginTop: 10 }}>
        {data.weeklyBurn.map((w, idx) => (
          <div key={idx} className="anim-row" style={{"--i": idx, textAlign: "center", fontSize: 11, color: "var(--ink-3)", padding: "0 10px" }}>
            <div style={{ fontWeight: 500, color: w.projected ? "var(--ink-4)" : "var(--ink-2)" }}>{w.week}</div>
            {w.projected && <div style={{ fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: 12, color: "var(--ink-4)" }}>projected</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

const skeleton = (h, w) => (
  <div style={{ height: h, width: w || "100%", background: "var(--paper-2)", borderRadius: 4, animation: "pulse 1.2s infinite" }}/>
);

const FlowView = ({ transactions, categoryFilter, onNavigateToView, onSetCategoryFilter, onSetFilter }) => {
  const { isMobile, isTablet } = useViewport();
  const todayStr = new Date().toISOString().slice(0, 10);
  const thirtyDaysAgo = DateUtils.getLastNDays(29).from;

  const [rangeFrom, setRangeFrom] = React.useState(thirtyDaysAgo);
  const [rangeTo, setRangeTo] = React.useState(todayStr);
  const [activePreset, setActivePreset] = React.useState("30d");
  const [stats, setStats] = React.useState(null);
  const [catBreakdown, setCatBreakdown] = React.useState(null);
  const [flowLoading, setFlowLoading] = React.useState(false);
  const [flowError, setFlowError] = React.useState(null);
  const [retryKey, setRetryKey] = React.useState(0);
  const [viewMode, setViewMode] = React.useState("remaining");
  const [compareStats, setCompareStats] = React.useState(null);
  const [budgets, setBudgets] = React.useState([]);
  const [drillCategory, setDrillCategory] = React.useState(null);
  const [drillTxns, setDrillTxns] = React.useState([]);
  const [drillLoading, setDrillLoading] = React.useState(false);

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
      } catch (e) {
        if (!cancelled) setFlowError(e.message || "Failed to load");
      }
      if (!cancelled) setFlowLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [rangeFrom, rangeTo, categoryFilter, retryKey]);

  // Compare stats for previous equivalent period
  React.useEffect(() => {
    if (!rangeFrom || !rangeTo) { setCompareStats(null); return; }
    const rangeMs = new Date(rangeTo) - new Date(rangeFrom);
    const prevFrom = new Date(new Date(rangeFrom).getTime() - rangeMs - 1).toISOString().slice(0, 10);
    const prevTo = new Date(new Date(rangeFrom).getTime() - 1).toISOString().slice(0, 10);
    API.get(`/api/stats/summary?date_from=${prevFrom}&date_to=${prevTo}`)
      .then(d => setCompareStats(d))
      .catch(() => {});
  }, [rangeFrom, rangeTo]);

  // Budgets: only when range aligns with current month
  const firstOfMonth = todayStr.slice(0, 7) + "-01";
  const isCurrentMonth = rangeFrom === firstOfMonth && rangeTo === todayStr;
  React.useEffect(() => {
    if (isCurrentMonth) {
      API.get("/api/budgets").then(d => setBudgets(d.budgets || [])).catch(() => {});
    } else {
      setBudgets([]);
    }
  }, [isCurrentMonth]);

  // Fetch transactions for drill-down modal
  React.useEffect(() => {
    if (!drillCategory) { setDrillTxns([]); return; }
    let cancelled = false;
    setDrillLoading(true);
    const qp = `category=${encodeURIComponent(drillCategory)}&date_from=${rangeFrom}&date_to=${rangeTo}&limit=200`;
    API.get(`/api/transactions?${qp}`)
      .then(d => { if (!cancelled) setDrillTxns(d.items || []); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDrillLoading(false); });
    return () => { cancelled = true; };
  }, [drillCategory, rangeFrom, rangeTo]);

  const rangeTxs = !rangeFrom
    ? transactions.filter(t => !categoryFilter || t.cat === categoryFilter)
    : transactions.filter(t => t.date >= rangeFrom && t.date <= rangeTo && (!categoryFilter || t.cat === categoryFilter));
  const flow = stats && catBreakdown ? buildFlowSummary(rangeTxs, stats, catBreakdown, rangeFrom, rangeTo) : null;

  const totalIncome = flow ? flow.income.reduce((a, i) => a + i.amount, 0) : 0;
  const totalExpense = flow ? flow.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").reduce((a, e) => a + e.amount, 0) : 0;
  const totalCCPayments = flow ? flow.expenses.filter(e => e.cat === "card").reduce((a, e) => a + e.amount, 0) : 0;
  const totalInvestments = flow ? flow.expenses.filter(e => e.cat === "investment").reduce((a, e) => a + e.amount, 0) : 0;
  const savings = totalIncome - totalExpense - totalCCPayments - totalInvestments;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome * 100).toFixed(1) : "0.0";
  const rangeDays = Math.max(1, Math.round((new Date(rangeTo) - new Date(rangeFrom)) / 86400000) + 1);
  const daily = flow ? Math.round(totalExpense / rangeDays) : 0;
  const incomeSources = flow ? flow.income.length : 0;
  const pctOfIncome = totalIncome > 0 ? Math.round(totalExpense / totalIncome * 100) : 0;

  const deltaPct = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };
  const prevExpense = compareStats?.total_expenses ?? null;
  const prevIncome = compareStats?.total_income ?? null;
  const prevSavings = compareStats?.saved ?? null;
  const expDelta = deltaPct(totalExpense, prevExpense);
  const incDelta = deltaPct(totalIncome, prevIncome);
  const savDelta = deltaPct(savings, prevSavings);
  const budgetMap = Object.fromEntries((budgets || []).map(b => [b.category, b]));
  const isBadUp = viewMode === "overspend" && savings < 0;
  const savUp = savDelta != null && parseFloat(savDelta) >= 0;

  const handleCategoryClick = (cat) => {
    if (!cat || cat === "__income__") {
      if (!onNavigateToView) return;
      if (onSetCategoryFilter) onSetCategoryFilter(cat === "__income__" ? "income" : cat);
      if (onSetFilter) onSetFilter(cat === "__income__" ? "all" : "all");
      onNavigateToView("inbox");
      return;
    }
    setDrillCategory(cat);
  };

  const txnCountMap = {};
  const topMerchantMap = {};
  if (flow) {
    for (const e of flow.expenses) {
      txnCountMap[e.cat] = e.txnCount || 0;
      topMerchantMap[e.cat] = e.topMerchants || [];
    }
  }

  return (
    <div className="view-enter" style={{ ...flowStyles.wrap, ...(isMobile ? { padding: "20px 14px 56px", height: "calc(100dvh - 115px)" } : isTablet ? { padding: "24px 22px 64px" } : {}) }}>
      {flowError && (
        <div className="flow-error" style={{ padding: "10px 16px", background: "var(--neg-soft)", border: "1px solid var(--neg)", borderRadius: "var(--r)", marginBottom: 16, fontSize: 13, color: "var(--neg)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Couldn't load flow data. <span style={{ cursor: "pointer", textDecoration: "underline", fontWeight: 600 }} onClick={() => setRetryKey(k => k + 1)}>Retry</span></span>
          <button onClick={() => setFlowError(null)} style={{ background: "none", border: "none", color: "var(--neg)", cursor: "pointer", fontWeight: 600, fontSize: 12 }}>Dismiss</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr" : "3fr 2fr", gap: 14, marginBottom: 28 }}>
        {flowLoading
          ? <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[["Remaining", "var(--pos)"], ["Income", "var(--pos)"]].map(([label, _], i) => (
                  <div key={i} style={flowStyles.kpi}>
                    <div style={flowStyles.kpiLabel}>{label}</div>
                    <div style={{ marginTop: 8 }}>{skeleton(26, "70%")}</div>
                    <div style={{ marginTop: 8 }}>{skeleton(12, "40%")}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                {[["Spent", "var(--ink)"], ["Daily burn", "var(--ink)"]].map(([label, _], i) => (
                  <div key={i} style={flowStyles.kpi}>
                    <div style={flowStyles.kpiLabel}>{label}</div>
                    <div style={{ marginTop: 8 }}>{skeleton(26, "70%")}</div>
                    <div style={{ marginTop: 8 }}>{skeleton(12, "40%")}</div>
                  </div>
                ))}
              </div>
            </>
          : <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="anim-row-spring" style={{"--i": 0, ...flowStyles.kpi}}>
                  <div style={flowStyles.kpiLabel}>{viewMode === "overspend" && savings < 0 ? "Overspend" : "Remaining"}</div>
                  <div style={{ ...flowStyles.kpiValue, color: viewMode === "overspend" && savings < 0 ? "var(--neg)" : "var(--pos)" }} title={`₹${savings.toLocaleString("en-IN")}`}>{fmtK(savings)}</div>
                  <div style={flowStyles.kpiSub}>{viewMode === "overspend" && savings < 0 ? `${Math.abs(parseFloat(savingsRate))}% overspend` : `${savingsRate}% savings rate`}{savDelta != null && <span style={{color: savUp !== isBadUp ? "var(--pos)" : "var(--neg)", marginLeft: 4, fontSize: 11}}>{savUp ? "↑" : "↓"}{Math.abs(savDelta)}%</span>}</div>
                </div>
                <div className="anim-row-spring" style={{"--i": 1, ...flowStyles.kpi}}>
                  <div style={flowStyles.kpiLabel}>Income</div>
                  <div style={{ ...flowStyles.kpiValue, color: "var(--pos)" }} title={`₹${totalIncome.toLocaleString("en-IN")}`}>{fmtK(totalIncome)}</div>
                  <div style={flowStyles.kpiSub}><Icon name="trend-u" size={11}/> {incomeSources} source{incomeSources !== 1 ? "s" : ""}{incDelta != null && <span style={{color: parseFloat(incDelta) >= 0 ? "var(--pos)" : "var(--neg)", marginLeft: 4, fontSize: 11}}>{parseFloat(incDelta) >= 0 ? "↑" : "↓"}{Math.abs(incDelta)}%</span>}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div className="anim-row-spring" style={{"--i": 0, ...flowStyles.kpi}}>
                  <div style={flowStyles.kpiLabel}>Spent</div>
                  <div style={flowStyles.kpiValue} title={`₹${totalExpense.toLocaleString("en-IN")}`}>{fmtK(totalExpense)}</div>
                  <div style={flowStyles.kpiSub}><Icon name="trend-d" size={11}/> {pctOfIncome}% of income{expDelta != null && <span style={{color: parseFloat(expDelta) >= 0 ? "var(--neg)" : "var(--pos)", marginLeft: 4, fontSize: 11}}>{parseFloat(expDelta) >= 0 ? "↑" : "↓"}{Math.abs(expDelta)}%</span>}</div>
                </div>
                <div className="anim-row-spring" style={{"--i": 1, ...flowStyles.kpi}}>
                  <div style={flowStyles.kpiLabel}>Daily burn</div>
                  <div style={flowStyles.kpiValue}>{fmtK(daily)}</div>
                  <div style={flowStyles.kpiSub}>over {rangeDays} day{rangeDays !== 1 ? "s" : ""}{expDelta != null && <span style={{fontSize: 11, color: "var(--ink-3)", marginLeft: 4}}>vs prev {parseFloat(expDelta) >= 0 ? "↑" : "↓"}{Math.abs(expDelta)}%</span>}</div>
                </div>
              </div>
            </>
        }
      </div>

      <div style={flowStyles.secWrap}>
        <div style={flowStyles.secHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={flowStyles.secTitle}>How money moved · {rangeTxs.length} emails</span>
            {savings < 0 && (
              <div style={{ display: "flex", gap: 0, background: "rgba(255,255,255,0.1)", borderRadius: 4, padding: 2 }}>
                <button onClick={() => setViewMode("remaining")} style={{
                  padding: "3px 8px", fontSize: 10, fontWeight: 500, lineHeight: 1, fontFamily: "'Geist', sans-serif",
                  background: viewMode === "remaining" ? "var(--paper)" : "transparent",
                  color: viewMode === "remaining" ? "var(--ink)" : "var(--paper)",
                  border: "none", borderRadius: 3, cursor: "pointer", transition: "all 120ms"
                }}>Remaining</button>
                <button onClick={() => setViewMode("overspend")} style={{
                  padding: "3px 8px", fontSize: 10, fontWeight: 500, lineHeight: 1, fontFamily: "'Geist', sans-serif",
                  background: viewMode === "overspend" ? "var(--paper)" : "transparent",
                  color: viewMode === "overspend" ? "var(--ink)" : "var(--paper)",
                  border: "none", borderRadius: 3, cursor: "pointer", transition: "all 120ms"
                }}>Overspend</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderTop: "none", padding: isMobile ? "10px 12px" : "8px 20px", display: "flex", justifyContent: "flex-end", overflowX: "auto" }}>
          <DateRangeControl
            rangeFrom={rangeFrom}
            rangeTo={rangeTo}
            activePreset={activePreset}
            onChange={(f, t, p) => { setRangeFrom(f); setRangeTo(t); setActivePreset(p); }}
          />
        </div>
        <div style={{ ...flowStyles.secBody }}>
          {flowLoading
            ? <div style={{ padding: "40px 20px", display: "flex", flexDirection: "column", gap: 16 }}>{[1,2,3,4,5,6].map(i => <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>{skeleton(12, `${30 + i * 8}%`)}<div style={{ flex: 1 }}>{skeleton(20, "100%")}</div></div>)}</div>
            : flow
              ? <>
                  <SankeyDiagram data={flow} viewMode={viewMode} txnCounts={txnCountMap} topMerchants={topMerchantMap} budgetMap={budgetMap} onCategoryClick={handleCategoryClick}/>
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Timeline</span>
                      {flow.weeklyBurn.map((w, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: w.projected ? "var(--ink-4)" : "var(--accent)", opacity: w.projected ? 0.3 : 1 }}/>
                          {i < flow.weeklyBurn.length - 1 && <div style={{ width: 12, height: 1, background: "var(--line)" }}/>}
                        </div>
                      ))}
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 4 }}>
                        {(() => {
                          const now = new Date();
                          const activeIdx = flow.weeklyBurn.findIndex(w => !w.projected && new Date(w.week.match(/W\d · (.+)/)?.[1]?.split("–")[0] || "") <= now);
                          return activeIdx >= 0 ? `${flow.weeklyBurn.filter(w => !w.projected).length} of ${flow.weeklyBurn.length} weeks` : "";
                        })()}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {(() => {
                        const sr = totalIncome > 0 ? ((totalIncome - totalExpense - totalCCPayments - totalInvestments) / totalIncome * 100).toFixed(1) : "0.0";
                        const topCat = flow.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").sort((a, b) => b.amount - a.amount)[0];
                        return [
                          { label: "Saved", value: `${sr}%`, color: "var(--pos)" },
                          { label: "Daily", value: fmtK(daily), color: "var(--ink)" },
                          { label: "Top", value: topCat ? (CategoryService.display(topCat.cat).label || topCat.cat) : "—", color: "var(--accent)" },
                        ].map((pill, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "var(--paper-2)", borderRadius: 6, fontSize: 11, whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>{pill.label}</span>
                            <span style={{ color: pill.color, fontWeight: 600, fontFamily: "'Geist Mono', monospace" }}>{pill.value}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>Weekly burn</span>
                      <span style={{ fontSize: 11, fontFamily: "'Instrument Serif', serif", fontStyle: "italic", color: "var(--ink-4)", opacity: 0.6 }}>when the money actually leaves</span>
                    </div>
                    <WeeklyBurn data={flow}/>
                  </div>
                </>
              : <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>┄</div>
                  <div style={{ color: "var(--ink-3)", fontSize: 13, fontWeight: 500 }}>No transactions in this range</div>
                  <div style={{ color: "var(--ink-4)", fontSize: 12, marginTop: 4 }}>
                    Try a wider date range or sync your inbox
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center" }}>
                    <button onClick={() => { setActivePreset("3m"); setRangeFrom(DateUtils.getLastNDays(89).from); setRangeTo(todayStr); }}
                      style={{ padding: "6px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>Last 3 months</button>
                    <button onClick={() => { setActivePreset("1y"); setRangeFrom(DateUtils.getLastNDays(364).from); setRangeTo(todayStr); }}
                      style={{ padding: "6px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>Last year</button>
                  </div>
                </div>
          }
        </div>
      </div>

      {drillCategory && (
        <div style={{position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16}}
          onClick={() => setDrillCategory(null)}>
          <div style={{background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px -16px var(--shadow-lg)"}}
            onClick={e => e.stopPropagation()}>
            <div style={{padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", flexShrink: 0}}>
              <span style={{fontSize: 12, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)"}}>
                {CategoryService.display(drillCategory).label}
              </span>
              <span style={{marginLeft: 12, fontSize: 12, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace"}}>
                {(() => {
                  const c = catBreakdown?.categories?.find(c => normCat(c.category, false) === drillCategory);
                  return c ? fmtK(c.amount) : "";
                })()}
              </span>
              <button onClick={() => setDrillCategory(null)}
                style={{marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex"}}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div style={{overflowY: "auto", padding: "8px 0", flex: 1}}>
              {drillLoading ? (
                <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: 13}}>Loading transactions…</div>
              ) : drillTxns.length === 0 ? (
                <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-4)", fontSize: 13}}>No transactions in this range</div>
              ) : (
                drillTxns.map((tx, i) => (
                  <div key={tx.id} className="anim-row" style={{"--i": i, display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: i < drillTxns.length - 1 ? "1px solid var(--line)" : "none"}}>
                    <MerchantLogo merchant={tx.merchant} size={24}/>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: 13, fontWeight: 500, color: "var(--ink)"}}>{tx.merchant || "Unknown"}</div>
                      <div style={{fontSize: 11, color: "var(--ink-4)", marginTop: 1}}>{tx.date}</div>
                    </div>
                    <div style={{fontFamily: "'Geist Mono', monospace", fontSize: 14, fontWeight: 600, color: "var(--neg)"}}>
                      {fmtK(Math.abs(tx.amount))}
                    </div>
                  </div>
                ))
              )}
            </div>
            <div style={{padding: "10px 20px", borderTop: "1px solid var(--line)", textAlign: "center", flexShrink: 0}}>
              <button onClick={() => {
                const cat = drillCategory;
                setDrillCategory(null);
                if (!onNavigateToView) return;
                if (onSetCategoryFilter) onSetCategoryFilter(cat);
                if (onSetFilter) onSetFilter("all");
                onNavigateToView("inbox");
              }}
                style={{border: "none", background: "none", color: "var(--accent)", fontSize: 12, cursor: "pointer", fontWeight: 500}}>
                View all in inbox →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

Object.assign(window, { FlowView });
