// @ts-nocheck
// Profile & Settings views

const DEFAULT_CAT_COLOR = "#dcd5c3";
const accountStyles = (window as any).accountStyles = {
  wrap: { overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)" },
  inner: { padding: "clamp(16px, 3vw, 28px) clamp(14px, 4vw, 32px) 80px", maxWidth: 920, margin: "0 auto" },
  header: { marginBottom: 20 },
  kicker: { fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 },
  h1: { fontFamily: "'Geist', sans-serif", fontSize: "1.75rem", fontWeight: 400, letterSpacing: "-0.02em", margin: "2px 0 0" },
  section: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "clamp(16px, 4vw, 24px) clamp(14px, 4vw, 28px)", marginBottom: 16 },
  sectionTitle: { fontFamily: "'Geist', sans-serif", fontSize: "1.125rem", fontWeight: 500, margin: "0 0 4px" },
  sectionSub: { color: "var(--ink-3)", fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: "0.875rem", marginBottom: 18 },
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: "1px dashed var(--line)" },
  rowLast: { borderBottom: "none" },
  label: { fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)" },
  sub: { fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 },
  input: { padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", width: "100%", boxSizing: "border-box" },
  btn: { padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" },
  btnPrimary: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)", transition: "background 120ms ease" },
  btnDanger: { background: "var(--neg-soft)", color: "var(--neg)", border: "1px solid var(--neg-soft)", transition: "background 120ms ease" },
  toggle: { width: 36, height: 20, borderRadius: 20, padding: 2, border: "none", cursor: "pointer", transition: "background 160ms", display: "flex", alignItems: "center" },
  toggleKnob: { width: 16, height: 16, borderRadius: 999, background: "var(--paper)", transition: "transform 160ms", boxShadow: "0 1px 2px var(--shadow-sm)" },
};

const Toggle = ({ on, onChange, label }) => (
  <button type="button" aria-pressed={on} aria-label={label || (on ? "Disable" : "Enable")} onClick={()=>onChange(!on)} style={{ ...accountStyles.toggle, background: on ? "var(--pos)" : "var(--ink-4)" }}>
    <span style={{ ...accountStyles.toggleKnob, transform: on ? "translateX(16px)" : "translateX(0)" }}/>
  </button>
);
(window as any).Toggle = Toggle;

const TrialInfoBanner = (window as any).TrialInfoBanner || function(){ return null; };
const SenderRulesSection = (window as any).SenderRulesSection || function(){ return null; };
const AdminLLMSection = (window as any).AdminLLMSection || function(){ return null; };
const AdminBackfillBodiesSection = (window as any).AdminBackfillBodiesSection || function(){ return null; };
const AdminFetchRangeSection = (window as any).AdminFetchRangeSection || function(){ return null; };
const AdminSyncSection = (window as any).AdminSyncSection || function(){ return null; };
const AdminFetchPreviewSection = (window as any).AdminFetchPreviewSection || function(){ return null; };
const AdminClassifySection = (window as any).AdminClassifySection || function(){ return null; };
const AdminDomainRulesSection = (window as any).AdminDomainRulesSection || function(){ return null; };
const AdminCleanBodiesSection = (window as any).AdminCleanBodiesSection || function(){ return null; };
const AdminAlertsSection = (window as any).AdminAlertsSection || function(){ return null; };
const PatternRulesSection = (window as any).PatternRulesSection || function(){ return null; };
const MerchantAliasesSection = (window as any).MerchantAliasesSection || function(){ return null; };
const FilterRulesSection = (window as any).FilterRulesSection || function(){ return null; };
const BuiltinRulesSection = (window as any).BuiltinRulesSection || function(){ return null; };

const OnboardingView = ({ onComplete }) => {
  const [form, setForm] = React.useState({
    full_name: "",
    email: "",
    invite_code: "",
    location: "",
    default_currency: "INR",
    timezone: "Asia/Kolkata",
  });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const account = await API.post("/api/account/onboarding", form);
      onComplete(account);
    } catch (err) {
      setError(err.message || "Could not create account");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div style={accountStyles.wrap}>
      <div style={accountStyles.inner}>
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>First run</div>
        <h1 style={accountStyles.h1}>Create your profile</h1>
      </div>
      <form onSubmit={submit} style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Owner account</h3>
        <div style={accountStyles.sectionSub}>— the person this Moneyflow workspace belongs to</div>
        {error && <div role="alert" style={{ padding: "10px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, marginBottom: 12, fontSize: "0.75rem" }}>{error}</div>}
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Full name</div><div style={accountStyles.sub}>shown in profile and exports</div></div>
          <input required style={accountStyles.input} value={form.full_name} onChange={e=>set("full_name", e.target.value)} placeholder="Aman Saini"/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Email address</div><div style={accountStyles.sub}>used to identify this user</div></div>
          <input required type="email" style={accountStyles.input} value={form.email} onChange={e=>set("email", e.target.value)} placeholder="you@example.com"/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Invite code</div><div style={accountStyles.sub}>required when configured for private beta</div></div>
          <input style={accountStyles.input} value={form.invite_code} onChange={e=>set("invite_code", e.target.value)} placeholder="Private beta code"/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Location</div><div style={accountStyles.sub}>optional, for digest context</div></div>
          <input style={accountStyles.input} value={form.location} onChange={e=>set("location", e.target.value)} placeholder="Bengaluru, IN"/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Default currency</div><div style={accountStyles.sub}>how amounts render</div></div>
          <select style={accountStyles.input} value={form.default_currency} onChange={e=>set("default_currency", e.target.value)}>
            <option value="INR">INR — Indian Rupee</option>
            <option value="USD">USD — US Dollar</option>
            <option value="EUR">EUR — Euro</option>
            <option value="GBP">GBP — British Pound</option>
          </select>
          <div/>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Timezone</div><div style={accountStyles.sub}>for digest timing</div></div>
          <select style={accountStyles.input} value={form.timezone} onChange={e=>set("timezone", e.target.value)}>
            <option value="Asia/Kolkata">Asia/Kolkata</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Europe/London">Europe/London</option>
            <option value="UTC">UTC</option>
          </select>
          <div/>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
          <button disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: saving ? 0.65 : 1 }}>{saving ? "Creating…" : "Create account"}</button>
        </div>
      </form>
      </div>
    </div>
  );
};

