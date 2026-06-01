/* Gexpense Hi-Fi — Onboarding, Goal Detail, Category Detail, AI Explain, Empty States */
const { useState: useStateN2, useEffect: useEffectN2 } = React;

// ============================================================
// 2. ONBOARDING — 4 steps: welcome → connect Gmail → currency → first budget
// ============================================================
const Onboarding = ({ onDone }) => {
  const [step, setStep] = useStateN2(0);
  const [scanning, setScanning] = useStateN2(false);
  const [scanned, setScanned] = useStateN2(0);
  const [currency, setCurrency] = useStateN2('INR');
  const [budget, setBudget] = useStateN2(60000);

  useEffectN2(() => {
    if (scanning && scanned < 247) {
      const t = setTimeout(() => setScanned(s => Math.min(247, s + Math.ceil(Math.random()*23))), 60);
      return () => clearTimeout(t);
    }
    if (scanning && scanned >= 247) {
      const t = setTimeout(() => setStep(2), 600);
      return () => clearTimeout(t);
    }
  }, [scanning, scanned]);

  const next = () => setStep(s => s + 1);
  const skip = () => setStep(s => s + 1);

  return (
    <div className="scroll" data-screen-label="09 Onboarding">
      <div style={{padding:'8px 22px 0', minHeight:'100%', display:'flex', flexDirection:'column'}}>
        {/* progress dots */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24}}>
          <div style={{display:'flex', gap:6}}>
            {[0,1,2,3].map(i => (
              <span key={i} style={{
                width: i === step ? 22 : 6, height:6, borderRadius:3,
                background: i <= step ? 'var(--brand)' : 'var(--line-strong)',
                transition:'all 0.3s ease'
              }}/>
            ))}
          </div>
          {step > 0 && step < 3 && <button onClick={skip} className="btn btn-ghost" style={{padding:'6px 10px', fontSize:12, color:'var(--ink-3)'}}>Skip</button>}
        </div>

        {step === 0 && (
          <div className="fade-up fade-up-1" style={{display:'flex', flexDirection:'column', alignItems:'center', textAlign:'center', flex:1, justifyContent:'center'}}>
            <Monogram size={64} brand/>
            <div style={{fontSize:30, fontWeight:600, letterSpacing:'-0.02em', marginTop:24}}>Track expenses without tracking</div>
            <div className="body" style={{color:'var(--ink-2)', marginTop:10, maxWidth:280}}>Connect your inbox. We'll find every receipt, bill, and UPI alert — automatically.</div>
            <button onClick={next} className="btn btn-primary" style={{marginTop:36, padding:'14px 28px', fontSize:14, width:'100%'}}>Get started</button>
            <div className="small mono" style={{marginTop:14, color:'var(--ink-3)'}}>Already have an account? <span style={{color:'var(--brand)', fontWeight:600}}>Sign in</span></div>
          </div>
        )}

        {step === 1 && (
          <div className="fade-up fade-up-1" style={{flex:1, display:'flex', flexDirection:'column'}}>
            <div className="h2" style={{marginBottom:8}}>Connect your inbox</div>
            <div className="body" style={{color:'var(--ink-2)', marginBottom:22}}>We read receipts only. Nothing else. You can disconnect anytime.</div>

            {!scanning ? (
              <>
                <div className="card" style={{padding:18, marginBottom:10, display:'flex', alignItems:'center', gap:14, cursor:'pointer'}} onClick={() => setScanning(true)}>
                  <div style={{width:42, height:42, borderRadius:11, background:'#fff', border:'1px solid var(--line)', display:'grid', placeItems:'center'}}>
                    <svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.4 2.5 30 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.8 6c1.9-5.6 7.1-9.7 13.7-9.7z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.6H24v9.1h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.3 28.6c-.5-1.4-.7-2.9-.7-4.5s.3-3.1.7-4.5l-7.8-6C.9 17.1 0 20.5 0 24s.9 6.9 2.5 10l7.8-6z"/><path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.5-5.8c-2.1 1.4-4.8 2.2-8.5 2.2-6.6 0-12-4.4-13.9-10.4l-7.8 6C6.4 42.6 14.5 48 24 48z"/></svg>
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:600}}>Continue with Gmail</div>
                    <div className="small" style={{marginTop:2}}>aman@gmail.com</div>
                  </div>
                  <Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>
                </div>
                <div className="card" style={{padding:18, marginBottom:10, display:'flex', alignItems:'center', gap:14, opacity:0.5}}>
                  <div style={{width:42, height:42, borderRadius:11, background:'#000', display:'grid', placeItems:'center', color:'#fff', fontSize:18, fontWeight:700}}></div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:14, fontWeight:600}}>iCloud Mail</div>
                    <div className="small" style={{marginTop:2}}>Coming soon</div>
                  </div>
                </div>

                <div className="card" style={{padding:14, marginTop:14, background:'var(--surface-2)', display:'flex', gap:10, alignItems:'flex-start'}}>
                  <Icon name="lock" size={16} style={{color:'var(--ink-2)', marginTop:2, flexShrink:0}}/>
                  <div className="small" style={{lineHeight:1.5}}>
                    <b style={{color:'var(--ink)'}}>Read-only access.</b> Parsing happens on-device. We never store full email bodies.
                  </div>
                </div>
              </>
            ) : (
              <div style={{flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center'}}>
                <div style={{position:'relative', width:120, height:120, marginBottom:24}}>
                  <svg viewBox="0 0 120 120" width="120" height="120" style={{transform:'rotate(-90deg)'}}>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--surface-2)" strokeWidth="8"/>
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--brand)" strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={2*Math.PI*50}
                      strokeDashoffset={(1 - scanned/247) * 2*Math.PI*50}
                      style={{transition:'stroke-dashoffset 0.3s ease'}}/>
                  </svg>
                  <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                    <Icon name="mail" size={28} style={{color:'var(--brand)'}}/>
                    <div className="tabular" style={{fontSize:18, fontWeight:600, marginTop:6}}>{scanned}</div>
                  </div>
                </div>
                <div className="h3">Scanning your inbox</div>
                <div className="small" style={{marginTop:6}}>Found {scanned} expense emails so far…</div>
                <div style={{display:'flex', gap:6, marginTop:14}}>
                  <span className="chip"><span className="dot-pulse"/> Receipts</span>
                  <span className="chip">UPI alerts</span>
                  <span className="chip">Subscriptions</span>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="fade-up fade-up-1" style={{flex:1}}>
            <div className="h2" style={{marginBottom:8}}>Choose your currency</div>
            <div className="body" style={{color:'var(--ink-2)', marginBottom:22}}>We'll convert any foreign expenses automatically.</div>
            {[
              { k:'INR', s:'₹', n:'Indian Rupee'},
              { k:'USD', s:'$', n:'US Dollar'},
              { k:'EUR', s:'€', n:'Euro'},
              { k:'GBP', s:'£', n:'Pound Sterling'},
            ].map(c => (
              <div key={c.k} onClick={() => setCurrency(c.k)} className="card" style={{padding:'14px 16px', marginBottom:8, display:'flex', alignItems:'center', gap:14, cursor:'pointer', borderColor: currency === c.k ? 'var(--brand)' : 'var(--line)', borderWidth:currency === c.k ? 1.5 : 1}}>
                <div style={{width:38, height:38, borderRadius:10, background: currency === c.k ? 'var(--brand-50)' : 'var(--surface-2)', color: currency === c.k ? 'var(--brand)' : 'var(--ink-2)', display:'grid', placeItems:'center', fontSize:18, fontWeight:600}}>{c.s}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14, fontWeight:600}}>{c.n}</div>
                  <div className="small mono">{c.k}</div>
                </div>
                {currency === c.k && <span style={{width:18, height:18, borderRadius:'50%', background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center'}}><Icon name="check" size={11} stroke={3}/></span>}
              </div>
            ))}
            <button onClick={next} className="btn btn-primary" style={{padding:14, width:'100%', marginTop:18}}>Continue</button>
          </div>
        )}

        {step === 3 && (
          <div className="fade-up fade-up-1" style={{flex:1, display:'flex', flexDirection:'column'}}>
            <div className="h2" style={{marginBottom:8}}>Set a monthly budget</div>
            <div className="body" style={{color:'var(--ink-2)', marginBottom:24}}>Based on your last 3 months, we suggest <b style={{color:'var(--ink)'}}>₹62,400</b>. Adjust if you'd like.</div>

            <div className="card" style={{padding:24, textAlign:'center', marginBottom:16}}>
              <div className="label">Monthly budget</div>
              <div className="tabular" style={{fontSize:38, fontWeight:600, letterSpacing:'-0.02em', marginTop:6}}>₹{budget.toLocaleString('en-IN')}</div>
              <input type="range" min="20000" max="200000" step="2000" value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{width:'100%', marginTop:18, accentColor:'var(--brand)'}}/>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:4}}>
                <span className="small mono">₹20k</span>
                <span className="small mono">₹2L</span>
              </div>
            </div>

            <div className="card" style={{padding:14, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', display:'flex', gap:10, alignItems:'flex-start'}}>
              <Icon name="sparkle" size={16} style={{color:'var(--brand)', marginTop:2}}/>
              <div style={{flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>AI will split this across 6 categories</div>
                <div className="small" style={{marginTop:2}}>You can adjust each category later in Budgets.</div>
              </div>
            </div>

            <div style={{flex:1}}/>
            <button onClick={onDone} className="btn btn-primary" style={{padding:14, width:'100%'}}>You're all set</button>
          </div>
        )}

        <div style={{height:30}}/>
      </div>
    </div>
  );
};

