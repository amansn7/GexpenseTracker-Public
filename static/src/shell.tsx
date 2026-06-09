// @ts-nocheck
// Shell — sidebar nav, topbar, layout

const _dotCls = ["dot-ping", "dot-bounce", "dot-glow"];
const LiveDot = ({ style }) => {
  const [cls, setCls] = React.useState(() => _dotCls[Math.floor(Math.random() * _dotCls.length)]);
  React.useEffect(() => {
    const t = setTimeout(() => setCls(prev => {
      const rest = _dotCls.filter(c => c !== prev);
      return rest[Math.floor(Math.random() * rest.length)];
    }), 3000 + Math.random() * 2000);
    return () => clearTimeout(t);
  }, [cls]);
  return <span className={cls} style={style} />;
};

const _brandQuirks = ["squish", "shake", "split", "boing"];
const LiveBrand = ({ onNav, mobile, onClose }) => {
  const [quirk, setQuirk] = React.useState(null);
  const busy = quirk !== null;
  const handleClick = () => {
    if (busy) return;
    const next = _brandQuirks[Math.floor(Math.random() * _brandQuirks.length)];
    setQuirk(next);
    setTimeout(() => { setQuirk(null); onNav(); }, 700);
  };
  const split = quirk === "split";
  return (
    <div style={shellStyles.brand}>
      <div onClick={handleClick} className={!split && quirk ? "brand-quirk-" + quirk : ""} style={{ position: "relative", cursor: "pointer", display: "flex", alignItems: "baseline", gap: 8, padding: "6px 0" }}>
        <span className={split ? "brand-quirk-split-left" : ""} style={shellStyles.brandMark}>Money</span>
        <span className={"brand-accent" + (split ? " brand-quirk-split-right" : "")} style={{ ...shellStyles.brandMark, color: "var(--accent)", fontStyle: "italic" }}>flow</span>
      </div>
      {mobile && (
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="focus-ring btn-press" aria-label="Close navigation" style={{ marginLeft: "auto", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", borderRadius: 6, padding: 8, display: "grid", placeItems: "center" }}>
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
};

const mobileStyles = {
  topbarHeight: 48,
  tabBarHeight: 56,
  navOffset: "calc(100dvh - 48px - 56px)",
  topbarMobile: { padding: "8px 14px", gap: 8, minHeight: 48, flexWrap: "wrap" },
  tabBar: {
    position: "fixed", bottom: 0, left: 0, right: 0, height: 56,
    background: "var(--paper)", borderTop: "1px solid var(--line)",
    display: "flex", alignItems: "center", zIndex: 60,
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  tabItem: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: 2, padding: "4px 0", border: "none", background: "transparent", cursor: "pointer",
    fontSize: "0.5625rem", fontWeight: 500, letterSpacing: "0.03em",
    minHeight: 44, fontFamily: "inherit",
  },
  badged: { position: "relative" },
  badge: {
    position: "absolute", top: -2, right: -8,
    background: "var(--accent)", color: "var(--paper)",
    fontSize: "0.5625rem", fontWeight: 700, borderRadius: 999,
    padding: "1px 4px", minWidth: 16, textAlign: "center",
    lineHeight: "14px",
  },
};

var bottomSheetStyles = {
  overlay: {
    position: "fixed", inset: 0, zIndex: 9999,
    background: "var(--overlay)",
    display: "flex", alignItems: "flex-end", justifyContent: "center"
  },
  sheet: {
    position: "relative",
    width: "100%", maxWidth: 500,
    maxHeight: "min(70vh, 420px)",
    background: "var(--card)",
    borderTopLeftRadius: 12, borderTopRightRadius: 12,
    padding: "4px 0 max(24px, env(safe-area-inset-bottom, 0px))",
    overflowY: "auto",
    boxShadow: "0 -8px 32px -8px var(--shadow-lg)",
    transform: "translateY(0)",
    transition: "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)"
  },
  handle: {
    width: 32, height: 4,
    borderRadius: 2,
    background: "var(--ink-3)",
    margin: "8px auto 12px",
    opacity: 0.5,
    flexShrink: 0
  },
  content: {
    padding: "0 16px"
  },
  footer: {
    padding: "16px",
    borderTop: "1px solid var(--line)",
    display: "flex", gap: 8,
    justifyContent: "flex-end"
  }
};

const useViewport = () => {
  const read = () => ({
    width: window.innerWidth,
    isMobile: window.innerWidth < 720,
    isTablet: window.innerWidth < 900,
  });
  const [viewport, setViewport] = React.useState(read);
  React.useEffect(() => {
    const onResize = () => setViewport(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return viewport;
};

const shellStyles = {
  app: { display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100dvh" },
  side: { borderRight: "1px solid var(--line)", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 1, position: "sticky", top: 0, height: "100dvh", background: "var(--paper)", overflowY: "auto" },
  brand: { display: "flex", alignItems: "baseline", gap: 8, padding: "4px 4px 24px" },
  brandMark: { fontFamily: "'Geist', sans-serif", fontSize: "1.625rem", fontWeight: 500, letterSpacing: "-0.03em", color: "var(--ink)" },
  brandSlash: { color: "var(--accent)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: "1.25rem" },
  navItem: { display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 8px", borderRadius: 6, color: "var(--ink-2)", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", border: "none", textAlign: "left", width: "100%" },
  navItemActive: { background: "var(--paper-2)", color: "var(--ink)" },
  navCount: { marginLeft: "auto", fontSize: "0.6875rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" },
  sectionLabel: { fontSize: "0.6875rem", letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)", padding: "14px 8px 4px", fontWeight: 600 },
  sideFooter: { borderTop: "1px solid var(--line)", padding: "10px 8px 4px", display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 999, background: "var(--cat-travel)", color: "var(--cat-travel-ink)", display: "grid", placeItems: "center", fontSize: "0.75rem", fontWeight: 600, fontFamily: "'Geist', sans-serif" },
  main: { display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { display: "flex", alignItems: "center", gap: 14, padding: "16px 28px", borderBottom: "1px solid var(--line)", background: "var(--paper)", position: "sticky", top: 0, zIndex: 10, minHeight: 72 },
  search: { flex: 1, maxWidth: 420, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink-3)" },
  searchInput: { flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: "0.8125rem" },
  kbd: { fontFamily: "'Geist Mono', monospace", fontSize: "0.625rem", padding: "2px 6px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--ink-3)" },
  topBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: "0.6875rem", fontWeight: 600, whiteSpace: "nowrap" },
  topBtnPrimary: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },
  connected: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: "0.6875rem", fontWeight: 600, whiteSpace: "nowrap" },
  connectedDot: { display: "inline-block", width: 6, height: 6, borderRadius: 999, background: "var(--pos)", flexShrink: 0 },
};

const _navHints = {
  inbox: "View all parsed transactions",
  flow: "Monthly income vs expense breakdown",
  dashboard: "Spending overview at a glance",
  health: "Financial health metrics & runway",
  reports: "Month-by-month spending reports",
  recurring: "Subscriptions & fixed expenses",
  debt: "Track debt payoff progress",
  dot: "Filter by transaction type",
  star: "Show flagged transactions",
  "arrow-swap": "Show recurring payments (rent, utilities, subs)",
};

const NavItem = React.memo(({ icon, label, count, active, onClick }) => (
  <button title={_navHints[icon] || label} className={"focus-ring nav-btn btn-press" + (active ? " active" : "")} style={{ ...shellStyles.navItem, ...(active ? shellStyles.navItemActive : {}) }} onClick={() => { window.hapticLight?.(); onClick?.(); }}>
    <Icon name={icon} size={14} />
    <span>{label}</span>
    {count != null && <span style={shellStyles.navCount}>{count}</span>}
  </button>
));

const Sidebar = ({ view, setView, mode = "classic", setMode = () => {}, counts, filter, onFilter, categoryFilter, onCategoryFilter, theme, setTheme, mobile = false, open = true, onClose = () => {}, account }) => {
  const [menu, setMenu] = React.useState(false);
  const [viewsOpen, setViewsOpen] = React.useState(() => localStorage.getItem("_nav_views") !== "0");
  const [filtersOpen, setFiltersOpen] = React.useState(() => localStorage.getItem("_nav_filters") !== "0");
  const [catsOpen, setCatsOpen] = React.useState(() => localStorage.getItem("_nav_cats") !== "0");
  const [menuPos, setMenuPos] = React.useState(null);
  const triggerRef = React.useRef(null);
  const sideStyle = mobile
    ? { ...shellStyles.side, position: "fixed", top: 0, left: 0, bottom: 0, width: 284, maxWidth: "86vw", height: "100dvh", zIndex: 70, boxShadow: "18px 0 48px -24px var(--shadow-lg)", transform: open ? "translateX(0)" : "translateX(-105%)", transition: "transform 180ms ease", overflowY: "auto" }
    : shellStyles.side;
  const navigate = (fn) => {
    fn();
    if (mobile) onClose();
  };

  const openMenu = () => {
    if (menu) { setMenu(false); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      setMenuPos({ bottom: window.innerHeight - rect.top + 8, left: rect.left, width: rect.width });
    }
    setMenu(true);
  };

  const AccountMenu = ({ settingsView }) => (
    <div className="fade-in" style={{ position: "fixed", bottom: menuPos ? menuPos.bottom : 0, left: menuPos ? menuPos.left : 0, width: menuPos ? menuPos.width : 220, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, boxShadow: "0 16px 30px -16px var(--shadow-md)", zIndex: 120 }}>
      <button onClick={()=>{ setView("profile"); setMenu(false); }} className="hover-bg" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)", textAlign: "left" }}
      >
        <Icon name="user" size={14}/> Profile
      </button>
      <button onClick={()=>{ setView(settingsView); setMenu(false); }} className="hover-bg" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)", textAlign: "left" }}
      >
        <Icon name="gear" size={14}/> Settings
      </button>
      <div style={{ height: 1, background: "var(--line)", margin: "4px 4px" }}/>
      <button
        onClick={async () => {
          await API.post("/api/auth/logout");
          window.location.href = "/login";
        }}
        className="hover-bg"
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", borderRadius: 6, cursor: "pointer", fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink-3)", textAlign: "left" }}
      >
        <Icon name="arrow-u-r" size={14}/> Sign out
      </button>
    </div>
  );

  const AccountTrigger = () => (
    <button
      ref={triggerRef}
      onClick={openMenu}
      className="focus-ring hover-bg"
      aria-expanded={menu}
      aria-haspopup="menu"
      aria-label="Account menu"
      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 8px", border: "none", background: menu ? "var(--paper-2)" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "background 120ms ease" }}
    >
      {account?.avatar_url
        ? <img src={account.avatar_url} alt={`${account?.name || account?.email}'s avatar`} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
        : <div style={shellStyles.avatar}>{(account?.name || account?.email || "?")[0].toUpperCase()}</div>
      }
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink)" }}>{account?.name || account?.email || "—"}</div>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{account?.email || ""}</div>
      </div>
      <Icon name="arrow-d" size={12} stroke="var(--ink-3)" />
    </button>
  );

  // New mode sidebar
  if (mode === "new") {
    return (
    <>
    {mobile && open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 70 }} />}
    <aside role="navigation" aria-label="Main navigation" style={sideStyle} aria-hidden={mobile && !open}>
      <LiveBrand onNav={() => navigate(() => setView("today"))} mobile={mobile} onClose={onClose} />

      {/* New mode nav items */}
      <NavItem icon="sun"    label="Today"     active={view==="today"}     onClick={()=>navigate(()=>setView("today"))} />
      <NavItem icon="inbox"  label="Review"    count={counts?.unread > 0 ? counts.unread : null} active={view==="review"} onClick={()=>navigate(()=>setView("review"))} />
      <NavItem icon="chart"  label="Picture"   active={view==="picture"}   onClick={()=>navigate(()=>setView("picture"))} />
      <NavItem icon="repeat" label="Recurring" active={view==="recurring"} onClick={()=>navigate(()=>setView("recurring"))} />
      <NavItem icon="trending-down" label="Debt"    active={view==="debt"}    onClick={()=>navigate(()=>setView("debt"))} />
      <NavItem icon="trend-u"       label="Goals"   active={view==="goals"}   onClick={()=>navigate(()=>setView("goals"))} />
      <NavItem icon="bank"          label="Budgets" active={view==="budgets"} onClick={()=>navigate(()=>setView("budgets"))} />

      {/* Mode toggle */}
      <div style={{ marginTop: "auto", padding: "12px 8px", borderTop: "1px solid var(--line)" }}>
        <button
          onClick={() => setMode("classic")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink-2)", fontSize: "0.75rem", cursor: "pointer" }}
        >
          <Icon name="grid" size={14} />
          <span>Switch to Classic</span>
        </button>
      </div>

      {/* Account menu */}
      <div style={{ padding: "4px 8px 8px" }}>
        <AccountTrigger />
        {menu && (
          <>
            <div onClick={()=>setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
            <AccountMenu settingsView="settings-new" />
          </>
        )}
      </div>
    </aside>
    </>
    );
  }
  return (
  <>
  {mobile && open && <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 70 }} />}
  <aside role="navigation" aria-label="Main navigation" style={sideStyle} aria-hidden={mobile && !open}>
    <LiveBrand onNav={() => navigate(() => setView("inbox"))} mobile={mobile} onClose={onClose} />

    <div onClick={() => { const n = !viewsOpen; setViewsOpen(n); localStorage.setItem("_nav_views", n ? "1" : "0"); }}
      style={{ ...shellStyles.sectionLabel, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
      <Icon name={viewsOpen ? "chevron-d" : "chevron-r"} size={10} stroke="var(--ink-4)" style={{ transition: "transform 120ms var(--ease-out-quart)" }}/> Views
    </div>
    {viewsOpen && <>
    <NavItem icon="inbox"   label="Inbox"       count={counts.unread}  active={view==="inbox"}     onClick={()=>navigate(()=>setView("inbox"))} />
    <NavItem icon="flow"    label="Money Flow"                          active={view==="flow"}      onClick={()=>navigate(()=>setView("flow"))} />
    <NavItem icon="dash"    label="Dashboard"                           active={view==="dashboard"} onClick={()=>navigate(()=>setView("dashboard"))} />
    <NavItem icon="heart"   label="Health"                              active={view==="health"}    onClick={()=>navigate(()=>setView("health"))} />
    <NavItem icon="chart"   label="Reports"                             active={view==="reports"}   onClick={()=>navigate(()=>setView("reports"))} />
    <NavItem icon="repeat"  label="Recurring"                           active={view==="recurring"} onClick={()=>navigate(()=>setView("recurring"))} />
    <NavItem icon="trending-down" label="Debt"                          active={view==="debt"}      onClick={()=>navigate(()=>setView("debt"))} />
    <NavItem icon="trend-u"       label="Goals"                          active={view==="goals"}     onClick={()=>navigate(()=>setView("goals"))} />
    <NavItem icon="bank"          label="Budgets"                        active={view==="budgets"}   onClick={()=>navigate(()=>setView("budgets"))} />
    </>}

    <div onClick={() => { const n = !filtersOpen; setFiltersOpen(n); localStorage.setItem("_nav_filters", n ? "1" : "0"); }}
      style={{ ...shellStyles.sectionLabel, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
      <Icon name={filtersOpen ? "chevron-d" : "chevron-r"} size={10} stroke="var(--ink-4)" style={{ transition: "transform 120ms var(--ease-out-quart)" }}/> Filters
    </div>
    {filtersOpen && <>
    <NavItem icon="dot"  label="Expenses"      count={counts.expense} active={view==="inbox"&&filter==="expenses"}      onClick={()=>navigate(()=>{ setView("inbox"); onFilter("expenses"); })} />
    <NavItem icon="dot"  label="Income"        count={counts.income}  active={view==="inbox"&&filter==="income"}         onClick={()=>navigate(()=>{ setView("inbox"); onFilter("income"); })} />
    <NavItem icon="dot"  label="Subscriptions" count={counts.sub}     active={view==="inbox"&&filter==="sub"}            onClick={()=>navigate(()=>{ setView("inbox"); onFilter("sub"); })} />
    <NavItem icon="star"       label="Flagged"  count={counts.flagged}  active={view==="inbox"&&filter==="flagged"}   onClick={()=>navigate(()=>{ setView("inbox"); onFilter("flagged"); })} />
    <NavItem icon="arrow-swap" label="Payments" count={counts.payments} active={view==="inbox"&&filter==="payments"} onClick={()=>navigate(()=>{ setView("inbox"); onFilter("payments"); })} />
    </>}

    <div onClick={() => { const n = !catsOpen; setCatsOpen(n); localStorage.setItem("_nav_cats", n ? "1" : "0"); }}
      style={{ ...shellStyles.sectionLabel, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
      <Icon name={catsOpen ? "chevron-d" : "chevron-r"} size={10} stroke="var(--ink-4)" style={{ transition: "transform 120ms var(--ease-out-quart)" }}/> Categories
    </div>
    {catsOpen && CategoryService.grouped().map(g => (
      <div key={g.key}>
        {g.key !== "_user" && (
          <div style={{ fontSize: "0.5625rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", padding: "4px 10px 2px", fontWeight: 500 }}>{g.label}</div>
        )}
        {g.categories.map(item => (
          <button key={item.key} className={"focus-ring nav-btn" + ((view==="inbox"&&filter==="cat:"+item.key) || categoryFilter===item.key ? " active" : "")}
            onClick={()=>navigate(()=>{ setView("inbox"); onFilter("all"); onCategoryFilter && onCategoryFilter(item.key); })}
            style={{ ...shellStyles.navItem, ...((view==="inbox"&&filter==="cat:"+item.key) || categoryFilter===item.key ? shellStyles.navItemActive : {}) }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: item.bg, border: `1px solid ${item.ink}22`, flexShrink: 0 }} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    ))}

    <div style={{ padding: "4px 8px 8px", marginTop: "auto" }}>
      <AccountTrigger />
      {menu && (
        <>
          <div onClick={()=>setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
          <AccountMenu settingsView="settings" />
        </>
      )}
    </div>
  </aside>
  </>
);
};

const SearchBar = ({ mobile, onSelect, onEnter }) => {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  React.useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const handleChange = (e) => {
    const q = e.target.value;
    setQuery(q);
    clearTimeout(timerRef.current);
    if (!q.trim() || q.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const data = await API.get(`/api/search?q=${encodeURIComponent(q.trim())}&limit=15`);
        setResults(data.items || []);
        setOpen(true);
      } catch (_) {}
      setBusy(false);
    }, 280);
  };

  const fmtAmt = (tx) => {
    if (tx.amount == null) return null;
    const isIncome = tx.label === "income";
    return (isIncome ? "+" : "−") + window.formatMoney(Math.abs(tx.amount));
  };

  const handleSelect = (tx) => {
    setOpen(false);
    setQuery("");
    onSelect && onSelect(tx.id);
  };

  return (
    <div ref={wrapRef} role="search" style={{ ...shellStyles.search, ...(mobile ? { order: 3, flexBasis: "100%", maxWidth: "none" } : {}), position: "relative" }}>
      <Icon name="search" size={14} />
      <input
        ref={inputRef}
        style={shellStyles.searchInput}
        aria-label="Search transactions"
        placeholder="Search merchants, amounts, categories…"
        value={query}
        onChange={handleChange}
        onFocus={() => { if (results.length > 0) setOpen(true); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim().length >= 2) {
            setOpen(false);
            onEnter && onEnter(query.trim());
          }
          if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); }
        }}
        autoComplete="off"
        spellCheck={false}
      />
      {busy && <div style={{ width: 12, height: 12, border: "1.5px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 600ms linear infinite", flexShrink: 0 }} />}
      {!mobile && !busy && <span style={shellStyles.kbd}>⌘K</span>}
      {open && results.length > 0 && (
        <div className="fade-in" role="listbox" aria-live="polite" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 16px 40px -16px var(--shadow-lg)", zIndex: 999, maxHeight: 380, overflowY: "auto" }}>
          <div style={{ padding: "6px 12px 4px", fontSize: "0.625rem", color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>Results</div>
            {results.map((tx, i) => (
            <button key={tx.id} className="hover-row fade-in" onClick={() => handleSelect(tx)}
              style={{ "--i": i, background: "transparent", display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 14px", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--line)", textAlign: "left", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.merchant || tx.email?.subject || "(no merchant)"}
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 }}>
                  {[tx.category, tx.txn_date || tx.email?.received_at?.slice(0, 10)].filter(Boolean).join(" · ")}
                </div>
              </div>
              {fmtAmt(tx) && (
                <span style={{ fontSize: "0.8125rem", fontFamily: "'Geist Mono', monospace", fontFeatureSettings: "'tnum'", color: tx.label === "income" ? "var(--pos)" : "var(--neg)", fontWeight: 500, flexShrink: 0 }}>
                  {fmtAmt(tx)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !busy && query.trim().length >= 2 && (
        <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 16px 40px -16px var(--shadow-lg)", zIndex: 999, padding: "14px 14px", fontSize: "0.8125rem", color: "var(--ink-3)", textAlign: "center" }}>
          No results for "{query}"
        </div>
      )}
    </div>
  );
};

const Topbar = ({ title, subtitle, children, syncLabel, mobile = false, showMenu = mobile, onMenu = () => {}, onSearchSelect, onSearchEnter }) => (
  <header style={{ ...shellStyles.topbar, ...(mobile ? { padding: "8px 14px", gap: 8, minHeight: 48, flexWrap: "wrap" } : {}) }}>
    {showMenu && (
      <button onClick={onMenu} className="focus-ring" aria-label="Open navigation" style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", borderRadius: 6, width: 36, height: 36, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="menu" size={16} />
      </button>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 1, marginRight: mobile ? 0 : 16, minWidth: 0, flex: mobile ? "1 1 120px" : "0 0 auto" }}>
      <h1 className="serif" style={{ margin: 0, fontSize: mobile ? 17 : 22, fontWeight: 500, letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
      {subtitle && !mobile && <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
    </div>
    <SearchBar mobile={mobile} onSelect={onSearchSelect} onEnter={onSearchEnter} />
    <div style={{ flex: "0 0 auto", marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
      {children}
      <div style={{ ...shellStyles.connected, ...(mobile ? { display: "none" } : {}) }}>
        <LiveDot style={shellStyles.connectedDot} />
        <span style={{ whiteSpace: "nowrap" }}>{syncLabel || "Gmail"}</span>
      </div>
    </div>
  </header>
);

const BottomTabBar = ({ view, setView, counts, onMenu }) => {
  const tabs = [
    { key: "inbox", icon: "inbox", label: "Inbox", badge: counts?.unread },
    { key: "flow", icon: "flow", label: "Flow" },
    { key: "dashboard", icon: "dash", label: "Dash" },
    { key: "more", icon: "grid", label: "More" },
    { key: "settings", icon: "gear", label: "Settings" },
  ];
  const [moreOpen, setMoreOpen] = React.useState(false);
  const moreRef = React.useRef(null);

  React.useEffect(() => {
    if (!moreOpen) return;
    const onDown = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) setMoreOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [moreOpen]);

  const extendedViews = [
    { key: "health", icon: "heart", label: "Health" },
    { key: "reports", icon: "chart", label: "Reports" },
    { key: "recurring", icon: "repeat", label: "Recurring" },
    { key: "debt", icon: "trending-down", label: "Debt" },
    { key: "goals", icon: "trend-u", label: "Goals" },
    { key: "budgets", icon: "bank", label: "Budgets" },
    { key: "profile", icon: "user", label: "Profile" },
  ];

  const isMore = !["inbox","flow","dashboard","settings"].includes(view);

  const handleTab = (key) => {
    window.hapticLight?.();
    if (key === "more") { setMoreOpen(o => !o); return; }
    setMoreOpen(false);
    setView(key);
  };

  return (
    <>
    <nav style={mobileStyles.tabBar} role="tablist" aria-label="Main navigation">
      {tabs.map(t => {
        const active = t.key === "more" ? isMore : view === t.key;
        return (
          <button key={t.key} role="tab" aria-selected={active}
            onClick={() => handleTab(t.key)}
            style={{ ...mobileStyles.tabItem, color: active ? "var(--accent)" : "var(--ink-3)" }}
          >
            <span style={mobileStyles.badged}>
              <Icon name={t.icon} size={18} stroke={active ? "var(--accent)" : "var(--ink-3)"} />
              {t.badge > 0 && <span style={mobileStyles.badge}>{t.badge > 99 ? "99+" : t.badge}</span>}
            </span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
    {moreOpen && (
      <div ref={moreRef} className="fade-in"
        style={{
          position: "fixed", bottom: 56, left: 0, right: 0,
          background: "var(--card)", borderTop: "1px solid var(--line)",
          borderBottom: "1px solid var(--line)",
          padding: "8px 14px", zIndex: 59,
          display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4,
          paddingBottom: "calc(8px + env(safe-area-inset-bottom, 0px))",
        }}
      >
        {extendedViews.map(v => (
          <button key={v.key} onClick={() => { setMoreOpen(false); setView(v.key); }}
            style={{
              ...mobileStyles.tabItem, gap: 4, padding: "8px 4px", borderRadius: 6,
              color: view === v.key ? "var(--accent)" : "var(--ink-2)",
              background: view === v.key ? "var(--accent-soft)" : "transparent",
            }}
          >
            <Icon name={v.icon} size={16} stroke={view === v.key ? "var(--accent)" : "var(--ink-3)"} />
            <span>{v.label}</span>
          </button>
        ))}
      </div>
    )}
    </>
  );
};

const _calSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
const _dateInputStyle = {
  border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px 5px 26px",
  fontSize: "0.75rem", background: "var(--card)", color: "var(--ink)",
  outline: "none", fontFamily: "inherit", boxSizing: "border-box",
  minWidth: 130, WebkitAppearance: "none" as any,
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(_calSvg)}")`,
  backgroundRepeat: "no-repeat", backgroundPosition: "6px center", backgroundSize: "13px",
};

const _presetBase = {
  padding: "4px 11px", borderRadius: 999, border: "1px solid var(--line)",
  fontSize: "0.6875rem", fontWeight: 600, cursor: "pointer", outline: "none",
  fontFamily: "'Geist', sans-serif", letterSpacing: "0.01em" as const,
  transition: "background 140ms ease, color 140ms ease, border-color 140ms ease, box-shadow 140ms ease",
};

const DateRangeControl = ({ rangeFrom, rangeTo, activePreset, onChange }) => {
  const fmt = d => { const off = d.getTimezoneOffset() * 60000; return new Date(d - off).toISOString().slice(0, 10); };
  const presets = [
    ["all", "All", null],
    ["7d", "7d", 7],
    ["30d", "30d", 30],
    ["90d", "90d", 90],
    ["1y", "1y", 365],
  ];
  const noFilter = !rangeFrom && !rangeTo;
  return (
    <div role="radiogroup" aria-label="Date range" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      {presets.map(([label, display, days]) => (
        <button
          key={label}
          role="radio" aria-checked={activePreset === label}
          onClick={() => {
            if (!days) { onChange(null, null, label); return; }
            const end = new Date();
            const start = new Date(); start.setDate(end.getDate() - days + 1);
            onChange(fmt(start), fmt(end), label);
          }}
          className="btn-press"
          style={{
            ..._presetBase,
            background: activePreset === label ? "var(--accent)" : "var(--card)",
            color: activePreset === label ? "var(--on-accent)" : "var(--ink-2)",
            borderColor: activePreset === label ? "var(--accent)" : "var(--line)",
            boxShadow: activePreset === label ? "0 1px 3px var(--shadow-sm)" : "none",
          }}
          onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
          onBlur={e => { if (activePreset !== label) e.currentTarget.style.boxShadow = "none"; }}
        >{display}</button>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
        <div style={{ width: 1, height: 20, background: "var(--line)", marginRight: 2 }} />
        <input
          type="date"
          aria-label="Start date"
          value={rangeFrom || ""}
          max={rangeTo || undefined}
          onChange={e => onChange(e.target.value || null, rangeTo, null)}
          style={{ ..._dateInputStyle, opacity: noFilter ? 0.35 : 1, pointerEvents: noFilter ? "none" as any : "auto" as any }}
          disabled={noFilter}
        />
        <span aria-hidden="true" style={{ color: "var(--ink-4)", fontSize: "0.625rem", fontWeight: 500, margin: "0 1px" }}>→</span>
        <input
          type="date"
          aria-label="End date"
          value={rangeTo || ""}
          min={rangeFrom || undefined}
          onChange={e => onChange(rangeFrom, e.target.value || null, null)}
          style={{ ..._dateInputStyle, opacity: noFilter ? 0.35 : 1, pointerEvents: noFilter ? "none" as any : "auto" as any }}
          disabled={noFilter}
        />
      </div>
    </div>
  );
};

Object.assign(window as any, { Sidebar, Topbar, shellStyles, DateRangeControl, useViewport, BottomTabBar, mobileStyles, bottomSheetStyles });
