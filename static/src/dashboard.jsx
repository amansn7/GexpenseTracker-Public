// Dashboard — minimal monthly summary

const dashStyles = {
  wrap: { padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100vh - 72px)", maxWidth: 1300, margin: "0 auto" },
  hero: { padding: "36px 40px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, marginBottom: 24, display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 40, alignItems: "center" },
  heroLabel: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, marginBottom: 6 },
  heroAmount: { fontFamily: "'Fraunces', serif", fontSize: 72, fontWeight: 400, letterSpacing: "-0.035em", lineHeight: 1, margin: "4px 0 8px" },
  heroSub: { fontSize: 13, color: "var(--ink-3)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: 16 },
  barSplit: { display: "flex", height: 12, borderRadius: 20, overflow: "hidden", border: "1px solid var(--line)", background: "var(--paper-2)", marginTop: 12 },
  grid3: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 24 },
  card: { padding: "22px 24px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8 },
  cardH: { fontSize: 12, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 14, display: "flex", alignItems: "center", justifyContent: "space-between" },
  cardBig: { fontFamily: "'Fraunces', serif", fontSize: 40, fontWeight: 400, letterSpacing: "-0.025em", lineHeight: 1 },
  grid2: { display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 },
  catRow: { display: "grid", gridTemplateColumns: "120px 1fr 90px", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px dashed var(--line)", fontSize: 13 },
};

const DashboardView = ({ flow, transactions }) => {
  const totalIncome = flow.income.reduce((a,i)=>a+i.amount, 0);
  const totalExpense = flow.expenses.reduce((a,e)=>a+e.amount, 0);
  const remaining = totalIncome - totalExpense;
  const pctSpent = (totalExpense / totalIncome) * 100;
  const daily = Math.round(totalExpense / new Date().getDate());
  const subsTotal = transactions.filter(t=>t.tag==="subscription").reduce((a,t)=>a+Math.abs(t.amount),0);
  const subsCount = transactions.filter(t=>t.tag==="subscription").length;
  const unread = transactions.filter(t=>!t.read).length;
  const flagged = transactions.filter(t=>t.conf<0.7).length;

  // Running balance chart for current month
  const today = new Date();
  const todayDay = today.getDate();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cumulative = [];
  let running = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${year}-${String(month).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
    const dayExp = transactions.filter(t=>t.date===date && t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);
    const dayInc = transactions.filter(t=>t.date===date && t.amount>0).reduce((a,t)=>a+t.amount,0);
    running += dayInc - dayExp;
    cumulative.push({ d, val: running, isPast: d <= todayDay });
  }

  const catSorted = [...flow.expenses].sort((a,b)=>b.amount-a.amount);

  return (
    <div style={dashStyles.wrap}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 }}>{new Date().toLocaleString("en-US",{month:"long",year:"numeric"})} · Snapshot</div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", margin: "4px 0 0" }}>
            You're <span className="italic-serif" style={{ color: "var(--pos)" }}>₹{remaining.toLocaleString("en-IN")}</span> ahead.
          </h2>
        </div>
      </div>

      <div style={dashStyles.hero}>
        <div>
          <div style={dashStyles.heroLabel}>Net position · this month</div>
          <div style={{ ...dashStyles.heroAmount, color: "var(--pos)" }}>₹{remaining.toLocaleString("en-IN")}</div>
          <div style={dashStyles.heroSub}>after ₹{totalExpense.toLocaleString("en-IN")} in expenses · {(100-pctSpent).toFixed(0)}% saved so far</div>
          <div style={dashStyles.barSplit} title={`${pctSpent.toFixed(0)}% spent`}>
            <div style={{ width: `${pctSpent}%`, background: "var(--accent)" }} />
            <div style={{ width: `${100-pctSpent}%`, background: "var(--pos)" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>
            <span>Spent ₹{totalExpense.toLocaleString("en-IN")}</span>
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
              const toX = d => ((d-1)/(daysInMonth-1))*400 + 10;
              const toY = v => 170 - ((v - minV)/range)*150;
              const pastPts = cumulative.filter(c=>c.isPast);
              const futPts = cumulative.filter(c=>!c.isPast);
              const pathPast = pastPts.map((c,i)=>`${i===0?"M":"L"}${toX(c.d)},${toY(c.val)}`).join(" ");
              const areaPast = pastPts.length ? pathPast + ` L${toX(pastPts[pastPts.length-1].d)},170 L${toX(pastPts[0].d)},170 Z` : "";
              const pathFut = pastPts.length && futPts.length ? `M${toX(pastPts[pastPts.length-1].d)},${toY(pastPts[pastPts.length-1].val)} ` + futPts.map(c=>`L${toX(c.d)},${toY(c.val)}`).join(" ") : "";
              return (
                <>
                  <line x1="10" y1={toY(0)} x2="410" y2={toY(0)} stroke="var(--line)" strokeDasharray="2 3"/>
                  <path d={areaPast} fill="var(--pos)" fillOpacity="0.12"/>
                  <path d={pathPast} fill="none" stroke="var(--pos)" strokeWidth="2" strokeLinecap="round"/>
                  <path d={pathFut} fill="none" stroke="var(--ink-4)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="3 3"/>
                  <circle cx={toX(todayDay)} cy={toY(cumulative[todayDay-1].val)} r="4" fill="var(--pos)" stroke="var(--card)" strokeWidth="2"/>
                  <text x={toX(todayDay)} y={toY(cumulative[todayDay-1].val)-10} fontSize="10" fill="var(--ink-2)" textAnchor="middle" fontFamily="'Geist Mono', monospace">Today</text>
                </>
              );
            })()}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginTop: -6, paddingLeft: 10, paddingRight: 10 }}>
            <span>{new Date().toLocaleString("en-US",{month:"short"})} 1</span><span>{new Date().toLocaleString("en-US",{month:"short"})} {Math.floor(daysInMonth/2)}</span><span>{new Date().toLocaleString("en-US",{month:"short"})} {daysInMonth}</span>
          </div>
        </div>
      </div>

      <div style={dashStyles.grid3}>
        <div style={dashStyles.card}>
          <div style={dashStyles.cardH}><span>Daily burn</span><Icon name="bolt" size={12} stroke="var(--accent)"/></div>
          <div style={dashStyles.cardBig}>₹{daily.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            at this pace, <span style={{ color: "var(--ink)", fontWeight: 500 }}>₹{(daily*30).toLocaleString("en-IN")}</span>/month
          </div>
        </div>
        <div style={dashStyles.card}>
          <div style={dashStyles.cardH}><span>Subscriptions</span><span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-4)" }}>{subsCount}</span></div>
          <div style={dashStyles.cardBig}>₹{subsTotal.toLocaleString("en-IN")}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            Netflix, Spotify, iCloud+ … <span style={{ color: "var(--accent)" }}>review recurring</span>
          </div>
        </div>
        <div style={dashStyles.card}>
          <div style={dashStyles.cardH}><span>Needs attention</span><Icon name="sparkle" size={12} stroke="var(--accent)"/></div>
          <div style={dashStyles.cardBig}>{unread + flagged}</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8 }}>
            {unread} unread · {flagged} low-confidence
          </div>
        </div>
      </div>

      <div style={dashStyles.grid2}>
        <div style={dashStyles.card}>
          <div style={dashStyles.cardH}>
            <span>Where your money went</span>
            <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-4)" }}>₹{totalExpense.toLocaleString("en-IN")} total</span>
          </div>
          {catSorted.map((e, idx) => {
            const pct = (e.amount / totalExpense) * 100;
            const c = CATEGORIES[e.cat];
            return (
              <div key={idx} style={dashStyles.catRow}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: `1px solid ${c.ink}33` }}/>
                  <span style={{ fontWeight: 500, color: "var(--ink)" }}>{c.label}</span>
                </div>
                <div style={{ background: "var(--paper-2)", height: 8, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: c.ink, opacity: 0.75, borderRadius: 10, transition: "width 400ms" }}/>
                </div>
                <div style={{ textAlign: "right", fontFamily: "'Geist Mono', monospace", color: "var(--ink-2)" }}>
                  ₹{e.amount.toLocaleString("en-IN")} <span style={{ color: "var(--ink-4)" }}>· {pct.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>

        <div style={dashStyles.card}>
          <div style={dashStyles.cardH}>
            <span>Top merchants</span>
          </div>
          {(() => {
            const m = {};
            for (const t of transactions) {
              if (t.amount < 0) m[t.merchant] = (m[t.merchant]||0) + Math.abs(t.amount);
            }
            const top = Object.entries(m).sort((a,b)=>b[1]-a[1]).slice(0, 6);
            const maxAmt = top[0][1];
            return top.map(([name, amt]) => (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: "1px dashed var(--line)" }}>
                <MerchantLogo merchant={name} size={24}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>{name}</div>
                  <div style={{ background: "var(--paper-2)", height: 4, borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${(amt/maxAmt)*100}%`, height: "100%", background: "var(--accent)", opacity: 0.7 }}/>
                  </div>
                </div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, fontWeight: 600 }}>₹{amt.toLocaleString("en-IN")}</div>
              </div>
            ));
          })()}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { DashboardView });