const ProfileView = React.memo(({ transactions, account, setAccount }) => {
  const { isMobile } = useViewport();
  const mqWrap = isMobile ? { height: mobileStyles.navOffset } : {};
  const mqInner = isMobile ? { padding: "16px 14px 80px" } : {};
  const mqSection = isMobile ? { padding: "12px 14px" } : {};
  const mqRow = isMobile ? { gridTemplateColumns: "1fr", gap: 8, padding: "10px 0" } : {};
  const mqH1 = isMobile ? { fontSize: "1.375rem" } : {};
  const profile = account?.profile || {};
  const user = account?.user || {};

  const [form, setForm] = React.useState(profile);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);
  React.useEffect(() => setForm(profile), [account?.user?.id]);

  const [stats, setStats] = React.useState(null);
  const [statsLoading, setStatsLoading] = React.useState(true);
  React.useEffect(() => {
    let cancelled = false;
    setStatsLoading(true);
    API.get("/api/stats?sections=health,summary,categoryBreakdown,confidence&months=6&period=1m")
      .then(d => {
        if (!cancelled) {
          setStats({
            health: d.health || null,
            summary: d.summary || null,
            breakdown: d.categoryBreakdown || null,
            confidence: d.confidence || null,
          });
          setStatsLoading(false);
        }
      })
      .catch(() => { if (!cancelled) setStatsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const patch = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await API.patch("/api/account/profile", form);
      setAccount(a => ({ ...a, profile: result.profile }));
    } catch (err) {
      setSaveError(err.message || "Could not save changes");
    } finally {
      setSaving(false);
    }
  };

  const initials = (form.display_name || form.full_name || user.email || "U").split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const createdAt = account.created_at || user.created_at;
  const memberSince = createdAt ? new Date(createdAt).toLocaleString("en-US", { month: "short", year: "numeric" }) : "today";
  const currency = form.default_currency || "INR";
  const currSym = { INR: "₹", USD: "$", EUR: "€", GBP: "£" }[currency] || "₹";
  const fmt = (n) => {
    if (n == null) return "—";
    const s = n < 0 ? "-" : "";
    return s + currSym + window.formatShortNumber(Math.abs(n));
  };

  const trialEndsAt = account.trial_ends_at || user.trial_ends_at;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000)) : null;

  const connectedAccounts = account.connected_accounts || [];

  const kpis = stats ? [
    {
      label: "Current balance",
      value: fmt(stats.health.current_balance || 0),
      sub: stats.health.balance_mode === "anchored" ? "anchored" : "estimated from history",
      color: (stats.health.current_balance || 0) >= 0 ? "var(--pos)" : "var(--neg)",
    },
    {
      label: "Savings rate",
      value: `${Math.round(stats.health.savings_rate || 0)}%`,
      sub: "6-month avg",
      color: (stats.health.savings_rate || 0) >= 20 ? "var(--pos)" : (stats.health.savings_rate || 0) >= 0 ? "var(--amber)" : "var(--neg)",
    },
    {
      label: "Runway",
      value: `${Math.round(stats.health.runway_months || 0)}mo`,
      sub: "months covered",
      color: (stats.health.runway_months || 0) >= 6 ? "var(--pos)" : (stats.health.runway_months || 0) >= 3 ? "var(--amber)" : "var(--neg)",
    },
    {
      label: "Income this month",
      value: fmt(stats.summary.total_income || 0),
      sub: `vs ${fmt(stats.summary.total_expenses || 0)} spent`,
      color: "var(--pos)",
    },
    {
      label: "Top category",
      value: stats.breakdown.categories?.[0]?.category
        ? (CategoryService?.display?.(stats.breakdown.categories[0].category)?.label || stats.breakdown.categories[0].category)
        : "—",
      sub: stats.breakdown.categories?.[0]?.amount ? `${fmt(stats.breakdown.categories[0].amount)} this month` : "no data",
    },
    {
      label: "Auto-classified",
      value: (stats.confidence.total || 0) > 0
        ? `${Math.round(((stats.confidence.auto_confirmed || 0) / stats.confidence.total) * 100)}%`
        : "—",
      sub: `${(((stats.confidence.correction_rate ?? 0) * 100).toFixed(1))}% correction rate`,
      color: (stats.confidence.total > 0 && (stats.confidence.auto_confirmed / stats.confidence.total) >= 0.85) ? "var(--pos)" : "var(--amber)",
    },
  ] : [];

  return (
    <div style={{ ...accountStyles.wrap, ...mqWrap }}>
      <div style={{ ...accountStyles.inner, ...mqInner }}>
        <div style={accountStyles.header}>
          <div style={accountStyles.kicker}>Your account</div>
          <h1 style={{ ...accountStyles.h1, ...mqH1 }}>Profile</h1>
        </div>

        {/* Hero */}
        <div style={{ ...accountStyles.section, ...mqSection }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
            {profile.avatar_url
              ? <img src={profile.avatar_url} alt={initials} style={{ width: 72, height: 72, borderRadius: 999, objectFit: "cover", flexShrink: 0 }}/>
              : <div style={{ width: 72, height: 72, borderRadius: 999, background: "var(--cat-travel)", color: "var(--cat-travel-ink)", display: "grid", placeItems: "center", fontSize: "1.625rem", fontWeight: 600, fontFamily: "'Geist', sans-serif", flexShrink: 0 }}>{initials}</div>
            }
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontFamily: "'Geist', sans-serif", fontSize: "1.5rem", fontWeight: 500, letterSpacing: "-0.01em" }}>{form.display_name || form.full_name || "Unnamed user"}</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)", marginTop: 2 }}>{user.email}{form.location ? ` · ${form.location}` : ""}</div>
              <div style={{ fontSize: "0.6875rem", color: "var(--ink-4)", marginTop: 6, fontFamily: "'Geist Mono', monospace" }}>
                Member since {memberSince} · Role: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{user.role || "member"}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial snapshot */}
        <div style={{ ...accountStyles.section, ...mqSection }}>
          <h3 style={accountStyles.sectionTitle}>Financial snapshot</h3>
          <div style={accountStyles.sectionSub}>— this month & trailing 6-month health</div>
          {statsLoading ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 160}px, 1fr))`, gap: 12, marginTop: 8 }}>
              {[...Array(6)].map((_, i) => <div key={i} className="skeleton" style={{ height: 76, borderRadius: 6 }}/>)}
            </div>
          ) : stats ? (
            <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${isMobile ? 140 : 160}px, 1fr))`, gap: 12, marginTop: 8 }}>
              {kpis.map((k, i) => (
                <div key={i} style={{ padding: isMobile ? "10px 12px" : "14px 16px", background: "var(--paper-2)", borderRadius: 6 }}>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.09em", fontWeight: 500 }}>{k.label}</div>
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.25rem", fontWeight: 400, marginTop: 5, color: k.color || "var(--ink)", lineHeight: 1.1 }}>{k.value}</div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 3 }}>{k.sub}</div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: "20px 0", fontSize: "0.8125rem", color: "var(--ink-3)" }}>Could not load financial data.</div>
          )}
        </div>

        {/* Connected accounts */}
        {connectedAccounts.length > 0 && (
          <div style={{ ...accountStyles.section, ...mqSection }}>
            <h3 style={accountStyles.sectionTitle}>Connected accounts</h3>
            <div style={accountStyles.sectionSub}>— Gmail inboxes MoneyFlow reads from</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
              {connectedAccounts.map((ca, i) => {
                const synced = ca.last_synced_at ? new Date(ca.last_synced_at) : null;
                const minsAgo = synced ? Math.round((Date.now() - synced.getTime()) / 60000) : null;
                const syncLabel = minsAgo === null ? "never synced"
                  : minsAgo < 2 ? "just now"
                  : minsAgo < 60 ? `${minsAgo}m ago`
                  : minsAgo < 1440 ? `${Math.round(minsAgo / 60)}h ago`
                  : `${Math.round(minsAgo / 1440)}d ago`;
                const isOk = ca.status === "connected";
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: isMobile ? "8px 10px" : "10px 14px", background: "var(--paper-2)", borderRadius: 6 }}>
                    <Icon name="mail" size={14} style={{ color: "var(--ink-3)", flexShrink: 0 }}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ca.account_email}</div>
                      <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 1 }}>Last synced {syncLabel}</div>
                    </div>
                    <div style={{ fontSize: "0.6875rem", fontWeight: 500, color: isOk ? "var(--pos)" : "var(--neg)", background: isOk ? "var(--pos-soft)" : "var(--neg-soft)", padding: "2px 8px", borderRadius: 99, whiteSpace: "nowrap" }}>
                      {isOk ? "connected" : ca.status}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Personal details */}
        <div style={{ ...accountStyles.section, ...mqSection }}>
          <h3 style={accountStyles.sectionTitle}>Personal details</h3>
          <div style={accountStyles.sectionSub}>— what we know about you</div>
          <div style={{ ...accountStyles.row, ...mqRow }}>
            <div><div style={accountStyles.label}>Full name</div><div style={accountStyles.sub}>shown on invoices</div></div>
            <input style={accountStyles.input} value={form.full_name || ""} onChange={e=>patch("full_name", e.target.value)}/>
            <div/>
          </div>
          <div style={{ ...accountStyles.row, ...mqRow }}>
            <div><div style={accountStyles.label}>Display name</div><div style={accountStyles.sub}>shorter name in the UI</div></div>
            <input style={accountStyles.input} value={form.display_name || ""} onChange={e=>patch("display_name", e.target.value)}/>
            <div/>
          </div>
          <div style={{ ...accountStyles.row, ...mqRow }}>
            <div><div style={accountStyles.label}>Email address</div><div style={accountStyles.sub}>used for login & digests</div></div>
            <input style={{ ...accountStyles.input, color: "var(--ink-3)" }} value={user.email || ""} disabled/>
            <div/>
          </div>
          <div style={{ ...accountStyles.row, ...mqRow }}>
            <div><div style={accountStyles.label}>Phone</div><div style={accountStyles.sub}>optional contact detail</div></div>
            <input style={accountStyles.input} value={form.phone || ""} onChange={e=>patch("phone", e.target.value)}/>
            <div/>
          </div>
          <div style={{ ...accountStyles.row, ...mqRow }}>
            <div><div style={accountStyles.label}>Location</div><div style={accountStyles.sub}>used in digest context</div></div>
            <input style={accountStyles.input} value={form.location || ""} onChange={e=>patch("location", e.target.value)}/>
            <div/>
          </div>
          <div style={{ ...accountStyles.row, ...mqRow }}>
            <div><div style={accountStyles.label}>Default currency</div><div style={accountStyles.sub}>how amounts render</div></div>
            <select style={accountStyles.input} value={form.default_currency || "INR"} onChange={e=>patch("default_currency", e.target.value)}>
              <option value="INR">INR — Indian Rupee ₹</option>
              <option value="USD">USD — US Dollar $</option>
              <option value="EUR">EUR — Euro €</option>
              <option value="GBP">GBP — British Pound £</option>
            </select>
            <div/>
          </div>
          <div style={{ ...accountStyles.row, ...accountStyles.rowLast, ...mqRow }}>
            <div><div style={accountStyles.label}>Timezone</div><div style={accountStyles.sub}>for daily digest timing</div></div>
            <select style={accountStyles.input} value={form.timezone || "Asia/Kolkata"} onChange={e=>patch("timezone", e.target.value)}>
              <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</option>
              <option value="America/Los_Angeles">America/Los_Angeles</option>
              <option value="Europe/London">Europe/London</option>
              <option value="UTC">UTC</option>
            </select>
            <div/>
          </div>
          {saveError && <div style={{ padding: "8px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, marginTop: 14, fontSize: "0.75rem" }}>{saveError}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
            <button onClick={()=>{ setForm(profile); setSaveError(null); }} style={accountStyles.btn}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </div>

        {/* Trial info */}
        {trialEndsAt && (
          <div style={{ ...accountStyles.section, ...mqSection }}>
            <h3 style={accountStyles.sectionTitle}>Trial</h3>
            <div style={{ display: "flex", alignItems: "center", gap: 18, padding: isMobile ? "12px 14px" : "16px 18px", background: (trialDaysLeft || 0) > 3 ? "var(--accent-soft)" : "var(--neg-soft)", borderRadius: 6, marginTop: 10, flexWrap: "wrap" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: "1rem", fontWeight: 500, color: (trialDaysLeft || 0) > 3 ? "var(--accent)" : "var(--neg)" }}>
                  {(trialDaysLeft || 0) > 0 ? `${trialDaysLeft} day${trialDaysLeft !== 1 ? "s" : ""} remaining` : "Trial ended"}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--ink-2)", marginTop: 2 }}>
                  Free trial ends {new Date(trialEndsAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const CAT_ICONS = {
  food:"fork",groceries:"fork",dining:"fork",restaurant:"fork","food & dining":"fork",
  rent:"home",housing:"home",home:"home","rent & home":"home",
  shopping:"bag",retail:"bag",shop:"bag",
  travel:"plane",transport:"plane",flight:"plane",commute:"plane",
  subscriptions:"repeat",subscription:"repeat",entertainment:"repeat",streaming:"repeat",
  utilities:"bolt",utility:"bolt",electricity:"bolt",internet:"bolt",broadband:"bolt",bills:"bolt",
  income:"trend-u",salary:"trend-u",refund:"trend-u",freelance:"trend-u",cashback:"trend-u",
  healthcare:"heart",medical:"heart",health:"heart",
  education:"book",
  emi:"bank",loan:"bank","bank transfer":"bank",
  "upi payment":"arrow-swap",transfer:"arrow-swap",
};
const getCatIcon = (name) => CAT_ICONS[(name||"").toLowerCase().trim()] || "grid";

const FinancialHealthSection = ({ settings, onRefresh }) => {
  const [balance, setBalance] = React.useState(
    settings?.starting_balance != null ? String(Math.round(settings.starting_balance)) : ""
  );
  const [balanceDate, setBalanceDate] = React.useState(settings?.starting_balance_date || "");
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [saveError, setSaveError] = React.useState(null);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await API.patch("/api/account/settings", {
        starting_balance: balance !== "" ? parseFloat(balance) : null,
        starting_balance_date: balanceDate || null,
      });
      await onRefresh();
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err.message || "Could not save");
    }
    setSaving(false);
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Financial Health</h3>
      <div style={accountStyles.sectionSub}>— anchor your balance for runway & savings rate tracking</div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={accountStyles.label}>Starting balance</div>
          <div style={accountStyles.sub}>leave blank to use all tracked transaction history</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>₹</span>
          <input
            type="number"
            min="0"
            placeholder="0"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            style={{ width: 110, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>as of</span>
          <input
            type="date"
            max={today}
            value={balanceDate}
            onChange={e => setBalanceDate(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
          />
          <button onClick={save} disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>
            {saving ? "…" : saved ? <><Icon name="check" size={12} stroke="var(--pos)"/> Saved</> : "Save"}
          </button>
        </div>
        {saveError && <div style={{ fontSize: "0.75rem", color: "var(--neg)", marginTop: 6 }}>{saveError}</div>}
      </div>
    </div>
  );
};

const CategoriesSection = ({ categories, onRefresh }) => {
  const [editing, setEditing] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [newCat, setNewCat] = React.useState({ name: "", color: DEFAULT_CAT_COLOR });
  const [generating, setGenerating] = React.useState(false);
  const [deleting, setDeleting] = React.useState(null);

  const saveEdit = async () => {
    if (!editing?.name?.trim()) return;
    try { await API.patch(`/api/account/categories/${editing.id}`, { name: editing.name.trim(), color: editing.color }); } catch(_) {}
    setEditing(null); onRefresh();
  };

  const addNew = async () => {
    if (!newCat.name.trim()) return;
    try { await API.post("/api/account/categories", { name: newCat.name.trim(), color: newCat.color }); } catch(_) {}
    setAdding(false); setNewCat({ name: "", color: DEFAULT_CAT_COLOR }); onRefresh();
  };

  const doDelete = async (id) => {
    try { await API.delete(`/api/account/categories/${id}`); } catch(_) {}
    setDeleting(null); onRefresh();
  };

  const generate = async () => {
    setGenerating(true);
    try { await API.post("/api/account/categories/generate"); onRefresh(); } catch(_) {}
    setGenerating(false);
  };

  return (
    <div style={accountStyles.section}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
        <h3 style={accountStyles.sectionTitle}>Categories</h3>
        <button onClick={generate} disabled={generating} style={{ ...accountStyles.btn, fontSize:11, display:"flex", alignItems:"center", gap:5 }}>
          <Icon name="sparkle" size={11}/>{generating ? "Generating…" : "Generate from data"}
        </button>
      </div>
      <div style={accountStyles.sectionSub}>— rename, recolor, or add your own</div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(190px, 1fr))", gap:10, marginTop:6 }}>
        {categories.map(c => editing?.id === c.id ? (
          <div key={c.id} style={{ display:"flex", flexDirection:"column", gap:8, padding:"10px 12px", border:"1px solid var(--accent)", borderRadius:6, background:"var(--paper)" }}>
            <input value={editing.name} onChange={e=>setEditing(p=>({...p,name:e.target.value}))}
              onKeyDown={e=>{if(e.key==="Enter")saveEdit();if(e.key==="Escape")setEditing(null);}}
              autoFocus style={{...accountStyles.input,padding:"5px 8px"}}/>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input type="color" value={editing.color} onChange={e=>setEditing(p=>({...p,color:e.target.value}))}
                style={{ width:28, height:28, padding:0, border:"1px solid var(--line)", borderRadius:4, cursor:"pointer", background:"none" }}/>
              <span style={{ fontSize:11, color:"var(--ink-3)", flex:1 }}>color</span>
              <button onClick={saveEdit} style={{...accountStyles.btn,...accountStyles.btnPrimary,padding:"4px 10px",fontSize:11}}>Save</button>
              <button onClick={()=>setEditing(null)} style={{...accountStyles.btn,padding:"4px 8px",fontSize:11}}><Icon name="x" size={12}/></button>
            </div>
          </div>
        ) : deleting === c.id ? (
          <div key={c.id} style={{ display:"flex", flexDirection:"column", gap:6, padding:"10px 12px", border:"1px solid var(--neg-soft)", borderRadius:6, background:"var(--paper)" }}>
            <span style={{ fontSize:12, color:"var(--neg)" }}>Delete "{c.name}"?</span>
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={()=>doDelete(c.id)} style={{...accountStyles.btn,...accountStyles.btnDanger,flex:1,fontSize:11}}>Delete</button>
              <button onClick={()=>setDeleting(null)} style={{...accountStyles.btn,flex:1,fontSize:11}}>Cancel</button>
            </div>
          </div>
        ) : (
          <div key={c.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", border:"1px solid var(--line)", borderRadius:6, background:"var(--paper)", opacity:c.active===false?0.5:1 }}>
            <span style={{ width:28, height:28, borderRadius:6, background:c.color, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <Icon name={getCatIcon(c.name)} size={13} stroke="var(--ink-4)"/>
            </span>
            <span style={{ fontWeight:500, fontSize:13, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.name}</span>
            <button onClick={()=>setEditing({id:c.id,name:c.name,color:c.color})} style={{ border:"none", background:"transparent", cursor:"pointer", color:"var(--ink-3)", padding:2 }} title="Edit">
              <Icon name="edit" size={13}/>
            </button>
            <button onClick={()=>setDeleting(c.id)} style={{ border:"none", background:"transparent", cursor:"pointer", color:"var(--ink-4)", padding:2 }} title="Delete">
              <Icon name="trash" size={13}/>
            </button>
          </div>
        ))}
        {adding ? (
          <div style={{ display:"flex", flexDirection:"column", gap:8, padding:"10px 12px", border:"1px dashed var(--accent)", borderRadius:6, background:"var(--paper)" }}>
            <input value={newCat.name} onChange={e=>setNewCat(p=>({...p,name:e.target.value}))}
              onKeyDown={e=>{if(e.key==="Enter")addNew();if(e.key==="Escape")setAdding(false);}}
              placeholder="Category name…" autoFocus style={{...accountStyles.input,padding:"5px 8px"}}/>
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <input type="color" value={newCat.color} onChange={e=>setNewCat(p=>({...p,color:e.target.value}))}
                style={{ width:28, height:28, padding:0, border:"1px solid var(--line)", borderRadius:4, cursor:"pointer", background:"none" }}/>
              <span style={{ fontSize:11, color:"var(--ink-3)", flex:1 }}>color</span>
              <button onClick={addNew} style={{...accountStyles.btn,...accountStyles.btnPrimary,padding:"4px 10px",fontSize:11}}>Add</button>
              <button onClick={()=>setAdding(false)} style={{...accountStyles.btn,padding:"4px 8px",fontSize:11}}><Icon name="x" size={12}/></button>
            </div>
          </div>
        ) : (
          <button onClick={()=>setAdding(true)} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 12px", border:"1px dashed var(--line)", borderRadius:6, background:"transparent", color:"var(--ink-3)", fontSize:13, cursor:"pointer", justifyContent:"center" }}>
            <Icon name="plus" size={13}/> New category
          </button>
        )}
      </div>
    </div>
  );
};

const InviteSection = ({ account }) => {
  const [invites, setInvites] = React.useState([]);
  const [members, setMembers] = React.useState([]);
  const [newEmail, setNewEmail] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState(null);

  const load = React.useCallback(async () => {
    try {
      const d = await API.get("/api/auth/invitations");
      setInvites(d.invitations || []);
      setMembers(d.members || []);
    } catch (_) {}
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const sendInvite = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setAdding(true);
    setAddError(null);
    try {
      await API.post("/api/auth/invitations", { email });
      setNewEmail("");
      await load();
    } catch (err) {
      setAddError(err.message || "Could not send invite");
    }
    setAdding(false);
  };

  const revoke = async (id) => {
    try {
      await API.delete(`/api/auth/invitations/${id}`);
      await load();
    } catch (_) {}
  };

  const statusBadge = (status) => {
    const colors = { pending: { bg: "var(--accent-soft)", fg: "var(--accent)" }, accepted: { bg: "var(--pos-soft)", fg: "var(--pos)" }, revoked: { bg: "var(--paper-2)", fg: "var(--ink-4)" } };
    const c = colors[status] || colors.revoked;
    return <span style={{ fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: c.bg, color: c.fg, fontWeight: 600, textTransform: "uppercase", marginLeft: 8 }}>{status}</span>;
  };

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Invite People</h3>
      <div style={accountStyles.sectionSub}>— send invitations to let others sign in</div>

      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <input
          value={newEmail}
          onChange={e => setNewEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendInvite()}
          placeholder="friend@email.com"
          style={{ flex: 1, padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
        />
        <button onClick={sendInvite} disabled={adding} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, padding: "7px 14px", fontSize: "0.75rem" }}>Invite</button>
      </div>
      {addError && <div style={{ marginTop: 6, fontSize: "0.6875rem", color: "var(--neg)" }}>{addError}</div>}

      <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
        {invites.filter(i => i.status === "pending").map(inv => (
          <div key={inv.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: "0.8125rem" }}>{inv.email}{statusBadge(inv.status)}</span>
            <button onClick={() => revoke(inv.id)} style={{ fontSize: "0.6875rem", color: "var(--neg)", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit" }}>Revoke</button>
          </div>
        ))}
        {members.map(m => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid var(--line)" }}>
            <span style={{ fontSize: "0.8125rem" }}>
              {m.email}
              {statusBadge("accepted")}
              {m.id === account?.id && <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)", marginLeft: 8 }}>(you)</span>}
            </span>
            <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>{m.name || ""}</span>
          </div>
        ))}
        {(invites.filter(i => i.status === "pending").length === 0 && members.length === 0) && (
          <div style={{ padding: "14px 16px", fontSize: "0.8125rem", color: "var(--ink-4)", fontStyle: "italic", textAlign: "center" }}>
            No invitations yet
          </div>
        )}
      </div>
    </div>
  );
};



// ── SettingsView ──────────────────────────────────────────────

const SettingsView = React.memo(({ syncStatus, setSyncStatus, onRescan, syncing, account, setAccount, theme, setTheme }) => {
  const { isMobile } = useViewport();
  const mq = mqOverrides(isMobile);
  const settings = account?.settings || {};
  const connectedAccounts = account?.connected_accounts || [];
  const categories = account?.categories || [];
  const aiServices = account?.ai_services || [];
  const gmailAccount = connectedAccounts.find(a => a.provider === "gmail");
  const gmailConnected = gmailAccount?.status === "connected";
  const handleDisconnectGmail = async () => {
    if (!gmailAccount) return;
    try {
      await API.delete(`/api/account/connected-accounts/${gmailAccount.id}`);
      setAccount(a => ({
        ...a,
        connected_accounts: a.connected_accounts.filter(c => c.id !== gmailAccount.id),
      }));
    } catch (_) {}
  };
  const [filterSaving, setFilterSaving] = React.useState(false);
  const emptyAiForm = {
    provider: "openai",
    display_name: "OpenAI",
    model_id: "gpt-4o-mini",
    base_url: "https://api.openai.com/v1",
    auth_header: "bearer",
    api_key: "",
    enabled: true,
  };
  const [aiForm, setAiForm] = React.useState(emptyAiForm);
  const [editingAiId, setEditingAiId] = React.useState(null);
  const [editingKeyHint, setEditingKeyHint] = React.useState(null);
  const [aiSaving, setAiSaving] = React.useState(false);
  const [aiError, setAiError] = React.useState(null);
  const [showDeleteModal, setShowDeleteModal] = React.useState(false);
  const [confirmEmail, setConfirmEmail] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState(null);
  const closeDelete = () => setShowDeleteModal(false);
  const [thresholdLocal, setThresholdLocal] = React.useState(null);
  const thresholdTimer = React.useRef(null);
  React.useEffect(() => {
    setThresholdLocal(null);
  }, [settings.confidence_threshold]);
  const [showPasskeyModal, setShowPasskeyModal] = React.useState(false);
  const [showPasskeyDisableConfirm, setShowPasskeyDisableConfirm] = React.useState(false);
  const [passkeyDeviceName, setPasskeyDeviceName] = React.useState("");
  const [passkeyError, setPasskeyError] = React.useState(null);
  const [passkeyVerifying, setPasskeyVerifying] = React.useState(false);
  const [passkeyCredentials, setPasskeyCredentials] = React.useState([]);
  const [showTotpSetup, setShowTotpSetup] = React.useState(false);
  const [showTotpDisableConfirm, setShowTotpDisableConfirm] = React.useState(false);
  const [totpQrUrl, setTotpQrUrl] = React.useState(null);
  const [totpSecret, setTotpSecret] = React.useState(null);
  const [totpCode, setTotpCode] = React.useState("");
  const [totpError, setTotpError] = React.useState(null);
  const [totpVerifying, setTotpVerifying] = React.useState(false);
  const [showExportModal, setShowExportModal] = React.useState(false);
  const [exportDateFrom, setExportDateFrom] = React.useState("");
  const [exportDateTo, setExportDateTo] = React.useState("");
  const [exportJobId, setExportJobId] = React.useState(null);
  const [exportStatus, setExportStatus] = React.useState(null);
  const [exportError, setExportError] = React.useState(null);
  const [budgetValue, setBudgetValue] = React.useState(
    settings.monthly_ai_budget != null ? String(settings.monthly_ai_budget) : ""
  );
  const [llmStatus, setLlmStatus] = React.useState(null);
  const [settingsTab, setSettingsTab] = React.useState("account"); // "account" | "intelligence" | "ai" | "advanced"

  React.useEffect(() => {
    setBudgetValue(settings.monthly_ai_budget != null ? String(settings.monthly_ai_budget) : "");
  }, [settings.monthly_ai_budget]);

  React.useEffect(() => {
    if (!exportJobId || exportStatus === "completed" || exportStatus === "failed") return;
    const interval = setInterval(async () => {
      try {
        const result = await API.get(`/api/export/jobs/${exportJobId}`);
        setExportStatus(result.status);
        if (result.status === "failed") {
          setExportError(result.error || "Export failed");
        }
      } catch (_) {}
    }, 2000);
    return () => clearInterval(interval);
  }, [exportJobId, exportStatus]);

  React.useEffect(() => {
    if (account?.user?.passkeys_enabled) {
      loadPasskeyCredentials();
    }
  }, [account?.user?.passkeys_enabled]);

  const updateSetting = async (key, value) => {
    setAccount(a => ({ ...a, settings: { ...a.settings, [key]: value } }));
    try {
      const result = await API.patch("/api/account/settings", { [key]: value });
      setAccount(a => ({ ...a, settings: result.settings }));
    } catch (e) {
      setAccount(a => ({ ...a, settings }));
      showToast(e?.message || "Could not save setting");
    }
  };

  const syncMeta = () => {
    if (!syncStatus?.last_synced_at) return "Never synced";
    const diff = Math.floor((Date.now() - new Date(syncStatus.last_synced_at)) / 60000);
    const when = diff < 1 ? "just now" : diff < 60 ? `${diff}m ago` : `${Math.floor(diff/60)}h ago`;
    const interval = `every ${syncStatus.sync_interval_hours}h`;
    if (!syncStatus.next_sync_at) return `Last synced ${when} · ${interval}`;
    const nextDiff = Math.max(0, Math.floor((new Date(syncStatus.next_sync_at) - Date.now()) / 60000));
    const next = nextDiff < 1 ? "next now" : nextDiff < 60 ? `next in ${nextDiff}m` : `next in ${Math.floor(nextDiff/60)}h`;
    return `Last synced ${when} · ${next} · ${interval}`;
  };

  const updateEmailFilter = async (emailFilter) => {
    if (filterSaving || emailFilter === (syncStatus?.email_filter || "all")) return;
    setFilterSaving(true);
    try {
      const result = await API.patch("/api/sync/settings", { email_filter: emailFilter });
      setSyncStatus(s => ({ ...(s || {}), email_filter: result.email_filter }));
    } finally {
      setFilterSaving(false);
    }
  };

  const loadPasskeyCredentials = async () => {
    try {
      const result = await API.get("/api/auth/passkey/credentials");
      setPasskeyCredentials(result.credentials || []);
    } catch (_) {}
  };

  const handlePasskeyToggle = async () => {
    if (!account?.user?.passkeys_enabled) {
      setPasskeyDeviceName("");
      setPasskeyError(null);
      setShowPasskeyModal(true);
      await loadPasskeyCredentials();
    } else {
      setShowPasskeyDisableConfirm(true);
    }
  };

  const handleRegisterPasskey = async () => {
    setPasskeyVerifying(true);
    setPasskeyError(null);
    const result = await registerPasskey(passkeyDeviceName.trim() || "Passkey");
    if (result.ok) {
      setAccount(a => ({ ...a, user: { ...a.user, passkeys_enabled: true } }));
      setShowPasskeyModal(false);
      showToast("Passkey enabled");
    } else {
      setPasskeyError(result.error);
    }
    setPasskeyVerifying(false);
  };

  const handleDisablePasskey = async () => {
    try {
      await API.delete("/api/account/passkey");
      setAccount(a => ({ ...a, user: { ...a.user, passkeys_enabled: false } }));
      setShowPasskeyDisableConfirm(false);
      showToast("Passkey disabled");
    } catch (e) {
      showToast(e.message || "Failed to disable passkey");
    }
  };

  const handleDeletePasskey = async (credId) => {
    try {
      await API.delete(`/api/auth/passkey/credentials/${credId}`);
      await loadPasskeyCredentials();
      const updated = passkeyCredentials.filter(c => c.id !== credId);
      if (updated.length === 0) {
        setAccount(a => ({ ...a, user: { ...a.user, passkeys_enabled: false } }));
      }
      showToast("Passkey removed");
    } catch (e) {
      showToast(e.message || "Failed to remove passkey");
    }
  };

  const handleTotpToggle = async () => {
    if (!account?.user?.totp_enabled) {
      const result = await setupTOTP();
      if (result.error) {
        showToast(result.error);
      } else {
        setTotpQrUrl(result.qr_url);
        setTotpSecret(result.secret);
        setTotpCode("");
        setTotpError(null);
        setShowTotpSetup(true);
      }
    } else {
      setShowTotpDisableConfirm(true);
    }
  };

  const handleVerifyTotp = async () => {
    setTotpVerifying(true);
    setTotpError(null);
    const result = await verifyTOTP(totpCode);
    if (result.ok) {
      setAccount(a => ({ ...a, user: { ...a.user, totp_enabled: true } }));
      setShowTotpSetup(false);
      showToast("Two-factor authentication enabled");
    } else {
      setTotpError(result.error);
    }
    setTotpVerifying(false);
  };

  const handleDisableTotp = async () => {
    const result = await disableTOTP();
    if (result.ok) {
      setAccount(a => ({ ...a, user: { ...a.user, totp_enabled: false } }));
      setShowTotpDisableConfirm(false);
      showToast("Two-factor authentication disabled");
    } else {
      showToast(result.error);
    }
  };

  const editAiService = (service) => {
    setEditingAiId(service.id);
    setAiForm({
      provider: service.provider || "custom",
      display_name: service.display_name || "",
      model_id: service.model_id || "",
      base_url: service.base_url || "",
      auth_header: service.auth_header || "bearer",
      api_key: "",  // Not shown; if empty on save, existing key is preserved
      enabled: service.enabled !== false,
    });
    setEditingKeyHint(service.api_key_hint || "••••••••");
    setAiError(null);
  };

  const resetAiForm = () => {
    setEditingAiId(null);
    setAiForm(emptyAiForm);
    setAiError(null);
  };

  const saveAiService = async () => {
    if (!aiForm.display_name.trim() || !aiForm.model_id.trim()) {
      setAiError("Display name and model ID are required.");
      return;
    }
    setAiSaving(true);
    setAiError(null);
    const body = {
      provider: aiForm.provider,
      display_name: aiForm.display_name.trim(),
      model_id: aiForm.model_id.trim(),
      base_url: aiForm.base_url.trim() || null,
      auth_header: aiForm.auth_header,
      enabled: !!aiForm.enabled,
    };
    if (aiForm.api_key.trim()) body.api_key = aiForm.api_key.trim();
    try {
      const result = editingAiId
        ? await API.patch(`/api/account/ai-services/${editingAiId}`, body)
        : await API.post("/api/account/ai-services", body);
      const shouldActivateFirstService = !editingAiId && aiServices.length === 0 && !settings.active_ai_service_id;
      const settingsResult = shouldActivateFirstService
        ? await API.patch("/api/account/settings", { active_ai_service_id: result.ai_service.id })
        : null;
      setAccount(prev => {
        const existing = prev.ai_services || [];
        const next = editingAiId
          ? existing.map(s => s.id === editingAiId ? result.ai_service : s)
          : [...existing, result.ai_service];
        return {
          ...prev,
          ai_services: next,
          settings: settingsResult?.settings || prev.settings,
        };
      });
      resetAiForm();
    } catch (err) {
      setAiError(err.message || "Could not save AI service.");
    } finally {
      setAiSaving(false);
    }
  };

  const toggleAiService = async (service) => {
    const result = await API.patch(`/api/account/ai-services/${service.id}`, { enabled: !service.enabled });
    const shouldClearActive = service.enabled && settings.active_ai_service_id === service.id;
    const settingsResult = shouldClearActive
      ? await API.patch("/api/account/settings", { active_ai_service_id: null })
      : null;
    setAccount(prev => ({
      ...prev,
      ai_services: (prev.ai_services || []).map(s => s.id === service.id ? result.ai_service : s),
      settings: settingsResult?.settings || prev.settings,
    }));
  };

  const deleteAiService = async (service) => {
    if (!window.confirm(`Delete ${service.display_name}?`)) return;
    await API.delete(`/api/account/ai-services/${service.id}`);
    setAccount(prev => ({
      ...prev,
      ai_services: (prev.ai_services || []).filter(s => s.id !== service.id),
      settings: prev.settings?.active_ai_service_id === service.id
        ? { ...prev.settings, active_ai_service_id: null }
        : prev.settings,
    }));
    if (settings.active_ai_service_id === service.id) {
      await API.patch("/api/account/settings", { active_ai_service_id: null });
    }
    if (editingAiId === service.id) resetAiForm();
  };

  const saveAiBudget = async () => {
    const value = budgetValue.trim() === "" ? null : Number(budgetValue);
    if (value !== null && (!Number.isFinite(value) || value < 0)) return;
    await updateSetting("monthly_ai_budget", value);
  };

  return (
    <div style={{ ...accountStyles.wrap, ...mq.wrap }}>
      <div style={{ ...accountStyles.inner, ...mq.inner }}>
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>Preferences</div>
        <h1 style={{ ...accountStyles.h1, ...mq.h1 }}>Settings</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", gap: isMobile ? 4 : 6, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
        <TabBtn compact={isMobile} active={settingsTab === "account"} onClick={() => setSettingsTab("account")}>Account & Billing</TabBtn>
        <TabBtn compact={isMobile} active={settingsTab === "intelligence"} onClick={() => setSettingsTab("intelligence")}>Inbox Intelligence</TabBtn>
        <TabBtn compact={isMobile} active={settingsTab === "ai"} onClick={() => setSettingsTab("ai")}>AI Services</TabBtn>
        {account?.role === "owner" && (
          <AdminTabBtn compact={isMobile} active={settingsTab === "advanced"} onClick={() => setSettingsTab("advanced")}>Advanced</AdminTabBtn>
        )}
      </div>

      {/* ── Tab 1: Account & Billing ─────────────────────────── */}
      {settingsTab === "account" && (<>

      {/* Inbox Connection */}
      <SettingsSection title="Inbox connection" subtitle="— the source of truth for your transactions">
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: isMobile ? "12px 14px" : "16px 18px", background: "var(--paper-2)", borderRadius: 6, marginTop: 6, flexWrap: "wrap" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
            <Icon name="gmail" size={18} stroke="var(--accent)"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Gmail
              <span style={{ fontSize: "0.625rem", padding: "2px 7px", borderRadius: 3, background: gmailConnected ? "var(--pos-soft)" : "var(--neg-soft)", color: gmailConnected ? "var(--pos)" : "var(--neg)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 6, height: 6, borderRadius: 999, background: gmailConnected ? "var(--pos)" : "var(--neg)", display: "inline-block" }}/>
                {gmailConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 }}>{syncMeta()}</div>
            {gmailAccount?.account_email && (
              <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>
                {gmailAccount.account_email}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gmailConnected ? (
              <>
                <button onClick={onRescan} disabled={syncing} style={{ ...accountStyles.btn, opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "Syncing\u2026" : "Re-sync"}
                </button>
                <button onClick={handleDisconnectGmail} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Disconnect</button>
              </>
            ) : (
              <button onClick={() => window.location.href = "/api/auth/google"} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Connect Gmail</button>
            )}
          </div>
        </div>
        <SettingsRow label="Messages to scan" description="which Gmail messages to process">
          <div role="radiogroup" aria-label="Messages to scan" style={{ display: "inline-flex", padding: 3, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)" }}>
            {[["all", "All"],["unread", "Unread"],["read", "Read"]].map(([value, label]) => {
              const active = (syncStatus?.email_filter || "all") === value;
              return (
                <button key={value} type="button" role="radio" aria-checked={active} disabled={filterSaving} onClick={() => updateEmailFilter(value)}
                  style={{ padding: "6px 12px", border: "none", borderRadius: 4, background: active ? "var(--ink)" : "transparent", color: active ? "var(--paper)" : "var(--ink-3)", fontSize: "0.6875rem", fontWeight: 600, cursor: filterSaving ? "default" : "pointer", fontFamily: "inherit", outline: "none", opacity: filterSaving && !active ? 0.45 : 1, transition: "background 120ms ease, color 120ms ease, opacity 120ms ease" }}
                  onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}
                >{label}</button>
              );
            })}
          </div>
        </SettingsRow>
        <SettingsRow label="Sync panel position" description="where the sync progress overlay appears" last>
          <div role="radiogroup" aria-label="Sync panel position" style={{ display: "inline-flex", padding: 3, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)" }}>
            {[["bottom-right", "Bottom Right"],["bottom-center", "Bottom Center"],["bottom-left", "Bottom Left"]].map(([value, label]) => {
              const active = ((window as any)._syncPanelPosition || localStorage.getItem("mf_sync_panel_pos") || "bottom-right") === value;
              return (
                <button key={value} type="button" role="radio" aria-checked={active}
                  onClick={() => { localStorage.setItem("mf_sync_panel_pos", value); (window as any)._syncPanelPosition = value; window.dispatchEvent(new CustomEvent("sync-pos-change", { detail: value })); }}
                  style={{ padding: "6px 12px", border: "none", borderRadius: 4, background: active ? "var(--ink)" : "transparent", color: active ? "var(--paper)" : "var(--ink-3)", fontSize: "0.6875rem", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", outline: "none", transition: "background 120ms ease, color 120ms ease" }}
                  onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}
                >{label}</button>
              );
            })}
          </div>
        </SettingsRow>
      </SettingsSection>

      {/* Financial Health */}
      <FinancialHealthSection settings={settings} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.settings) setAccount(prev => ({ ...prev, settings: d.settings }));
      }} />

      {/* Notifications */}
      <SettingsSection title="Notifications" subtitle="— what we tell you, and when">
        <SettingsRow label="Daily digest email" description="one summary at 9:00 IST">
          <Toggle checked={!!settings.daily_digest} onChange={v=>updateSetting("daily_digest", v)}/>
        </SettingsRow>
        <SettingsRow label="Low-confidence alerts" description="ping when a new merchant isn't recognized">
          <Toggle checked={!!settings.low_confidence_alerts} onChange={v=>updateSetting("low_confidence_alerts", v)}/>
        </SettingsRow>
        <SettingsRow label="Sound effects" description="subtle click on transaction confirm" last>
          <Toggle checked={!!settings.sound_effects} onChange={v=>updateSetting("sound_effects", v)}/>
        </SettingsRow>
      </SettingsSection>

      {/* Categories */}
      <CategoriesSection categories={categories} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.categories) setAccount(prev => ({ ...prev, categories: d.categories }));
      }} />

      {/* LLM Budget */}
      <SettingsSection title="LLM Budget" subtitle="— monthly cap on AI classification costs">
        <SettingsRow label="Monthly AI budget" description="leave blank for unlimited" last>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input type="number" min="0" placeholder="\u221E" value={budgetValue}
              onChange={e => setBudgetValue(e.target.value)} onBlur={saveAiBudget}
              style={{ width: 120, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", outline: "none", fontFamily: "inherit" }}/>
            <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>USD / month</span>
          </div>
        </SettingsRow>
      </SettingsSection>

      <TrialInfoBanner />

      {/* Security & Privacy */}
      <SettingsSection title="Security & privacy" subtitle="— your numbers, locked down">
        <SettingsRow label="Passkeys" description="Biometrics or platform authenticator">
          <Toggle checked={!!account?.user?.passkeys_enabled} onChange={handlePasskeyToggle}/>
        </SettingsRow>
        {account?.user?.passkeys_enabled && passkeyCredentials.length > 0 && (
          <div style={{ padding: "0 0 8px" }}>
            {passkeyCredentials.map(c => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px dashed var(--line)" }}>
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)" }}>{c.device_name}</div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>Added {c.created_at ? new Date(c.created_at).toLocaleDateString() : ""}</div>
                </div>
                <button style={{ ...accountStyles.btn, ...accountStyles.btnDanger, padding: "6px 14px", fontSize: "0.6875rem" }} onClick={() => handleDeletePasskey(c.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <SettingsRow label="Authenticator app (TOTP)" description="Time-based codes from Google Authenticator, Authy, etc.">
          <Toggle checked={!!account?.user?.totp_enabled} onChange={handleTotpToggle}/>
        </SettingsRow>
        <SettingsRow label="Export all data" description="CSV of every parsed transaction" last>
          <button style={accountStyles.btn} onClick={() => {
            setShowExportModal(true);
            setExportDateFrom("");
            setExportDateTo("");
            setExportJobId(null);
            setExportStatus(null);
            setExportError(null);
          }}><Icon name="arrow-u-r" size={12}/> Export</button>
        </SettingsRow>
      </SettingsSection>

      {/* Danger Zone */}
      <SettingsSection title="Danger zone" subtitle="— irreversible things" danger={true}>
        {account?.scheduled_deletion_at && new Date(account.scheduled_deletion_at) > new Date() && (
          <div style={{ padding: 12, borderRadius: 8, background: "var(--neg-soft)", border: "1px solid var(--neg)", marginBottom: 12, fontSize: "0.75rem", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 600, color: "var(--neg)", marginBottom: 4 }}>Account deletion scheduled</div>
            <div style={{ color: "var(--ink-2)", marginBottom: 8 }}>
              Your account is scheduled for deletion on{" "}
              {new Date(account.scheduled_deletion_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}.
              You can cancel this at any time.
            </div>
            <button
              onClick={async () => {
                try {
                  await API.post("/api/account/cancel-deletion");
                  setAccount(a => ({ ...a, scheduled_deletion_at: null }));
                } catch (e) {
                  alert("Failed to cancel: " + (e.message || "Unknown error"));
                }
              }}
              style={{ padding: "6px 14px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 6, fontSize: "0.6875rem", cursor: "pointer", fontFamily: "inherit" }}
            >Cancel deletion</button>
          </div>
        )}
        {!account?.scheduled_deletion_at && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <button style={{ ...accountStyles.btn, ...accountStyles.btnDanger }} onClick={() => { setShowDeleteModal(true); setConfirmEmail(""); setDeleteError(null); }}>Delete account…</button>
          </div>
        )}
      </SettingsSection>

      {/* Delete modal */}
      {showDeleteModal && (
        <Modal open={showDeleteModal} onClose={closeDelete} title="Delete account" width={420} danger>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.5 }}>
            This permanently deletes all your transactions, categories, budgets, and Gmail connection. There is no undo.
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 8 }}>
            Type your email to confirm: <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink)" }}>{account?.email}</span>
          </div>
          <input value={confirmEmail} onChange={e => setConfirmEmail(e.target.value)}
            placeholder={account?.email}
            style={{ ...accountStyles.input, marginBottom: 16 }} autoFocus />
          {deleteError && <div style={{ color: "var(--neg)", fontSize: "0.75rem", marginBottom: 12 }}>{deleteError}</div>}
          {deleting && !deleteError && (
            <div style={{ color: "var(--ink-3)", fontSize: "0.75rem", marginBottom: 12, lineHeight: 1.5, padding: 10, background: "var(--paper)", borderRadius: 6 }}>
              Your account will be permanently deleted within the next 24 to 48 hours. You have been signed out.
              If this was a mistake, sign back in and cancel from Settings before the deletion date.
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={accountStyles.btn} onClick={closeDelete} disabled={deleting}>Cancel</button>
            <button style={{ ...accountStyles.btn, ...accountStyles.btnDanger, opacity: (confirmEmail.toLowerCase() === account?.email?.toLowerCase() && !deleting) ? 1 : 0.4 }}
              disabled={confirmEmail.toLowerCase() !== account?.email?.toLowerCase() || deleting}
              onClick={async () => {
                setDeleting(true); setDeleteError(null);
                try { const resp = await API.patch("/api/account/schedule-deletion"); setDeleting(false); closeDelete(); setAccount(a => ({ ...a, scheduled_deletion_at: resp.deletion_at })); }
                catch (e) { setDeleteError(e.message || "Failed to schedule deletion. Try again."); setDeleting(false); }
              }}
            >{deleting ? "Scheduling…" : "Delete account"}</button>
          </div>
        </Modal>
      )}

      {/* Passkey setup modal */}
      {showPasskeyModal && (
        <Modal open={showPasskeyModal} onClose={() => setShowPasskeyModal(false)} title="Set up passkey" width={420}>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.5 }}>
            Your browser will prompt you to use your device's biometrics (Touch ID, Face ID) or a security key.
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 8 }}>Device name (optional):</div>
          <input value={passkeyDeviceName} onChange={e => setPasskeyDeviceName(e.target.value)}
            placeholder="e.g. MacBook Air" style={{ ...accountStyles.input, marginBottom: 16 }} autoFocus />
          {passkeyError && <div style={{ color: "var(--neg)", fontSize: "0.75rem", marginBottom: 12 }}>{passkeyError}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={accountStyles.btn} onClick={() => setShowPasskeyModal(false)} disabled={passkeyVerifying}>Cancel</button>
            <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: passkeyVerifying ? 0.4 : 1 }}
              disabled={passkeyVerifying} onClick={handleRegisterPasskey}
            >{passkeyVerifying ? "Setting up…" : "Register passkey"}</button>
          </div>
        </Modal>
      )}

      {/* Passkey disable confirm */}
      {showPasskeyDisableConfirm && (
        <Modal open={showPasskeyDisableConfirm} onClose={() => setShowPasskeyDisableConfirm(false)} title="Disable passkeys?" width={400}>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.5 }}>
            Are you sure you want to disable passkey authentication? All registered passkeys will be removed, and your account will be less secure.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={accountStyles.btn} onClick={() => setShowPasskeyDisableConfirm(false)}>Cancel</button>
            <button style={{ ...accountStyles.btnDanger, padding: "6px 14px", fontSize: "0.6875rem" }} onClick={handleDisablePasskey}>Disable</button>
          </div>
        </Modal>
      )}

      {/* TOTP setup modal */}
      {showTotpSetup && (
        <Modal open={showTotpSetup} onClose={() => setShowTotpSetup(false)} title="Set up authenticator app" width={420}>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.5 }}>
            Scan this QR code with your authenticator app (Google Authenticator, Authy, etc.), then enter the 6-digit code to verify.
          </div>
          {totpQrUrl && (
            <div style={{ textAlign: "center", marginBottom: 16 }}>
              <img src={totpQrUrl} alt="TOTP QR code" style={{ width: 180, height: 180, borderRadius: 8, border: "1px solid var(--line)" }} />
            </div>
          )}
          {totpSecret && (
            <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", textAlign: "center", marginBottom: 16 }}>
              Or enter this key manually: <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink)", fontWeight: 500, userSelect: "all" }}>{totpSecret}</span>
            </div>
          )}
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 8 }}>Verification code:</div>
          <input value={totpCode} onChange={e => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000" style={{ ...accountStyles.input, marginBottom: 16, textAlign: "center", fontSize: "1.125rem", letterSpacing: "0.3em", fontFamily: "'Geist Mono', monospace" }}
            maxLength={6} autoFocus />
          {totpError && <div style={{ color: "var(--neg)", fontSize: "0.75rem", marginBottom: 12 }}>{totpError}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={accountStyles.btn} onClick={() => setShowTotpSetup(false)} disabled={totpVerifying}>Cancel</button>
            <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: totpCode.length !== 6 || totpVerifying ? 0.4 : 1 }}
              disabled={totpCode.length !== 6 || totpVerifying} onClick={handleVerifyTotp}
            >{totpVerifying ? "Verifying…" : "Verify"}</button>
          </div>
        </Modal>
      )}

      {/* TOTP disable confirm */}
      {showTotpDisableConfirm && (
        <Modal open={showTotpDisableConfirm} onClose={() => setShowTotpDisableConfirm(false)} title="Disable two-factor authentication?" width={400}>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.5 }}>
            Are you sure you want to disable TOTP two-factor authentication? Your account will be less secure.
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={accountStyles.btn} onClick={() => setShowTotpDisableConfirm(false)}>Cancel</button>
            <button style={{ ...accountStyles.btnDanger, padding: "6px 14px", fontSize: "0.6875rem" }} onClick={handleDisableTotp}>Disable</button>
          </div>
        </Modal>
      )}

      {/* Export modals */}
      {showExportModal && !exportJobId && (
        <Modal open={showExportModal && !exportJobId} onClose={() => setShowExportModal(false)} title="Export transactions" width={420}>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 20, lineHeight: 1.5 }}>
            Your export will be prepared in the background. You can optionally filter by date range.
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>From</div>
            <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)} style={{ ...accountStyles.input }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)", marginBottom: 6 }}>To</div>
            <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)} style={{ ...accountStyles.input }} />
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button style={accountStyles.btn} onClick={() => setShowExportModal(false)}>Cancel</button>
            <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }} onClick={async () => {
              try { const body = {}; if (exportDateFrom) body.date_from = exportDateFrom; if (exportDateTo) body.date_to = exportDateTo; const result = await API.post("/api/export", body); setExportJobId(result.id); setExportStatus("queued"); }
              catch (e) { setExportError(e.message || "Failed to start export"); }
            }}>Start export</button>
          </div>
          {exportError && <div style={{ color: "var(--neg)", fontSize: "0.75rem", marginTop: 12 }}>{exportError}</div>}
        </Modal>
      )}
      {showExportModal && exportJobId && (
        <Modal open={showExportModal && exportJobId !== null} onClose={() => { setShowExportModal(false); setExportJobId(null); }} title="Exporting…" width={420}>
          {exportStatus === "queued" && <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)", marginBottom: 16 }}>Your export has been queued and will start shortly.</div>}
          {exportStatus === "processing" && <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)", marginBottom: 16 }}>Generating your CSV…</div>}
          {exportStatus === "completed" && <div style={{ fontSize: "0.8125rem", color: "var(--pos)", marginBottom: 16 }}>Your export is ready!</div>}
          {exportStatus === "failed" && <div style={{ fontSize: "0.8125rem", color: "var(--neg)", marginBottom: 16 }}>{exportError || "Export failed. Please try again."}</div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            {exportStatus === "completed" ? (
              <><button style={accountStyles.btn} onClick={() => { setShowExportModal(false); setExportJobId(null); }}>Close</button>
              <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }} onClick={() => { window.location.href = `/api/export/jobs/${exportJobId}/download`; }}>Download</button></>
            ) : exportStatus === "failed" ? (
              <button style={accountStyles.btn} onClick={() => { setExportJobId(null); setExportStatus(null); setExportError(null); }}>Try again</button>
            ) : (
              <button style={accountStyles.btn} onClick={() => { setShowExportModal(false); setExportJobId(null); setExportStatus(null); }}>Close</button>
            )}
          </div>
        </Modal>
      )}

      {account?.role === "owner" && (
        <InviteSection account={account} />
      )}

      </>)}

      {/* ── Tab 2: Inbox Intelligence ─────────────────────────── */}
      {settingsTab === "intelligence" && (<>

      {/* Classification */}
      <SettingsSection title="Classification" subtitle="— how smart the inbox should be">
        <SettingsRow label="Auto-categorize new transactions" description="use the model to guess Food, Rent, etc.">
          <Toggle checked={!!settings.auto_categorize} onChange={v=>updateSetting("auto_categorize", v)}/>
        </SettingsRow>
        <SettingsRow label="Show AI confidence on cards" description="small bar next to each transaction">
          <Toggle checked={!!settings.show_confidence} onChange={v=>updateSetting("show_confidence", v)}/>
        </SettingsRow>
        <SettingsRow label="Confidence threshold" description="flag transactions below this certainty">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="range" min="50" max="95"
              value={thresholdLocal ?? settings.confidence_threshold ?? 70}
              onChange={e => { const v = Number(e.target.value); setThresholdLocal(v); if (thresholdTimer.current) clearTimeout(thresholdTimer.current); thresholdTimer.current = setTimeout(() => updateSetting("confidence_threshold", v), 250); }}
              style={{ flex: 1 }}/>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: "var(--ink-2)", minWidth: 40, textAlign: "right" }}>{thresholdLocal ?? settings.confidence_threshold ?? 70}%</span>
          </div>
        </SettingsRow>
        <SettingsRow label="Rule-based pre-filter" description="skip LLM for known senders and obvious non-financial emails — saves tokens" last>
          <Toggle checked={settings.use_rule_engine !== false} onChange={v=>updateSetting("use_rule_engine", v)}/>
        </SettingsRow>
      </SettingsSection>

      {/* Active AI Service */}
      <SettingsSection title="Active AI Service" subtitle="— pick which service classifies your emails">
        <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6 }}>
          <select style={{ ...accountStyles.input, maxWidth: 420 }}
            value={settings.active_ai_service_id || "default"}
            onChange={e => updateSetting("active_ai_service_id", e.target.value === "default" ? null : e.target.value)}>
            <option value="default">— none (rule-based fallback only) —</option>
            {aiServices.filter(s => s.enabled !== false || s.id === settings.active_ai_service_id).map(s => (
              <option key={s.id} value={s.id}>{s.display_name} · {s.model_id}{s.enabled === false ? " (disabled)" : ""}</option>
            ))}
          </select>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-4)", marginTop: 8 }}>
            {settings.active_ai_service_id
              ? "Used for email classification and inbox recategorization."
              : "No service selected — classification falls back to rules only."}
          </div>
        </div>
      </SettingsSection>

      {/* Sender Domain Rules */}
      <SenderRulesSection categories={categories} />

      </>)}

      {/* ── Tab 3: AI Services ────────────────────────────────── */}
      {settingsTab === "ai" && (<>
        <TrialInfoBanner />

        {/* LLM Providers */}
        <SettingsSection title="LLM Providers" subtitle="— custom services + server-configured providers in priority order"
          action={<button style={{ ...accountStyles.btn, display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => API.get("/api/llm/status").then(setLlmStatus).catch(() => {})}>
            <Icon name="repeat" size={14}/> Refresh
          </button>}
        >
          {aiServices.length === 0 && (!llmStatus || llmStatus.providers.length === 0) ? (
            <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>No providers configured. Add a custom service below.</div>
          ) : (
            <div style={{ overflowX: "auto", marginBottom: 16 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                <thead>
                  <tr>
                    {["Service","Model",""].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 }}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {aiServices.map(svc => (
                    <tr key={svc.id}>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.8125rem", fontWeight: 600 }}>
                        {svc.display_name}
                        {svc.id === settings.active_ai_service_id && <span style={{ marginLeft: 8, fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: "var(--ink)", color: "var(--paper)", fontWeight: 600, textTransform: "uppercase" }}>Active</span>}
                      </td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.75rem", fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>{svc.model_id}</td>
                      <td style={{ padding: "11px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.8125rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        {svc.id !== settings.active_ai_service_id && svc.enabled && (
                          <button onClick={() => updateSetting("active_ai_service_id", svc.id)} style={{ ...accountStyles.btn, padding: "4px 10px", fontSize: "0.6875rem", marginRight: 4 }}>Set active</button>
                        )}
                        <button onClick={() => editAiService(svc)} style={{ ...accountStyles.btn, padding: "4px 10px", fontSize: "0.6875rem", marginRight: 4 }}>Edit</button>
                        <button onClick={() => deleteAiService(svc)} style={{ ...accountStyles.btn, ...accountStyles.btnDanger, padding: "4px 10px", fontSize: "0.6875rem" }}>Delete</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add/Edit service form */}
          <details open={!!editingAiId}>
            <summary style={{ fontSize: "0.75rem", color: "var(--ink-3)", cursor: "pointer", userSelect: "none", padding: "6px 0" }}>
              {editingAiId ? "Edit service" : "Add custom service"}
            </summary>
            <div style={{ marginTop: 12, padding: "16px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Display name</div>
                  <input style={accountStyles.input} value={aiForm.display_name} onChange={e => setAiForm({ ...aiForm, display_name: e.target.value })} placeholder="e.g. My OpenAI"/>
                </div>
                <div>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Model ID</div>
                  <input style={accountStyles.input} value={aiForm.model_id} onChange={e => setAiForm({ ...aiForm, model_id: e.target.value })} placeholder="gpt-4o-mini"/>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Base URL</div>
                <input style={accountStyles.input} value={aiForm.base_url} onChange={e => setAiForm({ ...aiForm, base_url: e.target.value })} placeholder="https://api.cloudflare.com/client/v4/accounts/\u2026/ai/run"/>
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>API key</div>
                  {editingKeyHint && <span style={{ fontSize: "0.625rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>Current: {editingKeyHint}</span>}
                </div>
                <input type="password" style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} value={aiForm.api_key} onChange={e => setAiForm({ ...aiForm, api_key: e.target.value })} placeholder={editingAiId ? "enter new key to update" : "sk-\u2026"}/>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Auth</div>
                  <select style={{ ...accountStyles.input, width: 160 }} value={aiForm.auth_header} onChange={e => setAiForm({ ...aiForm, auth_header: e.target.value })}>
                    <option value="bearer">Authorization: Bearer</option>
                    <option value="x-api-key">x-api-key</option>
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Enabled</div>
                  <div style={{ height: 35, display: "flex", alignItems: "center" }}>
                    <Toggle checked={!!aiForm.enabled} onChange={v => setAiForm({ ...aiForm, enabled: v })}/>
                  </div>
                </div>
                <div style={{ flex: 1, textAlign: "right" }}>
                  {editingAiId && <button onClick={() => { setEditingAiId(null); setAiForm(emptyAiForm); }} style={{ ...accountStyles.btn, marginRight: 8 }}>Cancel</button>}
                  <button onClick={saveAiService} disabled={aiSaving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: aiSaving ? 0.65 : 1 }}>
                    {aiSaving ? "Saving\u2026" : editingAiId ? "Save changes" : "Save service"}
                  </button>
                </div>
              </div>
              {aiError && <div style={{ padding: "8px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.75rem", marginTop: 14 }}>{aiError}</div>}
            </div>
          </details>
        </SettingsSection>

        {/* Classifier Tester */}
        <AdminClassifySection />
      </>)}

      {/* ── Tab 4: Advanced (owner only) ──────────────────────── */}
      {settingsTab === "advanced" && account?.role === "owner" && (
        <>
          <AdminLLMSection account={account} settings={settings} />
          <AdminBackfillBodiesSection />
          <AdminFetchRangeSection />
          <AdminSyncSection />
          <AdminFetchPreviewSection />
          <AdminClassifySection />
          <AdminDomainRulesSection />
          <AdminCleanBodiesSection />
          <AdminAlertsSection />
          <PatternRulesSection categories={categories} />
          <MerchantAliasesSection categories={categories} />
          <FilterRulesSection />
          <BuiltinRulesSection />
        </>
      )}

      </div>
    </div>
  );
 });


Object.assign((window as any), { OnboardingView, ProfileView, SettingsView, CategoriesSection, FinancialHealthSection, InviteSection });
