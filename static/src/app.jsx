// MoneyFlow — main app

const { useState, useEffect, useCallback } = React;

const App = () => {
  const [view, setView] = useState(() => localStorage.getItem("mf_view") || "inbox");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [inboxFilter, setInboxFilter] = useState("all");
  const [tweaksOn, setTweaksOn] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("mf_theme") || "paper");
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [account, setAccount] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [needsOnboarding, setNeedsOnboarding] = useState(false);
  const viewport = useViewport();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { localStorage.setItem("mf_view", view); }, [view]);
  useEffect(() => { localStorage.setItem("mf_theme", theme); }, [theme]);
  useEffect(() => { if (!viewport.isTablet) setNavOpen(false); }, [viewport.isTablet]);
  useEffect(() => {
    window._goSettings = () => setView("settings");
    return () => { delete window._goSettings; };
  }, [setView]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const now = new Date();
      const y = now.getFullYear();
      const mo = now.getMonth(); // 0-indexed
      const m = String(mo + 1).padStart(2, "0");
      const lastDay = new Date(y, mo + 1, 0).getDate();
      const dateFrom = `${y}-${m}-01`;
      const dateTo   = `${y}-${m}-${String(lastDay).padStart(2, "0")}`;

      // Last 7 days of previous month for income look-back
      const prevMonthLastDate = new Date(y, mo, 0);
      const prevMonthLastDay  = prevMonthLastDate.getDate();
      const prevY  = prevMonthLastDate.getFullYear();
      const prevM  = String(prevMonthLastDate.getMonth() + 1).padStart(2, "0");
      const prevWeekStart = String(Math.max(prevMonthLastDay - 6, 1)).padStart(2, "0");
      const incomeFrom = `${prevY}-${prevM}-${prevWeekStart}`;
      const incomeTo   = `${prevY}-${prevM}-${String(prevMonthLastDay).padStart(2, "0")}`;

      const [txRaw, incomeRaw] = await Promise.all([
        API.get(`/api/transactions?date_from=${dateFrom}&date_to=${dateTo}&offset=0&limit=1000`),
        API.get(`/api/transactions?date_from=${incomeFrom}&date_to=${incomeTo}&label=income&offset=0&limit=200`),
        API.get("/api/stats/summary"),
        API.get("/api/stats/category-breakdown"),
      ]);
      const currentMonth = txRaw.items.map(transformTransaction);
      const prevIncome   = incomeRaw.items.map(transformTransaction);
      const seen = new Set(currentMonth.map(t => t.id));
      const merged = [...currentMonth, ...prevIncome.filter(t => !seen.has(t.id))];
      setTransactions(merged);
      setTotalTransactions(txRaw.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const _loadingRef = React.useRef(false);
  const loadMore = async () => {
    if (_loadingRef.current) return;
    _loadingRef.current = true;
    setLoadingMore(true);
    try {
      const data = await API.get(`/api/transactions?offset=${transactions.length}&limit=200`);
      setTransactions(ts => {
        const seen = new Set(ts.map(t => t.id));
        return [...ts, ...data.items.map(transformTransaction).filter(t => !seen.has(t.id))];
      });
    } catch (_) {}
    _loadingRef.current = false;
    setLoadingMore(false);
  };

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
    API.get("/api/account/me")
      .then(data => { setAccount(data); setNeedsOnboarding(false); })
      .catch(err => {
        if ((err.message || "").startsWith("404")) setNeedsOnboarding(true);
      });
  }, []);

  // Tweaks panel edit-mode bridge
  useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === "__activate_edit_mode") setTweaksOn(true);
      if (e.data?.type === "__deactivate_edit_mode") setTweaksOn(false);
    };
    window.addEventListener("message", onMsg);
    window.parent?.postMessage({ type: "__edit_mode_available" }, "*");
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Apply theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "midnight") {
      root.style.setProperty("--paper", "#14120e");
      root.style.setProperty("--paper-2", "#1c1a15");
      root.style.setProperty("--ink", "#efe9d8");
      root.style.setProperty("--ink-2", "#c9c3b1");
      root.style.setProperty("--ink-3", "#8a857a");
      root.style.setProperty("--ink-4", "#595650");
      root.style.setProperty("--line", "#2a2720");
      root.style.setProperty("--card", "#1a1813");
    } else if (theme === "cool") {
      root.style.setProperty("--paper", "#f3f4f6");
      root.style.setProperty("--paper-2", "#e8eaee");
      root.style.setProperty("--ink", "#171923");
      root.style.setProperty("--ink-2", "#3a3d49");
      root.style.setProperty("--ink-3", "#6b6f7c");
      root.style.setProperty("--ink-4", "#9ca0ac");
      root.style.setProperty("--line", "#dcdee4");
      root.style.setProperty("--card", "#fbfcfd");
      root.style.setProperty("--accent", "#2563eb");
      root.style.setProperty("--accent-soft", "#dbe9fe");
    } else {
      root.style.setProperty("--paper", "#f6f3ec");
      root.style.setProperty("--paper-2", "#efeadf");
      root.style.setProperty("--ink", "#1a1814");
      root.style.setProperty("--ink-2", "#3d3a33");
      root.style.setProperty("--ink-3", "#78736a");
      root.style.setProperty("--ink-4", "#a8a297");
      root.style.setProperty("--line", "#e3dcca");
      root.style.setProperty("--card", "#fbf9f3");
      root.style.setProperty("--accent", "#c2410c");
      root.style.setProperty("--accent-soft", "#fde8d7");
    }
  }, [theme]);

  const handleRescan = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      await API.post("/api/sync/trigger");
      // Poll /sync/progress (real-time running flag) until sync completes.
      // Track whether sync has started so we don't bail on a stale "idle" state.
      let started = false;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const p = await API.get("/api/sync/progress");
          if (p.running) started = true;
          const done = !p.running && (started || p.phase === "error" || p.phase === "done");
          if (done || attempts >= 180) {  // 180 × 2s = 6-minute ceiling
            clearInterval(poll);
            await loadData();
            API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
            setSyncing(false);
          }
        } catch (_) {
          if (attempts >= 180) { clearInterval(poll); setSyncing(false); }
        }
      }, 2000);
    } catch (_) {
      setSyncing(false);
    }
  };

  const syncLabel = () => {
    if (syncing) return "Syncing…";
    if (!syncStatus?.last_synced_at) return "Gmail · never";
    const diff = Math.floor((Date.now() - new Date(syncStatus.last_synced_at)) / 60000);
    if (diff < 1) return "Gmail · just now";
    if (diff < 60) return `Gmail · ${diff}m`;
    return `Gmail · ${Math.floor(diff / 60)}h`;
  };

  const counts = {
    unread:   transactions.filter(t => !t.read).length,
    expense:  transactions.filter(t => t.amount < 0 && t.tag !== "subscription").length,
    income:   transactions.filter(t => t.amount > 0).length,
    sub:      transactions.filter(t => t.tag === "subscription").length,
    flagged:  transactions.filter(t => t.flag).length,
    payments: transactions.filter(t => t.amount < 0 && ["rent","util","sub"].includes(t.cat)).length,
  };

  const today = new Date();
  const monthYear = today.toLocaleString("en-US", { month: "long", year: "numeric" });

  const titles = {
    health:    { title: "Financial Health", sub: "runway · savings rate · monthly net" },
    inbox:     { title: "Inbox",          sub: `${monthYear} · ${transactions.length} emails parsed` },
    flow:      { title: "Money Flow",     sub: "how the month really unfolded" },
    dashboard: { title: "Dashboard",      sub: "one page, quick read" },
    reports:   { title: "Reports",        sub: "month-by-month" },
    recurring: { title: "Recurring",      sub: "subscriptions & fixed expenses" },
    debt:      { title: "Debt Reduction", sub: "track payoff progress" },
    profile:   { title: "Profile",        sub: "your account" },
    settings:  { title: "Settings",       sub: "preferences & integrations" },
    admin:     { title: "Admin",          sub: "service testing & diagnostics" },
    search:    { title: "Search",         sub: searchQuery ? `"${searchQuery}"` : "search your transactions" },
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:16 }}>
      <div style={{ width:32, height:32, border:"2px solid var(--line)", borderTopColor:"var(--accent)", borderRadius:"50%", animation:"spin 700ms linear infinite" }}/>
      <div style={{ fontSize:13, color:"var(--ink-3)", fontFamily:"'Fraunces',serif" }}>Loading your inbox…</div>
    </div>
  );

  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:12 }}>
      <div style={{ fontFamily:"'Fraunces',serif", fontSize:24, color:"var(--neg)" }}>Could not load data</div>
      <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:400, textAlign:"center" }}>{error}</div>
      <button onClick={loadData} style={{ marginTop:8, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer" }}>Retry</button>
    </div>
  );

  if (needsOnboarding) return (
    <OnboardingView onComplete={(data) => {
      setAccount(data);
      setNeedsOnboarding(false);
      setView("profile");
    }} />
  );

  return (
    <div style={{ ...shellStyles.app, ...(viewport.isTablet ? { display: "block" } : {}) }} data-screen-label={view}>
      <Sidebar
        view={view}
        setView={setView}
        counts={counts}
        filter={inboxFilter}
        onFilter={setInboxFilter}
        theme={theme}
        setTheme={setTheme}
        mobile={viewport.isTablet}
        open={!viewport.isTablet || navOpen}
        onClose={() => setNavOpen(false)}
      />
      <main style={shellStyles.main}>
        <Topbar title={titles[view]?.title || "Search"} subtitle={titles[view]?.sub || ""} syncLabel={syncLabel()} mobile={viewport.isMobile} showMenu={viewport.isTablet} onMenu={() => setNavOpen(true)} onSearchSelect={(id) => { setView("inbox"); setSelectedId(id); }} onSearchEnter={(q) => { setSearchQuery(q); setView("search"); }}>
          {!viewport.isMobile && <button style={shellStyles.topBtn}><Icon name="filter" size={13}/> Filter</button>}
          <button
            onClick={handleRescan}
            disabled={syncing}
            style={{ ...shellStyles.topBtn, ...shellStyles.topBtnPrimary, ...(viewport.isMobile ? { padding: "9px 10px" } : {}), opacity: syncing ? 0.65 : 1, cursor: syncing ? "default" : "pointer" }}
          >
            <Icon name="sparkle" size={13} stroke="currentColor"/>
            {!viewport.isMobile && (syncing ? "Scanning…" : "Re-scan")}
          </button>
        </Topbar>

        {view === "inbox" && (
          <InboxView
            transactions={transactions}
            setTransactions={setTransactions}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            filter={inboxFilter}
            setFilter={setInboxFilter}
            loadMore={loadMore}
            totalTransactions={totalTransactions}
            loadingMore={loadingMore}
          />
        )}
        {view === "search"    && <SearchView query={searchQuery}/>}
        {view === "flow"      && <FlowView transactions={transactions}/>}
        {view === "dashboard" && <DashboardView transactions={transactions}/>}
        {view === "health"    && <HealthView />}
        {view === "reports"   && <ReportsView />}
        {view === "recurring" && <RecurringView />}
        {view === "debt"      && <DebtView />}
        {view === "profile"   && <ProfileView transactions={transactions} account={account} setAccount={setAccount}/>}
        {view === "settings"  && <SettingsView syncStatus={syncStatus} onRescan={handleRescan} syncing={syncing} account={account} setAccount={setAccount}/>}
        {view === "admin"     && <AdminView />}
      </main>

      {tweaksOn && (
        <div className="tweaks-panel">
          <div style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:500, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
            <Icon name="sparkle" size={12} stroke="var(--accent)"/> Tweaks
          </div>
          <div style={{ fontSize:10, textTransform:"uppercase", color:"var(--ink-3)", letterSpacing:"0.1em", marginBottom:6 }}>Theme</div>
          <div style={{ display:"flex", gap:4, marginBottom:14 }}>
            {[["paper","Paper"],["cool","Cool"],["midnight","Midnight"]].map(([k,l])=>(
              <button key={k} onClick={()=>setTheme(k)} style={{ flex:1, padding:"6px 8px", borderRadius:4, border:"1px solid var(--line)", background:theme===k?"var(--ink)":"var(--card)", color:theme===k?"var(--paper)":"var(--ink-2)", fontSize:11, cursor:"pointer" }}>{l}</button>
            ))}
          </div>
          <div style={{ fontSize:10, textTransform:"uppercase", color:"var(--ink-3)", letterSpacing:"0.1em", marginBottom:6 }}>Jump to view</div>
          <div style={{ display:"flex", gap:4 }}>
            {[["inbox","Inbox"],["flow","Flow"],["dashboard","Dash"]].map(([k,l])=>(
              <button key={k} onClick={()=>setView(k)} style={{ flex:1, padding:"6px 8px", borderRadius:4, border:"1px solid var(--line)", background:view===k?"var(--accent)":"var(--card)", color:view===k?"white":"var(--ink-2)", fontSize:11, cursor:"pointer" }}>{l}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
