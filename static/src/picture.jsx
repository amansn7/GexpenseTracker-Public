// PictureView — Flow tab, Trend tab, Breakdown tab

const PictureView = ({ pictureData, loading, period, onPeriodChange }) => {
  const [tab, setTab] = React.useState("flow");
  const { isMobile } = useViewport();

  const fmt = (n) => {
    if (n == null) return "—";
    return "₹" + Math.abs(n).toLocaleString("en-IN");
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 72px)" }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading picture…</div>
      </div>
    );
  }

  const periods = [
    { key: "1m", label: "This Month" },
    { key: "3m", label: "Last 3" },
    { key: "1y", label: "This Year" },
  ];

  // NL summary sentence
  const nlSummary = () => {
    if (!pictureData) return "";
    const { categoryBreakdown, monthlyTrend } = pictureData;
    if (!categoryBreakdown || categoryBreakdown.length === 0) return "No spending data yet.";
    const top2 = categoryBreakdown.slice(0, 2);
    const topPct = top2.reduce((a, c) => a + (c.pct || 0), 0);
    const labels = top2.map(c => c.category).join(" and ");
    return `${labels} were ${Math.round(topPct)}% of spending this period.`;
  };

  return (
    <div style={{ padding: "20px 28px 48px", maxWidth: 900, margin: "0 auto" }}>
      {/* Period selector */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {periods.map((p) => (
          <button
            key={p.key}
            onClick={() => onPeriodChange && onPeriodChange(p.key)}
            style={{
              padding: "6px 14px", borderRadius: 6, border: "1px solid var(--line)",
              background: period === p.key ? "var(--ink)" : "var(--card)",
              color: period === p.key ? "var(--paper)" : "var(--ink-2)",
              fontSize: 12, fontWeight: 500, cursor: "pointer",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--line)", marginBottom: 24 }}>
        {[["flow", "Flow"], ["trend", "Trend"], ["breakdown", "Breakdown"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              padding: "10px 20px", border: "none", borderBottom: tab === key ? "2px solid var(--accent)" : "2px solid transparent",
              background: "transparent", color: tab === key ? "var(--ink)" : "var(--ink-3)",
              fontSize: 13, fontWeight: 500, cursor: "pointer", marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* NL Summary */}
      {pictureData && (
        <div style={{ fontSize: 14, color: "var(--ink-2)", marginBottom: 24, fontStyle: "italic", fontFamily: "'Instrument Serif', serif" }}>
          {nlSummary()}
        </div>
      )}

      {/* ── Flow Tab ── */}
      {tab === "flow" && pictureData?.flowSummary && (
        <SankeyDiagram data={pictureData.flowSummary} />
      )}

      {/* ── Trend Tab ── */}
      {tab === "trend" && pictureData?.monthlyTrend && (
        <TrendChart data={pictureData.monthlyTrend} />
      )}

      {/* ── Breakdown Tab ── */}
      {tab === "breakdown" && pictureData?.categoryBreakdown && (
        <BreakdownView categories={pictureData.categoryBreakdown} topMerchants={pictureData.topMerchants} />
      )}
    </div>
  );
};

// ── Sankey (simplified for Picture) ──
const SankeyDiagram = ({ data }) => {
  const { isMobile } = useViewport();
  const W = 800, H = 380;
  const LEFT_X = 20, LEFT_W = 130;
  const MID_X = 340, MID_W = 120;
  const RIGHT_X = 650, RIGHT_W = 130;
  const PAD_Y = 30;

  const totalIncome = data.income.reduce((a, i) => a + i.amount, 0);
  const totalExpense = data.expenses.reduce((a, e) => a + e.amount, 0);
  const poolTotal = Math.max(totalIncome, totalExpense, 1);
  const scale = (H - PAD_Y * 2) / poolTotal;

  let yi = PAD_Y;
  const incomeNodes = data.income.map(i => {
    const h = Math.max(6, i.amount * scale);
    const node = { ...i, y: yi, h };
    yi += h + 8;
    return node;
  });

  const hubH = Math.max(60, (H - PAD_Y * 2) * (totalIncome / poolTotal));
  const hubY = PAD_Y + ((H - PAD_Y * 2) - hubH) / 2;

  let yo = PAD_Y;
  const rightNodes = data.expenses.map(e => {
    const h = Math.max(6, e.amount * scale);
    const node = { ...e, y: yo, h };
    yo += h + 8;
    return node;
  });

  const buildPath = (x1, y1, h1, x2, y2, h2) => {
    const cx = x1 + (x2 - x1) * 0.5;
    return `M${x1},${y1} C${cx},${y1} ${cx},${y2} ${x2},${y2} L${x2},${y2+h2} C${cx},${y2+h2} ${cx},${y1+h1} ${x1},${y1+h1} Z`;
  };

  return (
    <div style={{ overflowX: isMobile ? "auto" : "visible" }}>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", maxHeight: 420 }}>
        {/* Hub */}
        <rect x={MID_X} y={hubY} width={MID_W} height={hubH} fill="var(--paper-2)" stroke="var(--line)" rx="4" />
        <text x={MID_X + MID_W/2} y={hubY + hubH/2 - 6} textAnchor="middle" fontFamily="'Geist', sans-serif" fontSize="10" fill="var(--ink-4)" letterSpacing="0.08em" fontWeight="500">POOL</text>
        <text x={MID_X + MID_W/2} y={hubY + hubH/2 + 14} textAnchor="middle" fontFamily="'Fraunces', serif" fontSize="22" fill="var(--ink)">₹{(totalIncome / 1000).toFixed(1)}K</text>

        {/* Income → Hub */}
        {incomeNodes.map((n, idx) => {
          const p = buildPath(LEFT_X + LEFT_W, n.y, n.h, MID_X, hubY + idx * (n.h + 8), n.h);
          return <path key={`in-${idx}`} d={p} fill="var(--pos)" fillOpacity="0.18" />;
        })}

        {/* Income nodes */}
        {incomeNodes.map((n, idx) => (
          <g key={`ni-${idx}`}>
            <rect x={LEFT_X} y={n.y} width={LEFT_W} height={n.h} fill="var(--pos)" fillOpacity="0.88" rx="3" />
            <text x={LEFT_X + 8} y={n.y + n.h/2 + 4} textAnchor="start" fontSize="10" fill="white" fontWeight="600" fontFamily="'Geist', sans-serif">{n.label}</text>
          </g>
        ))}

        {/* Hub → Right */}
        {rightNodes.map((n, idx) => {
          const color = CategoryService.colorVar(n.cat);
          const p = buildPath(MID_X + MID_W, hubY + idx * (n.h + 8), n.h, RIGHT_X, n.y, n.h);
          return <path key={`out-${idx}`} d={p} fill={color} fillOpacity="0.45" />;
        })}

        {/* Right nodes */}
        {rightNodes.map((n, idx) => {
          const fill = CategoryService.colorInk(n.cat);
          const catInfo = CategoryService.display(n.cat);
          return (
            <g key={`nr-${idx}`}>
              <rect x={RIGHT_X} y={n.y} width={RIGHT_W} height={n.h} fill={fill} rx="3" />
              <text x={RIGHT_X + 8} y={n.y + Math.min(14, n.h/2 + 4)} fontSize="10" fill="white" fontWeight="600" fontFamily="'Geist', sans-serif">{catInfo.label}</text>
              {n.h > 22 && (
                <text x={RIGHT_X + 8} y={n.y + n.h/2 + 14} fontSize="10" fill="white" fontFamily="'Geist Mono', monospace" opacity="0.9">₹{n.amount.toLocaleString("en-IN")}</text>
              )}
            </g>
          );
        })}

        <text x={LEFT_X} y={16} fontSize="9" fill="var(--ink-4)" letterSpacing="0.1em" fontWeight="500">INCOME</text>
        <text x={RIGHT_X} y={16} fontSize="9" fill="var(--ink-4)" letterSpacing="0.1em" fontWeight="500">SPENDING</text>
      </svg>
    </div>
  );
};

// ── Trend Chart ──
const TrendChart = ({ data }) => {
  const months = data.months || [];
  const last3 = months.slice(-3);
  const avgIncome = last3.reduce((a, m) => a + m.income, 0) / Math.max(last3.length, 1);
  const avgExpense = last3.reduce((a, m) => a + m.expenses, 0) / Math.max(last3.length, 1);
  const avgNet = avgIncome - avgExpense;
  const savingsRate = avgIncome > 0 ? (avgNet / avgIncome * 100).toFixed(0) : 0;
  const runway = avgExpense > 0 ? (data.currentBalance / avgExpense).toFixed(1) : "—";

  const maxAbs = Math.max(...months.map(m => Math.abs(m.net)), 1);
  const barH = 120;
  const W = 600;

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${barH + 40}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block", maxHeight: 200 }}>
        {/* Zero line */}
        <line x1="40" y1={barH/2 + 10} x2={W - 10} y2={barH/2 + 10} stroke="var(--line)" strokeWidth="1" />

        {months.map((m, i) => {
          const x = 50 + (i / Math.max(months.length - 1, 1)) * (W - 70);
          const netH = (m.net / maxAbs) * (barH / 2 - 10);
          const y = m.net >= 0 ? barH/2 + 10 - netH : barH/2 + 10;
          const h = Math.abs(netH);
          const color = m.net >= 0 ? "var(--pos)" : "var(--neg)";
          const label = new Date(m.month + "-01").toLocaleDateString("en-IN", { month: "short" });
          return (
            <g key={m.month}>
              <rect x={x - 12} y={y} width={24} height={Math.max(h, 2)} fill={color} rx="2" opacity="0.8" />
              <text x={x} y={barH + 28} textAnchor="middle" fontSize="9" fill="var(--ink-3)">{label}</text>
              <text x={x} y={y - 4} textAnchor="middle" fontSize="8" fill="var(--ink-4)" fontFamily="'Geist Mono', monospace">
                {m.net >= 0 ? "+" : ""}{(m.net / 1000).toFixed(1)}K
              </text>
            </g>
          );
        })}
      </svg>

      {/* Footer */}
      <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--ink-3)", marginTop: 8, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
        <span>Runway: {runway} months</span>
        <span>Savings rate: {savingsRate}%</span>
      </div>
    </div>
  );
};

// ── Breakdown (Category Treemap + Top Merchants) ──
const BreakdownView = ({ categories, topMerchants }) => {
  const total = categories.reduce((a, c) => a + c.amount, 0);
  const [hoveredCat, setHoveredCat] = React.useState(null);

  // Simple treemap: horizontal bars sized by amount
  return (
    <div>
      {/* Category bars */}
      <div style={{ marginBottom: 28 }}>
        {categories.map((c, i) => {
          const pct = total > 0 ? (c.amount / total * 100) : 0;
          const catInfo = CategoryService.display(c.category);
          const isHovered = hoveredCat === c.category;
          return (
            <div
              key={c.category}
              onMouseEnter={() => setHoveredCat(c.category)}
              onMouseLeave={() => setHoveredCat(null)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "8px 0",
                borderBottom: i < categories.length - 1 ? "1px solid var(--line)" : "none",
                cursor: "pointer",
              }}
            >
              <div style={{ width: 12, height: 12, borderRadius: 3, background: catInfo.bg || catInfo.color || "var(--ink-3)", flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{catInfo.label}</span>
                  <span style={{ fontSize: 12, fontFamily: "'Geist Mono', monospace", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                    ₹{c.amount.toLocaleString("en-IN")}
                    <span style={{ color: "var(--ink-4)", marginLeft: 6 }}>{pct.toFixed(0)}%</span>
                  </span>
                </div>
                <div style={{ height: 4, background: "var(--paper-2)", borderRadius: 2, overflow: "hidden" }}>
                  <div style={{
                    height: "100%", width: `${pct}%`, background: catInfo.bg || catInfo.color || "var(--ink-3)",
                    borderRadius: 2, transition: "transform 400ms cubic-bezier(.2,.8,.2,1)",
                    transform: isHovered ? "scaleX(1.02)" : "scaleX(1)",
                    transformOrigin: "left",
                  }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Top merchants */}
      {topMerchants && topMerchants.length > 0 && (
        <div>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 10 }}>Top merchants</div>
          {topMerchants.slice(0, 5).map((m, i) => (
            <div key={m.merchant} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: i < 4 ? "1px solid var(--line)" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "var(--ink-4)", width: 16 }}>{i + 1}</span>
                <span style={{ fontSize: 13, color: "var(--ink)" }}>{m.merchant}</span>
              </div>
              <span style={{ fontSize: 13, fontFamily: "'Geist Mono', monospace", color: "var(--ink-2)", fontVariantNumeric: "tabular-nums" }}>
                ₹{m.amount.toLocaleString("en-IN")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

Object.assign(window, { PictureView, SankeyDiagram, TrendChart, BreakdownView });