// ============================================================
// 3. GOAL DETAIL — contributions, edit, mark complete
// ============================================================
const GoalDetail = ({ goal, onBack }) => {
  const [showAdd, setShowAdd] = useStateN2(false);
  const pct = Math.round((goal.saved / goal.target) * 100);
  const remaining = goal.target - goal.saved;

  return (
    <div className="scroll" data-screen-label="10 Goal Detail">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:34, height:34, display:'grid', placeItems:'center'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <button className="btn btn-ghost" style={{padding:'6px 12px', fontSize:12, fontWeight:600}}>Edit</button>
        </div>

        {/* hero ring */}
        <div className="fade-up fade-up-2" style={{textAlign:'center', padding:'8px 0 26px'}}>
          <div style={{position:'relative', width:180, height:180, margin:'0 auto'}}>
            <svg viewBox="0 0 180 180" width="180" height="180" style={{transform:'rotate(-90deg)'}}>
              <circle cx="90" cy="90" r="78" fill="none" stroke="var(--surface-2)" strokeWidth="14"/>
              <circle cx="90" cy="90" r="78" fill="none" stroke="var(--brand)" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={2*Math.PI*78}
                strokeDashoffset={(1 - pct/100) * 2*Math.PI*78}
                style={{transition:'stroke-dashoffset 1.4s cubic-bezier(0.4, 0.8, 0.4, 1)'}}/>
            </svg>
            <div style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
              <div className="tabular" style={{fontSize:38, fontWeight:600, letterSpacing:'-0.02em', lineHeight:1}}>{pct}%</div>
              <div className="small mono" style={{marginTop:4}}>complete</div>
            </div>
          </div>
          <div className="h2" style={{marginTop:18}}>{goal.name}</div>
          <div className="small" style={{marginTop:4}}>by {goal.due}</div>
        </div>

        <div className="card fade-up fade-up-3" style={{padding:18, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <div>
              <div className="label">Saved</div>
              <div className="tabular" style={{fontSize:22, fontWeight:600, marginTop:2}}>₹{goal.saved.toLocaleString('en-IN')}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="label">Target</div>
              <div className="tabular" style={{fontSize:22, fontWeight:600, marginTop:2}}>₹{goal.target.toLocaleString('en-IN')}</div>
            </div>
          </div>
          <div className="progress" style={{marginTop:14, height:8}}>
            <i style={{width:`${pct}%`}}/>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:8}}>
            <span className="small mono">₹{remaining.toLocaleString('en-IN')} to go</span>
            <span className="small mono">~₹{Math.round(remaining/4).toLocaleString('en-IN')}/mo</span>
          </div>
        </div>

        <button onClick={() => setShowAdd(true)} className="btn btn-primary fade-up fade-up-3" style={{width:'100%', padding:14, marginBottom:18}}>+ Add contribution</button>

        <div className="label" style={{margin:'8px 4px 8px'}}>Contributions</div>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          {[
            ['Apr 22', 'From salary', 8000],
            ['Apr 8',  'Manual',      4500],
            ['Mar 30', 'From salary', 8000],
            ['Mar 12', 'Tax refund',  6500],
            ['Feb 28', 'From salary', 5000],
          ].map(([d, t, v], i, a) => (
            <div key={i} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'13px 16px', borderBottom: i < a.length-1 ? '1px solid var(--line)' : 'none'}}>
              <div>
                <div style={{fontSize:13, fontWeight:600}}>{t}</div>
                <div className="small mono" style={{marginTop:2}}>{d}</div>
              </div>
              <div className="tabular" style={{fontSize:14, fontWeight:600, color:'var(--ok)'}}>+₹{v.toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>

        <div style={{height:30}}/>
      </div>

      {showAdd && (
        <>
          <div className="scrim open" onClick={() => setShowAdd(false)}/>
          <div className="sheet open" style={{padding:'18px 22px 24px'}}>
            <div className="grabber"/>
            <div className="h3" style={{marginTop:6, marginBottom:14}}>Add contribution</div>
            <input placeholder="Amount" inputMode="numeric" autoFocus style={{width:'100%', padding:14, fontSize:20, fontWeight:600, fontFamily:'inherit', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)', textAlign:'center', boxSizing:'border-box'}}/>
            <div style={{display:'flex', gap:8, marginTop:12, flexWrap:'wrap'}}>
              {['₹500', '₹1k', '₹5k', '₹10k'].map(q => <span key={q} className="chip" style={{cursor:'pointer'}}>{q}</span>)}
            </div>
            <button onClick={() => setShowAdd(false)} className="btn btn-primary" style={{width:'100%', padding:14, marginTop:18}}>Add</button>
          </div>
        </>
      )}
    </div>
  );
};

// ============================================================
// 4. CATEGORY DETAIL — all txns, trend, edit budget
// ============================================================
const CategoryDetail = ({ cat, onBack }) => {
  const pts = [38, 42, 50, 36, 58, 64, 52, 60, 72, 68, 76, 84];
  const w=320, h=80, padX=8;
  const max = 100;
  const step = (w - padX*2) / (pts.length-1);
  const xy = pts.map((v,i) => [padX + i*step, h - 8 - (v/max)*(h-16)]);
  const linePath = "M" + xy.map(p => p.map(n => n.toFixed(1)).join(",")).join(" L");

  return (
    <div className="scroll" data-screen-label="11 Category Detail">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:34, height:34, display:'grid', placeItems:'center'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <button className="btn btn-ghost" style={{padding:'6px 12px', fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:5}}>
            <Icon name="filter" size={13}/> Filter
          </button>
        </div>

        <div className="fade-up fade-up-2" style={{textAlign:'center', padding:'8px 0 22px'}}>
          <CatIcon kind={cat.k} size={52}/>
          <div className="h2" style={{marginTop:14}}>{cat.name}</div>
          <div className="tabular" style={{fontSize:36, fontWeight:600, letterSpacing:'-0.02em', marginTop:10}}>₹{cat.spent.toLocaleString('en-IN')}</div>
          <div className="small mono" style={{marginTop:2}}>of ₹{cat.budget.toLocaleString('en-IN')} this month · <span style={{color: cat.spent > cat.budget ? 'var(--err)' : 'var(--ok)'}}>{cat.spent > cat.budget ? 'over' : 'on track'}</span></div>
        </div>

        <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14}}>
          <div className="progress" style={{height:8, marginBottom:14}}>
            <i style={{width:`${Math.min(100, (cat.spent/cat.budget)*100)}%`, background: cat.spent > cat.budget ? 'var(--err)' : undefined}}/>
          </div>
          <div className="label" style={{marginBottom:8}}>12-month trend</div>
          <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{height:80}}>
            <path d={linePath} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round"/>
            {xy.map((p,i) => i === xy.length-1 && <circle key={i} cx={p[0]} cy={p[1]} r="4" fill="var(--brand)"/>)}
          </svg>
        </div>

        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:18}}>
          <Mini label="Avg / mo" value="₹11.4k"/>
          <Mini label="Top merchant" value="Swiggy"/>
          <Mini label="Txns" value="34"/>
        </div>

        <div className="label" style={{margin:'4px 4px 8px'}}>This month</div>
        <div className="card fade-up fade-up-4" style={{padding:'4px 0', marginBottom:14}}>
          {[
            ['Swiggy', 'Dinner — Toit', 'Today, 9:12 PM', 420, 'Gmail'],
            ['Zomato', 'Lunch — Burma Burma', 'Mon, 1:08 PM', 480, 'Gmail'],
            ['Blue Tokai', 'Morning latte', 'Tue, 7:50 AM', 359, 'Gmail'],
            ['Swiggy', 'Mid-week dinner', 'Wed, 8:30 PM', 540, 'Gmail'],
            ['Subway', 'Office lunch', 'Thu, 1:20 PM', 320, 'SMS'],
          ].map((r, i, a) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none'}}>
              <CatIcon kind={cat.k}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
                  <div style={{fontWeight:600, fontSize:14}}>{r[0]}</div>
                  <div className="tabular" style={{fontWeight:600, fontSize:14}}>−₹{r[3]}</div>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:2}}>
                  <span className="small">{r[1]}</span>
                  <span className="small mono">{r[2]}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="btn btn-ghost" style={{width:'100%', padding:12, fontWeight:600, color:'var(--brand)'}}>Show all 34 transactions</button>
        <div style={{height:30}}/>
      </div>
    </div>
  );
};

