/* Gexpense Hi-Fi — Helper components extracted from original compiled bundle */
/* ===== TwkToggle ===== */
const TwkToggle = ({ on, onClick }) => (
  <div role="switch" aria-checked={on} className={'twk-toggle' + (on ? ' on' : '')} onClick={onClick}/>
);

window.TweaksPanel = function TweaksPanel({ tweaks, setTweak, visible, onClose }) {
  if (!visible) return null;
  const g = tweaks.gestures || {};
  const d = tweaks.demo || {};
  return (
    <div className="tweaks-panel" data-tweaks-panel>
      <header>
        <div className="ttl">Tweaks</div>
        <button className="x" onClick={onClose} aria-label="Close tweaks">×</button>
      </header>

      <div className="section-label">Gestures</div>
      <div className="row">
        <div>
          <div className="lbl">Pull-to-refresh</div>
          <div className="sub">Dashboard & Activity</div>
        </div>
        <TwkToggle on={!!g.pullToRefresh} onClick={() => setTweak('gestures.pullToRefresh', !g.pullToRefresh)}/>
      </div>

      <div className="section-label">Demo</div>
      <div className="row">
        <div>
          <div className="lbl">Synced timestamp</div>
          <div className="sub">Show "Synced 2m ago" on Activity</div>
        </div>
        <TwkToggle on={!!d.showSyncedTimestamp} onClick={() => setTweak('demo.showSyncedTimestamp', !d.showSyncedTimestamp)}/>
      </div>

      <div className="footer">Changes persist across reloads.</div>
    </div>
  );
};


/* Gexpense Hi-Fi — Dashboard, Transactions, Insights screens */

/* ===== SyncPill ===== */
const SyncPill = () => {
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(2);
  useEffect(() => {
    const t = setInterval(() => setLastSync(x => x + 1), 60000);
    return () => clearInterval(t);
  }, []);
  const handleSync = () => {
    if (syncing) return;
    setSyncing(true);
    setTimeout(() => { setSyncing(false); setLastSync(0); }, 1400);
  };
  return (
    <div onClick={handleSync} data-sync-pill style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', borderRadius:99, background:'var(--surface-2)', border:'1px solid var(--line)', marginBottom:12, cursor:'pointer'}}>
      <div style={{display:'flex', alignItems:'center', gap:8}}>
        <span style={{width:7, height:7, borderRadius:'50%', background: syncing ? 'var(--brand)' : 'var(--ok)', boxShadow: syncing ? '0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)' : 'none', transition:'all 0.3s'}}/>
        <span className="small" style={{fontWeight:500, color:'var(--ink-2)'}}>
          {syncing ? 'Syncing from Gmail & SMS…' : `Last synced ${lastSync === 0 ? 'just now' : lastSync + 'm ago'}`}
        </span>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:4, color:'var(--ink-3)'}}>
        <Icon name="refresh" size={12} style={{animation: syncing ? 'spin 1s linear infinite' : 'none'}}/>
      </div>
    </div>
  );
};

// ============================================================
// AI Insight Ticker — rotating dashboard insight bar
// ============================================================

