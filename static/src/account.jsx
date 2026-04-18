// Profile & Settings views

const accountStyles = {
  wrap: { padding: "32px 40px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100vh - 72px)", maxWidth: 920, margin: "0 auto" },
  header: { marginBottom: 28 },
  kicker: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 },
  h1: { fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", margin: "4px 0 0" },
  section: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "24px 28px", marginBottom: 16 },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, margin: "0 0 4px" },
  sectionSub: { fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: 14, marginBottom: 18 },
  row: { display: "grid", gridTemplateColumns: "220px 1fr auto", gap: 20, alignItems: "center", padding: "14px 0", borderBottom: "1px dashed var(--line)" },
  rowLast: { borderBottom: "none" },
  label: { fontSize: 13, fontWeight: 500, color: "var(--ink)" },
  sub: { fontSize: 11, color: "var(--ink-3)", marginTop: 2 },
  input: { padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", width: "100%" },
  btn: { padding: "8px 14px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" },
  btnPrimary: { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" },
  btnDanger: { background: "var(--neg-soft)", color: "var(--neg)", borderColor: "var(--neg-soft)" },
  toggle: { width: 36, height: 20, borderRadius: 20, padding: 2, border: "none", cursor: "pointer", transition: "background 160ms", display: "flex", alignItems: "center" },
  toggleKnob: { width: 16, height: 16, borderRadius: 999, background: "white", transition: "transform 160ms", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" },
};

const Toggle = ({ on, onChange }) => (
  <button onClick={()=>onChange(!on)} style={{ ...accountStyles.toggle, background: on ? "var(--pos)" : "var(--ink-4)" }}>
    <span style={{ ...accountStyles.toggleKnob, transform: on ? "translateX(16px)" : "translateX(0)" }}/>
  </button>
);

const ProfileView = ({ transactions }) => {
  const totalIncome = transactions.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0);
  const totalExpense = transactions.filter(t=>t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);
  const parsed = transactions.length;
  return (
    <div style={accountStyles.wrap}>
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>Your account</div>
        <h1 style={accountStyles.h1}>Profile</h1>
      </div>

      <div style={accountStyles.section}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 10 }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, background: "var(--cat-travel)", color: "var(--cat-travel-ink)", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 600, fontFamily: "'Fraunces', serif" }}>AK</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em" }}>Ananya Kapoor</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>ananya@acme.in · Bengaluru, IN</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6, fontFamily: "'Geist Mono', monospace" }}>Member since Jan 2026 · Plan: <span style={{ color: "var(--accent)", fontWeight: 600 }}>Moneyflow Pro</span></div>
          </div>
          <button style={{ ...accountStyles.btn }}><Icon name="edit" size={13}/> Change photo</button>
        </div>
      </div>

      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Your year, so far</h3>
        <div style={accountStyles.sectionSub}>— a quiet summary, not a scoreboard</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, marginTop: 6 }}>
          {[
            { label: "Emails parsed", value: parsed, sub: "April 2026" },
            { label: "Income tracked", value: "₹" + totalIncome.toLocaleString("en-IN"), sub: "2 sources", color: "var(--pos)" },
            { label: "Expenses tracked", value: "₹" + totalExpense.toLocaleString("en-IN"), sub: `${transactions.filter(t=>t.amount<0).length} transactions` },
          ].map((k,i)=>(
            <div key={i} style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>{k.label}</div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 400, marginTop: 4, color: k.color || "var(--ink)" }}>{k.value}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{k.sub}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Personal details</h3>
        <div style={accountStyles.sectionSub}>— what we know about you</div>

        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Full name</div><div style={accountStyles.sub}>shown on invoices</div></div>
          <input style={accountStyles.input} defaultValue="Ananya Kapoor"/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Email address</div><div style={accountStyles.sub}>used for login & digests</div></div>
          <input style={accountStyles.input} defaultValue="ananya@acme.in"/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Default currency</div><div style={accountStyles.sub}>how amounts render</div></div>
          <select style={accountStyles.input} defaultValue="INR">
            <option>INR — Indian Rupee ₹</option>
            <option>USD — US Dollar $</option>
            <option>EUR — Euro €</option>
            <option>GBP — British Pound £</option>
          </select>
          <div/>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Timezone</div><div style={accountStyles.sub}>for daily digest timing</div></div>
          <select style={accountStyles.input} defaultValue="IST">
            <option>IST — Asia/Kolkata (UTC+5:30)</option>
            <option>PST — America/Los_Angeles</option>
            <option>GMT — Europe/London</option>
          </select>
          <div/>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button style={accountStyles.btn}>Cancel</button>
          <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Save changes</button>
        </div>
      </div>

      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Plan & billing</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 18px", background: "var(--accent-soft)", borderRadius: 6, marginTop: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, color: "var(--accent)" }}>Moneyflow Pro</div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 2 }}>Unlimited inbox parsing, multi-account Sankey, daily digest · ₹499/month</div>
          </div>
          <button style={accountStyles.btn}>Manage plan</button>
        </div>
      </div>
    </div>
  );
};

