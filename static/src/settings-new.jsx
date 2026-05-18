// NewSettingsView — reorganized Settings for the new mode

const NewSettingsView = ({ syncStatus, setSyncStatus, onRescan, syncing, account, setAccount }) => {
  const [sections, setSections] = React.useState({
    connected: true,
    categories: false,
    preferences: false,
    advanced: false,
  });

  const toggle = (key) => setSections((s) => ({ ...s, [key]: !s[key] }));

  const fmtDate = (iso) => {
    if (!iso) return "never";
    const d = new Date(iso);
    const diff = Math.floor((Date.now() - d) / 60000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
    return d.toLocaleDateString();
  };

  const syncHealth = () => {
    if (!syncStatus?.last_synced_at) return "Not connected";
    const diff = Math.floor((Date.now() - new Date(syncStatus.last_synced_at)) / 60000);
    if (diff < 30) return "Synced just now";
    if (diff < 120) return `Synced ${diff}m ago`;
    return `Last synced ${fmtDate(syncStatus.last_synced_at)}`;
  };

  const sectionStyle = {
    border: "1px solid var(--line)",
    borderRadius: 8,
    background: "var(--card)",
    marginBottom: 12,
    overflow: "hidden",
  };

  const headerStyle = (open) => ({
    display: "flex", justifyContent: "space-between", alignItems: "center",
    padding: "14px 18px", cursor: "pointer", background: open ? "var(--paper-2)" : "transparent",
    border: "none", width: "100%", textAlign: "left",
  });

  const bodyStyle = { padding: "0 18px 18px" };

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 28px 48px" }}>
      {/* ── Connected (always visible) ── */}
      <div style={sectionStyle}>
        <div style={{ padding: "18px" }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500, marginBottom: 14 }}>Connected</div>

          {/* Gmail sync */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>Gmail Sync</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{syncHealth()}</div>
            </div>
            <button
              onClick={onRescan}
              disabled={syncing}
              style={{
                padding: "8px 16px", background: syncing ? "var(--ink-4)" : "var(--ink)",
                color: "var(--paper)", border: "none", borderRadius: 6, fontSize: 12,
                cursor: syncing ? "default" : "pointer", fontFamily: "inherit",
              }}
            >
              {syncing ? "Syncing…" : "Sync now"}
            </button>
          </div>

          {/* AI provider */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>AI Provider</div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>
                {account?.ai_services?.[0]?.provider || "Not configured"}
                {account?.ai_services?.[0]?.model ? ` · ${account.ai_services[0].model}` : ""}
              </div>
            </div>
            <span style={{
              fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 4,
              background: account?.ai_services?.length > 0 ? "var(--pos)" : "var(--ink-4)",
              color: "white",
            }}>
              {account?.ai_services?.length > 0 ? "Active" : "Inactive"}
            </span>
          </div>

          {/* Health one-liner */}
          <div style={{ fontSize: 12, color: "var(--ink-3)", padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6 }}>
            {syncHealth()} · AI {account?.ai_services?.length > 0 ? "responding normally" : "not configured"}
          </div>
        </div>
      </div>

      {/* ── Categories (expandable) ── */}
      <div style={sectionStyle}>
        <button onClick={() => toggle("categories")} style={headerStyle(sections.categories)}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Categories</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", transform: sections.categories ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>▾</span>
        </button>
        {sections.categories && (
          <div style={bodyStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 }}>
              {CategoryService.all().map((cat) => (
                <div key={cat.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "var(--paper-2)", borderRadius: 6 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: cat.bg, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: "var(--ink)" }}>{cat.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Preferences (expandable) ── */}
      <div style={sectionStyle}>
        <button onClick={() => toggle("preferences")} style={headerStyle(sections.preferences)}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Preferences</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", transform: sections.preferences ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>▾</span>
        </button>
        {sections.preferences && (
          <div style={bodyStyle}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>Currency</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{account?.default_currency || "INR"}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>Timezone</div>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>{account?.timezone || "Asia/Kolkata"}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Advanced (collapsed by default) ── */}
      <div style={sectionStyle}>
        <button onClick={() => toggle("advanced")} style={headerStyle(sections.advanced)}>
          <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>Advanced</span>
          <span style={{ fontSize: 12, color: "var(--ink-3)", transform: sections.advanced ? "rotate(180deg)" : "none", transition: "transform 200ms" }}>▾</span>
        </button>
        {sections.advanced && (
          <div style={bodyStyle}>
            <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.6 }}>
              <p style={{ marginBottom: 8 }}>Account: {account?.email}</p>
              <p style={{ marginBottom: 8 }}>User ID: {account?.id}</p>
              <p>Admin tools are available at <code style={{ background: "var(--paper-2)", padding: "2px 6px", borderRadius: 3 }}>/admin</code></p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { NewSettingsView });