/* ===== AIInsightTicker ===== */
const AIInsightTicker = ({ onNavigate = () => {} }) => {
  const [paused, setPaused] = useState(false);
  const insights = [
    { kind:'food',     label:'Food',          body: <>You spent <b>32% more on food</b> this week — mostly weekend dinners.</>,
      chips:[
        ['Set a limit', () => window.__openMonthly && window.__openMonthly()],
        ['Why?',         () => window.__openInsight && window.__openInsight('food')],
      ] },
    { kind:'subs',     label:'Subscriptions', body: <><b>₹2,499</b> on subs this month · 1 unused since Feb.</>,
      chips:[
        ['Review',     () => window.__openInsight && window.__openInsight('subs')],
        ['Cancel one', () => window.__toast && window.__toast('Apple TV+ paused · save ₹229/mo', () => window.__toast && window.__toast('Restored'))],
      ] },
    { kind:'saving',   label:'Saving',        body: <>On pace to save <b>₹17,820</b> this month — best in 4 months.</>,
      chips:[
        ['Add to goal', () => window.__openAddGoal && window.__openAddGoal()],
        ['See trend',   () => onNavigate('insights')],
      ] },
    { kind:'cashflow', label:'Cashflow',      body: <>Salary lands <b>in 5 days</b> · ₹18,400 in pending bills.</>,
      chips:[
        ['Plan',   () => onNavigate('settings', 'budgets')],
        ['Snooze', () => window.__toast && window.__toast('Snoozed for 7 days')],
      ] },
  ];
  const [i, setI] = useState(0);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI(x => (x+1) % insights.length), 4200);
    return () => clearInterval(t);
  }, [paused]);
  const cur = insights[i];
  const open = () => window.__openInsight && window.__openInsight(cur.kind);
  return (
    <div style={{padding:14, cursor:'pointer'}} onClick={open}
         onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
        <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
          <Icon name="sparkle" size={16}/>
        </div>
        <div style={{flex:1, minWidth:0, overflow:'hidden'}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div className="label" style={{color:'var(--brand)'}}>Smart insight · {cur.label}</div>
            <div style={{display:'flex', gap:3}}>
              {insights.map((_, j) => (
                <span key={j} onClick={(e) => { e.stopPropagation(); setI(j); setPaused(true); }}
                  style={{width: j===i ? 14 : 5, height:5, borderRadius:99, cursor:'pointer', background: j===i ? 'var(--brand)' : 'color-mix(in srgb, var(--brand) 30%, transparent)', transition:'all 0.4s cubic-bezier(0.4,0.8,0.4,1)'}}/>
              ))}
            </div>
          </div>
          <div key={i} className="ticker-msg" style={{color:'var(--ink)', marginTop:4, fontWeight:500, fontSize:14, lineHeight:1.4}}>
            {cur.body}
          </div>
          <div style={{display:'flex', gap:8, marginTop:10}}>
            {cur.chips.map(([label, onClick]) => (
              <span key={label} className="chip" style={{cursor:'pointer'}}
                onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}>{label}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// Where it went — interactive category donut + ranked bars
// ============================================================

/* ===== WhereItWent ===== */
const WhereItWent = ({ cats, onNavigate }) => {
  const [active, setActive] = useState(0);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDrawn(true), 120); return () => clearTimeout(t); }, []);
  const total = cats.reduce((a, c) => a + c.v, 0);
  const max = Math.max(...cats.map(c => c.pct));
  const cur = cats[active];
  const C = 2 * Math.PI * 56;
  // synthetic deltas for visual interest — would come from real data in prod
  // Synthetic deltas — direction + magnitude rendered as a clean chip with
  // an SVG arrow glyph and tabular numerals. Keeps a consistent baseline
  // regardless of 1- vs 2-digit percentages.
  const deltas = [
    { dir: 'up',   value: 4,    color: 'var(--err)'   },
    { dir: 'flat', value: null, color: 'var(--ink-3)' },
    { dir: 'down', value: 8,    color: 'var(--ok)'    },
    { dir: 'up',   value: 12,   color: 'var(--err)'   },
    { dir: 'down', value: 3,    color: 'var(--ok)'    },
  ];
  const dirGlyph = {
    up:   <svg width="7" height="8" viewBox="0 0 8 9" style={{flexShrink:0, display:'block'}}><path d="M4 1 L7.2 7 L0.8 7 Z" fill="currentColor"/></svg>,
    down: <svg width="7" height="8" viewBox="0 0 8 9" style={{flexShrink:0, display:'block'}}><path d="M4 8 L0.8 2 L7.2 2 Z" fill="currentColor"/></svg>,
    flat: <svg width="8" height="8" viewBox="0 0 8 8" style={{flexShrink:0, display:'block'}}><rect x="1" y="3.25" width="6" height="1.5" rx="0.75" fill="currentColor"/></svg>,
  };

  let cumPct = 0;
  return (
    <div className="card fade-up fade-up-4" style={{padding:18, marginBottom:14}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
        <div>
          <div className="h3" style={{lineHeight:1.1}}>Where it went</div>
          <div className="small mono" style={{color:'var(--ink-3)', marginTop:2}}>April · {cats.length} categories · ₹{total.toLocaleString('en-IN')}</div>
        </div>
        <span className="chip" onClick={() => onNavigate('transactions', 'this-month')} style={{cursor:'pointer'}}>This month <Icon name="chevron" size={12}/></span>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:18, marginBottom:14}}>
        {/* donut */}
        <div style={{position:'relative', width:132, height:132, flexShrink:0}}>
          <svg viewBox="0 0 132 132" width="132" height="132" style={{transform:'rotate(-90deg)'}}>
            <circle cx="66" cy="66" r="56" fill="none" stroke="var(--surface-2)" strokeWidth="16"/>
            {cats.map((c, i) => {
              const dash = drawn ? (c.pct / 100) * C : 0;
              const offset = -((cumPct / 100) * C);
              cumPct += c.pct;
              const isActive = i === active;
              return (
                <circle key={i} cx="66" cy="66" r="56" fill="none"
                  stroke={c.c}
                  strokeWidth={isActive ? 20 : 16}
                  strokeDasharray={`${dash} ${C}`}
                  strokeDashoffset={offset}
                  onClick={() => setActive(i)}
                  style={{
                    transition: 'stroke-dasharray 0.9s ease-out, stroke-width 220ms',
                    cursor: 'pointer',
                    opacity: isActive ? 1 : 0.55,
                  }}
                />
              );
            })}
          </svg>
          <div onClick={() => onNavigate('insights')} style={{position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', textAlign:'center', cursor:'pointer'}}>
            <div className="label" style={{fontSize:9, color: cur.c, marginBottom:2}}>{cur.pct === Math.max(...cats.map(x => x.pct)) ? 'TOP' : `#${active + 1}`}</div>
            <div style={{fontSize:16, fontWeight:600, lineHeight:1}}>{cur.n}</div>
            <div className="mono tabular" style={{fontSize:11, color:'var(--ink-3)', marginTop:4}}>{cur.pct}%</div>
            <div className="tabular" style={{fontSize:13, fontWeight:600, marginTop:2}}>₹{cur.v.toLocaleString('en-IN')}</div>
          </div>
        </div>

        {/* ranked bars */}
        <div style={{flex:1, minWidth:0}}>
          {cats.map((c, i) => {
            const isActive = i === active;
            const d = deltas[i] || deltas[0];
            return (
              <div key={c.n} onClick={() => setActive(i)} style={{
                display:'flex', alignItems:'center', gap:8,
                padding:'5px 6px', marginLeft:-6, marginRight:-6,
                borderRadius:6, cursor:'pointer',
                background: isActive ? 'var(--surface-2)' : 'transparent',
                transition: 'background 180ms',
              }}>
                <span style={{width:8, height:8, borderRadius:2, background:c.c, flexShrink:0, opacity: isActive ? 1 : 0.7}}/>
                <span style={{fontSize:12, fontWeight: isActive ? 600 : 500, color: isActive ? 'var(--ink)' : 'var(--ink-2)', width:48, flexShrink:0}}>{c.n}</span>
                <div style={{flex:1, height:5, borderRadius:99, background:'color-mix(in srgb, var(--ink) 6%, transparent)', overflow:'hidden', minWidth:0}}>
                  <div style={{
                    height:'100%', width: drawn ? `${(c.pct / max) * 100}%` : '0%',
                    background: c.c,
                    borderRadius:99,
                    transition: `width 800ms ${i * 80}ms cubic-bezier(0.2, 0.8, 0.2, 1)`,
                  }}/>
                </div>
                <span style={{
                  display:'inline-flex', alignItems:'center', justifyContent:'flex-end',
                  gap:3,
                  color: d.color, fontWeight:600, fontSize:10,
                  minWidth:42, flexShrink:0,
                  whiteSpace:'nowrap',
                  fontVariantNumeric:'tabular-nums',
                  fontFamily:'var(--mono, monospace)',
                  lineHeight:1,
                }}>
                  {dirGlyph[d.dir]}
                  {d.value != null && <span>{d.value}%</span>}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* footer summary */}
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:12, borderTop:'1px solid var(--line)'}}>
        <div className="small mono" style={{color:'var(--ink-3)'}}>Tap a slice or row to focus</div>
        <button onClick={() => onNavigate('insights')} className="btn btn-ghost" style={{padding:'5px 10px', fontSize:11, fontWeight:600, color:'var(--brand)', display:'flex', alignItems:'center', gap:4}}>
          See trends <Icon name="chevron" size={11}/>
        </button>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD
// ============================================================

/* ===== AddProvider ===== */
const AddProvider = ({ onBack, onAdd = () => {} }) => {
  const [picked, setPicked] = useState2(null);
  const [apiKey, setApiKey] = useState2('');
  const [customToken, setCustomToken] = useState2('');
  const [customEmoji, setCustomEmoji] = useState2('🧠');
  const [model, setModel] = useState2('');

  const catalog = [
    { id:'anth',  name:'Anthropic',     desc:'Claude Sonnet / Haiku · best parsing',  ini:'A', bg:'#F5E5D4', models:['Sonnet 4.5','Haiku 4.5','Opus 4'] },
    { id:'oai',   name:'OpenAI',        desc:'GPT-4o / o3-mini · broad capabilities', ini:'O', bg:'#DEEFE2', models:['GPT-4o','GPT-4o mini','o3-mini'] },
    { id:'gem',   name:'Google',        desc:'Gemini · fast & cheap classification',  ini:'G', bg:'#DCE6F4', models:['Gemini 2.5 Flash','Gemini 2.5 Pro'] },
    { id:'mist',  name:'Mistral',       desc:'Open-weight EU models',                 ini:'M', bg:'#EADAF2', models:['Mistral Large','Codestral','Nemo'] },
    { id:'cohere',name:'Cohere',        desc:'Command R+ · embeddings & rerank',      ini:'C', bg:'#F2DAE2', models:['Command R+','Command R'] },
    { id:'oll',   name:'Ollama (local)',desc:'Runs on your device · zero cost',       ini:'L', bg:'#ECECE7', models:['Llama 3.3','Mistral 7B','Qwen 2.5'] },
    { id:'custom',name:'Custom endpoint',desc:'Any OpenAI-compatible URL',            ini:'·', bg:'transparent', models:[] },
  ];
  const cur = catalog.find(c => c.id === picked);
  const keyOk = picked === 'oll' ? true : apiKey.trim().length >= 8;

  return (
    <div className="scroll" data-screen-label="07 Add Provider" style={{background:'var(--bg)'}}>
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', alignItems:'center', gap:12, marginBottom:18}}>
          <button onClick={picked ? () => { setPicked(null); setApiKey(''); setCustomToken(''); setModel(''); } : onBack} aria-label="Back" className="btn btn-ghost" style={{padding:0, width:36, height:36, borderRadius:'50%', display:'grid', placeItems:'center', cursor:'pointer'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div style={{flex:1, minWidth:0}}>
            <div className="h2" style={{lineHeight:1.1}}>{picked ? cur.name : 'Add provider'}</div>
            <div className="small mono" style={{color:'var(--ink-3)', marginTop:2}}>
              {picked ? `Step 2 of 2 · ${cur.desc}` : `Step 1 of 2 · Pick a model provider`}
            </div>
          </div>
          {picked && (
            <button onClick={() => { if (keyOk) onAdd({ vendor: cur.name, model: model || cur.models[0] || 'default' }); }} disabled={!keyOk} className="btn btn-primary" style={{padding:'8px 14px', fontSize:13, cursor: keyOk ? 'pointer' : 'not-allowed', opacity: keyOk ? 1 : 0.5}}>Add</button>
          )}
        </div>

        {!picked && (
          <>
            <div className="label" style={{margin:'4px 4px 8px'}}>Cloud providers</div>
            <div className="card fade-up fade-up-2" style={{padding:0, marginBottom:14, overflow:'hidden'}}>
              {catalog.filter(c => !['oll','custom'].includes(c.id)).map((c, i, a) => (
                <div key={c.id} onClick={() => setPicked(c.id)} style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
                  <div style={{width:38, height:38, borderRadius:10, background:c.bg, color:'var(--ink)', display:'grid', placeItems:'center', fontWeight:700, fontSize:15, flexShrink:0}}>{c.ini}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14, fontWeight:600}}>{c.name}</div>
                    <div className="small mono" style={{color:'var(--ink-3)', marginTop:1}}>{c.desc}</div>
                  </div>
                  <Icon name="chevron" size={14} style={{color:'var(--ink-4)'}}/>
                </div>
              ))}
            </div>

            <div className="label" style={{margin:'4px 4px 8px'}}>On-device & custom</div>
            <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:30, overflow:'hidden'}}>
              {catalog.filter(c => ['oll','custom'].includes(c.id)).map((c, i, a) => (
                <div key={c.id} onClick={() => setPicked(c.id)} style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
                  <div style={{width:38, height:38, borderRadius:10, background:c.bg, color:'var(--ink)', display:'grid', placeItems:'center', fontWeight:700, fontSize:15, flexShrink:0, border: c.id==='custom' ? '1px dashed var(--line-strong)' : 'none'}}>{c.ini}</div>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14, fontWeight:600}}>{c.name}</div>
                    <div className="small mono" style={{color:'var(--ink-3)', marginTop:1}}>{c.desc}</div>
                  </div>
                  <Icon name="chevron" size={14} style={{color:'var(--ink-4)'}}/>
                </div>
              ))}
            </div>
          </>
        )}

        {picked && (
          <>
            <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:14, display:'flex', alignItems:'center', gap:14}}>
              <div style={{width:48, height:48, borderRadius:12, background:cur.bg, color:'var(--ink)', display:'grid', placeItems:'center', fontWeight:700, fontSize: picked === 'custom' ? 22 : 18, flexShrink:0, border: picked==='custom' ? '1px dashed var(--line-strong)' : 'none'}}>{picked === 'custom' ? customEmoji : cur.ini}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:15, fontWeight:600}}>{cur.name}</div>
                <div className="small mono" style={{color:'var(--ink-3)', marginTop:2}}>{cur.desc}</div>
              </div>
            </div>

            {picked === 'custom' && (
              <>
                <div className="label" style={{margin:'14px 4px 8px'}}>Icon</div>
                <div className="card fade-up fade-up-3" style={{padding:'12px 14px', marginBottom:14}}>
                  <div style={{display:'flex', alignItems:'center', gap:14}}>
                    <div style={{width:48, height:48, borderRadius:12, background:'var(--surface-2)', display:'grid', placeItems:'center', fontSize:24, flexShrink:0, border:'1px dashed var(--line-strong)'}}>{customEmoji}</div>
                    <div style={{flex:1, display:'flex', flexWrap:'wrap', gap:6}}>
                      {['🧠','🤖','✨','⚡','🛰','🦙','🌐','🔮','🎯','🪄'].map(e => (
                        <button key={e} onClick={() => setCustomEmoji(e)} aria-label={`Pick ${e}`} style={{
                          width:32, height:32, fontSize:18, padding:0, lineHeight:1,
                          borderRadius:8, cursor:'pointer',
                          background: customEmoji === e ? 'var(--brand-soft)' : 'var(--surface-2)',
                          border: customEmoji === e ? '1px solid var(--brand)' : '1px solid var(--line)',
                          display:'grid', placeItems:'center',
                        }}>{e}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}

            {picked !== 'oll' && (
              <>
                <div className="label" style={{margin:'14px 4px 8px'}}>{picked === 'custom' ? 'Endpoint URL' : 'API key'}</div>
                <div className="card fade-up fade-up-3" style={{padding:'12px 14px', marginBottom: picked === 'custom' ? 10 : 14}}>
                  <input value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder={picked === 'custom' ? 'https://api.example.com/v1' : 'sk-…'} className="mono" style={{border:'none', background:'transparent', width:'100%', fontFamily:'var(--font-mono)', fontSize:13, outline:'none', color:'var(--ink)'}}/>
                </div>
                {picked === 'custom' && (
                  <>
                    <div className="label" style={{margin:'10px 4px 8px'}}>API token</div>
                    <div className="card fade-up fade-up-3" style={{padding:'12px 14px', marginBottom:14}}>
                      <input value={customToken} onChange={e => setCustomToken(e.target.value)} placeholder="Bearer token · optional for public endpoints" className="mono" style={{border:'none', background:'transparent', width:'100%', fontFamily:'var(--font-mono)', fontSize:13, outline:'none', color:'var(--ink)'}}/>
                    </div>
                  </>
                )}
                <div className="small mono" style={{color:'var(--ink-3)', padding:'0 4px', marginBottom:14, display:'flex', alignItems:'center', gap:6}}>
                  <Icon name="lock" size={11}/>
                  Stored on-device · never sent to Gexpense servers
                </div>
              </>
            )}

            {cur.models.length > 0 && (
              <>
                <div className="label" style={{margin:'14px 4px 8px'}}>Default model</div>
                <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14, overflow:'hidden'}}>
                  {cur.models.map((m, i, a) => (
                    <div key={m} onClick={() => setModel(m)} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer', background: (model || cur.models[0]) === m ? 'var(--brand-soft)' : 'transparent'}}>
                      <div className="mono" style={{fontSize:13, fontWeight: (model || cur.models[0]) === m ? 600 : 500}}>{m}</div>
                      {(model || cur.models[0]) === m && <Icon name="check" size={14} style={{color:'var(--brand)'}}/>}
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="label" style={{margin:'14px 4px 8px'}}>Capabilities</div>
            <div className="card fade-up fade-up-5" style={{padding:14, marginBottom:30}}>
              {[
                ['Parse receipts',  'Extract merchant, amount, date'],
                ['Classify spend',  'Auto-categorize transactions'],
                ['Detect duplicates','Match across SMS + email'],
                ['Generate insights','Weekly trend summaries'],
              ].map((c, i, a) => (
                <div key={c[0]} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i<a.length-1 ? '1px solid var(--line)' : 'none'}}>
                  <div>
                    <div style={{fontSize:13, fontWeight:600}}>{c[0]}</div>
                    <div className="small mono" style={{color:'var(--ink-3)', marginTop:1}}>{c[1]}</div>
                  </div>
                  <Toggle on={true}/>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

/* ===== SmartInsight ===== */
const SmartInsight = ({ kind = 'subs', onBack, onAction = () => {} }) => {
  const d = SI_DATA[kind] || SI_DATA.subs;
  const max = Math.max(...d.trend.map(v => Math.abs(v))) * 1.15;
  const w = 320, h = 70, padX = 4, padY = 8;
  const step = (w - padX*2) / (d.trend.length - 1);
  const pts = d.trend.map((v, i) => [padX + i * step, h - padY - (Math.abs(v)/max)*(h - padY*2)]);
  const linePath = 'M' + pts.map(p => p.map(n=>n.toFixed(1)).join(',')).join(' L');
  const areaPath = linePath + ` L${pts[pts.length-1][0].toFixed(1)},${h-padY} L${pts[0][0].toFixed(1)},${h-padY} Z`;
  const lastPt = pts[pts.length-1];

  const otherKinds = Object.keys(SI_DATA).filter(k => k !== kind);

  return (
    <div className="scroll" data-screen-label={`Smart insight · ${d.eyebrow}`} style={{background:'var(--bg)'}}>
      <div style={{padding:'8px 18px 0'}}>
        {/* header */}
        <div className="fade-up fade-up-1" style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
          <button onClick={onBack} aria-label="Back" className="btn btn-ghost" style={{padding:0, width:36, height:36, borderRadius:'50%', display:'grid', placeItems:'center', cursor:'pointer'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div style={{flex:1, minWidth:0}}>
            <div className="small mono" style={{color:'var(--ink-3)', letterSpacing:'0.06em', textTransform:'uppercase'}}>Smart insight</div>
            <div style={{fontSize:15, fontWeight:600, marginTop:1}}>{d.eyebrow}</div>
          </div>
          <button aria-label="Share" className="btn btn-ghost" style={{padding:0, width:36, height:36, borderRadius:'50%', display:'grid', placeItems:'center'}}>
            <Icon name="external" size={15}/>
          </button>
        </div>

        {/* hero */}
        <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:12, background: d.bg, border:`1px solid color-mix(in srgb, ${d.accent} 22%, transparent)`}}>
          <div style={{display:'flex', alignItems:'center', gap:6, marginBottom:8}}>
            <span style={{display:'inline-flex', alignItems:'center', gap:4, padding:'3px 9px', borderRadius:99, background:'color-mix(in srgb, var(--surface) 70%, transparent)', border:'1px solid color-mix(in srgb, var(--ink) 8%, transparent)', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:600, color: d.accent, letterSpacing:'0.04em', textTransform:'uppercase'}}>
              <Icon name="sparkle" size={10}/>
              {d.confidence} confidence
            </span>
            <span className="small mono" style={{color:'var(--ink-3)'}}>· generated 2m ago</span>
          </div>
          <div style={{fontSize:22, fontWeight:600, lineHeight:1.22, letterSpacing:'-0.01em'}}>{d.title}</div>
          <div className="small" style={{color:'var(--ink-2)', marginTop:4, marginBottom:14}}>{d.subtitle}</div>

          {/* sparkline */}
          <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:'block'}}>
            <defs>
              <linearGradient id={`si-grad-${kind}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={d.accent} stopOpacity="0.32"/>
                <stop offset="100%" stopColor={d.accent} stopOpacity="0"/>
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#si-grad-${kind})`} style={{opacity:0, animation:'mrFadeIn 600ms 200ms forwards'}}/>
            <path d={linePath} fill="none" stroke={d.accent} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
              style={{strokeDasharray:600, strokeDashoffset:600, animation:'mrDraw 700ms 100ms forwards'}}/>
            {lastPt && <circle cx={lastPt[0]} cy={lastPt[1]} r="3.5" fill={d.accent} style={{opacity:0, animation:'mrFadeIn 300ms 700ms forwards'}}/>}
          </svg>
          <div style={{display:'flex', justifyContent:'space-between', marginTop:6, fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--ink-4)'}}>
            {d.trendLabels.map((l, i) => <span key={i}>{l}</span>)}
          </div>
          <div style={{marginTop:8, display:'flex', alignItems:'center', gap:8}}>
            <span style={{padding:'2px 8px', borderRadius:99, background:`color-mix(in srgb, ${d.deltaColor} 14%, transparent)`, color: d.deltaColor, fontFamily:'var(--font-mono)', fontSize:11, fontWeight:600}}>{d.delta}</span>
          </div>
        </div>

        {/* reasoning */}
        <div className="card fade-up fade-up-3" style={{padding:16, marginBottom:12}}>
          <div className="label" style={{fontSize:10, marginBottom:10}}>How we got this</div>
          <ol style={{margin:0, padding:0, listStyle:'none'}}>
            {d.reasoning.map((r, i) => (
              <li key={i} style={{display:'flex', gap:10, marginBottom: i < d.reasoning.length - 1 ? 10 : 0}}>
                <span style={{flexShrink:0, width:18, height:18, borderRadius:99, background:'var(--surface-2)', color:'var(--ink-2)', fontFamily:'var(--font-mono)', fontSize:10, fontWeight:600, display:'grid', placeItems:'center', marginTop:1}}>{i+1}</span>
                <span style={{fontSize:13, lineHeight:1.5, color:'var(--ink-2)'}}>{r}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* actions */}
        <div className="card fade-up fade-up-4" style={{padding:14, marginBottom:12, display:'flex', flexDirection:'column', gap:8}}>
          <div className="label" style={{fontSize:10, marginBottom:2}}>What you can do</div>
          {d.actions.map((a, i) => {
            const isPrimary = a.kind === 'primary';
            return (
              <button
                key={a.label}
                onClick={() => onAction(a, d)}
                className={isPrimary ? 'btn btn-primary' : 'btn btn-ghost'}
                style={{
                  padding:'12px 14px',
                  display:'flex', alignItems:'center', gap:10, justifyContent:'space-between',
                  fontWeight:600, fontSize:13,
                  background: isPrimary ? d.accent : 'var(--surface-2)',
                  color: isPrimary ? '#fff' : 'var(--ink)',
                  border: isPrimary ? 'none' : '1px solid var(--line)',
                  cursor:'pointer',
                }}
              >
                <span style={{display:'flex', alignItems:'center', gap:10}}>
                  {a.icon && <Icon name={a.icon} size={14}/>}
                  {a.label}
                </span>
                <Icon name="chevron" size={13} style={{opacity:0.6}}/>
              </button>
            );
          })}
        </div>

        {/* sources */}
        <div className="card fade-up fade-up-5" style={{padding:0, marginBottom:12, overflow:'hidden'}}>
          <div className="label" style={{fontSize:10, padding:'14px 16px 6px'}}>{d.sourcesLabel}</div>
          {d.sources.map((s, i, a) => {
            const isDelta = s.kind === 'delta';
            const amtColor = isDelta ? (s.amt < 0 ? 'var(--ok)' : 'var(--warn)') : 'var(--ink)';
            const amtPrefix = isDelta ? (s.amt < 0 ? '−' : '+') : '';
            return (
              <div key={s.name} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--line)', cursor:'pointer'}}>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:6}}>
                    <div style={{fontSize:13.5, fontWeight:600}}>{s.name}</div>
                    {s.badge && <Badge tone={s.badge === 'unused' ? 'err' : 'warn'}>{s.badge}</Badge>}
                  </div>
                  <div className="small mono" style={{color:'var(--ink-3)', marginTop:2}}>{s.sub}</div>
                </div>
                <div className="tabular" style={{fontSize:13.5, fontWeight:600, color: amtColor}}>{amtPrefix}₹{Math.abs(s.amt).toLocaleString('en-IN')}</div>
                <Icon name="chevron" size={13} style={{color:'var(--ink-4)'}}/>
              </div>
            );
          })}
        </div>

        {/* related */}
        <div className="label" style={{fontSize:10, padding:'6px 4px 8px'}}>Related insights</div>
        <div className="fade-up fade-up-6" style={{display:'flex', gap:10, overflowX:'auto', marginBottom:18, paddingBottom:6, scrollbarWidth:'none'}}>
          {otherKinds.map(k => {
            const r = SI_DATA[k];
            return (
              <div key={k} onClick={() => window.__openInsight && window.__openInsight(k)} style={{minWidth:220, padding:14, borderRadius:12, background: r.bg, border:`1px solid color-mix(in srgb, ${r.accent} 22%, transparent)`, cursor:'pointer'}}>
                <div className="label" style={{fontSize:10, color: r.accent, marginBottom:6}}>{r.eyebrow}</div>
                <div style={{fontSize:13, fontWeight:600, lineHeight:1.35}}>{r.title}</div>
              </div>
            );
          })}
        </div>

        {/* footer controls */}
        <div className="fade-up fade-up-7" style={{display:'flex', justifyContent:'space-between', gap:8, padding:'10px 4px 30px', flexWrap:'wrap'}}>
          <button onClick={() => onAction({kind:'feedback', value:'unhelpful'}, d)} className="btn btn-ghost" style={{padding:'8px 12px', fontSize:11.5, fontWeight:600, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:6}}>
            <Icon name="x" size={11}/> Not useful
          </button>
          <button onClick={() => onAction({kind:'mute'}, d)} className="btn btn-ghost" style={{padding:'8px 12px', fontSize:11.5, fontWeight:600, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:6}}>
            <Icon name="bell" size={11}/> Mute {d.eyebrow.toLowerCase()} insights
          </button>
          <button onClick={() => onAction({kind:'why'}, d)} className="btn btn-ghost" style={{padding:'8px 12px', fontSize:11.5, fontWeight:600, color:'var(--ink-3)', display:'flex', alignItems:'center', gap:6}}>
            <Icon name="sparkle" size={11}/> Why am I seeing this?
          </button>
        </div>
      </div>
    </div>
  );
};

/* ===== ProfileEdit ===== */
const ProfileEdit = ({ onBack, onSave }) => {
  const [name, setName] = React.useState('Aman Sharma');
  const [email, setEmail] = React.useState('aman@gmail.com');
  const [phone, setPhone] = React.useState('+91 98••• ••432');
  const [currency, setCurrency] = React.useState('INR');
  const [country, setCountry] = React.useState('India');
  const [plan] = React.useState('Free');
  const Field = ({ label, value, onChange, mono, placeholder, readOnly }) => (
    <label style={{display:'block', padding:'12px 14px'}}>
      <div className="label" style={{fontSize:10, marginBottom:4}}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange && onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={mono ? 'mono' : ''}
        style={{width:'100%', border:'none', outline:'none', background:'transparent', fontSize:14, fontWeight:500, color:'var(--ink)', padding:0}}
      />
    </label>
  );
  return (
    <div className="scroll" data-screen-label="13 Profile Edit" style={{background:'var(--bg)'}}>
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:18}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:'8px 12px', display:'flex', alignItems:'center', gap:6}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/> Settings
          </button>
          <button onClick={onSave} className="btn btn-primary" style={{padding:'8px 14px', fontSize:12, fontWeight:600}}>Save</button>
        </div>
        <div className="fade-up fade-up-2" style={{marginBottom:18}}>
          <div className="h2">Profile</div>
          <div className="small" style={{marginTop:4}}>Your account info & preferences</div>
        </div>

        {/* Avatar */}
        <div className="card fade-up fade-up-3" style={{padding:18, marginBottom:14, display:'flex', alignItems:'center', gap:14}}>
          <div style={{position:'relative'}}>
            <div style={{width:72, height:72, borderRadius:'50%', background:'var(--brand-50)', color:'var(--brand)', display:'grid', placeItems:'center', fontSize:28, fontWeight:600}}>A</div>
            <button style={{position:'absolute', bottom:-2, right:-2, width:26, height:26, borderRadius:'50%', background:'var(--ink)', color:'var(--bg)', border:'2px solid var(--bg)', display:'grid', placeItems:'center', cursor:'pointer'}}>
              <Icon name="edit" size={11} stroke={2.4}/>
            </button>
          </div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:600, fontSize:14}}>{name}</div>
            <div className="small mono" style={{marginTop:2}}>{email}</div>
            <div style={{marginTop:6, display:'inline-flex', alignItems:'center', gap:6, padding:'3px 8px', borderRadius:99, background:'var(--surface-2)', fontSize:10, fontWeight:600, color:'var(--ink-2)'}}>
              <Icon name="shield" size={10}/> {plan} plan
            </div>
          </div>
        </div>

        <div className="label" style={{margin:'14px 4px 8px'}}>Identity</div>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <Field label="Name" value={name} onChange={setName}/>
          <Divider/>
          <Field label="Email" value={email} onChange={setEmail} mono/>
          <Divider/>
          <Field label="Phone" value={phone} onChange={setPhone} mono/>
        </div>

        <div className="label" style={{margin:'14px 4px 8px'}}>Region</div>
        <div className="card fade-up fade-up-5" style={{padding:0, marginBottom:14}}>
          <div style={{padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
              <div className="label" style={{fontSize:10, marginBottom:4}}>Currency</div>
              <div style={{fontSize:14, fontWeight:500}}>{currency} · ₹ Indian Rupee</div>
            </div>
            <Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>
          </div>
          <Divider/>
          <div style={{padding:'12px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
              <div className="label" style={{fontSize:10, marginBottom:4}}>Country</div>
              <div style={{fontSize:14, fontWeight:500}}>{country}</div>
            </div>
            <Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>
          </div>
        </div>

        <div className="label" style={{margin:'14px 4px 8px'}}>Plan</div>
        <div className="card fade-up fade-up-6" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div>
              <div style={{fontWeight:600, fontSize:14}}>Free</div>
              <div className="small" style={{marginTop:2}}>3 connections · 6 mo history</div>
            </div>
            <button className="btn btn-primary" style={{padding:'8px 14px', fontSize:12, fontWeight:600}}>Upgrade</button>
          </div>
          <div style={{padding:10, background:'var(--surface-2)', borderRadius:8, fontSize:11, color:'var(--ink-2)', display:'flex', gap:8, alignItems:'flex-start'}}>
            <Icon name="sparkle" size={12} style={{marginTop:1, color:'var(--brand)', flexShrink:0}}/>
            <div>Pro: unlimited bank links, 5-yr history, exports, custom AI rules · ₹199/mo</div>
          </div>
        </div>

        <div className="card fade-up fade-up-7" style={{padding:0, marginBottom:20}}>
          <div style={{padding:'14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer'}}>
            <Icon name="logout" size={16} style={{color:'var(--err)'}}/>
            <div style={{color:'var(--err)', fontWeight:600, fontSize:13}}>Sign out</div>
          </div>
        </div>
      </div>
    </div>
  );
};
window.ProfileEdit = ProfileEdit;

/* ===== CounterUp ===== */
const CounterUp = ({ value, format = (n) => n.toLocaleString('en-IN'), prefix = '', suffix = '', dur = 900, className = '', style = {} }) => {
  const [n, setN] = useStateV3(0);
  const ref = useRefV3({ start: 0, target: value, t0: 0 });
  useEffectV3(() => {
    ref.current = { start: 0, target: value, t0: performance.now() };
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - ref.current.t0) / dur);
      const e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setN(Math.round(ref.current.target * e));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`tabular ${className}`} style={style}>{prefix}{format(n)}{suffix}</span>;
};

// ============================================================
// Skeleton — used in dashboard load
// ============================================================

/* ===== Skeleton ===== */
const Skeleton = ({ w = '100%', h = 16, r = 8, style = {} }) => (
  <div className="sk" style={{ width: w, height: h, borderRadius: r, ...style }}/>
);

// ============================================================
// QuickActions — long-press FAB menu
// ============================================================

/* ===== QuickActions ===== */
const QuickActions = ({ onClose, onPick }) => {
  const items = [
    { k: 'scan',      ico: 'receipt', label: 'Scan receipt' },
    { k: 'recurring', ico: 'repeat',  label: 'Add recurring' },
    { k: 'split',     ico: 'split',   label: 'Split with friends' },
    { k: 'manual',    ico: 'edit',    label: 'Quick manual entry' },
  ];
  return (
    <React.Fragment>
      <div className="qa-scrim" onClick={onClose}/>
      <div className="qa-menu">
        {items.map(it => (
          <div key={it.k} className="qa-item" onClick={(e) => { e.stopPropagation(); onPick(it.k); }}>
            <div className="ico"><Icon name={it.ico} size={16}/></div>
            <span>{it.label}</span>
          </div>
        ))}
      </div>
    </React.Fragment>
  );
};

// ============================================================
// ReceiptCapture — camera viewfinder mock with auto-extract
// ============================================================

/* ===== ReceiptCapture ===== */
const ReceiptCapture = ({ onBack, onSave }) => {
  const [phase, setPhase] = useStateV3('aim');      // aim | scanning | done
  const [fields, setFields] = useStateV3(null);
  useEffectV3(() => {
    if (phase === 'scanning') {
      const t = setTimeout(() => {
        setFields({ merchant: 'Blue Tokai · Indiranagar', amount: 540, date: 'Today · 9:42 PM', items: ['Cappuccino', 'Almond croissant'], category: 'Food & coffee', confidence: 0.96 });
        setPhase('done');
      }, 1850);
      return () => clearTimeout(t);
    }
  }, [phase]);

  return (
    <div className="scroll" data-screen-label="13 Receipt Capture" style={{background:'#0b0b0e', color:'#fff'}}>
      <div style={{position:'relative', minHeight:'100%', display:'flex', flexDirection:'column'}}>
        {/* viewfinder */}
        <div style={{flex:1, position:'relative', overflow:'hidden', minHeight: 460}}>
          {/* faux receipt */}
          <div style={{position:'absolute', inset:0, display:'grid', placeItems:'center'}}>
            <div style={{width:'72%', height:'82%', background:'linear-gradient(180deg, #f3efe6 0%, #ecdfc8 100%)', borderRadius:6, transform: phase === 'aim' ? 'rotate(-2deg) scale(0.92)' : 'rotate(0deg) scale(1)', transition:'transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1)', boxShadow:'0 12px 40px rgba(0,0,0,0.5)', color:'#3a2f1a', padding:'18px 16px', fontFamily:'var(--mono)', fontSize:9, lineHeight:1.6}}>
              <div style={{textAlign:'center', fontWeight:700, fontSize:12, marginBottom:8}}>BLUE TOKAI · INDIRANAGAR</div>
              <div style={{textAlign:'center', marginBottom:10}}>━━━━━━━━━━━━━━━━━━━</div>
              <div style={{display:'flex', justifyContent:'space-between'}}><span>Cappuccino</span><span>320</span></div>
              <div style={{display:'flex', justifyContent:'space-between'}}><span>Almond croissant</span><span>220</span></div>
              <div style={{textAlign:'center', margin:'8px 0'}}>━━━━━━━━━━━━━━━━━━━</div>
              <div style={{display:'flex', justifyContent:'space-between', fontWeight:700}}><span>TOTAL</span><span>₹540</span></div>
              <div style={{textAlign:'center', marginTop:12, fontSize:8}}>27 APR 2026 · 9:42 PM</div>
            </div>
          </div>

          {/* corner brackets */}
          {phase !== 'done' && (() => {
            const positions = {
              tl: { top: '18%', left: '14%' },
              tr: { top: '18%', right: '14%' },
              bl: { bottom: '14%', left: '14%' },
              br: { bottom: '14%', right: '14%' },
            };
            const corners = {
              tl: { borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8 },
              tr: { borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8 },
              bl: { borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 8 },
              br: { borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 8 },
            };
            return ['tl','tr','bl','br'].map(k => (
              <div key={k} style={{position:'absolute', width:36, height:36, borderColor: phase === 'scanning' ? 'var(--brand)' : '#fff', borderStyle:'solid', borderWidth: 0, transition:'border-color 200ms', ...corners[k], ...positions[k]}}/>
            ));
          })()}

          {/* scanline */}
          {phase === 'scanning' && (
            <div style={{position:'absolute', top:'18%', bottom:'14%', left:'18%', right:'18%', overflow:'hidden', pointerEvents:'none'}}>
              <div style={{position:'absolute', left:0, right:0, height:2, background:'linear-gradient(90deg, transparent, var(--brand), transparent)', boxShadow:'0 0 16px var(--brand)', animation:'scanLine 1.7s ease-in-out'}}/>
            </div>
          )}

          {/* top bar */}
          <div style={{position:'absolute', top:14, left:0, right:0, padding:'0 18px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <button onClick={onBack} style={{width:36, height:36, borderRadius:'50%', background:'rgba(0,0,0,0.45)', color:'#fff', border:'none', cursor:'pointer', display:'grid', placeItems:'center'}}>
              <Icon name="x" size={16}/>
            </button>
            <div style={{padding:'6px 12px', borderRadius:99, background:'rgba(0,0,0,0.45)', fontSize:11, fontFamily:'var(--mono)'}}>
              {phase === 'aim' ? 'AIM AT RECEIPT' : phase === 'scanning' ? 'SCANNING…' : 'DONE'}
            </div>
            <button style={{width:36, height:36, borderRadius:'50%', background:'rgba(0,0,0,0.45)', color:'#fff', border:'none', cursor:'pointer', display:'grid', placeItems:'center'}}>
              <Icon name="zap" size={16}/>
            </button>
          </div>
        </div>

        {/* bottom sheet */}
        {phase !== 'done' && (
          <div style={{padding:'22px 22px 32px', background:'#0b0b0e'}}>
            <div style={{textAlign:'center', color:'rgba(255,255,255,0.72)', fontSize:13, marginBottom:18}}>
              {phase === 'aim' ? 'Position receipt inside the frame' : 'Reading merchant, amount, items…'}
            </div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:36}}>
              <button style={{color:'#fff', background:'transparent', border:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:4, fontSize:11, opacity:0.7, cursor:'pointer'}}>
                <Icon name="download" size={20}/>
                Library
              </button>
              <button onClick={() => phase === 'aim' && setPhase('scanning')} style={{width:72, height:72, borderRadius:'50%', background:'#fff', border:'4px solid rgba(255,255,255,0.4)', cursor: phase === 'aim' ? 'pointer' : 'default'}}>
                {phase === 'scanning' && <span style={{display:'inline-block', width:20, height:20, border:'3px solid var(--brand)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite'}}/>}
              </button>
              <button style={{color:'#fff', background:'transparent', border:'none', display:'flex', flexDirection:'column', alignItems:'center', gap:4, fontSize:11, opacity:0.7, cursor:'pointer'}}>
                <Icon name="edit" size={20}/>
                Manual
              </button>
            </div>
          </div>
        )}

        {/* extracted card overlay */}
        {phase === 'done' && fields && (
          <div style={{padding:'22px 22px 28px', background:'var(--surface)', color:'var(--ink)', borderTopLeftRadius:24, borderTopRightRadius:24, marginTop:-24, position:'relative', zIndex:2, animation:'fadeUp 280ms ease-out'}}>
            <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:14}}>
              <span style={{width:24, height:24, borderRadius:'50%', background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center'}}><Icon name="check" size={12} stroke={3}/></span>
              <div style={{fontWeight:600, fontSize:14}}>Extracted</div>
              <span style={{marginLeft:'auto', fontFamily:'var(--mono)', fontSize:10, color:'var(--ink-3)'}}>{Math.round(fields.confidence*100)}% confidence</span>
            </div>
            <div className="card" style={{padding:0, marginBottom:14, background:'var(--surface-2)'}}>
              {[
                ['Merchant', fields.merchant],
                ['Amount', `₹${fields.amount}`],
                ['Date', fields.date],
                ['Category', fields.category],
                ['Items', fields.items.join(' · ')],
              ].map(([k, v], i, a) => (
                <div key={k} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 14px', borderBottom: i < a.length-1 ? '1px solid var(--line)' : 'none', gap:12}}>
                  <span className="small" style={{flexShrink:0}}>{k}</span>
                  <span style={{fontWeight:600, fontSize:13, textAlign:'right'}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{display:'flex', gap:10}}>
              <button onClick={() => setPhase('aim')} className="btn btn-ghost" style={{flex:1, padding:13, fontWeight:600}}>Retake</button>
              <button onClick={() => onSave(fields)} className="btn btn-primary" style={{flex:2, padding:13, fontWeight:600}}>Save expense</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// MonthlyReview — stories-style recap with rich per-slide data
// ============================================================

// ---- mini chart primitives (used inside slides) ----

/* ===== MRSparkline ===== */
const MRSparkline = ({ data, highlight, max, w = 320, h = 56 }) => {
  const m = max || Math.max(...data) * 1.1;
  const bw = (w - 4) / data.length;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:'block'}}>
      {data.map((v, i) => {
        const bh = (v / m) * (h - 6);
        const x = 2 + i * bw;
        const y = h - bh - 2;
        const active = i === highlight;
        return (
          <g key={i}>
            <rect x={x + bw*0.18} y={y} width={bw * 0.64} height={bh}
              fill={active ? 'var(--ink)' : 'color-mix(in srgb, var(--ink) 18%, transparent)'}
              rx={2}/>
            {active && (
              <circle cx={x + bw*0.5} cy={y - 5} r={2.4} fill="var(--ink)"/>
            )}
          </g>
        );
      })}
    </svg>
  );
};

/* ===== MRBarRow ===== */
const MRBarRow = ({ label, sub, value, pct, color = 'var(--ink)', delay = 0 }) => (
  <div style={{marginBottom: 12, animation:`fadeUp 540ms ${delay}ms both`}}>
    <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:5}}>
      <div style={{display:'flex', alignItems:'baseline', gap:8, minWidth:0}}>
        <span style={{fontSize:13.5, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{label}</span>
        {sub && <span className="small mono" style={{color:'var(--ink-3)', flexShrink:0}}>{sub}</span>}
      </div>
      <span className="tabular" style={{fontSize:13.5, fontWeight:600}}>{value}</span>
    </div>
    <div style={{height:6, background:'color-mix(in srgb, var(--ink) 8%, transparent)', borderRadius:99, overflow:'hidden'}}>
      <div style={{height:'100%', width: `${pct}%`, background: color, borderRadius:99, animation:`barGrow 800ms ${delay + 120}ms cubic-bezier(0.2, 0.8, 0.2, 1) both`}}/>
    </div>
  </div>
);

/* ===== MRStatCell ===== */
const MRStatCell = ({ label, value, color, delay = 0 }) => (
  <div style={{flex:1, animation:`fadeUp 540ms ${delay}ms both`}}>
    <div style={{fontFamily:'var(--font-mono)', fontSize:10, letterSpacing:'0.06em', color:'var(--ink-3)', textTransform:'uppercase'}}>{label}</div>
    <div className="tabular" style={{fontSize:17, fontWeight:600, marginTop:3, color: color || 'var(--ink)'}}>{value}</div>
  </div>
);

/* ===== MRTrajectory ===== */
const MRTrajectory = ({ actual, projected }) => {
  const all = [...actual, ...projected];
  const max = Math.max(...all) * 1.1;
  const w = 320, h = 100, padX = 6, padY = 8;
  const step = (w - padX*2) / (all.length - 1);
  const pts = all.map((v, i) => [padX + i * step, h - padY - (v/max)*(h-padY*2)]);
  const actualPath = 'M' + pts.slice(0, actual.length).map(p => p.map(n=>n.toFixed(1)).join(',')).join(' L');
  const projPath = 'M' + pts.slice(actual.length - 1).map(p => p.map(n=>n.toFixed(1)).join(',')).join(' L');
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{display:'block'}}>
      <path d={actualPath} fill="none" stroke="var(--ink)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        style={{strokeDasharray: 800, strokeDashoffset: 800, animation:'mrDraw 900ms 100ms forwards'}}/>
      <path d={projPath} fill="none" stroke="var(--brand)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 4"
        style={{opacity:0, animation:'mrFadeIn 600ms 900ms forwards'}}/>
      {pts[actual.length - 1] && (
        <circle cx={pts[actual.length-1][0]} cy={pts[actual.length-1][1]} r="4" fill="var(--ink)"
          style={{opacity:0, animation:'mrFadeIn 400ms 800ms forwards'}}/>
      )}
    </svg>
  );
};

/* ===== MonthlyReview ===== */
const MonthlyReview = ({ onBack }) => {
  // ---- slide content components ----
  const SlideSpend = () => (
    <>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-3)', marginBottom:10}}>APRIL 2026</div>
      <div style={{fontSize:28, fontWeight:600, lineHeight:1.15, letterSpacing:'-0.02em', marginBottom:6}}>
        You spent <CounterUp value={54180} prefix="₹"/>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:22}}>
        <span style={{padding:'4px 10px', borderRadius:99, background:'color-mix(in srgb, var(--ok) 16%, transparent)', color:'var(--ok)', fontSize:12, fontWeight:600, fontFamily:'var(--font-mono)'}}>↓ 12% vs Mar</span>
        <span className="small" style={{color:'var(--ink-2)'}}>₹7,420 less than last month</span>
      </div>

      <div style={{marginBottom:6}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
          <span className="label" style={{fontSize:10}}>12-month trend</span>
          <span className="small mono" style={{color:'var(--ink-3)'}}>Apr highlighted</span>
        </div>
        <MRSparkline data={[42800, 51200, 47900, 58300, 49600, 55100, 52800, 48400, 56700, 53200, 61600, 54180]} highlight={11}/>
        <div style={{display:'flex', justifyContent:'space-between', marginTop:4, fontFamily:'var(--font-mono)', fontSize:9.5, color:'var(--ink-4)', letterSpacing:'0.04em'}}>
          <span>MAY '25</span><span>SEP</span><span>JAN '26</span><span>APR</span>
        </div>
      </div>

      <div style={{display:'flex', gap:14, marginTop:22, paddingTop:18, borderTop:'1px solid var(--line)'}}>
        <MRStatCell label="Avg / day" value="₹1,806" delay={80}/>
        <MRStatCell label="Budget left" value="₹5,820" color="var(--ok)" delay={160}/>
        <MRStatCell label="Savings rate" value="65%" color="var(--brand)" delay={240}/>
      </div>
    </>
  );

  const SlideCategory = () => (
    <>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-3)', marginBottom:10}}>TOP CATEGORY</div>
      <div style={{fontSize:28, fontWeight:600, lineHeight:1.15, letterSpacing:'-0.02em', marginBottom:6}}>
        Food took <CounterUp value={13500} prefix="₹"/>
      </div>
      <div className="small" style={{color:'var(--ink-2)', marginBottom:22}}>25% of all spending · 14 Swiggy orders, 8 cafés</div>

      <div className="label" style={{fontSize:10, marginBottom:10}}>Where food money went</div>
      <MRBarRow label="Swiggy" sub="14 orders" value="₹5,400" pct={100} color="#E07A5F" delay={60}/>
      <MRBarRow label="BigBasket" sub="grocery" value="₹3,900" pct={72} color="#E07A5F" delay={140}/>
      <MRBarRow label="Toit" sub="3 visits" value="₹2,100" pct={39} color="#E07A5F" delay={220}/>
      <MRBarRow label="Blue Tokai" sub="8 cups" value="₹1,200" pct={22} color="#E07A5F" delay={300}/>
      <MRBarRow label="Zomato" sub="2 orders" value="₹900" pct={17} color="#E07A5F" delay={380}/>

      <div style={{display:'flex', gap:14, marginTop:18, paddingTop:14, borderTop:'1px solid var(--line)'}}>
        <MRStatCell label="Eat out" value="₹9,600" delay={440}/>
        <MRStatCell label="Grocery" value="₹3,900" delay={500}/>
        <MRStatCell label="vs Mar" value="↑ 4%" color="var(--warn)" delay={560}/>
      </div>
    </>
  );

  const SlideGoals = () => (
    <>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-3)', marginBottom:10}}>A WIN</div>
      <div style={{fontSize:28, fontWeight:600, lineHeight:1.15, letterSpacing:'-0.02em', marginBottom:6}}>
        You saved <CounterUp value={17820} prefix="₹"/>
      </div>
      <div className="small" style={{color:'var(--ink-2)', marginBottom:22}}>Across 3 goals · your best month of 2026</div>

      <div className="label" style={{fontSize:10, marginBottom:10}}>Goal progress</div>
      <MRBarRow label="Japan trip" sub="Dec 2026" value="74%" pct={74} color="var(--brand)" delay={60}/>
      <div className="small mono" style={{marginTop:-8, marginBottom:14, color:'var(--ink-3)', paddingLeft:2}}>₹2,40,000 / ₹3,25,000</div>

      <MRBarRow label="Emergency fund" sub="6 months" value="92%" pct={92} color="var(--ok)" delay={160}/>
      <div className="small mono" style={{marginTop:-8, marginBottom:14, color:'var(--ink-3)', paddingLeft:2}}>₹1,84,000 / ₹2,00,000</div>

      <MRBarRow label="New laptop" sub="M4 Pro" value="31%" pct={31} color="var(--info)" delay={260}/>
      <div className="small mono" style={{marginTop:-8, marginBottom:6, color:'var(--ink-3)', paddingLeft:2}}>₹46,000 / ₹1,50,000</div>

      <div style={{display:'flex', gap:14, marginTop:22, paddingTop:18, borderTop:'1px solid var(--line)'}}>
        <MRStatCell label="This month" value="+₹17,820" color="var(--ok)" delay={360}/>
        <MRStatCell label="YTD saved" value="₹62,400" delay={420}/>
        <MRStatCell label="On track" value="3 / 3" color="var(--ok)" delay={480}/>
      </div>
    </>
  );

  const SlideSubs = () => (
    <>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-3)', marginBottom:10}}>WORTH A REVIEW</div>
      <div style={{fontSize:28, fontWeight:600, lineHeight:1.15, letterSpacing:'-0.02em', marginBottom:6}}>
        4 subs you didn't open
      </div>
      <div className="small" style={{color:'var(--ink-2)', marginBottom:22}}>₹3,200 / month · cancel these and save ₹38,400/yr</div>

      {[
        { name:'Notion', sub:'last opened 47 days ago', price:'₹890', tone:'var(--err)' },
        { name:'NYT', sub:'last opened 33 days ago', price:'₹599', tone:'var(--warn)' },
        { name:'Headspace', sub:'last opened 62 days ago', price:'₹999', tone:'var(--err)' },
        { name:'Hotstar', sub:'last opened 28 days ago', price:'₹699', tone:'var(--warn)' },
      ].map((s, i) => (
        <div key={s.name} style={{display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i < 3 ? '1px solid var(--line)' : 'none', animation:`fadeUp 540ms ${80 + i*80}ms both`}}>
          <div style={{width:8, height:8, borderRadius:99, background: s.tone, flexShrink:0}}/>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:14, fontWeight:600}}>{s.name}</div>
            <div className="small mono" style={{color:'var(--ink-3)', marginTop:1}}>{s.sub}</div>
          </div>
          <div className="tabular" style={{fontSize:14, fontWeight:600}}>{s.price}<span className="small mono" style={{color:'var(--ink-3)', fontWeight:400}}>/mo</span></div>
        </div>
      ))}

      <div style={{display:'flex', gap:14, marginTop:22, paddingTop:14, borderTop:'1px solid var(--line)'}}>
        <MRStatCell label="Active subs" value="11" delay={420}/>
        <MRStatCell label="Monthly cost" value="₹4,890" delay={480}/>
        <MRStatCell label="Could save" value="₹3,200" color="var(--ok)" delay={540}/>
      </div>
    </>
  );

  const SlideOutlook = () => (
    <>
      <div style={{fontFamily:'var(--font-mono)', fontSize:11, letterSpacing:'0.08em', color:'var(--ink-3)', marginBottom:10}}>MAY OUTLOOK</div>
      <div style={{fontSize:28, fontWeight:600, lineHeight:1.15, letterSpacing:'-0.02em', marginBottom:6}}>
        On pace for <CounterUp value={48500} prefix="₹"/>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:22}}>
        <span style={{padding:'4px 10px', borderRadius:99, background:'color-mix(in srgb, var(--brand) 16%, transparent)', color:'var(--brand)', fontSize:12, fontWeight:600, fontFamily:'var(--font-mono)'}}>under budget</span>
        <span className="small" style={{color:'var(--ink-2)'}}>₹11,500 below your monthly cap</span>
      </div>

      <div style={{marginBottom:6}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:6}}>
          <span className="label" style={{fontSize:10}}>Weekly pace · April → May</span>
          <span className="small mono" style={{color:'var(--ink-3)'}}>actual · projected</span>
        </div>
        <MRTrajectory actual={[11200, 23000, 35900, 48700, 54180]} projected={[54180, 65400, 77000, 88200, 102680]}/>
      </div>

      <div style={{display:'flex', gap:14, marginTop:18, paddingTop:14, borderTop:'1px solid var(--line)'}}>
        <MRStatCell label="Days in" value="30 / 30" delay={80}/>
        <MRStatCell label="May cap" value="₹60,000" delay={160}/>
        <MRStatCell label="Daily target" value="₹1,565" color="var(--brand)" delay={240}/>
      </div>
    </>
  );

  const slides = [
    { bg: 'linear-gradient(160deg, color-mix(in srgb, var(--brand) 18%, var(--bg)) 0%, var(--bg) 50%)',  chip: 'Total spend',  Content: SlideSpend },
    { bg: 'linear-gradient(160deg, color-mix(in srgb, #E07A5F 22%, var(--bg)) 0%, var(--bg) 50%)',       chip: 'Where it went', Content: SlideCategory },
    { bg: 'linear-gradient(160deg, color-mix(in srgb, var(--ok) 18%, var(--bg)) 0%, var(--bg) 50%)',     chip: 'Goals',         Content: SlideGoals },
    { bg: 'linear-gradient(160deg, color-mix(in srgb, var(--err) 16%, var(--bg)) 0%, var(--bg) 50%)',    chip: 'Subscriptions', Content: SlideSubs },
    { bg: 'linear-gradient(160deg, color-mix(in srgb, var(--brand) 22%, var(--bg)) 0%, var(--bg) 50%)',  chip: 'Outlook',       Content: SlideOutlook },
  ];

  const [idx, setIdx] = useStateV3(0);
  const [paused, setPaused] = useStateV3(false);
  const refKey = useRefV3(0);
  const slideDuration = 6800; // longer — more to read per slide
  useEffectV3(() => {
    if (paused) return;
    refKey.current += 1;
    const k = refKey.current;
    const t = setTimeout(() => { if (k === refKey.current) setIdx(i => i < slides.length-1 ? i+1 : i); }, slideDuration);
    return () => clearTimeout(t);
  }, [idx, paused]);

  const s = slides[idx];
  const Content = s.Content;
  return (
    <div className="scroll" data-screen-label="14 Monthly Review" style={{padding:0, overflow:'hidden'}}>
      <div style={{height:'100%', display:'flex', flexDirection:'column', position:'relative', background: s.bg, transition:'background 600ms ease'}}>
        {/* progress bars */}
        <div style={{display:'flex', gap:4, padding:'14px 18px 0'}}>
          {slides.map((_, i) => (
            <div key={i} style={{flex:1, height:3, background:'rgba(0,0,0,0.12)', borderRadius:2, overflow:'hidden'}}>
              <div style={{height:'100%', width: i < idx ? '100%' : i === idx ? '100%' : '0%', background:'var(--ink)', animation: i === idx && !paused ? `progFill ${slideDuration}ms linear forwards` : 'none'}}/>
            </div>
          ))}
        </div>

        {/* top bar */}
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 14px 0'}}>
          <button onClick={onBack} className="btn btn-ghost" style={{width:34, height:34, padding:0, borderRadius:'50%', display:'grid', placeItems:'center'}}>
            <Icon name="x" size={16}/>
          </button>
          <span style={{fontFamily:'var(--font-mono)', fontSize:11, color:'var(--ink-3)'}}>{s.chip} · {idx+1}/{slides.length}</span>
          <button onClick={() => setPaused(p => !p)} className="btn btn-ghost" style={{width:34, height:34, padding:0, borderRadius:'50%', display:'grid', placeItems:'center'}}>
            <Icon name={paused ? 'play' : 'clock'} size={14}/>
          </button>
        </div>

        {/* tap zones for prev/next */}
        <div style={{position:'absolute', top:60, left:0, width:'28%', bottom:0, zIndex:2, cursor:'pointer'}} onClick={() => setIdx(i => Math.max(0, i-1))}/>
        <div style={{position:'absolute', top:60, right:0, width:'28%', bottom:0, zIndex:2, cursor:'pointer'}} onClick={() => setIdx(i => Math.min(slides.length-1, i+1))}/>

        {/* content — fills available height */}
        <div key={idx} style={{flex:1, padding:'22px 24px 18px', display:'flex', flexDirection:'column', overflow:'auto', animation:'fadeUp 460ms cubic-bezier(0.2, 0.8, 0.2, 1)'}}>
          <Content/>
        </div>

        {/* bottom CTA on last slide */}
        {idx === slides.length - 1 && (
          <div style={{padding:'0 22px 22px', position:'relative', zIndex:3}}>
            <button onClick={onBack} className="btn btn-primary" style={{width:'100%', padding:14, fontWeight:600, animation:'fadeUp 460ms 200ms both'}}>Close review</button>
          </div>
        )}
      </div>
      <style>{`
        @keyframes progFill { from { width: 0%; } to { width: 100%; } }
        @keyframes barGrow { from { width: 0%; } }
        @keyframes mrDraw { to { stroke-dashoffset: 0; } }
        @keyframes mrFadeIn { to { opacity: 1; } }
      `}</style>
    </div>
  );
};

