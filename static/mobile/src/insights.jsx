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

