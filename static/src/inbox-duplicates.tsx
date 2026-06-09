// @ts-nocheck
// inbox-duplicates.tsx — Duplicate detection and management tab

const DuplicatesTab = React.memo(({ isMobile, dupBulkResult, setDupBulkResult }) => {
  const [dupPairs, setDupPairs] = React.useState([]);
  const [dupLoading, setDupLoading] = React.useState(false);
  const [dupScanning, setDupScanning] = React.useState(false);
  const [dupResolved, setDupResolved] = React.useState([]);
  const [dupResolvedLoading, setDupResolvedLoading] = React.useState(false);
  const [dupTab, setDupTab] = React.useState("pending");
  const [dupSelected, setDupSelected] = React.useState(new Set());
  const [dupBulkResolving, setDupBulkResolving] = React.useState(false);

  React.useEffect(() => {
    if (dupTab === "pending") {
      setDupLoading(true);
      API.get("/api/duplicates?status=pending")
        .then(data => { setDupPairs(data || []); setDupLoading(false); })
        .catch(() => setDupLoading(false));
    } else {
      setDupResolvedLoading(true);
      Promise.all([
        API.get("/api/duplicates?status=confirmed"),
        API.get("/api/duplicates?status=dismissed"),
        API.get("/api/duplicates?status=auto_resolved"),
      ]).then(([confirmed, dismissed, autoResolved]) => {
        const all = [...(confirmed || []), ...(dismissed || []), ...(autoResolved || [])]
          .sort((a, b) => new Date(b.resolved_at || 0) - new Date(a.resolved_at || 0));
        setDupResolved(all);
        setDupResolvedLoading(false);
      }).catch(() => setDupResolvedLoading(false));
    }
    setDupSelected(new Set());
  }, [dupTab]);

  React.useEffect(() => {
    if (dupTab !== "pending") return;
    const onKey = (e) => {
      if (e.key === "Escape" && dupSelected.size > 0) { e.preventDefault(); setDupSelected(new Set()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dupTab, dupSelected]);

  const resolveDup = async (pairId, action, primaryTxId) => {
    try {
      await API.patch(`/api/duplicates/${pairId}`, { action, primary_tx_id: primaryTxId });
      window.playConfirmSound();
      setDupPairs(prev => prev.filter(p => p.id !== pairId));
      setDupSelected(prev => { const n = new Set(prev); n.delete(pairId); return n; });
    } catch (e) {
      console.error("resolve dup failed", e);
      showToast("Failed to resolve duplicate pair.");
    }
  };

  const bulkResolveDups = async (action) => {
    if (dupSelected.size === 0) return;
    setDupBulkResolving(true);
    const ids = [...dupSelected];
    const promises = ids.map(async (pairId) => {
      const pair = dupPairs.find(p => p.id === pairId);
      if (!pair) return;
      const primaryTxId = action === "confirmed" ? pair.primary.id : pair.duplicate.id;
      try {
        await API.patch(`/api/duplicates/${pairId}`, { action, primary_tx_id: primaryTxId });
        setDupPairs(prev => prev.filter(p => p.id !== pairId));
      } catch (_) {}
    });
    await Promise.allSettled(promises);
    window.playConfirmSound();
    setDupSelected(new Set());
    setDupBulkResolving(false);
  };

  return (
    <>
      <div style={{ padding: isMobile ? "10px max(14px, env(safe-area-inset-right, 0px)) 10px max(14px, env(safe-area-inset-left, 0px))" : "10px 16px 10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", flexWrap: isMobile ? "wrap" : "nowrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink-2)" }}>Duplicate detection</span>
          <div style={{ display: "flex", gap: 2 }}>
            {["pending", "resolved"].map(tab => {
              const count = tab === "pending" ? dupPairs.length : dupResolved.length;
              const isActive = dupTab === tab;
              return (
                <button key={tab} onClick={() => setDupTab(tab)}
                  style={{
                    padding: "5px 12px", borderRadius: 20, border: isActive ? "1px solid var(--ink)" : "1px solid transparent",
                    background: isActive ? "var(--ink)" : "transparent",
                    color: isActive ? "var(--paper)" : "var(--ink-3)",
                    fontSize: "0.75rem", fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
                    display: "inline-flex", alignItems: "center", gap: 5, lineHeight: 1.2,
                    transition: "all 120ms var(--ease-out-quart)",
                    minHeight: isMobile ? 44 : "auto",
                  }}>
                  {tab}{count > 0 ? ` (${count})` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap" }}>
          {dupTab === "pending" && dupSelected.size > 0 && (
            <>
              <button onClick={() => bulkResolveDups("confirmed")} disabled={dupBulkResolving}
                style={{ padding: "4px 10px", border: "none", borderRadius: 4, background: "var(--pos)", color: "white", fontSize: "0.6875rem", fontWeight: 600, cursor: dupBulkResolving ? "default" : "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>
                Confirm {dupSelected.size}
              </button>
              <button onClick={() => bulkResolveDups("dismissed")} disabled={dupBulkResolving}
                style={{ padding: "4px 10px", border: "none", borderRadius: 4, background: "var(--neg)", color: "white", fontSize: "0.6875rem", fontWeight: 600, cursor: dupBulkResolving ? "default" : "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>
                Dismiss {dupSelected.size}
              </button>
            </>
          )}
          <button onClick={async () => {
            setDupScanning(true);
            if (setDupBulkResult) setDupBulkResult(null);
            try {
              const result = await API.post("/api/duplicates/scan");
              const d = await API.get("/api/duplicates?status=pending");
              setDupPairs(d || []);
              const newPairs = result?.new_pairs ?? 0;
              showToast(newPairs > 0
                ? `Scan complete: ${newPairs} duplicate${newPairs > 1 ? "s" : ""} found`
                : "Scan complete: no new duplicates"
              );
            } catch (_) {
              showToast("Scan failed: check server logs");
            }
            setDupScanning(false);
          }} disabled={dupScanning}
            className="focus-ring"
            style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: "0.75rem", fontWeight: 500, cursor: dupScanning ? "default" : "pointer", opacity: dupScanning ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6, ...(isMobile ? { minHeight: 44 } : {}) }}>
            {dupScanning ? <><div style={{ width: 11, height: 11, border: "2px solid var(--ink-3)", borderTopColor: "var(--paper)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/> Scanning…</> : "Run scan"}
          </button>
        </div>
      </div>
      {dupTab === "pending" ? (<>
        {dupBulkResult && (
          <div style={{ margin: isMobile ? "8px max(14px, env(safe-area-inset-right, 0px))" : "8px 12px", padding: "12px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Scan results: {dupBulkResult.checked} transactions checked</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                {dupBulkResult.same_domain_exact > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain_exact}</strong></span>}
                {dupBulkResult.same_domain > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain}</strong></span>}
                {dupBulkResult.merchant_alias > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>Merchant alias: <strong>{dupBulkResult.merchant_alias}</strong></span>}
                {dupBulkResult.investment_flow > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>Investment flow: <strong>{dupBulkResult.investment_flow}</strong></span>}
                {dupBulkResult.cross_domain > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)" }}>Cross-domain: <strong>{dupBulkResult.cross_domain}</strong></span>}
                {dupBulkResult.existing_pairs > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>{dupBulkResult.existing_pairs} pair{dupBulkResult.existing_pairs > 1 ? "s" : ""} already in DB</span>}
                {dupBulkResult.already_paired > 0 && <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>{dupBulkResult.already_paired} potential match{dupBulkResult.already_paired > 1 ? "es" : ""} already paired</span>}
                {(!dupBulkResult.same_domain_exact && !dupBulkResult.same_domain && !dupBulkResult.merchant_alias && !dupBulkResult.investment_flow && !dupBulkResult.cross_domain && !dupBulkResult.existing_pairs && !dupBulkResult.already_paired) && <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>No matches found</span>}
              </div>
            </div>
            <button onClick={() => { if (setDupBulkResult) setDupBulkResult(null); }}
              style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 2, fontSize: "0.875rem", lineHeight: 1, flexShrink: 0 }}>×</button>
          </div>
        )}
        {dupLoading && !dupScanning ? (
          <div style={{ padding: isMobile ? "56px max(14px, env(safe-area-inset-right, 0px))" : "56px 32px", display: "flex", justifyContent: "center" }}>
            <SkeletonRow />
          </div>
        ) : dupScanning ? (
          <div style={{ padding: isMobile ? "56px max(14px, env(safe-area-inset-right, 0px))" : "56px 32px", textAlign: "center" }}>
            <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 999, margin: "0 auto 12px" }} />
            <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)" }}>Scanning expenses for duplicates…</div>
          </div>
        ) : dupPairs.length === 0 ? (
          <div style={{ padding: isMobile ? "64px max(14px, env(safe-area-inset-right, 0px))" : "64px 32px", textAlign: "center" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <Icon name="check" size={20} stroke="var(--pos)"/>
            </div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>No duplicates found</div>
            <div style={{ fontSize: "0.75rem", color: "var(--ink-4)" }}>Run a scan to check your expense history.</div>
          </div>
        ) : (
          dupPairs.map(pair => {
            const isNew = dupBulkResult?.newPairIds?.includes(pair.id);
            return (
              <div key={pair.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: isMobile ? "4px max(14px, env(safe-area-inset-right, 0px)) 4px max(14px, env(safe-area-inset-left, 0px))" : "4px 16px 4px 12px", borderBottom: "1px solid var(--line)" }}>
                <input type="checkbox" checked={dupSelected.has(pair.id)} onChange={e => {
                  setDupSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(pair.id) : n.delete(pair.id); return n; });
                }} style={{ marginTop: 22, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                <div style={{ flex: 1 }}><DuplicatePairCard pair={pair} onResolve={resolveDup} isNew={isNew} /></div>
              </div>
            );
          })
        )}
      </>) : dupResolvedLoading ? (
        <div style={{ padding: "56px 32px", display: "flex", justifyContent: "center" }}>
          <SkeletonRow />
        </div>
      ) : dupResolved.length === 0 ? (
        <div style={{ padding: isMobile ? "64px max(14px, env(safe-area-inset-right, 0px))" : "64px 32px", textAlign: "center" }}>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)" }}>No resolved duplicates yet.</div>
        </div>
      ) : (
        dupResolved.map(pair => {
          const fmtAmt = (amt) => amt != null ? `\u20B9${Math.abs(amt).toLocaleString("en-IN")}` : "\u2014";
          const statusColor = pair.status === "confirmed" ? "var(--pos)" : pair.status === "dismissed" ? "var(--neg)" : "var(--ink-3)";
          return (
            <div key={pair.id} style={{ padding: isMobile ? "14px max(14px, env(safe-area-inset-right, 0px)) 14px max(14px, env(safe-area-inset-left, 0px))" : "14px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink)" }}>
                    {fmtAmt(pair.primary?.amount)} · {pair.primary?.merchant || "Unknown"}
                  </span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)" }}>→</span>
                  <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>
                    discarded {fmtAmt(pair.duplicate?.amount)} {pair.duplicate?.merchant || ""}
                  </span>
                </div>
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 }}>
                  {pair.rule_source} · confidence {Math.round((pair.confidence || 0) * 100)}%
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "0.625rem", fontWeight: 600, textTransform: "uppercase", color: statusColor }}>{pair.status}</div>
                  <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
                    {pair.resolved_at ? new Date(pair.resolved_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await API.post(`/api/duplicates/${pair.id}/reopen`);
                      setDupResolved(prev => prev.filter(p => p.id !== pair.id));
                      setDupPairs(prev => [...prev, pair]);
                      showToast("Duplicate pair reopened");
                    } catch (_) {
                      showToast("Failed to reopen pair");
                    }
                  }}
                  className="focus-ring"
                  style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", fontSize: "0.6875rem", cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap", ...(isMobile ? { minHeight: 44 } : {}) }}>
                  Undo
                </button>
              </div>
            </div>
          );
        })
      )}
    </>
  );
});

(window as any).DuplicatesTab = DuplicatesTab;
