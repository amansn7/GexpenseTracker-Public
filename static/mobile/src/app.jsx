/* Gexpense Hi-Fi — App shell (clickable prototype) */
const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

const App = () => {
  const [theme, setTheme] = useStateA('light');
  const [screen, setScreen] = useStateA('home'); // home | transactions | insights | settings | onboarding
  const [sheet, setSheet] = useStateA(false);
  const [toast, setToast] = useStateA('');
  const [aiMode, setAiMode] = useStateA(false);
  const [budgetsMode, setBudgetsMode] = useStateA(false);
  const [txPreset, setTxPreset] = useStateA(null);

  // Modal/detail stack — pushed on top of base screen
  const [overlay, setOverlay] = useStateA(null); // { kind, data }
  // Sheet state for AI explain
  const [aiExplain, setAiExplain] = useStateA(null);

  // Empty state mode (toggled per screen)
  const [emptyMode, setEmptyMode] = useStateA(false);

  const toastTimer = useRefA(null);

  useEffectA(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const onAdd = () => setSheet(true);
  const closeSheet = () => setSheet(false);
  const showToast = (msg) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };
  const onSave = ({amount}) => {
    setSheet(false);
    showToast(amount ? `Saved ₹${amount}` : 'Saved expense');
  };

  // ===== overlay nav =====
  const openTx = (tx) => setOverlay({ kind:'tx', data: tx });
  const openGoal = (goal) => setOverlay({ kind:'goal', data: goal });
  const openCategory = (cat) => setOverlay({ kind:'category', data: cat });
  const closeOverlay = () => setOverlay(null);

  // Onboarding mode
  if (screen === 'onboarding') {
    return (
      <div className="phone app" style={{background:'var(--bg)'}}>
        <StatusBar/>
        <Onboarding onDone={() => { setScreen('home'); showToast('Welcome to Gexpense'); }}/>
      </div>
    );
  }

  // Empty mode
  if (emptyMode) {
    return (
      <div className="phone app" style={{background:'var(--bg)'}}>
        <StatusBar/>
        <div style={{position:'absolute', top:42, right:18, zIndex:30}}>
          <button onClick={() => setEmptyMode(false)} className="btn btn-ghost" style={{padding:'6px 10px', fontSize:11, fontWeight:600, background:'var(--surface)', border:'1px solid var(--line)'}}>← Exit</button>
        </div>
        <EmptyState kind={emptyMode} onAction={(a) => {
          if (a === 'connect') { setEmptyMode(false); setScreen('onboarding'); }
          else if (a === 'add') { setEmptyMode(false); setSheet(true); }
          else { setEmptyMode(false); }
        }}/>
        <TabBar active={screen} onChange={() => {}} onAdd={() => {}}/>
      </div>
    );
  }

  // Render base screen
  const renderScreen = () => {
    if (screen === 'home') return <Dashboard onAdd={onAdd} onNavigate={(s, preset) => {
      if (s === 'tx') return openTx(preset);
      if (s === 'settings' && preset === 'ai') { setScreen('settings'); setAiMode(true); setBudgetsMode(false); return; }
      if (s === 'settings' && preset === 'budgets') { setScreen('settings'); setBudgetsMode(true); setAiMode(false); return; }
      setScreen(s);
      if (preset !== undefined && typeof preset === 'string' && s === 'transactions') setTxPreset(preset);
    }}/>;
    if (screen === 'transactions') return <Transactions filterPreset={txPreset} onClearPreset={() => setTxPreset(null)} onTxOpen={openTx}/>;
    if (screen === 'insights') return <Insights onCategoryOpen={openCategory} onAIExplain={setAiExplain}/>;
    if (screen === 'settings') {
      if (aiMode) return <div onClick={(e) => { if (e.target.closest('.small') && e.target.textContent.includes('Settings')) setAiMode(false); }}><SettingsAI/></div>;
      if (budgetsMode) return <Budgets onBack={() => setBudgetsMode(false)} onGoalOpen={openGoal} onAddBudget={() => setOverlay({ kind:'addBudget' })}/>;
      return <SettingsWrapper theme={theme} onTheme={setTheme} onAi={() => setAiMode(true)} onBudgets={() => setBudgetsMode(true)} onOnboarding={() => setScreen('onboarding')} onEmpty={(k) => setEmptyMode(k)}/>;
    }
    return null;
  };

  return (
    <div className="phone app" style={{background:'var(--bg)'}}>
      <StatusBar/>
      {renderScreen()}
      <TabBar active={screen} onChange={(s) => { setScreen(s); if (s === 'settings') { setAiMode(false); setBudgetsMode(false); } if (s !== 'transactions') setTxPreset(null); }} onAdd={onAdd}/>

      {/* Quick add */}
      <div className={`scrim ${sheet ? 'open' : ''}`} onClick={closeSheet}/>
      <QuickAddSheet open={sheet} onClose={closeSheet} onSave={onSave}/>

      {/* Overlay screens (slide up from bottom, full surface) */}
      {overlay && (
        <div className="overlay-screen open">
          {overlay.kind === 'tx' && <TxDetail tx={overlay.data} onBack={closeOverlay} onSaved={(m) => { closeOverlay(); showToast(m); }} onDeleted={() => { closeOverlay(); showToast('Deleted'); }}/>}
          {overlay.kind === 'goal' && <GoalDetail goal={overlay.data} onBack={closeOverlay}/>}
          {overlay.kind === 'category' && <CategoryDetail cat={overlay.data} onBack={closeOverlay}/>}
          {overlay.kind === 'addBudget' && <AddBudget onBack={closeOverlay} onSave={(name) => { closeOverlay(); showToast(`Budget added · ${name}`); }}/>}
        </div>
      )}

      {/* AI Explain sheet */}
      {aiExplain && <AIExplain insight={aiExplain} onClose={() => setAiExplain(null)}/>}

      <div className={`toast ${toast ? 'show' : ''}`}>
        <span className="check"><Icon name="check" size={11} stroke={3}/></span>
        {toast || 'Saved'}
      </div>
    </div>
  );
};

