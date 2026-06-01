const Insights = ({ onCategoryOpen = () => {}, onAIExplain = () => {} }) => {
  const filters = useFilters({ time: 'month', type: 'expense' });
  const [showMore, setShowMore] = useState(false);
  const [period, setPeriod] = useState('M');

  // Chart + summary data per period
  const [chartData, setChartData] = useState({ pts: [42, 28, 56, 36, 64, 50, 72, 58, 82, 66, 74, 92], total: 0, delta: 0 });
  const [allCats, setAllCats] = useState([]);
  const [aiInsights, setAiInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  const periodParam = period === 'W' ? '1m' : period === 'M' ? '1m' : '1y';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const fetchAll = async () => {
      const [trendData, summaryData, catsData, insightsData] = await Promise.all([
        GxAPI.get(`/api/stats/income-vs-expense?period=${periodParam}`),
        GxAPI.get(`/api/stats/summary?period=${periodParam}`),
        GxAPI.get(`/api/stats/category-breakdown?period=${periodParam}`),
        GxAPI.get('/api/insights'),
      ]);

      if (cancelled) return;

      // Build pts from months data
      let pts = [42, 28, 56, 36, 64, 50, 72, 58, 82, 66, 74, 92];
      let total = 0;
      let delta = 0;

      if (trendData && trendData.months && trendData.months.length > 0) {
        const months = trendData.months;
        pts = months.map(m => m.expenses || 0);
        if (period === 'W') pts = pts.slice(-1); // W: just use recent slice for visual
      }

      if (summaryData) {
        total = summaryData.total_expenses || 0;
        delta = summaryData.savings_rate || 0;
      }

      setChartData({ pts: pts.length >= 2 ? pts : [...pts, ...pts].slice(0, 12), total, delta });

      // Map categories: API shape { category, amount, pct, txn_count }
      if (catsData && catsData.categories) {
        const mapped = catsData.categories.map(cat => {
          const k = (cat.category || 'other').toLowerCase().replace(/\s+/g, '_');
          const n = cat.category ? (cat.category.charAt(0).toUpperCase() + cat.category.slice(1)) : 'Other';
          const v = '₹' + Math.round(cat.amount || 0).toLocaleString('en-IN');
          return [k, n, v, cat.amount || 0, '0%', 'flat', ''];
        });
        setAllCats(mapped);
      }

      // Map AI insights: API shape { id, type, title, body, generated_at }
      if (insightsData && insightsData.insights) {
        setAiInsights(insightsData.insights);
      }

      setLoading(false);
    };

    fetchAll();
    return () => { cancelled = true; };
  }, [period]);

  const w = 320, h = 140, padX = 8, padY = 16;
  const pts = chartData.pts;
  const max = Math.max(...pts, 1);
  const step = pts.length > 1 ? (w - padX * 2) / (pts.length - 1) : (w - padX * 2);
  const xy = pts.map((v, i) => [padX + i * step, h - padY - (v / max) * (h - padY * 2)]);
  const linePath = "M" + xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" L");
  const areaPath = linePath + ` L${xy[xy.length - 1][0].toFixed(1)},${h - padY} L${padX},${h - padY} Z`;

  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 300); return () => clearTimeout(t); }, []);

  const fmtTotal = '₹' + Math.round(chartData.total).toLocaleString('en-IN');

  if (loading) {
    return <div style={{padding:'40px 20px', textAlign:'center', color:'var(--ink-3)'}}>Loading insights...</div>;
  }

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
              <div className="label">Spend trend · {period === 'W' ? '4 weeks' : period === 'M' ? '12 months' : '12 months'}</div>
              <div style={{display:'flex', alignItems:'baseline', gap:8, marginTop:4}}>
                <span className="tabular" style={{fontSize: 26, fontWeight:600, letterSpacing:'-0.02em'}}>{fmtTotal}</span>
                {chartData.delta !== 0 && (
                  <span className="mono small tabular" style={{color: chartData.delta < 0 ? 'var(--ok)' : 'var(--err)'}}>
                    {chartData.delta > 0 ? '↑' : '↓'} {Math.abs(chartData.delta).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            <div style={{display:'flex', gap:4}}>
              <Chip onClick={() => setPeriod('W')} active={period === 'W'}>W</Chip>
              <Chip onClick={() => setPeriod('M')} active={period === 'M'}>M</Chip>
              <Chip onClick={() => setPeriod('Y')} active={period === 'Y'}>Y</Chip>
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
            <span className="small mono">Jan</span>
            <span className="small mono">Jun</span>
            <span className="small mono">Dec</span>
          </div>
        </div>

        {/* MONEY FLOW */}
        <MoneyFlow drawn={drawn}/>

        {/* category deltas — filtered by selected cats (if any) */}
        <div className="label" style={{margin:'14px 4px 8px'}}>By category</div>
        {(() => {
          const visible = filters.values.cats.length > 0
            ? allCats.filter(c => filters.values.cats.includes(c[0]))
            : allCats.slice(0, 4);
          if (visible.length === 0) return <div className="card" key="empty" style={{padding:'18px', textAlign:'center', color:'var(--ink-3)', fontSize:13}}>No categories match selected filters</div>;
          return visible.map(([k, n, v, rawVal, delta, dir, path], i) => (
            <div key={k} onClick={() => onCategoryOpen({ k, name:n, spent: rawVal, budget: Math.round(rawVal * 1.1) })} className={`card fade-up fade-up-${i+3}`} style={{padding:'12px 14px', marginBottom:8, cursor:'pointer'}}>
              <div style={{display:'flex', alignItems:'center', gap:12}}>
                <CatIcon kind={k}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                    <div style={{fontWeight:600, fontSize:14}}>{n}</div>
                    <div className="tabular" style={{fontWeight:600, fontSize:14}}>{v}</div>
                  </div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6}}>
                    <svg viewBox="0 0 168 22" width="110" height="18">
                      <path d={path || 'M0 11 L168 11'} fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round"/>
                    </svg>
                    <div className="mono tabular" style={{fontSize: 12, fontWeight:600, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:2}}>
                      →{delta}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ));
        })()}

        {/* AI patterns */}
        <div className="label" style={{margin:'18px 4px 8px'}}>Patterns we spotted</div>
        {aiInsights.length === 0 ? (
          <div className="card" style={{padding:'18px', textAlign:'center', color:'var(--ink-3)', fontSize:13}}>No patterns yet — check back after more transactions are synced.</div>
        ) : aiInsights.map((insight, i) => (
          <div key={insight.id || i} onClick={() => onAIExplain({ text: insight.title, reasoning: [], sources: [] })} className={`card fade-up fade-up-${i+5}`} style={{padding:14, marginBottom:8, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', cursor:'pointer'}}>
            <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
              <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
                <Icon name="sparkle" size={16}/>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontWeight:600, fontSize:14}}>{insight.title}</div>
                <div className="body" style={{marginTop:2, fontSize:13}}>{insight.body}</div>
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
