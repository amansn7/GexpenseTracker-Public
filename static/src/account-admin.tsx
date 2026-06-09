// @ts-nocheck
// Admin sections extracted from account.jsx
// ── Admin sections (inline, use accountStyles directly) ────────────────────────

const AdminBackfillBodiesSection = () => {
  const { progress, running, start, dismiss } = useBackgroundJob();
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (progress?.result) setResult(progress.result);
  }, [progress]);

  const run = () => start("/api/sync/trigger-backfill-bodies");

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Backfill Email Bodies</h3>
        <button onClick={run} disabled={running} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: running ? 0.65 : 1 }}>
          {running ? "Backfilling\u2026" : "Backfill bodies"}
        </button>
      </div>
      <div style={accountStyles.sectionSub}>— fetch body text for emails that are missing it. Processes in batches so you can watch live progress.</div>
      {result && !progress && <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--pos-soft)", borderRadius: 6, fontSize: "0.8125rem", color: "var(--pos)" }}>
        <Icon name="check" size={12} stroke="var(--pos)"/> Updated {result.updated} · Errors {result.errors} · Total {result.total}
      </div>}
      {progress && (window as any).SyncProgressOverlay && (() => { const O = (window as any).SyncProgressOverlay; return <O progress={progress} syncing={running} onClose={dismiss} position="bottom-right" />; })()}
    </div>
  );
};

const AdminFetchRangeSection = () => {
  const { progress, running, start, dismiss } = useBackgroundJob();
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [afterDate,  setAfterDate]  = React.useState(today);
  const [beforeDate, setBeforeDate]  = React.useState(tomorrow);
  const [sender, setSender] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [llmPriority, setLlmPriority] = React.useState(false);
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (progress?.result) setResult(progress.result);
  }, [progress]);

  const run = () => {
    if (!afterDate || !beforeDate) return;
    setResult(null);
    start("/api/sync/trigger-fetch-range", {
      after_date: afterDate,
      before_date: beforeDate,
      sender: sender.trim() || undefined,
      subject: subject.trim() || undefined,
      llm_priority: llmPriority,
    });
  };

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Fetch Email Range</h3>
      <div style={accountStyles.sectionSub}>— fetch emails from Gmail in a date range, then backfill missing bodies</div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Date range</div><div style={accountStyles.sub}>emails received between these dates</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input type="date" value={afterDate} onChange={e => setAfterDate(e.target.value)} style={accountStyles.input} />
          <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>→</span>
          <input type="date" value={beforeDate} onChange={e => setBeforeDate(e.target.value)} style={accountStyles.input} />
        </div>
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Sender</div><div style={accountStyles.sub}>email or domain to filter (Gmail from: operator)</div></div>
        <input type="text" value={sender} onChange={e => setSender(e.target.value)} placeholder="e.g. axisbank.com or alerts@hdfcbank.com" style={{ ...accountStyles.input, width: 240 }} />
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Subject</div><div style={accountStyles.sub}>keywords to filter (Gmail subject: operator)</div></div>
        <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="e.g. debit, credited, transaction" style={{ ...accountStyles.input, width: 240 }} />
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>LLM priority</div><div style={accountStyles.sub}>skip rule pre-filter, always classify with LLM first</div></div>
        <Toggle checked={llmPriority} onChange={setLlmPriority} />
      </div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
        <div/>
        <div/>
        <button onClick={run} disabled={running} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: running ? 0.65 : 1 }}>
          {running ? "In progress\u2026" : "Fetch + Backfill"}
        </button>
      </div>
      {result && !progress && <div style={{ marginTop: 14, padding: "12px 14px", background: "var(--pos-soft)", borderRadius: 6, fontSize: "0.8125rem", color: "var(--pos)" }}><Icon name="check" size={12} stroke="var(--pos)"/> fetched: {result.fetched} \u00b7 inserted: {result.inserted} \u00b7 backfilled: {result.backfilled} \u00b7 errors: {result.errors}</div>}
      {progress && (window as any).SyncProgressOverlay && (() => { const O = (window as any).SyncProgressOverlay; return <O progress={progress} syncing={running} onClose={dismiss} position="bottom-right" />; })()}
    </div>
  );
};

