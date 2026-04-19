// Admin — service testing panel

const { useState, useEffect, useRef, useCallback } = React;

const S = {
  page: { padding: "32px 40px", maxWidth: 1000, overflowY: "auto", height: "calc(100vh - 72px)" },
  section: { background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: "24px 28px", marginBottom: 20 },
  sectionTitle: { fontFamily: "'Fraunces', serif", fontSize: 17, fontWeight: 500, marginBottom: 4, letterSpacing: "-0.01em" },
  sectionSub: { fontSize: 12, color: "var(--ink-3)", marginBottom: 20 },
  row: { display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginBottom: 16 },
  label: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 5, display: "block" },
  input: { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13, outline: "none", fontFamily: "inherit" },
  textarea: { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 12, fontFamily: "'Geist Mono', monospace", outline: "none", resize: "vertical", minHeight: 100 },
  btn: { padding: "8px 16px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "inherit" },
  btnPrimary: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },
  btnDanger: { background: "var(--neg-soft)", color: "var(--neg)", border: "1px solid var(--neg)" },
  result: { marginTop: 16, padding: "14px 16px", borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)", fontSize: 12, fontFamily: "'Geist Mono', monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 12 },
  th: { padding: "8px 10px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 500 },
  td: { padding: "10px 10px", borderBottom: "1px solid var(--line)", verticalAlign: "top", color: "var(--ink-2)" },
  badge: { display: "inline-block", padding: "2px 7px", borderRadius: 4, fontSize: 11, fontWeight: 500 },
  progress: { marginTop: 12, padding: "14px 16px", borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)" },
  progressBar: { height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden", margin: "10px 0 8px" },
  progressFill: { height: "100%", background: "var(--pos)", borderRadius: 2, transition: "width 300ms ease" },
  pill: { display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 20, fontSize: 11, fontWeight: 500 },
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
    <div style={S.section}>
      <div style={S.sectionTitle}>Gmail Sync</div>
      <div style={S.sectionSub}>Trigger a full Gmail sync and watch live progress.</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
        <button style={{ ...S.btn, ...(running ? {} : S.btnPrimary) }} onClick={trigger} disabled={running}>
          {running ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Spinner /> Syncing…</span> : "▶ Trigger Sync"}
        </button>
        {status?.last_synced_at && (
          <span style={{ fontSize: 12, color: "var(--ink-3)" }}>
            Last synced: {new Date(status.last_synced_at).toLocaleString("en-IN")}
          </span>
        )}
        {!status?.last_synced_at && <span style={{ fontSize: 12, color: "var(--ink-4)" }}>Never synced</span>}
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
    </div>
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
    <div style={S.section}>
      <div style={S.sectionTitle}>Gmail Fetch Preview</div>
      <div style={S.sectionSub}>Pull N emails from Gmail without writing to DB. Confirms auth + fetch pipeline.</div>

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
        <button style={{ ...S.btn, ...S.btnPrimary }} onClick={run} disabled={loading}>
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
    </div>
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
    <div style={S.section}>
      <div style={S.sectionTitle}>Classifier Tester</div>
      <div style={S.sectionSub}>Test the LLM classification pipeline with any input. No DB writes.</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={S.label}>Sender</label>
          <input value={sender} onChange={e => setSender(e.target.value)} style={S.input} placeholder="noreply@bank.com" />
        </div>
        <div>
          <label style={S.label}>Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} style={S.input} placeholder="Rs.X debited from account" />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={S.label}>Body</label>
        <textarea value={body} onChange={e => setBody(e.target.value)} style={S.textarea} placeholder="Email body text…" rows={5} />
      </div>

      <button style={{ ...S.btn, ...S.btnPrimary }} onClick={run} disabled={loading}>
        {loading ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Spinner /> Classifying…</span> : "Run Classifier"}
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
    </div>
  );
};

// ── Section: LLM Provider Status ──────────────────────────────────────────────

