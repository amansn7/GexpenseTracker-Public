/* Gexpense Hi-Fi — Quick Add sheet, Settings, AI Settings */
const { useState: useState2, useEffect: useEffect2 } = React;

// ============================================================
// QUICK ADD SHEET
// ============================================================
const QuickAddSheet = ({ open, onClose, onSave }) => {
  const [amount, setAmount] = useState2('');
  const [cat, setCat] = useState2('food');
  const [note, setNote] = useState2('');

  useEffect2(() => { if (open) { setAmount(''); setCat('food'); setNote(''); } }, [open]);

  const press = (k) => {
    if (k === '⌫') setAmount(s => s.slice(0, -1));
    else if (k === '.') { if (!amount.includes('.')) setAmount(s => (s || '0') + '.'); }
    else setAmount(s => (s + k).replace(/^0+(?=\d)/, '').slice(0, 7));
  };

  const cats = [
    ['food','Food'],['travel','Travel'],['shop','Shop'],['bills','Bills'],
    ['coffee','Coffee'],['grocery','Grocery'],['subs','Subs'],['fuel','Fuel'],
  ];

  return (
    <div className={`sheet ${open ? 'open' : ''}`} style={{paddingBottom: 14}}>
      <div className="grabber"/>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 12px'}}>
        <div className="h3">Add expense</div>
        <button className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}} onClick={onClose}>
          <Icon name="x" size={16}/>
        </button>
      </div>

      {/* amount */}
      <div style={{padding:'12px 22px 16px', textAlign:'center'}}>
        <div className="label">Amount</div>
        <div style={{display:'flex', alignItems:'baseline', justifyContent:'center', gap:4, marginTop:8}}>
          <span style={{fontSize:32, fontWeight:500, color:'var(--ink-3)'}}>₹</span>
          <span className="tabular" style={{fontSize: 56, fontWeight:600, letterSpacing:'-0.03em', lineHeight:1, color: amount ? 'var(--ink)' : 'var(--ink-4)'}}>
            {amount || '0'}
          </span>
          <span style={{display:'inline-block', width:2, height:44, background:'var(--brand)', marginLeft:2, animation:'blink 1.1s steps(1) infinite'}}/>
        </div>
        {amount && <div className="small" style={{marginTop:6, color:'var(--brand)'}}>AI suggested: <b>Food · Swiggy</b></div>}
      </div>

      {/* category chips */}
      <div style={{padding:'0 22px 14px'}}>
        <div className="label" style={{marginBottom:8}}>Category</div>
        <div style={{display:'flex', gap:8, overflowX:'auto', paddingBottom:4, scrollbarWidth:'none'}}>
          {cats.map(([k, label]) => (
            <div key={k} onClick={() => setCat(k)} style={{flexShrink:0, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'8px 12px', borderRadius:14, background: cat===k ? 'var(--brand-soft)' : 'var(--surface-2)', border: cat===k ? '1px solid var(--brand)' : '1px solid transparent', cursor:'pointer', minWidth:64}}>
              <CatIcon kind={k}/>
              <span style={{fontSize:11, fontWeight:500, color: cat===k ? 'var(--brand)' : 'var(--ink-2)'}}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* date + note */}
      <div style={{padding:'0 22px 12px', display:'flex', gap:8}}>
        <div className="card" style={{flex:1, padding:'10px 12px', display:'flex', alignItems:'center', gap:10}}>
          <Icon name="calendar" size={16} style={{color:'var(--ink-3)'}}/>
          <div style={{flex:1, minWidth:0}}>
            <div className="label">Date</div>
            <div style={{fontSize:13, fontWeight:500, marginTop:1}}>Today · 25 Apr</div>
          </div>
        </div>
        <div className="card" style={{flex:1, padding:'10px 12px', display:'flex', alignItems:'center', gap:10}}>
          <Icon name="note" size={16} style={{color:'var(--ink-3)'}}/>
          <div style={{flex:1, minWidth:0}}>
            <div className="label">Note</div>
            <input value={note} onChange={e=>setNote(e.target.value)} placeholder="Add note…" style={{border:'none', background:'transparent', width:'100%', fontSize:13, marginTop:1, fontWeight:500, color:'var(--ink)', outline:'none'}}/>
          </div>
        </div>
      </div>

      {/* keypad */}
      <div className="keypad">
        {['1','2','3','4','5','6','7','8','9','.','0','⌫'].map(k => (
          <button key={k} className="key" onClick={()=>press(k)}>
            {k === '⌫' ? <Icon name="x" size={20}/> : k}
          </button>
        ))}
      </div>

      <div style={{padding:'4px 22px 8px'}}>
        <button className="btn btn-primary" style={{width:'100%', padding:'14px', fontSize:15}} onClick={() => onSave({amount, cat, note})}>
          Save expense
        </button>
      </div>
    </div>
  );
};

