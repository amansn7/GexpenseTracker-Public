// Profile & Settings views

const accountStyles = {
  wrap: { padding: "clamp(18px, 4vw, 32px) clamp(14px, 5vw, 40px) 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)", maxWidth: 920, margin: "0 auto" },
  header: { marginBottom: 28 },
  kicker: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 },
  h1: { fontFamily: "'Fraunces', serif", fontSize: 36, fontWeight: 400, letterSpacing: "-0.02em", margin: "4px 0 0" },
  section: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "clamp(16px, 4vw, 24px) clamp(14px, 4vw, 28px)", marginBottom: 16 },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, margin: "0 0 4px" },
  sectionSub: { fontSize: 12, color: "var(--ink-3)", fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: 14, marginBottom: 18 },
  row: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: "1px dashed var(--line)" },
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
  <button type="button" onClick={()=>onChange(!on)} style={{ ...accountStyles.toggle, background: on ? "var(--pos)" : "var(--ink-4)" }}>
    <span style={{ ...accountStyles.toggleKnob, transform: on ? "translateX(16px)" : "translateX(0)" }}/>
  </button>
);

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
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>First run</div>
        <h1 style={accountStyles.h1}>Create your profile</h1>
      </div>
      <form onSubmit={submit} style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Owner account</h3>
        <div style={accountStyles.sectionSub}>— the person this Moneyflow workspace belongs to</div>
        {error && <div style={{ padding: "10px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>{error}</div>}
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
  );
};

const ProfileView = ({ transactions, account, setAccount }) => {
  const profile = account?.profile || {};
  const user = account?.user || {};
  const [form, setForm] = React.useState(profile);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => setForm(profile), [account?.user?.id]);
  const patch = (key, value) => setForm(f => ({ ...f, [key]: value }));
  const save = async () => {
    setSaving(true);
    try {
      const result = await API.patch("/api/account/profile", form);
      setAccount(a => ({ ...a, profile: result.profile }));
    } finally {
      setSaving(false);
    }
  };
  const totalIncome = transactions.filter(t=>t.amount>0).reduce((a,t)=>a+t.amount,0);
  const totalExpense = transactions.filter(t=>t.amount<0).reduce((a,t)=>a+Math.abs(t.amount),0);
  const parsed = transactions.length;
  const initials = (form.display_name || form.full_name || user.email || "U").split(/\s+/).map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const memberSince = user.created_at ? new Date(user.created_at).toLocaleString("en-US", { month: "short", year: "numeric" }) : "today";
  return (
    <div style={accountStyles.wrap}>
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>Your account</div>
        <h1 style={accountStyles.h1}>Profile</h1>
      </div>

      <div style={accountStyles.section}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginBottom: 10, flexWrap: "wrap" }}>
          <div style={{ width: 72, height: 72, borderRadius: 999, background: "var(--cat-travel)", color: "var(--cat-travel-ink)", display: "grid", placeItems: "center", fontSize: 26, fontWeight: 600, fontFamily: "'Fraunces', serif" }}>{initials}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 500, letterSpacing: "-0.01em" }}>{form.display_name || form.full_name || "Unnamed user"}</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginTop: 2 }}>{user.email}{form.location ? ` · ${form.location}` : ""}</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 6, fontFamily: "'Geist Mono', monospace" }}>Member since {memberSince} · Role: <span style={{ color: "var(--accent)", fontWeight: 600 }}>{user.role || "member"}</span></div>
          </div>
          <button style={{ ...accountStyles.btn }}><Icon name="edit" size={13}/> Change photo</button>
        </div>
      </div>

      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Your year, so far</h3>
        <div style={accountStyles.sectionSub}>— a quiet summary, not a scoreboard</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20, marginTop: 6 }}>
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
          <input style={accountStyles.input} value={form.full_name || ""} onChange={e=>patch("full_name", e.target.value)}/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Display name</div><div style={accountStyles.sub}>shorter name in the UI</div></div>
          <input style={accountStyles.input} value={form.display_name || ""} onChange={e=>patch("display_name", e.target.value)}/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Email address</div><div style={accountStyles.sub}>used for login & digests</div></div>
          <input style={{ ...accountStyles.input, color: "var(--ink-3)" }} value={user.email || ""} disabled/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Phone</div><div style={accountStyles.sub}>optional contact detail</div></div>
          <input style={accountStyles.input} value={form.phone || ""} onChange={e=>patch("phone", e.target.value)}/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Location</div><div style={accountStyles.sub}>used in digest context</div></div>
          <input style={accountStyles.input} value={form.location || ""} onChange={e=>patch("location", e.target.value)}/>
          <div/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Default currency</div><div style={accountStyles.sub}>how amounts render</div></div>
          <select style={accountStyles.input} value={form.default_currency || "INR"} onChange={e=>patch("default_currency", e.target.value)}>
            <option value="INR">INR — Indian Rupee ₹</option>
            <option value="USD">USD — US Dollar $</option>
            <option value="EUR">EUR — Euro €</option>
            <option value="GBP">GBP — British Pound £</option>
          </select>
          <div/>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Timezone</div><div style={accountStyles.sub}>for daily digest timing</div></div>
          <select style={accountStyles.input} value={form.timezone || "Asia/Kolkata"} onChange={e=>patch("timezone", e.target.value)}>
            <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</option>
            <option value="America/Los_Angeles">America/Los_Angeles</option>
            <option value="Europe/London">Europe/London</option>
            <option value="UTC">UTC</option>
          </select>
          <div/>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
          <button onClick={()=>setForm(profile)} style={accountStyles.btn}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: saving ? 0.65 : 1 }}>{saving ? "Saving…" : "Save changes"}</button>
        </div>
      </div>

      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Plan & billing</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 18, padding: "16px 18px", background: "var(--accent-soft)", borderRadius: 6, marginTop: 10, flexWrap: "wrap" }}>
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
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>₹</span>
          <input
            type="number"
            min="0"
            placeholder="0"
            value={balance}
            onChange={e => setBalance(e.target.value)}
            style={{ width: 110, padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", fontSize: 13, fontFamily: "inherit" }}
          />
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>as of</span>
          <input
            type="date"
            max={today}
            value={balanceDate}
            onChange={e => setBalanceDate(e.target.value)}
            style={{ padding: "6px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", fontSize: 13, fontFamily: "inherit" }}
          />
          <button onClick={save} disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>
            {saving ? "…" : saved ? "Saved ✓" : "Save"}
          </button>
        </div>
        {saveError && <div style={{ fontSize: 12, color: "var(--neg)", marginTop: 6 }}>{saveError}</div>}
      </div>
    </div>
  );
};

