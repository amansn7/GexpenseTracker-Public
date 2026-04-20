// Shell — sidebar nav, topbar, layout

const shellStyles = {
  app: { display: "grid", gridTemplateColumns: "232px 1fr", minHeight: "100vh", position: "relative", zIndex: 2 },
  side: { borderRight: "1px solid var(--line)", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 2, position: "sticky", top: 0, height: "100vh", background: "var(--paper)" },
  brand: { display: "flex", alignItems: "baseline", gap: 8, padding: "6px 8px 28px" },
  brandMark: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 500, letterSpacing: "-0.03em", color: "var(--ink)" },
  brandSlash: { color: "var(--accent)", fontFamily: "'Instrument Serif', serif", fontStyle: "italic", fontSize: 20 },
  navItem: { display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, color: "var(--ink-2)", fontSize: 13, fontWeight: 500, cursor: "pointer", border: "none", background: "transparent", textAlign: "left", width: "100%", transition: "background 140ms" },
  navItemActive: { background: "var(--paper-2)", color: "var(--ink)" },
  navCount: { marginLeft: "auto", fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" },
  sectionLabel: { fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-4)", padding: "18px 10px 6px", fontWeight: 500 },
  sideFooter: { marginTop: "auto", borderTop: "1px solid var(--line)", padding: "14px 8px 4px", display: "flex", alignItems: "center", gap: 10 },
  avatar: { width: 28, height: 28, borderRadius: 999, background: "var(--cat-travel)", color: "var(--cat-travel-ink)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 600, fontFamily: "'Geist', sans-serif" },
  main: { display: "flex", flexDirection: "column", minWidth: 0 },
  topbar: { display: "flex", alignItems: "center", gap: 14, padding: "16px 28px", borderBottom: "1px solid var(--line)", background: "var(--paper)", position: "sticky", top: 0, zIndex: 10, minHeight: 72 },
  search: { flex: 1, maxWidth: 420, display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink-3)" },
  searchInput: { flex: 1, border: "none", outline: "none", background: "transparent", color: "var(--ink)", fontSize: 13 },
  kbd: { fontFamily: "'Geist Mono', monospace", fontSize: 10, padding: "2px 6px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 4, color: "var(--ink-3)" },
  topBtn: { display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" },
  topBtnPrimary: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },
  connected: { display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--ink-3)", padding: "6px 10px", background: "var(--pos-soft)", borderRadius: 20, color: "var(--pos)", fontWeight: 500 },
  connectedDot: { width: 6, height: 6, borderRadius: 999, background: "var(--pos)" },
};

const NavItem = ({ icon, label, count, active, onClick }) => (
  <button className="focus-ring" style={{ ...shellStyles.navItem, ...(active ? shellStyles.navItemActive : {}) }} onClick={onClick}
    onMouseEnter={e => { if (!active) e.currentTarget.style.background = "var(--paper-2)"; }}
    onMouseLeave={e => { if (!active) e.currentTarget.style.background = "transparent"; }}>
    <Icon name={icon} size={15} />
    <span>{label}</span>
    {count != null && <span style={shellStyles.navCount}>{count}</span>}
  </button>
);

const Sidebar = ({ view, setView, counts, filter, onFilter }) => {
  const [menu, setMenu] = React.useState(false);
  return (
  <aside style={shellStyles.side}>
    <div style={shellStyles.brand}>
      <span style={shellStyles.brandMark}>Money<span style={{ color: "var(--accent)", fontStyle: "italic" }}>flow</span></span>
    </div>

    <div style={shellStyles.sectionLabel}>Views</div>
    <NavItem icon="inbox" label="Inbox"       count={counts.unread}  active={view==="inbox"}     onClick={()=>setView("inbox")} />
    <NavItem icon="flow"  label="Money Flow"                          active={view==="flow"}      onClick={()=>setView("flow")} />
    <NavItem icon="dash"  label="Dashboard"                           active={view==="dashboard"} onClick={()=>setView("dashboard")} />

    <div style={shellStyles.sectionLabel}>Filters</div>
    <NavItem icon="dot"  label="Expenses"      count={counts.expense} active={view==="inbox"&&filter==="expenses"}      onClick={()=>{ setView("inbox"); onFilter("expenses"); }} />
    <NavItem icon="dot"  label="Income"        count={counts.income}  active={view==="inbox"&&filter==="income"}         onClick={()=>{ setView("inbox"); onFilter("income"); }} />
    <NavItem icon="dot"  label="Subscriptions" count={counts.sub}     active={view==="inbox"&&filter==="sub"}            onClick={()=>{ setView("inbox"); onFilter("sub"); }} />
    <NavItem icon="star" label="Flagged"       count={counts.flagged} active={view==="inbox"&&filter==="flagged"}        onClick={()=>{ setView("inbox"); onFilter("flagged"); }} />

    <div style={shellStyles.sectionLabel}>Categories</div>
    {Object.entries(CATEGORIES).filter(([k])=>k!=="income"&&k!=="other").map(([k,c]) => (
      <button key={k} className="focus-ring"
        onClick={()=>{ setView("inbox"); onFilter("cat:"+k); }}
        style={{ ...shellStyles.navItem, ...(view==="inbox"&&filter==="cat:"+k ? shellStyles.navItemActive : {}) }}
        onMouseEnter={e=>{ if(!(view==="inbox"&&filter==="cat:"+k)) e.currentTarget.style.background="var(--paper-2)"; }}
        onMouseLeave={e=>{ if(!(view==="inbox"&&filter==="cat:"+k)) e.currentTarget.style.background="transparent"; }}>
        <span style={{ width: 10, height: 10, borderRadius: 3, background: c.bg, border: `1px solid ${c.ink}22` }} />
        <span>{c.label}</span>
      </button>
    ))}

    <div style={shellStyles.sectionLabel}>Tools</div>
    <NavItem icon="gear" label="Admin" active={view==="admin"} onClick={()=>setView("admin")} />

    <div style={{ ...shellStyles.sideFooter, position: "relative" }}>
      <button
        onClick={()=>setMenu(m=>!m)}
        className="focus-ring"
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: 6, border: "none", background: menu ? "var(--paper-2)" : "transparent", borderRadius: 6, cursor: "pointer", textAlign: "left" }}
      >
        <div style={shellStyles.avatar}>AK</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>Ananya K.</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>ananya@acme.in</div>
        </div>
        <Icon name="arrow-d" size={12} stroke="var(--ink-3)" />
      </button>
      {menu && (
        <>
          <div onClick={()=>setMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 50 }}/>
          <div className="fade-in" style={{ position: "absolute", bottom: "calc(100% - 4px)", left: 8, right: 8, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: 6, boxShadow: "0 16px 30px -16px rgba(0,0,0,0.25)", zIndex: 60 }}>
            <button onClick={()=>{ setView("profile"); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: view==="profile"?"var(--paper-2)":"transparent", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "left" }}>
              <Icon name="user" size={14}/> Profile
            </button>
            <button onClick={()=>{ setView("settings"); setMenu(false); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: view==="settings"?"var(--paper-2)":"transparent", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink)", textAlign: "left" }}>
              <Icon name="gear" size={14}/> Settings
            </button>
            <div style={{ height: 1, background: "var(--line)", margin: "4px 2px" }}/>
            <button style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "8px 10px", border: "none", background: "transparent", borderRadius: 5, cursor: "pointer", fontSize: 13, fontWeight: 500, color: "var(--ink-3)", textAlign: "left" }}>
              <Icon name="arrow-u-r" size={14}/> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  </aside>
);
};

