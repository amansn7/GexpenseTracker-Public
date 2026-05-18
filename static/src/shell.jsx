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
        <button onClick={(e) => { e.stopPropagation(); onClose(); }} className="focus-ring" aria-label="Close navigation" style={{ marginLeft: "auto", border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", borderRadius: 6, padding: 8, display: "grid", placeItems: "center" }}>
          <Icon name="x" size={15} />
        </button>
      )}
    </div>
  );
};

const useViewport = () => {
  const read = () => ({
    width: window.innerWidth,
    isMobile: window.innerWidth < 720,
    isTablet: window.innerWidth < 980,
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
  app: { display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100vh", position: "relative", zIndex: 2 },
  side: { borderRight: "1px solid var(--line)", padding: "16px 12px", display: "flex", flexDirection: "column", gap: 1, position: "sticky", top: 0, height: "100vh", background: "var(--paper)", overflowY: "auto" },
  brand: { display: "flex", alignItems: "baseline", gap: 8, padding: "4px 4px 24px" },
  brandMark: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--ink)" },
  brandSlash: { color: "var(--accent)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: 20 },
  navItem: { display: "flex", alignItems: "center", gap: 8, padding: "5px 10px 5px 8px", borderRadius: 6, color: "var(--ink-2)", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", textAlign: "left", width: "100%" },
  navItemActive: { boxShadow: "inset 2px 0 0 0 var(--accent)", background: "var(--paper-2)", color: "var(--ink)" },
  navCount: { marginLeft: "auto", fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" },
  sectionLabel: { fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)", padding: "14px 8px 4px", fontWeight: 600 },
  sideFooter: { borderTop: "1px solid var(--line)", padding: "10px 8px 4px", display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 999, background: "var(--cat-travel)", color: "var(--cat-travel-ink)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, fontFamily: "'Geist', sans-serif" },
  main: { display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { display: "flex", alignItems: "center", gap: 14, padding: "16px 28px", borderBottom: "1px solid var(--line)", background: "var(--paper)", position: "sticky", top: 0, zIndex: 10, minHeight: 72 },
  search: { flex: 1, maxWidth: 420, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink-3)" },
  searchInput: { flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: 13 },
  kbd: { fontFamily: "'Geist Mono', monospace", fontSize: 10, padding: "2px 6px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--ink-3)" },
  topBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
  topBtnPrimary: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },
  connected: { display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },
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
  <button title={_navHints[icon] || label} className={"focus-ring nav-btn" + (active ? " active" : "")} style={{ ...shellStyles.navItem, ...(active ? shellStyles.navItemActive : {}) }} onClick={onClick}>
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
  const sideStyle = mobile
    ? { ...shellStyles.side, position: "fixed", top: 0, left: 0, bottom: 0, width: 284, maxWidth: "86vw", height: "100dvh", zIndex: 70, boxShadow: "18px 0 48px -24px var(--shadow-lg)", transform: open ? "translateX(0)" : "translateX(-105%)", transition: "transform 180ms ease", overflowY: "auto" }
    : shellStyles.side;
  const navigate = (fn) => {
    fn();
    if (mobile) onClose();
  };

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
      <NavItem icon="trending-down" label="Debt" active={view==="debt"}    onClick={()=>navigate(()=>setView("debt"))} />

      {/* Mode toggle */}
      <div style={{ marginTop: "auto", padding: "12px 8px", borderTop: "1px solid var(--line)" }}>
        <button
          onClick={() => setMode("classic")}
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink-2)", fontSize: 12, cursor: "pointer" }}
        >
          <Icon name="grid" size={14} />
          <span>Switch to Classic</span>
        </button>
      </div>

      {/* Account menu */}
      <div style={{ padding: "4px 8px 8px" }}>
        <button
          onClick={()=>setMenu(m=>!m)}
          className="focus-ring"
          aria-expanded={menu}
          aria-haspopup="menu"
          aria-label="Account menu"
          style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 8px", border: "none", background: menu ? "var(--paper-2)" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "background 120ms ease", position: "relative", zIndex: menu ? 51 : "auto" }}
          onMouseEnter={e => { if (!menu) e.currentTarget.style.background = "var(--paper-2)"; }}
          onMouseLeave={e => { if (!menu) e.currentTarget.style.background = "transparent"; }}
        >
          {account?.avatar_url
            ? <img src={account.avatar_url} alt={`${account?.name || account?.email}'s avatar`} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
            : <div style={shellStyles.avatar}>{(account?.name || account?.email || "?")[0].toUpperCase()}</div>
          }
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{account?.name || account?.email || "—"}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{account?.email || ""}</div>
          </div>
          <Icon name="arrow-d" size={12} stroke="var(--ink-3)" />
        </button>
        {menu && (
          <>
            <div onClick={()=>setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
            <div className="fade-in" style={{ position: "fixed", bottom: mobile ? "calc(100dvh - 284px + 8px)" : "calc(100vh - 232px + 8px)", left: 8, width: mobile ? 268 : 216, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, boxShadow: "0 16px 30px -16px var(--shadow-md)", zIndex: 120 }}>
              <button onClick={()=>{ setView("profile"); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Icon name="user" size={14}/> Profile
              </button>
              <button onClick={()=>{ setView("settings-new"); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "left" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <Icon name="gear" size={14}/> Settings
              </button>
              <div style={{ height: 1, background: "var(--line)", margin: "4px 4px" }}/>
              <button
                onClick={async () => {
                  await API.post("/api/auth/logout");
                  window.location.href = "/login";
                }}
                style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink-3)", textAlign: "left" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--paper-2)"; e.currentTarget.style.color = "var(--neg)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-3)"; }}
              >
                <Icon name="arrow-u-r" size={14}/> Sign out
              </button>
            </div>
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
      <Icon name={viewsOpen ? "chevron-d" : "chevron-r"} size={10} stroke="var(--ink-4)"/> Views
    </div>
    {viewsOpen && <>
    <NavItem icon="inbox"   label="Inbox"       count={counts.unread}  active={view==="inbox"}     onClick={()=>navigate(()=>setView("inbox"))} />
    <NavItem icon="flow"    label="Money Flow"                          active={view==="flow"}      onClick={()=>navigate(()=>setView("flow"))} />
    <NavItem icon="dash"    label="Dashboard"                           active={view==="dashboard"} onClick={()=>navigate(()=>setView("dashboard"))} />
    <NavItem icon="heart"   label="Health"                              active={view==="health"}    onClick={()=>navigate(()=>setView("health"))} />
    <NavItem icon="chart"   label="Reports"                             active={view==="reports"}   onClick={()=>navigate(()=>setView("reports"))} />
    <NavItem icon="repeat"  label="Recurring"                           active={view==="recurring"} onClick={()=>navigate(()=>setView("recurring"))} />
    <NavItem icon="trending-down" label="Debt"                          active={view==="debt"}      onClick={()=>navigate(()=>setView("debt"))} />
    </>}

    <div onClick={() => { const n = !filtersOpen; setFiltersOpen(n); localStorage.setItem("_nav_filters", n ? "1" : "0"); }}
      style={{ ...shellStyles.sectionLabel, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, userSelect: "none" }}>
      <Icon name={filtersOpen ? "chevron-d" : "chevron-r"} size={10} stroke="var(--ink-4)"/> Filters
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
      <Icon name={catsOpen ? "chevron-d" : "chevron-r"} size={10} stroke="var(--ink-4)"/> Categories
    </div>
    {catsOpen && CategoryService.grouped().map(g => (
      <div key={g.key}>
        {g.key !== "_user" && (
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", padding: "4px 10px 2px", fontWeight: 500 }}>{g.label}</div>
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

    {/* Appearance — equal-width theme buttons via grid */}
    <div style={{ padding: "12px 8px 4px", marginTop: "auto" }}>
      <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-4)", padding: "0 0 6px", fontWeight: 600 }}>Appearance</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
        {[
          ["paper","var(--theme-paper-swatch)","Paper","#1a1814"],
          ["cool","var(--theme-cool-swatch)","Cool","#171923"],
          ["midnight","var(--theme-midnight-swatch)","Midnight","#efe9d8"],
          ["observatory","var(--theme-observatory-swatch)","Observatory","#e8e4df"],
        ].map(([k,swatch,label,ink]) => (
          <button key={k} title={label} aria-label={`Switch to ${label} theme`} aria-pressed={theme === k} onClick={() => setTheme && setTheme(k)}
            className="theme-btn"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
              minHeight: 48, borderRadius: 6, cursor: "pointer", padding: "6px 2px",
              background: swatch,
              border: theme === k ? "2px solid var(--accent)" : "1px solid var(--line)",
              transition: "border-color 120ms ease",
            }}
          >
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: "0.02em", lineHeight: 1,
              color: theme === k ? ink : ink + "99",
            }}>{label}</span>
          </button>
        ))}
      </div>
    </div>

    <div style={{ padding: "4px 8px 8px" }}>
      <button
        onClick={()=>setMenu(m=>!m)}
        className="focus-ring"
        aria-expanded={menu}
        aria-haspopup="menu"
        aria-label="Account menu"
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 8px", border: "none", background: menu ? "var(--paper-2)" : "transparent", borderRadius: 8, cursor: "pointer", textAlign: "left", transition: "background 120ms ease", position: "relative", zIndex: menu ? 51 : "auto" }}
        onMouseEnter={e => { if (!menu) e.currentTarget.style.background = "var(--paper-2)"; }}
        onMouseLeave={e => { if (!menu) e.currentTarget.style.background = "transparent"; }}
      >
        {account?.avatar_url
          ? <img src={account.avatar_url} alt={`${account?.name || account?.email}'s avatar`} style={{ width: 28, height: 28, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} referrerPolicy="no-referrer" />
          : <div style={shellStyles.avatar}>{(account?.name || account?.email || "?")[0].toUpperCase()}</div>
        }
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{account?.name || account?.email || "—"}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{account?.email || ""}</div>
        </div>
        <Icon name="arrow-d" size={12} stroke="var(--ink-3)" />
      </button>
      {menu && (
        <>
          <div onClick={()=>setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
          <div className="fade-in" style={{ position: "fixed", bottom: mobile ? "calc(100dvh - 284px + 8px)" : "calc(100vh - 232px + 8px)", left: 8, width: mobile ? 268 : 216, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 4, boxShadow: "0 16px 30px -16px var(--shadow-md)", zIndex: 120 }}>
            <button onClick={()=>{ setView("profile"); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "left" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Icon name="user" size={14}/> Profile
            </button>
            <button onClick={()=>{ setView("settings"); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "left" }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--paper-2)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Icon name="gear" size={14}/> Settings
            </button>
            <div style={{ height: 1, background: "var(--line)", margin: "4px 4px" }}/>
            <button
              onClick={async () => {
                await API.post("/api/auth/logout");
                window.location.href = "/login";
              }}
              style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 6, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink-3)", textAlign: "left" }}
              onMouseEnter={e => { e.currentTarget.style.background = "var(--paper-2)"; e.currentTarget.style.color = "var(--neg)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink-3)"; }}
            >
              <Icon name="arrow-u-r" size={14}/> Sign out
            </button>
          </div>
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
    const sign = isIncome ? "+" : "−";
    return `${sign}₹${Math.abs(tx.amount).toLocaleString("en-IN")}`;
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
          <div style={{ padding: "6px 12px 4px", fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>Results</div>
          {results.map((tx, i) => (
            <button key={tx.id} className="hover-row" onClick={() => handleSelect(tx)}
              style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", padding: "9px 14px", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--line)", textAlign: "left", cursor: "pointer" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {tx.merchant || tx.email?.subject || "(no merchant)"}
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                  {[tx.category, tx.txn_date || tx.email?.received_at?.slice(0, 10)].filter(Boolean).join(" · ")}
                </div>
              </div>
              {fmtAmt(tx) && (
                <span style={{ fontSize: 13, fontFamily: "'Geist Mono', monospace", fontFeatureSettings: "'tnum'", color: tx.label === "income" ? "var(--pos)" : "var(--neg)", fontWeight: 500, flexShrink: 0 }}>
                  {fmtAmt(tx)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
      {open && results.length === 0 && !busy && query.trim().length >= 2 && (
        <div className="fade-in" style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, boxShadow: "0 16px 40px -16px var(--shadow-lg)", zIndex: 999, padding: "14px 14px", fontSize: 13, color: "var(--ink-3)", textAlign: "center" }}>
          No results for "{query}"
        </div>
      )}
    </div>
  );
};

const Topbar = ({ title, subtitle, children, syncLabel, mobile = false, showMenu = mobile, onMenu = () => {}, onSearchSelect, onSearchEnter }) => (
  <header style={{ ...shellStyles.topbar, ...(mobile ? { padding: "10px 14px", gap: 10, minHeight: 62, flexWrap: "wrap" } : {}) }}>
    {showMenu && (
      <button onClick={onMenu} className="focus-ring" aria-label="Open navigation" style={{ border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink)", borderRadius: 6, width: 44, height: 44, display: "grid", placeItems: "center", flexShrink: 0 }}>
        <Icon name="menu" size={18} />
      </button>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: mobile ? 0 : 16, minWidth: 0, flex: mobile ? "1 1 180px" : "0 0 auto" }}>
      <h1 className="serif" style={{ margin: 0, fontSize: mobile ? 20 : 22, fontWeight: 500, letterSpacing: "-0.015em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subtitle}</div>}
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

const DateRangeControl = ({ rangeFrom, rangeTo, activePreset, onChange }) => {
  const fmt = d => { const off = d.getTimezoneOffset() * 60000; return new Date(d - off).toISOString().slice(0, 10); };
  const presets = [
    ["all", "All", null],
    ["7d", "7d", 7],
    ["30d", "30d", 30],
    ["90d", "90d", 90],
    ["1y", "1y", 365],
  ];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {presets.map(([label, display, days]) => (
        <button
          key={label}
          onClick={() => {
            if (!days) { onChange(null, null, label); return; }
            const end = new Date();
            const start = new Date(); start.setDate(end.getDate() - days + 1);
            onChange(fmt(start), fmt(end), label);
          }}
          style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", background: activePreset === label ? "var(--ink)" : "var(--card)", color: activePreset === label ? "var(--paper)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
        >{display}</button>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        <input
          type="date"
          aria-label="Start date"
          value={rangeFrom}
          max={rangeTo}
          onChange={e => onChange(e.target.value, rangeTo, null)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
        />
        <span aria-hidden="true" style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
        <input
          type="date"
          aria-label="End date"
          value={rangeTo}
          min={rangeFrom}
          onChange={e => onChange(rangeFrom, e.target.value, null)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
        />
      </div>
    </div>
  );
};

Object.assign(window, { Sidebar, Topbar, shellStyles, DateRangeControl, useViewport });
