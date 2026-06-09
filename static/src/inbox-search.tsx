// @ts-nocheck
// inbox-search.tsx — Search view for transactions

const SearchView = React.memo(({ query, categoryFilter }) => {
  const [results, setResults] = React.useState([]);
  const [insights, setInsights] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [pickerFor, setPickerFor] = React.useState(null);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectAllFlag, setSelectAllFlag] = React.useState(false);
  const [dupBulkResult, setDupBulkResult] = React.useState(null);
  const { isMobile } = useViewport();

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelect = () => { setSelectMode(false); setSelectedIds(new Set()); setSelectAllFlag(false); };

  const bulkAction = async (action, localPatch) => {
    if (selectAllFlag) {
      if (localPatch) setResults(rs => rs.map(t => ({ ...t, ...localPatch })));
      clearSelect();
      try {
        await API.post("/api/transactions/bulk", { ids: [], action, select_all: true });
      } catch (err) {
        console.error("bulk action failed:", err);
        showToast(`Bulk ${action} failed`);
      }
    } else {
      const ids = [...selectedIds];
      setResults(rs => rs.map(t => selectedIds.has(t.id) ? { ...t, ...localPatch } : t));
      clearSelect();
      try {
        await API.post("/api/transactions/bulk", { ids, action });
      } catch (err) {
        console.error("bulk action failed:", err);
        showToast(`Bulk ${action} failed`);
      }
    }
  };

  const bulkMarkRead   = () => bulkAction("mark_read",   { read: true });
  const bulkMarkUnread = () => bulkAction("mark_unread", { read: false });
  const bulkFlag       = () => bulkAction("flag",        { flag: true });
  const bulkUnflag     = () => bulkAction("unflag",      { flag: false });

  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} transaction(s)?`)) return;
    const ids = [...selectedIds];
    clearSelect();
    setResults(rs => rs.filter(t => !ids.includes(t.id)));
    try {
      await API.post("/api/transactions/bulk", { ids, action: "delete" });
    } catch (err) {
      console.error("bulk delete failed:", err);
      showToast("Bulk delete failed");
    }
  };

  const bulkDetectDuplicates = async () => {
    const ids = [...selectedIds];
    clearSelect();
    try {
      const result = await API.post("/api/transactions/bulk", { ids, action: "detect_duplicates" });
      const dupStats = result?.duplicates || {};
      const totalDups = (dupStats.same_domain_exact || 0) + (dupStats.same_domain || 0) + (dupStats.cross_domain || 0) + (dupStats.merchant_alias || 0) + (dupStats.investment_flow || 0);
      if (totalDups > 0) {
        showToast(`${totalDups} duplicate pair${totalDups > 1 ? "s" : ""} found`);
      } else if (dupStats.existing_pairs > 0) {
        showToast(`${dupStats.existing_pairs} pair${dupStats.existing_pairs > 1 ? "s" : ""} already detected`);
      } else if (dupStats.already_paired > 0) {
        showToast(`${dupStats.already_paired} potential match${dupStats.already_paired > 1 ? "es" : ""} already paired`);
      } else {
        showToast("No new duplicates found");
      }
      setDupBulkResult({ ...dupStats, newPairIds: dupStats.new_pair_ids || [] });
    } catch (e) {
      console.error("bulk detect duplicates failed:", e);
      showToast("Duplicate detection failed. Try again.");
    }
  };

  React.useEffect(() => {
    if (!query || query.trim().length < 2) return;
    setLoading(true);
    setSelectedId(null);
    clearSelect();
    API.get(`/api/search?q=${encodeURIComponent(query.trim())}&limit=200`)
      .then(d => {
        let items = (d.items || []).map(transformTransaction);
        if (categoryFilter) items = items.filter(t => t.cat === categoryFilter);
        setResults(items);
        setInsights(d.insights || null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query, categoryFilter]);

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") clearSelect(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }
    const prevSnapshot = results.find(t => t.id === id);
    setResults(rs => rs.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi || patch._delete) return;
    const api = {};
    if (patch.tag      !== undefined) api.label       = patch.tag;
    if (patch.cat       !== undefined) api.category   = patch.cat;
    if (patch.note      !== undefined) api.user_notes = patch.note;
    if (patch.amount    !== undefined) api.amount     = Math.abs(patch.amount);
    if (patch.merchant  !== undefined) api.merchant   = patch.merchant;
    if (patch.read      !== undefined) api.read       = patch.read;
    if (patch.flag      !== undefined) api.flagged    = patch.flag;
    if (Object.keys(api).length > 0)
      API.patch(`/api/transactions/${id}`, api)
        .then(data => {
          if (data && data.learned_rule) {
            showToast(<span><Icon name="check" size={12} stroke="var(--pos)"/> Learned: {data.learned_rule.domain} → {data.learned_rule.label} / {data.learned_rule.category}</span>);
          }
        })
        .catch(e => {
          console.error("search patch failed:", e);
          if (prevSnapshot) {
            setResults(rs => rs.map(t => t.id === id ? { ...prevSnapshot } : t));
          }
          showToast("Save failed: check connection and try again");
        });
  };

  const grouped = groupByDate(results);
  const selected = results.find(t => t.id === selectedId);
  const wrapStyle = selected && !isMobile ? inboxStyles.wrap : inboxStyles.wrapNoPanel;

  return (
    <div style={{ ...wrapStyle, height: "calc(100dvh - 72px)" }}>
      <div style={inboxStyles.list}>
        <div className="inbox-toolbar" style={inboxStyles.toolbar}>
          {selectMode ? (
            <>
              <input type="checkbox" style={{ margin: 0, cursor: "pointer" }}
                checked={(selectedIds.size === results.length && results.length > 0) || selectAllFlag}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedIds(new Set(results.map(t => t.id)));
                    setSelectAllFlag(true);
                  } else {
                    setSelectedIds(new Set());
                    setSelectAllFlag(false);
                  }
                }}
              />
              <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginLeft: 4 }}>{selectAllFlag ? results.length : selectedIds.size} selected</span>
              <button onClick={clearSelect} style={{ marginLeft: "auto", padding: "4px 8px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: "0.6875rem", ...(isMobile ? { minHeight: 44 } : {}) }}>Cancel</button>
            </>
          ) : (
            loading
              ? <span>Searching…</span>
              : <span style={isMobile ? { fontSize: "0.75rem" } : {}}>{results.length} result{results.length !== 1 ? "s" : ""} for <strong style={{ color: "var(--ink)", fontWeight: 600 }}>"{query}"</strong></span>
          )}
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 56 }}>
            <div className="skeleton" style={{ width: 48, height: 48, borderRadius: 999 }} />
          </div>
        )}

        {!loading && results.length === 0 && (
          <div style={{ padding: isMobile ? "72px max(14px, env(safe-area-inset-right, 0px)) 72px max(14px, env(safe-area-inset-left, 0px))" : "72px 32px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Geist', sans-serif", fontSize: isMobile ? 18 : 20, color: "var(--ink-3)", marginBottom: 8 }}>No results</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--ink-4)" }}>Try a different merchant, category, or amount</div>
          </div>
        )}

        {!loading && insights && results.length > 0 && (
          <div style={{
            padding: isMobile ? "12px max(14px, env(safe-area-inset-right, 0px)) 12px max(14px, env(safe-area-inset-left, 0px))" : "12px 28px 8px",
            borderBottom: "1px solid var(--line)",
            background: "var(--paper)",
          }}>
            <div style={{
              display: "flex",
              gap: 8,
              ...(isMobile ? { flexWrap: "wrap" } : {}),
            }}>
              {(() => {
                const onlyExpenses = insights.total_expenses > 0 && insights.total_income === 0;
                const onlyIncome = insights.total_income > 0 && insights.total_expenses === 0;
                const both = insights.total_expenses > 0 && insights.total_income > 0;
                const net = insights.total_income - insights.total_expenses;
                let primaryLabel, primaryValue, primaryColor;
                if (onlyExpenses) {
                  primaryLabel = "Total spent";
                  primaryValue = `\u20B9${insights.total_expenses.toLocaleString("en-IN")}`;
                  primaryColor = "var(--neg)";
                } else if (onlyIncome) {
                  primaryLabel = "Total earned";
                  primaryValue = `\u20B9${insights.total_income.toLocaleString("en-IN")}`;
                  primaryColor = "var(--pos)";
                } else if (both) {
                  primaryLabel = net >= 0 ? "Net saved" : "Net spent";
                  primaryValue = `\u20B9${Math.abs(net).toLocaleString("en-IN")}`;
                  primaryColor = net >= 0 ? "var(--pos)" : "var(--neg)";
                } else {
                  primaryLabel = "Total";
                  primaryValue = "\u20B90";
                  primaryColor = "var(--ink)";
                }
                const fmtDateShort = (d) => {
                  if (!d) return "";
                  const dt = new Date(d + "T00:00:00");
                  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
                };
                const fmtDateFull = (d) => {
                  if (!d) return "";
                  const dt = new Date(d + "T00:00:00");
                  return dt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
                };
                const cards = [
                  { label: primaryLabel, value: primaryValue, color: primaryColor },
                  { label: "Transactions", value: insights.transaction_count.toLocaleString("en-IN") },
                  { label: "Avg / txn", value: `\u20B9${insights.avg_amount.toLocaleString("en-IN")}` },
                ];
                if (insights.date_range?.from && insights.date_range?.to) {
                  cards.push({
                    label: "Period",
                    value: `${fmtDateShort(insights.date_range.from)}\u2013${fmtDateFull(insights.date_range.to)}`,
                  });
                }
                return cards;
              })().map(card => (
                <div key={card.label} style={{
                  flex: 1,
                  ...(isMobile ? { minWidth: "calc(50% - 4px)" } : {}),
                  background: "var(--card)",
                  borderRadius: 8,
                  padding: "10px 12px",
                  border: "1px solid var(--line)",
                }}>
                  <div style={{
                    fontFamily: "'Geist Mono', monospace",
                    fontSize: isMobile ? 15 : 18,
                    fontWeight: 700,
                    color: card.color || "var(--ink)",
                    lineHeight: 1.2,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}>{card.value}</div>
                  <div style={{ fontSize: "0.625rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", marginTop: 3, fontWeight: 500 }}>{card.label}</div>
                </div>
              ))}
            </div>

            {insights.top_merchants?.length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.625rem", color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 }}>Top</span>
                {insights.top_merchants.map((m, i) => (
                  <React.Fragment key={m.merchant}>
                    {i > 0 && <span style={{ color: "var(--ink-4)", fontSize: "0.5625rem" }}>·</span>}
                    <span style={{ fontSize: "0.6875rem", color: "var(--ink-2)", fontWeight: 500, whiteSpace: "nowrap" }}>
                      {m.merchant}
                      <span style={{ fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)", fontSize: "0.625rem", marginLeft: 3 }}>
                        \u20B9{m.total.toLocaleString("en-IN")}
                      </span>
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
          </div>
        )}

        {!loading && grouped.map(([date, txs]) => (
          <div key={date}>
            <div onClick={() => {
              if (!selectMode) { setSelectMode(true); setSelectedIds(new Set(txs.map(t => t.id))); }
              else {
                const allSelected = txs.every(t => selectedIds.has(t.id));
                setSelectedIds(prev => {
                  const next = new Set(prev);
                  txs.forEach(t => allSelected ? next.delete(t.id) : next.add(t.id));
                  return next;
                });
              }
            }} style={{ ...inboxStyles.dayLabel, ...(isMobile ? { padding: "16px max(14px, env(safe-area-inset-right, 0px)) 7px max(14px, env(safe-area-inset-left, 0px))", top: 41 } : {}), cursor: "pointer" }}>
              <span>{dateLabel(date)}</span>
            </div>
            {txs.map((tx, idx) => (
              <Row
                key={tx.id}
                style={{"--i": idx}}
                tx={tx}
                selected={selectMode ? selectedIds.has(tx.id) : selectedId === tx.id}
                selectMode={selectMode}
                onRowClick={() => {
                  window.hapticLight?.();
                  if (selectMode) { toggleSelect(tx.id); }
                  else { setSelectedId(tx.id); updateTx(tx.id, { read: true }); }
                }}
                onCheckbox={() => { if (!selectMode) { setSelectMode(true); } toggleSelect(tx.id); }}
                onEditCat={() => setPickerFor(tx.id)}
              />
            ))}
          </div>
        ))}
      </div>

      {dupBulkResult && (
        <div style={{ margin: "8px 12px", padding: "12px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
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
           <button onClick={() => setDupBulkResult(null)} style={{ padding: "4px 8px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>Dismiss</button>
         </div>
      )}

      {selectedIds.size > 0 && (
        <div className="bulk-bar" style={{ position: "fixed", bottom: isMobile ? "calc(var(--mobile-tabbar-h) + 8px)" : 24, left: "50%", transform: "translateX(-50%)", zIndex: 70, width: isMobile ? "calc(100vw - 24px)" : "auto" }}>
          <div style={{
            background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: isMobile ? "10px 8px" : "12px 20px",
            display: "flex", alignItems: "center", gap: isMobile ? 8 : 12,
            boxShadow: "0 8px 32px -8px var(--shadow-lg)", fontSize: "0.8125rem", fontWeight: 500,
            overflowX: isMobile ? "auto" : "visible",
            scrollBehavior: "smooth", WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            animation: "bulkBarIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
          }}>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", opacity: 0.6, flexShrink: 0, marginLeft: 4 }}>{selectAllFlag ? results.length : selectedIds.size} selected</span>
            <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Read</button>
            <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Unread</button>
            <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Flag</button>
            <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Unflag</button>
            <button onClick={() => { window.hapticHeavy?.(); bulkDelete(); }} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Delete</button>
            <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Duplicates</button>
            <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}><Icon name="x" size={14} stroke="currentColor"/></button>
          </div>
        </div>
      )}

      {selected && <DetailPanel tx={selected} onClose={() => setSelectedId(null)} onUpdate={p => updateTx(selected.id, p)} />}
      {pickerFor && (
        <CategoryPicker
          current={results.find(t => t.id === pickerFor)?.cat}
          onPick={cat => {
            const prev = { cat: results.find(t => t.id === pickerFor)?.cat };
            updateTx(pickerFor, { cat, conf: 1.0 });
            setPickerFor(null);
            if (prev.cat) showToast("Category changed", { label: "Undo", onClick: () => updateTx(pickerFor, prev) });
          }}
          onClose={() => setPickerFor(null)}
        />
      )}
    </div>
  );
});

(window as any).SearchView = SearchView;
