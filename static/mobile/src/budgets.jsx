/* Gexpense Hi-Fi — Budgets screen (real data) */
const { useState: useStateB, useEffect: useEffectB } = React;

const _liveMonthParamsB = () => {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const from = `${y}-${String(m+1).padStart(2,'0')}-01`;
  const nextM = m === 11 ? 1 : m + 2;
  const nextY = m === 11 ? y + 1 : y;
  const to   = `${nextY}-${String(nextM).padStart(2,'0')}-01`;
  return `date_from=${from}&date_to=${to}`;
};

const _monthLabel = () => new Date().toLocaleString('en-IN',{month:'long'});

const Budgets = ({ onBack, onGoalOpen = () => {}, onAddBudget = () => {} }) => {
  const [tab,     setTab]     = useStateB('categories');
  const [animate, setAnimate] = useStateB(false);
  const [loading, setLoading] = useStateB(true);

  // Categories state
  const [cats,        setCats]        = useStateB([]);
  const [totalBudget, setTotalBudget] = useStateB(0);
  const [totalSpent,  setTotalSpent]  = useStateB(0);

  // Goals state
  const [goals, setGoals] = useStateB([]);

  // Recurring state
  const [recurring,      setRecurring]      = useStateB([]);
  const [recurringTotal, setRecurringTotal] = useStateB(0);

  useEffectB(() => {
    setLoading(true);
    Promise.all([
      GxAPI.get('/api/budgets'),
      GxAPI.get('/api/stats/category-breakdown?' + _liveMonthParamsB()),
      GxAPI.get('/api/goals'),
      GxAPI.get('/api/recurring'),
    ]).then(([budgetsData, catsData, goalsData, recurringData]) => {

      // Build budget × spent map
      const budgetMap = {};
      (budgetsData?.budgets || []).forEach(b => {
        budgetMap[b.category?.toLowerCase()] = { id: b.id, limit: b.monthly_limit || 0 };
      });

      const spentMap = {};
      let spentSum = 0;
      (catsData?.categories || []).forEach(c => {
        const k = c.category?.toLowerCase() || 'other';
        spentMap[k] = Math.round(c.amount || 0);
        spentSum += Math.round(c.amount || 0);
      });

      const tBudget = Object.values(budgetMap).reduce((a,b)=>a+b.limit,0);
      setTotalBudget(tBudget || 60000);
      setTotalSpent(spentSum);

      // Build category rows — union of budget + spent categories
      const allKeys = new Set([...Object.keys(budgetMap), ...Object.keys(spentMap)]);
      const catRows = [...allKeys].map(k => ({
        k,
        n: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g,' '),
        spent:  spentMap[k]  || 0,
        budget: budgetMap[k]?.limit || 0,
        budgetId: budgetMap[k]?.id || null,
      })).filter(c => c.budget > 0 || c.spent > 0)
         .sort((a,b) => b.spent - a.spent);
      setCats(catRows);

      // Goals
      const goalRows = (goalsData?.goals || []).map(g => ({
        id:     g.id,
        n:      g.name || 'Goal',
        saved:  Math.round(g.current_amount || 0),
        target: Math.round(g.target_amount  || 0),
        due:    g.target_date || '',
        pct:    Math.round(g.pct || 0),
        ico:    'shield',
      }));
      setGoals(goalRows);

      // Recurring
      const recRows = (recurringData || []).map(r => ({
        id:    r.id,
        k:     r.category || 'bills',
        n:     r.merchant || r.name || 'Recurring',
        sub:   r.frequency || 'Monthly',
        amt:   Math.round(Math.abs(r.amount || 0)),
        next:  r.next_date || '',
      }));
      const recTotal = recRows.reduce((a,r)=>a+r.amt,0);
      setRecurring(recRows);
      setRecurringTotal(recTotal);

      setLoading(false);
      setTimeout(() => setAnimate(true), 200);
    }).catch(() => {
      setLoading(false);
      setTimeout(() => setAnimate(true), 200);
    });
  }, []);

  const totalPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;
  const budgetLeft = totalBudget - totalSpent;

  return (
    <div className="scroll" data-screen-label="07 Budgets">
      <div style={{padding:'8px 22px 0'}}>

        {/* header */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div style={{display:'flex', alignItems:'center', gap:10}}>
            {onBack && <button className="btn-ghost btn" onClick={onBack} style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}>
              <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
            </button>}
            <div className="h2">Budgets</div>
          </div>
          <button onClick={onAddBudget} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center', cursor:'pointer'}}>
            <Icon name="plus" size={18}/>
          </button>
        </div>

        {/* hero ring */}
        <div className="card fade-up fade-up-2" style={{padding:20, marginBottom:14, background:'linear-gradient(180deg, var(--surface), var(--surface) 50%, var(--brand-50))'}}>
          <div style={{display:'flex', alignItems:'center', gap:18}}>
            <div style={{position:'relative', width:120, height:120, flexShrink:0}}>
              <svg viewBox="0 0 120 120" width="120" height="120" style={{transform:'rotate(-90deg)'}}>
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-2)" strokeWidth="12"/>
                <circle cx="60" cy="60" r="50" fill="none"
                  stroke={totalPct > 90 ? 'var(--err)' : totalPct > 75 ? 'var(--warn)' : 'var(--brand)'} strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 50}
                  strokeDashoffset={animate ? (1 - totalPct/100) * 2 * Math.PI * 50 : 2 * Math.PI * 50}
                  style={{transition:'stroke-dashoffset 1.4s cubic-bezier(0.4, 0.8, 0.4, 1)'}}
                />
              </svg>
              <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                <div className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1}}>{totalPct}%</div>
                <div className="label" style={{marginTop:2}}>used</div>
              </div>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div className="label">{_monthLabel()} · {new Date(new Date().getFullYear(), new Date().getMonth()+1, 0).getDate() - new Date().getDate()} days left</div>
              <div className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', marginTop:2}}>
                {loading ? '—' : `₹${totalSpent.toLocaleString('en-IN')}`}
              </div>
              {totalBudget > 0 && <div className="small mono tabular" style={{marginTop:2}}>of ₹{totalBudget.toLocaleString('en-IN')}</div>}
              <div style={{display:'flex', alignItems:'center', gap:6, marginTop:10}}>
                <Badge tone={totalPct > 90 ? 'err' : totalPct > 75 ? 'warn' : 'ok'}>
                  {totalPct > 90 ? 'over budget' : totalPct > 75 ? 'watch it' : 'on track'}
                </Badge>
                {budgetLeft > 0 && <span className="small mono tabular">₹{budgetLeft.toLocaleString('en-IN')} left</span>}
              </div>
            </div>
          </div>
        </div>

        {/* tabs */}
        <div className="fade-up fade-up-3" style={{display:'flex', gap:6, padding:4, background:'var(--surface-2)', borderRadius:12, marginBottom:14}}>
          {[['categories','Categories'],['goals','Goals'],['recurring','Recurring']].map(([k,l])=>(
            <div key={k} onClick={()=>setTab(k)} style={{flex:1, textAlign:'center', padding:'8px 6px', cursor:'pointer', fontSize:12, fontWeight:600, color:tab===k?'var(--ink)':'var(--ink-3)', background:tab===k?'var(--surface)':'transparent', borderRadius:9, transition:'all 0.18s ease', boxShadow:tab===k?'var(--sh-1)':'none'}}>{l}</div>
          ))}
        </div>

        {/* CATEGORIES */}
        {tab === 'categories' && (
          loading ? <div className="card" style={{padding:20, textAlign:'center', color:'var(--ink-4)'}}>Loading…</div> :
          cats.length === 0 ? (
            <div className="card" style={{padding:20, textAlign:'center', color:'var(--ink-3)'}}>
              <div style={{fontWeight:600, marginBottom:6}}>No budgets set yet</div>
              <div className="small">Tap + to add your first budget</div>
            </div>
          ) : (
            <>
              {cats.map((c, i) => {
                const pct  = c.budget > 0 ? Math.min(100, Math.round((c.spent/c.budget)*100)) : 0;
                const over = c.budget > 0 && c.spent > c.budget;
                const near = !over && pct >= 80;
                return (
                  <div key={c.k} className={`card fade-up fade-up-${(i%5)+3}`} style={{padding:14, marginBottom:8}}>
                    <div style={{display:'flex', alignItems:'center', gap:12}}>
                      <CatIcon kind={c.k}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                          <div style={{fontWeight:600, fontSize:14}}>{c.n}</div>
                          <div className="tabular" style={{fontSize:13, fontWeight:600, color:over?'var(--err)':'var(--ink)'}}>
                            ₹{c.spent.toLocaleString('en-IN')}
                            {c.budget > 0 && <span style={{color:'var(--ink-4)', fontWeight:400}}> / ₹{c.budget.toLocaleString('en-IN')}</span>}
                          </div>
                        </div>
                        {c.budget > 0 && (
                          <>
                            <div className="progress" style={{marginTop:8, height:6}}>
                              <i style={{width:animate?`${pct}%`:'0%', background:over?'var(--err)':near?'var(--warn)':undefined, transition:'width 1.0s cubic-bezier(0.4, 0.8, 0.4, 1)'}}/>
                            </div>
                            <div style={{display:'flex', justifyContent:'space-between', marginTop:6}}>
                              <Badge tone={over?'err':near?'warn':'ok'}>{pct}% used</Badge>
                              <span className="small mono tabular" style={{color:over?'var(--err)':'var(--ink-3)'}}>
                                {over ? `−₹${(c.spent-c.budget).toLocaleString('en-IN')} over` : `₹${(c.budget-c.spent).toLocaleString('en-IN')} left`}
                              </span>
                            </div>
                          </>
                        )}
                        {c.budget === 0 && (
                          <div className="small" style={{marginTop:4, color:'var(--ink-4)'}}>No budget set — tap + to add one</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </>
          )
        )}

        {/* GOALS */}
        {tab === 'goals' && (
          loading ? <div className="card" style={{padding:20, textAlign:'center', color:'var(--ink-4)'}}>Loading…</div> :
          goals.length === 0 ? (
            <div className="card" style={{padding:20, textAlign:'center', color:'var(--ink-3)'}}>
              <div style={{fontWeight:600, marginBottom:6}}>No savings goals yet</div>
              <div className="small">Create a goal to track your progress</div>
            </div>
          ) : (
            <>
              {goals.map((g, i) => {
                const pct = g.target > 0 ? Math.min(100, Math.round((g.saved/g.target)*100)) : 0;
                return (
                  <div key={g.id} onClick={() => onGoalOpen({name:g.n, saved:g.saved, target:g.target, due:g.due, ico:g.ico})} className={`card fade-up fade-up-${i+3}`} style={{padding:16, marginBottom:8, cursor:'pointer'}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10}}>
                      <div style={{display:'flex', alignItems:'center', gap:10}}>
                        <div style={{width:34, height:34, borderRadius:10, background:'var(--surface-2)', color:'var(--ink-2)', display:'grid', placeItems:'center'}}>
                          <Icon name="shield" size={16}/>
                        </div>
                        <div>
                          <div style={{fontWeight:600, fontSize:14}}>{g.n}</div>
                          {g.due && <div className="small mono">by {g.due}</div>}
                        </div>
                      </div>
                      <div className="tabular" style={{textAlign:'right'}}>
                        <div style={{fontSize:14, fontWeight:600}}>{pct}%</div>
                        <div className="small mono">complete</div>
                      </div>
                    </div>
                    <div className="progress" style={{marginTop:12, height:8}}>
                      <i style={{width:animate?`${pct}%`:'0%', transition:'width 1.0s cubic-bezier(0.4, 0.8, 0.4, 1)'}}/>
                    </div>
                    <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
                      <span className="small mono tabular">₹{g.saved.toLocaleString('en-IN')} saved</span>
                      <span className="small mono tabular">of ₹{g.target.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                );
              })}
              <button className="btn btn-ghost" style={{width:'100%', marginTop:6, padding:12, border:'1px dashed var(--line-strong)', borderRadius:10, background:'transparent', color:'var(--ink-2)'}}>
                + New goal
              </button>
            </>
          )
        )}

        {/* RECURRING */}
        {tab === 'recurring' && (
          loading ? <div className="card" style={{padding:20, textAlign:'center', color:'var(--ink-4)'}}>Loading…</div> :
          recurring.length === 0 ? (
            <div className="card" style={{padding:20, textAlign:'center', color:'var(--ink-3)'}}>
              <div style={{fontWeight:600, marginBottom:6}}>No recurring expenses detected</div>
              <div className="small">Sync more transactions to detect patterns</div>
            </div>
          ) : (
            <>
              <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <div>
                    <div className="label">Monthly recurring</div>
                    <div className="tabular" style={{fontSize:24, fontWeight:600, letterSpacing:'-0.02em', marginTop:2}}>
                      ₹{recurringTotal.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div className="label">Active</div>
                    <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:2}}>{recurring.length}</div>
                  </div>
                </div>
              </div>
              {recurring.map((r, i) => (
                <div key={r.id || i} className="card" style={{padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
                  <CatIcon kind={r.k}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                      <div style={{fontWeight:600, fontSize:14}}>{r.n}</div>
                      <div className="tabular" style={{fontWeight:600, fontSize:14}}>₹{r.amt.toLocaleString('en-IN')}</div>
                    </div>
                    <div style={{display:'flex', justifyContent:'space-between', marginTop:2}}>
                      <span className="small">{r.sub}</span>
                      {r.next && <span className="small mono">next {r.next}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )
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
    {delta && <div className="mono tabular" style={{fontSize:10, color:dir==='up'?'var(--err)':'var(--ok)', marginTop:2, display:'flex', alignItems:'center', gap:2}}>
      {dir==='up'?'↑':'↓'} {delta}
    </div>}
  </div>
);

// ============================================================
// ADD BUDGET
// ============================================================
const AddBudget = ({ onBack, onSave }) => {
  const [cat,     setCat]     = useStateB('food');
  const [amount,  setAmount]  = useStateB('');
  const [period,  setPeriod]  = useStateB('month');
  const [alertAt, setAlertAt] = useStateB(80);
  const [rollover,setRollover]= useStateB(false);
  const [saving,  setSaving]  = useStateB(false);
  const [err,     setErr]     = useStateB('');

  const catList = [
    ['food','Food'],['travel','Travel'],['bills','Bills'],['shop','Shopping'],
    ['subs','Subs'],['fuel','Fuel'],['grocery','Grocery'],['coffee','Coffee'],
    ['health','Health'],['rent','Rent'],['invest','Investment'],['other','Other'],
  ];
  const catLabel = (catList.find(c=>c[0]===cat)||['',''])[1];
  const quick = [1000, 2500, 5000, 10000, 20000];

  const handleSave = async () => {
    if (!amount || Number(amount) <= 0) { setErr('Enter an amount'); return; }
    setSaving(true); setErr('');
    const res = await GxAPI.post('/api/budgets', {
      category: cat,
      monthly_limit: Number(amount),
    });
    setSaving(false);
    if (res) {
      onSave && onSave(catLabel);
    } else {
      setErr('Could not save — check connection');
    }
  };

  return (
    <div className="scroll" data-screen-label="Add Budget" style={{background:'var(--bg)'}}>
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', alignItems:'center', gap:10, marginBottom:18}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:'6px 8px', borderRadius:8, cursor:'pointer'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div className="h2" style={{flex:1}}>New budget</div>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary" style={{padding:'8px 14px', fontSize:13, cursor:'pointer', opacity:saving?0.6:1}}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {err && <div style={{padding:'8px 12px', borderRadius:8, background:'var(--err)', color:'#fff', fontSize:12, marginBottom:12}}>{err}</div>}

        {/* Preview */}
        <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:14, background:'linear-gradient(180deg, var(--surface), var(--brand-50))'}}>
          <div className="label">Budget for</div>
          <div style={{display:'flex', alignItems:'center', gap:12, marginTop:8}}>
            <CatIcon kind={cat}/>
            <div style={{flex:1}}>
              <div style={{fontSize:18, fontWeight:600}}>{catLabel}</div>
              <div className="small">per {period}</div>
            </div>
            <div className="tabular" style={{fontSize:28, fontWeight:600, letterSpacing:'-0.02em'}}>
              ₹{Number(amount||0).toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Category */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Category</div>
        <div className="card fade-up fade-up-2" style={{padding:'12px', marginBottom:14}}>
          <div style={{display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8}}>
            {catList.map(([k,l]) => (
              <button key={k} onClick={()=>setCat(k)} className="btn" style={{padding:'10px 6px', borderRadius:10, background:cat===k?'var(--brand-soft)':'var(--surface-2)', border:cat===k?'1px solid var(--brand)':'1px solid transparent', display:'flex', flexDirection:'column', alignItems:'center', gap:6, cursor:'pointer'}}>
                <CatIcon kind={k}/>
                <span style={{fontSize:11, fontWeight:600, color:cat===k?'var(--brand)':'var(--ink-2)'}}>{l}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Amount</div>
        <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', gap:10, padding:'12px 14px', borderRadius:10, border:'1.5px solid var(--brand)', background:'var(--surface-2)'}}>
            <span style={{fontSize:20, color:'var(--ink-3)', fontWeight:600}}>₹</span>
            <input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d]/g,''))} placeholder="0"
              style={{flex:1, border:'none', background:'transparent', fontFamily:'inherit', fontSize:22, fontWeight:600, color:'var(--ink)', outline:'none'}}/>
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:10}}>
            {quick.map(q => <Chip key={q} active={Number(amount)===q} onClick={()=>setAmount(String(q))}>₹{q.toLocaleString('en-IN')}</Chip>)}
          </div>
        </div>

        {/* Period */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Period</div>
        <div className="card fade-up fade-up-3" style={{padding:'10px 12px', marginBottom:14, display:'flex', gap:6}}>
          {[['week','Weekly'],['month','Monthly'],['quarter','Quarterly'],['year','Yearly']].map(([k,l])=>(
            <button key={k} onClick={()=>setPeriod(k)} className="btn" style={{flex:1, padding:10, borderRadius:8, background:period===k?'var(--brand)':'transparent', color:period===k?'#fff':'var(--ink-2)', fontSize:12, fontWeight:600, border:'none', cursor:'pointer'}}>{l}</button>
          ))}
        </div>

        {/* Options */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Options</div>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
            <Icon name="bell" size={18} style={{color:'var(--ink-2)'}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>Alert at {alertAt}%</div>
              <div className="small">Notify when budget is {alertAt}% used</div>
            </div>
          </div>
          <div style={{padding:'0 16px 14px', display:'flex', gap:6}}>
            {[50,75,80,90,100].map(p=><Chip key={p} active={alertAt===p} onClick={()=>setAlertAt(p)}>{p}%</Chip>)}
          </div>
          <div style={{height:1, background:'var(--line)', marginLeft:46}}/>
          <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
            <Icon name="repeat" size={18} style={{color:'var(--ink-2)'}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>Roll over unused amount</div>
              <div className="small">Add leftover to next {period}'s budget</div>
            </div>
            <Toggle on={rollover} onClick={()=>setRollover(!rollover)}/>
          </div>
        </div>

        <div style={{height:30}}/>
      </div>
    </div>
  );
};

Object.assign(window, { Budgets, AddBudget });
