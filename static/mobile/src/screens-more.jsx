/* Gexpense Hi-Fi — Additional screens
   BankAccounts, MonthlyBudget, NotificationsSettings, ExportData, PrivacyData,
   AddGoal, Recurring, SearchTxs, NotificationsInbox
*/
const { useState: useStateM, useEffect: useEffectM, useRef: useRefM } = React;

// shared sub-bits ------------------------------------------------------------
const ScreenHeader = ({ title, onBack, right }) => (
  <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18}}>
    <div style={{display:'flex', alignItems:'center', gap:10}}>
      {onBack && <button className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:34, height:34, display:'grid', placeItems:'center'}} onClick={onBack}>
        <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
      </button>}
      <div className="h2">{title}</div>
    </div>
    <div>{right}</div>
  </div>
);

const SectionLabel = ({ children, style }) => (
  <div className="label" style={{margin:'14px 4px 8px', ...style}}>{children}</div>
);

// 1. BANK & UPI ACCOUNTS ----------------------------------------------------
const BankAccounts = ({ onBack }) => {
  const [accts, setAccts] = useStateM([
    { id:1, kind:'bank',   name:'HDFC Bank',   masked:'•••• 4821', sub:'Salary · UPI · Cards', updated:'2m ago', on:true,  tone:'#1a4ea8' },
    { id:2, kind:'upi',    name:'Google Pay',  masked:'user@okhdfc',sub:'UPI alerts',           updated:'just now', on:true,  tone:'#1a73e8' },
    { id:3, kind:'card',   name:'ICICI Credit',masked:'•••• 9911', sub:'Sapphiro · auto-statement', updated:'1h ago', on:false, tone:'#a8141a' },
  ]);
  const total = accts.filter(a => a.on).length;
  return (
    <div className="scroll" data-screen-label="13 Bank & UPI">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Bank & UPI" onBack={onBack}/>

        <div className="card fade-up fade-up-2" style={{padding:16, marginBottom:14, display:'flex', alignItems:'center', gap:14}}>
          <div style={{width:44, height:44, borderRadius:11, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center'}}>
            <Icon name="db" size={20}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600, fontSize:14}}>{total} accounts active</div>
            <div className="small">SMS · email · open-banking pulls</div>
          </div>
          <div className="mono small tabular" style={{color:'var(--ok)'}}>● live</div>
        </div>

        <SectionLabel>Connected</SectionLabel>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          {accts.map((a, i) => (
            <React.Fragment key={a.id}>
              {i > 0 && <Divider/>}
              <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
                <div style={{width:38, height:38, borderRadius:9, background:a.tone, color:'#fff', display:'grid', placeItems:'center', flexShrink:0, fontWeight:700, fontSize:13}}>
                  {a.kind === 'upi' ? <Icon name="zap" size={16}/> : a.kind === 'card' ? <Icon name="card" size={16}/> : <Icon name="db" size={16}/>}
                </div>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{display:'flex', alignItems:'center', gap:8}}>
                    <div style={{fontSize:14, fontWeight:600}}>{a.name}</div>
                    <span className="mono small" style={{color:'var(--ink-3)'}}>{a.masked}</span>
                  </div>
                  <div className="small" style={{marginTop:2}}>{a.sub} · updated {a.updated}</div>
                </div>
                <Toggle on={a.on} onClick={() => setAccts(accts.map(x => x.id === a.id ? {...x, on: !x.on} : x))}/>
              </div>
            </React.Fragment>
          ))}
        </div>

        <button className="btn btn-ghost fade-up fade-up-4" style={{width:'100%', padding:'14px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, border:'1px dashed var(--line-strong)', marginBottom:14}}>
          <Icon name="plus" size={16}/> Connect another account
        </button>

        <div className="card fade-up fade-up-5" style={{padding:14, marginBottom:30, display:'flex', gap:12, alignItems:'flex-start', background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
          <div style={{width:28, height:28, borderRadius:8, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
            <Icon name="shield" size={14}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:600}}>Read-only access</div>
            <div className="small" style={{marginTop:2}}>We never store credentials. Parsing happens on-device unless you opt into cloud AI.</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// 2. MONTHLY BUDGET ---------------------------------------------------------
const MonthlyBudget = ({ onBack, onSave }) => {
  const [amount, setAmount] = useStateM(60000);
  const [alertAt, setAlertAt] = useStateM(85);
  const [rollover, setRollover] = useStateM(true);
  const presets = [40000, 50000, 60000, 75000, 100000];
  const spent = 42180;
  const pct = Math.min(100, Math.round((spent / amount) * 100));

  return (
    <div className="scroll" data-screen-label="14 Monthly Budget">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Monthly budget" onBack={onBack}/>

        <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:14}}>
          <div className="label">This month's cap</div>
          <div style={{display:'flex', alignItems:'baseline', gap:6, marginTop:6}}>
            <span style={{fontSize:34, fontWeight:600}}>₹</span>
            <input inputMode="numeric" value={amount} onChange={(e) => setAmount(Number(e.target.value.replace(/[^\d]/g,'')) || 0)}
              style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:42, fontWeight:700, width:'100%', outline:'none', padding:0, color:'var(--ink)'}}/>
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:12}}>
            {presets.map(p => (
              <span key={p} onClick={() => setAmount(p)} className="chip" style={{cursor:'pointer', background: amount === p ? 'var(--brand)' : 'var(--surface-2)', color: amount === p ? '#fff' : 'var(--ink-2)', border:'1px solid ' + (amount === p ? 'var(--brand)' : 'var(--line)')}}>
                ₹{(p/1000)}k
              </span>
            ))}
          </div>
        </div>

        <div className="card fade-up fade-up-3" style={{padding:18, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <div className="label">Spent so far</div>
            <div className="mono tabular small" style={{color:'var(--ink-3)'}}>{pct}% used</div>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:2}}>
            <div style={{fontSize:22, fontWeight:600}}>₹{spent.toLocaleString('en-IN')}</div>
            <div className="mono small">of ₹{amount.toLocaleString('en-IN')}</div>
          </div>
          <div className="progress" style={{marginTop:10, height:6}}>
            <i style={{width: `${pct}%`, background: pct > alertAt ? 'var(--err)' : 'var(--brand)'}}/>
          </div>
        </div>

        <SectionLabel>Alerts</SectionLabel>
        <div className="card fade-up fade-up-4" style={{padding:'14px 16px', marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div>
              <div style={{fontSize:14, fontWeight:600}}>Notify me at {alertAt}%</div>
              <div className="small" style={{marginTop:2}}>~₹{Math.round(amount * alertAt / 100).toLocaleString('en-IN')} spent</div>
            </div>
            <div className="mono tabular" style={{fontSize:16, fontWeight:700, color:'var(--brand)'}}>{alertAt}%</div>
          </div>
          <input type="range" min="50" max="100" step="5" value={alertAt} onChange={(e) => setAlertAt(Number(e.target.value))} style={{width:'100%', marginTop:10, accentColor:'var(--brand)'}}/>
          <div style={{display:'flex', justifyContent:'space-between'}}>
            <span className="mono small">50%</span><span className="mono small">75%</span><span className="mono small">100%</span>
          </div>
        </div>

        <div className="card fade-up fade-up-5" style={{padding:0, marginBottom:14}}>
          <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
            <Icon name="repeat" size={18} style={{color:'var(--ink-2)'}}/>
            <div style={{flex:1}}>
              <div style={{fontSize:13, fontWeight:600}}>Roll over unused</div>
              <div className="small">Unused budget carries to next month</div>
            </div>
            <Toggle on={rollover} onClick={() => setRollover(!rollover)}/>
          </div>
        </div>

        <div className="fade-up fade-up-6" style={{marginBottom:30}}>
          <button onClick={() => onSave && onSave(amount)} className="btn btn-primary" style={{width:'100%', padding:14, fontWeight:600}}>Save budget</button>
        </div>
      </div>
    </div>
  );
};

// 3. NOTIFICATION SETTINGS --------------------------------------------------
const NotificationsSettings = ({ onBack }) => {
  const [items, setItems] = useStateM({
    daily:      { on:true,  label:'Daily summary',         sub:'9:00 PM · top 3 categories',  icon:'sun' },
    budget:     { on:true,  label:'Budget alerts',         sub:'When category hits 85%',       icon:'wallet' },
    unusual:    { on:true,  label:'Unusual spend',         sub:'AI-detected anomalies',        icon:'sparkle' },
    bill:       { on:true,  label:'Bill reminders',        sub:'2 days before due',            icon:'clock' },
    largeTx:    { on:false, label:'Large transactions',    sub:'Over ₹5,000',                  icon:'arrowUp' },
    weekly:     { on:false, label:'Weekly digest',         sub:'Sundays · trends & savings',   icon:'mail' },
    goalProg:   { on:true,  label:'Goal milestones',       sub:'Every 25% saved',              icon:'target' },
  });
  const [quiet, setQuiet] = useStateM(true);
  const [push, setPush] = useStateM(true);
  const [email, setEmail] = useStateM(false);

  return (
    <div className="scroll" data-screen-label="15 Notifications">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Notifications" onBack={onBack}/>

        <SectionLabel>Channels</SectionLabel>
        <div className="card fade-up fade-up-2" style={{padding:0, marginBottom:14}}>
          <Row icon="bell" label="Push" sub="On this device" right={<Toggle on={push} onClick={() => setPush(!push)}/>}/>
          <Divider/>
          <Row icon="mail" label="Email" sub="user@example.com" right={<Toggle on={email} onClick={() => setEmail(!email)}/>}/>
        </div>

        <SectionLabel>What to send</SectionLabel>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          {Object.entries(items).map(([k, v], i, a) => (
            <React.Fragment key={k}>
              {i > 0 && <Divider/>}
              <Row icon={v.icon} label={v.label} sub={v.sub} right={
                <Toggle on={v.on} onClick={() => setItems({...items, [k]: {...v, on: !v.on}})}/>
              }/>
            </React.Fragment>
          ))}
        </div>

        <SectionLabel>Quiet hours</SectionLabel>
        <div className="card fade-up fade-up-4" style={{padding:'14px 16px', marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
            <div>
              <div style={{fontSize:14, fontWeight:600}}>Mute notifications</div>
              <div className="small" style={{marginTop:2}}>10:00 PM → 7:00 AM</div>
            </div>
            <Toggle on={quiet} onClick={() => setQuiet(!quiet)}/>
          </div>
          {quiet && (
            <div style={{display:'flex', gap:8, marginTop:6}}>
              <div style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)'}}>
                <div className="label">From</div>
                <div className="mono tabular" style={{fontSize:14, fontWeight:600, marginTop:2}}>10:00 PM</div>
              </div>
              <div style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)'}}>
                <div className="label">To</div>
                <div className="mono tabular" style={{fontSize:14, fontWeight:600, marginTop:2}}>7:00 AM</div>
              </div>
            </div>
          )}
        </div>
        <div style={{height:30}}/>
      </div>
    </div>
  );
};

// 4. EXPORT DATA ------------------------------------------------------------
const ExportData = ({ onBack, onExport }) => {
  const [range, setRange] = useStateM('12m');
  const [format, setFormat] = useStateM('csv');
  const [includeAI, setIncludeAI] = useStateM(false);
  const recents = [
    { date:'Apr 28, 2026', range:'Mar 2026', fmt:'CSV', size:'42 KB', count:213 },
    { date:'Mar 31, 2026', range:'Feb 2026', fmt:'CSV', size:'38 KB', count:189 },
    { date:'Jan 12, 2026', range:'2025 · full year', fmt:'PDF', size:'1.2 MB', count:2104 },
  ];

  return (
    <div className="scroll" data-screen-label="16 Export">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Export data" onBack={onBack}/>

        <SectionLabel>Date range</SectionLabel>
        <div className="card fade-up fade-up-2" style={{padding:6, marginBottom:14, display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:4}}>
          {[['1m','Month'],['3m','3 months'],['12m','12 months'],['all','All time']].map(([k, l]) => (
            <div key={k} onClick={() => setRange(k)} style={{textAlign:'center', padding:'10px 4px', borderRadius:9, cursor:'pointer', fontSize:12, fontWeight:600, background: range === k ? 'var(--ink)' : 'transparent', color: range === k ? 'var(--paper)' : 'var(--ink-2)'}}>{l}</div>
          ))}
        </div>

        <SectionLabel>Format</SectionLabel>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          {[
            ['csv','CSV','Spreadsheet · Excel · Sheets', 'list'],
            ['pdf','PDF report','Designed monthly summary', 'receipt'],
            ['json','JSON','Raw data with all metadata', 'db'],
          ].map(([k, l, s, ico], i) => (
            <React.Fragment key={k}>
              {i > 0 && <Divider/>}
              <div onClick={() => setFormat(k)} style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer'}}>
                <div style={{width:36, height:36, borderRadius:9, background:'var(--surface-2)', display:'grid', placeItems:'center', flexShrink:0}}>
                  <Icon name={ico} size={16}/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontSize:14, fontWeight:600}}>{l}</div>
                  <div className="small" style={{marginTop:2}}>{s}</div>
                </div>
                <div style={{width:20, height:20, borderRadius:'50%', border: format === k ? '6px solid var(--brand)' : '2px solid var(--line-strong)'}}/>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="card fade-up fade-up-4" style={{padding:'14px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12}}>
          <Icon name="sparkle" size={18} style={{color:'var(--brand)'}}/>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:600}}>Include AI categories & tags</div>
            <div className="small" style={{marginTop:2}}>Adds inferred fields to each row</div>
          </div>
          <Toggle on={includeAI} onClick={() => setIncludeAI(!includeAI)}/>
        </div>

        <SectionLabel>Recent exports</SectionLabel>
        <div className="card fade-up fade-up-5" style={{padding:0, marginBottom:14}}>
          {recents.map((r, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Divider/>}
              <div style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12}}>
                <Icon name="download" size={16} style={{color:'var(--ink-3)'}}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:13, fontWeight:600}}>{r.range} · {r.fmt}</div>
                  <div className="small mono" style={{marginTop:2}}>{r.date} · {r.count} txns · {r.size}</div>
                </div>
                <button className="btn btn-ghost" style={{padding:'6px 10px', fontSize:11}}>Re-download</button>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="fade-up fade-up-6" style={{marginBottom:30}}>
          <button onClick={() => onExport && onExport(`${format.toUpperCase()} · ${range}`)} className="btn btn-primary" style={{width:'100%', padding:14, fontWeight:600, display:'flex', alignItems:'center', justifyContent:'center', gap:8}}>
            <Icon name="download" size={16}/> Export {format.toUpperCase()}
          </button>
        </div>
      </div>
    </div>
  );
};