const AdminSyncSection = () => {
  const [status,   setStatus]   = React.useState(null);
  const [progress, setProgress] = React.useState(null);
  const [running,  setRunning]  = React.useState(false);
  const pollRef = React.useRef(null);

  const loadStatus = () => API.get("/api/sync/status").then(setStatus).catch(() => {});

  const startPoll = React.useCallback(() => {
    let started = false, attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const p = await API.get("/api/sync/progress");
        setProgress(p);
        if (p.running) started = true;
        if ((!p.running && (started || ["done","error"].includes(p.phase))) || attempts >= 200) {
          clearInterval(pollRef.current);
          setRunning(false);
          loadStatus();
        }
      } catch (_) { if (attempts >= 200) { clearInterval(pollRef.current); setRunning(false); } }
    }, 1500);
  }, []);

  React.useEffect(() => { loadStatus(); return () => clearInterval(pollRef.current); }, []);

  const trigger = async () => {
    if (running) return;
    setRunning(true); setProgress(null);
    try { await API.post("/api/sync/trigger"); startPoll(); }
    catch (e) { setRunning(false); alert("Sync trigger failed: " + e.message); }
  };

  const pct = progress && progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Gmail Sync</h3>
      <div style={accountStyles.sectionSub}>— trigger a full Gmail sync and watch live progress</div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
        <div>
          <div style={accountStyles.label}>Last synced</div>
          <div style={accountStyles.sub}>{status?.last_synced_at ? new Date(status.last_synced_at).toLocaleString("en-IN") : "Never synced"}</div>
        </div>
        <div/>
        <button onClick={trigger} disabled={running} style={{ ...accountStyles.btn, ...(!running ? accountStyles.btnPrimary : {}), opacity: running ? 0.65 : 1 }}>
          {running ? "Syncing\u2026" : "\u25b6 Trigger Sync"}
        </button>
      </div>
      {progress && (
        <div style={{ marginTop: 14, padding: "14px 16px", borderRadius: 8, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
            <span style={{ fontWeight: 500, textTransform: "capitalize" }}>{progress.phase}</span>
            <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)", fontSize: "0.75rem" }}>{progress.current}/{progress.total || "?"} emails</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden", margin: "10px 0 8px" }}>
            <div className="progress-fill" style={{ height: "100%", background: "var(--pos)", borderRadius: 2, transform: `scaleX(${pct / 100})` }} />
          </div>
          {progress.tally && (
            <div style={{ display: "flex", gap: 14, fontSize: "0.75rem" }}>
              {[["expense","var(--neg)","Exp"],["income","var(--pos)","Inc"],["ignore","var(--ink-4)","Ign"]].map(([k,c,lbl])=>(
                <span key={k} style={{ color: c }}>{lbl}: <strong>{progress.tally[k] || 0}</strong></span>
              ))}
            </div>
          )}
          {progress.phase === "done" && progress.result && (
            <div style={{ marginTop: 10, fontSize: "0.8125rem", color: "var(--pos)", fontWeight: 500 }}><Icon name="check" size={12} stroke="var(--pos)"/> Done — {progress.result.processed} classified, {progress.result.skipped} skipped, {progress.result.total_fetched} fetched</div>
          )}
          {progress.phase === "error" && <div style={{ marginTop: 10, fontSize: "0.8125rem", color: "var(--neg)" }}><Icon name="x" size={12} stroke="var(--neg)"/> {progress.error}</div>}
        </div>
      )}
    </div>
  );
};

