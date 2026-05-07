// Admin — service testing panel

const { useState, useEffect, useRef, useCallback } = React;

const S = {
  page: { padding: "clamp(18px, 4vw, 32px) clamp(14px, 5vw, 40px)", maxWidth: 920, margin: "0 auto", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)" },
  section: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, padding: "clamp(16px, 4vw, 24px) clamp(14px, 4vw, 28px)", marginBottom: 16 },
  header: { marginBottom: 28 },
  kicker: { fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 500 },
  h1: { fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 400, letterSpacing: "-0.02em", margin: "2px 0 0", color: "var(--ink)" },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 500, margin: "0 0 4px" },
  sectionSub: { fontStyle: "italic", fontFamily: "'Instrument Serif', serif", fontSize: 14, color: "var(--ink-3)", marginBottom: 18 },
  row: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 },
  label: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6, display: "block" },
  input: { width: "100%", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13, outline: "none", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical", minHeight: 120, lineHeight: 1.6 },
  btn: { padding: "9px 18px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit", margin: 0 },
  btnPrimary: { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" },
  btnDanger: { background: "var(--neg-soft)", color: "var(--neg)", borderColor: "var(--neg-soft)" },
  result: { marginTop: 16, padding: "14px 16px", borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)", fontSize: 12, fontFamily: "'Geist Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th: { padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 },
  td: { padding: "11px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", color: "var(--ink-2)" },
  badge: { display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 5, fontSize: 12, fontWeight: 600 },
  progress: { marginTop: 12, padding: "14px 16px", borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)" },
  progressBar: { height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden", margin: "10px 0 8px" },
  progressFill: { height: "100%", background: "var(--pos)", borderRadius: 2, transition: "width 300ms ease" },
  pill: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500 },
  divider: { height: 1, background: "var(--line)", margin: "20px 0" },
};

const Spinner = () => (
  <>
    <style>{`@keyframes sp{to{transform:rotate(360deg)}}`}</style>
    <div style={{ width: 14, height: 14, border: "2px solid var(--line)", borderTopColor: "var(--ink-2)", borderRadius: "50%", animation: "sp 600ms linear infinite", flexShrink: 0 }} />
  </>
);

const labelColor = (l) => ({
  expense: { background: "var(--neg-soft)", color: "var(--neg)" },
  income:  { background: "var(--pos-soft)", color: "var(--pos)" },
  ignore:  { background: "var(--paper-2)", color: "var(--ink-3)" },
}[l] || { background: "var(--paper-2)", color: "var(--ink-3)" });

const confColor = (c) => c >= 0.85 ? "var(--pos)" : c >= 0.65 ? "var(--accent)" : "var(--neg)";

// ── Section: Sync ─────────────────────────────────────────────────────────────

const SyncSection = () => {
  const [status, setStatus]     = useState(null);
  const [progress, setProgress] = useState(null);
  const [running, setRunning]   = useState(false);
  const pollRef = useRef(null);

  const loadStatus = () => API.get("/api/sync/status").then(setStatus).catch(() => {});

  const startPoll = useCallback(() => {
    let started = false, attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const p = await API.get("/api/sync/progress");
        setProgress(p);
        if (p.running) started = true;
        const done = !p.running && (started || p.phase === "done" || p.phase === "error");
        if (done || attempts >= 200) {
          clearInterval(pollRef.current);
          setRunning(false);
          loadStatus();
        }
      } catch (_) {
        if (attempts >= 200) { clearInterval(pollRef.current); setRunning(false); }
      }
    }, 1500);
  }, []);

  useEffect(() => {
    loadStatus();
    return () => clearInterval(pollRef.current);
  }, []);

  const trigger = async () => {
    if (running) return;
    setRunning(true);
    setProgress(null);
    try {
      await API.post("/api/sync/trigger");
      startPoll();
    } catch (e) {
      setRunning(false);
      alert("Sync trigger failed: " + e.message);
    }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
  const phase = progress?.phase || "idle";

  return (
    <>
      <h3 style={S.sectionTitle}>Gmail Sync</h3>
      <div style={S.sectionSub}>— trigger a full Gmail sync and watch live progress</div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <span style={{ fontSize: 12, color: status?.last_synced_at ? "var(--ink-3)" : "var(--ink-4)" }}>
          {status?.last_synced_at
            ? `Last synced: ${new Date(status.last_synced_at).toLocaleString("en-IN")}`
            : "Never synced"}
        </span>
        <button style={{ ...S.btn, ...(running ? {} : S.btnPrimary) }} onClick={trigger} disabled={running}>
          {running ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Spinner /> Syncing…</span> : "▶ Trigger Sync"}
        </button>
      </div>

      {progress && (
        <div style={S.progress}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12 }}>
            <span style={{ fontWeight: 500, color: "var(--ink-2)", textTransform: "capitalize" }}>{phase}</span>
            <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>
              {progress.current}/{progress.total || "?"} emails
            </span>
          </div>
          <div style={S.progressBar}>
            <div style={{ ...S.progressFill, width: `${pct}%` }} />
          </div>
          {progress.tally && (
            <div style={{ display: "flex", gap: 10, fontSize: 11 }}>
              {[["expense","var(--neg)","Exp"],["income","var(--pos)","Inc"],["ignore","var(--ink-4)","Ign"]].map(([k,c,lbl])=>(
                <span key={k} style={{ color: c }}>
                  {lbl}: <strong>{progress.tally[k] || 0}</strong>
                </span>
              ))}
            </div>
          )}
          {progress.previews?.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 6, fontWeight: 500 }}>Recent</div>
              {progress.previews.slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 12, padding: "3px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ ...S.badge, ...labelColor(p.label), flexShrink: 0 }}>{p.label}</span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ink-2)" }}>{p.subject}</span>
                  {p.amount != null && <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)", flexShrink: 0 }}>₹{p.amount.toLocaleString("en-IN")}</span>}
                </div>
              ))}
            </div>
          )}
          {phase === "done" && progress.result && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--pos)", fontWeight: 500 }}>
              ✓ Done — {progress.result.processed} classified, {progress.result.skipped} skipped, {progress.result.total_fetched} fetched
            </div>
          )}
          {phase === "error" && (
            <div style={{ marginTop: 10, fontSize: 12, color: "var(--neg)" }}>✗ Error: {progress.error}</div>
          )}
        </div>
      )}
    </>
  );
};

