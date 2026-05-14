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
  progressFill: { height: "100%", background: "var(--pos)", borderRadius: 2 },
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
            <div className="progress-fill" style={{ ...S.progressFill, transform: `scaleX(${pct / 100})` }} />
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
  const [useLlm, setUseLlm]   = useState(true);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/admin/classify-test", { sender, subject, body, use_llm: useLlm });
      setResult(r);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <>
      <h3 style={S.sectionTitle}>Classifier Tester</h3>
      <div style={S.sectionSub}>— test the classification pipeline with any input, no DB writes</div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16, padding: "8px 12px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)" }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>Use LLM</div>
        <button
          type="button"
          onClick={() => setUseLlm(!useLlm)}
          style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: useLlm ? "var(--pos)" : "var(--line)",
            display: "flex", alignItems: "center", padding: 2,
          }}
        >
          <div style={{
            width: 18, height: 18, borderRadius: "50%", background: "#fff",
            transform: useLlm ? "translateX(20px)" : "translateX(0)",
            transition: "transform 150ms ease",
          }} />
        </button>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 16, marginTop: -12 }}>
        {useLlm ? "LLM enabled — uses AI for classification" : "LLM disabled — uses rules only (faster, no API calls)"}
      </div>

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
  const activeId = data?.active_service_id || settings?.active_ai_service_id;

  const load = () => {
    setLoading(true);
    API.get("/api/llm/status").then(setData).catch(() => {}).finally(() => setLoading(false));
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
                  </tr>
                </thead>
                <tbody>
                  {data.providers.map((p, i) => (
                    <tr key={p.source === "custom" ? `cust-${p.service_id}` : p.name}>
                      <td style={{ ...S.td, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{i + 1}</td>
                      <td style={{ ...S.td, fontWeight: 600 }}>
                        {p.source === "custom" ? (
                          <span style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {p.display_name}
                            {p.service_id === activeId && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase" }}>Active</span>}
                            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase" }}>Custom</span>
                            <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 400, fontFamily: "'Geist Mono', monospace" }}>{p.model}</span>
                          </span>
                        ) : p.name}
                      </td>
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
        </>
      )}
    </>
  );
};

// ── Section: LLM Provider Test ───────────────────────────────────────────────

const LLMTestSection = ({ account }) => {
  const [target, setTarget] = useState("");
  const [testType, setTestType] = useState("classify"); // "classify" or "raw"
  const [sender, setSender] = useState("alerts@hdfcbank.net");
  const [subject, setSubject] = useState("HDFC Bank: Rs.499.00 debited from your account");
  const [body, setBody] = useState("Dear Customer,\n\nRs.499.00 has been debited from your HDFC Bank account ending 1234 for payment to Swiggy on 18-Apr-2026.\n\nAvailable balance: Rs.12,340.00");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);

  const aiServices = account?.ai_services || [];
  const allProviders = aiServices.map(s => ({ id: `service:${s.id}`, name: s.display_name, isUser: true }));

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      let prompt;
      if (testType === "classify") {
        prompt = `You are a transaction classifier. Given an email, classify it as expense, income, or ignore.

Email:
From: ${sender}
Subject: ${subject}
Body: ${body}

Respond with JSON containing:
- label: "expense", "income", or "ignore"
- amount: the transaction amount (number) if found, else null
- merchant: the merchant name if found, else null
- category: the category (e.g., "Food", "Transport", "Banking", "Shopping")
- confidence: 0-1 how certain you are

Respond with only valid JSON like: {"label":"expense","amount":499,"merchant":"Swiggy","category":"Food","confidence":0.95}`;
      } else {
        prompt = "Say 'OK' if you can read this.";
      }

      const serviceId = target.slice("service:".length);
      const res = await fetch("/api/admin/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_user_service: true, service_id: serviceId, prompt })
      });
      const data = await res.json();
      setResult({ ok: res.ok, data });
    } catch(e) {
      setResult({ ok: false, data: { error: e.message } });
    }
    setTesting(false);
  };

  return (
    <div style={S.section}>
      <h3 style={S.sectionTitle}>Test LLM Provider</h3>
      <div style={S.sectionSub}>— verify your LLM service works with transaction classification</div>

      {/* Test type toggle */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {["classify", "raw"].map(t => (
          <button
            key={t}
            onClick={() => setTestType(t)}
            style={{
              padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer", fontSize: 12,
              background: testType === t ? "var(--ink)" : "transparent",
              color: testType === t ? "var(--paper)" : "var(--ink-3)",
              fontFamily: "inherit",
            }}
          >
            {t === "classify" ? "Transaction" : "Raw"}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12, alignItems: "flex-end" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <label style={S.label}>Provider</label>
          <select value={target} onChange={e => setTarget(e.target.value)} style={{ ...S.input, width: "100%", maxWidth: 220 }}>
            <option value="">— select a service —</option>
            {allProviders.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button style={{ ...S.btn, ...S.btnPrimary, opacity: testing ? 0.5 : 1, height: 36, marginBottom: 1 }} onClick={test} disabled={testing}>
          {testing ? "Testing..." : "Test"}
        </button>
      </div>

      {testType === "classify" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={S.label}>Sender</label>
              <input value={sender} onChange={e => setSender(e.target.value)} style={S.input} placeholder="noreply@bank.com" />
            </div>
            <div>
              <label style={S.label}>Subject</label>
              <input value={subject} onChange={e => setSubject(e.target.value)} style={S.input} placeholder="Rs.X debited" />
            </div>
          </div>
          <div>
            <label style={S.label}>Email Body</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              style={{ ...S.textarea, minHeight: 100 }}
              placeholder="Paste transaction email body here..."
            />
          </div>
        </div>
      )}

      {result && (
        <pre style={{ marginTop: 12, fontSize: 11, fontFamily: "'Geist Mono', monospace", whiteSpace: "pre-wrap", color: result.ok ? "var(--pos)" : "var(--neg)", background: "var(--paper-2)", padding: 10, borderRadius: 6, maxHeight: 240, overflow: "auto" }}>
          {JSON.stringify(result.data, null, 2)}
        </pre>
      )}
    </div>
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
  const [sender, setSender] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [loading,    setLoading]    = React.useState(false);
  const [result,     setResult]     = React.useState(null);
  const [error,      setError]      = React.useState(null);

  const run = async () => {
    if (!afterDate || !beforeDate || loading) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await API.post("/api/sync/fetch-range", {
        after_date: afterDate,
        before_date: beforeDate,
        sender: sender.trim() || undefined,
        subject: subject.trim() || undefined,
      });
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
          <label style={S.label}>From (date)</label>
          <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} style={S.input} />
        </div>
        <div style={{ flex: 1, minWidth: 120 }}>
          <label style={S.label}>To (date)</label>
          <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)} style={S.input} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={S.label}>Sender</label>
          <input type="text" value={sender} onChange={e => setSender(e.target.value)} placeholder="axisbank.com" style={S.input} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={S.label}>Subject</label>
          <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="debit" style={S.input} />
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

// ── Section: Filter Rules ─────────────────────────────────────────────────────

const FilterRulesSection = () => {
  const [rules,    setRules]    = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [refining, setRefining] = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);

  const load = () => {
    setLoading(true);
    API.get("/api/filter/rules").then(setRules).catch(() => setRules([])).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const refine = async () => {
    setRefining(true); setResult(null); setError(null);
    try {
      const r = await API.post("/api/filter/refine");
      setResult(r);
      load();
    } catch (e) { setError(e.message); }
    finally { setRefining(false); }
  };

  const sourceColor = (s) => ({
    system: { background: "var(--paper-2)",   color: "var(--ink-3)" },
    user:   { background: "var(--pos-soft)",   color: "var(--pos)" },
    llm:    { background: "var(--accent-soft)", color: "var(--accent)" },
  }[s] || { background: "var(--paper-2)", color: "var(--ink-3)" });

  const typeLabel = (t) => ({ allowlist_domain: "allow", blocklist_domain: "block", keyword_pattern: "keyword" }[t] || t);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={S.sectionTitle}>Filter Rules</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={{ ...S.btn, display: "flex", alignItems: "center", gap: 6 }} onClick={load} disabled={loading}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>↻</span> Refresh
          </button>
          <button style={{ ...S.btn, ...(refining ? {} : S.btnPrimary), display: "flex", alignItems: "center", gap: 6 }} onClick={refine} disabled={refining}>
            {refining ? <><Spinner /> Refining…</> : "✦ Refine Filter Rules"}
          </button>
        </div>
      </div>
      <div style={{ ...S.sectionSub, marginBottom: 16 }}>
        — LLM mines recent keep/discard decisions to generate new allowlist/blocklist rules
      </div>
      {result && (
        <div style={{ fontSize: 12, color: "var(--pos)", marginBottom: 12 }}>
          ✓ {result.generated ?? 0} new rule{result.generated !== 1 ? "s" : ""} generated
        </div>
      )}
      {error && <div style={{ color: "var(--neg)", fontSize: 12, marginBottom: 12 }}>✗ {error}</div>}
      {loading && <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>}
      {!loading && rules.length > 0 && (
        <table style={S.table}>
          <thead>
            <tr>
              {["Type", "Value", "Source", "Hits"].map(h => <th key={h} style={S.th}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rules.map(r => (
              <tr key={r.id}>
                <td style={S.td}><span style={{ ...S.badge, background: "var(--paper-2)", color: "var(--ink-3)", fontSize: 11 }}>{typeLabel(r.rule_type)}</span></td>
                <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{r.value}</td>
                <td style={S.td}><span style={{ ...S.badge, ...sourceColor(r.source), fontSize: 11 }}>{r.source}</span></td>
                <td style={{ ...S.td, color: r.hit_count > 0 ? "var(--ink)" : "var(--ink-4)", fontVariantNumeric: "tabular-nums" }}>{r.hit_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!loading && rules.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>No filter rules found.</div>
      )}
    </>
  );
};

// ── Section: Rule Engine Feedback ────────────────────────────────────────────

const RuleEngineSection = () => {
  const [builtinRules, setBuiltinRules] = useState([]);
  const [learnedRules, setLearnedRules] = useState([]);
  const [senderRules, setSenderRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    API.get("/api/admin/domain-rules").then(d => {
      setBuiltinRules(d.builtin || []);
      setLearnedRules(d.learned || []);
    }).catch(e => setError(e.message));
    API.get("/api/admin/sender-rules").then(d => setSenderRules(d.rules || [])).catch(() => {});
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true);
    setGenerated(null);
    setError(null);
    try {
      const r = await API.post("/api/admin/generate-domain-rules");
      setGenerated(r);
      load();
    } catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const labelColor = (l) => ({
    expense: { background: "var(--neg-soft, #fee2e2)", color: "var(--neg, #ef4444)" },
    income:  { background: "var(--pos-soft, #d1fae5)", color: "var(--pos, #059669)" },
    ignore:  { background: "var(--paper-2)",            color: "var(--ink-3)" },
  }[l] || { background: "var(--paper-2)", color: "var(--ink-3)" });

  const TD = { padding: "6px 10px", borderBottom: "1px solid var(--line)", fontSize: 13, verticalAlign: "top" };
  const TH = { ...TD, fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, borderBottom: "1px solid var(--ink-4)", textAlign: "left" };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={S.sectionTitle}>Domain Rules</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btn} onClick={load} disabled={loading}>↻ Refresh</button>
          <button style={{ ...S.btn, ...S.btnPrimary }} onClick={generate} disabled={generating}>
            {generating ? "Generating…" : "✦ Generate from data"}
          </button>
        </div>
      </div>
      <div style={{ ...S.sectionSub, marginBottom: 16 }}>
        — learned domain→label mappings used by the rule engine during classification
      </div>

      {error && <div style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>{error}</div>}

      {generated && (
        <div style={{ padding: 10, background: "var(--pos-soft)", color: "var(--pos)", borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          Generated {generated.count} domain rule{generated.count !== 1 ? "s" : ""}
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>Built-in rules ({builtinRules.length})</div>
      {builtinRules.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 13 }}>
          <thead><tr>
            <th style={TH}>Domain</th>
            <th style={TH}>Label</th>
            <th style={TH}>Category</th>
          </tr></thead>
          <tbody>
            {builtinRules.map((r, i) => (
              <tr key={i}>
                <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{r.domain}</td>
                <td style={TD}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, ...labelColor(r.label) }}>{r.label}</span></td>
                <td style={TD}>{r.category || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic", marginBottom: 16 }}>No built-in rules</div>
      )}

      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)", marginBottom: 6 }}>Learned from data ({learnedRules.length})</div>
      {learnedRules.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 13 }}>
          <thead><tr>
            <th style={TH}>Domain</th>
            <th style={TH}>Label</th>
            <th style={TH}>Category</th>
          </tr></thead>
          <tbody>
            {learnedRules.map((r, i) => (
              <tr key={i}>
                <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{r.domain}</td>
                <td style={TD}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, ...labelColor(r.label) }}>{r.label}</span></td>
                <td style={TD}>{r.category || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic", marginBottom: 16 }}>No learned rules yet. Use "Generate from data".</div>
      )}

      <details>
        <summary style={{ fontSize: 12, color: "var(--ink-3)", cursor: "pointer", userSelect: "none", padding: "4px 0" }}>
          User corrections ({senderRules.length})
        </summary>
        <div style={{ marginTop: 8 }}>
          {senderRules.length > 0 ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>
                <th style={TH}>Domain</th>
                <th style={TH}>Label</th>
                <th style={TH}>Category</th>
                <th style={TH}>Date</th>
              </tr></thead>
              <tbody>
                {senderRules.map(r => (
                  <tr key={r.id}>
                    <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: 12 }}>{r.sender_domain}</td>
                    <td style={TD}><span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, ...labelColor(r.label) }}>{r.label}</span></td>
                    <td style={TD}>{r.category || "—"}</td>
                    <td style={{ ...TD, fontSize: 11, color: "var(--ink-4)" }}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No user corrections yet.</div>
          )}
        </div>
      </details>
    </>
  );
};

// ── Section: Clean Email Bodies ──────────────────────────────────────────────

const CleanBodiesSection = () => {
  const { progress, running, start, dismiss } = useBackgroundJob();
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (progress?.result) setResult(progress.result);
  }, [progress]);

  const run = () => start("/api/sync/trigger-clean-bodies");

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={S.sectionTitle}>Clean Email Bodies</h3>
        <button onClick={run} disabled={running} style={{ ...S.btn, ...S.btnPrimary, opacity: running ? 0.65 : 1 }}>
          {running ? "Running…" : "Clean bodies"}
        </button>
      </div>
      <div style={S.sectionSub}>— re-fetch emails with undecoded HTML entities / invisible Unicode and re-extract clean text</div>
      {result && !progress && <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--pos-soft)", borderRadius: 6, fontSize: 13, color: "var(--pos)" }}>✓ Cleaned {result.cleaned} of {result.total_candidates} candidate emails</div>}
      {progress && window.SyncProgressOverlay && (() => { const O = window.SyncProgressOverlay; return <O progress={progress} syncing={running} onClose={dismiss} position="bottom-right" />; })()}
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
    <div style={S.section}><LLMStatusSection account={window.currentAccount} settings={window.currentSettings} /></div>
    <div style={S.section}><LLMTestSection account={window.currentAccount} /></div>
    <div style={S.section}><RuleEngineSection /></div>
    <div style={S.section}><CleanBodiesSection /></div>
    <div style={S.section}><FetchRangeSection /></div>
    <div style={S.section}><FilterRulesSection /></div>
    <div style={S.section}><AlertsSection /></div>
  </div>
);

Object.assign(window, { AdminView, SyncSection, FetchPreviewSection, ClassifyTestSection, LLMStatusSection, LLMTestSection, AlertsSection, FetchRangeSection, RuleEngineSection, CleanBodiesSection });