const SettingsView = ({ syncStatus, onRescan, syncing }) => {
  const [digest, setDigest] = React.useState(true);
  const [lowConf, setLowConf] = React.useState(true);
  const [autoCat, setAutoCat] = React.useState(true);
  const [twoFA, setTwoFA] = React.useState(false);
  const [showConf, setShowConf] = React.useState(true);
  const [soundFX, setSoundFX] = React.useState(false);
  const [authStatus, setAuthStatus] = React.useState(null);

  React.useEffect(() => {
    API.get("/api/auth/status").then(setAuthStatus).catch(() => {});
  }, []);

  const syncMeta = () => {
    if (!syncStatus?.last_synced_at) return "Never synced";
    const diff = Math.floor((Date.now() - new Date(syncStatus.last_synced_at)) / 60000);
    const when = diff < 1 ? "just now" : diff < 60 ? `${diff}m ago` : `${Math.floor(diff/60)}h ago`;
    return `Last synced ${when} · interval ${syncStatus.sync_interval_hours}h`;
  };

  return (
    <div style={accountStyles.wrap}>
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>Preferences</div>
        <h1 style={accountStyles.h1}>Settings</h1>
      </div>

      {/* Gmail connection */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Inbox connection</h3>
        <div style={accountStyles.sectionSub}>— the source of truth for your transactions</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "var(--paper-2)", borderRadius: 6, marginTop: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
            <Icon name="gmail" size={18} stroke="var(--accent)"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
              Gmail
              {authStatus !== null && (
                <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: authStatus.authenticated ? "var(--pos-soft)" : "var(--neg-soft)", color: authStatus.authenticated ? "var(--pos)" : "var(--neg)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {authStatus.authenticated ? "Connected" : "Disconnected"}
                </span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{syncMeta()}</div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {authStatus?.authenticated ? (
              <>
                <button onClick={onRescan} disabled={syncing} style={{ ...accountStyles.btn, opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "Syncing…" : "Re-sync"}
                </button>
                <button onClick={() => window.location.href = "/api/auth/gmail"} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Reconnect</button>
              </>
            ) : (
              <button onClick={() => window.location.href = "/api/auth/gmail"} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Connect Gmail</button>
            )}
          </div>
        </div>
        <button style={{ ...accountStyles.btn, marginTop: 10 }}><Icon name="plus" size={12}/> Add another account</button>
      </div>

      {/* Parsing */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Parsing & AI</h3>
        <div style={accountStyles.sectionSub}>— how smart the inbox should be</div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Auto-categorize new transactions</div><div style={accountStyles.sub}>use the model to guess Food, Rent, etc.</div></div>
          <div/>
          <Toggle on={autoCat} onChange={setAutoCat}/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Show AI confidence on cards</div><div style={accountStyles.sub}>small bar next to each transaction</div></div>
          <div/>
          <Toggle on={showConf} onChange={setShowConf}/>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Confidence threshold</div><div style={accountStyles.sub}>flag transactions below this certainty</div></div>
          <input type="range" min="50" max="95" defaultValue="70" style={{ width: "100%" }}/>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "var(--ink-2)", minWidth: 40, textAlign: "right" }}>70%</span>
        </div>
      </div>

      {/* Notifications */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Notifications</h3>
        <div style={accountStyles.sectionSub}>— what we tell you, and when</div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Daily digest email</div><div style={accountStyles.sub}>one summary at 9:00 IST</div></div>
          <div/>
          <Toggle on={digest} onChange={setDigest}/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Low-confidence alerts</div><div style={accountStyles.sub}>ping when a new merchant isn't recognized</div></div>
          <div/>
          <Toggle on={lowConf} onChange={setLowConf}/>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Sound effects</div><div style={accountStyles.sub}>subtle click on transaction confirm</div></div>
          <div/>
          <Toggle on={soundFX} onChange={setSoundFX}/>
        </div>
      </div>

      {/* Categories */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Categories</h3>
        <div style={accountStyles.sectionSub}>— rename, recolor, or add your own</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 6 }}>
          {Object.entries(CATEGORIES).filter(([k])=>k!=="income"&&k!=="other").map(([k,c])=>(
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)" }}>
              <span style={{ width: 20, height: 20, borderRadius: 4, background: c.bg, border: `1px solid ${c.ink}33` }}/>
              <span style={{ fontWeight: 500, fontSize: 13, flex: 1 }}>{c.label}</span>
              <button style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)" }}><Icon name="edit" size={13}/></button>
            </div>
          ))}
          <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", border: "1px dashed var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-3)", fontSize: 13, cursor: "pointer", justifyContent: "center" }}>
            <Icon name="plus" size={13}/> New category
          </button>
        </div>
      </div>

      {/* AI Services */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>AI services</h3>
        <div style={accountStyles.sectionSub}>— bring your own model subscription for parsing & insights</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6, marginTop: 6, marginBottom: 14, fontSize: 12, color: "var(--ink-2)" }}>
          <Icon name="info" size={13} stroke="var(--ink-3)"/>
          <span>Moneyflow parses with its in-house model by default. Connect a premium subscription to use it instead for sharper merchant inference and written insights.</span>
        </div>

        {[
          { key: "claude",  name: "Anthropic Claude",  sub: "Claude Sonnet 4.5 · recommended for finance",        badge: "Recommended", connected: true,  meta: "Connected · key ••f2a1" },
          { key: "openai",  name: "OpenAI",            sub: "GPT-4o, GPT-4 Turbo via API key",                   connected: false },
          { key: "gemini",  name: "Google Gemini",     sub: "Gemini 2.5 Pro · free tier available",              connected: false },
          { key: "mistral", name: "Mistral",           sub: "Mistral Large · EU-hosted option",                  connected: false },
          { key: "perp",    name: "Perplexity",        sub: "for merchant-lookup enrichment",                    connected: false },
          { key: "local",   name: "Local model (Ollama)", sub: "llama3.1 · fully on-device, no keys shared",     connected: false },
        ].map((p, idx, arr) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: idx === arr.length - 1 ? "none" : "1px dashed var(--line)" }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 13, color: "var(--ink-2)" }}>
              {p.name.split(" ").map(w=>w[0]).join("").slice(0,2)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                {p.badge && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{p.badge}</span>}
                {p.connected && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--pos-soft)", color: "var(--pos)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--pos)" }}/> Active</span>}
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{p.sub}</div>
              {p.connected && p.meta && <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>{p.meta}</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {p.connected ? (
                <>
                  <button style={accountStyles.btn}>Settings</button>
                  <button style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Disconnect</button>
                </>
              ) : (
                <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Connect</button>
              )}
            </div>
          </div>
        ))}

        {/* Custom OpenAI-compatible endpoint */}
        <div style={{ marginTop: 14, padding: "16px 18px", border: "1px dashed var(--line)", borderRadius: 6, background: "var(--paper)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--ink-3)" }}>
              <Icon name="bolt" size={14}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Custom service</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>any OpenAI-compatible endpoint — self-hosted, Azure, OpenRouter, etc.</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Display name</div>
              <input style={accountStyles.input} placeholder="e.g. Our internal router"/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Model ID</div>
              <input style={accountStyles.input} placeholder="anthropic/claude-sonnet-4.5"/>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Base URL</div>
            <input style={accountStyles.input} placeholder="https://api.openrouter.ai/v1"/>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>API key</div>
              <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>stored encrypted, never logged</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="password" style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} placeholder="sk-••••••••••••••••••••••••"/>
              <button style={accountStyles.btn}>Paste</button>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Auth header</div>
              <select style={accountStyles.input} defaultValue="bearer">
                <option value="bearer">Authorization: Bearer</option>
                <option value="x-api-key">x-api-key</option>
                <option value="custom">Custom header…</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Max tokens</div>
              <input style={accountStyles.input} placeholder="2048" defaultValue="2048"/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Temperature</div>
              <input style={accountStyles.input} placeholder="0.2" defaultValue="0.2"/>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
            <div style={{ flex: 1, fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="info" size={12} stroke="var(--ink-3)"/>
              We'll send a tiny probe request to verify the endpoint before saving.
            </div>
            <button style={accountStyles.btn}>Test connection</button>
            <button style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Save service</button>
          </div>
        </div>

        <div style={{ marginTop: 18, padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 10 }}>Active model for parsing</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <select style={{ ...accountStyles.input, flex: 1 }} defaultValue="claude">
              <option value="default">Moneyflow default</option>
              <option value="claude">Anthropic Claude — Sonnet 4.5</option>
              <option value="openai">OpenAI — GPT-4o</option>
              <option value="gemini">Google Gemini — 2.5 Pro</option>
            </select>
            <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>~ ₹0.4 per 100 emails</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="sparkle" size={12} stroke="var(--accent)"/>
            Written insights on the Dashboard use this model too.
          </div>
        </div>

        {/* LLM usage stats */}
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Usage · last 30 days</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>calls, tokens, and cost across connected models</div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["7d","30d","90d"].map((t,i)=>(
                <button key={t} style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid var(--line)", background: i===1 ? "var(--ink)" : "var(--card)", color: i===1 ? "var(--paper)" : "var(--ink-3)", fontSize: 10, fontWeight: 500, cursor: "pointer", fontFamily: "'Geist Mono', monospace" }}>{t}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
            {[
              { label: "Calls",          value: "1,412", sub: "47/day avg" },
              { label: "Input tokens",   value: "2.18M", sub: "avg 1,545/call" },
              { label: "Output tokens",  value: "384K",  sub: "concise by design" },
              { label: "Spend",          value: "₹128.40", sub: "of ₹500 budget", accent: true },
            ].map((k,i)=>(
              <div key={i} style={{ padding: "12px 14px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6 }}>
                <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>{k.label}</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 400, letterSpacing: "-0.015em", marginTop: 4, lineHeight: 1, color: k.accent ? "var(--accent)" : "var(--ink)" }}>{k.value}</div>
                <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 4, fontFamily: "'Geist Mono', monospace" }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Per-model breakdown */}
          <div style={{ padding: "14px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 10 }}>By model</div>
            {(() => {
              const rows = [
                { name: "Claude Sonnet 4.5",  calls: 1189, tokens: "2.1M", cost: 112.60, color: "var(--accent)" },
                { name: "GPT-4o",              calls: 184,  tokens: "412K", cost: 14.20,  color: "var(--cat-travel-ink)" },
                { name: "Gemini 2.5 Pro",      calls: 39,   tokens: "58K",  cost: 1.60,   color: "var(--cat-rent-ink)" },
              ];
              const max = Math.max(...rows.map(r=>r.cost));
              return rows.map((r,i)=>(
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 80px 80px", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: i === rows.length-1 ? "none" : "1px dashed var(--line)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }}/>
                    <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                    <div style={{ flex: 1, height: 4, background: "var(--paper-2)", borderRadius: 3, overflow: "hidden", marginLeft: 6 }}>
                      <div style={{ width: `${(r.cost/max)*100}%`, height: "100%", background: r.color, opacity: 0.7 }}/>
                    </div>
                  </div>
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>{r.calls} calls</div>
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>{r.tokens} tok</div>
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, fontWeight: 600, textAlign: "right" }}>₹{r.cost.toFixed(2)}</div>
                </div>
              ));
            })()}
          </div>

          {/* Daily usage sparkline */}
          <div style={{ padding: "14px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Calls per day</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>peak 78 · Apr 15</div>
            </div>
            <svg width="100%" height="80" viewBox="0 0 420 80" preserveAspectRatio="none">
              {(() => {
                const data = [32,28,41,37,44,39,52,48,51,46,58,55,62,59,78,71,64,58,55,62,0,0,0,0,0,0,0,0,0,0];
                const max = Math.max(...data);
                const bw = 420 / data.length;
                return data.map((v, i) => {
                  const h = max > 0 ? (v / max) * 64 : 0;
                  const isPast = i < 20;
                  return <rect key={i} x={i*bw + 1} y={72 - h} width={bw - 2} height={h} fill={isPast ? "var(--accent)" : "var(--line)"} opacity={isPast ? 0.75 : 1} rx="1"/>;
                });
              })()}
              <line x1="0" y1="72" x2="420" y2="72" stroke="var(--line)"/>
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginTop: 4 }}>
              <span>Mar 20</span><span>Apr 4</span><span>Apr 18</span><span>Today</span>
            </div>
          </div>

          {/* By task */}
          <div style={{ padding: "14px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 10 }}>By task</div>
            {[
              { task: "Email parsing",        pct: 71, calls: 1003, note: "transaction extraction" },
              { task: "Category inference",   pct: 18, calls: 254,  note: "Food, Rent, etc." },
              { task: "Merchant lookup",      pct:  7, calls: 99,   note: "enrichment" },
              { task: "Dashboard insights",   pct:  4, calls: 56,   note: "written summaries" },
            ].map((t,i,arr)=>(
              <div key={i} style={{ display: "grid", gridTemplateColumns: "160px 1fr 60px 50px", gap: 12, alignItems: "center", padding: "7px 0", borderBottom: i === arr.length-1 ? "none" : "1px dashed var(--line)", fontSize: 12 }}>
                <div style={{ fontWeight: 500 }}>{t.task}<div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 400 }}>{t.note}</div></div>
                <div style={{ background: "var(--paper-2)", height: 6, borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${t.pct}%`, height: "100%", background: "var(--accent)", opacity: 0.7 }}/>
                </div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-3)", textAlign: "right" }}>{t.calls}</div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, fontWeight: 600, textAlign: "right" }}>{t.pct}%</div>
              </div>
            ))}
          </div>

          {/* Budget */}
          <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>Monthly budget cap</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)" }}>pauses AI calls if hit — you stay in control</div>
              </div>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>₹128.40</span><span style={{ color: "var(--ink-3)" }}> / ₹500.00</span>
              </div>
            </div>
            <div style={{ height: 6, background: "var(--card)", borderRadius: 3, overflow: "hidden", border: "1px solid var(--line)" }}>
              <div style={{ width: "25.68%", height: "100%", background: "var(--pos)", opacity: 0.7 }}/>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 10, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>
              <span>26% used · 19 days in</span>
              <button style={{ border: "none", background: "transparent", color: "var(--accent)", fontWeight: 600, cursor: "pointer", fontSize: 10, fontFamily: "'Geist Mono', monospace" }}>Edit cap →</button>
            </div>
          </div>
        </div>
      </div>

      {/* Security */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Security & privacy</h3>
        <div style={accountStyles.sectionSub}>— your numbers, locked down</div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Two-factor authentication</div><div style={accountStyles.sub}>TOTP via authenticator app</div></div>
          <div/>
          <Toggle on={twoFA} onChange={setTwoFA}/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Change password</div><div style={accountStyles.sub}>last changed 42 days ago</div></div>
          <div/>
          <button style={accountStyles.btn}>Change…</button>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Export all data</div><div style={accountStyles.sub}>CSV of every parsed transaction</div></div>
          <div/>
          <button style={accountStyles.btn}><Icon name="arrow-u-r" size={12}/> Export</button>
        </div>
      </div>

      {/* Danger */}
      <div style={{ ...accountStyles.section, border: "1px solid var(--neg-soft)" }}>
        <h3 style={{ ...accountStyles.sectionTitle, color: "var(--neg)" }}>Danger zone</h3>
        <div style={accountStyles.sectionSub}>— irreversible things</div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast, borderBottom: "none" }}>
          <div><div style={accountStyles.label}>Delete account</div><div style={accountStyles.sub}>removes all parsed data, forever</div></div>
          <div/>
          <button style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Delete…</button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ProfileView, SettingsView });

