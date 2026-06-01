/* Gexpense — Money Flow (simple, at-a-glance) */
const { useState: useStateMF, useEffect: useEffectMF } = React;

const MoneyFlow = () => {
  const [drawn, setDrawn] = useStateMF(false);
  useEffectMF(() => { const t = setTimeout(() => setDrawn(true), 200); return () => clearTimeout(t); }, []);

  const totalIn = 153100;
  const totalOut = 42180;
  const totalSaved = totalIn - totalOut;
  const savedPct = Math.round((totalSaved / totalIn) * 100);
  const spentPct = 100 - savedPct;

  const incomes = [
    { k: 'Salary',    v: 142500, sub: 'Acme Corp' },
    { k: 'Freelance', v: 8400,   sub: 'Notion · contract' },
    { k: 'Cashback',  v: 2200,   sub: 'CRED rewards' },
  ];

  const outflows = [
    { k: 'Food',          v: 13500, c: '#E07A5F' },
    { k: 'Rent',          v: 10000, c: 'var(--brand)' },
    { k: 'Travel',        v: 8400,  c: '#3D8FB7' },
    { k: 'Shopping',      v: 5900,  c: '#9B6BBF' },
    { k: 'Subscriptions', v: 3200,  c: '#D8A047' },
    { k: 'Other',         v: 1180,  c: 'var(--ink-3)' },
  ];

  return (
    <div className="card fade-up fade-up-3" style={{padding:18, marginBottom:14}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14}}>
        <div>
          <div className="label">Money flow · last 30 days</div>
          <div style={{display:'flex', alignItems:'baseline', gap:10, marginTop:4}}>
            <span className="tabular" style={{fontSize: 24, fontWeight:600, letterSpacing:'-0.02em', color:'var(--ok)'}}>
              +₹{(totalSaved/1000).toFixed(1)}k
            </span>
            <span className="small mono tabular" style={{color:'var(--ink-3)'}}>net saved</span>
          </div>
        </div>
        <div style={{display:'flex', gap:4}}>
          <Chip>30d</Chip>
          <Chip active>Mo</Chip>
          <Chip>Yr</Chip>
        </div>
      </div>

      {/* In → Out totals */}
      <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14}}>
        <div>
          <div className="label" style={{color:'var(--ok)', display:'flex', alignItems:'center', gap:5}}>
            <Icon name="arrowUp" size={11} stroke={2.5}/> Money in
          </div>
          <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>₹{totalIn.toLocaleString('en-IN')}</div>
        </div>
        <div style={{flex:1, height:1, background:'var(--line)', margin:'0 14px', position:'relative'}}>
          <div style={{position:'absolute', left:'50%', top:'50%', transform:'translate(-50%,-50%)', background:'var(--surface)', padding:'0 8px', fontSize:11, color:'var(--ink-3)'}}>→</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div className="label" style={{color:'var(--err)', display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end'}}>
            Money out <Icon name="arrowDn" size={11} stroke={2.5}/>
          </div>
          <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>₹{totalOut.toLocaleString('en-IN')}</div>
        </div>
      </div>

      {/* Single split bar — Saved | Spent */}
      <div style={{position:'relative', height:36, borderRadius:10, overflow:'hidden', display:'flex', background:'var(--surface-2)'}}>
        <div style={{
          width: drawn ? `${savedPct}%` : '0%',
          background: 'var(--ok)',
          transition: 'width 1.0s cubic-bezier(0.4, 0.8, 0.4, 1)',
          display:'flex', alignItems:'center', paddingLeft:12, color:'#fff', fontSize:12, fontWeight:600
        }}>
          {drawn && savedPct >= 18 && <span>Saved {savedPct}%</span>}
        </div>
        <div style={{
          width: drawn ? `${spentPct}%` : '0%',
          background: 'var(--ink)',
          transition: 'width 1.0s cubic-bezier(0.4, 0.8, 0.4, 1) 0.1s',
          display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:12, color:'#fff', fontSize:12, fontWeight:600
        }}>
          {drawn && spentPct >= 14 && <span>Spent {spentPct}%</span>}
        </div>
      </div>
      <div style={{display:'flex', justifyContent:'space-between', marginTop:6, padding:'0 2px'}}>
        <span className="small mono tabular" style={{color:'var(--ok)'}}>₹{(totalSaved/1000).toFixed(1)}k saved</span>
        <span className="small mono tabular" style={{color:'var(--ink-2)'}}>₹{(totalOut/1000).toFixed(1)}k spent</span>
      </div>

      {/* Top sources & sinks */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginTop:18, paddingTop:14, borderTop:'1px solid var(--line)'}}>
        {/* In sources */}
        <div>
          <div className="label" style={{marginBottom:8, display:'flex', alignItems:'center', gap:5}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:'var(--ok)'}}/> Where it came from
          </div>
          {incomes.map((i, idx) => {
            const pct = Math.round((i.v / totalIn) * 100);
            return (
              <div key={i.k} style={{marginBottom:10, opacity: drawn ? 1 : 0, transition:`opacity 0.4s ease ${0.3 + idx*0.08}s`}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:3}}>
                  <span style={{fontSize:12, fontWeight:600}}>{i.k}</span>
                  <span className="mono tabular" style={{fontSize:11, color:'var(--ink-2)'}}>₹{(i.v/1000).toFixed(1)}k</span>
                </div>
                <div style={{height:4, borderRadius:2, background:'var(--surface-2)', overflow:'hidden'}}>
                  <div style={{width: drawn ? `${pct}%` : '0%', height:'100%', background:'var(--ok)', transition:`width 0.8s cubic-bezier(0.4, 0.8, 0.4, 1) ${0.3 + idx*0.08}s`}}/>
                </div>
              </div>
            );
          })}
        </div>

        {/* Out sinks (top 4) */}
        <div>
          <div className="label" style={{marginBottom:8, display:'flex', alignItems:'center', gap:5}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:'var(--ink)'}}/> Where it went
          </div>
          {outflows.slice(0, 4).map((o, idx) => {
            const pct = Math.round((o.v / totalOut) * 100);
            return (
              <div key={o.k} style={{marginBottom:10, opacity: drawn ? 1 : 0, transition:`opacity 0.4s ease ${0.5 + idx*0.06}s`}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:3}}>
                  <span style={{fontSize:12, fontWeight:600}}>{o.k}</span>
                  <span className="mono tabular" style={{fontSize:11, color:'var(--ink-2)'}}>₹{(o.v/1000).toFixed(1)}k</span>
                </div>
                <div style={{height:4, borderRadius:2, background:'var(--surface-2)', overflow:'hidden'}}>
                  <div style={{width: drawn ? `${pct}%` : '0%', height:'100%', background:o.c, transition:`width 0.8s cubic-bezier(0.4, 0.8, 0.4, 1) ${0.5 + idx*0.06}s`}}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { MoneyFlow });