const Topbar = ({ title, subtitle, children, syncLabel }) => (
  <header style={shellStyles.topbar}>
    <div style={{ display: "flex", flexDirection: "column", gap: 2, marginRight: 16, minWidth: 0, flexShrink: 0 }}>
      <h1 className="serif" style={{ margin: 0, fontSize: 22, fontWeight: 500, letterSpacing: "-0.015em", whiteSpace: "nowrap" }}>{title}</h1>
      {subtitle && <div style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap" }}>{subtitle}</div>}
    </div>
    <div style={shellStyles.search}>
      <Icon name="search" size={14} />
      <input style={shellStyles.searchInput} placeholder="Search merchants, amounts, categories…" />
      <span style={shellStyles.kbd}>⌘ K</span>
    </div>
    <div style={{ flex: "0 0 auto", marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexWrap: "nowrap" }}>
      {children}
      <div style={shellStyles.connected}>
        <span style={shellStyles.connectedDot}></span>
        <span style={{ whiteSpace: "nowrap" }}>{syncLabel || "Gmail"}</span>
      </div>
    </div>
  </header>
);

const DateRangeControl = ({ rangeFrom, rangeTo, activePreset, onChange }) => {
  const fmt = d => { const off = d.getTimezoneOffset() * 60000; return new Date(d - off).toISOString().slice(0, 10); };
  const presets = [["7d", 7], ["30d", 30], ["90d", 90], ["1y", 365]];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {presets.map(([label, days]) => (
        <button
          key={label}
          onClick={() => {
            const end = new Date();
            const start = new Date(); start.setDate(end.getDate() - days + 1);
            onChange(fmt(start), fmt(end), label);
          }}
          style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", background: activePreset === label ? "var(--ink)" : "var(--card)", color: activePreset === label ? "var(--paper)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}
        >{label}</button>
      ))}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
        <input
          type="date"
          value={rangeFrom}
          max={rangeTo}
          onChange={e => onChange(e.target.value, rangeTo, null)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
        />
        <span style={{ color: "var(--ink-4)", fontSize: 12 }}>→</span>
        <input
          type="date"
          value={rangeTo}
          min={rangeFrom}
          onChange={e => onChange(rangeFrom, e.target.value, null)}
          style={{ border: "1px solid var(--line)", borderRadius: 6, padding: "5px 8px", fontSize: 12, background: "var(--card)", color: "var(--ink)" }}
        />
      </div>
    </div>
  );
};

Object.assign(window, { Sidebar, Topbar, shellStyles, DateRangeControl });
