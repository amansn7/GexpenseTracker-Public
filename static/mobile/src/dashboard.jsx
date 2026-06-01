/* Gexpense Hi-Fi — Dashboard, Transactions, Insights screens */
const { useState, useEffect, useRef } = React;

// ============================================================
// DASHBOARD
// ============================================================
const Dashboard = ({ onNavigate, onAdd }) => {
  const [pct, setPct] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [totalExpenses, setTotalExpenses] = useState(42180);
  const [budget, setBudget] = useState(60000);
  const [txs, setTxs] = useState([]);
  const [cats, setCats] = useState([]);

  const CAT_COLORS = ['var(--brand)', 'var(--ink-2)', '#1F4FA8', '#5530A8', 'var(--ink-4)'];

  const fmtDate = (dateStr) => {
    if (!dateStr) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00');
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  useEffect(() => {
    const load = async () => {
      try {
        const [stats, txData, budgetsData, meData, catsData] = await Promise.all([
          GxAPI.get('/api/stats/summary?period=1m'),
          GxAPI.get('/api/transactions?limit=5&offset=0'),
          GxAPI.get('/api/budgets'),
          GxAPI.get('/api/auth/me'),
          GxAPI.get('/api/stats/category-breakdown?period=1m'),
        ]);

        let spent = 42180;
        let bgt = 60000;

        if (stats) {
          spent = stats.total_expenses || 42180;
          setTotalExpenses(spent);
        }

        if (budgetsData && budgetsData.budgets && budgetsData.budgets.length > 0) {
          const totalCat = budgetsData.budgets.find(b => b.category === 'total');
          bgt = totalCat
            ? totalCat.monthly_limit
            : budgetsData.budgets.reduce((s, b) => s + (b.monthly_limit || 0), 0) || 60000;
          setBudget(bgt);
        }

        const realPct = bgt > 0 ? Math.round((spent / bgt) * 100) : 0;
        setTimeout(() => setPct(realPct), 200);

        if (txData && txData.items) {
          setTxs(txData.items.map(tx => [
            tx.category || 'other',
            tx.merchant || 'Unknown',
            '',
            fmtDate(tx.txn_date),
            tx.amount,
            fmtDate(tx.txn_date),
          ]));
        }

        if (meData) {
          setUserName(meData.name || '');
        }

        if (catsData && catsData.categories && catsData.categories.length > 0) {
          setCats(catsData.categories.map((cat, i) => ({
            n: cat.name,
            v: cat.total,
            pct: cat.pct,
            c: CAT_COLORS[i % CAT_COLORS.length],
          })));
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return <div style={{padding:20, textAlign:'center', color:'var(--ink-3)'}}>Loading...</div>;
  }

  const budgetLeft = budget - totalExpenses;
  const topCat = cats.length > 0 ? cats[0] : null;
  let cum = 0;
  const C = 2 * Math.PI * 60;

  return (
    <div className="scroll" data-screen-label="01 Dashboard">
      <div style={{padding: '8px 22px 0'}}>
        {/* greeting */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 18}}>
          <div>
            <div className="small">Good evening</div>
            <div className="h2" style={{marginTop:2}}>{userName || 'Aman Sharma'}</div>
          </div>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <button className="btn-ghost btn" style={{padding:'8px', borderRadius: '50%', width: 38, height:38, display:'grid', placeItems:'center'}}>
              <Icon name="bell" size={18}/>
            </button>
            <button onClick={() => setProfileOpen(true)} className="btn" style={{padding:0, width:38, height:38, borderRadius:'50%', background:'var(--surface-2)', border:'1px solid var(--line)', display:'grid', placeItems:'center', fontWeight:600, cursor:'pointer'}}>A</button>
          </div>
        </div>

        <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} onNavigate={onNavigate}/>

        {/* monthly summary card — hero */}
        <div className="card fade-up fade-up-2" style={{padding:20, marginBottom: 14, background:'linear-gradient(180deg, var(--surface), var(--surface) 60%, var(--brand-50))'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div className="label">Spent this month · April</div>
              <div style={{display:'flex', alignItems:'baseline', gap:6, marginTop:4}}>
                <span className="tabular" style={{fontSize: 38, fontWeight: 600, letterSpacing:'-0.025em', color:'var(--ink)'}}>₹{totalExpenses.toLocaleString('en-IN')}</span>
              </div>
              <div className="small tabular" style={{marginTop:2}}>of ₹{budget.toLocaleString('en-IN')} budget</div>
            </div>
            <div style={{textAlign:'right'}}>
              <Badge tone="ok">on track</Badge>
              <div className="mono small tabular" style={{marginTop:6}}>↓ 12% vs Mar</div>
            </div>
          </div>
          <div className="progress" style={{marginTop:16}}>
            <i style={{width: `${pct}%`}} />
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
            <div className="small">{pct}% used · 5 days left</div>
            <div className="mono small tabular" style={{color:'var(--ink)'}}>₹{budgetLeft.toLocaleString('en-IN')} left</div>
          </div>
        </div>

        {/* AI insight */}
        <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 25%, transparent)'}}>
          <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
            <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
              <Icon name="sparkle" size={16}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div className="label" style={{color:'var(--brand)'}}>Smart insight</div>
              <div className="body" style={{color:'var(--ink)', marginTop:2, fontWeight:500}}>
                You spent <b>32% more on food</b> this week — mostly weekend dinners.
              </div>
              <div style={{display:'flex', gap:8, marginTop:10}}>
                <span className="chip">Set a limit</span>
                <span className="chip">Why?</span>
              </div>
            </div>
          </div>
        </div>

        {/* category donut */}
        <div className="card fade-up fade-up-4" style={{padding:18, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div className="h3">Where it went</div>
            <span className="chip" onClick={() => onNavigate('transactions', 'this-month')} style={{cursor:'pointer'}}>This month <Icon name="chevron" size={12}/></span>
          </div>
          <div style={{display:'flex', alignItems:'center', gap:18}}>
            <div style={{position:'relative', width:140, height:140, flexShrink:0}}>
              <svg viewBox="0 0 140 140" width="140" height="140" style={{transform:'rotate(-90deg)'}}>
                <circle cx="70" cy="70" r="60" fill="none" stroke="var(--surface-2)" strokeWidth="18"/>
                {cats.map((c, i) => {
                  const dash = (c.pct/100) * C;
                  const offset = -((cum/100) * C);
                  cum += c.pct;
                  return (
                    <circle key={i} cx="70" cy="70" r="60" fill="none"
                      stroke={c.c} strokeWidth="18"
                      strokeDasharray={`${dash} ${C}`}
                      strokeDashoffset={offset}
                      style={{transition: 'stroke-dasharray 0.9s ease-out', strokeLinecap:'butt'}}
                    />
                  );
                })}
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center'}}>
                <div className="label">Top</div>
                <div style={{fontSize:18, fontWeight:600, lineHeight:1, marginTop:2}}>{topCat ? topCat.n : '—'}</div>
                <div className="mono small tabular">{topCat ? topCat.pct + '%' : ''}</div>
              </div>
            </div>
            <div style={{flex:1, minWidth:0}}>
              {cats.map(c => (
                <div key={c.n} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0'}}>
                  <div style={{display:'flex', gap:8, alignItems:'center', minWidth:0}}>
                    <span style={{width:8, height:8, borderRadius:2, background:c.c}}/>
                    <span style={{fontSize:13}}>{c.n}</span>
                  </div>
                  <span className="mono small tabular" style={{color:'var(--ink-2)'}}>₹{c.v.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* recent */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', margin:'10px 4px 10px'}}>
          <div className="h3">Recent</div>
          <span className="chip" onClick={() => onNavigate('transactions')}>See all <Icon name="chevron" size={12}/></span>
        </div>

        <div className="card fade-up fade-up-5" style={{padding:'4px 0', marginBottom: 30}}>
          {txs.map((r, i) => (
            <div key={i} onClick={() => onNavigate('tx', { merchant:r[1], note:r[2], time:r[3], amount:r[4], category:r[0], categoryLabel:r[0][0].toUpperCase()+r[0].slice(1), source:'Gmail', sourceDetail:'Gmail receipt', dateLong:'Apr 27, 2026', account:'HDFC ••1042', id:'tx_'+i, type:'expense', aiTags:['Auto-categorized'] })} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<txs.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
              <CatIcon kind={r[0]}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                  <div style={{fontWeight:600, fontSize:14, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r[1]}</div>
                  <div className="tabular" style={{fontWeight:600, fontSize:14}}>−₹{r[4].toLocaleString('en-IN')}</div>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:2}}>
                  <div className="small" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{r[2]}</div>
                  <div className="small mono">{r[3]}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============================================================
// TRANSACTIONS
// ============================================================