// @ts-nocheck
// App state split into three contexts to reduce cascading re-renders
const { useState, useEffect, useCallback, useRef } = React;

// ── ViewContext ──────────────────────────────────────────────────────────────

const ViewContext = React.createContext();

const ViewProvider = ({ children }) => {
  const [view, setView] = useState(() => localStorage.getItem("mf_view") || "inbox");
  const [selectedId, setSelectedId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [cachedViews, setCachedViews] = useState([view]);

  const setViewCached = useCallback((v) => {
    setView(v);
    setCachedViews(prev => {
      if (prev[0] === v) return prev;
      const next = [v, ...prev.filter(x => x !== v)];
      return next.slice(0, 3);
    });
  }, [setView, setCachedViews]);

  useHistory(view, setViewCached);

  useEffect(() => { localStorage.setItem("mf_view", view); }, [view]);

  useEffect(() => {
    window._goSettings = () => setViewCached("settings");
    window._goRecurring = () => setViewCached("recurring");
    window._goBudgets = () => setViewCached("budgets");
    return () => { delete window._goSettings; delete window._goRecurring; delete window._goBudgets; };
  }, [setViewCached]);

  return (
    <ViewContext.Provider value={{ view, setView: setViewCached, selectedId, setSelectedId, searchQuery, setSearchQuery }}>
      <ViewCacheContext.Provider value={{ cachedViews }}>
        {children}
      </ViewCacheContext.Provider>
    </ViewContext.Provider>
  );
};

// ── FilterContext ────────────────────────────────────────────────────────────

const FilterContext = React.createContext();

const FilterProvider = ({ children }) => {
  const { view } = React.useContext(ViewContext);
  const [inboxFilter, setInboxFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState(null);
  const [catOpen, setCatOpen] = useState(false);
  const catRef = useRef(null);
  const [dateRange, setDateRange] = useState(DateUtils.getCurrentMonthRange());
  const [inboxDateRange, setInboxDateRange] = useState(DateUtils.getAllTimeRange());
  const [activePreset, setActivePreset] = useState(null);
  const [tweaksOn, setTweaksOn] = useState(false);

  useEffect(() => {
    if (view !== "flow") return;
    setCategoryFilter(null);
  }, [view]);

  useEffect(() => {
    if (!catOpen) return;
    const onDown = (e) => {
      if (catRef.current && !catRef.current.contains(e.target)) setCatOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [catOpen]);

  return (
    <FilterContext.Provider value={{
      inboxFilter, setInboxFilter, categoryFilter, setCategoryFilter,
      dateRange, setDateRange, inboxDateRange, setInboxDateRange,
      activePreset, setActivePreset,
      catOpen, setCatOpen, catRef, tweaksOn, setTweaksOn,
    }}>
      {children}
    </FilterContext.Provider>
  );
};

// ── SyncContext ──────────────────────────────────────────────────────────────

const SyncContext = React.createContext();

const SyncProvider = ({ children, onLoadData }) => {
  const [syncStatus, setSyncStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [syncPanelDismissed, setSyncPanelDismissed] = useState(false);
  const [syncPanelPosition, setSyncPanelPosition] = useState(() => localStorage.getItem("mf_sync_panel_pos") || "bottom-right");

  useEffect(() => {
    API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
  }, []);

  useEffect(() => {
    const handler = (e) => setSyncPanelPosition(e.detail);
    window.addEventListener("sync-pos-change", handler);
    return () => window.removeEventListener("sync-pos-change", handler);
  }, []);

  const startPolling = useCallback(async (initialProgress) => {
    setSyncing(true);
    setSyncPanelDismissed(false);
    if (initialProgress) setSyncProgress(initialProgress);

    let started = !!initialProgress?.running;
    let attempts = 0;
    const MAX_ATTEMPTS = 480;
    const poll = setInterval(async () => {
      attempts++;
      try {
        const p = await API.get("/api/sync/progress");
        setSyncProgress(p);
        if (p.running) started = true;
        const done = !p.running && (started || p.phase === "error" || p.phase === "done");
        if (done) {
          clearInterval(poll);
          await onLoadData();
          API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
          setSyncing(false);
          return;
        }
        if (attempts >= MAX_ATTEMPTS) {
          clearInterval(poll);
          try {
            const finalP = await API.get("/api/sync/progress");
            if (finalP.phase === "done" || finalP.phase === "error") {
              setSyncProgress(finalP);
              await onLoadData();
              API.get("/api/sync/status").then(setSyncStatus).catch(() => {});
              setSyncing(false);
              return;
            }
          } catch (_) {}
          setSyncing(false);
          setSyncProgress(prev => prev ? { ...prev, phase: "error", error: "Sync timed out — please try again" } : null);
        }
      } catch (_) {
        if (attempts >= MAX_ATTEMPTS) { clearInterval(poll); setSyncing(false); }
      }
    }, 1200);
  }, [onLoadData]);

  useEffect(() => {
    API.get("/api/sync/progress").then(p => {
      if (p?.running) startPolling(p);
    }).catch(() => {});
  }, []);

  const handleRescan = async () => {
    if (syncing) return;
    setSyncing(true);
    setSyncPanelDismissed(false);
    setSyncProgress(null);
    try {
      await API.post("/api/sync/trigger");
      startPolling(null);
    } catch (e) {
      setSyncing(false);
      alert("Failed to start sync: " + (e.message || "Unknown error"));
    }
  };

  const syncLabel = () => {
    if (window.__mfLocalMode) return "Local";
    if (syncing) return "Syncing…";
    if (!syncStatus?.last_synced_at) return "Gmail · never";
    const diff = Math.floor((Date.now() - new Date(syncStatus.last_synced_at)) / 60000);
    if (diff < 1) return "Gmail · just now";
    if (diff < 60) return `Gmail · ${diff}m`;
    return `Gmail · ${Math.floor(diff / 60)}h`;
  };

  return (
    <SyncContext.Provider value={{
      syncStatus, setSyncStatus, syncing, setSyncing,
      syncProgress, setSyncProgress, syncPanelDismissed, setSyncPanelDismissed,
      syncPanelPosition, setSyncPanelPosition,
      startPolling, handleRescan, syncLabel,
    }}>
      {children}
    </SyncContext.Provider>
  );
};

(window as any).ViewContext = ViewContext;
(window as any).FilterContext = FilterContext;
(window as any).SyncContext = SyncContext;
(window as any).ViewProvider = ViewProvider;
(window as any).FilterProvider = FilterProvider;
(window as any).SyncProvider = SyncProvider;