const Mini = ({ label, value }) => (
  <div className="card" style={{padding:12, textAlign:'center'}}>
    <div className="label" style={{fontSize:9}}>{label}</div>
    <div className="tabular" style={{fontSize:13, fontWeight:600, marginTop:3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{value}</div>
  </div>
);

// ============================================================
// 5. AI EXPLAIN SHEET — reasoning + sources
// ============================================================
const AIExplain = ({ insight, onClose }) => (
  <>
    <div className="scrim open" onClick={onClose}/>
    <div className="sheet open" style={{maxHeight:'85%', display:'flex', flexDirection:'column', paddingBottom:16}}>
      <div className="grabber"/>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 12px'}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center'}}>
            <Icon name="sparkle" size={16}/>
          </div>
          <div>
            <div className="h3">Why this insight?</div>
            <div className="small mono" style={{marginTop:2}}>Claude · 0.8s</div>
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}><Icon name="x" size={16}/></button>
      </div>

      <div style={{flex:1, overflowY:'auto', padding:'4px 22px 0'}}>
        <div className="card" style={{padding:16, marginBottom:14, background:'var(--brand-soft)'}}>
          <div style={{fontSize:15, fontWeight:600, lineHeight:1.4}}>{insight.text}</div>
        </div>

        <div className="label" style={{margin:'8px 4px 8px'}}>Reasoning</div>
        <div className="card" style={{padding:0, marginBottom:14}}>
          {insight.reasoning.map((r, i, a) => (
            <div key={i} style={{display:'flex', gap:12, padding:'14px 16px', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none'}}>
              <div style={{width:22, height:22, borderRadius:'50%', background:'var(--brand-50)', color:'var(--brand)', display:'grid', placeItems:'center', fontSize:11, fontWeight:600, flexShrink:0}}>{i+1}</div>
              <div style={{flex:1, fontSize:13, lineHeight:1.5}}>{r}</div>
            </div>
          ))}
        </div>

        <div className="label" style={{margin:'8px 4px 8px'}}>Based on these transactions</div>
        <div className="card" style={{padding:'4px 0', marginBottom:14}}>
          {insight.sources.map((s, i, a) => (
            <div key={i} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 16px', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none'}}>
              <CatIcon kind={s.k} size={28}/>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:13, fontWeight:600}}>{s.merchant}</div>
                <div className="small mono">{s.date}</div>
              </div>
              <div className="tabular" style={{fontSize:13, fontWeight:600}}>−₹{s.amount}</div>
            </div>
          ))}
        </div>

        <div className="card" style={{padding:14, background:'var(--surface-2)', display:'flex', gap:10, alignItems:'flex-start', marginBottom:14}}>
          <Icon name="lock" size={14} style={{color:'var(--ink-3)', marginTop:1, flexShrink:0}}/>
          <div className="small">Only category, amount, and merchant were sent to the AI. Email bodies stayed on device.</div>
        </div>

        <div style={{display:'flex', gap:8}}>
          <button className="btn btn-ghost" style={{flex:1, padding:12}}>👎 Not helpful</button>
          <button className="btn btn-ghost" style={{flex:1, padding:12, color:'var(--brand)'}}>👍 Helpful</button>
        </div>
      </div>
    </div>
  </>
);

