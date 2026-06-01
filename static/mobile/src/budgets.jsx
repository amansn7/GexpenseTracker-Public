/* Gexpense Hi-Fi — Budgets screen */
const { useState: useStateB, useEffect: useEffectB } = React;

const Budgets = ({ onBack, onGoalOpen = () => {}, onAddBudget = () => {} }) => {
  const [tab, setTab] = useStateB('categories');
  const [animate, setAnimate] = useStateB(false);
  useEffectB(() => { const t = setTimeout(() => setAnimate(true), 200); return () => clearTimeout(t); }, []);

  const totalBudget = 60000;
  const totalSpent  = 42180;
  const totalPct = Math.round((totalSpent / totalBudget) * 100);

  const cats = [
    {k:'food',    n:'Food & Dining',  spent:13500, budget:12000, ico:'coffee'},
    {k:'rent',    n:'Rent & Housing', spent:10000, budget:10000, ico:'home'},
    {k:'travel',  n:'Travel',         spent:8400,  budget:9000,  ico:'car'},
    {k:'shop',    n:'Shopping',       spent:5900,  budget:6000,  ico:'bag'},
    {k:'subs',    n:'Subscriptions',  spent:3200,  budget:4000,  ico:'repeat'},
    {k:'fuel',    n:'Fuel',           spent:1180,  budget:3000,  ico:'flame'},
  ];

  const goals = [
    {n:'Bali trip',     saved: 32000, target: 80000, due:'Aug 2026', ico:'car'},
    {n:'Emergency fund',saved: 145000,target: 300000,due:'Dec 2026', ico:'shield'},
    {n:'New laptop',    saved: 18000, target: 90000, due:'Jun 2026', ico:'bag'},
  ];

  return (
    <div className="scroll" data-screen-label="07 Budgets">
      <div style={{padding:'8px 22px 0'}}>
        {/* header */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            {onBack && <button className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}} onClick={onBack}><Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/></button>}
            <div className="h2">Budgets</div>
          </div>
          <button onClick={onAddBudget} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center', cursor:'pointer'}}><Icon name="plus" size={18}/></button>
        </div>

        {/* hero — month progress ring */}
        <div className="card fade-up fade-up-2" style={{padding:20, marginBottom:14, background:'linear-gradient(180deg, var(--surface), var(--surface) 50%, var(--brand-50))'}}>
          <div style={{display:'flex', alignItems:'center', gap:18}}>
            <div style={{position:'relative', width:120, height:120, flexShrink:0}}>
              <svg viewBox="0 0 120 120" width="120" height="120" style={{transform:'rotate(-90deg)'}}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-2)" strokeWidth="12"/>
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke="var(--brand)" strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={animate ? (1 - totalPct/100) * 2 * Math.PI * 50 : 2 * Math.PI * 50}
                  style={{transition: 'stroke-dashoffset 1.4s cubic-bezier(0.4, 0.8, 0.4, 1)'}}
                />
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <div className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1}}>{totalPct}%</div>
                <div className="label" style={{marginTop:2}}>used</div>
              </div>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div className="label">April · 5 days left</div>
              <div className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', marginTop:2}}>₹{totalSpent.toLocaleString('en-IN')}</div>
              <div className="small mono tabular" style={{marginTop:2}}>of ₹{totalBudget.toLocaleString('en-IN')}</div>
              <div style={{display:'flex', alignItems:'center', gap:6, marginTop:10}}>
                <Badge tone="ok">on track</Badge>
                <span className="small mono tabular">₹{(totalBudget-totalSpent).toLocaleString('en-IN')} left</span>
              </div>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginTop:16, paddingTop:14, borderTop:'1px solid var(--line)'}}>
            <Stat label="Daily avg" value="₹1,687" delta="−8%" dir="down"/>
            <Stat label="Projected" value="₹50.6k" delta="+5%" dir="up"/>
            <Stat label="Saved" value="₹17.8k" delta="" dir=""/>
          </div>
        </div>

        {/* tabs */}
        <div className="fade-up fade-up-3" style={{display:'flex', gap:6, padding:4, background:'var(--surface-2)', borderRadius:12, marginBottom:14}}>
          {[['categories','Categories'],['goals','Goals'],['recurring','Recurring']].map(([k, l])=>(
            <div key={k} onClick={()=>setTab(k)} style={{flex:1, textAlign:'center', padding:'8px 6px', cursor:'pointer', fontSize:12, fontWeight:600, color: tab===k ? 'var(--ink)' : 'var(--ink-3)', background: tab===k ? 'var(--surface)' : 'transparent', borderRadius:9, transition:'all 0.18s ease', boxShadow: tab===k ? 'var(--sh-1)' : 'none'}}>{l}</div>
          ))}
        </div>

        {tab === 'categories' && (
          <>
            {cats.map((c, i) => {
              const pct = Math.min(100, Math.round((c.spent/c.budget)*100));
              const over = c.spent > c.budget;
              const near = !over && pct >= 85;
              return (
                <div key={c.k} className={`card fade-up fade-up-${(i%5)+3}`} style={{padding:14, marginBottom:8}}>
                  <div style={{display:'flex', alignItems:'center', gap:12}}>
                    <CatIcon kind={c.k}/>
                    <div style={{flex:1, minWidth:0}}>
                      <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                        <div style={{fontWeight:600, fontSize:14}}>{c.n}</div>
                        <div className="tabular" style={{fontSize:13, fontWeight:600, color: over ? 'var(--err)' : 'var(--ink)'}}>
                          ₹{c.spent.toLocaleString('en-IN')}<span style={{color:'var(--ink-4)', fontWeight:400}}> / ₹{c.budget.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                      <div className="progress" style={{marginTop:8, height:6}}>
                        <i style={{
                          width: animate ? `${pct}%` : '0%',
                          background: over ? 'var(--err)' : near ? 'linear-gradient(90deg, var(--warn), #E0A030)' : undefined,
                          transition: 'width 1.0s cubic-bezier(0.4, 0.8, 0.4, 1)'
                        }}/>
                      </div>
                      <div style={{display:'flex', justifyContent:'space-between', marginTop:6}}>
                        {over ? <Badge tone="err">over by ₹{(c.spent-c.budget).toLocaleString('en-IN')}</Badge> :
                         near ? <Badge tone="warn">{pct}% used</Badge> :
                                <Badge tone="ok">{pct}% used</Badge>}
                        <span className="small mono tabular" style={{color: over ? 'var(--err)' : 'var(--ink-3)'}}>
                          {over ? '−' : ''}₹{Math.abs(c.budget-c.spent).toLocaleString('en-IN')} {over ? 'over' : 'left'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* AI suggest */}
            <div className="card fade-up fade-up-7" style={{padding:14, marginTop:14, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
              <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
                <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
                  <Icon name="sparkle" size={16}/>
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div className="label" style={{color:'var(--brand)'}}>AI suggestion</div>
                  <div className="body" style={{color:'var(--ink)', marginTop:2, fontWeight:500}}>
                    Bump <b>Food</b> to ₹14,500 — your last 3 months average ₹13,800.
                  </div>
                  <div style={{display:'flex', gap:8, marginTop:10}}>
                    <button className="btn btn-primary" style={{padding:'6px 12px', fontSize:12}}>Apply</button>
                    <button className="btn btn-ghost" style={{padding:'6px 12px', fontSize:12}}>Dismiss</button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {tab === 'goals' && (
          <>
            {goals.map((g, i) => {
              const pct = Math.round((g.saved/g.target)*100);
              return (
                <div key={g.n} onClick={() => onGoalOpen({ name:g.n, saved:g.saved, target:g.target, due:g.due, ico:g.ico })} className={`card fade-up fade-up-${i+3}`} style={{padding:16, marginBottom:8, cursor:'pointer'}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10}}>
                    <div>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <div style={{width:34, height:34, borderRadius:10, background:'var(--surface-2)', color:'var(--ink-2)', display:'grid', placeItems:'center'}}>
                          <Icon name={g.ico} size={16}/>
                        </div>
                        <div>
                          <div style={{fontWeight:600, fontSize:14}}>{g.n}</div>
                          <div className="small mono">by {g.due}</div>
                        </div>
                      </div>
                    </div>
                    <div className="tabular" style={{textAlign:'right'}}>
                      <div style={{fontSize:14, fontWeight:600}}>{pct}%</div>
                      <div className="small mono">complete</div>
                    </div>
                  </div>
                  <div className="progress" style={{marginTop:12, height:8}}>
                    <i style={{width: animate ? `${pct}%` : '0%', transition:'width 1.0s cubic-bezier(0.4, 0.8, 0.4, 1)'}}/>
                  </div>
                  <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                    <span className="small mono tabular">₹{g.saved.toLocaleString('en-IN')} saved</span>
                    <span className="small mono tabular">of ₹{g.target.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              );
            })}
            <button className="btn btn-ghost" style={{width:'100%', marginTop:6, padding:'12px', borderStyle:'dashed', border:'1px dashed var(--line-strong)', background:'transparent', color:'var(--ink-2)'}}>
              + New goal
            </button>
          </>
        )}

        {tab === 'recurring' && (
          <>
            <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                <div>
                  <div className="label">Monthly recurring</div>
                  <div className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', marginTop:2}}>₹13,799</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div className="label">Active</div>
                  <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>9</div>
                </div>
              </div>
              <div className="small" style={{marginTop:6}}>23% of your monthly spend is on autopilot</div>
            </div>

            {[
              {k:'rent', n:'Rent', sub:'1st of month', amt:10000, next:'May 1'},
              {k:'subs', n:'Spotify Family', sub:'Auto-renew', amt:199, next:'May 12'},
              {k:'subs', n:'Netflix Premium', sub:'Auto-renew', amt:649, next:'May 18'},
              {k:'subs', n:'iCloud 200GB', sub:'Auto-renew', amt:75, next:'May 22'},
              {k:'bills',n:'Airtel Postpaid', sub:'Autopay', amt:599, next:'Apr 28'},
              {k:'health',n:'Gym Cult.fit', sub:'Monthly', amt:1999, next:'May 5'},
            ].map((r, i, a) => (
              <div key={i} className="card" style={{padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
                <CatIcon kind={r.k}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                    <div style={{fontWeight:600, fontSize:14}}>{r.n}</div>
                    <div className="tabular" style={{fontWeight:600, fontSize:14}}>₹{r.amt.toLocaleString('en-IN')}</div>
                  </div>
                  <div style={{display:'flex', justifyContent:'space-between', marginTop:2}}>
                    <span className="small">{r.sub}</span>
                    <span className="small mono">next {r.next}</span>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        <div style={{height:30}}/>
      </div>
    </div>
  );
};

const Stat = ({ label, value, delta, dir }) => (
  <div>
    <div className="label" style={{fontSize:9}}>{label}</div>
    <div className="tabular" style={{fontSize:14, fontWeight:600, marginTop:2}}>{value}</div>
    {delta && <div className="mono tabular" style={{fontSize:10, color: dir==='up'?'var(--err)':'var(--ok)', marginTop:2, display:'flex', alignItems:'center', gap:2}}>
      {dir==='up'?'↑':'↓'} {delta}
    </div>}
  </div>
);



// ============================================================
// ADD BUDGET — full-screen overlay
// ============================================================
const AddBudget = ({ onBack, onSave }) => {
  const [cat, setCat] = useStateB('food');
  const [amount, setAmount] = useStateB('5000');
  const [period, setPeriod] = useStateB('month');
  const [alertAt, setAlertAt] = useStateB(80);
  const [rollover, setRollover] = useStateB(false);
  const cats = [
    ['food','Food'],['travel','Travel'],['bills','Bills'],['shop','Shopping'],
    ['subs','Subs'],['fuel','Fuel'],['grocery','Grocery'],['coffee','Coffee'],
    ['health','Health'],['fitness','Fitness'],
  ];
  const catLabel = (cats.find(c => c[0] === cat) || ['',''])[1];
  const quick = [1000, 2500, 5000, 10000, 20000];
  return (
    <div className="scroll" data-screen-label="Add Budget" style={{background:'var(--bg)'}}>
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', alignItems:'center', gap:10, marginBottom:18}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:'6px 8px', borderRadius:8, cursor:'pointer'}}>
            <Icon name="chevronL" size={18}/>
          </button>
          <div className="h2" style={{flex:1}}>New budget</div>
          <button onClick={() => onSave(catLabel)} className="btn btn-primary" style={{padding:'8px 14px', fontSize:13, cursor:'pointer'}}>Save</button>
        </div>

        {/* Big preview */}
        <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:14, background:'linear-gradient(180deg, var(--surface), var(--brand-50))'}}>
          <div className="label">Budget for</div>
          <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8}}>
            <CatIcon kind={cat}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:18, fontWeight:600}}>{catLabel}</div>
              <div className="small">per {period}</div>
            </div>
            <div className="tabular" style={{fontSize:28, fontWeight:600, letterSpacing:'-0.02em'}}>₹{Number(amount||0).toLocaleString('en-IN')}</div>
          </div>
        </div>

        {/* Category picker */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Category</div>
        <div className="card fade-up fade-up-2" style={{padding:'12px', marginBottom:14}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:8}}>
            {cats.map(([k,l]) => (
              <button key={k} onClick={() => setCat(k)} className="btn" style={{padding:'10px 6px', borderRadius:10, background: cat===k ? 'var(--brand-soft)' : 'var(--surface-2)', border: cat===k ? '1px solid var(--brand)' : '1px solid transparent', display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer'}}>
                <CatIcon kind={k}/>
                <span style={{fontSize:11, fontWeight:600, color: cat===k ? 'var(--brand)' : 'var(--ink-2)'}}>{l}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Amount</div>
        <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)'}}>
            <span style={{fontSize:20, color:'var(--ink-3)', fontWeight:600}}>₹</span>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g,''))} placeholder="0" style={{flex:1, border:'none', background:'transparent', fontFamily:'inherit', fontSize:22, fontWeight:600, color:'var(--ink)', outline:'none'}}/>
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:10}}>
            {quick.map(q => (
              <Chip key={q} active={Number(amount)===q} onClick={() => setAmount(String(q))}>₹{q.toLocaleString('en-IN')}</Chip>
            ))}
          </div>
        </div>

        {/* Period */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Period</div>
        <div className="card fade-up fade-up-3" style={{padding:'10px 12px', marginBottom:14, display:'flex', gap:6}}>
          {[['week','Weekly'],['month','Monthly'],['quarter','Quarterly'],['year','Yearly']].map(([k,l]) => (
            <button key={k} onClick={() => setPeriod(k)} className="btn" style={{flex:1, padding:'10px', borderRadius:8, background: period===k ? 'var(--brand)' : 'transparent', color: period===k ? '#fff' : 'var(--ink-2)', fontSize:12, fontWeight:600, border:'none', cursor:'pointer'}}>{l}</button>
          ))}
        </div>

        {/* Options */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Options</div>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
            <Icon name="bell" size={18} style={{color:'var(--ink-2)'}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600}}>Alert at {alertAt}%</div>
              <div className="small">Get notified when you've used {alertAt}% of your budget</div>
            </div>
          </div>
          <div style={{padding:'0 16px 14px', display:'flex', gap:6}}>
            {[50, 75, 80, 90, 100].map(p => (
              <Chip key={p} active={alertAt===p} onClick={() => setAlertAt(p)}>{p}%</Chip>
            ))}
          </div>
          <div style={{height:1, background:'var(--line)', marginLeft:46}}/>
          <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
            <Icon name="repeat" size={18} style={{color:'var(--ink-2)'}}/>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600}}>Roll over unused amount</div>
              <div className="small">Add leftover to next {period}'s budget</div>
            </div>
            <Toggle on={rollover} onClick={() => setRollover(!rollover)}/>
          </div>
        </div>

        {/* Smart suggestion */}
        <div className="card fade-up fade-up-5" style={{padding:14, marginBottom:14, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
          <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
            <div style={{width:30, height:30, borderRadius:8, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
              <Icon name="sparkle" size={14}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600, color:'var(--ink)'}}>Suggested: ₹{(Number(amount||0)*1.15|0).toLocaleString('en-IN')}/mo</div>
              <div className="small" style={{marginTop:2}}>Based on your last 3 months of {catLabel.toLowerCase()} spending. Tap to apply.</div>
              <button onClick={() => setAmount(String(Number(amount||0)*1.15|0))} className="btn btn-primary" style={{marginTop:10, padding:'7px 12px', fontSize:11, cursor:'pointer'}}>Use suggested</button>
            </div>
          </div>
        </div>

        <div style={{height:30}}/>
      </div>
    </div>
  );
};

Object.assign(window, { Budgets, AddBudget });
