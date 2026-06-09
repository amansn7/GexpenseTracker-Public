// @ts-nocheck
// Health — runway, savings rate, monthly net

const HealthView = React.memo(() => {
  const { isMobile, isTablet } = useViewport();
  const [months, setMonths] = React.useState(6);
  const { loading, data, error, retry } = window.useAsync(
    () => API.get(`/api/stats?sections=health&months=${months}`).then(d => d.health || null),
    [months]
  );
  const healthScrollRef = React.useRef(null);
  const { pulling: hPulling, refreshing: hRefreshing, pullY: hPullY, handleTouchStart: hTouchStart, handleTouchMove: hTouchMove, handleTouchEnd: hTouchEnd } = window.usePullToRefresh(retry, { scrollRef: healthScrollRef });

  const fmt = (n) => {
    if (n == null) return "—";
    const s = n < 0 ? "-" : "";
    return s + "\u20B9" + window.formatShortNumber(Math.abs(n));
  };

  if (error) {
    return (
      <div style={{ padding: "28px 32px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)", maxWidth: 900, margin: "0 auto" }}>
        <div role="alert" style={{ padding: 28, color: "var(--neg)", fontSize: "0.8125rem" }}>
          Could not load health data. <button onClick={retry} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", font: "inherit", fontSize: "inherit" }}>Retry</button>
        </div>
      </div>
    );
  }

  const hasAnchor = data?.balance_mode === "anchored";
  const bars = data?.monthly_net || [];
  const maxAbs = bars.length ? Math.max(...bars.map(b => Math.abs(b.net)), 1) : 1;

  return (
    <div ref={healthScrollRef} style={{ padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)", maxWidth: 900, margin: "0 auto", ...(isMobile ? { padding: "16px 14px 80px", height: mobileStyles.navOffset } : isTablet ? { padding: "24px 22px 64px" } : {}), ...(isMobile ? { touchAction: "pan-y" } : {}) }}
      onTouchStart={isMobile ? hTouchStart : undefined}
      onTouchMove={isMobile ? hTouchMove : undefined}
      onTouchEnd={isMobile ? hTouchEnd : undefined}>
      {(hPulling || hRefreshing) && (
        <div style={{
          height: hRefreshing ? 36 : hPullY,
          display: "flex", alignItems: "center",
          justifyContent: "center", gap: 8, fontSize: "0.8125rem", color: "var(--ink-3)",
          flexShrink: 0,
          transition: hPullY === 0 && !hPulling ? "height 0.2s ease" : "none"
        }}>
          {hRefreshing ? (
            <><span className="spinner-sm" /> Refreshing…</>
          ) : (
            <><Icon name={hPullY > 80 ? "refresh" : "arrow-down"}
              style={{ transform: hPullY > 80 ? "rotate(180deg)" : "none",
                       transition: "transform 0.2s ease" }} />
              {hPullY > 80 ? "Release to refresh" : "Pull to refresh"}</>
          )}
        </div>
      )}

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Savings Rate */}
        <div style={{ padding: "22px 24px", ...(isMobile ? { padding: "12px 14px" } : {}), background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14 }}>Savings Rate</div>
          {loading ? <Skeleton height={40} /> : (
            <>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1, color: (data?.savings_rate || 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {data != null ? `${data.savings_rate}%` : "—"}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 6 }}>
                {(data?.savings_rate || 0) >= 0 ? "of income saved" : "of income over-spent"}
              </div>
            </>
          )}
        </div>

        {/* Runway */}
        <div style={{ padding: "22px 24px", ...(isMobile ? { padding: "12px 14px" } : {}), background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14 }}>Runway</div>
          {loading ? <Skeleton height={40} /> : (
            <>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "2.5rem", fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1 }}>
                {data?.runway_months != null
                  ? <>{data.runway_months}<span style={{ fontSize: "1rem", fontFamily: "'Geist', sans-serif", color: "var(--ink-3)", fontWeight: 400 }}> mo</span></>
                  : "—"}
              </div>
              <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 6 }}>
                {data?.runway_months != null ? "at current burn rate" : "No expenses tracked"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Current balance */}
      <div style={{ padding: "18px 24px", ...(isMobile ? { padding: "12px 14px" } : {}), background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 10 }}>Current Balance</div>
        {loading ? <Skeleton height={28} width="50%" /> : (
          <>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.75rem", fontWeight: 400, letterSpacing: "-0.02em" }}>
              {fmt(data?.current_balance)}
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 4 }}>
              {hasAnchor
                ? `${fmt(data.starting_balance)} starting · ${fmt(data.current_balance - data.starting_balance)} from transactions`
                : <span>Based on all tracked history · <button style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline", background: "none", border: "none", padding: 0, font: "inherit", fontSize: "inherit" }} onClick={() => window._goSettings && window._goSettings()}>Set a starting balance in Settings</button></span>
              }
            </div>
          </>
        )}
      </div>

      {/* Monthly net bars */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
        <div style={{ borderRadius: "8px 8px 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Monthly Net</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => setMonths(n)}
                style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: months === n ? "var(--paper)" : "transparent", color: months === n ? "var(--ink)" : "var(--paper)", fontSize: "0.6875rem", cursor: "pointer", fontFamily: "inherit", opacity: months === n ? 1 : 0.5, fontWeight: 500 }}>
                {n}mo
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {[55, 35, 60, 25, 50, 40, 65, 30, 55, 45, 35, 60].map((h, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <Skeleton width="100%" height={h} style={{ borderRadius: "2px 2px 0 0" }} />
                  <Skeleton width="60%" height={6} style={{ borderRadius: 1 }} />
                </div>
              ))}
            </div>
          ) : bars.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-4)", fontSize: "0.8125rem" }}>
              Not enough history yet. Come back after a full month.
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 80 }}>
              {bars.map(b => {
                const h = Math.max(4, Math.round((Math.abs(b.net) / maxAbs) * 72));
                const pos = b.net >= 0;
                return (
                  <div key={b.month} title={`${b.month}: ${fmt(b.net)} net (${fmt(b.income)} in, ${fmt(b.expenses)} out)`}
                    style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                    <div style={{ width: "100%", height: h, borderRadius: "2px 2px 0 0", background: pos ? "var(--pos)" : "var(--neg)", opacity: 0.75 }}/>
                    <div style={{ fontSize: "0.5625rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
                      {b.month.slice(2).replace("-", "/")}
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
});

(window as any).HealthView = HealthView;
