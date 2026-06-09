// @ts-nocheck
// account-rules.tsx — Email filter rules section

const RULE_TYPES = {
  sender_domain: { label: "Sender Domain", apiPath: "/api/rules", method: "POST", bodyKeys: ["sender_domain", "label", "category", "enabled"] },
  pattern: { label: "Pattern", apiPath: "/api/rules/patterns", method: "POST", bodyKeys: ["regex_pattern", "label", "merchant", "category", "enabled"] },
  merchant: { label: "Merchant Alias", apiPath: "/api/merchant-aliases", method: "POST", bodyKeys: ["raw", "canonical", "category"] },
  filter: { label: "Filter Rule", apiPath: "/api/filter/rules", method: "POST", bodyKeys: ["rule_type", "value"] },
};

const labelBadge = (l) => {
  const s = { expense: { background: "var(--neg-soft)", color: "var(--neg)" }, income: { background: "var(--pos-soft)", color: "var(--pos)" }, ignore: { background: "var(--paper-2)", color: "var(--ink-3)" } }[l] || {};
  return <span style={{ fontSize: "0.625rem", padding: "2px 7px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.03em", ...s }}>{l}</span>;
};

const RuleTester = () => {
  const [senderDomain, setSenderDomain] = React.useState("amazon.in");
  const [subject, setSubject] = React.useState("Your Amazon.in order #123-456 has been shipped");
  const [body, setBody] = React.useState("Dear Customer, Your order of 'Wireless Mouse' has been shipped and will be delivered by Mar 20.");
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const [error, setError] = React.useState(null);
  const [open, setOpen] = React.useState(false);

  const run = async () => {
    setTesting(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/rules/test", { sender_domain: senderDomain, subject, body });
      setResult(r);
    } catch (e) { setError(e.message); }
    setTesting(false);
  };

  const confColor = (c) => c >= 0.85 ? "var(--pos)" : c >= 0.65 ? "var(--accent)" : "var(--neg)";

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
        <h3 style={accountStyles.sectionTitle}>Rule Tester</h3>
        <span style={{ fontSize: "0.75rem", color: "var(--ink-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▼</span>
      </div>
      <div style={accountStyles.sectionSub}>— preview which rules fire against a sample email</div>
      {open && (<>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Sender domain</div><div style={accountStyles.sub}>e.g. amazon.in</div></div>
          <input value={senderDomain} onChange={e => setSenderDomain(e.target.value)} style={accountStyles.input} placeholder="amazon.in" />
        </div>
        <div style={accountStyles.row}>
          <div><div style={accountStyles.label}>Subject</div><div style={accountStyles.sub}>email subject line</div></div>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={accountStyles.input} placeholder="Subject line" />
        </div>
        <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
          <div><div style={accountStyles.label}>Body</div><div style={accountStyles.sub}>email body text</div></div>
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...accountStyles.input, height: 100, resize: "none", lineHeight: 1.6, WebkitAppearance: "none" }} placeholder="Email body…" />
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
          <button onClick={run} disabled={testing} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: testing ? 0.65 : 1 }}>
            {testing ? "Testing…" : "Test Rules"}
          </button>
        </div>
        {error && <div role="alert" style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginTop: 12 }}>{error}</div>}
        {result && (
          <div style={{ marginTop: 16 }}>
            {result.classification && (
              <div style={{ padding: "12px 16px", background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)", marginBottom: 12, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>Would classify as:</span>
                {labelBadge(result.classification.label)}
                {result.classification.category && <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>→ {result.classification.category}</span>}
                <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>conf: <span style={{ fontWeight: 600, color: confColor(result.classification.confidence) }}>{(result.classification.confidence * 100).toFixed(0)}%</span></span>
              </div>
            )}
            {result.matches && result.matches.length > 0 && (
              <div>
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 8 }}>Matching rules ({result.matches.length})</div>
                {result.matches.map((m, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--line)", fontSize: "0.75rem", opacity: m.enabled ? 1 : 0.5 }}>
                    <span style={{ fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: "var(--paper-2)", color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace", whiteSpace: "nowrap" }}>{m.rule_type}</span>
                    <span style={{ flex: 1, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", color: "var(--ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.matched_value}</span>
                    {labelBadge(m.label)}
                    <span style={{ fontSize: "0.6875rem", color: confColor(m.confidence) }}>{(m.confidence * 100).toFixed(0)}%</span>
                    {!m.enabled && <span style={{ fontSize: "0.625rem", color: "var(--ink-4)", fontStyle: "italic" }}>(disabled)</span>}
                  </div>
                ))}
              </div>
            )}
            {(!result.matches || result.matches.length === 0) && (
              <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", fontStyle: "italic" }}>No matching rules</div>
            )}
          </div>
        )}
      </>)}
    </div>
  );
};

