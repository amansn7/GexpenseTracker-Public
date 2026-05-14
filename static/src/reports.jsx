// Reports — monthly summary table

const { useState, useEffect } = React;

const ReportsView = () => {
  const [months, setMonths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    API.get("/api/stats/monthly-summary")
      .then(d => { setMonths(d.months); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const fmtAmt = (v, pos) => {
    const sign = v >= 0 ? (pos ? "+" : "") : "-";
    return `${sign}₹${Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
  };

  const savingsBadge = (rate) => {
    const bg = rate >= 20 ? "var(--pos-soft)" : rate >= 10 ? "color-mix(in srgb, var(--amber) 20%, transparent)" : "var(--neg-soft)";
    const ink = rate >= 20 ? "var(--pos)" : rate >= 10 ? "var(--amber)" : "var(--neg)";
    return (
      <span style={{ background: bg, color: ink, borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 600, fontFamily: "'Geist Mono', monospace" }}>
        {rate.toFixed(1)}%
      </span>
    );
  };

  const secBand = { borderBottom: "1px solid var(--line)", padding: "10px 28px", background: "var(--paper-2)", display: "flex", alignItems: "center", gap: 10 };
  const secTitle = { fontFamily: "'Fraunces', serif", fontSize: 13, fontWeight: 500, color: "var(--ink-2)", letterSpacing: "0.01em" };
  const secBody = { padding: "0 28px 32px" };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200 }}>
      <div style={{ width: 24, height: 24, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }} />
    </div>
  );

  if (error) return (
    <div style={{ padding: 28, color: "var(--neg)", fontSize: 13 }}>
      Could not load reports. <button onClick={() => window.location.reload()} style={{ color: "var(--accent)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
    </div>
  );

  if (!months.length) return (
    <div style={{ padding: 48, textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>
      No transaction data yet. Sync your Gmail to get started.
    </div>
  );

  const totalIncome = months.reduce((a, m) => a + m.income, 0);
  const totalExpenses = months.reduce((a, m) => a + m.expenses, 0);
  const totalNet = totalIncome - totalExpenses;
  const avgSavings = months.length ? months.reduce((a, m) => a + m.savings_rate, 0) / months.length : 0;

  const colHdr = { padding: "10px 12px", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, textAlign: "right", borderBottom: "1px solid var(--line)", background: "var(--paper-2)" };
  const colHdrL = { ...colHdr, textAlign: "left" };
  const cell = (v, style = {}) => ({ padding: "11px 12px", fontSize: 13, fontFamily: "'Geist Mono', monospace", textAlign: "right", borderBottom: "1px solid var(--line)", color: "var(--ink-2)", ...style });

  return (
    <div className="fade-in">
      <div style={secBand}>
        <span style={secTitle}>Monthly Summary</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-4)" }}>Last 12 months</span>
      </div>
      <div style={secBody}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 16 }}>
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
                  <td style={{ ...cell(null, {}), textAlign: "left", fontFamily: "'Fraunces', serif", fontWeight: 500, color: "var(--ink)", fontSize: 14 }}>{m.label}</td>
                  <td style={cell(null, { color: "var(--pos)" })}>{fmtAmt(m.income)}</td>
                  <td style={cell(null, { color: "var(--neg)" })}>{fmtAmt(m.expenses)}</td>
                  <td style={cell(null, { color: m.net >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 })}>{fmtAmt(m.net, true)}</td>
                  <td style={{ ...cell(null, {}), textAlign: "right" }}>{savingsBadge(m.savings_rate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: "var(--paper-2)", borderTop: "2px solid var(--line)" }}>
                <td style={{ padding: "12px 12px", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>Total</td>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist Mono', monospace", fontSize: 13, textAlign: "right", color: "var(--pos)", fontWeight: 600 }}>{fmtAmt(totalIncome)}</td>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist Mono', monospace", fontSize: 13, textAlign: "right", color: "var(--neg)", fontWeight: 600 }}>{fmtAmt(totalExpenses)}</td>
                <td style={{ padding: "12px 12px", fontFamily: "'Geist Mono', monospace", fontSize: 13, textAlign: "right", color: totalNet >= 0 ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>{fmtAmt(totalNet, true)}</td>
                <td style={{ padding: "12px 12px", textAlign: "right" }}>{savingsBadge(avgSavings)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
};

window.ReportsView = ReportsView;