const CategoriesSection = ({ categories, onRefresh }) => {
  const [editing, setEditing] = React.useState(null);
  const [adding, setAdding] = React.useState(false);
  const [newCat, setNewCat] = React.useState({ name: "", color: "#dcd5c3" });
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
    setAdding(false); setNewCat({ name: "", color: "#dcd5c3" }); onRefresh();
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
              <button onClick={()=>setEditing(null)} style={{...accountStyles.btn,padding:"4px 8px",fontSize:11}}>✕</button>
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
              <Icon name={getCatIcon(c.name)} size={13} stroke="rgba(0,0,0,0.45)"/>
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
              <button onClick={()=>setAdding(false)} style={{...accountStyles.btn,padding:"4px 8px",fontSize:11}}>✕</button>
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

const AccessSection = ({ account }) => {
  const [allowlist, setAllowlist] = React.useState(null);
  const [newEmail, setNewEmail] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [addError, setAddError] = React.useState(null);

  React.useEffect(() => {
    API.get("/api/auth/allowlist")
      .then(d => setAllowlist(d.allowed_emails || []))
      .catch(() => setAllowlist([]));
  }, []);

  const addEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || !email.includes("@")) return;
    setAdding(true);
    setAddError(null);
    try {
      const d = await API.post("/api/auth/allowlist", { email });
      setAllowlist(d.allowed_emails);
      setNewEmail("");
    } catch (err) {
      setAddError(err.message || "Could not add email");
    }
    setAdding(false);
  };

  const removeEmail = async (email) => {
    try {
      const d = await API.delete(`/api/auth/allowlist/${encodeURIComponent(email)}`);
      setAllowlist(d.allowed_emails);
    } catch (_) {}
  };

  if (allowlist === null) return null;

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Access</h3>
      <div style={accountStyles.sectionSub}>— emails allowed to sign in</div>
      <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden" }}>
        {allowlist.map(email => (
          <div key={email} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderBottom:"1px solid var(--line)" }}>
            <span style={{ fontSize: 13 }}>
              {email}
              {email === account?.email && <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: 8 }}>(you)</span>}
            </span>
            <button
              onClick={() => removeEmail(email)}
              disabled={email === account?.email}
              style={{ fontSize: 11, color: "var(--neg)", background: "none", border: "none", cursor: email === account?.email ? "default" : "pointer", opacity: email === account?.email ? 0.3 : 1, fontFamily: "inherit" }}
            >Remove</button>
          </div>
        ))}
        <div style={{ display:"flex", gap:8, padding:"10px 16px" }}>
          <input
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addEmail()}
            placeholder="Add email address…"
            style={{ flex:1, padding:"7px 10px", border:"1px solid var(--line)", borderRadius:6, background:"var(--paper)", color:"var(--ink)", fontSize:13, fontFamily:"inherit" }}
          />
          <button
            onClick={addEmail}
            disabled={adding}
            style={{ padding:"7px 14px", background:"var(--ink)", color:"var(--paper)", border:"none", borderRadius:6, fontSize:12, cursor:"pointer", fontFamily:"inherit" }}
          >Add</button>
        </div>
        {addError && <div style={{ padding:"4px 16px 10px", fontSize:11, color:"var(--neg)" }}>{addError}</div>}
      </div>
    </div>
  );
};

