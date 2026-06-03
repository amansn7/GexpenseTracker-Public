/* Gexpense Hi-Fi — Dashboard, Transactions, Insights screens */
const { useState, useEffect, useRef } = React;

// ============================================================
// DASHBOARD
// ============================================================
// Force live stats computation by spanning into next month (bypasses PeriodRollup cache)
const _liveMonthParams = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const from = `${y}-${String(m+1).padStart(2,'0')}-01`;
  const nextM = m === 11 ? 1 : m + 2;
  const nextY = m === 11 ? y + 1 : y;
  const to   = `${nextY}-${String(nextM).padStart(2,'0')}-01`;
  return `date_from=${from}&date_to=${to}`;
};

const _CAT_COLORS = ['var(--brand)','var(--ink-2)','#1F4FA8','#5530A8','var(--ink-4)','#C77A0F','#C0392B'];
const _fmtDay = d => { if(!d) return ''; const t=new Date(); t.setHours(0,0,0,0); const v=new Date(d+'T00:00:00'); const df=Math.round((t-v)/86400000); return df===0?'Today':df===1?'Yesterday':v.toLocaleDateString('en-IN',{month:'short',day:'numeric'}); };

const Dashboard = ({ onNavigate, onAdd, theme, onTheme }) => {
  const [pct, setPct] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [spent, setSpent] = useState(42180);
  const [budget, setBudget] = useState(60000);
  const [userName, setUserName] = useState('Aman Sharma');
  const [txs, setTxs] = useState([
    ['food','Swiggy','Dinner · Toit','9:12 PM',420,'Today'],
    ['travel','Uber','Indiranagar → HSR','3:40 PM',186,'Today'],
    ['subs','Spotify','Family · auto-renew','Yesterday',199,'Yesterday'],
    ['grocery','BigBasket','Weekly stock-up','Yesterday',1240,'Yesterday'],
    ['bills','Airtel','Postpaid · auto-paid','Apr 22',599,'Apr 22'],
  ]);
  const [cats, setCats] = useState([
    {n:'Food',  v:13500,c:'var(--brand)',pct:32},
    {n:'Rent',  v:10000,c:'var(--ink-2)',pct:24},
    {n:'Travel',v:8400, c:'#1F4FA8',    pct:20},
    {n:'Shop',  v:5900, c:'#5530A8',    pct:14},
    {n:'Other', v:4380, c:'var(--ink-4)',pct:10},
  ]);

  useEffect(() => {
    Promise.all([
      GxAPI.get('/api/stats/summary?' + _liveMonthParams()),
      GxAPI.get('/api/transactions?limit=5&offset=0'),
      GxAPI.get('/api/budgets'),
      GxAPI.get('/api/auth/me'),
      GxAPI.get('/api/stats/category-breakdown?' + _liveMonthParams()),
    ]).then(([stats, txData, budgetsData, me, catsData]) => {
      // Total outflows = expenses + investments + cc_payments
      const expenses   = stats?.total_expenses    || 0;
      const invest     = stats?.total_investments || 0;
      const ccPay      = stats?.total_cc_payments || 0;
      const s = expenses + invest + ccPay || 42180;
      const b = budgetsData?.budgets?.length
        ? budgetsData.budgets.reduce((a,x)=>a+(x.monthly_limit||0),0)||60000
        : 60000;
      setSpent(s); setBudget(b);
      setTimeout(() => setPct(Math.min(100,Math.round((s/b)*100))), 200);
      if (me?.name) setUserName(me.name);
      if (txData?.items?.length) {
        setTxs(txData.items.slice(0,5).map(t=>
          [t.category||'other', t.merchant||'Unknown', t.user_notes||'', '', Math.abs(t.amount||0), _fmtDay(t.txn_date), t.id, t.txn_date, t.label||'expense']
        ));
      } else {
        setTimeout(() => setPct(70), 200);
      }
      // Build cats with pct relative to total outflows (s), not just expenses
      const rawCatItems = catsData?.categories?.length
        ? catsData.categories.slice(0,4).map((c,i)=>({
            n: (c.category||'other').replace(/^\w/,x=>x.toUpperCase()),
            v: Math.round(c.amount||0),
            c: _CAT_COLORS[i%_CAT_COLORS.length],
            rawAmt: c.amount||0,
          }))
        : [];
      if (invest > 0) rawCatItems.push({ n:'Investment', v:Math.round(invest), c:'#1F6FEB', rawAmt:invest });
      if (ccPay  > 0) rawCatItems.push({ n:'CC Payment', v:Math.round(ccPay),  c:'#9B6BBF', rawAmt:ccPay  });
      if (rawCatItems.length > 0) {
        const totalV = rawCatItems.reduce((a,c)=>a+c.rawAmt,0) || 1;
        setCats(rawCatItems.map(c=>({ ...c, pct: Math.round((c.rawAmt/totalV)*100) })));
      }
    }).catch(()=>{ setTimeout(()=>setPct(70),200); });
  }, []);
  let cum = 0;
  const C = 2 * Math.PI * 60;

  return (
    <div className="scroll" data-screen-label="01 Dashboard">
      <div style={{padding: '8px 22px 0'}}>
        {/* greeting */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 18}}>
          <div>
            <div className="small">Good evening</div>
            <div className="h2" style={{marginTop:2}}>{userName}</div>
          </div>
          <div style={{display:'flex', gap:10, alignItems:'center'}}>
            <button className="btn-ghost btn" style={{padding:'8px', borderRadius: '50%', width: 38, height:38, display:'grid', placeItems:'center'}}>
              <Icon name="bell" size={18}/>
            </button>
            <button onClick={() => setProfileOpen(true)} className="btn" style={{padding:0, width:38, height:38, borderRadius:'50%', background:'var(--brand-soft)', border:'1px solid var(--brand)', display:'grid', placeItems:'center', fontWeight:700, fontSize:15, color:'var(--brand)', cursor:'pointer'}}>
              {userName ? userName.charAt(0).toUpperCase() : '?'}
            </button>
          </div>
        </div>

        <ProfileMenu open={profileOpen} onClose={() => setProfileOpen(false)} onNavigate={onNavigate} theme={theme} onTheme={onTheme}/>

        {/* monthly summary card — hero */}
        <div className="card fade-up fade-up-2" style={{padding:20, marginBottom: 14, background:'linear-gradient(180deg, var(--surface), var(--surface) 60%, var(--brand-50))'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div className="label">Spent this month · {new Date().toLocaleString('en-IN',{month:'long'})}</div>
              <div style={{display:'flex', alignItems:'baseline', gap:6, marginTop:4}}>
                <span className="tabular" style={{fontSize: 38, fontWeight: 600, letterSpacing:'-0.025em', color:'var(--ink)'}}>₹{spent.toLocaleString('en-IN')}</span>
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
          {(() => {
            const today = new Date();
            const daysLeft = new Date(today.getFullYear(), today.getMonth()+1, 0).getDate() - today.getDate();
            const amtLeft = Math.max(0, budget - spent);
            return (
              <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                <div className="small">{pct}% used · {daysLeft} day{daysLeft!==1?'s':''} left</div>
                <div className="mono small tabular" style={{color: amtLeft < 0 ? 'var(--err)' : 'var(--ink)'}}>
                  {amtLeft >= 0 ? `₹${amtLeft.toLocaleString('en-IN')} left` : `₹${Math.abs(amtLeft).toLocaleString('en-IN')} over`}
                </div>
              </div>
            );
          })()}
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
              {(() => {
                const topCat = cats.reduce((a,c)=>c.pct>a.pct?c:a, cats[0]||{n:'—',pct:0});
                return (
                  <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center'}}>
                    <div className="label">Top</div>
                    <div style={{fontSize:16, fontWeight:600, lineHeight:1, marginTop:2}}>{topCat.n}</div>
                    <div className="mono small tabular">{topCat.pct}%</div>
                  </div>
                );
              })()}
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
            <div key={i} onClick={() => onNavigate('tx', {
                id: r[6] || null, merchant: r[1], note: r[2], time: r[3],
                amount: r[4], category: r[0], label: r[8] || 'expense',
                type: r[8]==='income'?'income':'expense',
                source: 'gmail', txn_date: r[7], dateLong: r[5],
              })} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<txs.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
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
const Transactions = ({ filterPreset = null, onClearPreset = () => {}, onTxOpen = () => {}, onSearch = () => {} }) => {
  const filters = useFilters({ time: 'month', type: 'all' });
  const [showMore,    setShowMore]    = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch,  setShowSearch]  = useState(false);
  const [allRows, setAllRows] = useState([
    { day:'Today', dayOffset:0, items:[
      {category:'food',merchant:'Swiggy',note:'Dinner — Toit',time:'9:12 PM',amount:420,source:'gmail',account:'cards',type:'expense'},
      {category:'travel',merchant:'Uber',note:'Indiranagar → HSR',time:'3:40 PM',amount:186,source:'sms',account:'upi',type:'expense'},
    ]},
    {day:'Yesterday',dayOffset:1,items:[
      {category:'grocery',merchant:'BigBasket',note:'Weekly stock-up',time:'7:20 PM',amount:1240,source:'gmail',account:'cards',type:'expense'},
      {category:'subs',merchant:'Spotify Family',note:'Auto-renew',time:'12:00 AM',amount:199,source:'gmail',account:'cards',type:'expense'},
    ]},
    {day:'Mon · Mar 31',dayOffset:35,items:[
      {category:'income',merchant:'Salary · Acme Corp',note:'Direct deposit',time:'9:30 AM',amount:142500,source:'gmail',account:'cards',type:'income'},
    ]},
  ]);

  useEffect(() => {
    const _txDateFrom = (() => { const d = new Date(); d.setMonth(d.getMonth()-2); d.setDate(1); return d.toISOString().split('T')[0]; })();
    GxAPI.get(`/api/transactions?limit=200&offset=0&date_from=${_txDateFrom}`).then(data => {
      if (!data?.items?.length) return;
      const today = new Date(); today.setHours(0,0,0,0);
      const grouped = {};
      data.items.forEach(tx => {
        const key = tx.txn_date || '';
        if (!grouped[key]) grouped[key] = [];
        grouped[key].push({
          category: tx.category || 'other',
          merchant: tx.merchant || 'Unknown',
          note: tx.user_notes || '',
          time: '',
          amount: Math.abs(tx.amount || 0),
          source: tx.source || 'manual',
          account: '',
          type: tx.label === 'income' ? 'income' : tx.label === 'self_transfer' ? 'self_transfer' : 'expense',
          id: tx.id,
          status: tx.status,
          label: tx.label,
          txn_date: tx.txn_date,
          user_notes: tx.user_notes || '',
        });
      });
      const rows = Object.entries(grouped)
        .sort(([a],[b]) => b.localeCompare(a))
        .map(([date, items], i) => {
          const d = new Date(date + 'T00:00:00');
          const off = Math.round((today - d) / 86400000);
          return { day: _fmtDay(date), dayOffset: off, items };
        });
      setAllRows(rows);
    }).catch(() => {});
  }, []);

  const _matchesSearch = (r) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (r.merchant||'').toLowerCase().includes(q) || (r.note||'').toLowerCase().includes(q) || (r.category||'').toLowerCase().includes(q);
  };

  // apply filters + search
  const groups = allRows
    .map(g => ({ ...g, items: g.items.filter(r => rowMatches({ ...r, dayOffset: g.dayOffset }, filters.values) && _matchesSearch(r)) }))
    .filter(g => g.items.length > 0);

  const totalShown = groups.reduce((acc, g) => acc + g.items.length, 0);
  const sumExp = groups.reduce((acc, g) => acc + g.items.filter(r => r.type==='expense').reduce((a,r)=>a+r.amount,0), 0);
  const sumInc = groups.reduce((acc, g) => acc + g.items.filter(r => r.type==='income').reduce((a,r)=>a+r.amount,0), 0);

  const presets = [
    ['Eating out · this week', { time:'week', type:'expense', cats:['food','coffee'] }],
    ['Big purchases · this month', { time:'month', type:'expense', cats:[], amountMin:'2000' }],
    ['Subscriptions only', { type:'expense', cats:['subs'] }],
    ['Income this month', { time:'month', type:'income', cats:[] }],
  ];

  const _curMonth = () => new Date().toLocaleString('en-IN', { month:'long' });

  return (
    <div className="scroll" data-screen-label="03 Transactions">
      <div style={{padding:'8px 22px 0'}}>

        {/* header + search toggle */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12}}>
          {showSearch ? (
            <div style={{flex:1, display:'flex', gap:8, alignItems:'center'}}>
              <input autoFocus value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search transactions…"
                style={{flex:1, padding:'8px 12px', borderRadius:10, border:'1.5px solid var(--brand)', background:'var(--surface-2)', fontFamily:'inherit', fontSize:14, outline:'none', color:'var(--ink)'}}
              />
              <button onClick={() => { setShowSearch(false); setSearchQuery(''); }} className="btn btn-ghost" style={{padding:'8px 10px', fontSize:12, fontWeight:600, color:'var(--brand)'}}>Done</button>
            </div>
          ) : (
            <>
              <div className="h2">Activity</div>
              <div style={{display:'flex', gap:6}}>
                <button onClick={() => setShowSearch(true)} className="btn-ghost btn" style={{padding:8, borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}>
                  <Icon name="search" size={16}/>
                </button>
                <button onClick={() => setShowMore(true)} className="btn-ghost btn" style={{padding:8, borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}>
                  <Icon name="filter" size={16}/>
                </button>
              </div>
            </>
          )}
        </div>

        {/* filter preset banner */}
        {filterPreset && (
          <div className="card fade-up fade-up-1" style={{padding:'10px 14px', marginBottom:12, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', display:'flex', alignItems:'center', gap:10}}>
            <div style={{flex:1, fontSize:13, fontWeight:600, color:'var(--ink)'}}>Filtered view</div>
            <button onClick={onClearPreset} className="btn btn-ghost" style={{padding:'6px 10px', fontSize:11, fontWeight:600, color:'var(--brand)'}}>Clear</button>
          </div>
        )}

        {/* search active indicator */}
        {searchQuery && (
          <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
            <span className="small" style={{color:'var(--ink-3)'}}>Results for "{searchQuery}"</span>
            <button onClick={() => setSearchQuery('')} className="btn-ghost btn" style={{padding:'2px 8px', fontSize:11, color:'var(--err)'}}>Clear</button>
          </div>
        )}

        {/* summary tile — matches original layout */}
        <div className="card fade-up fade-up-2" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <div>
              <div className="label">{filters.values.type === 'income' ? 'Income' : filters.values.type === 'expense' ? 'Spent' : 'Net'}</div>
              <div className="tabular" style={{fontSize:26, fontWeight:600, letterSpacing:'-0.02em', marginTop:2}}>
                {filters.values.type === 'income' ? '+' : filters.values.type === 'expense' ? '−' : ''}₹{(filters.values.type==='income'?sumInc:filters.values.type==='expense'?sumExp:Math.abs(sumInc-sumExp)).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="label">Transactions</div>
              <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>{totalShown}</div>
            </div>
            {sumInc > 0 && filters.values.type === 'all' && (
              <div style={{textAlign:'right'}}>
                <div className="label">Income</div>
                <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2, color:'var(--ok)'}}>+₹{sumInc.toLocaleString('en-IN')}</div>
              </div>
            )}
          </div>
        </div>

        {/* universal filter bar */}
        <div className="fade-up fade-up-3" style={{marginBottom:14}}>
          <FilterBar filters={filters} onMore={() => setShowMore(true)}/>
        </div>

        {groups.length === 0 && (
          <div className="card fade-up fade-up-3" style={{padding:'30px 18px', textAlign:'center', color:'var(--ink-3)'}}>
            <Icon name="filter" size={20}/>
            <div style={{marginTop:8, fontWeight:600, color:'var(--ink-2)'}}>No transactions match</div>
            <div className="small" style={{marginTop:2}}>Try clearing some filters</div>
            <button onClick={filters.reset} className="btn btn-ghost" style={{marginTop:12, padding:'8px 14px', fontSize:12, fontWeight:600, color:'var(--brand)'}}>Reset filters</button>
          </div>
        )}

        {groups.map((g, gi) => {
          const dayTotal = g.items.reduce((a,r)=>a+r.amount,0);
          const isIncomeDay = g.items.every(r => r.type === 'income');
          return (
            <div key={g.day} className={`fade-up fade-up-${(gi%5)+3}`} style={{marginBottom:18}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'4px 4px 8px'}}>
                <div style={{fontSize:13, fontWeight:600, color:'var(--ink-2)'}}>{g.day}</div>
                <div className="mono small tabular" style={{color: isIncomeDay ? 'var(--ok)' : 'var(--ink-2)'}}>
                  {isIncomeDay ? '+' : ''}₹{dayTotal.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="card" style={{padding:'4px 0'}}>
                {g.items.map((r, i) => {
                  const isIncome = r.type === 'income';
                  return (
                    <div key={i} onClick={() => onTxOpen({
                        id: r.id || null,
                        merchant: r.merchant, note: r.note || r.user_notes || '',
                        amount: r.amount, category: r.category,
                        label: r.label, type: r.type,
                        source: r.source, txn_date: r.txn_date,
                        dateLong: g.day, user_notes: r.user_notes || '',
                        status: r.status,
                      })} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<g.items.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
                      <CatIcon kind={r.category}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                          <div style={{fontWeight:600, fontSize:14}}>{r.merchant}</div>
                          <div className="tabular" style={{fontWeight:600, fontSize:14, color: isIncome ? 'var(--ok)' : 'var(--ink)'}}>
                            {isIncome ? '+' : '−'}₹{r.amount.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:2}}>
                          <div className="small">{r.note}</div>
                          <div className="small mono" style={{display:'flex', alignItems:'center', gap:6}}>
                            <span>{r.time}</span>
                            <span style={{fontSize:9, padding:'1px 6px', borderRadius:4, background:'var(--surface-2)', color:'var(--ink-3)'}}>{r.source[0].toUpperCase()+r.source.slice(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{height:30}}/>
      </div>

      <FilterSheet open={showMore} onClose={() => setShowMore(false)} filters={filters} presets={presets}/>
    </div>
  );
};
// ============================================================
const _DEFAULT_SPARK = 'M0 12 L24 11 L48 13 L72 12 L96 11 L120 12 L144 13 L168 12';
// Per-category sparklines from original hi-fi design
const _CAT_SPARKS = {
  food:    'M0 18 L24 14 L48 16 L72 10 L96 12 L120 6 L144 4 L168 2',
  grocery: 'M0 16 L24 14 L48 12 L72 10 L96 12 L120 8 L144 10 L168 6',
  travel:  'M0 4 L24 6 L48 8 L72 6 L96 10 L120 12 L144 14 L168 18',
  fuel:    'M0 6 L24 8 L48 10 L72 12 L96 14 L120 12 L144 14 L168 16',
  shop:    'M0 16 L24 14 L48 12 L72 8 L96 10 L120 6 L144 8 L168 4',
  subs:    'M0 12 L24 11 L48 13 L72 12 L96 11 L120 12 L144 13 L168 12',
  bills:   'M0 14 L24 12 L48 14 L72 10 L96 12 L120 8 L144 10 L168 8',
  health:  'M0 10 L24 12 L48 10 L72 14 L96 12 L120 10 L144 12 L168 10',
  coffee:  'M0 8 L24 10 L48 8 L72 12 L96 10 L120 8 L144 10 L168 8',
  rent:    'M0 12 L24 12 L48 12 L72 12 L96 12 L120 12 L144 12 L168 12',
};
// Static fallback AI patterns shown when API returns empty
const _STATIC_INSIGHTS = [
  { id:'s1', icon:'sparkle', title:'Weekend spender', body:'You spend ~2.4× more on Sat/Sun. Mostly food & travel.' },
  { id:'s2', icon:'repeat',  title:'Recurring expenses', body:'Subscriptions & bills run on autopilot every month.' },
  { id:'s3', icon:'sun',     title:'Mornings are cheapest', body:'Avg spend before noon is lower than evening hours.' },
];

// Build an SVG path from an array of values
const _makePath = (vals) => {
  if (!vals || vals.length < 2) return _DEFAULT_SPARK;
  const w = 168, h = 22, pad = 2;
  const max = Math.max(...vals) || 1;
  const step = (w - pad*2) / (vals.length - 1);
  return 'M' + vals.map((v, i) => {
    const x = (pad + i * step).toFixed(1);
    const y = (h - pad - ((v / max) * (h - pad*2))).toFixed(1);
    return `${x} ${y}`;
  }).join(' L');
};

const Insights = ({ onCategoryOpen = () => {}, onAIExplain = () => {} }) => {
  const filters = useFilters({ time: 'month', type: 'expense' });
  const [showMore, setShowMore] = useState(false);
  const [period, setPeriod] = useState('M');

  // Trend chart state
  const [trendPts, setTrendPts] = useState([42,28,56,36,64,50,72,58,82,66,74,92]);
  const [trendTotal, setTrendTotal] = useState(0);
  const [trendDelta, setTrendDelta] = useState(null); // null = no data
  const [trendLabels, setTrendLabels] = useState(['','','']);

  // Category list state
  const [allCats, setAllCats] = useState([]);

  // AI insights state
  const [aiPatterns, setAiPatterns] = useState([]);

  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 300); return () => clearTimeout(t); }, []);

  // Fetch everything when period changes
  useEffect(() => {
    setDrawn(false);
    const apiPeriod = period === 'W' ? '1m' : period === 'Y' ? '1y' : '1m';

    Promise.all([
      GxAPI.get(period === 'M' ? `/api/stats/summary?${_liveMonthParams()}` : `/api/stats/summary?period=${apiPeriod}`),
      GxAPI.get(period === 'M' ? `/api/stats/category-breakdown?${_liveMonthParams()}` : `/api/stats/category-breakdown?period=${apiPeriod}`),
      GxAPI.get(`/api/stats/income-vs-expense?period=${apiPeriod}`),
      GxAPI.get('/api/insights'),
    ]).then(([stats, catsData, trendData, insightsData]) => {
      // Trend chart
      if (stats) setTrendTotal(Math.round((stats.total_expenses||0) + (stats.total_investments||0) + (stats.total_cc_payments||0)));

      if (trendData?.months?.length) {
        const months = trendData.months;
        let pts;
        if (period === 'W') {
          // Use last 7 entries if available
          pts = months.slice(-7).map(m => Math.round(m.expenses || 0));
        } else {
          pts = months.map(m => Math.round(m.expenses || 0));
        }
        if (pts.length > 1) setTrendPts(pts);

        // Delta: compare last vs second-to-last
        if (months.length >= 2) {
          const last = months[months.length-1]?.expenses || 0;
          const prev = months[months.length-2]?.expenses || 1;
          const pct = prev > 0 ? Math.round(((last - prev) / prev) * 100) : 0;
          setTrendDelta(pct);
        }

        // Labels: first, mid, last month labels
        const fmt = (m) => {
          if (!m?.month) return '';
          const [y, mo] = m.month.split('-');
          return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][(parseInt(mo)-1)] || '';
        };
        const mid = Math.floor(months.length / 2);
        setTrendLabels([fmt(months[0]), fmt(months[mid]), fmt(months[months.length-1])]);
      }

      // Categories
      if (catsData?.categories?.length) {
        setAllCats(catsData.categories.slice(0, 6).map((c, i) => {
          const k = (c.category || 'other').toLowerCase();
          const v = Math.round(c.amount || 0);
          const spark = _CAT_SPARKS[k] || _DEFAULT_SPARK;
          // Determine dir from sparkline shape — up if endpoint lower (more spend), down if higher
          const isUpSpend = spark.endsWith('2') || spark.includes('168 2') || spark.includes('168 4');
          const isDownSpend = spark.includes('168 16') || spark.includes('168 18');
          const dir = isUpSpend ? 'up' : isDownSpend ? 'down' : 'flat';
          return [k, k.charAt(0).toUpperCase() + k.slice(1), `₹${v.toLocaleString('en-IN')}`, '', dir, spark, v];
        }));
      }

      // AI insights — use API data if available, else static fallback
      const src = insightsData?.insights || insightsData?.patterns || [];
      if (src.length) {
        setAiPatterns(src.slice(0, 3).map(ins => ({
          icon: 'sparkle',
          title: ins.title || ins.label || 'Insight',
          body: ins.body || ins.description || '',
          id: ins.id,
        })));
      } else {
        setAiPatterns(_STATIC_INSIGHTS);
      }

      setTimeout(() => setDrawn(true), 300);
    }).catch(() => { setTimeout(() => setDrawn(true), 300); });
  }, [period]);

  // Trend chart geometry
  const w = 320, h = 140, padX = 8, padY = 16;
  const maxPt = Math.max(...trendPts) || 1;
  const step = trendPts.length > 1 ? (w - padX*2) / (trendPts.length-1) : 1;
  const xy = trendPts.map((v,i)=>[padX + i*step, h - padY - (v/maxPt)*(h-padY*2)]);
  const linePath = "M" + xy.map(p=>p.map(n=>n.toFixed(1)).join(",")).join(" L");
  const areaPath = xy.length > 1 ? linePath + ` L${xy[xy.length-1][0].toFixed(1)},${h-padY} L${padX},${h-padY} Z` : '';

  const periodLabel = period === 'W' ? 'Spend trend · 7 days' : period === 'Y' ? 'Spend trend · 12 months' : 'Spend trend · 12 months';

  return (
    <div className="scroll" data-screen-label="04 Insights">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16}}>
          <div className="h2">Insights</div>
        </div>

        {/* universal filter bar */}
        <div className="fade-up fade-up-1" style={{marginBottom:14}}>
          <FilterBar filters={filters} onMore={() => setShowMore(true)}/>
        </div>

        {/* trend chart card */}
        <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
            <div>
              <div className="label">{periodLabel}</div>
              <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
                {trendTotal > 0
                  ? <span className="tabular" style={{fontSize:26,fontWeight:600,letterSpacing:'-0.02em'}}>₹{trendTotal.toLocaleString('en-IN')}</span>
                  : <span className="tabular" style={{fontSize:26,fontWeight:600,letterSpacing:'-0.02em',color:'var(--ink-4)'}}>—</span>
                }
                {trendDelta !== null && trendDelta !== 0 && (
                  <span className="mono small tabular" style={{color: trendDelta > 0 ? 'var(--err)' : 'var(--ok)'}}>
                    {trendDelta > 0 ? '↑' : '↓'} {Math.abs(trendDelta)}%
                  </span>
                )}
              </div>
            </div>
            <div style={{display:'flex', gap:4}}>
              {['W','M','Y'].map(p => <Chip key={p} active={period===p} onClick={() => setPeriod(p)}>{p}</Chip>)}
            </div>
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', marginTop:14, height:h}}>
            <defs>
              <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.32"/>
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <line x1={padX} y1={h*0.35} x2={w-padX} y2={h*0.35} stroke="var(--line)" strokeDasharray="2 4"/>
            <line x1={padX} y1={h*0.65} x2={w-padX} y2={h*0.65} stroke="var(--line)" strokeDasharray="2 4"/>
            {areaPath && <path d={areaPath} fill="url(#grad)" style={{opacity:drawn?1:0,transition:'opacity 0.6s ease 0.4s'}}/>}
            <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{strokeDasharray:1000,strokeDashoffset:drawn?0:1000,transition:'stroke-dashoffset 1.4s cubic-bezier(0.4,0.8,0.4,1)'}}/>
            {xy.map((p,i)=>i%Math.max(1,Math.floor(xy.length/4))===0 && <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" style={{opacity:drawn?1:0,transition:`opacity 0.3s ease ${0.6+i*0.05}s`}}/>)}
          </svg>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:6}}>
            {trendLabels.map((l,i) => <span key={i} className="small mono">{l}</span>)}
          </div>
        </div>

        {/* MONEY FLOW */}
        <MoneyFlow drawn={drawn}/>

        {/* category deltas */}
        <div className="label" style={{margin:'14px 4px 8px'}}>By category</div>
        {allCats.length === 0 ? (
          <div className="card" style={{padding:18,textAlign:'center',color:'var(--ink-3)',fontSize:13}}>Loading categories…</div>
        ) : (() => {
          const visible = filters.values.cats.length > 0
            ? allCats.filter(c => filters.values.cats.includes(c[0]))
            : allCats.slice(0, 4);
          if (visible.length === 0) return <div className="card" style={{padding:18,textAlign:'center',color:'var(--ink-3)',fontSize:13}}>No categories match selected filters</div>;
          return visible.map(([k, n, v, delta, dir, path, rawAmt], i) => (
            <div key={k} onClick={() => onCategoryOpen({k, name:n, spent:rawAmt||0, budget:Math.round((rawAmt||0)*1.2)})} className={`card fade-up fade-up-${i+3}`} style={{padding:'12px 14px',marginBottom:8,cursor:'pointer'}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <CatIcon kind={k}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}>
                    <div style={{fontWeight:600,fontSize:14}}>{n}</div>
                    <div className="tabular" style={{fontWeight:600,fontSize:14}}>{v}</div>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6}}>
                    <svg viewBox="0 0 168 22" width="110" height="18">
                      <path d={path} fill="none" stroke={dir==='up'?'var(--err)':dir==='down'?'var(--ok)':'var(--ink-3)'} strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <div className="mono tabular" style={{fontSize:12, fontWeight:600, color:dir==='up'?'var(--err)':dir==='down'?'var(--ok)':'var(--ink-3)', display:'flex', alignItems:'center', gap:2}}>
                      {dir==='up'?<Icon name="arrowUp" size={12} stroke={2.5}/>:dir==='down'?<Icon name="arrowDn" size={12} stroke={2.5}/>:'→'}
                      {delta || 'this mo'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ));
        })()}

        {/* AI patterns */}
        <div className="label" style={{margin:'18px 4px 8px'}}>Patterns we spotted</div>
        {aiPatterns.length === 0 ? (
          <div className="card" style={{padding:18,textAlign:'center',color:'var(--ink-3)',fontSize:13}}>No patterns yet — sync more transactions to generate insights</div>
        ) : aiPatterns.map((ins, i) => (
          <div key={ins.id || i} onClick={() => onAIExplain({text:ins.title, reasoning:[], sources:[]})} className={`card fade-up fade-up-${i+5}`} style={{padding:14,marginBottom:8,background:'var(--brand-soft)',border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)',cursor:'pointer'}}>
            <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
              <div style={{width:32,height:32,borderRadius:9,background:'var(--brand)',color:'#fff',display:'grid',placeItems:'center',flexShrink:0}}>
                <Icon name="sparkle" size={16}/>
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:600,fontSize:14}}>{ins.title}</div>
                <div className="body" style={{marginTop:2,fontSize:13}}>{ins.body}</div>
              </div>
              <Icon name="chevron" size={16} style={{color:'var(--ink-3)',marginTop:6}}/>
            </div>
          </div>
        ))}

        <div style={{height:30}}/>
      </div>
      <FilterSheet open={showMore} onClose={() => setShowMore(false)} filters={filters} presets={[
        ['Food spending · this month', { time:'month', type:'expense', cats:['food','coffee'] }],
        ['Subscriptions only', { type:'expense', cats:['subs'] }],
        ['Travel · last 90 days', { time:'90d', type:'expense', cats:['travel'] }],
      ]}/>
    </div>
  );
};

Object.assign(window, { Dashboard, Transactions, Insights });