const AdminFetchPreviewSection = () => {
  const [limit,   setLimit]   = React.useState(10);
  const [query,   setQuery]   = React.useState("newer_than:7d");
  const [loading, setLoading] = React.useState(false);
  const [result,  setResult]  = React.useState(null);
  const [error,   setError]   = React.useState(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try { const r = await API.post("/api/admin/fetch-preview", { limit, query }); setResult(r); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const TH = { padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "10px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.8125rem" };

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Gmail Fetch Preview</h3>
      <div style={accountStyles.sectionSub}>— pull N emails from Gmail without writing to DB, confirms auth + fetch pipeline</div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Limit</div><div style={accountStyles.sub}>max emails to fetch</div></div>
        <input type="number" min={1} max={100} value={limit} onChange={e => setLimit(+e.target.value)} style={{ ...accountStyles.input, maxWidth: 120 }} />
      </div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
        <div><div style={accountStyles.label}>Gmail query</div><div style={accountStyles.sub}>Gmail search syntax</div></div>
        <input value={query} onChange={e => setQuery(e.target.value)} style={accountStyles.input} placeholder="newer_than:7d" />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={run} disabled={loading} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: loading ? 0.65 : 1 }}>
          {loading ? "Fetching\u2026" : "Fetch"}
        </button>
      </div>
      {error && <div role="alert" style={{ marginTop: 14, padding: "10px 14px", background: "var(--neg-soft)", borderRadius: 6, fontSize: "0.8125rem", color: "var(--neg)" }}><Icon name="x" size={12} stroke="var(--neg)"/> {error}</div>}
      {result && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 10 }}>Fetched <strong style={{ color: "var(--ink)" }}>{result.count}</strong> emails</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Sender","Subject","Domain","Received","Body chars",""].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
              <tbody>
                {result.emails.map(e => (
                  <tr key={e.gmail_id}>
                    <td style={{ ...TD, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.sender}</td>
                    <td style={{ ...TD, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.subject || "(no subject)"}</td>
                    <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", color: "var(--ink-3)" }}>{e.sender_domain}</td>
                    <td style={{ ...TD, whiteSpace: "nowrap", fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", color: "var(--ink-3)" }}>{new Date(e.received_at).toLocaleDateString("en-IN")}</td>
                    <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", textAlign: "right" }}>{e.body_chars}</td>
                    <td style={TD}><a href={e.gmail_link} target="_blank" rel="noreferrer" style={{ color: "var(--accent)", fontSize: "0.6875rem", textDecoration: "none" }}>Open \u2197</a></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

const AdminClassifySection = () => {
  const [sender,  setSender]  = React.useState("alerts@hdfcbank.net");
  const [subject, setSubject] = React.useState("HDFC Bank: Rs.499.00 debited from your account");
  const [body,    setBody]    = React.useState("Dear Customer,\n\nRs.499.00 has been debited from your HDFC Bank account ending 1234 for payment to Swiggy on 18-Apr-2026.\n\nAvailable balance: Rs.12,340.00");
  const [loading, setLoading] = React.useState(false);
  const [result,  setResult]  = React.useState(null);
  const [error,   setError]   = React.useState(null);

  const run = async () => {
    setLoading(true); setError(null); setResult(null);
    try { const r = await API.post("/api/admin/classify-test", { sender, subject, body }); setResult(r); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const confColor  = (c) => c >= 0.85 ? "var(--pos)" : c >= 0.65 ? "var(--accent)" : "var(--neg)";

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Classifier Tester</h3>
      <div style={accountStyles.sectionSub}>— test the LLM classification pipeline with any input, no DB writes</div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Sender</div><div style={accountStyles.sub}>email address of sender</div></div>
        <input value={sender} onChange={e => setSender(e.target.value)} style={accountStyles.input} placeholder="noreply@bank.com" />
      </div>
      <div style={accountStyles.row}>
        <div><div style={accountStyles.label}>Subject</div><div style={accountStyles.sub}>email subject line</div></div>
        <input value={subject} onChange={e => setSubject(e.target.value)} style={accountStyles.input} placeholder="Rs.X debited from account" />
      </div>
      <div style={{ ...accountStyles.row, ...accountStyles.rowLast }}>
        <div><div style={accountStyles.label}>Body</div><div style={accountStyles.sub}>email body text</div></div>
        <textarea value={body} onChange={e => setBody(e.target.value)}
          style={{ ...accountStyles.input, height: 140, resize: "none", lineHeight: 1.6, WebkitAppearance: "none" }}
          placeholder="Email body text\u2026"
        />
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
        <button onClick={run} disabled={loading} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: loading ? 0.65 : 1 }}>
          {loading ? "Classifying\u2026" : "Run Classifier"}
        </button>
      </div>
      {error && <div role="alert" style={{ marginTop: 14, padding: "10px 14px", background: "var(--neg-soft)", borderRadius: 6, fontSize: "0.8125rem", color: "var(--neg)" }}><Icon name="x" size={12} stroke="var(--neg)"/> {error}</div>}
      {result && (
        <div style={{ marginTop: 16, padding: "16px 18px", background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
            <span style={{ display: "inline-flex", alignItems: "center", padding: "4px 12px", borderRadius: 5, fontSize: "0.8125rem", fontWeight: 600, ...{ expense: { background: "var(--neg-soft)", color: "var(--neg)" }, income: { background: "var(--pos-soft)", color: "var(--pos)" }, ignore: { background: "var(--paper-2)", color: "var(--ink-3)" } }[result.label] || {} }}>{result.label.toUpperCase()}</span>
            {result.amount != null && <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.375rem", fontWeight: 400 }}>\u20b9{result.amount.toLocaleString("en-IN")}</span>}
            <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>conf: <span style={{ fontWeight: 600, color: confColor(result.confidence) }}>{(result.confidence * 100).toFixed(0)}%</span></span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {[["Merchant", result.merchant || "\u2014"],["Category", result.category || "\u2014"],["Date", result.txn_date || "\u2014"],["Domain", result.sender_domain || "\u2014"],["Method", result.classifier_method]].map(([k, v]) => (
              <div key={k} style={{ padding: "10px 12px", background: "var(--card)", borderRadius: 6, border: "1px solid var(--line)" }}>
                <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginBottom: 3, fontWeight: 500 }}>{k}</div>
                <div style={{ fontSize: "0.8125rem", fontWeight: 500 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AdminLLMSection = ({ account, settings }) => {
  const [data,    setData]    = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const activeId   = data?.active_service_id || settings?.active_ai_service_id;

  const load = () => { setLoading(true); API.get("/api/llm/status").then(setData).catch(() => {}).finally(() => setLoading(false)); };
  React.useEffect(() => { load(); }, []);

  const TH = { padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "11px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: "0.8125rem" };
  const Pill = ({ on, text }) => <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 20, fontSize: "0.75rem", fontWeight: 500, background: on ? "var(--pos-soft)" : "var(--paper-2)", color: on ? "var(--pos)" : "var(--ink-4)" }}>{text}</span>;

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>LLM Providers</h3>
        <button onClick={load} style={accountStyles.btn}><Icon name="repeat" size={14}/> Refresh</button>
      </div>
      <div style={accountStyles.sectionSub}>— priority dispatch list, rate-limit hits persistently demote providers</div>

      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading\u2026</div>}
      {!loading && (
        <>
          {(!data?.providers || data.providers.length === 0) ? (
            <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", fontStyle: "italic", padding: "12px 0" }}>No AI services configured. Add your own API key below, or use the FreeLLMAPI trial.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>{["Source","Service","Model","Status","Rate-limited","Penalty","OK/Fail"].map(h => <th key={h} style={TH}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.providers.map((p, i) => (
                    p.source === "custom" ? (
                      <tr key={`cust-${p.service_id}`}>
                        <td style={TD}><span style={{ fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: "var(--accent-soft)", color: "var(--accent)", fontWeight: 600, textTransform: "uppercase" }}>Custom</span></td>
                        <td style={{ ...TD, fontWeight: 600 }}>
                          {p.display_name}
                          {p.service_id === activeId && <span style={{ marginLeft: 8, fontSize: "0.625rem", padding: "2px 5px", borderRadius: 3, background: "var(--ink)", color: "var(--paper)", fontWeight: 600, textTransform: "uppercase" }}>Active</span>}
                        </td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: "var(--ink-3)" }}>{p.model_id}</td>
                        <td style={TD}><Pill on={p.enabled} text={p.enabled ? "Enabled" : "Disabled"}/></td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: p.rate_limited_secs > 0 ? "var(--neg)" : "var(--ink-4)" }}>{p.rate_limited_secs > 0 ? `${p.rate_limited_secs}s` : "\u2014"}</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem" }}>{p.priority_score.toFixed(3)}</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem" }}>
                          <span style={{ color: "var(--pos)" }}>{p.success}</span>
                          <span style={{ color: "var(--ink-4)" }}> / </span>
                          <span style={{ color: p.fail > 0 ? "var(--neg)" : "var(--ink-4)" }}>{p.fail}</span>
                        </td>
                      </tr>
                    ) : p.source === "trial" ? (
                      <tr key="trial-freellmapi">
                        <td style={TD}><span style={{ fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: "var(--pos-soft)", color: "var(--pos)", fontWeight: 600, textTransform: "uppercase" }}>Trial</span></td>
                        <td style={{ ...TD, fontWeight: 600 }}>{p.display_name}</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: "var(--ink-3)" }}>{p.model}</td>
                        <td style={TD}><Pill on={true} text="Active"/></td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: "var(--ink-4)" }}>\u2014</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem" }}>0.000</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: "var(--ink-4)" }}>\u2014</td>
                      </tr>
                    ) : (
                      <tr key="freellmapi">
                        <td style={TD}><span style={{ fontSize: "0.625rem", padding: "2px 6px", borderRadius: 3, background: "var(--pos-soft)", color: "var(--pos)", fontWeight: 600, textTransform: "uppercase" }}>Free</span></td>
                        <td style={{ ...TD, fontWeight: 600 }}>{p.display_name || p.name}</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: "var(--ink-3)" }}>{p.model || "\u2014"}</td>
                        <td style={TD}><Pill on={p.available} text={p.available ? "Ready" : "Limited"}/></td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", color: p.rate_limited_secs > 0 ? "var(--neg)" : "var(--ink-4)" }}>{p.rate_limited_secs > 0 ? `${p.rate_limited_secs}s` : "\u2014"}</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem" }}>{p.priority_score.toFixed(3)}</td>
                        <td style={{ ...TD, fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem" }}>
                          <span style={{ color: "var(--pos)" }}>{p.success}</span>
                          <span style={{ color: "var(--ink-4)" }}> / </span>
                          <span style={{ color: p.fail > 0 ? "var(--neg)" : "var(--ink-4)" }}>{p.fail}</span>
                        </td>
                      </tr>
                    )
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data?.config && (
            <div style={{ marginTop: 14, display: "flex", gap: 24, fontSize: "0.8125rem", color: "var(--ink-3)", flexWrap: "wrap" }}>
              <span>Confidence threshold: <strong style={{ color: "var(--ink)" }}>{data.config.confidence_threshold}</strong></span>
              <span>Auto-confirm: <strong style={{ color: "var(--ink)" }}>{data.config.auto_confirm_threshold}</strong></span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const AdminLLMTestSection = ({ account }) => {
  const [target, setTarget] = React.useState("");
  const [testType, setTestType] = React.useState("classify");
  const [sender, setSender] = React.useState("alerts@hdfcbank.net");
  const [subject, setSubject] = React.useState("HDFC Bank: Rs.499.00 debited");
  const [body, setBody] = React.useState("Rs.499.00 has been debited from your HDFC Bank account ending 1234 for payment to Swiggy.");
  const [testing, setTesting] = React.useState(false);
  const [result, setResult] = React.useState(null);
  const aiServices = account?.ai_services || [];

  const test = async () => {
    setTesting(true);
    setResult(null);
    try {
      let prompt;
      if (testType === "classify") {
        prompt = `Classify as expense, income, or ignore. Email: From: ${sender}, Subject: ${subject}, Body: ${body}. Respond JSON: {"label":"expense","amount":499,"merchant":"Swiggy","category":"Food","confidence":0.95}`;
      } else {
        prompt = "Say 'OK' if you can read this.";
      }
      const isUser = target.startsWith("service:");
      const serviceId = isUser ? target.slice("service:".length) : null;
      const provider = isUser
        ? aiServices.find(s => s.id === serviceId)?.provider
        : target.slice("builtin:".length);
      const res = await fetch("/api/admin/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": (window as any)._csrfToken ? (window as any)._csrfToken() : "" },
        credentials: "include",
        body: JSON.stringify({ provider, is_user_service: isUser, service_id: serviceId, prompt })
      });
      const data = await res.json();
      setResult({ ok: res.ok, data });
    } catch(e) { setResult({ ok: false, data: { error: e.message } }); }
    setTesting(false);
  };

  return (
    <div style={accountStyles.section}>
      <h3 style={accountStyles.sectionTitle}>Test LLM Provider</h3>
      <div style={accountStyles.sectionSub}>— verify your LLM service works</div>
      <div role="radiogroup" aria-label="Test type" style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {["classify", "raw"].map(t => (
          <button key={t} role="radio" aria-checked={testType === t} onClick={() => setTestType(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer", fontSize: "0.75rem", background: testType === t ? "var(--ink)" : "transparent", color: testType === t ? "var(--paper)" : "var(--ink-3)", outline: "none", transition: "background 120ms ease, color 120ms ease" }}
            onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
            onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}>
            {t === "classify" ? "Transaction" : "Raw"}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, marginBottom: 12, alignItems: "flex-end" }}>
        <select value={target} onChange={e => setTarget(e.target.value)} style={{ padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          <option value="">\u2014 select a service \u2014</option>
          {aiServices.map(s => <option key={s.id} value={`service:${s.id}`}>{s.display_name}{s.enabled === false ? " (disabled)" : ""}</option>)}
        </select>
        <button onClick={test} disabled={testing} style={{ ...accountStyles.btn, opacity: testing ? 0.5 : 1 }}>{testing ? "Testing..." : "Test"}</button>
      </div>
      {testType === "classify" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
          <input value={sender} onChange={e => setSender(e.target.value)} placeholder="Sender" style={accountStyles.input} />
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" style={accountStyles.input} />
        </div>
      )}
      {result && <pre style={{ marginTop: 12, fontSize: "0.6875rem", fontFamily: "'Geist Mono', monospace", whiteSpace: "pre-wrap", color: result.ok ? "var(--pos)" : "var(--neg)", background: "var(--paper-2)", padding: 10, borderRadius: 6 }}>{JSON.stringify(result.data, null, 2)}</pre>}
    </div>
  );
};

const AdminAlertsSection = () => {
  const [alerts,  setAlerts]  = React.useState([]);
  const [loading, setLoading] = React.useState(true);

  const load = () => { setLoading(true); API.get("/api/alerts").then(setAlerts).catch(() => setAlerts([])).finally(() => setLoading(false)); };
  const clear = async () => { await API.post("/api/alerts/clear").catch(() => {}); setAlerts([]); };
  React.useEffect(() => { load(); }, []);

  const lvlStyle = (l) => ({ error: { background: "var(--neg-soft)", color: "var(--neg)" }, warning: { background: "var(--accent-soft)", color: "var(--accent)" }, info: { background: "var(--pos-soft)", color: "var(--pos)" } }[l] || { background: "var(--paper-2)", color: "var(--ink-3)" });

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>System Alerts</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={accountStyles.btn}><Icon name="repeat" size={14}/> Refresh</button>
          {alerts.length > 0 && <button onClick={clear} style={{ ...accountStyles.btn, ...accountStyles.btnDanger }}>Clear All ({alerts.length})</button>}
        </div>
      </div>
      <div style={accountStyles.sectionSub}>— LLM failures, rate-limit hits, and other system events</div>
      {loading && <div aria-live="polite" style={{ fontSize: "0.8125rem", color: "var(--ink-3)", padding: "12px 0" }}>Loading\u2026</div>}
      {!loading && alerts.length === 0 && (
        <div style={{ fontSize: "0.8125rem", color: "var(--pos)", fontWeight: 500, padding: "14px 16px", background: "var(--pos-soft)", borderRadius: 8, display: "flex", alignItems: "center", gap: 8 }}><Icon name="check" size={14} stroke="var(--pos)"/> No alerts — all clear</div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", padding: "14px 0", borderBottom: i < alerts.length - 1 ? "1px dashed var(--line)" : "none" }}>
          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", padding: "4px 10px", borderRadius: 5, fontSize: "0.75rem", fontWeight: 600, flexShrink: 0, minWidth: 64, ...lvlStyle(a.level) }}>{a.level}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "0.8125rem", color: "var(--ink)", lineHeight: 1.5, wordBreak: "break-word" }}>{a.message}</div>
            <div style={{ display: "flex", gap: 12, marginTop: 4, fontSize: "0.6875rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
              {a.source && <span>{a.source}</span>}
              {a.timestamp && <span>{new Date(a.timestamp).toLocaleTimeString("en-IN")}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const AdminDomainRulesSection = () => {
  const [builtinRules, setBuiltinRules] = React.useState([]);
  const [learnedRules, setLearnedRules] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [generating, setGenerating] = React.useState(false);
  const [generated, setGenerated] = React.useState(null);
  const [error, setError] = React.useState(null);

  const load = () => {
    setLoading(true); setError(null);
    API.get("/api/admin/domain-rules").then(d => { setBuiltinRules(d.builtin || []); setLearnedRules(d.learned || []); }).catch(e => setError(e.message));
    setLoading(false);
  };

  React.useEffect(() => { load(); }, []);

  const generate = async () => {
    setGenerating(true); setGenerated(null); setError(null);
    try { const r = await API.post("/api/admin/generate-domain-rules"); setGenerated(r); load(); }
    catch (e) { setError(e.message); }
    finally { setGenerating(false); }
  };

  const labelColor = (l) => ({ expense: { background: "var(--neg-soft)", color: "var(--neg)" }, income: { background: "var(--pos-soft)", color: "var(--pos)" }, ignore: { background: "var(--paper-2)", color: "var(--ink-3)" } }[l] || { background: "var(--paper-2)", color: "var(--ink-3)" });

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Domain Rules</h3>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={load} style={accountStyles.btn}><Icon name="repeat" size={14}/> Refresh</button>
          <button onClick={generate} disabled={generating} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary }}>{generating ? "Generating\u2026" : "\u2726 Generate from data"}</button>
        </div>
      </div>
      <div style={accountStyles.sectionSub}>— learned domain mappings used for rule-based classification</div>
      {error && <div role="alert" style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 12 }}>{error}</div>}
      {generated && <div style={{ padding: 10, background: "var(--pos-soft)", color: "var(--pos)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 12 }}>Generated {generated.count} domain rule{generated.count !== 1 ? "s" : ""}</div>}
      {learnedRules.length > 0 ? learnedRules.map((r, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--line)", fontSize: "0.8125rem" }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", flex: 1 }}>{r.domain}</span>
          <span style={{ fontSize: "0.625rem", padding: "1px 6px", borderRadius: 3, ...labelColor(r.label) }}>{r.label}</span>
          <span style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>{r.category || "\u2014"}</span>
        </div>
      )) : <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)", padding: "8px 0", fontStyle: "italic" }}>No learned rules yet. Run "Generate from data".</div>}
    </div>
  );
};

const AdminCleanBodiesSection = () => {
  const { progress, running, start, dismiss } = useBackgroundJob();
  const [result, setResult] = React.useState(null);

  React.useEffect(() => {
    if (progress?.result) setResult(progress.result);
  }, [progress]);

  const run = () => start("/api/sync/trigger-clean-bodies");

  return (
    <div style={accountStyles.section}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={accountStyles.sectionTitle}>Clean Email Bodies</h3>
        <button onClick={run} disabled={running} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: running ? 0.65 : 1 }}>
          {running ? "Running\u2026" : "Clean bodies"}
        </button>
      </div>
      <div style={accountStyles.sectionSub}>— re-fetch emails with undecoded HTML entities or invisible Unicode and re-extract clean text</div>
      {result && !progress && <div style={{ marginTop: 10, padding: "10px 14px", background: "var(--pos-soft)", borderRadius: 6, fontSize: "0.8125rem", color: "var(--pos)" }}><Icon name="check" size={12} stroke="var(--pos)"/> Cleaned {result.cleaned} of {result.total_candidates} candidate emails</div>}
      {progress && (window as any).SyncProgressOverlay && (() => { const O = (window as any).SyncProgressOverlay; return <O progress={progress} syncing={running} onClose={dismiss} position="bottom-right" />; })()}
    </div>
  );
};

(window as any).AdminBackfillBodiesSection = AdminBackfillBodiesSection;
(window as any).AdminFetchRangeSection = AdminFetchRangeSection;
(window as any).AdminSyncSection = AdminSyncSection;
(window as any).AdminFetchPreviewSection = AdminFetchPreviewSection;
(window as any).AdminClassifySection = AdminClassifySection;
(window as any).AdminLLMSection = AdminLLMSection;
(window as any).AdminLLMTestSection = AdminLLMTestSection;
(window as any).AdminAlertsSection = AdminAlertsSection;
(window as any).AdminDomainRulesSection = AdminDomainRulesSection;
(window as any).AdminCleanBodiesSection = AdminCleanBodiesSection;
