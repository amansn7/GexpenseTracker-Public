// MoneyFlow — main app

const { useState, useEffect, useCallback, useRef } = React;

const _isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && window.innerWidth <= 768;

const MobileAppBanner = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!_isMobileDevice()) return;
    if (localStorage.getItem("mf_mobile_banner_dismissed")) return;
    // Don't show if already on the mobile app
    if (window.location.pathname === "/mobile") return;
    // Don't show if running as installed PWA
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    setVisible(true);
  }, []);

  const dismiss = () => {
    localStorage.setItem("mf_mobile_banner_dismissed", "1");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 9999,
      background: "var(--accent, #0F8A5F)", color: "#fff",
      padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.18)", fontFamily: "inherit",
    }}>
      <div style={{ flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>
        Get the mobile app experience
        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.88, marginTop: 1 }}>
          Faster, designed for your phone
        </div>
      </div>
      <a
        href="/mobile"
        style={{
          background: "#fff", color: "var(--accent, #0F8A5F)",
          borderRadius: 999, padding: "5px 14px",
          fontSize: 12, fontWeight: 700, textDecoration: "none",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        Open
      </a>
      <button
        onClick={dismiss}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "#fff", opacity: 0.75, padding: 4, display: "grid", placeItems: "center",
          flexShrink: 0,
        }}
        aria-label="Dismiss"
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
};

