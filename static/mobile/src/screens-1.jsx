/* Gexpense Hi-Fi — Dashboard, Transactions, Insights screens */
const { useState, useEffect, useRef } = React;

// ============================================================
// DASHBOARD
// ============================================================
const Dashboard = ({ onNavigate, onAdd }) => {
  const [pct, setPct] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => { const t = setTimeout(() => setPct(70), 200); return () => clearTimeout(t); }, []);

  const txs = [
    ['food','Swiggy','Dinner · Toit','9:12 PM',420, 'Today'],
    ['travel','Uber','Indiranagar → HSR','3:40 PM',186, 'Today'],
    ['subs','Spotify','Family · auto-renew','Yesterday',199, 'Yesterday'],
    ['grocery','BigBasket','Weekly stock-up','Yesterday',1240, 'Yesterday'],
    ['bills','Airtel','Postpaid · auto-paid','Apr 22',599, 'Apr 22'],
  ];

  // donut data
  const cats = [
    {n: 'Food',   v: 13500, c: 'var(--brand)',     pct: 32},
    {n: 'Rent',   v: 10000, c: 'var(--ink-2)',     pct: 24},
    {n: 'Travel', v: 8400,  c: '#1F4FA8',          pct: 20},
    {n: 'Shop',   v: 5900,  c: '#5530A8',          pct: 14},
    {n: 'Other',  v: 4380,  c: 'var(--ink-4)',     pct: 10},
  ];
  let cum = 0;
  const C = 2 * Math.PI * 60;

  return (
    <div className="scroll" data-screen-label="01 Dashboard">
      <div style={{padding: '8px 22px 0'}}>
        {/* greeting */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 18}}>
          <div>
            <div className="small">Good evening</div>
            <div className="h2" style={{marginTop:2}}>Aman Sharma</div>
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
                <span className="tabular" style={{fontSize: 38, fontWeight: 600, letterSpacing:'-0.025em', color:'var(--ink)'}}>₹42,180</span>
              </div>
              <div className="small tabular" style={{marginTop:2}}>of ₹60,000 budget</div>
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
            <div className="mono small tabular" style={{color:'var(--ink)'}}>₹17,820 left</div>
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
                <div style={{fontSize:18, fontWeight:600, lineHeight:1, marginTop:2}}>Food</div>
                <div className="mono small tabular">32%</div>
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
const Transactions = ({ filterPreset = null, onClearPreset = () => {}, onTxOpen = () => {}, onSearch = () => {} }) => {
  const filters = useFilters({
    time: filterPreset === 'this-month' ? 'month' : 'month',
    type: filterPreset === 'this-month' ? 'all' : 'all',
  });
  const [showMore, setShowMore] = useState(false);

  // base data — each row has all fields needed by the universal filter
  // dayOffset: days back from today (0=today, 1=yesterday)
  const allRows = [
    { day:'Today',         dayOffset: 0, items: [
      { category:'food',    merchant:'Swiggy',      note:'Dinner — Toit',          time:'9:12 PM', amount:420,    source:'gmail', account:'cards', type:'expense' },
      { category:'travel',  merchant:'Uber',        note:'Indiranagar → HSR',      time:'3:40 PM', amount:186,    source:'sms',   account:'upi',   type:'expense' },
    ]},
    { day:'Yesterday',     dayOffset: 1, items: [
      { category:'grocery', merchant:'BigBasket',   note:'Weekly stock-up',        time:'7:20 PM', amount:1240,   source:'gmail', account:'cards', type:'expense' },
      { category:'subs',    merchant:'Spotify Family', note:'Auto-renew',          time:'12:00 AM', amount:199,   source:'gmail', account:'cards', type:'expense' },
    ]},
    { day:'Tue · Apr 22',  dayOffset: 3, items: [
      { category:'bills',   merchant:'Airtel',      note:'Postpaid · auto-paid',   time:'5:30 PM', amount:599,    source:'gmail', account:'cards', type:'expense' },
      { category:'fuel',    merchant:'Shell',       note:'MG Rd · Card ••42',      time:'8:15 AM', amount:1200,   source:'sms',   account:'cards', type:'expense' },
      { category:'coffee',  merchant:'Blue Tokai',  note:'Morning latte',          time:'7:50 AM', amount:359,    source:'gmail', account:'upi',   type:'expense' },
    ]},
    { day:'Mon · Apr 21',  dayOffset: 4, items: [
      { category:'food',    merchant:'Zomato',      note:'Lunch — Burma Burma',    time:'1:08 PM', amount:480,    source:'gmail', account:'upi',   type:'expense' },
    ]},
    { day:'Fri · Apr 18',  dayOffset: 7, items: [
      { category:'shop',    merchant:'Decathlon',   note:'Running shoes',          time:'6:42 PM', amount:4290,   source:'gmail', account:'cards', type:'expense' },
      { category:'food',    merchant:'Toit',        note:'Friday pints',           time:'10:20 PM', amount:1850,  source:'sms',   account:'cards', type:'expense' },
    ]},
    { day:'Wed · Apr 16',  dayOffset: 9, items: [
      { category:'travel',  merchant:'IndiGo',      note:'BLR → BOM',              time:'11:00 AM', amount:6480,  source:'gmail', account:'cards', type:'expense' },
    ]},
    { day:'Mon · Mar 31',  dayOffset: 35, items: [
      { category:'income',  merchant:'Salary · Acme Corp', note:'Direct deposit · HDFC ••1042', time:'9:30 AM', amount:142500, source:'gmail', account:'cards', type:'income' },
    ]},
    { day:'Fri · Mar 28',  dayOffset: 38, items: [
      { category:'income',  merchant:'Freelance · Notion review', note:'UPI from rohan@okhdfc', time:'2:14 PM', amount:8400, source:'sms', account:'upi', type:'income' },
    ]},
    { day:'Wed · Mar 26',  dayOffset: 40, items: [
      { category:'income',  merchant:'Cashback · CRED', note:'Rewards credit',     time:'11:02 AM', amount:2200,  source:'gmail', account:'cards', type:'income' },
    ]},
  ];

  // apply filters
  const groups = allRows
    .map(g => ({ ...g, items: g.items.filter(r => rowMatches({ ...r, dayOffset: g.dayOffset }, filters.values)) }))
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

  return (
    <div className="scroll" data-screen-label="03 Transactions">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16}}>
          <div className="h2">Activity</div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn-ghost btn" style={{padding:'8px', borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}><Icon name="search" size={16}/></button>
            <button className="btn-ghost btn" style={{padding:'8px', borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}><Icon name="filter" size={16}/></button>
          </div>
        </div>

        {filterPreset === 'this-month' && (
          <div className="card fade-up fade-up-1" style={{padding:'10px 14px', marginBottom:12, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28, height:28, borderRadius:8, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
              <Icon name="filter" size={14}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600, color:'var(--ink)'}}>April expenses · late-March income</div>
              <div className="small" style={{marginTop:1}}>Showing this month's spend & last week of March income</div>
            </div>
            <button className="btn-ghost btn" onClick={onClearPreset} style={{padding:'6px 10px', fontSize:11, fontWeight:600, color:'var(--brand)'}}>Clear</button>
          </div>
        )}

        {/* summary tile — driven by filtered totals */}
        <div className="card fade-up fade-up-2" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <div>
              <div className="label">{filters.values.type === 'income' ? 'Income' : filters.values.type === 'expense' ? 'Spent' : 'Net'}</div>
              <div className="tabular" style={{fontSize: 26, fontWeight: 600, letterSpacing:'-0.02em', marginTop:2}}>
                {filters.values.type === 'income' ? '+' : filters.values.type === 'expense' ? '−' : ''}₹{(filters.values.type==='income'?sumInc:filters.values.type==='expense'?sumExp:Math.abs(sumInc-sumExp)).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="label">Transactions</div>
              <div className="tabular" style={{fontSize: 18, fontWeight:600, marginTop:2}}>{totalShown}</div>
            </div>
            {sumInc > 0 && filters.values.type === 'all' && (
              <div style={{textAlign:'right'}}>
                <div className="label">Income</div>
                <div className="tabular" style={{fontSize: 18, fontWeight:600, marginTop:2, color:'var(--ok)'}}>+₹{sumInc.toLocaleString('en-IN')}</div>
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
                    <div key={i} onClick={() => onTxOpen({ merchant:r.merchant, note:r.note, time:r.time, amount:r.amount, category:r.category, categoryLabel:r.category[0].toUpperCase()+r.category.slice(1), source:r.source[0].toUpperCase()+r.source.slice(1), sourceDetail:r.source+' receipt', dateLong:g.day, account:'HDFC ••1042', id:'tx_'+gi+'_'+i, type:r.type, aiTags:isIncome?[]:['Auto-categorized'] })} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<g.items.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
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
const Insights = ({ onCategoryOpen = () => {}, onAIExplain = () => {} }) => {
  const filters = useFilters({ time: 'month', type: 'expense' });
  const [showMore, setShowMore] = useState(false);
  const pts = [42, 28, 56, 36, 64, 50, 72, 58, 82, 66, 74, 92];
  const w = 320, h = 140, padX = 8, padY = 16;
  const max = 100;
  const step = (w - padX*2) / (pts.length-1);
  const xy = pts.map((v,i)=>[padX + i*step, h - padY - (v/max)*(h-padY*2)]);
  const linePath = "M" + xy.map(p=>p.map(n=>n.toFixed(1)).join(",")).join(" L");
  const areaPath = linePath + ` L${xy[xy.length-1][0].toFixed(1)},${h-padY} L${padX},${h-padY} Z`;

  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 300); return () => clearTimeout(t); }, []);

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
              <div className="label">Spend trend · 12 weeks</div>
              <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
                <span className="tabular" style={{fontSize: 26, fontWeight:600, letterSpacing:'-0.02em'}}>₹42,180</span>
                <span className="mono small tabular" style={{color:'var(--err)'}}>↑ 12%</span>
              </div>
            </div>
            <div style={{display:'flex', gap:4}}>
              <Chip>W</Chip>
              <Chip active>M</Chip>
              <Chip>Y</Chip>
            </div>
          </div>
          <svg viewBox={`0 0 ${w} ${h}`} style={{width:'100%', marginTop:14, height: h}}>
            <defs>
              <linearGradient id="grad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.32"/>
                <stop offset="100%" stopColor="var(--brand)" stopOpacity="0"/>
              </linearGradient>
            </defs>
            <line x1={padX} y1={h*0.35} x2={w-padX} y2={h*0.35} stroke="var(--line)" strokeDasharray="2 4"/>
            <line x1={padX} y1={h*0.65} x2={w-padX} y2={h*0.65} stroke="var(--line)" strokeDasharray="2 4"/>
            <path d={areaPath} fill="url(#grad)" style={{opacity: drawn ? 1 : 0, transition: 'opacity 0.6s ease 0.4s'}}/>
            <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{
                strokeDasharray: 1000, strokeDashoffset: drawn ? 0 : 1000,
                transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0.8, 0.4, 1)'
              }}
            />
            {xy.map((p,i)=>i%3===2 && <circle key={i} cx={p[0]} cy={p[1]} r="3.5" fill="var(--surface)" stroke="var(--brand)" strokeWidth="2" style={{opacity: drawn ? 1 : 0, transition: `opacity 0.3s ease ${0.6 + i*0.05}s`}}/>)}
          </svg>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:6}}>
            <span className="small mono">Feb</span>
            <span className="small mono">Mar</span>
            <span className="small mono">Apr</span>
          </div>
        </div>

        {/* MONEY FLOW */}
        <MoneyFlow drawn={drawn}/>

        {/* category deltas — filtered by selected cats (if any) */}
        <div className="label" style={{margin:'14px 4px 8px'}}>By category</div>
        {(() => {
          const allCats = [
            ['food','Food','₹13,500','+22%','up','M0 18 L24 14 L48 16 L72 10 L96 12 L120 6 L144 4 L168 2'],
            ['travel','Travel','₹8,400','−8%','down','M0 4 L24 6 L48 8 L72 6 L96 10 L120 12 L144 14 L168 18'],
            ['subs','Subscriptions','₹3,200','+0%','flat','M0 12 L24 11 L48 13 L72 12 L96 11 L120 12 L144 13 L168 12'],
            ['shop','Shopping','₹5,900','+14%','up','M0 16 L24 14 L48 12 L72 8 L96 10 L120 6 L144 8 L168 4'],
            ['bills','Bills','₹2,100','+5%','up','M0 14 L24 12 L48 14 L72 10 L96 12 L120 8 L144 10 L168 8'],
            ['fuel','Fuel','₹1,800','−12%','down','M0 6 L24 8 L48 10 L72 12 L96 14 L120 12 L144 14 L168 16'],
          ];
          const visible = filters.values.cats.length > 0 ? allCats.filter(c => filters.values.cats.includes(c[0])) : allCats.slice(0, 4);
          if (visible.length === 0) return <div className="card" key="empty" style={{padding:'18px', textAlign:'center', color:'var(--ink-3)', fontSize:13}}>No categories match selected filters</div>;
          return visible.map(([k, n, v, delta, dir, path], i) => (
          <div key={k} onClick={() => onCategoryOpen({ k, name:n, spent:Number(v.replace(/[^\d]/g,'')), budget: Number(v.replace(/[^\d]/g,'')) * (dir==='up' ? 0.85 : 1.2) | 0 })} className={`card fade-up fade-up-${i+3}`} style={{padding:'12px 14px', marginBottom:8, cursor:'pointer'}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <CatIcon kind={k}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <div style={{fontWeight:600, fontSize:14}}>{n}</div>
                  <div className="tabular" style={{fontWeight:600, fontSize:14}}>{v}</div>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6}}>
                  <svg viewBox="0 0 168 22" width="110" height="18">
                    <path d={path} fill="none" stroke={dir==='up' ? 'var(--err)' : dir==='down' ? 'var(--ok)' : 'var(--ink-3)'} strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <div className="mono tabular" style={{fontSize: 12, fontWeight:600, color: dir==='up' ? 'var(--err)' : dir==='down' ? 'var(--ok)' : 'var(--ink-3)', display:'flex', alignItems:'center', gap:2}}>
                    {dir === 'up' ? <Icon name="arrowUp" size={12} stroke={2.5}/> : dir === 'down' ? <Icon name="arrowDn" size={12} stroke={2.5}/> : '→'}
                    {delta}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ));
        })()}

        {/* AI patterns */}
        <div className="label" style={{margin:'18px 4px 8px'}}>Patterns we spotted</div>
        {[
          ['sparkle','Weekend spender','You spend ~2.4× more on Sat/Sun. Mostly food & travel.'],
          ['repeat','₹3,200/mo on subscriptions','Spotify, Netflix, iCloud, NYT. 4 active.'],
          ['sun','Mornings are cheapest','Avg ₹120 before noon vs ₹680 after 7 PM.'],
        ].map(([ico, t, b], i)=>(
          <div key={i} onClick={() => onAIExplain({ text:t, reasoning:[
            'Looked at all transactions in the last 30 days.',
            'Grouped by day-of-week and time-of-day.',
            'Compared weekday vs weekend patterns and computed the ratio.',
            'Filtered to recurring patterns (≥3 occurrences) to avoid one-off noise.'
          ], sources:[
            { k:'food', merchant:'Swiggy', date:'Sat Apr 19', amount:680 },
            { k:'travel', merchant:'Uber', date:'Sat Apr 19', amount:340 },
            { k:'food', merchant:'Toit', date:'Sun Apr 20', amount:1240 },
            { k:'shop', merchant:'Decathlon', date:'Sat Apr 26', amount:2890 },
          ]})} className={`card fade-up fade-up-${i+5}`} style={{padding:14, marginBottom:8, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', cursor:'pointer'}}>
            <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
              <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
                <Icon name={ico} size={16}/>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:600, fontSize:14}}>{t}</div>
                <div className="body" style={{marginTop:2, fontSize:13}}>{b}</div>
              </div>
              <Icon name="chevron" size={16} style={{color:'var(--ink-3)', marginTop:6}}/>
            </div>
          </div>
        ))}

        <div style={{height: 30}}/>
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