// ============================================================
// Coachmarks — guided first-run tour
// ============================================================

/* ===== Coachmarks ===== */
const Coachmarks = ({ steps, onDone }) => {
  const [i, setI] = useStateV3(0);
  const [rect, setRect] = useStateV3(null);

  useEffectV3(() => {
    const step = steps[i];
    if (!step) return;
    const find = () => {
      const phone = document.querySelector('.phone.app');
      const el = document.querySelector(step.selector);
      if (!phone || !el) return null;
      const pr = phone.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      return {
        top: er.top - pr.top - 6,
        left: er.left - pr.left - 6,
        width: er.width + 12,
        height: er.height + 12,
      };
    };
    const r = find();
    if (r) setRect(r);
    // re-measure shortly after to catch any layout settle
    const t = setTimeout(() => { const r2 = find(); if (r2) setRect(r2); }, 80);
    return () => clearTimeout(t);
  }, [i]);

  if (!steps || !steps[i]) return null;
  const step = steps[i];
  if (!rect) return null;

  // place bubble above or below cutout depending on position
  const placeBelow = rect.top < 200;
  const bubbleStyle = placeBelow
    ? { top: rect.top + rect.height + 14, left: 18, right: 18 }
    : { bottom: 'calc(100% - ' + rect.top + 'px + 14px)', left: 18, right: 18, top: 'auto' };
  // simplify: compute from phone height
  const bs = placeBelow
    ? { top: rect.top + rect.height + 14, left: Math.max(14, Math.min(rect.left, 134)), maxWidth: 260 }
    : { top: Math.max(60, rect.top - 14 - 130), left: Math.max(14, Math.min(rect.left, 134)), maxWidth: 260 };

  return (
    <React.Fragment>
      <div className="coachmark-scrim" onClick={() => setI(i+1 < steps.length ? i+1 : onDone())}/>
      <div className="coachmark-hole" style={{top: rect.top, left: rect.left, width: rect.width, height: rect.height}}/>
      <div className="coachmark-bubble" style={bs}>
        <div className="step">Step {i+1} of {steps.length}</div>
        <div className="title">{step.title}</div>
        <div className="body">{step.body}</div>
        <div className="actions">
          <button className="skip" onClick={onDone}>Skip tour</button>
          <button className="next" onClick={() => i+1 < steps.length ? setI(i+1) : onDone()}>{i+1 < steps.length ? 'Next' : 'Got it'}</button>
        </div>
      </div>
    </React.Fragment>
  );
};