const SettingsView = ({ syncStatus, setSyncStatus, onRescan, syncing, account, setAccount }) => {
  const settings = account?.settings || {};
  const connectedAccounts = account?.connected_accounts || [];
  const categories = account?.categories || [];
  const aiServices = account?.ai_services || [];
  const gmailAccount = connectedAccounts.find(a => a.provider === "gmail");
  const gmailConnected = gmailAccount?.status === "connected";
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
  const providerPresets = [
    { provider: "openai", display_name: "OpenAI", model_id: "gpt-4o-mini", base_url: "https://api.openai.com/v1" },
    { provider: "openrouter", display_name: "OpenRouter", model_id: "google/gemini-2.0-flash-exp:free", base_url: "https://openrouter.ai/api/v1" },
    { provider: "gemini", display_name: "Google Gemini", model_id: "gemini-2.0-flash", base_url: "https://generativelanguage.googleapis.com/v1beta/openai" },
    { provider: "grok", display_name: "Grok", model_id: "grok-3-mini", base_url: "https://api.x.ai/v1" },
    { provider: "scaleway", display_name: "Scaleway", model_id: "llama-3.3-70b-instruct", base_url: "https://api.scaleway.ai/v1" },
    { provider: "custom", display_name: "Custom service", model_id: "", base_url: "" },
  ];
  const [aiForm, setAiForm] = React.useState(emptyAiForm);
  const [editingAiId, setEditingAiId] = React.useState(null);
  const [aiSaving, setAiSaving] = React.useState(false);
  const [aiError, setAiError] = React.useState(null);
  const [budgetValue, setBudgetValue] = React.useState(
    settings.monthly_ai_budget != null ? String(settings.monthly_ai_budget) : ""
  );

  React.useEffect(() => {
    setBudgetValue(settings.monthly_ai_budget != null ? String(settings.monthly_ai_budget) : "");
  }, [settings.monthly_ai_budget]);

  const updateSetting = async (key, value) => {
    setAccount(a => ({ ...a, settings: { ...a.settings, [key]: value } }));
    try {
      const result = await API.patch("/api/account/settings", { [key]: value });
      setAccount(a => ({ ...a, settings: result.settings }));
    } catch (_) {
      setAccount(a => ({ ...a, settings }));
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

  const patchAiForm = (key, value) => setAiForm(f => ({ ...f, [key]: value }));

  const chooseAiPreset = (provider) => {
    const preset = providerPresets.find(p => p.provider === provider);
    if (!preset) return;
    setAiForm(f => ({ ...f, ...preset, api_key: "", enabled: true }));
    setEditingAiId(null);
    setAiError(null);
  };

  const editAiService = (service) => {
    setEditingAiId(service.id);
    setAiForm({
      provider: service.provider || "custom",
      display_name: service.display_name || "",
      model_id: service.model_id || "",
      base_url: service.base_url || "",
      auth_header: service.auth_header || "bearer",
      api_key: "",
      enabled: service.enabled !== false,
    });
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
    <div style={accountStyles.wrap}>
      <div style={accountStyles.header}>
        <div style={accountStyles.kicker}>Preferences</div>
        <h1 style={accountStyles.h1}>Settings</h1>
      </div>

      {/* Gmail connection */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Inbox connection</h3>
        <div style={accountStyles.sectionSub}>— the source of truth for your transactions</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 18px", background: "var(--paper-2)", borderRadius: 6, marginTop: 6, flexWrap: "wrap" }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center" }}>
            <Icon name="gmail" size={18} stroke="var(--accent)"/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              Gmail
              <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: gmailConnected ? "var(--pos-soft)" : "var(--neg-soft)", color: gmailConnected ? "var(--pos)" : "var(--neg)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                {gmailConnected ? "Connected" : "Disconnected"}
              </span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{syncMeta()}</div>
            {gmailAccount?.account_email && (
              <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>
                {gmailAccount.account_email}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gmailConnected ? (
              <>
                <button onClick={onRescan} disabled={syncing} style={{ ...accountStyles.btn, opacity: syncing ? 0.6 : 1 }}>
                  {syncing ? "Syncing…" : "Re-sync"}
                </button>
                <button onClick={() => window.location.href = "/api/auth/google"} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Reconnect</button>
              </>
            ) : (
              <button onClick={() => window.location.href = "/api/auth/google"} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>Connect Gmail</button>
            )}
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>Messages to scan</div>
          <div style={{ display: "inline-flex", padding: 3, border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", opacity: filterSaving ? 0.65 : 1 }}>
            {[
              ["all", "All"],
              ["unread", "Unread"],
              ["read", "Read"],
            ].map(([value, label]) => {
              const active = (syncStatus?.email_filter || "all") === value;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={filterSaving}
                  onClick={() => updateEmailFilter(value)}
                  style={{
                    padding: "6px 12px",
                    border: "none",
                    borderRadius: 4,
                    background: active ? "var(--ink)" : "transparent",
                    color: active ? "var(--paper)" : "var(--ink-3)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: filterSaving ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Parsing */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Parsing & AI</h3>
        <div style={accountStyles.sectionSub}>— how smart the inbox should be</div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Auto-categorize new transactions</div><div style={accountStyles.sub}>use the model to guess Food, Rent, etc.</div></div>
          <div/>
          <Toggle on={!!settings.auto_categorize} onChange={v=>updateSetting("auto_categorize", v)}/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Show AI confidence on cards</div><div style={accountStyles.sub}>small bar next to each transaction</div></div>
          <div/>
          <Toggle on={!!settings.show_confidence} onChange={v=>updateSetting("show_confidence", v)}/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Confidence threshold</div><div style={accountStyles.sub}>flag transactions below this certainty</div></div>
          <input type="range" min="50" max="95" value={settings.confidence_threshold ?? 70} onChange={e=>updateSetting("confidence_threshold", Number(e.target.value))} style={{ width: "100%" }}/>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, color: "var(--ink-2)", minWidth: 40, textAlign: "right" }}>{settings.confidence_threshold ?? 70}%</span>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div>
            <div style={accountStyles.label}>Rule-based pre-filter</div>
            <div style={accountStyles.sub}>skip LLM for known senders and obvious non-financial emails — saves tokens</div>
          </div>
          <div/>
          <Toggle on={settings.use_rule_engine !== false} onChange={v=>updateSetting("use_rule_engine", v)}/>
        </div>
      </div>

      {/* Notifications */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>Notifications</h3>
        <div style={accountStyles.sectionSub}>— what we tell you, and when</div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Daily digest email</div><div style={accountStyles.sub}>one summary at 9:00 IST</div></div>
          <div/>
          <Toggle on={!!settings.daily_digest} onChange={v=>updateSetting("daily_digest", v)}/>
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Low-confidence alerts</div><div style={accountStyles.sub}>ping when a new merchant isn't recognized</div></div>
          <div/>
          <Toggle on={!!settings.low_confidence_alerts} onChange={v=>updateSetting("low_confidence_alerts", v)}/>
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Sound effects</div><div style={accountStyles.sub}>subtle click on transaction confirm</div></div>
          <div/>
          <Toggle on={!!settings.sound_effects} onChange={v=>updateSetting("sound_effects", v)}/>
        </div>
      </div>

      {/* Categories */}
      <CategoriesSection categories={categories} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.categories) setAccount(prev => ({ ...prev, categories: d.categories }));
      }} />

      {/* Financial Health */}
      <FinancialHealthSection settings={settings} onRefresh={async () => {
        const d = await API.get("/api/account/me");
        if (d?.settings) setAccount(prev => ({ ...prev, settings: d.settings }));
      }} />

      {/* AI Services */}
      <div style={accountStyles.section}>
        <h3 style={accountStyles.sectionTitle}>AI services</h3>
        <div style={accountStyles.sectionSub}>— bring your own model subscription for parsing and insights</div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6, marginTop: 6, marginBottom: 14, fontSize: 12, color: "var(--ink-2)" }}>
          <Icon name="info" size={13} stroke="var(--ink-3)"/>
          <span>Moneyflow can fall back to its default providers. Save your own OpenAI-compatible service here when you want to control model, key, and budget.</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 8 }}>Saved services</div>
          {aiServices.length === 0 ? (
            <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6, fontSize: 12, color: "var(--ink-3)" }}>
              No custom AI services saved. Add one below to use your own API key.
            </div>
          ) : aiServices.map((service, idx) => {
            const active = settings.active_ai_service_id === service.id;
            return (
              <div key={service.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 0", borderBottom: idx === aiServices.length - 1 ? "none" : "1px dashed var(--line)", flexWrap: "wrap" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--card)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontFamily: "'Fraunces', serif", fontWeight: 600, fontSize: 13, color: "var(--ink-2)", textTransform: "uppercase" }}>
                  {(service.display_name || service.provider || "AI").split(" ").map(w=>w[0]).join("").slice(0,2)}
                </div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{service.display_name}</span>
                    {active && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Active</span>}
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: service.enabled ? "var(--pos-soft)" : "var(--paper-2)", color: service.enabled ? "var(--pos)" : "var(--ink-3)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {service.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{service.model_id}</div>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", marginTop: 3, fontFamily: "'Geist Mono', monospace" }}>
                    {service.provider}{service.base_url ? ` · ${service.base_url}` : ""}{service.api_key_hint ? ` · key ${service.api_key_hint}` : ""}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {!active && <button onClick={() => updateSetting("active_ai_service_id", service.id)} style={accountStyles.btn}>Make active</button>}
                  <button onClick={() => toggleAiService(service)} style={accountStyles.btn}>{service.enabled ? "Disable" : "Enable"}</button>
                  <button onClick={() => editAiService(service)} style={accountStyles.btn}>Edit</button>
                  <button onClick={() => deleteAiService(service)} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Delete</button>
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "14px 16px", background: "var(--paper-2)", borderRadius: 6, marginBottom: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, alignItems: "end" }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Preferred AI service</div>
              <select style={accountStyles.input} value={settings.active_ai_service_id || "default"} onChange={e=>updateSetting("active_ai_service_id", e.target.value === "default" ? null : e.target.value)}>
                <option value="default">Moneyflow default providers</option>
                {aiServices.filter(s => s.enabled !== false || s.id === settings.active_ai_service_id).map(service => (
                  <option key={service.id} value={service.id}>{service.display_name} - {service.model_id}{service.enabled === false ? " (disabled)" : ""}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Monthly AI budget</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input type="number" min="0" step="1" style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} value={budgetValue} onChange={e=>setBudgetValue(e.target.value)} placeholder="No cap"/>
                <button onClick={saveAiBudget} style={accountStyles.btn}>Save</button>
              </div>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 10 }}>
            Preferred-service selection is saved with your account settings. Parser routing and budget enforcement depend on usage integration.
          </div>
        </div>

        <div style={{ marginTop: 14, padding: "16px 18px", border: "1px dashed var(--line)", borderRadius: 6, background: "var(--paper)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", color: "var(--ink-3)" }}>
              <Icon name="bolt" size={14}/>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{editingAiId ? "Edit AI service" : "Add AI service"}</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)" }}>any OpenAI-compatible endpoint, including OpenAI, Gemini, Grok, OpenRouter, or self-hosted</div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
            {providerPresets.map(p => (
              <button key={p.provider} onClick={() => chooseAiPreset(p.provider)} style={{ ...accountStyles.btn, background: aiForm.provider === p.provider ? "var(--ink)" : "var(--paper)", color: aiForm.provider === p.provider ? "var(--paper)" : "var(--ink-2)" }}>
                {p.display_name}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 12 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Display name</div>
              <input style={accountStyles.input} value={aiForm.display_name} onChange={e=>patchAiForm("display_name", e.target.value)} placeholder="e.g. Our internal router"/>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Model ID</div>
              <input style={accountStyles.input} value={aiForm.model_id} onChange={e=>patchAiForm("model_id", e.target.value)} placeholder="gpt-4o-mini"/>
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Base URL</div>
            <input style={accountStyles.input} value={aiForm.base_url} onChange={e=>patchAiForm("base_url", e.target.value)} placeholder="https://api.openai.com/v1"/>
          </div>

          <div style={{ marginTop: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>API key</div>
              <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{editingAiId ? "leave blank to keep current key" : "stored encrypted, never logged"}</span>
            </div>
            <input type="password" style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} value={aiForm.api_key} onChange={e=>patchAiForm("api_key", e.target.value)} placeholder="sk-..."/>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Auth header</div>
              <select style={accountStyles.input} value={aiForm.auth_header} onChange={e=>patchAiForm("auth_header", e.target.value)}>
                <option value="bearer">Authorization: Bearer</option>
                <option value="x-api-key">x-api-key</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Enabled</div>
              <div style={{ height: 35, display: "flex", alignItems: "center" }}>
                <Toggle on={!!aiForm.enabled} onChange={v=>patchAiForm("enabled", v)}/>
              </div>
            </div>
          </div>

          {aiError && <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 6, background: "var(--neg-soft)", color: "var(--neg)", fontSize: 12 }}>{aiError}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, fontSize: 11, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="info" size={12} stroke="var(--ink-3)"/>
              Connection testing is not wired yet; this saves the encrypted credentials and model metadata.
            </div>
            {editingAiId && <button onClick={resetAiForm} style={accountStyles.btn}>Cancel</button>}
            <button onClick={saveAiService} disabled={aiSaving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: aiSaving ? 0.65 : 1 }}>
              {aiSaving ? "Saving..." : editingAiId ? "Save changes" : "Save service"}
            </button>
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
          <Toggle on={!!settings.two_factor_enabled} onChange={v=>updateSetting("two_factor_enabled", v)}/>
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
      {account?.role === "owner" && (
        <AccessSection account={account} />
      )}
    </div>
  );
};

Object.assign(window, { OnboardingView, ProfileView, SettingsView, CategoriesSection, FinancialHealthSection, AccessSection });
