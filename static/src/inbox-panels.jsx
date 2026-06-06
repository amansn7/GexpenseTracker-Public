const _looksLikeTx = (email) => {
  const text = `${email.subject || ""} ${email.body_snippet || ""}`;
  return /Rs\.?\s*[\d,]+|INR\s*[\d,]+|\u20B9\s*[\d,]+|debited|credited|spent|purchased?|paid|refund|cashback|received.*(?:payment|amount|rupees)/i.test(text);
};

const TxCard = ({ tx, isPrimary, resolving, onResolve, pairId }) => {
  const { isMobile } = useViewport();
  const fmtAmt = (amt) => amt != null ? `\u20B9${Math.abs(amt).toLocaleString("en-IN")}` : "\u2014";
  const [fetchedBody, setFetchedBody] = React.useState(null);
  const [fetching, setFetching] = React.useState(false);

  const handleFetchBody = async () => {
    if (fetching) return;
    setFetching(true);
    try {
      const r = await API.post(`/api/transactions/${tx.id}/fetch-body`);
      if (r?.body_text) setFetchedBody(r.body_text);
    } catch (_) {}
    setFetching(false);
  };

  return (
    <div style={{ flex: 1, borderRadius: 8, border: `${isPrimary ? "2px" : "1px"} solid ${isPrimary ? "var(--accent)" : "var(--line)"}`, background: isPrimary ? "var(--card)" : "var(--paper-2)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "12px 14px 10px", borderBottom: "1px solid var(--line)" }}>
        {isPrimary && (
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--accent)", flexShrink: 0 }}/>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Suggested primary</span>
          </div>
        )}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <MerchantLogo merchant={tx.merchant || "?"} size={30}/>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.merchant || "Unknown"}</div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>{tx.email?.sender_domain || ""}</div>
          </div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontWeight: 700, fontSize: 16, color: "var(--neg)", flexShrink: 0 }}>{fmtAmt(tx.amount)}</div>
        </div>
      </div>

      <div style={{ padding: "10px 14px", flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        {tx.txn_date && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Date</span>
            <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace" }}>{tx.txn_date}</span>
          </div>
        )}
        {tx.email?.subject && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.email.subject}</div>
        )}
        {(tx.email?.body_snippet || fetchedBody) && (
          <div style={{ marginTop: 2, padding: "8px 10px", background: "var(--paper)", borderRadius: 6, border: "1px solid var(--line)" }}>
            {fetchedBody ? (
              <>
                <div style={{ fontSize: 10, color: "var(--pos)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                  <Icon name="check" size={10} stroke="var(--pos)"/> Body loaded
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflowY: "auto" }}>{fetchedBody.slice(0, 2000)}{fetchedBody.length > 2000 ? "\u2026" : ""}</div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{tx.email?.body_snippet}</div>
                <button onClick={handleFetchBody} disabled={fetching} className="focus-ring" style={{ flexShrink: 0, fontSize: 10, padding: "2px 7px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", cursor: fetching ? "default" : "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>
                  {fetching ? "\u2026" : "Full"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: "0 14px 12px" }}>
        <button
          onClick={async () => { if (resolving) return; await onResolve(pairId, "confirmed", tx.id); }}
          disabled={resolving}
          className="focus-ring"
          style={{ width: "100%", padding: "7px 0", borderRadius: 6, border: isPrimary ? "none" : "1px solid var(--line)", background: isPrimary ? "var(--ink)" : "transparent", color: isPrimary ? "var(--paper)" : "var(--ink-2)", fontSize: 12, fontWeight: 600, cursor: resolving ? "default" : "pointer", opacity: resolving ? 0.5 : 1 }}>
          Keep this
        </button>
      </div>
    </div>
  );
};

const DuplicatePairCard = ({ pair, onResolve, isNew }) => {
  const [resolving, setResolving] = React.useState(false);
  const { isMobile } = useViewport();
  const confidence = pair.confidence || 0;
  const reasonLabel = pair.rule_source === "domain_pair"
    ? "Known sender pair"
    : pair.rule_source === "investment_flow"
    ? "Investment flow: order + confirmation"
    : pair.rule_source === "merchant_alias"
    ? "Same merchant, different domain"
    : pair.rule_source === "same_domain_exact"
    ? "Same sender, same amount"
    : "Same amount, same date window";
  const wrap = async (...args) => { setResolving(true); await onResolve(...args); setResolving(false); };
  return (
    <div className="fade-in" style={{ padding: isMobile ? "16px 14px" : "18px 24px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 6 }}>{reasonLabel}{isNew && <span style={{ fontSize: 9, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", background: "var(--accent)", color: "white", borderRadius: 3, padding: "1px 5px 1px 5px", lineHeight: "14px" }}>New</span>}</span>
        {confidence > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <div style={{ width: 44, height: 3, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.round(confidence * 100)}%`, background: confidence >= 0.7 ? "var(--pos)" : "var(--accent)", borderRadius: 2 }}/>
            </div>
            <span style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace", color: "var(--ink-4)" }}>{Math.round(confidence * 100)}%</span>
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, flexDirection: isMobile ? "column" : "row" }}>
        <TxCard tx={pair.primary} isPrimary resolving={resolving} onResolve={wrap} pairId={pair.id} />
        <TxCard tx={pair.duplicate} isPrimary={false} resolving={resolving} onResolve={wrap} pairId={pair.id} />
      </div>
      <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={async () => { if (resolving) return; setResolving(true); await onResolve(pair.id, "dismissed", pair.primary.id); setResolving(false); }}
          disabled={resolving}
          className="focus-ring"
          style={{ padding: "6px 14px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-3)", fontSize: 12, cursor: resolving ? "default" : "pointer" }}>
          Not a duplicate
        </button>
      </div>
    </div>
  );
};

const IncomeRow = ({ tx, onUpdate }) => {
  const [toggling, setToggling] = React.useState(false);
  const { isMobile } = useViewport();
  const isPaid = tx.status === "confirmed";
  const monthLabel = tx.date ? new Date(tx.date + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" }) : "\u2014";
  const dateLabel = tx.date ? new Date(tx.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "\u2014";

  const togglePaid = async () => {
    if (toggling) return;
    setToggling(true);
    const newStatus = isPaid ? "needs_review" : "confirmed";
    onUpdate(tx.id, { status: newStatus, _skipApi: true });
    try {
      await API.patch(`/api/transactions/${tx.id}`, { status: newStatus });
      window.playConfirmSound();
    } catch (_) {
      onUpdate(tx.id, { status: tx.status, _skipApi: true });
    }
    setToggling(false);
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "28px minmax(0,1fr) auto" : "32px minmax(0,1fr) 130px 90px 150px 110px", gap: 12, alignItems: "center", padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <input type="checkbox" checked={isPaid} onChange={togglePaid} disabled={toggling}
          style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--pos)" }}/>
      </div>
      <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <MerchantLogo merchant={tx.merchant} size={22}/>
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.merchant}</span>
      </div>
      <div style={{ fontFamily: "'Geist Mono', monospace", fontWeight: 600, fontSize: 14, color: "var(--pos)", textAlign: "right" }}>
        +₹{tx.amount.toLocaleString("en-IN")}
      </div>
      {!isMobile && <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{dateLabel}</div>}
      {!isMobile && <div><CategoryChip cat={tx.cat}/></div>}
      {!isMobile && <div style={{ fontSize: 12, color: "var(--ink-4)" }}>{monthLabel}</div>}
    </div>
  );
};

const IncomeTableView = ({ transactions, onUpdate }) => {
  const { isMobile } = useViewport();
  if (transactions.length === 0) return (
    <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>No income transactions found for this range.</div>
  );

  const grouped = {};
  for (const t of transactions) {
    const key = t.date ? t.date.slice(0, 7) : "unknown";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(t);
  }
  const monthEntries = Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div style={{ padding: isMobile ? "0 14px 24px" : "0 32px 32px" }}>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "28px minmax(0,1fr) auto" : "32px minmax(0,1fr) 130px 90px 150px 110px", gap: 12, padding: "12px 0 8px", borderBottom: "2px solid var(--line)", fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, position: "sticky", top: 41, background: "var(--paper)", zIndex: 4 }}>
        <span title="Received"><Icon name="check" size={10} stroke="var(--ink-4)"/></span>
        <span>Source</span>
        <span style={{ textAlign: "right" }}>Amount</span>
        {!isMobile && <span>Date</span>}
        {!isMobile && <span>Category</span>}
        {!isMobile && <span>Month</span>}
      </div>
      {monthEntries.map(([monthKey, txs]) => {
        const monthTotal = txs.reduce((a, t) => a + t.amount, 0);
        const monthLabel = new Date(monthKey + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });
        return (
          <div key={monthKey}>
            <div style={{ padding: "14px 0 6px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-3)", fontWeight: 600 }}>{monthLabel}</span>
              <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--pos)", fontWeight: 600 }}>+₹{monthTotal.toLocaleString("en-IN")}</span>
            </div>
            {txs.map(tx => <IncomeRow key={tx.id} tx={tx} onUpdate={onUpdate}/>)}
          </div>
        );
      })}
    </div>
  );
};

const ReviewEmailRow = ({ email, onKeep, onDiscard, isFocused, isSelected, onFocus, onToggleSelect, previewId, onTogglePreview }) => {
  const { isMobile } = useViewport();
  const looksLikeTx = React.useMemo(() => _looksLikeTx(email), [email]);
  const rowRef = React.useRef(null);

  React.useEffect(() => {
    if (isFocused && rowRef.current) rowRef.current.focus();
  }, [isFocused]);

  const confidenceDots = React.useMemo(() => {
    if (email.confidence == null) return null;
    const dots = email.confidence >= 0.8 ? 3 : email.confidence >= 0.5 ? 2 : 1;
    return (
      <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }} title={`${Math.round(email.confidence * 100)}% confidence`}>
        {[1, 2, 3].map(i => (
          <span key={i} style={{
            width: 5, height: 5, borderRadius: "50%",
            background: i <= dots ? "var(--accent)" : "var(--line)",
            display: "inline-block",
          }}/>
        ))}
      </span>
    );
  }, [email.confidence]);

  return (
    <div ref={rowRef} tabIndex={0} className="hover-bg"
      onClick={() => { onFocus(); onTogglePreview(); }}
      onKeyDown={e => { if (e.key === "Enter") { onFocus(); onTogglePreview(); } }}
      style={{
        display: "flex", alignItems: "center", gap: 6, height: isMobile ? 44 : 36, padding: "0 max(14px, env(safe-area-inset-right, 0px)) 0 max(14px, env(safe-area-inset-left, 0px))",
        borderBottom: "1px solid var(--line)", cursor: "pointer",
        ...(isSelected ? { background: "var(--paper-2)" } : {}),
        borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
        transition: "background 80ms ease, border-left-color 120ms ease",
      }}>
      <input type="checkbox" checked={isSelected} onChange={e => { e.stopPropagation(); onToggleSelect(); }} onClick={e => e.stopPropagation()}
        style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }} />
      <span style={{ fontSize: 10, fontWeight: 600, color: looksLikeTx ? "var(--amber)" : "var(--ink-4)", background: looksLikeTx ? "color-mix(in srgb, var(--amber) 20%, transparent)" : "var(--paper-2)", border: `1px solid ${looksLikeTx ? "color-mix(in srgb, var(--amber) 40%, transparent)" : "var(--line)"}`, borderRadius: 4, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.03em", flexShrink: 0 }}>
        {looksLikeTx ? "Tx" : "Noise"}
      </span>
      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.subject || "(no subject)"}</span>
      <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", flexShrink: 0, marginRight: 4 }}>{email.sender_domain || ""}</span>
      {confidenceDots}
      <span style={{ color: "var(--ink-4)", display: "flex", marginLeft: 2 }}>
        <Icon name="arrow-r" size={12} stroke="currentColor" />
      </span>
    </div>
  );
};

const GroupSection = ({ domain, emails, hasTxs, onKeep, onDiscard, collapsed: forceCollapsed, selectedIds, onToggleSelect, onSelectAll, onClearSelect, previewId, onTogglePreview, focusIdx, idxMap }) => {
  const [collapsed, setCollapsed] = React.useState(!!forceCollapsed);
  const [busy, setBusy] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  React.useEffect(() => { setCollapsed(!!forceCollapsed); }, [forceCollapsed]);

  const handleDiscardAll = async () => {
    setBusy(true);
    const ids = emails.map(e => e.id);
    try {
      await API.post("/api/emails/bulk-review", { email_ids: ids, action: "discard" });
      ids.forEach(id => onDiscard(id));
    } catch (_) {}
    setBusy(false);
    setConfirmDiscard(false);
  };

  const handleKeepAll = async () => {
    setBusy(true);
    const ids = emails.map(e => e.id);
    try {
      await API.post("/api/emails/bulk-review", { email_ids: ids, action: "keep" });
      ids.forEach(id => onKeep(id));
    } catch (_) {}
    setBusy(false);
  };

  const allSelected = emails.every(e => selectedIds?.has(e.id));
  const emailIds = emails.map(e => e.id);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--paper-2)", borderBottom: collapsed ? "none" : "1px solid var(--line)", cursor: "pointer", userSelect: "none" }} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: 10, color: "var(--ink-4)", transition: "transform 120ms var(--ease-out-quart)", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
        <input type="checkbox" checked={allSelected} onChange={e => { e.stopPropagation(); allSelected ? onClearSelect(emailIds) : onSelectAll(emailIds); }} onClick={e => e.stopPropagation()}
          style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1, fontFamily: "'Geist Mono', monospace" }}>{domain}</span>
        <span style={{ fontSize: 10, color: "var(--ink-4)", padding: "1px 6px", borderRadius: 6, background: "var(--card)" }}>{emails.length}</span>
        {(() => { const c = [...selectedIds].filter(id => emails.some(e => e.id === id)).length; if (c === 0) return null; return <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "'Geist Mono', monospace", fontWeight: 600 }}>({c})</span>; })()}
        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 6, background: hasTxs ? "var(--accent-soft)" : "var(--paper-2)", color: hasTxs ? "var(--accent)" : "var(--ink-4)" }}>{hasTxs ? `${emails.filter(e => _looksLikeTx(e)).length} tx` : "noise"}</span>
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={handleKeepAll} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "var(--accent)", color: "var(--paper)", cursor: busy ? "wait" : "pointer", fontWeight: 500, opacity: busy ? 0.6 : 1 }}>Keep all</button>
          {!confirmDiscard ? (
            <button onClick={() => setConfirmDiscard(true)} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>Discard all</button>
          ) : (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {hasTxs ? (
                <span style={{ fontSize: 10, color: "var(--neg)", maxWidth: 180, lineHeight: 1.3 }}>{emails.filter(e => _looksLikeTx(e)).length} look like transactions. Discard anyway?</span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--ink-3)", maxWidth: 180, lineHeight: 1.3 }}>Discard {emails.length} email{emails.length > 1 ? "s" : ""}?</span>
              )}
              <button onClick={handleDiscardAll} disabled={busy} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "var(--neg)", color: "var(--paper)", cursor: "pointer", fontWeight: 600 }}>Yes</button>
              <button onClick={() => setConfirmDiscard(false)} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer" }}>No</button>
            </div>
          )}
        </div>
      </div>
      {!collapsed && emails.map((e, i) => {
        const globalIdx = idxMap?.[e.id] ?? -1;
        return (
          <ReviewEmailRow key={e.id} email={e}
            onKeep={onKeep} onDiscard={onDiscard}
            isFocused={globalIdx === focusIdx}
            isSelected={selectedIds?.has(e.id) || false}
            onFocus={() => {}}
            onToggleSelect={() => onToggleSelect(e.id)}
            previewId={previewId}
            onTogglePreview={() => onTogglePreview(e.id)}
          />
        );
      })}
    </div>
  );
};

const ReviewDetailPanel = ({ email, onKeep, onDiscard, onClose }) => {
  const [loading, setLoading] = React.useState(false);
  const [fullBody, setFullBody] = React.useState(null);
  const [fetchingBody, setFetchingBody] = React.useState(false);
  const [learned, setLearned] = React.useState(null);

  const handleAction = async (action) => {
    setLoading(true);
    setLearned(null);
    try {
      await API.post(`/api/emails/${email.id}/review`, { action });
      if (action === "keep") { onKeep(email.id); setLearned("allowlisted"); }
      else { onDiscard(email.id); setLearned("blocklisted"); }
    } catch(e) {
      console.error("Review action failed", e);
      showToast("Review action failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchBody = async () => {
    if (fetchingBody || fullBody) return;
    setFetchingBody(true);
    try {
      const r = await API.post(`/api/emails/${email.id}/fetch-body`);
      if (r?.body_text) setFullBody(r.body_text);
    } catch (_) {}
    setFetchingBody(false);
  };

  const looksLikeTx = React.useMemo(() => _looksLikeTx(email), [email]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}>
          <Icon name="x" size={16} stroke="currentColor"/>
        </button>
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{email.sender || email.sender_domain || "\u2014"}</div>
        {email.received_at && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
            {new Date(email.received_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>

      <div style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginBottom: 16, fontFamily: "'Geist', sans-serif", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
        {email.subject || "(no subject)"}
      </div>

      <div style={{ padding: "10px 14px", background: "var(--paper-2)", borderRadius: 6, border: "1px solid var(--line)", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 8 }}>
        <Icon name="alert-circle" size={12} stroke="var(--ink-3)" style={{ flexShrink: 0, marginTop: 1 }}/>
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ink-2)", marginBottom: 2 }}>Why pending</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
            AI classifier confidence below threshold. This email did not match known transaction patterns strongly enough to auto-classify.
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        {fullBody ? (
          <div style={{ padding: 12, background: "var(--paper)", borderRadius: 6, border: "1px solid var(--line)", fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 300, overflowY: "auto" }}>
            {fullBody.slice(0, 3000)}{fullBody.length > 3000 ? "\u2026" : ""}
          </div>
        ) : (
          <div style={{ padding: 12, background: "var(--paper)", borderRadius: 6, border: "1px solid var(--line)", fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5 }}>
            {email.body_snippet || "No preview available"}
            {!fullBody && (
              <button onClick={handleFetchBody} disabled={fetchingBody} style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", cursor: fetchingBody ? "default" : "pointer" }}>
                {fetchingBody ? "Loading..." : "Load full body"}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button disabled={loading} onClick={() => handleAction("keep")} style={{ flex: 1, fontSize: 12, padding: "8px 16px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--paper)", cursor: loading ? "wait" : "pointer", fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
          Keep as transaction
        </button>
        <button disabled={loading} onClick={() => handleAction("discard")} style={{ flex: 1, fontSize: 13, padding: "10px 20px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: loading ? "wait" : "pointer", fontWeight: 500, opacity: loading ? 0.6 : 1 }}>
          Discard as noise
        </button>
      </div>
      {learned && <div style={{ fontSize: 11, color: "var(--pos)", marginTop: 8 }}><Icon name="check" size={10} stroke="var(--pos)"/> {email.sender_domain} {learned}</div>}
    </div>
  );
};

window._looksLikeTx = _looksLikeTx;
const TxCardMemo = React.memo(TxCard, (prev, next) => {
  return prev.tx.id === next.tx.id
    && prev.isPrimary === next.isPrimary
    && prev.resolving === next.resolving
    && prev.pairId === next.pairId;
});
window.TxCard = TxCardMemo;
window.DuplicatePairCard = DuplicatePairCard;
window.IncomeRow = React.memo(IncomeRow, (prev, next) => prev.tx.id === next.tx.id);
window.IncomeTableView = IncomeTableView;
const ReviewEmailRowMemo = React.memo(ReviewEmailRow, (prev, next) => {
  return prev.email.id === next.email.id
    && prev.isSelected === next.isSelected
    && prev.previewId === next.previewId
    && prev.isFocused === next.isFocused;
});
window.ReviewEmailRow = ReviewEmailRowMemo;
window.GroupSection = GroupSection;
window.ReviewDetailPanel = ReviewDetailPanel;