/* ===== ThemeTransition ===== */
const ThemeTransition = ({ dir, origin }) => {
  // Jedi (toLight) = clean blue/cyan plasma; Sith (toDark) = crimson
  const saberColor = dir === 'toDark' ? '#FF3838' : '#7FE0FF';
  const wipeColor  = dir === 'toDark' ? '#0B0B0C' : '#F7F7F4';

  const fw = (origin && origin.w) || 390;
  const fh = (origin && origin.h) || 844;
  const cx = (origin && origin.x != null) ? origin.x : fw/2;
  const cy = (origin && origin.y != null) ? origin.y : fh/2;

  // Waypoints — translations relative to click point.
  // Hilt parks at the RIGHT edge at click-Y; rig only moves vertically after that.
  const margin = 22;
  const toRightX  = (fw - margin) - cx;
  const toBotY    = fh - cy + 24;
  const toTopOnlyY = -cy + margin;

  const sparks = React.useMemo(() => Array.from({length: 16}, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 70 + Math.random() * 150;
    return {
      sx: Math.cos(angle) * dist,
      sy: Math.sin(angle) * dist,
      delay: Math.random() * 120,
      size: 2 + Math.random() * 3.5,
    };
  }), []);
  const arcs = React.useMemo(() => Array.from({length: 5}, () => ({
    // Arcs spit toward the blade direction (leftward from hilt)
    rot: 150 + Math.random() * 60,
    delay: Math.random() * 100,
    len: 28 + Math.random() * 36,
  })), []);

  const stageStyle = {
    '--cx': `${cx}px`,
    '--cy': `${cy}px`,
    '--saber': saberColor,
    '--wipe': wipeColor,
    '--toRightX': `${toRightX}px`,
    '--toBotY': `${toBotY}px`,
    '--toTopOnlyY': `${toTopOnlyY}px`,
  };

  return (
    <div aria-hidden className="saber-stage" style={stageStyle}>
      {/* Reveal band — new theme paints upward behind the blade */}
      <div className="saber-reveal-band"/>

      {/* Saber rig: bloom + blade + hilt, all moving as one */}
      <div className="saber-rig">
        <div className="saber-trail"/>
        <div className="saber-bloom"/>
        <div className="saber-blade ghost-2 ghost"/>
        <div className="saber-blade ghost"/>
        <div className="saber-blade"/>
        {arcs.map((a, i) => (
          <div key={'a'+i} className="saber-arc" style={{
            position: 'absolute',
            left: 4, top: -0.75,
            width: `${a.len}px`,
            transform: `rotate(${a.rot}deg)`,
            animationDelay: `${a.delay}ms`,
          }}/>
        ))}
        <div className="saber-hilt"/>
      </div>

      {/* Origin spark + shockwaves at click point */}
      <div className="saber-origin"/>
      <div className="saber-shockwave"/>
      <div className="saber-shockwave s2"/>

      {/* Sparks shooting outward */}
      {sparks.map((s, i) => (
        <div key={i} className="saber-spark" style={{
          '--sx': `${s.sx}px`, '--sy': `${s.sy}px`,
          width: s.size, height: s.size,
          animationDelay: `${s.delay}ms`,
        }}/>
      ))}
    </div>
  );
};