const App = () => {
  const [view, setView] = useState(() => localStorage.getItem("mf_view") || "inbox");
  const [transactions, setTransactions] = useState([]);
  const [reviewEmails, setReviewEmails] = React.useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [renderError, setRenderError] = useState(null);

  React.useEffect(() => {
    const onError = (e) => { console.error("Caught:", e.error || e); setRenderError(e.error?.message || e.message || "Something went wrong"); };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [inboxFilter, setInboxFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef(null);
  const [dateRange, setDateRange] = useState(DateUtils.getCurrentMonthRange());

  React.useEffect(() => {
    if (inboxFilter !== "review") return;
    API.get("/api/emails?status=review_pending")
      .then(data => setReviewEmails(data))
      .catch(() => {});
  }, [inboxFilter]);


  const [tweaksOn, setTweaksOn] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [theme, setTheme] = useState(() => localStorage.getItem("mf_theme") || "paper");
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncPanelDismissed, setSyncPanelDismissed] = useState(false);
  const [syncPanelPosition, setSyncPanelPosition] = useState(() => localStorage.getItem("mf_sync_panel_pos") || "bottom-right");
  const [account, setAccount] = useState(null);
  const [showSeedModal, setShowSeedModal] = React.useState(false);
  const [closingSeed, setClosingSeed] = React.useState(false);
  const closeSeed = () => { if (closingSeed) return; setClosingSeed(true); setTimeout(() => { setShowSeedModal(false); setClosingSeed(false); }, 150); };
  const [searchQuery, setSearchQuery] = useState("");
  const viewport = useViewport();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => { localStorage.setItem("mf_view", view); }, [view]);
  useEffect(() => { localStorage.setItem("mf_theme", theme); }, [theme]);
  useEffect(() => { if (!viewport.isTablet) setNavOpen(false); }, [viewport.isTablet]);
  useEffect(() => { if (view !== "flow") return; setCategoryFilter(null); }, [view]);
  useEffect(() => {
    window._goSettings = () => setView("settings");
    window._goRecurring = () => setView("recurring");
    window._goBudgets = () => setView("budgets");
    return () => { delete window._goSettings; delete window._goRecurring; delete window._goBudgets; };
  }, [setView]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ offset: 0, limit: 50 });
      if (dateRange.from) { params.append("date_from", dateRange.from); params.append("date_to", dateRange.to); }
      if (categoryFilter) params.append("category", categoryFilter);
      const txRaw = await API.get(`/api/transactions?${params}`);
      setTransactions(txRaw.items.map(transformTransaction));
      setTotalTransactions(txRaw.total);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [dateRange, categoryFilter]);

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
      if (dateRange.from) { params.append("date_from", dateRange.from); params.append("date_to", dateRange.to); }
      if (categoryFilter) params.append("category", categoryFilter);
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
          if (!data) return;
          setAccount(data);
          if (data.has_seed_data) setShowSeedModal(true);
          API.get("/api/account/me").then(bundle => {
            if (bundle) {
              setAccount(prev => ({ ...prev, ...bundle }));
              CategoryService.init(bundle);
            }
          }).catch(() => {});
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

  useEffect(() => {
    const handler = (e) => setSyncPanelPosition(e.detail);
    window.addEventListener("sync-pos-change", handler);
    return () => window.removeEventListener("sync-pos-change", handler);
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

  // Category dropdown click-outside
  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e) => {
      if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [catOpen]);

  // Apply theme
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const handleRescan = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncPanelDismissed(false);
    setSyncProgress(null);
    try {
      const trigger = await API.post("/api/sync/trigger");
      let started = false;
      let attempts = 0;
      const MAX_ATTEMPTS = 480; // 9.6 min at 1.2s interval — leaves 24s buffer for backend 600s timeout
      const poll = setInterval(async () => {
        attempts++;
        try {
          const p = await API.get("/api/sync/progress");
          setSyncProgress(p);
          if (p.running) started = true;
          const done = !p.running && (started || p.phase === "error" || p.phase === "done");
          if (done) {
            clearInterval(poll);
            await loadData();
            API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
            setSyncing(false);
            return;
          }
          if (attempts >= MAX_ATTEMPTS) {
            clearInterval(poll);
            // One final check — backend may have just finished
            try {
              const finalP = await API.get("/api/sync/progress");
              if (finalP.phase === "done" || finalP.phase === "error") {
                setSyncProgress(finalP);
                await loadData();
                API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
                setSyncing(false);
                return;
              }
            } catch (_) {}
            console.error("Sync polling timed out after", MAX_ATTEMPTS, "attempts");
            setSyncing(false);
            setSyncProgress(prev => prev ? { ...prev, phase: "error", error: "Sync timed out — please try again" } : null);
          }
        } catch (e) {
          console.error("Poll error:", e);
          if (attempts >= MAX_ATTEMPTS) { clearInterval(poll); setSyncing(false); }
        }
      }, 1200);
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

  const curCat = categoryFilter ? CategoryService.display(categoryFilter) : null;

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
    goals:     { title: "Goals",          sub: "track savings progress" },
    budgets:   { title: "Budgets",        sub: "monthly spend limits by category" },
    profile:   { title: "Profile",        sub: "your account" },
    settings:  { title: "Settings",       sub: "preferences & integrations" },
    admin:     { title: "Admin",          sub: "service testing & diagnostics" },
    search:    { title: "Search",         sub: searchQuery ? `"${searchQuery}"` : "search your transactions" },
    today:     { title: "Dashboard",      sub: "one page, quick read" },
    picture:   { title: "Money Flow",     sub: "how the month really unfolded" },
    review:    { title: "Review Queue",   sub: "transactions needing attention" },
  };

  return (
    <div style={{ ...shellStyles.app, ...(viewport.isTablet ? { display: "block" } : {}) }} data-screen-label={view}>
      <MobileAppBanner />
      <Sidebar
        view={view}
        setView={setView}
        counts={counts}
        filter={inboxFilter}
        onFilter={setInboxFilter}
        categoryFilter={categoryFilter}
        onCategoryFilter={setCategoryFilter}
        theme={theme}
        setTheme={setTheme}
        mobile={viewport.isTablet}
        open={!viewport.isTablet || navOpen}
        onClose={() => setNavOpen(false)}
        account={account}
      />
      <main role="main" tabIndex={-1} style={shellStyles.main}>
        <Topbar title={titles[view]?.title || "Search"} subtitle={titles[view]?.sub || ""} syncLabel={syncLabel()} mobile={viewport.isMobile} showMenu={viewport.isTablet} onMenu={() => setNavOpen(true)} onSearchSelect={(id) => { setView("inbox"); setSelectedId(id); }} onSearchEnter={(q) => { setSearchQuery(q); setView("search"); }}>
          <div ref={catRef} style={{ position: "relative" }}>
            <button
              onClick={() => setCatOpen(o => !o)}
              className="pill-btn"
              style={{ ...shellStyles.topBtn, cursor: "pointer" }}
              title={categoryFilter ? `Filter: ${curCat?.label || curCat?.name || categoryFilter}` : "Filter by category"}
            >
              {categoryFilter && curCat ? (
                <span style={{ width: 8, height: 8, borderRadius: 2, background: curCat.bg || curCat.color || "var(--ink-3)", flexShrink: 0 }} />
              ) : null}
              <span>{categoryFilter && curCat ? (curCat.label || curCat.name) : "All categories"}</span>
              <Icon name={catOpen ? "arrow-u" : "arrow-d"} size={11} stroke="var(--ink-3)" />
            </button>
            {catOpen && (
              <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, minWidth: 200, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 16px 40px -16px var(--shadow-lg)", zIndex: 999, padding: 6 }}>
                <button
                  onClick={() => { setCategoryFilter(null); setCatOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: !categoryFilter ? "var(--paper-2)" : "transparent", borderRadius: 5, cursor: "pointer", fontSize: 12, color: "var(--ink)", textAlign: "left", fontWeight: !categoryFilter ? 600 : 400 }}
                >All categories</button>
                {CategoryService.grouped().map(g => (
                  <div key={g.key}>
                    <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", padding: "6px 10px 2px", fontWeight: 500, borderTop: g.key !== "essentials" ? "1px solid var(--line)" : "none", marginTop: g.key !== "essentials" ? 4 : 0 }}>{g.label}</div>
                    {g.categories.map(item => (
                      <button key={item.key}
                        onClick={() => { setCategoryFilter(item.key); setCatOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", border: "none", background: categoryFilter === item.key ? "var(--paper-2)" : "transparent", borderRadius: 5, cursor: "pointer", fontSize: 12, color: "var(--ink)", textAlign: "left", fontWeight: categoryFilter === item.key ? 600 : 400 }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: item.bg, border: `1px solid ${item.ink}33`, flexShrink: 0 }} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleRescan}
            disabled={syncing}
            className="pill-btn"
            style={{ ...shellStyles.topBtn, ...shellStyles.topBtnPrimary, opacity: syncing ? 0.65 : 1, cursor: syncing ? "default" : "pointer" }}
          >
            <Icon name="sparkle" size={13} stroke="currentColor"/>
            {!viewport.isMobile && (syncing ? "Scanning\u2026" : "Re-scan")}
          </button>
        </Topbar>

        {error ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)" }}>
            <div style={{ fontFamily:"'Geist',sans-serif", fontSize:24, color:"var(--neg)" }}>Could not load data</div>
            <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:400, textAlign:"center" }}>{error}</div>
            <button onClick={loadData} style={{ marginTop:8, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Retry</button>
          </div>
        ) : renderError ? (
          <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)" }}>
            <div style={{ fontFamily:"'Geist',sans-serif", fontSize:24, color:"var(--neg)" }}>Something went wrong</div>
            <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:400, textAlign:"center" }}>{renderError}</div>
            <button onClick={() => { setRenderError(null); window.location.reload(); }} style={{ marginTop:8, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Reload</button>
          </div>
        ) : (
          <div className="view-enter" key={view}>
          {view === "inbox" && !loading && transactions.length === 0 && (
            <div style={{ display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)", textAlign:"center" }}>
              <div style={{ fontFamily:"'Geist',sans-serif", fontSize:22, color:"var(--ink)" }}>
                {totalTransactions > 0 ? `No ${inboxFilter === "all" ? "" : inboxFilter + " "}transactions found` : "Your inbox is quiet"}
              </div>
              <div style={{ fontSize:13, color:"var(--ink-3)", maxWidth:320 }}>
                {totalTransactions > 0
                  ? `No transactions match the "${inboxFilter}" filter. Try a different filter.`
                  : "Connect your Gmail account — MoneyFlow will read your purchase receipts and organize them automatically."}
              </div>
              {totalTransactions === 0 && (
                <button onClick={handleRescan} style={{ marginTop:4, padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>Connect Gmail</button>
              )}
            </div>
          )}
          {view === "inbox" && (transactions.length > 0 || loading) && (
            <InboxView
              transactions={transactions}
              setTransactions={setTransactions}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              filter={inboxFilter}
              setFilter={setInboxFilter}
              categoryFilter={categoryFilter}
              dateRange={dateRange}
              setDateRange={setDateRange}
              loadMore={loadMore}
              loadData={loadData}
              totalTransactions={totalTransactions}
              loadingMore={loadingMore}
              reviewEmails={reviewEmails}
              setReviewEmails={setReviewEmails}
            />
          )}
          {view === "search"    && <SearchView query={searchQuery} categoryFilter={categoryFilter}/>}
          {view === "flow"      && <FlowView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange} onNavigateToView={setView} onSetCategoryFilter={setCategoryFilter} onSetFilter={setInboxFilter} onSetDateRange={setDateRange}/>}
          {view === "dashboard" && <DashboardView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange}/>}
          {view === "health"    && <HealthView />}
          {view === "reports"   && <ReportsView />}
          {view === "recurring" && <RecurringView userCategories={account?.categories || []}/>}
          {view === "debt"      && <DebtView />}
          {view === "goals"     && <GoalsView />}
          {view === "budgets"   && <BudgetsView />}
          {view === "profile"   && (account ? <ProfileView transactions={transactions} account={account} setAccount={setAccount}/> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)"}}><div style={{fontSize:13,color:"var(--ink-3)"}}>Loading profile...</div></div>)}
          {view === "settings"  && (account ? <SettingsView syncStatus={syncStatus} setSyncStatus={setSyncStatus} onRescan={handleRescan} syncing={syncing} account={account} setAccount={setAccount}/> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)"}}><div style={{fontSize:13,color:"var(--ink-3)"}}>Loading settings...</div></div>)}
          {/* "new" mode nav aliases — route to nearest functional equivalent */}
          {view === "today"   && <DashboardView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange}/>}
          {view === "picture" && <FlowView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange}/>}
          {view === "review"  && <InboxView
              transactions={transactions}
              setTransactions={setTransactions}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              filter="review"
              setFilter={setInboxFilter}
              categoryFilter={categoryFilter}
              dateRange={dateRange}
              setDateRange={setDateRange}
              loadMore={loadMore}
              loadData={loadData}
              totalTransactions={totalTransactions}
              loadingMore={loadingMore}
              reviewEmails={reviewEmails}
              setReviewEmails={setReviewEmails}
            />}
          </div>
        )}
      </main>

      {showSeedModal && (
  <div className={closingSeed ? "backdrop-out" : "backdrop-in"} style={{ position:"fixed", inset:0, background:"var(--overlay)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}>
    <div className={closingSeed ? "modal-out" : "modal-in"} style={{ background:"var(--card)", border:"1px solid var(--line)", borderRadius:12, padding:"32px 36px", maxWidth:440, width:"90%", textAlign:"center" }}>
      <div style={{ fontFamily:"'Geist',sans-serif", fontSize:24, fontWeight:400, marginBottom:12 }}>Previous data found</div>
      <div style={{ fontSize:14, color:"var(--ink-3)", lineHeight:1.6, marginBottom:24 }}>
        We found existing transaction data from a previous setup. Import it into your account?
      </div>
      <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
        <button
          onClick={async () => {
            try {
              await API.post("/api/auth/claim-seed-data");
              closeSeed();
              loadData();
            } catch (_) {
              closeSeed();
            }
          }}
          style={{ padding:"10px 20px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Import my data</button>
        <button
          onClick={closeSeed}
          style={{ padding:"10px 20px", background:"var(--card)", color:"var(--ink-2)", border:"1px solid var(--line)", borderRadius:6, fontSize:13, cursor:"pointer", fontFamily:"inherit" }}
        >Start fresh</button>
      </div>
    </div>
  </div>
)}

      {tweaksOn && (
        <div className="tweaks-panel">
          <div style={{ fontFamily:"'Geist',sans-serif", fontSize:14, fontWeight:500, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
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

      {syncProgress && !syncPanelDismissed && (
        <SyncProgressOverlay
          progress={syncProgress}
          syncing={syncing}
          onClose={() => setSyncPanelDismissed(true)}
          onFullView={() => setView("settings")}
          position={syncPanelPosition}
        />
      )}

      {viewport.isMobile && (
        <BottomTabBar
          view={view}
          setView={setView}
          counts={counts}
          onMenu={() => setNavOpen(true)}
        />
      )}
    </div>
  );
};

(async () => {
  await API.init();
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
