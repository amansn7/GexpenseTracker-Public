// Health — runway, savings rate, monthly net

const HealthView = React.memo(() => {
  const { isMobile, isTablet } = useViewport();
  const [months, setMonths] = React.useState(6);
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    API.get(`/api/stats?sections=health&months=${months}`)
      .then(d => { if (!cancelled) { setData(d.health || null); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [months]);

  const fmt = (n) => {
    if (n == null) return "—";
    const abs = Math.abs(n);
    if (abs >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
    return `₹${Math.round(n)}`;
  };

  const hasAnchor = data?.balance_mode === "anchored";
  const bars = data?.monthly_net || [];
  const maxAbs = bars.length ? Math.max(...bars.map(b => Math.abs(b.net)), 1) : 1;

  return (
    <div style={{ padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)", maxWidth: 900, margin: "0 auto", ...(isMobile ? { padding: "16px 14px 80px", height: mobileStyles.navOffset } : isTablet ? { padding: "24px 22px 64px" } : {}) }}>

      {/* Stat cards row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>

        {/* Savings Rate */}
        <div style={{ padding: "22px 24px", ...(isMobile ? { padding: "12px 14px" } : {}), background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14 }}>Savings Rate</div>
          {loading ? <Skeleton height={40} /> : (
            <>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1, color: (data?.savings_rate || 0) >= 0 ? "var(--pos)" : "var(--neg)" }}>
                {data != null ? `${data.savings_rate}%` : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {(data?.savings_rate || 0) >= 0 ? "of income saved" : "of income over-spent"}
              </div>
            </>
          )}
        </div>

        {/* Runway */}
        <div style={{ padding: "22px 24px", ...(isMobile ? { padding: "12px 14px" } : {}), background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14 }}>Runway</div>
          {loading ? <Skeleton height={40} /> : (
            <>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1 }}>
                {data?.runway_months != null
                  ? <>{data.runway_months}<span style={{ fontSize: 16, fontFamily: "'Geist', sans-serif", color: "var(--ink-3)", fontWeight: 400 }}> mo</span></>
                  : "—"}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                {data?.runway_months != null ? "at current burn rate" : "No expenses tracked"}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Current balance */}
      <div style={{ padding: "18px 24px", ...(isMobile ? { padding: "12px 14px" } : {}), background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 10 }}>Current Balance</div>
        {loading ? <Skeleton height={28} width="50%" /> : (
          <>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em" }}>
              {fmt(data?.current_balance)}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4 }}>
              {hasAnchor
                ? `${fmt(data.starting_balance)} starting · ${fmt(data.current_balance - data.starting_balance)} from transactions`
                : <span>Based on all tracked history · <span style={{ color: "var(--accent)", cursor: "pointer", textDecoration: "underline" }} onClick={() => window._goSettings && window._goSettings()}>Set a starting balance in Settings</span></span>
              }
            </div>
          </>
        )}
      </div>

      {/* Monthly net bars */}
      <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 }}>
        <div style={{ borderRadius: "8px 8px 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" }}>Monthly Net</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[3, 6, 12].map(n => (
              <button key={n} onClick={() => setMonths(n)}
                style={{ padding: "3px 10px", borderRadius: 4, border: "none", background: months === n ? "var(--paper)" : "transparent", color: months === n ? "var(--ink)" : "var(--paper)", fontSize: 11, cursor: "pointer", fontFamily: "inherit", opacity: months === n ? 1 : 0.5, fontWeight: 500 }}>
                {n}mo
              </button>
            ))}
          </div>
        </div>
        <div style={{ padding: "20px 24px" }}>
          {loading ? <Skeleton height={80} /> : bars.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "var(--ink-4)", fontSize: 13 }}>
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
                    <div style={{ fontSize: 9, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
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

window.HealthView = HealthView;
