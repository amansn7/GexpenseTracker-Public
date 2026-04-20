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
  const [theme, setTheme] = useState("paper");
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => { localStorage.setItem("mf_view", view); }, [view]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [txRaw, summary, catBreakdown] = await Promise.all([
        API.get("/api/transactions?offset=0&limit=50"),
        API.get("/api/stats/summary"),
        API.get("/api/stats/category-breakdown"),
      ]);
      const txs = txRaw.items.map(transformTransaction);
      setTransactions(txs);
      setTotalTransactions(txRaw.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await API.get(`/api/transactions?offset=${transactions.length}&limit=50`);
      setTransactions(ts => [...ts, ...data.items.map(transformTransaction)]);
    } catch (_) {}
    setLoadingMore(false);
  };

  useEffect(() => { loadData(); }, [loadData]);

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
    unread:  transactions.filter(t => !t.read).length,
    expense: transactions.filter(t => t.amount < 0 && t.tag !== "subscription").length,
    income:  transactions.filter(t => t.amount > 0).length,
    sub:     transactions.filter(t => t.tag === "subscription").length,
    flagged: transactions.filter(t => t.flag).length,
  };

  const today = new Date();
  const monthYear = today.toLocaleString("en-US", { month: "long", year: "numeric" });

  const titles = {
    inbox:     { title: "Inbox",      sub: `${monthYear} · ${transactions.length} emails parsed` },
    flow:      { title: "Money Flow", sub: "how the month really unfolded" },
    dashboard: { title: "Dashboard",  sub: "one page, quick read" },
    profile:   { title: "Profile",    sub: "your account" },
    settings:  { title: "Settings",   sub: "preferences & integrations" },
    admin:     { title: "Admin",      sub: "service testing & diagnostics" },
  };

  if (loading) return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"center", height:"100vh", flexDirection:"column", gap:16 }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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

  return (
    <div style={shellStyles.app} data-screen-label={view}>
      <Sidebar view={view} setView={setView} counts={counts} filter={inboxFilter} onFilter={setInboxFilter} />
      <main style={shellStyles.main}>
        <Topbar title={titles[view].title} subtitle={titles[view].sub} syncLabel={syncLabel()}>
          <button style={shellStyles.topBtn}><Icon name="filter" size={13}/> Filter</button>
          <button
            onClick={handleRescan}
            disabled={syncing}
            style={{ ...shellStyles.topBtn, ...shellStyles.topBtnPrimary, opacity: syncing ? 0.65 : 1, cursor: syncing ? "default" : "pointer" }}
          >
            <Icon name="sparkle" size={13} stroke="currentColor"/>
            {syncing ? "Scanning…" : "Re-scan"}
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
        {view === "flow"      && <FlowView transactions={transactions}/>}
        {view === "dashboard" && <DashboardView transactions={transactions}/>}
        {view === "profile"   && <ProfileView transactions={transactions}/>}
        {view === "settings"  && <SettingsView syncStatus={syncStatus} onRescan={handleRescan} syncing={syncing}/>}
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