// ── Section: Gmail Fetch Preview ───────────────────────────────────────────────

const FetchPreviewSection = () => {
  const [limit, setLimit]   = useState(10);
  const [query, setQuery]   = useState("newer_than:7d");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError]   = useState(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/admin/fetch-preview", { limit, query });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <h3 style={S.sectionTitle}>Gmail Fetch Preview</h3>
      <div style={S.sectionSub}>— pull N emails from Gmail without writing to DB, confirms auth + fetch pipeline</div>

      <div style={S.row}>
        <div style={{ width: 90 }}>
          <label style={S.label}>Limit</label>
          <input type="number" min={1} max={100} value={limit} onChange={e => setLimit(+e.target.value)}
            style={{ ...S.input, width: 90 }} />
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={S.label}>Gmail Query</label>
          <input value={query} onChange={e => setQuery(e.target.value)} style={S.input}
            placeholder="newer_than:7d, is:unread, from:hdfc…" />
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary, alignSelf: "flex-end" }} onClick={run} disabled={loading}>
          {loading ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Spinner /> Fetching…</span> : "Fetch"}
        </button>
      </div>

      {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>✗ {error}</div>}

      {result && (
        <>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 10 }}>
            Fetched <strong style={{ color: "var(--ink)" }}>{result.count}</strong> emails
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {["Sender", "Subject", "Domain", "Received", "Body chars", ""].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.emails.map(e => (
                  <tr key={e.gmail_id}>
                    <td style={{ ...S.td, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.sender}</td>
                    <td style={{ ...S.td, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject || "(no subject)"}</td>
                    <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>{e.sender_domain}</td>
                    <td style={{ ...S.td, whiteSpace: "nowrap", fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>{new Date(e.received_at).toLocaleDateString("en-IN")}</td>
                    <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", textAlign: "right" }}>{e.body_chars}</td>
                    <td style={S.td}><a href={e.gmail_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: 11, textDecoration: "none" }}>Open ↗</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
};

// ── Section: Classifier Tester ────────────────────────────────────────────────

const ClassifyTestSection = () => {
  const [sender,  setSender]  = useState("alerts@hdfcbank.net");
  const [subject, setSubject] = useState("HDFC Bank: Rs.499.00 debited from your account");
  const [body,    setBody]    = useState("Dear Customer,\n\nRs.499.00 has been debited from your HDFC Bank account ending 1234 for payment to Swiggy on 18-Apr-2026.\n\nAvailable balance: Rs.12,340.00");
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/admin/classify-test", { sender, subject, body });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <h3 style={S.sectionTitle}>Classifier Tester</h3>
      <div style={S.sectionSub}>— test the LLM classification pipeline with any input, no DB writes</div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <label style={S.label}>Sender</label>
            <input value={sender} onChange={e => setSender(e.target.value)} style={S.input} placeholder="noreply@bank.com" />
          </div>
          <div>
            <label style={S.label}>Subject</label>
            <input value={subject} onChange={e => setSubject(e.target.value)} style={S.input} placeholder="Rs.X debited from account" />
          </div>
        </div>
        <div>
          <label style={S.label}>Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...S.textarea, minHeight: 140 }} placeholder="Email body text…" />
        </div>
      </div>

      <button style={{ ...S.btn, ...S.btnPrimary, width: "100%", justifyContent: "center", display: "flex", alignItems: "center", gap: 8, padding: "11px 20px", fontSize: 14 }} onClick={run} disabled={loading}>
        {loading ? <><Spinner /> Classifying…</> : "Run Classifier"}
      </button>

      {error && <div style={{ color: "var(--neg)", fontSize: 12, marginTop: 12 }}>✗ {error}</div>}

      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
            <span style={{ ...S.badge, ...labelColor(result.label), fontSize: 13, padding: "4px 12px" }}>
              {result.label.toUpperCase()}
            </span>
            {result.amount != null && (
              <span style={{ fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 400 }}>
                ₹{result.amount.toLocaleString("en-IN")}
              </span>
            )}
            <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
              conf: <span style={{ fontWeight: 600, color: confColor(result.confidence) }}>{(result.confidence * 100).toFixed(0)}%</span>
            </span>
            <span style={{ ...S.pill, background: result.status === "auto" ? "var(--pos-soft)" : "var(--accent-soft)", color: result.status === "auto" ? "var(--pos)" : "var(--accent)" }}>
              {result.status}
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
            {[
              ["Merchant",   result.merchant   || "—"],
              ["Category",   result.category   || "—"],
              ["Txn Date",   result.txn_date   || "—"],
              ["Domain",     result.sender_domain || "—"],
              ["Method",     result.classifier_method],
            ].map(([k, v]) => (
              <div key={k} style={{ padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 3, fontWeight: 500 }}>{k}</div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

// ── Section: LLM Provider Status ──────────────────────────────────────────────

const LLMStatusSection = ({ account, settings }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(null);
  const [testResult, setTestResult] = useState(null);
  const aiServices = (account?.ai_services || []);
  const activeId = settings?.active_ai_service_id;

  const load = () => {
    setLoading(true);
    API.get("/api/llm/status").then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  const testProvider = async (providerName, isUserService = false) => {
    setTesting(providerName);
    setTestResult(null);
    try {
      const res = await API.post("/api/admin/test-provider", { provider: providerName, is_user_service: isUserService });
      setTestResult(res.ok ? { success: true, result: res } : { success: false, error: res.detail || "Failed" });
    } catch (e) {
      setTestResult({ success: false, error: e.message || "Failed" });
    } finally {
      setTesting(null);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={S.sectionTitle}>LLM Providers</h3>
        <button style={{ ...S.btn, ...S.btnPrimary, display: "flex", alignItems: "center", gap: 6 }} onClick={load}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>↻</span> Refresh
        </button>
      </div>
      <div style={S.sectionSub}>— priority-ordered dispatch list, rate-limit hits persistently demote providers</div>

      {/* User AI Services from DB */}
      {aiServices.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>Your AI Services</div>
          <div style={{ overflowX: "auto" }}>
            <table style={S.table}>
<thead>
                  <tr>
                    <th key="service" style={S.th}>Service</th>
                    <th key="model" style={S.th}>Model</th>
                    <th key="provider" style={S.th}>Provider</th>
                    <th key="status" style={S.th}>Status</th>
                    <th key="test" style={S.th}>Test</th>
                  </tr>
                </thead>
              <tbody>
                {aiServices.map(svc => (
                  <tr key={svc.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>
                      {svc.display_name}
                      {svc.id === activeId && <span style={{ marginLeft: 8, fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase" }}>Active</span>}
                    </td>
                    <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{svc.model_id}</td>
                    <td style={{ ...S.td, fontSize: 12, color: "var(--ink-3)" }}>{svc.provider}{svc.base_url ? ` · ${svc.base_url}` : ""}</td>
                    <td style={S.td}>
                      <span style={{ ...S.pill, background: svc.enabled ? "var(--pos-soft)" : "var(--paper-2)", color: svc.enabled ? "var(--pos)" : "var(--ink-4)" }}>
                        {svc.enabled ? "Enabled" : "Disabled"}
                      </span>
                    </td>
                    <td style={S.td}>
                      <button
                        style={{ ...S.btn, padding: "4px 10px", fontSize: 11, opacity: !svc.enabled || testing === svc.id ? 0.5 : 1 }}
                        disabled={!svc.enabled || testing === svc.id}
                        onClick={() => testProvider(svc.provider, true)}
                      >
                        {testing === svc.id ? "..." : "Test"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Global LLM providers (built-in) */}
      <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 600, marginBottom: 10 }}>Built-in providers</div>
      {loading && <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {!loading && data && (
        <>
          {data.providers.length === 0 ? (
            <div style={{ fontSize: 13, color: "var(--ink-4)", fontStyle: "italic", padding: "12px 0" }}>No built-in providers configured (no API keys set).</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th key="#" style={S.th}>#</th>
                    <th key="provider" style={S.th}>Provider</th>
                    <th key="status" style={S.th}>Status</th>
                    <th key="ratelimit" style={S.th}>Rate-limited</th>
                    <th key="penalty" style={S.th}>Penalty</th>
                    <th key="ok" style={S.th}>OK</th>
                    <th key="fail" style={S.th}>Fail</th>
                    <th key="err" style={S.th}>Err%</th>
                    <th key="test" style={S.th}>Test</th>
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p, i) => (
                    <tr key={p.name}>
                      <td style={{ ...S.td, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{i + 1}</td>
                      <td style={{ ...S.td, fontWeight: 600 }}>{p.name}</td>
                      <td style={S.td}>
                        <span style={{ ...S.pill, background: p.available ? "var(--pos-soft)" : "var(--neg-soft)", color: p.available ? "var(--pos)" : "var(--neg)" }}>
                          {p.available ? "Ready" : "Limited"}
                        </span>
                      </td>
                      <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: p.rate_limited_secs > 0 ? "var(--neg)" : "var(--ink-4)" }}>
                        {p.rate_limited_secs > 0 ? `${p.rate_limited_secs}s` : "—"}
                      </td>
                      <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{p.priority_score.toFixed(3)}</td>
                      <td style={{ ...S.td, color: "var(--pos)", fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{p.success}</td>
                      <td style={{ ...S.td, color: p.fail > 0 ? "var(--neg)" : "var(--ink-4)", fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{p.fail}</td>
                      <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 12, color: p.error_rate > 0.1 ? "var(--neg)" : "var(--ink-3)" }}>
                        {(p.error_rate * 100).toFixed(0)}%
                      </td>
                      <td style={S.td}>
                        <button
                          style={{ ...S.btn, padding: "4px 10px", fontSize: 11, opacity: testing === p.name ? 0.5 : 1 }}
                          disabled={!p.available || testing === p.name}
                          onClick={() => testProvider(p.name, false)}
                        >
                          {testing === p.name ? "..." : "Test"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.config && (
            <div style={{ marginTop: 14, display: "flex", gap: 24, fontSize: 13, color: "var(--ink-3)", flexWrap: "wrap" }}>
              <span>Confidence threshold: <strong style={{ color: "var(--ink)" }}>{data.config.confidence_threshold}</strong></span>
              <span>Auto-confirm threshold: <strong style={{ color: "var(--ink)" }}>{data.config.auto_confirm_threshold}</strong></span>
            </div>
          )}
          {testResult && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 6, background: testResult.success ? "rgba(46, 204, 113, 0.1)" : "rgba(231, 76, 60, 0.1)", border: `1px solid ${testResult.success ? "var(--pos)" : "var(--neg)"}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: testResult.success ? "var(--pos)" : "var(--neg)" }}>
                {testResult.success ? "Test passed!" : "Test failed"}
              </div>
              {testResult.result && (
                <pre style={{ marginTop: 8, fontSize: 11, fontFamily: "'Geist Mono', monospace", whiteSpace: "pre-wrap", color: "var(--ink-3)", maxHeight: 150, overflow: "auto" }}>
                  {JSON.stringify(testResult.result, null, 2)}
                </pre>
              )}
              {testResult.error && (
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--neg)" }}>{testResult.error}</div>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
};

// ── Section: Alerts ───────────────────────────────────────────────────────────

const AlertsSection = () => {
  const [alerts,  setAlerts]  = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    API.get("/api/alerts").then(setAlerts).catch(() => setAlerts([])).finally(() => setLoading(false));
  };

  const clear = async () => {
    await API.post("/api/alerts/clear").catch(() => {});
    setAlerts([]);
  };

  useEffect(() => { load(); }, []);

  const levelColor = (l) => ({
    error:   { background: "var(--neg-soft)",    color: "var(--neg)" },
    warning: { background: "var(--accent-soft)", color: "var(--accent)" },
    info:    { background: "var(--pos-soft)",    color: "var(--pos)" },
  }[l] || { background: "var(--paper-2)", color: "var(--ink-3)" });

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={S.sectionTitle}>System Alerts</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn, display: "flex", alignItems: "center", gap: 6 }} onClick={load}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>↻</span> Refresh
          </button>
          {alerts.length > 0 && (
            <button style={{ ...S.btn, ...S.btnDanger }} onClick={clear}>Clear All ({alerts.length})</button>
          )}
        </div>
      </div>
      <div style={{ ...S.sectionSub, marginBottom: alerts.length ? 16 : 0 }}>
        — LLM failures, rate-limit hits, and other system events
      </div>

      {loading && <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {!loading && alerts.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--pos)", fontWeight: 500, padding: "14px 16px", background: "var(--pos-soft)", borderRadius: 6, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>✓</span> No alerts — all clear
        </div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "14px 0", borderBottom: i < alerts.length - 1 ? "1px solid var(--line)" : "none" }}>
          <span style={{ ...S.badge, ...levelColor(a.level), flexShrink: 0, minWidth: 60, justifyContent: "center" }}>{a.level}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.5, wordBreak: "break-all" }}>{a.message}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
              {a.source && <span>{a.source}</span>}
              {a.timestamp && <span>{new Date(a.timestamp).toLocaleTimeString("en-IN")}</span>}
            </div>
          </div>
        </div>
      ))}
    </>
  );
};

// ── Section: Fetch Email Range ─────────────────────────────────────────────────

const FetchRangeSection = () => {
  const [afterDate,  setAfterDate]  = React.useState("");
  const [beforeDate, setBeforeDate] = React.useState("");
  const [loading,    setLoading]    = React.useState(false);
  const [result,     setResult]     = React.useState(null);
  const [error,      setError]      = React.useState(null);

  const run = async () => {
    if (!afterDate || !beforeDate || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/sync/fetch-range", { after_date: afterDate, before_date: beforeDate });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const disabled = !afterDate || !beforeDate || loading;

  return (
    <>
      <h3 style={S.sectionTitle}>Fetch Email Range</h3>
      <div style={S.sectionSub}>— fetch emails from Gmail in a date range, then backfill missing bodies</div>
      <div style={S.row}>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={S.label}>From</label>
          <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} style={S.input} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={S.label}>To</label>
          <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)} style={S.input} />
        </div>
        <button style={{ ...S.btn, ...(disabled ? {} : S.btnPrimary), opacity: disabled ? 0.5 : 1, padding: "9px 24px", alignSelf: "flex-end" }} onClick={run} disabled={disabled}>
          {loading ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Spinner /> Fetching…</span> : "Fetch + Backfill"}
        </button>
      </div>
      {result && (
        <div style={{ fontSize: 12, color: "var(--pos)" }}>
          ✓ fetched: {result.fetched} · inserted: {result.inserted} · backfilled: {result.backfilled} · errors: {result.errors}
        </div>
      )}
      {error && <div style={{ color: "var(--neg)", fontSize: 12 }}>✗ {error}</div>}
    </>
  );
};

// ── AdminView (exported) ───────────────────────────────────────────────────────

const AdminView = () => (
  <div style={S.page}>
    <div style={S.header}>
      <div style={S.kicker}>System</div>
      <h1 style={S.h1}>Admin</h1>
    </div>
    <div style={S.section}><SyncSection /></div>
    <div style={S.section}><FetchPreviewSection /></div>
    <div style={S.section}><ClassifyTestSection /></div>
    <div style={S.section}><LLMStatusSection /></div>
    <div style={S.section}><AlertsSection /></div>
  </div>
);

Object.assign(window, { AdminView, SyncSection, FetchPreviewSection, ClassifyTestSection, LLMStatusSection, AlertsSection, FetchRangeSection });
