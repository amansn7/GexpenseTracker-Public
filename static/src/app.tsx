// @ts-nocheck
// MoneyFlow — main app

const { useState, useEffect, useCallback, useRef, useMemo, useContext } = React;

// ── Dynamic chunk loader for code-split views ────────────────────────────────

const VIEW_CHUNKS = {
  flow: "flow", picture: "flow",
  dashboard: "dashboard", today: "dashboard",
  health: "health",
  reports: "reports",
  recurring: "recurring",
  debt: "debt",
  goals: "goals",
  budgets: "budgets",
  profile: "account", settings: "account",
  admin: "admin",
};

const _loadedChunks = new Set();
const supportsModules = "noModule" in HTMLScriptElement.prototype;

function loadChunkScript(name) {
  return new Promise((resolve) => {
    if (_loadedChunks.has(name)) { resolve(); return; }
    if (supportsModules) {
      const manifest = window.__mfChunksESM || {};
      const url = manifest[name];
      if (!url) { _loadedChunks.add(name); resolve(); return; }
      import(url).then(() => { _loadedChunks.add(name); resolve(); }).catch(() => { _loadedChunks.add(name); resolve(); });
      return;
    }
    const manifest = window.__mfChunks || {};
    const url = manifest[name];
    if (!url) { _loadedChunks.add(name); resolve(); return; }
    const existing = document.querySelector(`script[data-chunk="${name}"]`);
    if (existing) {
      existing.addEventListener("load", () => { _loadedChunks.add(name); resolve(); });
      existing.addEventListener("error", () => { _loadedChunks.add(name); resolve(); });
      return;
    }
    const script = document.createElement("script");
    script.src = url;
    script.dataset.chunk = name;
    script.onload = () => { _loadedChunks.add(name); resolve(); };
    script.onerror = () => { _loadedChunks.add(name); resolve(); };
    document.body.appendChild(script);
  });
}

const ViewChunkLoader = ({ view, children }) => {
  const chunk = VIEW_CHUNKS[view];
  const [ready, setReady] = React.useState(!chunk || _loadedChunks.has(chunk));

  React.useEffect(() => {
    if (!chunk) { setReady(true); return; }
    if (_loadedChunks.has(chunk)) { setReady(true); return; }
    loadChunkScript(chunk).then(() => setReady(true));
  }, [chunk]);

  if (!ready) {
    return React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "calc(100dvh - 72px)", color: "var(--ink-3)", fontSize: "0.8125rem",
      },
    }, "Loading\u2026");
  }

  return typeof children === "function" ? children() : children;
};

// ── End chunk loader ────────────────────────────────────────────────────────

const _isMobileDevice = () => /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) && window.innerWidth <= 768;