// 5. PRIVACY & DATA ---------------------------------------------------------
const PrivacyData = ({ onBack, onDeleteAccount }) => {
  const [onDevice, setOnDevice] = useStateM(true);
  const [analytics, setAnalytics] = useStateM(false);
  const [confirm, setConfirm] = useStateM(false);

  return (
    <div className="scroll" data-screen-label="17 Privacy">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Privacy & data" onBack={onBack}/>

        <div className="card fade-up fade-up-2" style={{padding:16, marginBottom:14, display:'flex', alignItems:'center', gap:14, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
          <div style={{width:44, height:44, borderRadius:11, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center'}}>
            <Icon name="lock" size={20}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:600, fontSize:14}}>Your data, your device</div>
            <div className="small" style={{marginTop:2}}>SMS & emails parse locally. Cloud only when you opt in.</div>
          </div>
        </div>

        <SectionLabel>Parsing</SectionLabel>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          <Row icon="lock" label="On-device parsing" sub="Receipts never leave this phone" right={<Toggle on={onDevice} onClick={() => setOnDevice(!onDevice)}/>}/>
          <Divider/>
          <Row icon="sparkle" label="Cloud AI categorization" sub="For ambiguous merchants only" right={<Toggle on={!onDevice} onClick={() => setOnDevice(!onDevice)}/>}/>
          <Divider/>
          <Row icon="chart" label="Anonymous analytics" sub="Crash reports · no transaction data" right={<Toggle on={analytics} onClick={() => setAnalytics(!analytics)}/>}/>
        </div>

        <SectionLabel>Your data</SectionLabel>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <Row icon="download" label="Download everything" sub="Full archive · ZIP" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          <Divider/>
          <Row icon="eye" label="What we collect" sub="Plain-English summary" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          <Divider/>
          <Row icon="external" label="Privacy policy" sub="Last updated Apr 2026" right={<Icon name="external" size={16} style={{color:'var(--ink-3)'}}/>}/>
        </div>

        <SectionLabel style={{color:'var(--err)'}}>Danger zone</SectionLabel>
        <div className="card fade-up fade-up-5" style={{padding:0, marginBottom:14, border:'1px solid color-mix(in srgb, var(--err) 30%, var(--line))'}}>
          <div onClick={() => setConfirm(true)} style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer'}}>
            <div style={{width:36, height:36, borderRadius:9, background:'color-mix(in srgb, var(--err) 14%, transparent)', color:'var(--err)', display:'grid', placeItems:'center'}}>
              <Icon name="trash" size={16}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14, fontWeight:600, color:'var(--err)'}}>Delete account & data</div>
              <div className="small" style={{marginTop:2}}>Permanent · 30 days to recover</div>
            </div>
          </div>
        </div>
        <div style={{height:30}}/>

        {confirm && (
          <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,0.4)', zIndex:50, display:'grid', placeItems:'center', padding:24}}>
            <div className="card" style={{padding:22, width:'100%', maxWidth:340, textAlign:'center'}}>
              <div style={{width:54, height:54, borderRadius:14, background:'color-mix(in srgb, var(--err) 14%, transparent)', color:'var(--err)', display:'grid', placeItems:'center', margin:'0 auto 12px'}}>
                <Icon name="trash" size={24}/>
              </div>
              <div className="h3" style={{marginBottom:6}}>Delete account?</div>
              <div className="small" style={{marginBottom:16}}>All 2,318 transactions, 6 budgets, 3 goals will be erased. You have 30 days to undo.</div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={() => setConfirm(false)} className="btn btn-ghost" style={{flex:1, padding:12}}>Cancel</button>
                <button onClick={() => { setConfirm(false); onDeleteAccount && onDeleteAccount(); }} className="btn" style={{flex:1, padding:12, background:'var(--err)', color:'#fff', fontWeight:600}}>Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 6. ADD GOAL ---------------------------------------------------------------
const AddGoal = ({ onBack, onSave }) => {
  const [name, setName] = useStateM('');
  const [target, setTarget] = useStateM(50000);
  const [due, setDue] = useStateM('Dec 2026');
  const [icon, setIcon] = useStateM('car');
  const presets = [
    { ico:'car',     name:'Trip',         amt:80000 },
    { ico:'shield',  name:'Emergency',    amt:300000 },
    { ico:'flame',   name:'Big purchase', amt:120000 },
    { ico:'bag',     name:'Wedding',      amt:500000 },
    { ico:'target',  name:'Custom',       amt:50000 },
  ];
  const monthly = target ? Math.round(target / 8) : 0;

  return (
    <div className="scroll" data-screen-label="18 Add Goal">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="New goal" onBack={onBack}/>

        <SectionLabel>Start from a template</SectionLabel>
        <div className="fade-up fade-up-2" style={{display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:6, marginBottom:14}}>
          {presets.map(p => (
            <div key={p.ico} onClick={() => { setIcon(p.ico); if (p.name !== 'Custom') { setName(p.name); setTarget(p.amt); } }}
              className="card" style={{padding:'12px 4px', textAlign:'center', cursor:'pointer', background: icon === p.ico ? 'var(--brand-soft)' : 'var(--surface)', border:'1px solid ' + (icon === p.ico ? 'var(--brand)' : 'var(--line)')}}>
              <div style={{display:'grid', placeItems:'center', color: icon === p.ico ? 'var(--brand)' : 'var(--ink-2)'}}>
                <Icon name={p.ico} size={18}/>
              </div>
              <div className="small" style={{marginTop:4, fontSize:10, fontWeight:600, color: icon === p.ico ? 'var(--brand)' : 'var(--ink-2)'}}>{p.name}</div>
            </div>
          ))}
        </div>

        <SectionLabel>Name</SectionLabel>
        <div className="card fade-up fade-up-3" style={{padding:'12px 14px', marginBottom:14}}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Bali trip" style={{border:'none', background:'transparent', width:'100%', fontFamily:'inherit', fontSize:16, fontWeight:500, outline:'none', color:'var(--ink)'}}/>
        </div>

        <SectionLabel>Target amount</SectionLabel>
        <div className="card fade-up fade-up-4" style={{padding:16, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'baseline', gap:6}}>
            <span style={{fontSize:24, fontWeight:600, color:'var(--ink-3)'}}>₹</span>
            <input inputMode="numeric" value={target} onChange={e => setTarget(Number(e.target.value.replace(/[^\d]/g,'')) || 0)}
              style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:30, fontWeight:700, width:'100%', outline:'none', color:'var(--ink)'}}/>
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginTop:10}}>
            {[25000, 50000, 100000, 200000, 500000].map(p => (
              <span key={p} onClick={() => setTarget(p)} className="chip" style={{cursor:'pointer'}}>₹{p >= 100000 ? `${p/100000}L` : `${p/1000}k`}</span>
            ))}
          </div>
        </div>

        <SectionLabel>Target date</SectionLabel>
        <div className="card fade-up fade-up-5" style={{padding:'14px 16px', marginBottom:14, display:'flex', alignItems:'center', gap:12}}>
          <Icon name="calendar" size={18} style={{color:'var(--ink-3)'}}/>
          <input value={due} onChange={e => setDue(e.target.value)} style={{flex:1, border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:600, outline:'none', color:'var(--ink)'}}/>
          <Icon name="chevron" size={14} style={{color:'var(--ink-3)'}}/>
        </div>

        <div className="card fade-up fade-up-6" style={{padding:14, marginBottom:14, background:'var(--brand-soft)', display:'flex', gap:12, alignItems:'center', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
          <div style={{width:32, height:32, borderRadius:9, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
            <Icon name="sparkle" size={14}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:600}}>~₹{monthly.toLocaleString('en-IN')}/month</div>
            <div className="small" style={{marginTop:2}}>At your current savings rate you'll hit this by {due}.</div>
          </div>
        </div>

        <div className="fade-up fade-up-6" style={{marginBottom:30}}>
          <button onClick={() => onSave && onSave({ name: name || 'Untitled goal', target, due, icon })}
            disabled={!name || !target}
            className="btn btn-primary" style={{width:'100%', padding:14, fontWeight:600, opacity: (!name || !target) ? 0.4 : 1}}>
            Create goal
          </button>
        </div>
      </div>
    </div>
  );
};

// 7. RECURRING --------------------------------------------------------------
const Recurring = ({ onBack }) => {
  const subs = [
    { k:'subs',    n:'Netflix',         sub:'Monthly · 12th', amt:649,   next:'May 12', tone:'#e50914' },
    { k:'subs',    n:'Spotify Premium', sub:'Monthly · 8th',  amt:119,   next:'May 8',  tone:'#1db954' },
    { k:'subs',    n:'Apple iCloud+',   sub:'Monthly · 1st',  amt:75,    next:'Jun 1',  tone:'#000' },
    { k:'health',  n:'Cult.fit',        sub:'Monthly · 5th',  amt:1999,  next:'May 5',  tone:'#f47521' },
    { k:'rent',    n:'Rent · Koramangala', sub:'Monthly · 1st',amt:32000, next:'Jun 1', tone:'#5b6b8c' },
    { k:'utilities',n:'Airtel Postpaid', sub:'Monthly · 18th', amt:799,  next:'May 18', tone:'#e40000' },
    { k:'utilities',n:'BESCOM',         sub:'Bi-monthly',     amt:3400,  next:'Jun 5',  tone:'#1a73e8' },
    { k:'subs',    n:'NYTimes',         sub:'Yearly · Sep 22',amt:4200,  next:'Sep 22', tone:'#000' },
    { k:'food',    n:'Swiggy One',      sub:'Yearly',         amt:1499,  next:'Jul 14', tone:'#fc8019' },
  ];
  const monthlyTotal = subs.filter(s => s.sub.startsWith('Monthly')).reduce((a, b) => a + b.amt, 0);
  const yearlyTotal = subs.filter(s => s.sub.startsWith('Yearly')).reduce((a, b) => a + b.amt, 0);
  const annualized = monthlyTotal * 12 + yearlyTotal;

  return (
    <div className="scroll" data-screen-label="19 Recurring">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Recurring" onBack={onBack}
          right={<button className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}><Icon name="plus" size={18}/></button>}/>

        <div className="card fade-up fade-up-2" style={{padding:18, marginBottom:14, background:'var(--ink)', color:'var(--paper)', border:'1px solid var(--ink)'}}>
          <div className="label" style={{color:'color-mix(in srgb, var(--paper) 60%, transparent)'}}>Monthly subscriptions</div>
          <div style={{fontSize:34, fontWeight:600, marginTop:4, fontFeatureSettings:'"tnum"'}}>₹{monthlyTotal.toLocaleString('en-IN')}<span style={{fontSize:14, fontWeight:500, opacity:0.6, marginLeft:6}}>/mo</span></div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop:14, paddingTop:14, borderTop:'1px solid color-mix(in srgb, var(--paper) 16%, transparent)'}}>
            <div>
              <div className="label" style={{color:'color-mix(in srgb, var(--paper) 50%, transparent)'}}>Annualized</div>
              <div className="mono tabular" style={{fontSize:16, fontWeight:600, marginTop:2}}>₹{annualized.toLocaleString('en-IN')}</div>
            </div>
            <div>
              <div className="label" style={{color:'color-mix(in srgb, var(--paper) 50%, transparent)'}}>Active</div>
              <div className="mono tabular" style={{fontSize:16, fontWeight:600, marginTop:2}}>{subs.length} services</div>
            </div>
          </div>
        </div>

        <div className="card fade-up fade-up-3" style={{padding:14, marginBottom:14, display:'flex', gap:12, alignItems:'flex-start', background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)'}}>
          <div style={{width:30, height:30, borderRadius:8, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
            <Icon name="sparkle" size={14}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:13, fontWeight:600}}>You used Spotify 2× last month</div>
            <div className="small" style={{marginTop:2}}>Consider pausing or switching to Family.</div>
          </div>
          <button className="chip" style={{background:'var(--brand)', color:'#fff', border:'1px solid var(--brand)', whiteSpace:'nowrap'}}>Review</button>
        </div>

        <SectionLabel>Upcoming · next 30 days</SectionLabel>
        <div className="fade-up fade-up-4" style={{marginBottom:14}}>
          {subs.slice(0, 6).map((r, i) => (
            <div key={i} className="card" style={{padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:36, height:36, borderRadius:9, background:r.tone, color:'#fff', display:'grid', placeItems:'center', fontSize:13, fontWeight:700}}>{r.n[0]}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:6}}>
                  <div style={{fontSize:14, fontWeight:600}}>{r.n}</div>
                </div>
                <div className="small" style={{marginTop:2}}>{r.sub} · next {r.next}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div className="mono tabular" style={{fontSize:14, fontWeight:600}}>₹{r.amt.toLocaleString('en-IN')}</div>
                <div className="small mono" style={{color:'var(--ink-3)'}}>{r.k}</div>
              </div>
            </div>
          ))}
        </div>

        <SectionLabel>Yearly</SectionLabel>
        <div className="fade-up fade-up-5" style={{marginBottom:30}}>
          {subs.filter(s => s.sub.startsWith('Yearly')).map((r, i) => (
            <div key={i} className="card" style={{padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:36, height:36, borderRadius:9, background:r.tone, color:'#fff', display:'grid', placeItems:'center', fontSize:13, fontWeight:700}}>{r.n[0]}</div>
              <div style={{flex:1, minWidth:0}}>
                <div style={{fontSize:14, fontWeight:600}}>{r.n}</div>
                <div className="small" style={{marginTop:2}}>{r.sub} · ~₹{Math.round(r.amt/12)}/mo</div>
              </div>
              <div className="mono tabular" style={{fontSize:14, fontWeight:600}}>₹{r.amt.toLocaleString('en-IN')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// 8. SEARCH -----------------------------------------------------------------
const SearchTxs = ({ onBack, onTxOpen }) => {
  const [q, setQ] = useStateM('');
  const inputRef = useRefM(null);
  useEffectM(() => { inputRef.current && inputRef.current.focus(); }, []);

  const recents = ['Swiggy', 'Uber', 'rent', '> 5000', 'category:food this month'];
  const suggestions = [
    { t:'Filter', q:'Last 7 days',           ico:'calendar' },
    { t:'Filter', q:'Above ₹1,000',          ico:'arrowUp' },
    { t:'Category', q:'Food & dining',       ico:'coffee' },
    { t:'Category', q:'Transport',           ico:'car' },
    { t:'Merchant', q:'Amazon',              ico:'bag' },
  ];

  const all = [
    { merchant:'Swiggy',   note:'Burger King', cat:'food',  amt:489,  date:'Today · 1:42 PM', ico:'coffee' },
    { merchant:'Uber',     note:'Airport',     cat:'car',   amt:780,  date:'Yesterday · 9:14 AM', ico:'car' },
    { merchant:'Swiggy',   note:'Dominos',     cat:'food',  amt:629,  date:'Apr 28',  ico:'coffee' },
    { merchant:'Swiggy Instamart', note:'Groceries', cat:'food', amt:1247, date:'Apr 27', ico:'bag' },
    { merchant:'BigBasket',note:'Groceries',   cat:'food',  amt:2310, date:'Apr 25', ico:'bag' },
  ];
  const matches = q.trim() ? all.filter(r => r.merchant.toLowerCase().includes(q.toLowerCase()) || r.note.toLowerCase().includes(q.toLowerCase())) : [];

  return (
    <div className="scroll" data-screen-label="20 Search">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', alignItems:'center', gap:10, marginBottom:14}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:34, height:34, display:'grid', placeItems:'center'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div style={{flex:1, display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderRadius:12, border:'1px solid var(--line)', background:'var(--surface-2)'}}>
            <Icon name="search" size={16} style={{color:'var(--ink-3)'}}/>
            <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Merchant, note, or category"
              style={{flex:1, border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:500, outline:'none', color:'var(--ink)'}}/>
            {q && <button onClick={() => setQ('')} style={{padding:0, border:'none', background:'transparent', cursor:'pointer', color:'var(--ink-3)'}}><Icon name="x" size={14}/></button>}
          </div>
        </div>

        {!q.trim() && (
          <>
            <SectionLabel>Recent</SectionLabel>
            <div className="fade-up fade-up-2" style={{display:'flex', flexWrap:'wrap', gap:6, marginBottom:14}}>
              {recents.map((r, i) => (
                <span key={i} onClick={() => setQ(r)} className="chip" style={{cursor:'pointer'}}>
                  <Icon name="clock" size={11}/>{r}
                </span>
              ))}
            </div>

            <SectionLabel>Suggestions</SectionLabel>
            <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
              {suggestions.map((s, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <Divider/>}
                  <div onClick={() => setQ(s.q)} style={{padding:'14px 16px', display:'flex', alignItems:'center', gap:12, cursor:'pointer'}}>
                    <div style={{width:34, height:34, borderRadius:9, background:'var(--surface-2)', display:'grid', placeItems:'center'}}>
                      <Icon name={s.ico} size={15}/>
                    </div>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14, fontWeight:600}}>{s.q}</div>
                      <div className="small" style={{marginTop:2}}>{s.t}</div>
                    </div>
                    <Icon name="chevron" size={14} style={{color:'var(--ink-3)'}}/>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </>
        )}

        {q.trim() && (
          <>
            <div className="small fade-up fade-up-2" style={{margin:'6px 4px 10px'}}>
              {matches.length} result{matches.length === 1 ? '' : 's'} for "<span style={{color:'var(--ink)', fontWeight:600}}>{q}</span>"
            </div>
            {matches.length === 0 && (
              <div className="card fade-up fade-up-3" style={{padding:30, textAlign:'center', color:'var(--ink-3)'}}>
                <Icon name="search" size={22}/>
                <div style={{marginTop:8, fontWeight:600, color:'var(--ink-2)', fontSize:14}}>No matches</div>
                <div className="small" style={{marginTop:2}}>Try a different merchant or amount range.</div>
              </div>
            )}
            <div className="card fade-up fade-up-3" style={{padding:'4px 0', marginBottom:14}}>
              {matches.map((r, i) => (
                <div key={i} onClick={() => onTxOpen && onTxOpen({ merchant:r.merchant, note:r.note, time:r.date, amount:r.amt, category:r.cat, categoryLabel:r.cat[0].toUpperCase()+r.cat.slice(1), source:'Gmail', sourceDetail:'noreply@swiggy.in', account:'HDFC •• 4821', dateLong:r.date, aiTags:['Receipt', 'Auto-tagged'], id:'tx_' + i })}
                  style={{padding:'10px 14px', display:'flex', alignItems:'center', gap:12, cursor:'pointer'}}>
                  <CatIcon kind={r.cat}/>
                  <div style={{flex:1, minWidth:0}}>
                    <div style={{fontSize:14, fontWeight:600}}>{r.merchant}</div>
                    <div className="small" style={{marginTop:2}}>{r.note} · {r.date}</div>
                  </div>
                  <div className="mono tabular" style={{fontSize:14, fontWeight:600}}>₹{r.amt.toLocaleString('en-IN')}</div>
                </div>
              ))}
            </div>
          </>
        )}
        <div style={{height:30}}/>
      </div>
    </div>
  );
};

// 9. NOTIFICATIONS INBOX ----------------------------------------------------
const NotificationsInbox = ({ onBack, onTxOpen }) => {
  const today = [
    { id:1, k:'budget',  ico:'wallet',  tone:'var(--err)',   t:'Food budget · 92% used', s:'₹13,800 of ₹15,000 · 4 days left', time:'2h ago', unread:true },
    { id:2, k:'ai',      ico:'sparkle', tone:'var(--brand)', t:'Unusual: Uber spend doubled', s:'₹2,340 this week vs ₹980 avg', time:'5h ago', unread:true },
    { id:3, k:'tx',      ico:'mail',    tone:'var(--ink-2)', t:'Auto-tagged 3 expenses', s:'Swiggy · Uber · Apple iCloud+', time:'9h ago', unread:false },
  ];
  const earlier = [
    { id:4, k:'goal',    ico:'target',  tone:'var(--ok)',    t:'Bali trip · 40% saved', s:'₹32,000 of ₹80,000 · on track', time:'Yesterday', unread:false },
    { id:5, k:'bill',    ico:'clock',   tone:'var(--warn)',  t:'Rent due in 2 days', s:'₹32,000 · auto-pay on', time:'Yesterday', unread:false },
    { id:6, k:'tx',      ico:'mail',    tone:'var(--ink-2)', t:'Daily summary · Apr 30', s:'₹2,180 spent · food, transport, subs', time:'2d ago', unread:false },
    { id:7, k:'ai',      ico:'sparkle', tone:'var(--brand)', t:'New rule learned', s:'"OLA *" → Transport · 18 past txns updated', time:'3d ago', unread:false },
  ];

  const NotifRow = ({ n }) => (
    <div style={{padding:'14px 16px', display:'flex', alignItems:'flex-start', gap:12, position:'relative', cursor:'pointer', background: n.unread ? 'color-mix(in srgb, var(--brand) 4%, transparent)' : 'transparent'}}
      onClick={() => n.k === 'tx' && onTxOpen && onTxOpen({ merchant:'Swiggy', note:'Auto-tagged', time:n.time, amount:489, category:'food', categoryLabel:'Food', source:'Gmail', sourceDetail:'noreply@swiggy.in', account:'HDFC •• 4821', dateLong:n.time, aiTags:['Receipt'], id:'tx_inbox' })}>
      {n.unread && <span style={{position:'absolute', left:6, top:24, width:6, height:6, borderRadius:'50%', background:'var(--brand)'}}/>}
      <div style={{width:34, height:34, borderRadius:9, background:'color-mix(in srgb, ' + n.tone + ' 14%, transparent)', color:n.tone, display:'grid', placeItems:'center', flexShrink:0}}>
        <Icon name={n.ico} size={15}/>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{n.t}</div>
        <div className="small" style={{marginTop:2}}>{n.s}</div>
        <div className="mono small" style={{marginTop:4, color:'var(--ink-3)'}}>{n.time}</div>
      </div>
    </div>
  );

  const unreadCount = today.filter(n => n.unread).length;

  return (
    <div className="scroll" data-screen-label="21 Inbox">
      <div style={{padding:'8px 22px 0'}}>
        <ScreenHeader title="Notifications" onBack={onBack}
          right={<button className="btn btn-ghost" style={{padding:'8px 12px', fontSize:11, fontWeight:600}}>Mark all read</button>}/>

        {unreadCount > 0 && (
          <div className="card fade-up fade-up-2" style={{padding:'10px 14px', marginBottom:14, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', display:'flex', alignItems:'center', gap:10}}>
            <span style={{width:8, height:8, borderRadius:'50%', background:'var(--brand)'}}/>
            <div className="small" style={{flex:1, color:'var(--ink-2)'}}>{unreadCount} new since you last checked</div>
            <span className="mono small">10 min ago</span>
          </div>
        )}

        <SectionLabel>Today</SectionLabel>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14, overflow:'hidden'}}>
          {today.map((n, i) => (
            <React.Fragment key={n.id}>
              {i > 0 && <Divider/>}
              <NotifRow n={n}/>
            </React.Fragment>
          ))}
        </div>

        <SectionLabel>Earlier this week</SectionLabel>
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:30, overflow:'hidden'}}>
          {earlier.map((n, i) => (
            <React.Fragment key={n.id}>
              {i > 0 && <Divider/>}
              <NotifRow n={n}/>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
};

Object.assign(window, {
  BankAccounts, MonthlyBudget, NotificationsSettings, ExportData, PrivacyData,
  AddGoal, Recurring, SearchTxs, NotificationsInbox
});