const LLMStatusSection = () => {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    API.get("/api/llm/status").then(setData).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  return (
    <div style={S.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={S.sectionTitle}>LLM Providers</div>
        <button style={S.btn} onClick={load}>Refresh</button>
      </div>
      <div style={S.sectionSub}>Priority-ordered dispatch list. Rate-limit hits persistently demote providers.</div>

      {loading && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</div>}
      {data && (
        <>
          <table style={S.table}>
            <thead>
              <tr>
                {["#", "Provider", "Model", "Status", "Rate-limited", "Priority", "OK", "Fail", "Err%"].map(h => (
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.providers.map((p, i) => (
                <tr key={p.name}>
                  <td style={{ ...S.td, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{i + 1}</td>
                  <td style={{ ...S.td, fontWeight: 600 }}>{p.name}</td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 11, color: "var(--ink-3)" }}>{p.model || "—"}</td>
                  <td style={S.td}>
                    <span style={{ ...S.pill, background: p.available ? "var(--pos-soft)" : "var(--neg-soft)", color: p.available ? "var(--pos)" : "var(--neg)" }}>
                      {p.available ? "ready" : "limited"}
                    </span>
                  </td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", color: p.rate_limited_secs > 0 ? "var(--neg)" : "var(--ink-4)" }}>
                    {p.rate_limited_secs > 0 ? `${p.rate_limited_secs}s` : "—"}
                  </td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>{p.priority_score.toFixed(3)}</td>
                  <td style={{ ...S.td, color: "var(--pos)", fontFamily: "'Geist Mono', monospace" }}>{p.success}</td>
                  <td style={{ ...S.td, color: p.fail > 0 ? "var(--neg)" : "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{p.fail}</td>
                  <td style={{ ...S.td, fontFamily: "'Geist Mono', monospace", color: p.error_rate > 0.1 ? "var(--neg)" : "var(--ink-3)" }}>
                    {(p.error_rate * 100).toFixed(0)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.config && (
            <div style={{ marginTop: 14, display: "flex", gap: 20, fontSize: 12, color: "var(--ink-3)" }}>
              <span>Confidence threshold: <strong style={{ color: "var(--ink)" }}>{data.config.confidence_threshold}</strong></span>
              <span>Auto-confirm threshold: <strong style={{ color: "var(--ink)" }}>{data.config.auto_confirm_threshold}</strong></span>
            </div>
          )}
        </>
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
    <div style={S.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <div style={S.sectionTitle}>System Alerts</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button style={S.btn} onClick={load}>Refresh</button>
          {alerts.length > 0 && <button style={{ ...S.btn, ...S.btnDanger }} onClick={clear}>Clear All</button>}
        </div>
      </div>
      <div style={{ ...S.sectionSub, marginBottom: alerts.length ? 14 : 0 }}>
        LLM failures, rate-limit hits, and other system events.
      </div>

      {loading && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</div>}
      {!loading && alerts.length === 0 && (
        <div style={{ fontSize: 12, color: "var(--ink-4)", fontStyle: "italic" }}>No alerts. All clear.</div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 0", borderBottom: i < alerts.length - 1 ? "1px dashed var(--line)" : "none" }}>
          <span style={{ ...S.badge, ...levelColor(a.level), flexShrink: 0 }}>{a.level}</span>
          <div style={{ flex: 1, fontSize: 12, color: "var(--ink-2)" }}>{a.message}</div>
          {a.source && <span style={{ fontSize: 11, color: "var(--ink-4)", flexShrink: 0 }}>{a.source}</span>}
          {a.timestamp && (
            <span style={{ fontSize: 11, color: "var(--ink-4)", flexShrink: 0, fontFamily: "'Geist Mono', monospace" }}>
              {new Date(a.timestamp).toLocaleTimeString("en-IN")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ── AdminView (exported) ───────────────────────────────────────────────────────

const AdminView = () => (
  <div style={S.page}>
    <SyncSection />
    <FetchPreviewSection />
    <ClassifyTestSection />
    <LLMStatusSection />
    <AlertsSection />
  </div>
);

Object.assign(window, { AdminView });
