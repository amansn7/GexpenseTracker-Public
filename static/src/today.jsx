// TodayView — Answer Band, Attention Band, Context Band

const TodayView = ({ onNavigate, todayData, loading, onRefresh }) => {
  const fmt = (n) => {
    if (n == null) return "—";
    return "₹" + Math.abs(n).toLocaleString("en-IN");
  };

  const sign = (n) => {
    if (n == null) return "";
    return n >= 0 ? "+" : "−";
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 72px)" }}>
        <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading today…</div>
      </div>
    );
  }

  if (!todayData) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, height: "calc(100vh - 72px)" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: "var(--ink)" }}>No data yet</div>
        <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 320, textAlign: "center" }}>
          Connect your Gmail to start tracking expenses.
        </div>
        <button onClick={onRefresh} style={{ marginTop: 4, padding: "10px 20px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Re-scan Gmail
        </button>
      </div>
    );
  }

  const { answer, attention, context } = todayData;

  // Answer sentence
  const isAhead = answer.remaining >= 0;
  const answerSentence = isAhead
    ? `${fmt(answer.remaining)} ahead this month`
    : `${fmt(answer.remaining)} over budget`;
  const answerSub = answer.expense_change_pct !== 0
    ? `Spending ${answer.expense_change_pct > 0 ? "up" : "down"} ${Math.abs(answer.expense_change_pct)}% vs last month`
    : answer.month_label;

  // Sparkline
  const maxSpend = Math.max(...answer.sparkline, 1);
  const sparkW = 280;
  const sparkH = 32;
  const sparkPoints = answer.sparkline.map((v, i) => {
    const x = (i / Math.max(answer.sparkline.length - 1, 1)) * sparkW;
    const y = sparkH - (v / maxSpend) * (sparkH - 4) - 2;
    return `${x},${y}`;
  }).join(" ");
  const sparkArea = `0,${sparkH} ${sparkPoints} ${sparkW},${sparkH}`;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 28px 48px" }}>
      {/* ── Answer Band ── */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", color: isAhead ? "var(--pos)" : "var(--neg)", lineHeight: 1.1 }}>
          {answerSentence}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 6 }}>{answerSub}</div>

        {/* Sparkline */}
        <svg viewBox={`0 0 ${sparkW} ${sparkH}`} style={{ width: "100%", maxWidth: sparkW, marginTop: 16, display: "block" }}>
          <defs>
            <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.15" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={sparkArea} fill="url(#sparkGrad)" />
          <polyline points={sparkPoints} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {/* ── Attention Band ── */}
      {attention && attention.length > 0 ? (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 10 }}>Needs attention</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {attention.map((item, i) => (
              <button
                key={i}
                className="hover-row"
                onClick={() => {
                  if (item.type === "review") onNavigate("review");
                }}
                style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                  border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)",
                  cursor: "pointer", textAlign: "left", width: "100%",
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: item.type === "review" ? "var(--accent)" : item.type === "budget" && item.over ? "var(--neg)" : "var(--ink-3)",
                }} />
                <span style={{ fontSize: 13, color: "var(--ink)", flex: 1 }}>{item.label}</span>
                {item.count != null && (
                  <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "var(--ink-4)" }}>{item.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: 28, padding: "14px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--pos)" }} />
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>All caught up.</span>
          </div>
        </div>
      )}

      {/* ── Context Band ── */}
      <div>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 10 }}>The numbers</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          <div style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 4 }}>Income</div>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, color: "var(--pos)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(context.income)}
            </div>
          </div>
          <div style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 4 }}>Spent</div>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, color: "var(--neg)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(context.spent)}
            </div>
          </div>
          <div style={{ padding: "14px 16px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--card)" }}>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 4 }}>Remaining</div>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 18, color: context.remaining >= 0 ? "var(--pos)" : "var(--neg)", fontVariantNumeric: "tabular-nums" }}>
              {sign(context.remaining)}{fmt(context.remaining)}
            </div>
          </div>
        </div>

        {/* Footer health stats */}
        <div style={{ display: "flex", gap: 20, fontSize: 12, color: "var(--ink-3)" }}>
          {context.runway_months != null && (
            <span>Runway: {context.runway_months} months</span>
          )}
          <span>Savings rate: {context.savings_rate}%</span>
          <span>Balance: {fmt(context.current_balance)}</span>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { TodayView });