const SenderRulesSection = ({ categories }) => {
  const [rules, setRules] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [toggling, setToggling] = React.useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await API.get("/api/rules"); setRules(d.user || []); }
    catch (e) { setError(e.message); setRules([]); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const toggle = async (domain, enabled) => {
    setToggling(domain);
    setRules(prev => (prev || []).map(r => r.sender_domain === domain ? { ...r, enabled } : r));
    try { await API.patch(`/api/rules/${encodeURIComponent(domain)}`, { enabled }); }
    catch (_) { load(); }
    setToggling(null);
  };

  const doDelete = async (domain) => {
    try { await API.delete(`/api/rules/${encodeURIComponent(domain)}`); setRules(prev => (prev || []).filter(r => r.sender_domain !== domain)); showToast(`Deleted rule for ${domain}`); } catch (_) {}
  };

  const TH = { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.75rem" };

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Sender Domain Rules</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} style={{ ...accountStyles.btn, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 10px", fontSize: "0.6875rem" }}><Icon name="repeat" size={12}/></button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, padding: "5px 12px", fontSize: "0.6875rem", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="plus" size={11}/> Add
          </button>
        </div>
      </div>
      <div style={accountStyles.sectionSub}>— emails from these domains skip the LLM and use your preferred label</div>
      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {error && <div role="alert" style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 8 }}>{error}</div>}
      {!loading && rules !== null && rules.length === 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>
          No rules yet. Create one or correct a transaction to auto-learn.
        </div>
      )}
      {rules !== null && rules.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Domain", "Label", "Category", "On", "", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.sender_domain} style={{ opacity: r.enabled === false ? 0.5 : 1 }}>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sender_domain}</td>
                  <td style={TD}>{labelBadge(r.label)}</td>
                  <td style={{ ...TD, color: "var(--ink-2)" }}>{r.category || "—"}</td>
                  <td style={TD}>
                    <button
                      onClick={() => toggle(r.sender_domain, !r.enabled)}
                      disabled={toggling === r.sender_domain}
                      style={{ width: 32, height: 18, borderRadius: 9, border: "none", cursor: "pointer", background: r.enabled ? "var(--pos)" : "var(--ink-4)", padding: 2, transition: "background 160ms", opacity: toggling === r.sender_domain ? 0.5 : 1 }}
                    >
                      <span style={{ display: "block", width: 14, height: 14, borderRadius: 999, background: "var(--paper)", transition: "transform 160ms", transform: r.enabled ? "translateX(14px)" : "translateX(0)", boxShadow: "0 1px 2px var(--shadow-sm)" }}/>
                    </button>
                  </td>
                  <td style={TD}>
                    <button onClick={() => { setEditing(r); setShowModal(true); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", padding: 2 }} title="Edit">
                      <Icon name="edit" size={12}/>
                    </button>
                  </td>
                  <td style={TD}>
                    <button onClick={() => doDelete(r.sender_domain)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--neg)", padding: 2 }} title="Delete">
                      <Icon name="trash" size={12}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <RuleModal
          mode={editing ? "edit" : "create"}
          ruleType="sender_domain"
          rule={editing ? { sender_domain: editing.sender_domain, label: editing.label, category: editing.category || "", enabled: editing.enabled !== false } : null}
          categories={categories}
          onSave={load}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

const PatternRulesSection = ({ categories }) => {
  const [rules, setRules] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);
  const [toggling, setToggling] = React.useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await API.get("/api/rules/patterns"); setRules(d || []); }
    catch (e) { setError(e.message); setRules([]); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const toggle = async (id, enabled) => {
    setToggling(id);
    setRules(prev => (prev || []).map(r => r.id === id ? { ...r, enabled } : r));
    try { await API.patch(`/api/rules/patterns/${id}`, { enabled }); }
    catch (_) { load(); }
    setToggling(null);
  };

  const doDelete = async (id) => {
    try { await API.delete(`/api/rules/patterns/${id}`); setRules(prev => (prev || []).filter(r => r.id !== id)); showToast("Deleted pattern rule"); } catch (_) {}
  };

  const TH = { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.75rem" };

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Pattern Rules</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} style={{ ...accountStyles.btn, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 10px", fontSize: "0.6875rem" }}><Icon name="repeat" size={12}/></button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, padding: "5px 12px", fontSize: "0.6875rem", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="plus" size={11}/> Add
          </button>
        </div>
      </div>
      <div style={accountStyles.sectionSub}>— regex patterns matched against email subject + body</div>
      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {error && <div role="alert" style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 8 }}>{error}</div>}
      {!loading && rules !== null && rules.length === 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>No pattern rules yet.</div>
      )}
      {rules !== null && rules.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Regex", "Label", "Merchant", "Cat", "Hits", "On", "", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id} style={{ opacity: r.enabled === false ? 0.5 : 1 }}>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.625rem", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.regex_pattern}>{r.regex_pattern}</td>
                  <td style={TD}>{labelBadge(r.label)}</td>
                  <td style={{ ...TD, color: "var(--ink-2)" }}>{r.merchant || "—"}</td>
                  <td style={{ ...TD, color: "var(--ink-2)" }}>{r.category || "—"}</td>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", color: "var(--ink-3)" }}>{r.hit_count || 0}</td>
                  <td style={TD}>
                    <button
                      onClick={() => toggle(r.id, !r.enabled)}
                      disabled={toggling === r.id}
                      style={{ width: 32, height: 18, borderRadius: 9, border: "none", cursor: "pointer", background: r.enabled ? "var(--pos)" : "var(--ink-4)", padding: 2, transition: "background 160ms", opacity: toggling === r.id ? 0.5 : 1 }}
                    >
                      <span style={{ display: "block", width: 14, height: 14, borderRadius: 999, background: "var(--paper)", transition: "transform 160ms", transform: r.enabled ? "translateX(14px)" : "translateX(0)", boxShadow: "0 1px 2px var(--shadow-sm)" }}/>
                    </button>
                  </td>
                  <td style={TD}>
                    <button onClick={() => { setEditing(r); setShowModal(true); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", padding: 2 }} title="Edit">
                      <Icon name="edit" size={12}/>
                    </button>
                  </td>
                  <td style={TD}>
                    <button onClick={() => doDelete(r.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--neg)", padding: 2 }} title="Delete">
                      <Icon name="trash" size={12}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <RuleModal
          mode={editing ? "edit" : "create"}
          ruleType="pattern"
          rule={editing ? { regex_pattern: editing.regex_pattern, label: editing.label, merchant: editing.merchant || "", category: editing.category || "", enabled: editing.enabled !== false } : null}
          categories={categories}
          onSave={load}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

const MerchantAliasesSection = ({ categories }) => {
  const [aliases, setAliases] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showModal, setShowModal] = React.useState(false);
  const [editing, setEditing] = React.useState(null);

  const load = async () => {
    setLoading(true); setError(null);
    try { const d = await API.get("/api/merchant-aliases"); setAliases(d || []); }
    catch (e) { setError(e.message); setAliases([]); }
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const doDelete = async (id) => {
    try { await API.delete(`/api/merchant-aliases/${id}`); setAliases(prev => (prev || []).filter(a => a.id !== id)); showToast("Deleted alias"); } catch (_) {}
  };

  const TH = { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.6875rem" };

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Merchant Aliases</h3>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={load} style={{ ...accountStyles.btn, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 10px", fontSize: "0.6875rem" }}><Icon name="repeat" size={12}/></button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, padding: "5px 12px", fontSize: "0.6875rem", display: "flex", alignItems: "center", gap: 4 }}>
            <Icon name="plus" size={11}/> Add
          </button>
        </div>
      </div>
      <div style={accountStyles.sectionSub}>— raw merchant name → canonical name → category mappings</div>
      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {error && <div role="alert" style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 8 }}>{error}</div>}
      {!loading && aliases !== null && aliases.length === 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>No merchant aliases.</div>
      )}
      {aliases !== null && aliases.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Raw", "Canonical", "Category", "Confidence", "Hits", "", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {aliases.map(a => (
                <tr key={a.id}>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.raw}</td>
                  <td style={{ ...TD, fontWeight: 500, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.canonical}</td>
                  <td style={{ ...TD, color: "var(--ink-2)" }}>{a.category || "—"}</td>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace" }}>{(a.confidence * 100).toFixed(0)}%</td>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>{a.hit_count}</td>
                  <td style={TD}>
                    <button onClick={() => { setEditing(a); setShowModal(true); }} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--ink-3)", padding: 2 }} title="Edit">
                      <Icon name="edit" size={12}/>
                    </button>
                  </td>
                  <td style={TD}>
                    <button onClick={() => doDelete(a.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--neg)", padding: 2 }} title="Delete">
                      <Icon name="trash" size={12}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showModal && (
        <RuleModal
          mode={editing ? "edit" : "create"}
          ruleType="merchant"
          rule={editing ? { raw: editing.raw, canonical: editing.canonical, category: editing.category || "" } : null}
          categories={categories}
          onSave={load}
          onClose={() => { setShowModal(false); setEditing(null); }}
        />
      )}
    </div>
  );
};

const FilterRulesSection = () => {
  const [rules, setRules] = React.useState(null);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [showAdd, setShowAdd] = React.useState(false);
  const [newType, setNewType] = React.useState("allowlist_domain");
  const [newValue, setNewValue] = React.useState("");
  const [page, setPage] = React.useState(0);
  const pageSize = 50;

  const load = async (p) => {
    const targetPage = p ?? page;
    setLoading(true); setError(null);
    try {
      const d = await API.get(`/api/filter/rules?skip=${targetPage*pageSize}&limit=${pageSize}`);
      setRules(d.items || []);
      setTotal(d.total || 0);
      if (p !== undefined) setPage(p);
    } catch (e) { setError(e.message); setRules([]); setTotal(0); }
    setLoading(false);
  };

  React.useEffect(() => { load(0); }, []);

  const addRule = async () => {
    if (!newValue.trim()) return;
    try { await API.post("/api/filter/rules", { rule_type: newType, value: newValue.trim() }); setNewValue(""); setShowAdd(false); load(); showToast("Filter rule added"); }
    catch (e) { showToast(e.message || "Failed to add"); }
  };

  const doDelete = async (id) => {
    try { await API.delete(`/api/filter/rules/${id}`); setRules(prev => (prev || []).filter(r => r.id !== id)); showToast("Deleted filter rule"); } catch (_) {}
  };

  const typeLabel = (t) => ({ allowlist_domain: "Allow", blocklist_domain: "Block", keyword_pattern: "Keyword" }[t] || t);
  const typeColor = (t) => ({ allowlist_domain: "var(--pos-soft)", blocklist_domain: "var(--neg-soft)", keyword_pattern: "var(--accent-soft)" }[t] || "var(--paper-2)");
  const typeTextColor = (t) => ({ allowlist_domain: "var(--pos)", blocklist_domain: "var(--neg)", keyword_pattern: "var(--accent)" }[t] || "var(--ink-3)");

  const TH = { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.75rem" };

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Email Filter Rules</h3>
        <button onClick={() => load(page)} style={{ ...accountStyles.btn, display: "flex", alignItems: "center", justifyContent: "center", padding: "5px 10px", fontSize: "0.6875rem" }}><Icon name="repeat" size={12}/></button>
      </div>
      <div style={accountStyles.sectionSub}>— allowlist, blocklist, and keyword rules applied before classification</div>
      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {error && <div role="alert" style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 8 }}>{error}</div>}
      {!loading && rules !== null && rules.length === 0 && !showAdd && (
        <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>No filter rules yet.</div>
      )}
      {rules !== null && rules.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Type", "Value", "Source", "Hits", ""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rules.map(r => (
                <tr key={r.id}>
                  <td style={TD}>
                    <span style={{ fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: typeColor(r.rule_type), color: typeTextColor(r.rule_type), fontWeight: 600, textTransform: "uppercase" }}>{typeLabel(r.rule_type)}</span>
                  </td>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</td>
                  <td style={{ ...TD, color: "var(--ink-3)", fontSize: "0.6875rem" }}>{r.source || "—"}</td>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", color: "var(--ink-3)" }}>{r.hit_count || 0}</td>
                  <td style={TD}>
                    <button onClick={() => doDelete(r.id)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--neg)", padding: 2 }} title="Delete">
                      <Icon name="trash" size={12}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {total > pageSize && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 4px", fontSize: "0.75rem", color: "var(--ink-3)" }}>
              <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem" }}>
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => load(page - 1)} disabled={page === 0}
                  style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: page === 0 ? "var(--paper-2)" : "var(--paper)", color: page === 0 ? "var(--ink-4)" : "var(--ink-3)", fontSize: "0.6875rem", fontWeight: 500, cursor: page === 0 ? "default" : "pointer" }}>← Prev</button>
                <button onClick={() => load(page + 1)} disabled={(page + 1) * pageSize >= total}
                  style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: (page + 1) * pageSize >= total ? "var(--paper-2)" : "var(--paper)", color: (page + 1) * pageSize >= total ? "var(--ink-4)" : "var(--ink-3)", fontSize: "0.6875rem", fontWeight: 500, cursor: (page + 1) * pageSize >= total ? "default" : "pointer" }}>Next →</button>
              </div>
            </div>
          )}
        </div>
      )}
      {showAdd && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <select value={newType} onChange={e => setNewType(e.target.value)} style={{ ...accountStyles.input, width: 160 }}>
            <option value="allowlist_domain">Allowlist domain</option>
            <option value="blocklist_domain">Blocklist domain</option>
            <option value="keyword_pattern">Keyword pattern</option>
          </select>
          <input value={newValue} onChange={e => setNewValue(e.target.value)} onKeyDown={e => e.key === "Enter" && addRule()} style={{ ...accountStyles.input, flex: 1, minWidth: 160 }} placeholder="e.g. amazon.in" />
          <button onClick={addRule} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, padding: "8px 14px" }}>Add</button>
          <button onClick={() => { setShowAdd(false); setNewValue(""); }} style={accountStyles.btn}>Cancel</button>
        </div>
      )}
      {!showAdd && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", border: "1px dashed var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-3)", fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit" }}>
            <Icon name="plus" size={11}/> Add filter rule
          </button>
        </div>
      )}
    </div>
  );
};

