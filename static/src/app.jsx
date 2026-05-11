// MoneyFlow — main app

const { useState, useEffect, useCallback } = React;

const App = () => {
  const [view, setView] = useState(() => localStorage.getItem("mf_view") || "inbox");
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [renderError, setRenderError] = useState(null);

  React.useEffect(() => {
    const onError = (e) => { setRenderError(e.error?.message || "Something went wrong"); };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [inboxFilter, setInboxFilter] = useState("all");
  const [dateRange, setDateRange] = useState({ from: null, to: null }); // null = current month
  const [tweaksOn, setTweaksOn] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("mf_theme") || "paper");
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [account, setAccount] = useState(null);
  const [showSeedModal, setShowSeedModal] = React.useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const viewport = useViewport();
  const [navOpen, setNavOpen] = useState(false);

  // Helper to get current month range
  const getCurrentMonthRange = () => {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: first.toISOString().split("T")[0], to: last.toISOString().split("T")[0] };
  };

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
      const params = new URLSearchParams({ offset: 0, limit: 50 });
      const labelMap = { expenses: "expense", income: "income" };
      const apiLabel = labelMap[inboxFilter] || (inboxFilter === "all" ? null : inboxFilter);
      if (apiLabel) params.append("label", apiLabel);
      const range = dateRange.from !== null ? (dateRange.from ? dateRange : getCurrentMonthRange()) : null;
      if (range) { params.append("date_from", range.from); params.append("date_to", range.to); }
      const txRaw = await API.get(`/api/transactions?${params}`);
      setTransactions(txRaw.items.map(transformTransaction));
      setTotalTransactions(txRaw.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [inboxFilter, dateRange]);

  const _loadingRef = React.useRef(false);
  const loadMore = async () => {
    if (_loadingRef.current) return;
    _loadingRef.current = true;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        offset: transactions.length,
        limit: 50,
      });
      const labelMap = { expenses: "expense", income: "income" };
      const apiLabel = labelMap[inboxFilter] || (inboxFilter === "all" ? null : inboxFilter);
      if (apiLabel) params.append("label", apiLabel);
      const range = dateRange.from !== null ? (dateRange.from ? dateRange : getCurrentMonthRange()) : null;
      if (range) { params.append("date_from", range.from); params.append("date_to", range.to); }
      const data = await API.get(`/api/transactions?${params}`);
      setTransactions(ts => {
        const seen = new Set(ts.map(t => t.id));
        return [...ts, ...data.items.map(transformTransaction).filter(t => !seen.has(t.id))];
      });
      setTotalTransactions(data.total);
    } catch (_) {}
    _loadingRef.current = false;
    setLoadingMore(false);
  };

  useEffect(() => {
    loadData();
    const timer = setTimeout(() => { if (loading) setLoadingTimeout(true); }, 10000);
    return () => clearTimeout(timer);
  }, [loadData]);

  useEffect(() => {
    const loadAccount = () => {
      API.get("/api/auth/me")
        .then(data => {
          if (!data) return; // 401 redirect in flight
          setAccount(data);
          if (data.has_seed_data) setShowSeedModal(true);
        })
        .catch(() => {});
    };
    loadAccount();
    const timer = setTimeout(loadAccount, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
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
      const trigger = await API.post("/api/sync/trigger");
      console.log("Sync triggered:", trigger);
      let started = false;
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const p = await API.get("/api/sync/progress");
          console.log("Sync progress:", p);
          if (p.running) started = true;
          const done = !p.running && (started || p.phase === "error" || p.phase === "done");
          if (done || attempts >= 180) {
            clearInterval(poll);
            await loadData();
            API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
            setSyncing(false);
          }
        } catch (e) {
          console.error("Poll error:", e);
          if (attempts >= 180) { clearInterval(poll); setSyncing(false); }
        }
      }, 2000);
    } catch (e) {
      console.error("Sync trigger error:", e);
      alert("Failed to start sync: " + (e.message || "Unknown error"));
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
    inbox:     { title: "Inbox",          sub: `${transactions.length} emails parsed` },
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
      {loadingTimeout && <button onClick={() => window.location.reload()} style={{ marginTop:8, padding:"8px 16px", background:"var(--paper-2)", color:"var(--ink-2)", border:"1px solid var(--line)", borderRadius:6, fontSize:12, cursor:"pointer" }}>Reload page</button>}
    </div>
  );

  if (error) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:12 }}>
      <div style={{ fontFamily:"'Fraunces',serif", fontSize:24, color:"var(--neg)" }}>Could not load data</div>
      <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:400, textAlign:"center" }}>{error}</div>
      <button onClick={loadData} style={{ marginTop:8, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer" }}>Retry</button>
    </div>
  );

  if (renderError) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:12 }}>
      <div style={{ fontFamily:"'Fraunces',serif", fontSize:24, color:"var(--neg)" }}>Something went wrong</div>
      <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:400, textAlign:"center" }}>{renderError}</div>
      <button onClick={() => { setRenderError(null); window.location.reload(); }} style={{ marginTop:8, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer" }}>Reload</button>
    </div>
  );

  if (!loading && view === "inbox" && transactions.length === 0) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:12 }}>
      <div style={{ fontFamily:"'Fraunces',serif", fontSize:24, color:"var(--ink)" }}>No transactions yet</div>
      <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:400, textAlign:"center" }}>Connect your Gmail account to start tracking your spending.</div>
      <button onClick={handleRescan} style={{ marginTop:8, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer" }}>Sync now</button>
    </div>
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
        account={account}
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
            dateRange={dateRange}
            setDateRange={setDateRange}
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
        {view === "profile"   && (account ? <ProfileView transactions={transactions} account={account} setAccount={setAccount}/> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"calc(100vh - 72px)"}}><div style={{fontSize:13,color:"var(--ink-3)"}}>Loading profile...</div></div>)}
        {view === "settings"  && (account ? <SettingsView syncStatus={syncStatus} setSyncStatus={setSyncStatus} onRescan={handleRescan} syncing={syncing} account={account} setAccount={setAccount}/> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"calc(100vh - 72px)"}}><div style={{fontSize:13,color:"var(--ink-3)"}}>Loading settings...</div></div>)}
      </main>

      {showSeedModal && (
  <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
    <div style={{ background:"var(--card)", border:"1px solid var(--line)", borderRadius:12, padding:"32px 36px", maxWidth:440, width:"90%", textAlign:"center" }}>
      <div style={{ fontFamily:"'Fraunces',serif", fontSize:24, fontWeight:400, marginBottom:12 }}>Previous data found</div>
      <div style={{ fontSize:14, color:"var(--ink-3)", lineHeight:1.6, marginBottom:24 }}>
        We found existing transaction data from a previous setup. Import it into your account?
      </div>
      <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
        <button
          onClick={async () => {
            try {
              await API.post("/api/auth/claim-seed-data");
              setShowSeedModal(false);
              loadData();
            } catch (_) {
              setShowSeedModal(false);
            }
          }}
          style={{ padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Import my data</button>
        <button
          onClick={() => setShowSeedModal(false)}
          style={{ padding:"10px 20px", background:"var(--card)", color:"var(--ink-2)", border:"1px solid var(--line)", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Start fresh</button>
      </div>
    </div>
  </div>
)}

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

(async () => {
  let showOnboarding = !!localStorage.getItem("mf_onboarding_step");
  if (!showOnboarding) {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        showOnboarding = !data.onboarding_complete;
      } else if (res.status === 401) {
        showOnboarding = true;
      }
    } catch (_) {}
  }
  ReactDOM.createRoot(document.getElementById("root")).render(
    showOnboarding ? React.createElement(OnboardingWizard) : React.createElement(App)
  );
})();