// Wrap Settings to inject "AI Settings →" navigation
const SettingsWrapper = ({ theme, onTheme, onAi, onBudgets, onOnboarding, onEmpty }) => (
  <PatchedSettings theme={theme} onTheme={onTheme} onAi={onAi} onBudgets={onBudgets} onOnboarding={onOnboarding} onEmpty={onEmpty}/>
);

const PatchedSettings = ({ theme, onTheme, onAi, onBudgets, onOnboarding, onEmpty }) => {
  const [autoFetch, setAutoFetch] = useStateA(true);
  const [sms, setSms] = useStateA(true);
  const [notif, setNotif] = useStateA(true);

  return (
    <div className="scroll" data-screen-label="05 Settings">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div className="h2">Settings</div>
        </div>

        <div className="card fade-up fade-up-2" style={{padding:16, marginBottom:14}}>
          <div style={{display:'flex', alignItems:'center', gap:14}}>
            <div style={{width:56, height:56, borderRadius:'50%', background:'var(--brand-50)', color:'var(--brand)', display:'grid', placeItems:'center', fontSize:22, fontWeight:600, flexShrink:0}}>A</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontWeight:600, fontSize:15}}>Aman Sharma</div>
              <div className="small mono" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>aman@gmail.com</div>
            </div>
            <button className="btn btn-ghost" style={{padding:'8px 14px', fontSize:12}}>Edit</button>
          </div>
        </div>

        <div className="label" style={{margin:'14px 4px 8px'}}>Money</div>
        <div className="card fade-up fade-up-2b" style={{padding:0, marginBottom:14}}>
          <div onClick={onBudgets} style={{cursor:'pointer'}}>
            <Row icon="wallet" label="Budgets & goals" sub="6 categories · 3 goals · ₹17,820 left" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          </div>
          <Divider/>
          <Row icon="repeat" label="Recurring expenses" sub="9 active · ₹13,799/mo" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
        </div>

        <div className="label" style={{margin:'14px 4px 8px'}}>Auto-tracking</div>
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          <Row icon="mail" label="Gmail extraction" sub="Connected · aman@gmail.com" right={<Toggle on={autoFetch} onClick={() => setAutoFetch(!autoFetch)}/>}/>
          <Divider/>
          <Row icon="zap" label="SMS parsing" sub="Bank & UPI alerts" right={<Toggle on={sms} onClick={() => setSms(!sms)}/>}/>
          <Divider/>
          <div onClick={onAi} style={{cursor:'pointer'}}>
            <Row icon="sparkle" label="AI providers & test lab" sub="Claude · GPT · Gemini · Llama" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          </div>
        </div>

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

        <div className="label" style={{margin:'14px 4px 8px'}}>Demo flows</div>
        <div className="card fade-up fade-up-5" style={{padding:0, marginBottom:14}}>
          <div onClick={onOnboarding} style={{cursor:'pointer'}}>
            <Row icon="play" label="Replay onboarding" sub="See first-run flow" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          </div>
          <Divider/>
          <div onClick={() => onEmpty('activity')} style={{cursor:'pointer'}}>
            <Row icon="list" label="Empty · Activity" sub="No expenses yet" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          </div>
          <Divider/>
          <div onClick={() => onEmpty('goals')} style={{cursor:'pointer'}}>
            <Row icon="target" label="Empty · Goals" sub="No savings goals" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          </div>
          <Divider/>
          <div onClick={() => onEmpty('budgets')} style={{cursor:'pointer'}}>
            <Row icon="wallet" label="Empty · Budgets" sub="Set first budget" right={<Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}/>
          </div>
        </div>

        <div style={{textAlign:'center', margin:'14px 0 30px', display:'flex', flexDirection:'column', alignItems:'center', gap:8}}>
          <Monogram size={28} brand/>
          <div className="small mono">Gexpense v1.0 · made for fast hands</div>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { App });

