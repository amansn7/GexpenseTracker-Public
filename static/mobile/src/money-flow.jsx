/* Gexpense — Money Flow with real backend data */
const { useState: useStateMF, useEffect: useEffectMF } = React;

const _CAT_COLORS_MF = {
  food:'#E07A5F', grocery:'#E07A5F', coffee:'#E07A5F',
  rent:'var(--brand)', housing:'var(--brand)',
  travel:'#3D8FB7', fuel:'#3D8FB7',
  shop:'#9B6BBF', shopping:'#9B6BBF',
  subs:'#D8A047', subscriptions:'#D8A047', bills:'#D8A047',
  healthcare:'#5F8EE0', medical:'#5F8EE0',
  other:'var(--ink-3)',
};
const _mfColor = k => _CAT_COLORS_MF[k?.toLowerCase()] || 'var(--ink-3)';

const _periodParam = p => p === 'Yr' ? '1y' : '1m';
const _periodLabel = p => p === 'Yr' ? 'last 12 months' : p === '30d' ? 'last 30 days' : 'this month';

const MoneyFlow = () => {
  const [drawn, setDrawn] = useStateMF(false);
  const [period, setPeriod] = useStateMF('Mo');
  const [loading, setLoading] = useStateMF(true);

  const [totalIn,  setTotalIn]  = useStateMF(0);
  const [totalOut, setTotalOut] = useStateMF(0);
  const [incomes,  setIncomes]  = useStateMF([]);
  const [outflows, setOutflows] = useStateMF([]);

  useEffectMF(() => {
    setDrawn(false);
    setLoading(true);

    const pp = _periodParam(period);

    Promise.all([
      GxAPI.get(`/api/stats/summary?period=${pp}`),
      GxAPI.get(`/api/stats/category-breakdown?period=${pp}`),
      GxAPI.get(`/api/transactions?label=income&limit=20&offset=0`),
    ]).then(([stats, cats, incomeTxs]) => {
      const income  = Math.round(stats?.total_income  || 0);
      const expense = Math.round(stats?.total_expenses || 0);
      setTotalIn(income);
      setTotalOut(expense);

      // Build income sources from income transactions (group by merchant)
      if (incomeTxs?.items?.length) {
        const grouped = {};
        incomeTxs.items.forEach(tx => {
          const k = tx.merchant || 'Other';
          grouped[k] = (grouped[k] || 0) + Math.abs(tx.amount || 0);
        });
        const src = Object.entries(grouped)
          .sort((a,b) => b[1]-a[1])
          .slice(0,3)
          .map(([k,v]) => ({ k, v: Math.round(v), sub: '' }));
        if (src.length) setIncomes(src);
        else setIncomes([{ k:'Income', v:income, sub:'' }]);
      } else if (income > 0) {
        setIncomes([{ k:'Income', v:income, sub:'' }]);
      }

      // Outflow categories
      if (cats?.categories?.length) {
        setOutflows(cats.categories.slice(0,6).map(c => ({
          k: (c.category||'other').charAt(0).toUpperCase() + (c.category||'other').slice(1),
          v: Math.round(c.amount||0),
          c: _mfColor(c.category),
        })));
      }

      setLoading(false);
      setTimeout(() => setDrawn(true), 200);
    }).catch(() => {
      setLoading(false);
      setTimeout(() => setDrawn(true), 200);
    });
  }, [period]);

  const totalSaved = Math.max(0, totalIn - totalOut);
  const savedPct  = totalIn > 0 ? Math.round((totalSaved / totalIn) * 100) : 0;
  const spentPct  = 100 - savedPct;

  const fmt = v => v >= 100000
    ? `₹${(v/100000).toFixed(1)}L`
    : v >= 1000
    ? `₹${(v/1000).toFixed(1)}k`
    : `₹${v}`;

  return (
    <div className="card fade-up fade-up-3" style={{padding:18, marginBottom:14}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
        <div>
          <div className="label">Money flow · {_periodLabel(period)}</div>
          {loading ? (
            <div className="small" style={{color:'var(--ink-4)',marginTop:6}}>Loading…</div>
          ) : (
            <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:4}}>
              <span className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', color: totalSaved >= 0 ? 'var(--ok)' : 'var(--err)'}}>
                {totalSaved >= 0 ? '+' : '−'}{fmt(Math.abs(totalSaved))}
              </span>
              <span className="small mono tabular" style={{color:'var(--ink-3)'}}>net saved</span>
            </div>
          )}
        </div>
        <div style={{display:'flex', gap:4}}>
          {['30d','Mo','Yr'].map(p => (
            <Chip key={p} active={period===p} onClick={() => setPeriod(p)}>{p}</Chip>
          ))}
        </div>
      </div>

      {/* In → Out totals */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
        <div>
          <div className="label" style={{color:'var(--ok)', display:'flex', alignItems:'center', gap:5}}>
            <Icon name="arrowUp" size={11} stroke={2.5}/> Money in
          </div>
          <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>
            {totalIn > 0 ? fmt(totalIn) : '—'}
          </div>
        </div>
        <div style={{flex:1, height:1, background:'var(--line)', margin:'0 14px', position:'relative'}}>
          <div style={{position:'absolute',left:'50%',top:'50%',transform:'translate(-50%,-50%)',background:'var(--surface)',padding:'0 8px',fontSize:11,color:'var(--ink-3)'}}>→</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="label" style={{color:'var(--err)', display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end'}}>
            Money out <Icon name="arrowDn" size={11} stroke={2.5}/>
          </div>
          <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>
            {totalOut > 0 ? fmt(totalOut) : '—'}
          </div>
        </div>
      </div>

      {/* Saved | Spent split bar */}
      {(totalIn > 0 || totalOut > 0) && (
        <>
          <div style={{position:'relative', height:36, borderRadius:10, overflow:'hidden', display:'flex', background:'var(--surface-2)'}}>
            <div style={{
              width: drawn ? `${savedPct}%` : '0%',
              background:'var(--ok)', transition:'width 1.0s cubic-bezier(0.4,0.8,0.4,1)',
              display:'flex', alignItems:'center', paddingLeft:12, color:'#fff', fontSize:12, fontWeight:600,
              minWidth: savedPct > 0 && drawn ? 2 : 0,
            }}>
              {drawn && savedPct >= 18 && <span>Saved {savedPct}%</span>}
            </div>
            <div style={{
              width: drawn ? `${spentPct}%` : '0%',
              background:'var(--ink)', transition:'width 1.0s cubic-bezier(0.4,0.8,0.4,1) 0.1s',
              display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:12, color:'#fff', fontSize:12, fontWeight:600,
            }}>
              {drawn && spentPct >= 14 && <span>Spent {spentPct}%</span>}
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:6, padding:'0 2px'}}>
            <span className="small mono tabular" style={{color:'var(--ok)'}}>{fmt(totalSaved)} saved</span>
            <span className="small mono tabular" style={{color:'var(--ink-2)'}}>{fmt(totalOut)} spent</span>
          </div>
        </>
      )}

      {/* Sources & sinks bars */}
      {(incomes.length > 0 || outflows.length > 0) && (
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:18, paddingTop:14, borderTop:'1px solid var(--line)'}}>
          {/* Income sources */}
          <div>
            <div className="label" style={{marginBottom:8, display:'flex', alignItems:'center', gap:5}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--ok)'}}/> Where it came from
            </div>
            {incomes.map((src, idx) => {
              const pct = totalIn > 0 ? Math.round((src.v / totalIn) * 100) : 0;
              return (
                <div key={src.k} style={{marginBottom:10, opacity:drawn?1:0, transition:`opacity 0.4s ease ${0.3+idx*0.08}s`}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:3}}>
                    <span style={{fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%'}}>{src.k}</span>
                    <span className="mono tabular" style={{fontSize:11, color:'var(--ink-2)', flexShrink:0}}>{fmt(src.v)}</span>
                  </div>
                  <div style={{height:4, borderRadius:2, background:'var(--surface-2)', overflow:'hidden'}}>
                    <div style={{width:drawn?`${pct}%`:'0%', height:'100%', background:'var(--ok)', transition:`width 0.8s cubic-bezier(0.4,0.8,0.4,1) ${0.3+idx*0.08}s`}}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Expense categories */}
          <div>
            <div className="label" style={{marginBottom:8, display:'flex', alignItems:'center', gap:5}}>
              <span style={{width:6,height:6,borderRadius:'50%',background:'var(--ink)'}}/> Where it went
            </div>
            {outflows.slice(0,4).map((o, idx) => {
              const pct = totalOut > 0 ? Math.round((o.v / totalOut) * 100) : 0;
              return (
                <div key={o.k} style={{marginBottom:10, opacity:drawn?1:0, transition:`opacity 0.4s ease ${0.5+idx*0.06}s`}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:3}}>
                    <span style={{fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:'70%'}}>{o.k}</span>
                    <span className="mono tabular" style={{fontSize:11, color:'var(--ink-2)', flexShrink:0}}>{fmt(o.v)}</span>
                  </div>
                  <div style={{height:4, borderRadius:2, background:'var(--surface-2)', overflow:'hidden'}}>
                    <div style={{width:drawn?`${pct}%`:'0%', height:'100%', background:o.c, transition:`width 0.8s cubic-bezier(0.4,0.8,0.4,1) ${0.5+idx*0.06}s`}}/>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* No data state */}
      {!loading && totalIn === 0 && totalOut === 0 && (
        <div style={{textAlign:'center', color:'var(--ink-4)', fontSize:13, padding:'12px 0'}}>
          No data for this period
        </div>
      )}
    </div>
  );
};

Object.assign(window, { MoneyFlow });
