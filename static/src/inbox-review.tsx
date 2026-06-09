// @ts-nocheck
// inbox-review.tsx — Review tab for pending emails

const ReviewTab = React.memo(({ reviewEmails, setReviewEmails, needsReviewCount, setFilter, isMobile }) => {
  const [reviewFocusIdx, setReviewFocusIdx] = React.useState(-1);
  const [reviewSelected, setReviewSelected] = React.useState(new Set());
  const [reviewPreviewId, setReviewPreviewId] = React.useState(null);
  const [reviewUndo, setReviewUndo] = React.useState(null);
  const [reviewSort, setReviewSort] = React.useState("domain");
  const [reviewAutoRefresh, setReviewAutoRefresh] = React.useState(true);
  const [reviewShowShortcuts, setReviewShowShortcuts] = React.useState(true);
  const [reviewBulkBusy, setReviewBulkBusy] = React.useState(false);
  const [reviewBulkErrors, setReviewBulkErrors] = React.useState([]);
  const [showReviewComplete, setShowReviewComplete] = React.useState(false);
  const [reviewSessionStats, setReviewSessionStats] = React.useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("mf_review_session"));
      if (saved && saved.startedAt) {
        const savedDate = new Date(saved.startedAt);
        const today = new Date();
        if (savedDate.toDateString() === today.toDateString()) return saved;
      }
    } catch (_) {}
    return { kept: 0, discarded: 0, startedAt: Date.now() };
  });
  const [lastSessionStats, setLastSessionStats] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("mf_review_last_session")); } catch (_) { return null; }
  });
  const [collapsedAll, setCollapsedAll] = React.useState(null);

  const handleReviewAction = async (id, action) => {
    const email = reviewEmails.find(e => e.id === id);
    if (!email) return;
    try {
      await API.post(`/api/emails/${id}/review`, { action });
      setReviewUndo({ ids: [id], action, emails: [email] });
      setReviewEmails(es => es.filter(e => e.id !== id));
      setReviewSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
      setReviewSessionStats(prev => ({
        ...prev,
        kept: prev.kept + (action === "keep" ? 1 : 0),
        discarded: prev.discarded + (action === "discard" ? 1 : 0),
      }));
      showToast(action === "keep" ? "Kept" : "Discarded", { label: "Undo", onClick: handleReviewUndo });
      setReviewFocusIdx(prev => {
        const remaining = reviewEmails.length - 1;
        if (remaining === 0) return -1;
        return Math.min(prev, remaining - 1);
      });
      if (reviewPreviewId === id) {
        const currentIdx = reviewEmails.findIndex(e => e.id === id);
        const nextIdx = currentIdx < reviewEmails.length - 1 ? currentIdx + 1 : (currentIdx > 0 ? currentIdx - 1 : -1);
        if (nextIdx >= 0 && nextIdx < reviewEmails.length) {
          const nextEmail = reviewEmails[nextIdx];
          setTimeout(() => setReviewPreviewId(nextEmail.id), 50);
        } else {
          setReviewPreviewId(null);
        }
      }
    } catch (e) {
      console.error("Review action failed", e);
      showToast("Review action failed. Please try again.");
    }
  };

  const handleDetailPanelAdvance = (id) => {
    if (reviewPreviewId === id) {
      const currentIdx = reviewEmails.findIndex(e => e.id === id);
      const nextIdx = currentIdx < reviewEmails.length - 1 ? currentIdx + 1 : (currentIdx > 0 ? currentIdx - 1 : -1);
      if (nextIdx >= 0 && nextIdx < reviewEmails.length) {
        setTimeout(() => setReviewPreviewId(reviewEmails[nextIdx].id), 50);
      } else {
        setReviewPreviewId(null);
        if (reviewSessionStats.kept + reviewSessionStats.discarded > 0) {
          setShowReviewComplete(true);
        }
      }
    }
  };

  const handleReviewUndo = async () => {
    if (!reviewUndo) return;
    const { ids, action, emails } = reviewUndo;
    try {
      for (const id of ids) {
        await API.post(`/api/emails/${id}/undo-review`);
      }
      setReviewEmails(es => [...emails, ...es]);
      setReviewUndo(null);
      setReviewSessionStats(prev => ({
        ...prev,
        kept: prev.kept - (action === "keep" ? ids.length : 0),
        discarded: prev.discarded - (action === "discard" ? ids.length : 0),
      }));
      showToast("Undone");
    } catch (e) {
      console.error("Review undo failed", e);
      showToast("Review undo failed. Please try again.");
    }
  };

  const handleClearSessionStats = () => {
    const stats = { ...reviewSessionStats };
    setLastSessionStats(stats);
    localStorage.setItem("mf_review_last_session", JSON.stringify(stats));
    setReviewSessionStats({ kept: 0, discarded: 0, startedAt: Date.now() });
    showToast("Session complete: nice work!");
  };

  React.useEffect(() => {
    if (reviewEmails.length === 0) return;
    const onKey = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setReviewFocusIdx(prev => Math.min(prev + 1, reviewEmails.length - 1));
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setReviewFocusIdx(prev => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (reviewFocusIdx >= 0 && reviewFocusIdx < reviewEmails.length) {
          const email = reviewEmails[reviewFocusIdx];
          setReviewPreviewId(prev => prev === email.id ? null : email.id);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        if (reviewFocusIdx >= 0 && reviewFocusIdx < reviewEmails.length) {
          const id = reviewEmails[reviewFocusIdx].id;
          setReviewSelected(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
          });
        }
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        if (reviewFocusIdx >= 0 && reviewFocusIdx < reviewEmails.length) {
          const email = reviewEmails[reviewFocusIdx];
          handleReviewAction(email.id, "discard");
        }
      } else if (e.key === "e" || e.key === "E") {
        e.preventDefault();
        if (reviewFocusIdx >= 0 && reviewFocusIdx < reviewEmails.length) {
          const email = reviewEmails[reviewFocusIdx];
          handleReviewAction(email.id, "keep");
        }
      } else if (e.key === "z" || e.key === "Z") {
        e.preventDefault();
        handleReviewUndo();
      } else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        if (reviewSelected.size === reviewEmails.length) {
          setReviewSelected(new Set());
        } else {
          setReviewSelected(new Set(reviewEmails.map(e => e.id)));
        }
      } else if (e.key === "g" || e.key === "G") {
        e.preventDefault();
        setReviewPreviewId(null);
        setReviewFocusIdx(prev => prev === 0 ? reviewEmails.length - 1 : 0);
      } else if (e.key === "?" || e.key === "/") {
        e.preventDefault();
        setReviewShowShortcuts(prev => !prev);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setReviewPreviewId(null);
        setReviewSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reviewEmails, reviewFocusIdx, reviewShowShortcuts]);

  React.useEffect(() => {
    if (!reviewAutoRefresh) return;
    const interval = setInterval(async () => {
      try {
        const data = await API.get("/api/emails?status=review_pending");
        if (Array.isArray(data)) {
          const newCount = data.length;
          const oldCount = reviewEmails.length;
          setReviewEmails(data);
          if (newCount !== oldCount) {
            showToast(`Review list updated: ${newCount} pending`, { label: "Dismiss" });
          }
        }
      } catch (_) {}
    }, 30000);
    return () => clearInterval(interval);
  }, [reviewAutoRefresh, reviewEmails.length, setReviewEmails]);

  React.useEffect(() => {
    localStorage.setItem("mf_review_session", JSON.stringify(reviewSessionStats));
  }, [reviewSessionStats]);

  if (reviewEmails.length === 0) {
    return (
      <div>
        <div style={{ padding: isMobile ? "64px max(14px, env(safe-area-inset-right, 0px))" : "64px 32px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
            <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="inbox" size={28} stroke="var(--ink-3)"/>
            </div>
          </div>
          <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>All caught up</div>
          <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 8px", lineHeight: 1.6 }}>
            {reviewSessionStats.kept + reviewSessionStats.discarded > 0
              ? `You kept ${reviewSessionStats.kept} and discarded ${reviewSessionStats.discarded} in ${Math.round((Date.now() - reviewSessionStats.startedAt) / 60000)} min.`
              : "No emails to review yet. Run a sync to find and classify your expenses."}
          </div>
          {reviewSessionStats.kept + reviewSessionStats.discarded > 0 && (
            <div style={{ fontSize: "0.75rem", color: "var(--ink-4)", marginBottom: 16 }}>
              This session: <strong style={{ color: "var(--pos)" }}>{reviewSessionStats.kept} kept</strong> · <strong style={{ color: "var(--neg)" }}>{reviewSessionStats.discarded} discarded</strong>
              <span style={{ marginLeft: 8, opacity: 0.6 }}>· {Math.round((Date.now() - reviewSessionStats.startedAt) / 60000)} min</span>
            </div>
          )}
          {lastSessionStats && reviewSessionStats.kept + reviewSessionStats.discarded === 0 && (
            <div style={{ fontSize: "0.75rem", color: "var(--ink-4)", marginBottom: 16 }}>
              Last session: <strong style={{ color: "var(--pos)" }}>{lastSessionStats.kept} kept</strong> · <strong style={{ color: "var(--neg)" }}>{lastSessionStats.discarded} discarded</strong>
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => { if (window._goSync) window._goSync(); }} style={{ fontSize: "0.75rem", padding: "8px 18px", borderRadius: 6, background: "var(--accent)", color: "var(--paper)", cursor: "pointer", fontWeight: 600 }}>
              Run sync
            </button>
            <button onClick={() => setFilter("all")} style={{ fontSize: "0.8125rem", padding: "10px 20px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontWeight: 500 }}>
              View transactions
            </button>
            {needsReviewCount > 0 && (
              <button onClick={() => setFilter("needs_review")} style={{ fontSize: "0.8125rem", padding: "10px 20px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontWeight: 500 }}>
                Legacy review ({needsReviewCount})
              </button>
            )}
          </div>
          {reviewSessionStats.kept + reviewSessionStats.discarded > 0 && (
            <div style={{ marginTop: 20 }}>
              <button onClick={handleClearSessionStats} style={{ fontSize: "0.6875rem", color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Icon name="check" size={12} stroke="var(--ink-4)"/> Done reviewing
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={isMobile ? { display: "block" } : { display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(0, 420px)", height: "calc(100dvh - 164px)", overflow: "hidden" }}>
        <div style={isMobile ? {} : { overflowY: "auto", borderRight: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: isMobile ? 8 : 12, padding: isMobile ? "8px 10px" : "10px 14px", borderBottom: "1px solid var(--line)", alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap", background: "var(--paper-2)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--ink)", fontFamily: "'Geist Mono', monospace" }}>{reviewEmails.length}</span>
              <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)", fontWeight: 500 }}>pending</span>
            </div>
            {needsReviewCount !== null && needsReviewCount > 0 && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, padding: "2px 8px", borderRadius: 6, background: "var(--accent-soft)", border: "1px solid var(--accent-soft)" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)", fontFamily: "'Geist Mono', monospace" }}>{needsReviewCount}</span>
                <span style={{ fontSize: "0.625rem", color: "var(--accent)", fontWeight: 500 }}>needs review</span>
              </div>
            )}
            {reviewSessionStats.kept + reviewSessionStats.discarded > 0 && (
              <div style={{ display: "flex", gap: 8, fontSize: "0.6875rem", color: "var(--ink-4)" }}>
                <span>Session: <strong style={{ color: "var(--pos)" }}>{reviewSessionStats.kept}</strong> kept · <strong style={{ color: "var(--neg)" }}>{reviewSessionStats.discarded}</strong> discarded</span>
              </div>
            )}
            <div style={{ flex: 1 }}/>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
              <Icon name="alert-circle" size={11} stroke="var(--ink-3)"/>
              <span style={{ fontSize: "0.625rem", color: "var(--ink-3)", fontWeight: 500 }}>AI confidence below threshold</span>
            </div>
            <select value={reviewSort} onChange={e => setReviewSort(e.target.value)} style={{ fontSize: "0.6875rem", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", cursor: "pointer", minHeight: 44 }}>
              <option value="domain">Sort: Domain</option>
              <option value="date">Sort: Date</option>
              <option value="sender">Sort: Sender</option>
            </select>
            <button onClick={() => setReviewAutoRefresh(r => !r)} style={{ fontSize: "0.625rem", padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)", background: reviewAutoRefresh ? "var(--paper-2)" : "var(--card)", color: reviewAutoRefresh ? "var(--ink-2)" : "var(--ink-3)", cursor: "pointer", fontWeight: 500, minHeight: 44 }}>
              {reviewAutoRefresh ? "Auto ON" : "Auto OFF"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", alignItems: "center", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5 }}>
            {reviewSelected.size > 0 && (
              <span style={{ fontSize: "0.625rem", color: "var(--accent)", fontWeight: 600, background: "var(--accent-soft)", padding: "1px 6px", borderRadius: 6 }}>{reviewSelected.size} selected</span>
            )}
            {reviewSelected.size > 0 && (
              <>
                <button disabled={reviewBulkBusy} onClick={async () => {
                  setReviewBulkBusy(true);
                  setReviewBulkErrors([]);
                  const ids = [...reviewSelected];
                  const emails = ids.map(id => reviewEmails.find(e => e.id === id)).filter(Boolean);
                  setReviewUndo({ ids, action: "keep", emails });
                  const errors = [];
                  try {
                    await API.post("/api/emails/bulk-review", { email_ids: ids, action: "keep" });
                  } catch (_) {
                    for (const id of ids) {
                      try { await API.post(`/api/emails/${id}/review`, { action: "keep" }); } catch (e2) { const e2email = reviewEmails.find(e => e.id === id); if (e2email) errors.push(e2email.sender_domain || id); }
                    }
                  }
                  setReviewEmails(es => es.filter(e => !ids.includes(e.id)));
                  setReviewSelected(new Set());
                  setReviewSessionStats(prev => ({ ...prev, kept: prev.kept + (ids.length - errors.length) }));
                  setReviewBulkErrors(errors);
                  if (errors.length === 0) showToast(`Kept ${ids.length} email${ids.length > 1 ? "s" : ""}`, { label: "Undo", onClick: handleReviewUndo });
                  setReviewBulkBusy(false);
                }} style={{ fontSize: "0.625rem", padding: "3px 10px", borderRadius: 6, border: "none", background: reviewBulkBusy ? "var(--ink-4)" : "var(--accent)", color: "var(--paper)", cursor: reviewBulkBusy ? "wait" : "pointer", fontWeight: 600, opacity: reviewBulkBusy ? 0.6 : 1 }}>
                  {reviewBulkBusy ? "Processing…" : `Keep ${reviewSelected.size}`}
                </button>
                <button disabled={reviewBulkBusy} onClick={async () => {
                  setReviewBulkBusy(true);
                  setReviewBulkErrors([]);
                  const ids = [...reviewSelected];
                  const emails = ids.map(id => reviewEmails.find(e => e.id === id)).filter(Boolean);
                  setReviewUndo({ ids, action: "discard", emails });
                  const errors = [];
                  try {
                    await API.post("/api/emails/bulk-review", { email_ids: ids, action: "discard" });
                  } catch (_) {
                    for (const id of ids) {
                      try { await API.post(`/api/emails/${id}/review`, { action: "discard" }); } catch (e2) { const e2email = reviewEmails.find(e => e.id === id); if (e2email) errors.push(e2email.sender_domain || id); }
                    }
                  }
                  setReviewEmails(es => es.filter(e => !ids.includes(e.id)));
                  setReviewSelected(new Set());
                  setReviewSessionStats(prev => ({ ...prev, discarded: prev.discarded + (ids.length - errors.length) }));
                  setReviewBulkErrors(errors);
                  if (errors.length === 0) showToast(`Discarded ${ids.length} email${ids.length > 1 ? "s" : ""}`, { label: "Undo", onClick: handleReviewUndo });
                  setReviewBulkBusy(false);
                }} style={{ fontSize: "0.625rem", padding: "3px 10px", borderRadius: 6, border: "1px solid var(--line)", background: reviewBulkBusy ? "var(--ink-4)" : "var(--paper)", color: reviewBulkBusy ? "var(--paper)" : "var(--ink-2)", cursor: reviewBulkBusy ? "wait" : "pointer", fontWeight: 500, opacity: reviewBulkBusy ? 0.6 : 1 }}>
                  {reviewBulkBusy ? "Processing…" : `Discard ${reviewSelected.size}`}
                </button>
              </>
            )}
            <div style={{ flex: 1 }}/>
            <button onClick={() => setCollapsedAll(c => c === true ? null : true)} style={{ fontSize: "0.6875rem", padding: "4px 12px", borderRadius: 6, border: "1px solid var(--line)", background: collapsedAll === true ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>Collapse all</button>
            <button onClick={() => setCollapsedAll(c => c === false ? null : false)} style={{ fontSize: "0.6875rem", padding: "4px 12px", borderRadius: 6, border: "1px solid var(--line)", background: collapsedAll === false ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>Expand all</button>
          </div>
          {reviewBulkErrors.length > 0 && (
            <div style={{ padding: "6px 14px", fontSize: "0.625rem", color: "var(--neg)", background: "var(--neg-soft)", borderBottom: "1px solid var(--line)" }}>
              Failed: {reviewBulkErrors.join(", ")}
            </div>
          )}
          {(() => {
            const groups = {};
            reviewEmails.forEach(e => {
              const domain = e.sender_domain || e.sender || "unknown";
              if (!groups[domain]) groups[domain] = [];
              groups[domain].push(e);
            });
            let sorted = Object.entries(groups);
            if (reviewSort === "domain") {
              sorted.sort((a, b) => b[1].length - a[1].length);
            } else if (reviewSort === "date") {
              sorted.sort((a, b) => {
                const aDate = Math.max(...a[1].map(e => new Date(e.received_at || 0).getTime()));
                const bDate = Math.max(...b[1].map(e => new Date(e.received_at || 0).getTime()));
                return bDate - aDate;
              });
            } else if (reviewSort === "sender") {
              sorted.sort((a, b) => a[0].localeCompare(b[0]));
            }
            const flatEmails = sorted.flatMap(([, emails]) => emails);
            const idxMap = {}; flatEmails.forEach((e, i) => { idxMap[e.id] = i; });
            return sorted.map(([domain, emails]) => {
              const hasTxs = emails.some(_looksLikeTx);
              return (
                <GroupSection key={domain} domain={domain} emails={emails} hasTxs={hasTxs}
                  collapsed={collapsedAll}
                  selectedIds={reviewSelected}
                  onToggleSelect={id => setReviewSelected(prev => {
                    const next = new Set(prev);
                    next.has(id) ? next.delete(id) : next.add(id);
                    return next;
                  })}
                  onSelectAll={ids => setReviewSelected(prev => {
                    const next = new Set(prev);
                    ids.forEach(id => next.add(id));
                    return next;
                  })}
                  onClearSelect={ids => setReviewSelected(prev => {
                    const next = new Set(prev);
                    ids.forEach(id => next.delete(id));
                    return next;
                  })}
                  previewId={reviewPreviewId}
                  onTogglePreview={id => setReviewPreviewId(id)}
                  focusIdx={reviewFocusIdx}
                  idxMap={idxMap}
                  onKeep={id => {
                    setReviewUndo({ ids: [id], action: "keep", emails: [reviewEmails.find(e => e.id === id)] });
                    setReviewEmails(es => es.filter(e => e.id !== id));
                    setReviewSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
                    showToast("Kept", { label: "Undo", onClick: handleReviewUndo });
                  }}
                  onDiscard={id => {
                    setReviewUndo({ ids: [id], action: "discard", emails: [reviewEmails.find(e => e.id === id)] });
                    setReviewEmails(es => es.filter(e => e.id !== id));
                    setReviewSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
                    showToast("Discarded", { label: "Undo", onClick: handleReviewUndo });
                  }}
                />
              );
            });
          })()}
        </div>
        {(() => {
          const selectedReviewEmail = reviewPreviewId ? reviewEmails.find(e => e.id === reviewPreviewId) : null;
          if (!selectedReviewEmail) {
            if (isMobile) return null;
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", color: "var(--ink-4)", fontSize: "0.8125rem" }}>
                Select an email to review
              </div>
            );
          }
          return (
            <div style={isMobile ? { position: "fixed", inset: 0, zIndex: 65, background: "var(--paper)", padding: "18px max(18px, env(safe-area-inset-right, 0px)) max(0px, env(safe-area-inset-bottom, 0px)) max(18px, env(safe-area-inset-left, 0px))", height: "100dvh", overflowY: "auto", borderLeft: "none" } : { overflowY: "auto", background: "var(--card)", padding: "24px" }} className={isMobile ? "slide-in-right" : ""}>
              <ReviewDetailPanel
                email={selectedReviewEmail}
                onKeep={id => {
                  setReviewUndo({ ids: [id], action: "keep", emails: [reviewEmails.find(e => e.id === id)] });
                  setReviewEmails(es => es.filter(e => e.id !== id));
                  setReviewSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
                  showToast("Kept", { label: "Undo", onClick: handleReviewUndo });
                  handleDetailPanelAdvance(id);
                }}
                onDiscard={id => {
                  setReviewUndo({ ids: [id], action: "discard", emails: [reviewEmails.find(e => e.id === id)] });
                  setReviewEmails(es => es.filter(e => e.id !== id));
                  setReviewSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
                  showToast("Discarded", { label: "Undo", onClick: handleReviewUndo });
                  handleDetailPanelAdvance(id);
                }}
                onClose={() => setReviewPreviewId(null)}
              />
            </div>
          );
        })()}
      </div>

      {reviewEmails.length > 0 && reviewShowShortcuts && (
        <KeyboardHint
          shortcuts={[
            ["j / k", "Next / previous email"],
            ["Enter", "Preview email"],
            ["Space", "Select email"],
            ["e", "Keep as transaction"],
            ["d", "Discard as noise"],
            ["a", "Select all / none"],
            ["g", "Jump to first / last"],
            ["z", "Undo last action"],
            ["?", "Toggle this hint"],
            ["Esc", "Close / clear"],
          ]}
          storageKey="mf_review_shortcuts_dismissed"
          position="bottom-left"
        />
      )}

      {showReviewComplete && (
        <Modal open onClose={() => { setShowReviewComplete(false); handleClearSessionStats(); }} width={380}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--pos-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Icon name="check" size={22} stroke="var(--pos)"/>
            </div>
            <div style={{ fontSize: "1rem", fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Review complete</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--ink-3)", marginBottom: 20, lineHeight: 1.5 }}>
              All pending emails have been reviewed.
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--pos)", fontFamily: "'Geist Mono', monospace" }}>{reviewSessionStats.kept}</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 }}>kept</div>
              </div>
              <div style={{ width: 1, background: "var(--line)" }}/>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--neg)", fontFamily: "'Geist Mono', monospace" }}>{reviewSessionStats.discarded}</div>
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginTop: 2 }}>discarded</div>
              </div>
            </div>
            <div style={{ fontSize: "0.6875rem", color: "var(--ink-4)", marginBottom: 20 }}>
              Session: {Math.round((Date.now() - reviewSessionStats.startedAt) / 60000)} min
            </div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <button
                onClick={() => { setShowReviewComplete(false); handleClearSessionStats(); setFilter("all"); }}
                style={{ fontSize: "0.8125rem", padding: "10px 20px", borderRadius: 8, background: "var(--accent)", color: "var(--paper)", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                View transactions
              </button>
              <button
                onClick={() => { setShowReviewComplete(false); handleClearSessionStats(); }}
                style={{ fontSize: "0.75rem", padding: "8px 16px", borderRadius: 6, background: "none", border: "1px solid var(--line)", color: "var(--ink-3)", cursor: "pointer", fontWeight: 500 }}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
});

(window as any).ReviewTab = ReviewTab;