const BuiltinRulesSection = () => {
  const [rules, setRules] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    API.get("/api/admin/domain-rules")
      .then(d => setRules(d.builtin || []))
      .catch(() => setRules([]))
      .finally(() => setLoading(false));
  }, []);

  const TH = { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "9px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.75rem" };

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Built-in Rules</h3>
      <div style={accountStyles.sectionSub}>— hardcoded domain→label mappings that ship with the app</div>
      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {!loading && rules !== null && rules.length === 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>No built-in rules loaded.</div>
      )}
      {rules !== null && rules.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>{["Domain", "Label", "Category"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem" }}>{r.domain}</td>
                  <td style={TD}>{labelBadge(r.label)}</td>
                  <td style={{ ...TD, color: "var(--ink-2)" }}>{r.category || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const RulesTab = ({ account, categories }) => {
  const isOwner = account?.role === "owner";
  return (
    <div>
      <div style={{ color: "var(--ink-3)", fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: "0.9375rem", marginBottom: 18 }}>
        — manage how MoneyFlow classifies your transactions
      </div>
      <RuleTester />
      <SenderRulesSection categories={categories} />
      {isOwner && (<>
        <PatternRulesSection categories={categories} />
        <MerchantAliasesSection categories={categories} />
        <FilterRulesSection />
        <BuiltinRulesSection />
      </>)}
      {!isOwner && (
        <div style={{ padding: "16px 20px", background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)", marginTop: 8 }}>
          <div style={{ fontFamily: "'Geist', sans-serif", fontSize: "1rem", fontWeight: 400, marginBottom: 4 }}>Advanced rules</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
            Pattern rules, merchant aliases, and email filter rules are available to workspace owners.
          </div>
        </div>
      )}
    </div>
  );
};

(window as any).RuleTester = RuleTester;
(window as any).SenderRulesSection = SenderRulesSection;
(window as any).PatternRulesSection = PatternRulesSection;
(window as any).MerchantAliasesSection = MerchantAliasesSection;
(window as any).FilterRulesSection = FilterRulesSection;
(window as any).BuiltinRulesSection = BuiltinRulesSection;
(window as any).RulesTab = RulesTab;