// ============================================================
// SETTINGS — basic
// ============================================================
const Settings = ({ theme, onTheme }) => {
  const [autoFetch, setAutoFetch] = useState2(true);
  const [sms, setSms] = useState2(true);
  const [notif, setNotif] = useState2(true);

  return (
    <div className="scroll" data-screen-label="05 Settings">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div className="h2">Settings</div>
        </div>

        {/* Profile */}
        <div className="card fade-up fade-up-2" style={{padding:16, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            <div style={{width:56, height:56, borderRadius:'50%', background:'var(--brand-50)', color:'var(--brand)', display:'grid', placeItems:'center', fontSize:22, fontWeight:600, flexShrink:0}}>A</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:600, fontSize:15}}>Aman Sharma</div>
              <div className="small mono" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>user@example.com</div>
            </div>
            <button className="btn btn-ghost" style={{padding:'8px 14px', fontSize:12}}>Edit</button>
          </div>
        </div>

        {/* Auto-tracking */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Auto-tracking</div>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          <Row icon="mail" label="Gmail extraction" sub="Connected · user@example.com" right={<Toggle on={autoFetch} onClick={() => setAutoFetch(!autoFetch)}/>}/>
          <Divider/>
          <Row icon="zap" label="SMS parsing" sub="Bank & UPI alerts" right={<Toggle on={sms} onClick={() => setSms(!sms)}/>}/>
          <Divider/>
          <Row icon="db" label="Bank & UPI accounts" sub="2 connected" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
        </div>

        {/* Preferences */}
        <div className="label" style={{margin:'14px 4px 8px'}}>Preferences</div>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <Row icon={theme==='dark' ? 'moon' : 'sun'} label="Dark mode" sub={theme==='dark' ? 'On' : 'Off · tap to enable'} right={<Toggle on={theme==='dark'} onClick={() => onTheme(theme==='dark'?'light':'dark')}/>}/>
          <Divider/>
          <Row icon="bell" label="Notifications" sub="Daily summary at 9 PM" right={<Toggle on={notif} onClick={() => setNotif(!notif)}/>}/>
          <Divider/>
          <Row icon="wallet" label="Monthly budget" sub="₹60,000" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          <Divider/>
          <Row icon="download" label="Export data" sub="CSV · last 12 months" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          <Divider/>
          <Row icon="lock" label="Privacy & data" sub="On-device parsing" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
        </div>

        <div style={{textAlign:'center', margin:'14px 0 30px', display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <Monogram size={28} brand/>
          <div className="small mono">Gexpense v1.0 · made for fast hands</div>
          <div className="small" style={{color:'var(--brand)', fontWeight:500, cursor:'pointer'}}>AI Settings →</div>
        </div>
      </div>
    </div>
  );
};

const Row = ({ icon, label, sub, right }) => (
  <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px'}}>
    <div style={{width:32, height:32, borderRadius:9, background:'var(--surface-2)', display:'grid', placeItems:'center', color:'var(--ink-2)', flexShrink:0}}>
      <Icon name={icon} size={16}/>
    </div>
    <div style={{flex:1, minWidth:0}}>
      <div style={{fontSize:14, fontWeight:600}}>{label}</div>
      <div className="small mono" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{sub}</div>
    </div>
    {right}
  </div>
);
const Divider = () => <div style={{height:1, background:'var(--line)', marginLeft:60}}/>;

// ============================================================
// AI SETTINGS
// ============================================================
const SettingsAI = () => {
  const [advOpen, setAdvOpen] = useState2(true);
  const [tab, setTab] = useState2('parse');
  const [autoFb, setAutoFb] = useState2(true);

  return (
    <div className="scroll" data-screen-label="06 Settings AI">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6}}>
          <div>
            <div className="small" style={{color:'var(--brand)', fontWeight:500}}>← Settings</div>
            <div className="h2" style={{marginTop:4}}>AI Settings</div>
          </div>
          <Badge tone="ok">3 live</Badge>
        </div>
        <div className="body fade-up fade-up-2" style={{marginBottom:18}}>
          Configure the models that read your receipts, categorize spend, and spot patterns.
        </div>

        {/* providers */}
        <div className="label" style={{margin:'4px 4px 8px', display:'flex', justifyContent:'space-between'}}>
          <span>Providers</span>
          <span style={{textTransform:'none', letterSpacing:0, color:'var(--ink-4)'}}>$12.40 used / $25.00</span>
        </div>

        {[
          {n:'Claude Sonnet 4.5', vendor:'Anthropic', ini:'A',  badge:['ok','live'],     prio:1, last:'2 min ago', on:true,  bg:'#F5E5D4'},
          {n:'GPT-4o mini',       vendor:'OpenAI',    ini:'O',  badge:['warn','rate-limit'], prio:2, last:'14 min ago', on:true, bg:'#DEEFE2'},
          {n:'Gemini 2.5 Flash',  vendor:'Google',    ini:'G',  badge:['ok','live'],     prio:3, last:'1 hr ago',   on:true,  bg:'#DCE6F4'},
          {n:'Llama 3.3 (local)', vendor:'Ollama',    ini:'L',  badge:['idle','paused'], prio:4, last:'yesterday',  on:false, bg:'#ECECE7'},
        ].map((p, i) => (
          <div key={p.n} className={`card fade-up fade-up-${i+3}`} style={{padding:14, marginBottom:8}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <Icon name="grip" size={16} style={{color:'var(--ink-4)', cursor:'grab', flexShrink:0}}/>
              <div style={{width:36, height:36, borderRadius:10, background:p.bg, color:'var(--ink)', display:'grid', placeItems:'center', fontWeight:700, fontSize:14, flexShrink:0}}>{p.ini}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}>
                  <div style={{fontSize:14, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{p.n}</div>
                  <Toggle on={p.on}/>
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8, marginTop:6, justifyContent:'space-between'}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <Badge tone={p.badge[0]}>{p.badge[1]}</Badge>
                    <span className="small mono">#{p.prio}</span>
                  </div>
                  <span className="small mono">{p.last}</span>
                </div>
              </div>
            </div>
          </div>
        ))}

        <button className="btn btn-ghost" style={{width:'100%', marginTop:6, padding:'12px', borderStyle:'dashed', border:'1px dashed var(--line-strong)', background:'transparent', color:'var(--ink-2)'}}>
          + Add provider
        </button>

        {/* advanced */}
        <div className="card" style={{marginTop:14, padding:0, overflow:'hidden'}}>
          <div onClick={()=>setAdvOpen(!advOpen)} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', cursor:'pointer'}}>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <Icon name="cog" size={16} style={{color:'var(--ink-3)'}}/>
              <div style={{fontWeight:600, fontSize:14}}>Routing & advanced</div>
            </div>
            <Icon name={advOpen ? 'chevronD' : 'chevron'} size={16} style={{color:'var(--ink-3)'}}/>
          </div>
          {advOpen && (
            <div style={{padding:'0 16px 16px', borderTop:'1px solid var(--line)'}}>
              <div className="label" style={{margin:'14px 0 8px'}}>Priority order</div>
              <div style={{borderRadius:10, background:'var(--surface-2)', overflow:'hidden'}}>
                {['Claude Sonnet 4.5','GPT-4o mini','Gemini 2.5 Flash','Llama 3.3'].map((n, i, a) => (
                  <div key={n} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 12px', borderBottom: i<a.length-1?'1px solid var(--line)':'none', background: i===0?'var(--brand-soft)':'transparent'}}>
                    <div style={{display:'flex', alignItems:'center', gap:10}}>
                      <Icon name="grip" size={14} style={{color:'var(--ink-4)'}}/>
                      <span className="mono small tabular">{i+1}.</span>
                      <span style={{fontSize:13, fontWeight: i===0?600:400}}>{n}</span>
                    </div>
                    {i===0 && <Badge tone="ok">primary</Badge>}
                  </div>
                ))}
              </div>

              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600}}>Auto fallback</div>
                  <div className="small mono">Retry next provider on error</div>
                </div>
                <Toggle on={autoFb} onClick={()=>setAutoFb(!autoFb)}/>
              </div>

              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600}}>Rate limit handling</div>
                  <div className="small mono">Backoff · 2s → 8s → 32s</div>
                </div>
                <Icon name="chevron" size={14} style={{color:'var(--ink-3)'}}/>
              </div>

              <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14}}>
                <div>
                  <div style={{fontSize:13, fontWeight:600}}>Monthly budget cap</div>
                  <div className="small mono tabular">$12.40 of $25.00 used</div>
                </div>
                <Icon name="chevron" size={14} style={{color:'var(--ink-3)'}}/>
              </div>
              <div className="progress" style={{marginTop:6}}><i style={{width:'49.6%'}}/></div>
            </div>
          )}
        </div>

        {/* test lab */}
        <div className="label" style={{margin:'18px 4px 8px'}}>Test lab · dry-run</div>
        <div className="card" style={{padding:0, overflow:'hidden'}}>
          <div style={{display:'flex', borderBottom:'1px solid var(--line)', background:'var(--surface-2)'}}>
            {[['parse','Parse'],['cat','Classify'],['dup','Dedupe'],['rule','Rules']].map(([k, l])=>(
              <div key={k} onClick={()=>setTab(k)} style={{flex:1, textAlign:'center', padding:'12px 6px', cursor:'pointer', fontSize:12, fontWeight:600, color: tab===k ? 'var(--ink)' : 'var(--ink-3)', borderBottom: tab===k ? '2px solid var(--brand)' : '2px solid transparent', background: tab===k ? 'var(--surface)' : 'transparent', transition:'all 0.18s ease'}}>{l}</div>
            ))}
          </div>
          <div style={{padding:14}}>
            {tab === 'parse' && (
              <>
                <div className="label">Sample email</div>
                <div className="mono" style={{borderRadius:10, padding:12, marginTop:6, background:'var(--surface-2)', fontSize:11, lineHeight:1.5, color:'var(--ink-2)'}}>
                  From: noreply@swiggy.in<br/>
                  Subject: Order #SW-49213<br/>
                  Total: ₹420 · 25 Apr 9:12 PM
                </div>
                <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
                  <button className="btn btn-primary" style={{padding:'8px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6}}>
                    <Icon name="play" size={12}/> Run parse
                  </button>
                </div>
                <div style={{marginTop:12, padding:12, borderRadius:10, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
                  <div style={{display:'flex', justifyContent:'space-between', marginBottom:6}}>
                    <span className="label" style={{color:'var(--brand)'}}>Extracted · 0.84s · Claude</span>
                    <Badge tone="ok">200</Badge>
                  </div>
                  <pre className="mono" style={{margin:0, fontSize:11, lineHeight:1.6, color:'var(--ink)', whiteSpace:'pre-wrap'}}>{`{
  merchant: "Swiggy",
  amount: 420.00,
  currency: "INR",
  category: "food",
  confidence: 0.97
}`}</pre>
                </div>
              </>
            )}
            {tab === 'cat' && (
              <>
                <div className="label">Try a transaction</div>
                <div className="mono" style={{borderRadius:10, padding:'10px 12px', marginTop:6, background:'var(--surface-2)', fontSize:12}}>"Blue Tokai · ₹359 · 8:15 AM"</div>
                <div style={{display:'flex', justifyContent:'flex-end', marginTop:10}}>
                  <button className="btn btn-primary" style={{padding:'8px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6}}>
                    <Icon name="play" size={12}/> Classify
                  </button>
                </div>
                <div style={{marginTop:14}}>
                  {[['Coffee', 0.92, 'var(--brand)'], ['Food', 0.06, 'var(--ink-3)'], ['Other', 0.02, 'var(--ink-4)']].map(([n, p, c]) => (
                    <div key={n} style={{display:'flex', alignItems:'center', gap:8, marginBottom:8}}>
                      <span style={{width:60, fontSize:12, fontWeight:600}}>{n}</span>
                      <div className="progress" style={{flex:1}}><i style={{width:`${p*100}%`, background:c}}/></div>
                      <span className="mono small tabular" style={{width:36, textAlign:'right'}}>{(p*100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {tab === 'dup' && (
              <>
                <div className="label">Recent scan</div>
                <div style={{marginTop:8}}>
                  {[
                    ['Swiggy · ₹420 · 9:12 PM', 'Gmail', true],
                    ['Swiggy · ₹420 · 9:14 PM', 'SMS HDFC', true],
                    ['Uber · ₹186 · 3:40 PM',   'Gmail', false],
                  ].map((r, i, a) => (
                    <div key={i} style={{display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none'}}>
                      <div>
                        <div style={{fontSize:13, fontWeight:500}}>{r[0]}</div>
                        <div className="small mono">via {r[1]}</div>
                      </div>
                      <Badge tone={r[2] ? 'warn' : 'ok'}>{r[2] ? 'duplicate' : 'unique'}</Badge>
                    </div>
                  ))}
                </div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:12}}>
                  <span className="small mono">1 duplicate found</span>
                  <button className="btn btn-primary" style={{padding:'8px 14px', fontSize:12}}>Merge</button>
                </div>
              </>
            )}
            {tab === 'rule' && (
              <>
                <div className="label">Rule</div>
                <div className="mono" style={{borderRadius:10, padding:12, marginTop:6, background:'var(--surface-2)', fontSize:11, lineHeight:1.6, color:'var(--ink-2)'}}>
                  <div><span style={{color:'var(--brand)'}}>IF</span> merchant CONTAINS <b style={{color:'var(--ink)'}}>"Uber"</b></div>
                  <div><span style={{color:'var(--brand)'}}>AND</span> amount &gt; ₹100</div>
                  <div><span style={{color:'var(--brand)'}}>THEN</span> category = <b style={{color:'var(--ink)'}}>Travel</b>, tag = <b style={{color:'var(--ink)'}}>#commute</b></div>
                </div>
                <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:10}}>
                  <button className="btn btn-ghost" style={{padding:'8px 14px', fontSize:12}}>Edit</button>
                  <button className="btn btn-primary" style={{padding:'8px 14px', fontSize:12, display:'flex', alignItems:'center', gap:6}}>
                    <Icon name="play" size={12}/> Simulate
                  </button>
                </div>
                <div style={{marginTop:12, padding:12, borderRadius:10, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
                  <div style={{display:'flex', justifyContent:'space-between'}}>
                    <span style={{fontSize:13, fontWeight:600}}>14 transactions matched</span>
                    <Badge tone="ok">pass</Badge>
                  </div>
                  <div className="small mono" style={{marginTop:4}}>Last 30 days · would re-tag 3 existing</div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* integration */}
        <div className="label" style={{margin:'18px 4px 8px'}}>Integrations</div>
        <div className="card" style={{padding:14, marginBottom:30}}>
          <div style={{display:'flex', alignItems:'center', gap:12}}>
            <div style={{width:36, height:36, borderRadius:10, background:'#FDECEA', color:'#B81E1E', display:'grid', placeItems:'center', flexShrink:0}}>
              <Icon name="mail" size={16}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:14, fontWeight:600}}>Gmail</div>
              <div className="small mono" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>user@example.com</div>
            </div>
            <Badge tone="ok">connected</Badge>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:12, fontSize:12}}>
            <span className="mono small">1,284 / 1,560 emails parsed</span>
            <span className="mono small">4 min ago</span>
          </div>
          <div className="progress" style={{marginTop:6}}><i style={{width:'82%'}}/></div>

          <div style={{marginTop:14}}>
            <div className="label" style={{marginBottom:8}}>Sync frequency</div>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              <Chip>Realtime</Chip>
              <Chip active brand>15 min</Chip>
              <Chip>1 hour</Chip>
              <Chip>Manual</Chip>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { QuickAddSheet, Settings, SettingsAI, Row, Divider });