// ============================================================
// 6. EMPTY STATES — Activity, Goals, Budgets
// ============================================================
const EmptyState = ({ kind, onAction }) => {
  const variants = {
    activity: {
      ico: 'mail',
      title: 'No expenses yet',
      body: 'Connect Gmail to pull receipts automatically, or add one manually.',
      primary: { label: 'Connect Gmail', onClick: () => onAction && onAction('connect') },
      secondary: { label: 'Add manually', onClick: () => onAction && onAction('add') },
    },
    goals: {
      ico: 'target',
      title: 'No savings goals',
      body: 'Set a goal — a Bali trip, an emergency fund, that new lens. We\'ll track contributions automatically.',
      primary: { label: 'New goal', onClick: () => onAction && onAction('new') },
    },
    budgets: {
      ico: 'wallet',
      title: 'Set your first budget',
      body: 'AI will analyze your last 3 months and suggest realistic limits per category.',
      primary: { label: 'Auto-generate', onClick: () => onAction && onAction('auto') },
      secondary: { label: 'Set manually', onClick: () => onAction && onAction('manual') },
    },
    search: {
      ico: 'search',
      title: 'No matches',
      body: 'Try a different merchant, amount range, or category.',
      primary: { label: 'Clear filters', onClick: () => onAction && onAction('clear') },
    },
  };

  const v = variants[kind] || variants.activity;

  return (
    <div className="scroll" data-screen-label={`12 Empty · ${kind}`}>
      <div style={{padding:'40px 30px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', minHeight:'100%', gap:0}}>
        <div className="fade-up fade-up-1" style={{position:'relative', marginBottom:24}}>
          <div style={{width:108, height:108, borderRadius:'50%', background:'var(--brand-soft)', display:'grid', placeItems:'center', position:'relative'}}>
            <div style={{position:'absolute', inset:8, borderRadius:'50%', border:'1px dashed color-mix(in srgb, var(--brand) 30%, transparent)'}}/>
            <div style={{width:60, height:60, borderRadius:'50%', background:'var(--surface)', display:'grid', placeItems:'center', boxShadow:'0 8px 24px rgba(15,138,95,0.18)'}}>
              <Icon name={v.ico} size={26} style={{color:'var(--brand)'}}/>
            </div>
          </div>
        </div>
        <div className="h2 fade-up fade-up-2">{v.title}</div>
        <div className="body fade-up fade-up-3" style={{color:'var(--ink-2)', marginTop:10, maxWidth:280}}>{v.body}</div>
        <div className="fade-up fade-up-4" style={{display:'flex', flexDirection:'column', gap:8, marginTop:28, width:'100%', maxWidth:260}}>
          <button onClick={v.primary.onClick} className="btn btn-primary" style={{padding:'14px', fontSize:14}}>{v.primary.label}</button>
          {v.secondary && <button onClick={v.secondary.onClick} className="btn btn-ghost" style={{padding:'14px', fontSize:14}}>{v.secondary.label}</button>}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { Onboarding, GoalDetail, CategoryDetail, AIExplain, EmptyState });

