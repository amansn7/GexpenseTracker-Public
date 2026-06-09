// @ts-nocheck
const InboxView = React.memo(({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, categoryFilter, dateRange, setDateRange = () => {}, loadMore = () => {}, loadData = () => {}, totalTransactions = 0, loadingMore = false, reviewEmails = [], setReviewEmails = () => {} }) => {
  const { isMobile } = useViewport();
  const [pickerFor, setPickerFor] = React.useState(null);
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectAllFlag, setSelectAllFlag] = React.useState(false);
  const [showFirstHint, setShowFirstHint] = React.useState(() => !localStorage.getItem("mf_hint_dismissed"));
  const [needsReviewCount, setNeedsReviewCount] = React.useState(null);
  const [needsReviewItems, setNeedsReviewItems] = React.useState([]);
  const [needsReviewLoading, setNeedsReviewLoading] = React.useState(false);
  const [dupBulkResult, setDupBulkResult] = React.useState(null);
  const [bulkManualOpen, setBulkManualOpen] = React.useState(false);
  const [bulkReclassOpen, setBulkReclassOpen] = React.useState(false);
  const listRef = React.useRef(null);
  const listApiRef = React.useRef(null);
  const { VariableSizeList: VList } = window.ReactWindow || {};
  const { pullY, pulling, refreshing, handleTouchStart: pullTouchStart, handleTouchMove: pullTouchMove, handleTouchEnd: pullTouchEnd } = window.usePullToRefresh(loadData, { scrollRef: listRef });
  const datePresets = DateUtils.DATE_PRESETS;
  const currentPreset = datePresets.find(p => {
    const range = p.get();
    return range.from === dateRange.from && range.to === dateRange.to;
  }) || null;
  React.useEffect(() => {
    if (!selectMode) return;
    const onKey = (e) => { if (e.key === "Escape") { setSelectMode(false); setSelectedIds(new Set()); setSelectAllFlag(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);
  React.useEffect(() => {
    API.get("/api/review?count=true")
      .then(data => setNeedsReviewCount(data?.count ?? null))
      .catch(() => {});
  }, [filter]);
  React.useEffect(() => {
    if (filter !== "needs_review") return;
    setNeedsReviewLoading(true);
    API.get("/api/review")
      .then(data => {
        if (!Array.isArray(data)) return;
        setNeedsReviewItems(data.map(t => transformTransaction({ ...t, status: "needs_review" })));
      })
      .catch(() => {})
      .finally(() => setNeedsReviewLoading(false));
  }, [filter]);
  React.useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectAllFlag(false);
  }, [filter]);
  const loadMoreRef = React.useRef(loadMore);
  React.useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);
  const autoLoadAttemptsRef = React.useRef(0);
  React.useEffect(() => { autoLoadAttemptsRef.current = 0; }, [filter]);
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)));
  const clearSelect = () => { setSelectMode(false); setSelectedIds(new Set()); setSelectAllFlag(false); };
  const bulkAction = async (action, localPatch) => {
    if (selectAllFlag) {
      if (localPatch) setTransactions(ts => ts.map(t => ({ ...t, ...localPatch })));
      clearSelect();
      try {
        await API.post("/api/transactions/bulk", { ids: [], action, select_all: true });
      } catch (err) {
        console.error("bulk action failed:", err);
        showToast(`Bulk ${action} failed: check connection and try again`);
      }
    } else {
      const ids = [...selectedIds];
      setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? { ...t, ...localPatch } : t));
      clearSelect();
      try {
        await API.post("/api/transactions/bulk", { ids, action });
      } catch (err) {
        console.error("bulk action failed:", err);
        showToast(`Bulk ${action} failed: check connection and try again`);
      }
    }
  };
  const bulkMarkRead   = () => bulkAction("mark_read",   { read: true });
  const bulkMarkUnread = () => bulkAction("mark_unread", { read: false });
  const bulkFlag       = () => bulkAction("flag",        { flag: true });
  const bulkUnflag     = () => bulkAction("unflag",      { flag: false });
  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} email(s)? Classification data is kept.`)) return;
    const ids = [...selectedIds];
    const idsSet = new Set(ids);
    setTransactions(ts => ts.filter(t => !idsSet.has(t.id)));
    clearSelect();
    try {
      await API.post("/api/transactions/bulk", { ids, action: "delete" });
    } catch (err) {
      console.error("bulk delete failed:", err);
      showToast("Bulk delete failed: check connection and try again");
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
      setFilter("duplicates");
      await loadData();
    } catch (e) {
      console.error("bulk detect duplicates failed:", e);
      showToast("Duplicate detection failed. Try again.");
    }
  };
  const sourceItems = filter === "needs_review" ? needsReviewItems : transactions;
  const filtered = sourceItems.filter(t => {
    if (t.tag === "ignore" && filter !== "needs_review") return false;
    if (filter === "all") return true;
    if (filter === "expenses") return t.amount < 0 && t.tag !== "subscription";
    if (filter === "income") return t.amount > 0;
    if (filter === "sub") return t.tag === "subscription";
    if (filter === "flagged") return t.flag;
    if (filter === "low") return t.conf < 0.7;
    if (filter === "needs_review") return t.status === "needs_review";
    if (filter === "payments") return t.amount < 0 && ["rent","util","sub"].includes(t.cat);
    if (filter.startsWith("cat:")) return t.cat === filter.slice(4);
    return true;
  });
  const grouped = groupByDate(filtered);
  const selected = transactions.find(t => t.id === selectedId) || needsReviewItems.find(t => t.id === selectedId);
  const flatItems = React.useMemo(() => {
    if (filter === "review" || filter === "duplicates") return [];
    const items = [];
    grouped.forEach(([date, txs]) => {
      const dayTotal = txs.reduce((a, t) => a + t.amount, 0);
      items.push({ type: "header", date, dayTotal });
      txs.forEach(tx => items.push({ type: "row", tx }));
    });
    return items;
  }, [grouped, filter]);
  const [listHeight, setListHeight] = React.useState(600);
  const listAreaRef = React.useRef(null);
  const heightUpdateRef = React.useRef(null);
  React.useLayoutEffect(() => {
    const el = listAreaRef.current;
    if (!el) return;
    heightUpdateRef.current = () => { if (listAreaRef.current) setListHeight(listAreaRef.current.clientHeight); };
    heightUpdateRef.current();
    const ro = new ResizeObserver(() => { heightUpdateRef.current?.(); });
    ro.observe(el);
    return () => { heightUpdateRef.current = null; ro.disconnect(); };
  }, [filter]);
  const getItemSize = React.useCallback((index) => {
    const item = flatItems[index];
    if (!item) return 56;
    if (item.type === "header") return isMobile ? 40 : 48;
    return isMobile ? 88 : 56;
  }, [flatItems, isMobile]);
  const handleItemsRendered = React.useCallback(({ visibleStopIndex }) => {
    if (visibleStopIndex >= flatItems.length - 5
        && transactions.length < totalTransactions
        && !loadingMore) {
      loadMoreRef.current();
    }
  }, [flatItems.length, transactions.length, totalTransactions, loadingMore]);
  React.useEffect(() => {
    if (!selectedId || !listApiRef.current || !VList) return;
    const idx = flatItems.findIndex(item => item.type === "row" && item.tx?.id === selectedId);
    if (idx >= 0) listApiRef.current.scrollToItem(idx, "smart");
  }, [selectedId, flatItems]);
  React.useEffect(() => { if (selectedId && showFirstHint) { setShowFirstHint(false); localStorage.setItem("mf_hint_dismissed", "1"); } }, [selectedId]);
  React.useEffect(() => {
    if (filter === "all" || filter === "duplicates" || filter === "needs_review") return;
    if (transactions.length >= totalTransactions) return;
    if (filtered.length >= 10) return;
    if (loadingMore) return;
    if (autoLoadAttemptsRef.current >= 3) return;
    autoLoadAttemptsRef.current += 1;
    loadMore();
  }, [filter, filtered.length, transactions.length, totalTransactions, loadingMore]);
  const saveQueueRef = React.useRef(new Map());
  React.useEffect(() => {
    return () => {
      saveQueueRef.current.forEach(({ timer }) => clearTimeout(timer));
    };
  }, []);
  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }
    const prevSnapshot = transactions.find(t => t.id === id);
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    setNeedsReviewItems(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi) return;
    const apiPatch = {};
    if (patch.tag      !== undefined) apiPatch.label      = patch.tag;
    if (patch.cat       !== undefined) apiPatch.category    = patch.cat;
    if (patch.note      !== undefined) apiPatch.user_notes  = patch.note;
    if (patch.amount    !== undefined) apiPatch.amount      = Math.abs(patch.amount);
    if (patch.merchant  !== undefined) apiPatch.merchant    = patch.merchant;
    if (patch.read      !== undefined) apiPatch.read        = patch.read;
    if (patch.flag      !== undefined) apiPatch.flagged     = patch.flag;
    if (patch.status    !== undefined) apiPatch.status      = patch.status;
    if (Object.keys(apiPatch).length === 0) return;
    const queue = saveQueueRef.current;
    if (queue.has(id)) clearTimeout(queue.get(id).timer);
    const timer = setTimeout(() => {
      queue.delete(id);
      API.patch(`/api/transactions/${id}`, apiPatch)
        .then(data => {
          if (data && data.learned_rule) {
            showToast(<span><Icon name="check" size={12} stroke="var(--pos)"/> Learned: {data.learned_rule.domain} → {data.learned_rule.label} / {data.learned_rule.category}</span>);
          }
          if (patch.status === "confirmed") window.playConfirmSound();
        })
        .catch(err => {
          console.error("patch failed:", err);
          if (prevSnapshot) {
            setTransactions(ts => ts.map(t => t.id === id ? { ...prevSnapshot } : t));
          }
          showToast("Save failed: check connection and try again");
        });
    }, 400);
    queue.set(id, { timer, prevSnapshot });
  };
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  React.useEffect(() => {
    if (selectMode || filter === "duplicates") return;
    const onKey = (e) => {
      if (e.key === "Escape" && selectedId) { e.preventDefault(); setSelectedId(null); return; }
      if (e.key === "Escape" && showShortcuts) { e.preventDefault(); setShowShortcuts(false); return; }
      if (e.key === "?" && !selectedId) { e.preventDefault(); setShowShortcuts(s => !s); return; }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const idx = selectedId ? filtered.findIndex(t => t.id === selectedId) : -1;
        const next = e.key === "ArrowDown"
          ? Math.min(idx + 1, filtered.length - 1)
          : Math.max(idx - 1, 0);
        if (next >= 0 && next < filtered.length) {
          setSelectedId(filtered[next].id);
          updateTx(filtered[next].id, { read: true });
        }
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, filtered, selectMode, filter, transactions, showShortcuts]);
  const handleDelete = async (id) => {
    const snapshot = transactions;
    setTransactions(ts => ts.filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await API.delete("/api/transactions/" + id);
    } catch (err) {
      setTransactions(snapshot);
      showToast("Delete failed: check connection and try again");
    }
  };
  return (
    <>
      <div style={{ ...(selected && !isMobile ? inboxStyles.wrap : inboxStyles.wrapNoPanel), height: isMobile ? "calc(100dvh - 115px)" : (selected ? inboxStyles.wrap.height : inboxStyles.wrapNoPanel.height) }}>
        <div role="list" aria-label="Transactions" style={{ ...inboxStyles.list, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, ...(isMobile ? { borderRight: "none", touchAction: "pan-y" } : {}) }}
          onTouchStart={pullTouchStart}
          onTouchMove={pullTouchMove}
          onTouchEnd={pullTouchEnd}>
          {(pulling || refreshing) && (
            <div style={{
              height: refreshing ? 36 : pullY,
              display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, fontSize: "0.8125rem", color: "var(--ink-3)",
              flexShrink: 0,
              transition: pullY === 0 && !pulling ? "height 0.2s ease" : "none"
            }}>
              {refreshing ? (
                <><span className="spinner-sm" /> Refreshing…</>
              ) : (
                <><Icon name={pullY > 80 ? "refresh" : "arrow-down"}
                  style={{ transform: pullY > 80 ? "rotate(180deg)" : "none",
                           transition: "transform 0.2s ease" }} />
                  {pullY > 80 ? "Release to refresh" : "Pull to refresh"}</>
              )}
            </div>
          )}
          <div className="inbox-toolbar" style={inboxStyles.toolbar}>
            {selectMode ? (
              <>
                <input
                  type="checkbox"
                  checked={(selectedIds.size === filtered.length && filtered.length > 0) || selectAllFlag}
                  onChange={e => { if (e.target.checked) selectAll(); else { setSelectedIds(new Set()); setSelectAllFlag(false); } }}
                  style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--ink-2)", fontWeight: 500 }}>
                  {selectAllFlag ? totalTransactions : selectedIds.size} selected
                </span>
                {!selectAllFlag && filter !== "needs_review" && selectedIds.size === filtered.length && filtered.length > 0 && transactions.length < totalTransactions && (
                  <button
                    onClick={() => setSelectAllFlag(true)}
                    style={{ fontSize: "0.6875rem", color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontWeight: 500 }}
                  >Select all {totalTransactions}</button>
                )}
                <div style={{ flex: 1 }}/>
                <button onClick={clearSelect} style={{ ...inboxStyles.chip, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 5 }}><Icon name="x" size={11} stroke="var(--ink-3)"/> Clear</button>
              </>
            ) : (
              <>
                {[
                  ["all","All", "grid", totalTransactions],
                  ["expenses","Expenses", "bag"],
                  ["income","Income", "trend-u"],
                ].map(([k,label,icon,count]) => (
                  <FilterChip key={k} label={label} icon={icon} count={count} active={filter===k} onClick={()=>setFilter(k)} />
                ))}
                <div style={inboxStyles.chipDivider} />
                {[
                  ["sub","Subscriptions", "repeat"],
                  ["flagged","Flagged", "star"],
                  ["low","Low confidence", "alert-circle"],
                  ["needs_review","Needs review", "alert-circle", needsReviewCount],
                  ["duplicates","Duplicates", "arrow-swap"],
                  ["review","New Emails", "inbox", reviewEmails.length],
                ].map(([k,label,icon,count]) => (
                  <FilterChip key={k} label={label} icon={icon} count={count} active={filter===k} onClick={()=>setFilter(k)} />
                ))}
                <div style={{ flex: 1 }}/>
                <select
                  aria-label="Date range filter"
                  value={currentPreset?.label || "This Month"}
                  onChange={(e) => { const preset = datePresets.find(p => p.label === e.target.value); if (preset) setDateRange(preset.get()); }}
                  style={{ fontSize: "0.6875rem", padding: "5px 24px 5px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-3)", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2378736a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {datePresets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                {!isMobile && <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginLeft: 4 }}>{filtered.length} transactions</span>}
                {!isMobile && selectedId && <span style={{ fontSize: "0.625rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>↑↓ <span style={{ opacity: 0.4 }}>·</span> Esc</span>}
                {filter === "needs_review" && selectedId && (
                  <button
                    onClick={async () => {
                      const currentIdx = needsReviewItems.findIndex(t => t.id === selectedId);
                      await updateTx(selectedId, { status: "confirmed" });
                      setNeedsReviewItems(ts => ts.filter(t => t.id !== selectedId));
                      const remaining = needsReviewItems.filter(t => t.id !== selectedId);
                      if (remaining.length > 0) {
                        const nextIdx = currentIdx < remaining.length ? currentIdx : remaining.length - 1;
                        setSelectedId(remaining[nextIdx].id);
                      } else {
                        setSelectedId(null);
                      }
                    }}
                    style={{ fontSize: "0.6875rem", padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--pos)", color: "white", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                  >
                    <Icon name="check" size={11} stroke="white"/> Looks Good
                  </button>
                )}
              </>
            )}
          </div>
          {filter === "review" ? (
            <ReviewTab reviewEmails={reviewEmails} setReviewEmails={setReviewEmails} needsReviewCount={needsReviewCount} setFilter={setFilter} isMobile={isMobile} />
          ) : filter === "duplicates" ? (
            <DuplicatesTab isMobile={isMobile} dupBulkResult={dupBulkResult} setDupBulkResult={setDupBulkResult} />
          ) : (
            <>
            {showFirstHint && filter === "all" && !selectedId && (
              <div style={{ padding: "12px 16px", margin: "8px 12px 4px", background: "var(--accent-soft)", borderRadius: 8, fontSize: "0.75rem", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Click a transaction to review and categorize it.</span>
                <button onClick={() => { setShowFirstHint(false); localStorage.setItem("mf_hint_dismissed", "1"); }} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--accent)", padding: 4, display: "flex", fontSize: "0.875rem", lineHeight: 1 }}>×</button>
              </div>
            )}
            {VList && flatItems.length > 0 ? (
              <div ref={listAreaRef} style={{ flex: 1, overflow: "hidden", minHeight: 0 }}>
                <VList
                  ref={listApiRef}
                  outerRef={listRef}
                  height={listHeight || 600}
                  width="100%"
                  itemCount={flatItems.length}
                  itemSize={getItemSize}
                  onItemsRendered={handleItemsRendered}
                >
                  {({ index, style }) => {
                    const item = flatItems[index];
                    if (item.type === "header") {
                      const txs = grouped.find(([d]) => d === item.date)?.[1] || [];
                      const allSelected = txs.every(t => selectedIds.has(t.id));
                      const someSelected = txs.some(t => selectedIds.has(t.id));
                      return (
                        <div role="listitem" style={style}>
                          <div
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }}
                            onClick={() => {
                              if (!selectMode) setSelectMode(true);
                              if (allSelected) {
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  txs.forEach(t => next.delete(t.id));
                                  return next;
                                });
                              } else {
                                setSelectedIds(prev => {
                                  const next = new Set(prev);
                                  txs.forEach(t => next.add(t.id));
                                  return next;
                                });
                              }
                            }}
                            style={{ ...inboxStyles.dayLabel, ...(isMobile ? { padding: "16px max(14px, env(safe-area-inset-right, 0px)) 7px max(14px, env(safe-area-inset-left, 0px))", top: 41 } : {}), cursor: "pointer", userSelect: "none", position: "relative", top: "auto" }}
                          >
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {selectMode && (
                                <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${allSelected ? "var(--accent)" : someSelected ? "var(--ink-3)" : "var(--line)"}`, background: allSelected ? "var(--accent)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 120ms var(--ease-out-quart)" }}>
                                  {allSelected && <Icon name="check" size={10} stroke="var(--paper)" />}
                                </span>
                              )}
                              {dateLabel(item.date)}
                            </span>
                            <span style={inboxStyles.dayTotal}>
                              {item.dayTotal !== 0 && (item.dayTotal > 0 ? <span style={{ color: "var(--pos)" }}>+₹{item.dayTotal.toLocaleString("en-IN")}</span> : <span>−₹{Math.abs(item.dayTotal).toLocaleString("en-IN")}</span>)}
                            </span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div role="listitem" style={{ ...style, borderBottom: "1px solid var(--line)" }}>
                        <Row
                          tx={item.tx}
                          selected={selectMode ? selectedIds.has(item.tx.id) : selectedId === item.tx.id}
                          selectMode={selectMode}
                          onRowClick={() => {
                            window.hapticLight?.();
                            if (selectMode) { toggleSelect(item.tx.id); }
                            else { setSelectedId(item.tx.id); updateTx(item.tx.id, { read: true }); }
                          }}
                          onCheckbox={() => { if (!selectMode) { setSelectMode(true); } toggleSelect(item.tx.id); }}
                          onEditCat={() => setPickerFor(item.tx.id)}
                          onDelete={isMobile ? handleDelete : undefined}
                        />
                      </div>
                    );
                  }}
                </VList>
              </div>
            ) : filter !== "review" && filter !== "duplicates" && flatItems.length === 0 && (
              <div ref={listAreaRef} style={{ flex: 1, overflow: "hidden", minHeight: 0 }} />
            )}
            </>
          )}
          {needsReviewLoading && (
            <div style={{ padding: isMobile ? "20px max(14px, env(safe-area-inset-right, 0px))" : "20px 32px", display: "flex", justifyContent: "center" }}>
              <SkeletonRow />
            </div>
          )}
          {loadingMore && (
            <div style={{ padding: isMobile ? "20px max(14px, env(safe-area-inset-right, 0px))" : "20px 32px", display: "flex", justifyContent: "center" }}>
              <SkeletonRow />
            </div>
          )}
          {!loadingMore && filter !== "needs_review" && transactions.length < totalTransactions && transactions.length > 0 && (
            <div style={{ padding: isMobile ? "16px max(14px, env(safe-area-inset-right, 0px))" : "16px 32px", textAlign: "center", fontSize: "0.6875rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
              {transactions.length} of {totalTransactions} · scroll for more
            </div>
          )}
        </div>
        {selected && <DetailPanel tx={selected} onClose={()=>setSelectedId(null)} onUpdate={(p)=>updateTx(selected.id, p)} />}
      </div>
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
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", opacity: 0.6, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 4 }}>{selectAllFlag ? totalTransactions : selectedIds.size} selected</span>
            <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Read</button>
            <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Unread</button>
            <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Flag</button>
            <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Unflag</button>
            <button onClick={() => setBulkReclassOpen(true)} disabled={bulkReclassOpen} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: bulkReclassOpen ? "default" : "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>
              LLM
            </button>
            <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Manual</button>
            <button onClick={() => { window.hapticHeavy?.(); bulkDelete(); }} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Delete</button>
            <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Duplicates</button>
            <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0, marginRight: 4, ...(isMobile ? { minHeight: 44 } : {}) }}><Icon name="x" size={14} stroke="currentColor"/></button>
          </div>
        </div>
      )}
      {bulkManualOpen && (
        isMobile ? (
          <BottomSheet open onClose={() => setBulkManualOpen(false)}>
            <BulkManualForm selectedIds={selectedIds} selectAllFlag={selectAllFlag} totalTransactions={totalTransactions} setTransactions={setTransactions} clearSelect={clearSelect} isMobile={isMobile} onClose={() => setBulkManualOpen(false)} />
          </BottomSheet>
        ) : (
          <Modal open onClose={() => setBulkManualOpen(false)} width={340}>
            <BulkManualForm selectedIds={selectedIds} selectAllFlag={selectAllFlag} totalTransactions={totalTransactions} setTransactions={setTransactions} clearSelect={clearSelect} isMobile={isMobile} onClose={() => setBulkManualOpen(false)} />
          </Modal>
        )
      )}
      {bulkReclassOpen && (
        isMobile ? (
          <BottomSheet open onClose={() => setBulkReclassOpen(false)}>
            <BulkReclassWizard selectedIds={selectedIds} transactions={transactions} setTransactions={setTransactions} clearSelect={clearSelect} selectAllFlag={selectAllFlag} totalTransactions={totalTransactions} isMobile={isMobile} onClose={() => setBulkReclassOpen(false)} />
          </BottomSheet>
        ) : (
          <Modal open onClose={() => setBulkReclassOpen(false)}>
            <BulkReclassWizard selectedIds={selectedIds} transactions={transactions} setTransactions={setTransactions} clearSelect={clearSelect} selectAllFlag={selectAllFlag} totalTransactions={totalTransactions} isMobile={isMobile} onClose={() => setBulkReclassOpen(false)} />
          </Modal>
        )
      )}
      {pickerFor && (
        <CategoryPicker
          current={transactions.find(t=>t.id===pickerFor)?.cat}
          onPick={(cat)=>{
            const tx = transactions.find(t=>t.id===pickerFor);
            const prev = tx ? { cat: tx.cat, conf: tx.conf } : null;
            updateTx(pickerFor, { cat, conf: 1.0 });
            setPickerFor(null);
            if (prev) showToast("Category changed", { label: "Undo", onClick: () => updateTx(pickerFor, prev) });
          }}
          onClose={()=>setPickerFor(null)}
        />
      )}
      {showShortcuts && (
        <Modal open onClose={() => setShowShortcuts(false)} width={360}>
          <div style={{ fontFamily:"'Geist',sans-serif", fontSize:18, fontWeight:500, marginBottom:16 }}>Keyboard shortcuts</div>
          {[
            ["↑ ↓", "Navigate transactions"],
            ["Esc", "Close detail panel"],
            ["? /", "Toggle this reference"],
          ].map(([key, desc]) => (
            <div key={key} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"6px 0", fontSize:13 }}>
              <span style={{ color:"var(--ink-2)" }}>{desc}</span>
              <kbd style={{ fontFamily:"'Geist Mono',monospace", fontSize:11, padding:"2px 8px", background:"var(--paper-2)", borderRadius:4, color:"var(--ink)" }}>{key}</kbd>
            </div>
          ))}
          <div style={{ marginTop:16, fontSize:11, color:"var(--ink-4)" }}>Press <kbd style={{ fontFamily:"'Geist Mono',monospace", padding:"1px 6px", background:"var(--paper-2)", borderRadius:3 }}>?</kbd> or click anywhere to close.</div>
        </Modal>
      )}
    </>
  );
});
(window as any).InboxView = InboxView;