const LLMBudgetBanner = () => {
  const [budgetInfo, setBudgetInfo] = useState(null);
  useEffect(() => {
    API.get("/api/account/settings/user-llm-budget").then(setBudgetInfo).catch(() => {});
  }, []);
  if (!budgetInfo || !budgetInfo.exceeded || budgetInfo.tier === "unlimited") return null;
  const pct = budgetInfo.daily_budget_cents > 0
    ? Math.round((budgetInfo.spent_cents / budgetInfo.daily_budget_cents) * 100)
    : 100;
  return (
    <div style={{
      padding: "10px 16px", borderRadius: 8, marginBottom: 12,
      fontSize: "0.8125rem", lineHeight: 1.5,
      background: "var(--accent-soft)", color: "var(--accent)",
      border: "1px solid var(--accent)",
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
    }}>
      <Icon name="info" size={16} stroke="var(--accent)" />
      <span style={{ flex: 1, minWidth: 0 }}>
        <strong>LLM budget used: {pct}%</strong>
        {" \u2014 "}${(budgetInfo.spent_cents / 100).toFixed(2)} of ${(budgetInfo.daily_budget_cents / 100).toFixed(2)} today.
        Classification falling back to rules until budget resets at midnight UTC.
      </span>
      {budgetInfo.upgrade_url && (
        <a href={budgetInfo.upgrade_url}
          style={{ padding: "6px 14px", background: "var(--accent)", color: "var(--on-accent)", borderRadius: 6, fontSize: "0.75rem", fontWeight: 600, textDecoration: "none", whiteSpace: "nowrap" }}>
          Upgrade tier
        </a>
      )}
    </div>
  );
};

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
      background: "var(--accent, #0F8A5F)", color: "var(--on-accent)",
      padding: "10px 14px", display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 2px 8px rgba(0,0,0,0.18)", fontFamily: "inherit",
    }}>
      <div style={{ flex: 1, fontSize: "0.8125rem", fontWeight: 500, lineHeight: 1.35 }}>
        Get the mobile app experience
        <div style={{ fontSize: "0.6875rem", fontWeight: 400, opacity: 0.88, marginTop: 1 }}>
          Faster, designed for your phone
        </div>
      </div>
      <a
        href="/mobile"
        style={{
          background: "var(--paper)", color: "var(--accent, #0F8A5F)",
          borderRadius: 999, padding: "5px 14px",
          fontSize: "0.75rem", fontWeight: 700, textDecoration: "none",
          whiteSpace: "nowrap", flexShrink: 0,
        }}
      >
        Open
      </a>
      <button
        onClick={dismiss}
        style={{
          background: "transparent", border: "none", cursor: "pointer",
          color: "var(--on-accent)", opacity: 0.75, padding: 4, display: "grid", placeItems: "center",
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
  const { view, setView, selectedId, setSelectedId, searchQuery, setSearchQuery } = useContext(ViewContext);
  const { inboxFilter, setInboxFilter, categoryFilter, setCategoryFilter, dateRange, setDateRange, inboxDateRange, setInboxDateRange, catOpen, setCatOpen, catRef, tweaksOn, setTweaksOn } = useContext(FilterContext);
  const { syncStatus, setSyncStatus, syncing, syncProgress, syncPanelDismissed, setSyncPanelDismissed, syncPanelPosition, startPolling, handleRescan, syncLabel } = useContext(SyncContext);

  const [transactions, setTransactions] = useState([]);
  const [reviewEmails, setReviewEmails] = React.useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingTimeout, setLoadingTimeout] = useState(false);
  const [renderError, setRenderError] = useState(null);

  React.useEffect(() => {
    const splash = document.getElementById("app-splash");
    if (splash) splash.remove();
  }, []);

  React.useEffect(() => {
    const onError = (e) => { console.error("Caught:", e.error || e); setRenderError(e.error?.message || e.message || "Something went wrong"); };
    window.addEventListener("error", onError);
    return () => window.removeEventListener("error", onError);
  }, []);

  const [error, setError] = useState(null);

  React.useEffect(() => {
    API.get("/api/emails?status=review_pending")
      .then(data => setReviewEmails(data))
      .catch(() => {});
  }, [inboxFilter]);

  const [loadingMore, setLoadingMore] = useState(false);
  const [totalTransactions, setTotalTransactions] = useState(0);
  const [nextCursor, setNextCursor] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem("mf_theme") || "paper");
  const [systemDark, setSystemDark] = useState(() => {
    try { return window.matchMedia("(prefers-color-scheme: dark)").matches; } catch { return false; }
  });
  const [account, setAccount] = useState(null);
  const [showSeedModal, setShowSeedModal] = React.useState(false);
  const closeSeed = () => setShowSeedModal(false);
  const viewport = useViewport();
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (theme !== "auto") return;
    try {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      setSystemDark(mq.matches);
      const handler = (e) => setSystemDark(e.matches);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } catch {}
  }, [theme]);
  const resolvedTheme = theme === "auto" ? (systemDark ? "midnight" : "paper") : theme;
  useEffect(() => { localStorage.setItem("mf_theme", theme); }, [theme]);
  useEffect(() => { if (!viewport.isTablet) setNavOpen(false); }, [viewport.isTablet]);
  const effectiveDateRange = useMemo(() => view === "inbox" || view === "review" ? inboxDateRange : dateRange, [view, inboxDateRange, dateRange]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setNextCursor(null);
      const params = new URLSearchParams({ limit: 50 });
      if (effectiveDateRange.from && effectiveDateRange.to) { params.append("date_from", effectiveDateRange.from); params.append("date_to", effectiveDateRange.to); }
      if (categoryFilter) params.append("category", categoryFilter);
      const txRaw = await API.get(`/api/transactions?${params}`);
      setTransactions(txRaw.items.map(transformTransaction));
      setTotalTransactions(txRaw.total);
      if (txRaw.next_cursor) setNextCursor(txRaw.next_cursor);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [effectiveDateRange, categoryFilter]);

  useEffect(() => {
    window.__appLoadData = loadData;
    return () => { window.__appLoadData = undefined; };
  }, [loadData]);

  const _loadingRef = React.useRef(false);
  const loadMore = async () => {
    if (_loadingRef.current) return;
    _loadingRef.current = true;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({ limit: 50 });
      if (nextCursor) {
        params.append("cursor", nextCursor);
      } else {
        params.append("offset", transactions.length);
      }
      if (effectiveDateRange.from && effectiveDateRange.to) { params.append("date_from", effectiveDateRange.from); params.append("date_to", effectiveDateRange.to); }
      if (categoryFilter) params.append("category", categoryFilter);
      const data = await API.get(`/api/transactions?${params}`);
      setTransactions(ts => {
        const seen = new Set(ts.map(t => t.id));
        return [...ts, ...data.items.map(transformTransaction).filter(t => !seen.has(t.id))];
      });
      setTotalTransactions(data.total);
      if (data.next_cursor) setNextCursor(data.next_cursor); else setNextCursor(null);
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
          window._soundEffects = bundle?.settings?.sound_effects;
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
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  const counts = useMemo(() => ({
    unread:   transactions.filter(t => !t.read).length,
    expense:  transactions.filter(t => t.amount < 0 && t.tag !== "subscription").length,
    income:   transactions.filter(t => t.amount > 0).length,
    sub:      transactions.filter(t => t.tag === "subscription").length,
    flagged:  transactions.filter(t => t.flag).length,
    payments: transactions.filter(t => t.amount < 0 && ["rent","util","sub"].includes(t.cat)).length,
  }), [transactions]);

  const curCat = useMemo(() =>
    categoryFilter ? CategoryService.display(categoryFilter) : null,
    [categoryFilter]
  );

  const today = new Date();
  const monthYear = today.toLocaleString("en-US", { month: "long", year: "numeric" });

  const titles = useMemo(() => ({
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
  }), [transactions.length, searchQuery]);

  const mainRef = React.useRef(null);
  const prevViewRef = React.useRef(view);
  const navOrders = ["inbox", "flow", "dashboard"];
  const [swipeNavX, setSwipeNavX] = React.useState(0);
  const [swipeNavActive, setSwipeNavActive] = React.useState(false);
  const swipeNavStartX = React.useRef(0);
  const swipeNavStartY = React.useRef(0);
  const swipeNavActivated = React.useRef(false);

  const handleSwipeNavStart = (e) => {
    if (!viewport.isMobile) return;
    swipeNavStartX.current = e.touches[0].clientX;
    swipeNavStartY.current = e.touches[0].clientY;
    swipeNavActivated.current = false;
    setSwipeNavX(0);
    setSwipeNavActive(false);
  };

  const handleSwipeNavMove = (e) => {
    if (!viewport.isMobile) return;
    if (!swipeNavActivated.current) {
      var ddx = e.touches[0].clientX - swipeNavStartX.current;
      var ddy = Math.abs(e.touches[0].clientY - swipeNavStartY.current);
      if (Math.abs(ddx) > 10 && Math.abs(ddx) > ddy * 1.5) {
        swipeNavActivated.current = true;
        setSwipeNavActive(true);
      }
      return;
    }
    var dx = e.touches[0].clientX - swipeNavStartX.current;
    setSwipeNavX(dx);
  };

  const handleSwipeNavEnd = () => {
    if (!viewport.isMobile || !swipeNavActivated.current) return;
    var curIdx = navOrders.indexOf(view);
    if (swipeNavX < -80 && curIdx >= 0 && curIdx < navOrders.length - 1) {
      setViewCached(navOrders[curIdx + 1]);
    } else if (swipeNavX > 80 && curIdx > 0) {
      setViewCached(navOrders[curIdx - 1]);
    }
    setSwipeNavX(0);
    setSwipeNavActive(false);
    swipeNavActivated.current = false;
  };

  React.useEffect(() => {
    if (view !== prevViewRef.current) {
      prevViewRef.current = view;
      if (mainRef.current) mainRef.current.focus();
    }
  }, [view]);

  const [online, setOnline] = useState(navigator.onLine);
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  useEffect(() => {
    const onOnline = () => { setOnline(true); setShowBackOnline(true); setTimeout(() => setShowBackOnline(false), 3000); };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []);

  useEffect(() => {
    const handler = () => setSwUpdateReady(true);
    document.addEventListener("sw-update-ready", handler);
    if (window.__swUpdateAvailable) setSwUpdateReady(true);
    return () => document.removeEventListener("sw-update-ready", handler);
  }, []);

  const handleSwRefresh = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
          navigator.serviceWorker.addEventListener('controllerchange', () => {
            window.location.reload();
          });
        }
      });
    }
  };

  return (
    <div style={{ ...shellStyles.app, ...(viewport.isTablet ? { display: "block" } : {}) }} data-screen-label={view}>
      <MobileAppBanner />
      {!online && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
          background: "#f59e0b", color: "#1a1814",
          padding: "10px 14px", textAlign: "center",
          fontSize: "0.8125rem", fontWeight: 500, fontFamily: "inherit",
        }}>
          You're offline. Some features may be unavailable.
        </div>
      )}
      {showBackOnline && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 9998,
          background: "var(--pos, #0F8A5F)", color: "#fff",
          padding: "10px 14px", textAlign: "center",
          fontSize: "0.8125rem", fontWeight: 500, fontFamily: "inherit",
          animation: "fadeIn 200ms ease-out",
        }}>
          Back online!
        </div>
      )}
      {swUpdateReady && (
        <div style={{
          position: "fixed", bottom: 80, left: "50%", transform: "translateX(-50%)",
          zIndex: 9999, background: "var(--card)", color: "var(--ink)",
          border: "1px solid var(--line)", borderRadius: 10,
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 8px 24px var(--shadow-lg)",
          fontSize: "0.8125rem", fontFamily: "inherit",
          animation: "fadeIn 200ms ease-out",
        }}>
          <span>A new version is available</span>
          <button onClick={handleSwRefresh}
            style={{
              padding: "6px 14px", background: "var(--accent)", color: "var(--on-accent)",
              border: "none", borderRadius: 6, cursor: "pointer",
              fontSize: "0.75rem", fontWeight: 600, fontFamily: "inherit",
              whiteSpace: "nowrap",
            }}
          >Refresh</button>
        </div>
      )}
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
      <main ref={mainRef} role="main" tabIndex={-1} className="main-content" style={shellStyles.main}>
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
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "none", background: !categoryFilter ? "var(--paper-2)" : "transparent", borderRadius: 5, cursor: "pointer", fontSize: "0.75rem", color: "var(--ink)", textAlign: "left", fontWeight: !categoryFilter ? 600 : 400 }}
                >All categories</button>
                {CategoryService.grouped().map(g => (
                  <div key={g.key}>
                    <div style={{ fontSize: "0.5625rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", padding: "6px 10px 2px", fontWeight: 500, borderTop: g.key !== "essentials" ? "1px solid var(--line)" : "none", marginTop: g.key !== "essentials" ? 4 : 0 }}>{g.label}</div>
                    {g.categories.map(item => (
                      <button key={item.key}
                        onClick={() => { setCategoryFilter(item.key); setCatOpen(false); }}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", border: "none", background: categoryFilter === item.key ? "var(--paper-2)" : "transparent", borderRadius: 5, cursor: "pointer", fontSize: "0.75rem", color: "var(--ink)", textAlign: "left", fontWeight: categoryFilter === item.key ? 600 : 400 }}
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

        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", ...(viewport.isMobile ? { touchAction: "pan-y" } : {}) }}
          onTouchStart={viewport.isMobile ? handleSwipeNavStart : undefined}
          onTouchMove={viewport.isMobile ? handleSwipeNavMove : undefined}
          onTouchEnd={viewport.isMobile ? handleSwipeNavEnd : undefined}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", minHeight: 0,
          transform: swipeNavActive ? "translateX(" + swipeNavX + "px)" : "",
          transition: swipeNavActive ? "none" : "transform 0.25s ease",
        }}>
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
          <ErrorBoundary>
          <ViewSlot view="inbox" activeView={view}>{
            !loading && transactions.length === 0 ? (
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
            ) : (
              <div>
                <LLMBudgetBanner />
                <InboxView
                  transactions={transactions}
                  setTransactions={setTransactions}
                  selectedId={selectedId}
                  setSelectedId={setSelectedId}
                  filter={inboxFilter}
                  setFilter={setInboxFilter}
                  categoryFilter={categoryFilter}
                  dateRange={inboxDateRange}
                  setDateRange={setInboxDateRange}
                  loadMore={loadMore}
                  loadData={loadData}
                  totalTransactions={totalTransactions}
                  loadingMore={loadingMore}
                  reviewEmails={reviewEmails}
                  setReviewEmails={setReviewEmails}
                />
              </div>
            )
          }</ViewSlot>
          <ViewSlot view="search" activeView={view}><SearchView query={searchQuery} categoryFilter={categoryFilter}/></ViewSlot>
          <ViewSlot view="flow" activeView={view}><ViewChunkLoader view="flow">{() => <FlowView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange} onNavigateToView={setView} onSetCategoryFilter={setCategoryFilter} onSetFilter={setInboxFilter} onSetDateRange={setDateRange} onSetInboxDateRange={setInboxDateRange}/>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="dashboard" activeView={view}><ViewChunkLoader view="dashboard">{() => <DashboardView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange}/>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="health" activeView={view}><ViewChunkLoader view="health">{() => <HealthView />}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="reports" activeView={view}><ViewChunkLoader view="reports">{() => <ReportsView />}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="recurring" activeView={view}><ViewChunkLoader view="recurring">{() => <RecurringView userCategories={account?.categories || []}/>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="debt" activeView={view}><ViewChunkLoader view="debt">{() => <DebtView />}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="goals" activeView={view}><ViewChunkLoader view="goals">{() => <GoalsView />}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="budgets" activeView={view}><ViewChunkLoader view="budgets">{() => <BudgetsView />}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="profile" activeView={view}><ViewChunkLoader view="profile">{() => account ? <ProfileView transactions={transactions} account={account} setAccount={setAccount}/> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)"}}><div style={{fontSize:13,color:"var(--ink-3)"}}>Loading profile...</div></div>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="settings" activeView={view}><ViewChunkLoader view="settings">{() => account ? <SettingsView syncStatus={syncStatus} setSyncStatus={setSyncStatus} onRescan={handleRescan} syncing={syncing} account={account} setAccount={setAccount} theme={theme} setTheme={setTheme}/> : <div style={{display:"flex",alignItems:"center",justifyContent:"center",height: viewport.isMobile ? mobileStyles.navOffset : "calc(100dvh - 72px)"}}><div style={{fontSize:13,color:"var(--ink-3)"}}>Loading settings...</div></div>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="today" activeView={view}><ViewChunkLoader view="dashboard">{() => <DashboardView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange}/>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="picture" activeView={view}><ViewChunkLoader view="flow">{() => <FlowView transactions={transactions} categoryFilter={categoryFilter} dateRange={dateRange} setDateRange={setDateRange}/>}</ViewChunkLoader></ViewSlot>
          <ViewSlot view="review" activeView={view}><InboxView
              transactions={transactions}
              setTransactions={setTransactions}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              filter="review"
              setFilter={setInboxFilter}
              categoryFilter={categoryFilter}
              dateRange={inboxDateRange}
              setDateRange={setInboxDateRange}
              loadMore={loadMore}
              loadData={loadData}
              totalTransactions={totalTransactions}
              loadingMore={loadingMore}
              reviewEmails={reviewEmails}
              setReviewEmails={setReviewEmails}
            /></ViewSlot>
          </ErrorBoundary>
        )}
        </div>
        </div>
      </main>

      {showSeedModal && (
  <Modal open onClose={closeSeed} width={440}>
    <div style={{ textAlign:"center" }}>
      <div style={{ fontFamily:"'Geist',sans-serif", fontSize:24, fontWeight:400, marginBottom:12 }}>Previous data found</div>
      <div style={{ fontSize:14, color:"var(--ink-3)", lineHeight:1.6, marginBottom:24 }}>
        We found existing transaction data from a previous setup. Import it into your account?
      </div>
      <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
        <Button onClick={async () => {
          try { await API.post("/api/auth/claim-seed-data"); closeSeed(); loadData(); }
          catch (_) { closeSeed(); }
        }}>Import my data</Button>
        <Button onClick={closeSeed} variant="ghost">Start fresh</Button>
      </div>
    </div>
  </Modal>
)}

      {tweaksOn && (
        <div className="tweaks-panel">
          <div style={{ fontFamily:"'Geist',sans-serif", fontSize:14, fontWeight:500, marginBottom:10, display:"flex", alignItems:"center", gap:6 }}>
            <Icon name="sparkle" size={12} stroke="var(--accent)"/> Tweaks
          </div>
          <div style={{ fontSize:10, textTransform:"uppercase", color:"var(--ink-3)", letterSpacing:"0.1em", marginBottom:6 }}>Theme</div>
          <div role="radiogroup" aria-label="Theme" style={{ display:"flex", gap:4, marginBottom:14 }}>
            {[["paper","Paper"],["cool","Cool"],["midnight","Midnight"]].map(([k,l])=>(
              <button key={k} role="radio" aria-checked={theme===k} onClick={()=>{ window.hapticLight?.(); setTheme(k); }} style={{ flex:1, padding:"6px 8px", borderRadius:4, border:"1px solid var(--line)", background:theme===k?"var(--ink)":"var(--card)", color:theme===k?"var(--paper)":"var(--ink-2)", fontSize:11, cursor:"pointer", outline:"none", transition:"background 120ms ease, color 120ms ease" }}
                onFocus={e=>{e.currentTarget.style.boxShadow="0 0 0 2px var(--accent)"}}
                onBlur={e=>{e.currentTarget.style.boxShadow="none"}}>{l}</button>
            ))}
          </div>
          <div style={{ fontSize:10, textTransform:"uppercase", color:"var(--ink-3)", letterSpacing:"0.1em", marginBottom:6 }}>Jump to view</div>
          <div role="radiogroup" aria-label="Jump to view" style={{ display:"flex", gap:4 }}>
            {[["inbox","Inbox"],["flow","Flow"],["dashboard","Dash"]].map(([k,l])=>(
              <button key={k} role="radio" aria-checked={view===k} onClick={()=>{ window.hapticLight?.(); setView(k); }} style={{ flex:1, padding:"6px 8px", borderRadius:4, border:"1px solid var(--line)", background:view===k?"var(--accent)":"var(--card)", color:view===k?"white":"var(--ink-2)", fontSize:11, cursor:"pointer", outline:"none", transition:"background 120ms ease, color 120ms ease" }}
                onFocus={e=>{e.currentTarget.style.boxShadow="0 0 0 2px var(--accent)"}}
                onBlur={e=>{e.currentTarget.style.boxShadow="none"}}>{l}</button>
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
  if (window.__mfBooting) return;
  window.__mfBooting = true;
  await API.init();

  // Preload default view chunks in parallel with auth check
  const preloadPromise = Promise.all([
    loadChunkScript("inbox"),
    loadChunkScript("onboarding"),
  ]);

  let showOnboarding = !!localStorage.getItem("mf_onboarding_step");
  let showPasskeyChallenge = false;
  let showTotpChallenge = false;
  let accountData = null;

  try {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    if (res.ok) {
      accountData = await res.json();
      if (accountData.onboarding_complete) {
        showOnboarding = false;
        localStorage.removeItem("mf_onboarding_step");
      } else {
        showOnboarding = true;
      }
    } else if (res.status === 401) {
      const body = await res.json();
      if (body?.detail?.passkey_pending) {
        showPasskeyChallenge = true;
        showOnboarding = false;
      } else if (body?.detail?.totp_pending) {
        showTotpChallenge = true;
        showOnboarding = false;
      } else {
        showOnboarding = true;
      }
    }
  } catch (_) {}

  let Root;
  if (showPasskeyChallenge) {
    Root = PasskeyChallenge;
  } else if (showTotpChallenge) {
    Root = TotpChallenge;
  } else if (showOnboarding) {
    const WizardWithData = () => React.createElement(OnboardingWizard, { accountData });
    Root = WizardWithData;
  } else {
    const AppWithProviders = () => (
      <ViewProvider>
        <FilterProvider>
          <SyncProvider onLoadData={() => window.__appLoadData?.()}>
            <App />
          </SyncProvider>
        </FilterProvider>
      </ViewProvider>
    );
    Root = AppWithProviders;
  }
  // Ensure lazy chunks are loaded before mounting
  await preloadPromise;
  ReactDOM.createRoot(document.getElementById("root")).render(React.createElement(Root));
})();
