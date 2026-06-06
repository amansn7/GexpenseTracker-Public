const InboxView = React.memo(({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, categoryFilter, dateRange, setDateRange = () => {}, loadMore = () => {}, loadData = () => {}, totalTransactions = 0, loadingMore = false, reviewEmails = [], setReviewEmails = () => {} }) => {
  const { isMobile } = useViewport();
  const [pickerFor, setPickerFor] = React.useState(null); // tx id
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [selectMode, setSelectMode] = React.useState(false);
  const [bulkDetectError, setBulkDetectError] = React.useState("");
  const [selectAllFlag, setSelectAllFlag] = React.useState(false);
  const [collapsedAll, setCollapsedAll] = React.useState(null); // null=default, true=all collapsed, false=all expanded
  const [showFirstHint, setShowFirstHint] = React.useState(() => !localStorage.getItem("mf_hint_dismissed"));
  const [reviewFocusIdx, setReviewFocusIdx] = React.useState(-1); // focused email index in review tab
  const [reviewSelected, setReviewSelected] = React.useState(new Set()); // selected email IDs for bulk action
  const [reviewPreviewId, setReviewPreviewId] = React.useState(null); // expanded email ID
  const [reviewUndo, setReviewUndo] = React.useState(null); // { ids, action, emails } for undo
  const [reviewSort, setReviewSort] = React.useState("domain"); // domain | date | sender
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
        if (savedDate.toDateString() === today.toDateString()) {
          return saved;
        }
      }
    } catch (_) {}
    return { kept: 0, discarded: 0, startedAt: Date.now() };
  });
  const [lastSessionStats, setLastSessionStats] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem("mf_review_last_session")); } catch (_) { return null; }
  });
  const [needsReviewCount, setNeedsReviewCount] = React.useState(null);
  const [needsReviewItems, setNeedsReviewItems] = React.useState([]);
  const [needsReviewLoading, setNeedsReviewLoading] = React.useState(false);
  const listRef = React.useRef(null);
  const listApiRef = React.useRef(null);
  const { VariableSizeList: VList } = window.ReactWindow || {};
  const [pullY, setPullY] = React.useState(0);
  const [pulling, setPulling] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const pullStartY = React.useRef(0);
  const pullStartScroll = React.useRef(0);

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

  // Date range presets
  const datePresets = DateUtils.DATE_PRESETS;
  const currentPreset = datePresets.find(p => {
    const range = p.get();
    return range.from === dateRange.from && range.to === dateRange.to;
  }) || null;
  const [bulkReclassItems, setBulkReclassItems] = React.useState([]);  // each: { id, subject, snippet, current, preview, status }
  const closeReclass = () => { clearSelect(); setBulkReclassItems([]); };
  const [bulkReclassIdx, setBulkReclassIdx] = React.useState(0);       // index of currently-displayed item
  const [bulkManualOpen, setBulkManualOpen] = React.useState(false);
  const [bulkManualCat, setBulkManualCat] = React.useState("other");
  const [bulkManualLabel, setBulkManualLabel] = React.useState("expense");
  const [bulkManualAmount, setBulkManualAmount] = React.useState("");
  const [bulkManualMerchant, setBulkManualMerchant] = React.useState("");
  const [bulkMethod, setBulkMethod] = React.useState(() => localStorage.getItem("_reclass_method") || "llm");
  const [dupPairs, setDupPairs] = React.useState([]);
  const [dupLoading, setDupLoading] = React.useState(false);
  const [dupScanning, setDupScanning] = React.useState(false);
  const [dupResolved, setDupResolved] = React.useState([]);
  const [dupResolvedLoading, setDupResolvedLoading] = React.useState(false);
  const [dupTab, setDupTab] = React.useState("pending");
  const [dupSelected, setDupSelected] = React.useState(new Set());
  const [dupBulkResolving, setDupBulkResolving] = React.useState(false);
  const [dupBulkResult, setDupBulkResult] = React.useState(null);
  const headerCheckRef = React.useRef(null);

  React.useEffect(() => {
    if (!selectMode) return;
    const onKey = (e) => { if (e.key === "Escape") { setSelectMode(false); setSelectedIds(new Set()); setSelectAllFlag(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  // Bulk reclass keyboard shortcuts
  React.useEffect(() => {
    if (bulkReclassItems.length === 0) return;
    const item = bulkReclassItems[bulkReclassIdx];
    if (!item || item.status !== "preview") return;
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); bulkAccept(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); bulkSkip(); }
      else if (e.key === "Escape") { bulkSkipAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bulkReclassItems, bulkReclassIdx]);

  // Keyboard shortcuts for duplicates view
  React.useEffect(() => {
    if (filter !== "duplicates" || dupTab !== "pending") return;
    const onKey = (e) => {
      if (e.key === "Escape" && dupSelected.size > 0) { e.preventDefault(); setDupSelected(new Set()); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dupTab, filter, dupSelected]);

  // Fetch needs_review count on mount and filter change
  React.useEffect(() => {
    if (filter !== "review" || reviewEmails.length === 0) return;
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
  }, [filter, reviewEmails, reviewFocusIdx, reviewShowShortcuts]);

  // Auto-refresh polling for review tab (30s interval)
  React.useEffect(() => {
    if (filter !== "review" || !reviewAutoRefresh) return;
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
  }, [filter, reviewAutoRefresh]);

  // Fetch needs_review count on mount and when filter lands on needs_review
  React.useEffect(() => {
    API.get("/api/review?count=true")
      .then(data => setNeedsReviewCount(data?.count ?? null))
      .catch(() => {});
  }, [filter]);

  // Fetch needs_review items when tab is active
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

  // Persist review session stats to localStorage
  React.useEffect(() => {
    localStorage.setItem("mf_review_session", JSON.stringify(reviewSessionStats));
  }, [reviewSessionStats]);

  // Reset selection when switching filter tabs
  React.useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectAllFlag(false);
  }, [filter]);

  React.useEffect(() => {
    if (filter !== "duplicates") return;
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
  }, [filter, dupTab]);

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
    const count = ids.length;
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
      setDupTab("pending");
      await loadData();
    } catch (e) {
      console.error("bulk detect duplicates failed:", e);
      showToast("Duplicate detection failed. Try again.");
    }
  };

  const switchBulkMethod = (m) => {
    setBulkMethod(m);
    localStorage.setItem("_reclass_method", m);
  };

  const bulkReclassify = async () => {
    const ids = [...selectedIds];
    const items = ids.map(id => {
      const t = transactions.find(tx => tx.id === id);
      return {
        id,
        subject: t?.subject || "",
        snippet: t?.snippet || "",
        current: {
          label: t?.tag === "income" ? "income" : "expense",
          amount: t?.amount || 0,
          merchant: t?.merchant || "",
          category: t?.cat || "",
          confidence: t?.conf || 0,
        },
        preview: null,
        status: "pending", // pending | previewing | accepted | skipped | error
      };
    });
    setBulkReclassItems(items);
    setBulkReclassIdx(0);
    // start processing the first item
    processBulkItem(0, items);
  };

  const processBulkItem = async (idx, itemsRef) => {
    // Use a copy via closure — itemsRef is the array from the call site
    if (idx >= itemsRef.length) return; // all done
    setBulkReclassIdx(idx);
    // mark current as previewing
    const updated = itemsRef.map((it, i) => i === idx ? { ...it, status: "previewing" } : it);
    setBulkReclassItems(updated);
    try {
      const result = await API.post(`/api/transactions/${itemsRef[idx].id}/reclassify/preview?method=${bulkMethod}`);
      const next = updated.map((it, i) => i === idx ? { ...it, preview: result, status: "preview" } : it);
      setBulkReclassItems(next);
    } catch (_) {
      const next = updated.map((it, i) => i === idx ? { ...it, status: "error" } : it);
      setBulkReclassItems(next);
    }
  };

  const bulkAccept = async () => {
    const items = bulkReclassItems;
    const idx = bulkReclassIdx;
    const item = items[idx];
    if (!item || item.status !== "preview") return;
    const marked = items.map((it, i) => i === idx ? { ...it, status: "applying" } : it);
    setBulkReclassItems(marked);
    try {
      const result = await API.post(`/api/transactions/${item.id}/reclassify?method=${bulkMethod}`);
      const isIgnore = result.label === "ignore";
      const isIncome = result.label === "income";
      const cat = normCat(result.category, isIncome);
      setTransactions(ts => ts.map(t => t.id === item.id ? {
        ...t,
        cat,
        amount: isIgnore ? 0 : isIncome ? (result.amount || 0) : -(result.amount || 0),
        tag: isIgnore ? "ignore" : isIncome ? "income" : cat === "sub" ? "subscription" : "expense",
        conf: result.confidence ?? t.conf,
        merchant: result.merchant || t.merchant,
      } : t));
      const next = items.map((it, i) => i === idx ? { ...it, status: "accepted" } : it);
      setBulkReclassItems(next);
      processBulkItem(idx + 1, next);
    } catch (_) {
      setBulkReclassItems(items.map((it, i) => i === idx ? { ...it, status: "error" } : it));
      return;
    }
  };

  const bulkAcceptAll = async () => {
    const items = bulkReclassItems;
    const idx = bulkReclassIdx;
    const remaining = items.slice(idx).filter(it => it.status === "preview" || it.status === "pending");
    if (remaining.length === 0) return;
    setBulkReclassItems(items.map((it, i) =>
      i >= idx && (it.status === "preview" || it.status === "pending")
        ? { ...it, status: "applying" } : it
    ));
    const promises = remaining.map((item, i) =>
      API.post(`/api/transactions/${item.id}/reclassify?method=${bulkMethod}`)
        .then(data => {
          const isIgnore = data.label === "ignore";
          const isIncome = data.label === "income";
          const cat = normCat(data.category, isIncome);
          setTransactions(ts => ts.map(t => t.id === item.id ? {
            ...t, cat,
            amount: isIgnore ? 0 : isIncome ? (data.amount || 0) : -(data.amount || 0),
            tag: isIgnore ? "ignore" : isIncome ? "income" : cat === "sub" ? "subscription" : "expense",
            conf: data.confidence ?? t.conf,
            merchant: data.merchant || t.merchant,
          } : t));
          setBulkReclassItems(prev => prev.map((it, j) =>
            j === idx + i ? { ...it, status: "accepted" } : it
          ));
        })
        .catch(() => {
          setBulkReclassItems(prev => prev.map((it, j) =>
            j === idx + i ? { ...it, status: "error" } : it
          ));
        })
    );
    await Promise.allSettled(promises);
    setBulkReclassIdx(items.length - 1);
  };

  const bulkSkip = () => {
    const items = bulkReclassItems;
    const idx = bulkReclassIdx;
    const next = items.map((it, i) => i === idx ? { ...it, status: "skipped" } : it);
    setBulkReclassItems(next);
    processBulkItem(idx + 1, next);
  };

  const bulkSkipAll = () => {
    clearSelect();
    setBulkReclassItems([]);
  };


  const bulkManualApply = async () => {
    const apiPatch = { label: bulkManualLabel, category: bulkManualCat };
    if (bulkManualAmount) apiPatch.amount = Math.abs(parseFloat(bulkManualAmount)) || 0;
    if (bulkManualMerchant.trim()) apiPatch.merchant = bulkManualMerchant.trim();
    await Promise.all([...selectedIds].map(id =>
      API.patch(`/api/transactions/${id}`, apiPatch).catch(() => {})
    ));
    const isIncome = bulkManualLabel === "income";
    setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? {
      ...t,
      cat: normCat(bulkManualCat, isIncome),
      tag: bulkManualLabel === "ignore" ? "ignore" : isIncome ? "income" : bulkManualCat === "sub" ? "subscription" : "expense",
      ...(bulkManualAmount ? { amount: bulkManualLabel === "ignore" ? 0 : isIncome ? (parseFloat(bulkManualAmount) || 0) : -(parseFloat(bulkManualAmount) || 0) } : {}),
      ...(bulkManualMerchant.trim() ? { merchant: bulkManualMerchant.trim() } : {}),
    } : t));
    setBulkManualOpen(false);
    clearSelect();
  };

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

  const sourceItems = filter === "needs_review" ? needsReviewItems : transactions;
  const filtered = sourceItems.filter(t => {
    if (t.tag === "ignore") return false;
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

  // Virtualized list: flatten grouped into a flat array of {type, ...}
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

  React.useLayoutEffect(() => {
    const el = listAreaRef.current;
    if (!el) return;
    const update = () => { if (listAreaRef.current) setListHeight(listAreaRef.current.clientHeight); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [flatItems.length, filter]);

  const getItemSize = React.useCallback((index) => {
    const item = flatItems[index];
    if (!item) return 45;
    if (item.type === "header") return isMobile ? 35 : 48;
    return isMobile ? 53 : 45;
  }, [flatItems, isMobile]);

  const handleItemsRendered = React.useCallback(({ visibleStopIndex }) => {
    if (visibleStopIndex >= flatItems.length - 5
        && transactions.length < totalTransactions
        && !loadingMore) {
      loadMoreRef.current();
    }
  }, [flatItems.length, transactions.length, totalTransactions, loadingMore]);

  // Scroll to selected item when navigating with arrow keys
  React.useEffect(() => {
    if (!selectedId || !listApiRef.current || !VList) return;
    const idx = flatItems.findIndex(item => item.type === "row" && item.tx?.id === selectedId);
    if (idx >= 0) listApiRef.current.scrollToItem(idx, "smart");
  }, [selectedId, flatItems]);

  // Dismiss first-visit hint on first interaction
  React.useEffect(() => { if (selectedId && showFirstHint) { setShowFirstHint(false); localStorage.setItem("mf_hint_dismissed", "1"); } }, [selectedId]);

  // Auto-load more when a filtered tab has fewer than 10 visible rows but
  // more data exists — capped at 3 attempts per tab to avoid chain-fetching
  // sparse tabs (e.g. income) that would exhaust all transactions.
  React.useEffect(() => {
    if (filter === "all" || filter === "duplicates" || filter === "needs_review") return;
    if (transactions.length >= totalTransactions) return;
    if (filtered.length >= 10) return;
    if (loadingMore) return;
    if (autoLoadAttemptsRef.current >= 3) return;
    autoLoadAttemptsRef.current += 1;
    loadMore();
  }, [filter, filtered.length, transactions.length, totalTransactions, loadingMore]);

  // Debounced save queue: maps tx id → { timer, optimisticSnapshot }
  const saveQueueRef = React.useRef(new Map());

  // Cleanup: flush pending saves on unmount
  React.useEffect(() => {
    return () => {
      saveQueueRef.current.forEach(({ timer }) => clearTimeout(timer));
    };
  }, []);

  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }

    // Capture state before optimistic update for rollback
    const prevSnapshot = transactions.find(t => t.id === id);

    // Optimistic local update
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    setNeedsReviewItems(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi) return;

    // Build API patch object
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

    // Debounce: clear pending timer for this id, set new one
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
          // Rollback optimistic update
          if (prevSnapshot) {
            setTransactions(ts => ts.map(t => t.id === id ? { ...prevSnapshot } : t));
          }
          showToast("Save failed: check connection and try again");
        });
    }, 400);

    queue.set(id, { timer, prevSnapshot });
  };

  // Keyboard shortcuts for the inbox list
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

  function handleTouchStart(e) {
    if (!isMobile) return;
    pullStartY.current = e.touches[0].clientY;
    pullStartScroll.current = listRef.current?.scrollTop || 0;
  }

  function handleTouchMove(e) {
    if (!isMobile) return;
    if (pullStartScroll.current > 0) return;
    var dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setPulling(true);
      setPullY(Math.min(dy * 0.5, 120));
    }
  }

  function handleTouchEnd() {
    if (!isMobile) return;
    if (pullY > 80) {
      setRefreshing(true);
      loadData();
      setTimeout(function () { setRefreshing(false); }, 1200);
    }
    setPulling(false);
    setPullY(0);
  }

  const BulkManualContent = () => (
    <div style={{ padding: "0 4px" }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13 }}>Recategorize {selectAllFlag ? totalTransactions : selectedIds.size} transactions</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Label</div>
        <select value={bulkManualLabel} onChange={e=>setBulkManualLabel(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="ignore">Ignore</option>
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Category</div>
        <select value={bulkManualCat} onChange={e=>setBulkManualCat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          {Object.entries(CATEGORIES).map(([k,c])=>(
            <option key={k} value={k}>{c.label}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Amount (optional)</div>
        <input type="number" min="0" step="0.01" value={bulkManualAmount} onChange={e=>setBulkManualAmount(e.target.value)} placeholder="Leave blank to keep current" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, fontFamily: "'Geist Mono', monospace", outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Merchant (optional)</div>
        <input type="text" value={bulkManualMerchant} onChange={e=>setBulkManualMerchant(e.target.value)} placeholder="Leave blank to keep current" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => setBulkManualOpen(false)} style={{ flex: 1, padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Cancel</button>
        <button onClick={bulkManualApply} style={{ flex: 2, padding: "10px 20px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Apply to {selectAllFlag ? totalTransactions : selectedIds.size}</button>
      </div>
    </div>
  );

  const BulkReclassContent = () => (
    <>
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 13 }}>Recategorize {bulkReclassItems.length} emails</span>
          <button onClick={closeReclass} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}><Icon name="x" size={14} stroke="currentColor"/></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
            {(() => {
              const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
              const pct = bulkReclassItems.length > 0 ? (done / bulkReclassItems.length * 100) : 0;
              return <div style={{ height: "100%", background: "var(--accent)", borderRadius: 2, transition: "transform 300ms", transformOrigin: "left", transform: `scaleX(${pct / 100})` }} />;
            })()}
          </div>
          <span style={{ fontSize: 11, fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>{bulkReclassIdx + 1}/{bulkReclassItems.length}</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", display: "flex", gap: 10 }}>
          <span style={{ color: "var(--pos)" }}>{bulkReclassItems.filter(it => it.status === "accepted").length} accepted</span>
          <span>{bulkReclassItems.filter(it => it.status === "skipped").length} skipped</span>
          <span style={{ color: "var(--neg)" }}>{bulkReclassItems.filter(it => it.status === "error").length} error</span>
        </div>
        <div onClick={() => switchBulkMethod(bulkMethod === "llm" ? "rules" : "llm")}
          style={{ position: "relative", display: "flex", background: "var(--paper-2)", borderRadius: 5, padding: 2, cursor: "pointer", marginTop: 8, maxWidth: 140 }}>
          <div style={{
            position: "absolute", top: 2, left: 2, width: "50%", height: "calc(100% - 4px)",
             background: "var(--ink)", borderRadius: 3, transition: "transform 200ms var(--ease-out-quart)",
            transform: `translateX(${bulkMethod === "llm" ? "0%" : "100%"})`,
          }} />
          <div style={{ flex: 1, padding: "2px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, color: bulkMethod === "llm" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>LLM</div>
          <div style={{ flex: 1, padding: "2px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, color: bulkMethod === "rules" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>Rules</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {(() => {
          const item = bulkReclassItems[bulkReclassIdx];
          if (!item) return null;

          if (item.status === "previewing") {
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "var(--ink-3)", fontSize: 13 }}>
                <div style={{ width: 16, height: 16, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/>
                Classifying…
              </div>
            );
          }

          if (item.status === "error") {
            return (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--neg)", fontSize: 13 }}>
                Classification failed for this email. <span style={{ cursor: "pointer", color: "var(--accent)", textDecoration: "underline" }} onClick={() => processBulkItem(bulkReclassIdx, bulkReclassItems)}>Retry</span>
              </div>
            );
          }

          if (item.status === "pending") {
            return (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: 13 }}>Waiting…</div>
            );
          }

          if (item.status === "accepted" || item.status === "skipped" || item.status === "applying") {
            const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
            const isAllDone = done >= bulkReclassItems.length;
            if (isAllDone) {
              const accepted = bulkReclassItems.filter(it => it.status === "accepted").length;
              const skipped = bulkReclassItems.filter(it => it.status === "skipped").length;
              const errors = bulkReclassItems.filter(it => it.status === "error").length;
              return (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>
                    {errors === 0 && skipped === 0 ? <Icon name="check" size={28} stroke="var(--pos)"/> :
                     errors === 0 ? <Icon name="check" size={28} stroke="var(--accent)"/> :
                     <Icon name="x" size={28} stroke="var(--neg)"/>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, color: "var(--ink)" }}>Done</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginBottom: 16 }}>
                    {accepted ? `${accepted} accepted` : ""}
                    {accepted && skipped ? " · " : ""}
                    {skipped ? `${skipped} skipped` : ""}
                    {errors ? ` · ${errors} error${errors > 1 ? "s" : ""}` : ""}
                  </div>
                </div>
              );
            }
            if (item.status === "applying" && item.preview) {
              const p = item.preview;
              const isIncome = p.label === "income";
              const curr = item.current;
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span className="spinner-sm" />
                    <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Processing {bulkReclassIdx + 1} of {bulkReclassItems.length}&hellip;</span>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.subject || "(no subject)"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                    {[
                      ["Label",      curr.label,           p.label || "—"],
                      ["Amount",     curr.amount ? `₹${Math.abs(curr.amount).toLocaleString("en-IN")}` : "—", p.amount != null ? `₹${Math.abs(p.amount).toLocaleString("en-IN")}` : "—"],
                      ["Merchant",   curr.merchant || "—", p.merchant || "—"],
                      ["Category",   curr.category || "—", (normCat(p.category, isIncome)) || "—"],
                      ["Confidence", `${Math.round((curr.confidence ?? 0) * 100)}%`, `${Math.round((p.confidence ?? 0) * 100)}%`],
                    ].map(([k, cv, pv]) => {
                      const changed = cv !== pv && !(k === "Confidence" && (Math.round((item.current.confidence ?? 0) * 100) === Math.round((p.confidence ?? 0) * 100)));
                      return (
                        <div key={k} style={{ background: "var(--paper-2)", borderRadius: 6, padding: "8px 10px" }}>
                          <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{k}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                            <span style={{ color: "var(--ink-2)" }}>{cv}</span>
                            <span style={{ color: "var(--ink-4)", fontSize: 10 }}>→</span>
                            <span style={{ color: changed ? "var(--accent)" : "var(--ink)", fontWeight: changed ? 600 : 400 }}>{pv}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "var(--ink-3)", fontSize: 13 }}>
                Loading next&hellip;
              </div>
            );
          }

          // preview ready
          const p = item.preview;
          const isIncome = p.label === "income";
          const curr = item.current;
          return (
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: "var(--ink)", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.subject || "(no subject)"}
              </div>
              {item.snippet && (
                <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 12, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {item.snippet}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                {[
                  ["Label",      curr.label,           p.label || "—"],
                  ["Amount",     curr.amount ? `₹${Math.abs(curr.amount).toLocaleString("en-IN")}` : "—", p.amount != null ? `₹${Math.abs(p.amount).toLocaleString("en-IN")}` : "—"],
                  ["Merchant",   curr.merchant || "—", p.merchant || "—"],
                  ["Category",   curr.category || "—", (normCat(p.category, isIncome)) || "—"],
                  ["Confidence", `${Math.round((curr.confidence ?? 0) * 100)}%`, `${Math.round((p.confidence ?? 0) * 100)}%`],
                ].map(([k, cv, pv]) => {
                  const changed = cv !== pv && !(k === "Confidence" && (Math.round((item.current.confidence ?? 0) * 100) === Math.round((p.confidence ?? 0) * 100)));
                  return (
                    <div key={k} style={{ background: "var(--paper-2)", borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{k}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                        <span style={{ color: "var(--ink-2)" }}>{cv}</span>
                        <span style={{ color: "var(--ink-4)", fontSize: 10 }}>→</span>
                        <span style={{ color: changed ? "var(--accent)" : "var(--ink)", fontWeight: changed ? 600 : 400 }}>{pv}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(p.txn_date && p.txn_date !== curr.txn_date) && (
                <div style={{ fontSize: 11, color: "var(--accent)", marginBottom: 4 }}>
                  Date: {curr.txn_date || "—"} → {p.txn_date}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {(() => {
        const item = bulkReclassItems[bulkReclassIdx];
        if (!item) return null;
        const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
        const isAllDone = done >= bulkReclassItems.length && item.status !== "preview";
        if (isAllDone) {
          return (
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={closeReclass} style={{ flex: 1, padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>Close</button>
            </div>
          );
        }
        if (item.status !== "preview") return null;
        return (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={bulkSkipAll} style={{ padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-3)", fontSize: 13, cursor: "pointer" }}>
              Skip all
            </button>
            <button onClick={bulkAcceptAll} style={{ padding: "10px 20px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--accent-soft)", color: "var(--accent)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Accept all
            </button>
            <div style={{ flex: 1 }}/>
            <button onClick={bulkSkip} style={{ padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: 13, cursor: "pointer" }}>
              Skip
            </button>
            <button onClick={bulkAccept} style={{ padding: "10px 20px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              Accept & Next
            </button>
          </div>
        );
      })()}
    </>
  );

  return (
    <>
      <div style={{ ...(selected && !isMobile ? inboxStyles.wrap : inboxStyles.wrapNoPanel), height: isMobile ? "calc(100dvh - 115px)" : (selected ? inboxStyles.wrap.height : inboxStyles.wrapNoPanel.height) }}>
        <div role="list" aria-label="Transactions" style={{ ...inboxStyles.list, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0, ...(isMobile ? { borderRight: "none", touchAction: "pan-y" } : {}) }}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}>
          {(pulling || refreshing) && (
            <div style={{
              height: refreshing ? 36 : pullY,
              display: "flex", alignItems: "center",
              justifyContent: "center", gap: 8, fontSize: 13, color: "var(--ink-3)",
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
          <div style={{ ...inboxStyles.toolbar, ...(isMobile ? { padding: "9px max(14px, env(safe-area-inset-right, 0px)) 9px max(14px, env(safe-area-inset-left, 0px))", gap: 8, overflowX: "auto", alignItems: "center", scrollSnapType: "x mandatory", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } : {}) }}>
            {selectMode ? (
              <>
                <input
                  type="checkbox"
                  checked={(selectedIds.size === filtered.length && filtered.length > 0) || selectAllFlag}
                  onChange={e => { if (e.target.checked) selectAll(); else { setSelectedIds(new Set()); setSelectAllFlag(false); } }}
                  style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>
                  {selectAllFlag ? totalTransactions : selectedIds.size} selected
                </span>
                {!selectAllFlag && filter !== "needs_review" && selectedIds.size === filtered.length && filtered.length > 0 && transactions.length < totalTransactions && (
                  <button
                    onClick={() => setSelectAllFlag(true)}
                    style={{ fontSize: 11, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontWeight: 500 }}
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
                  style={{ fontSize: 11, padding: "5px 24px 5px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-3)", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2378736a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {datePresets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                {!isMobile && <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginLeft: 4 }}>{filtered.length} transactions</span>}
                {!isMobile && selectedId && <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>↑↓ <span style={{ opacity: 0.4 }}>·</span> Esc</span>}
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
                    style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--pos)", color: "white", cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                  >
                    <Icon name="check" size={11} stroke="white"/> Looks Good
                  </button>
                )}
              </>
            )}
          </div>

          {filter === "review" ? (
            <div>
              {reviewEmails.length === 0 ? (
                <div style={{ padding: isMobile ? "64px max(14px, env(safe-area-inset-right, 0px))" : "64px 32px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, background: "var(--paper-2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Icon name="inbox" size={28} stroke="var(--ink-3)"/>
                    </div>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 8 }}>All caught up</div>
                  <div style={{ fontSize: 13, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 8px", lineHeight: 1.6 }}>
                    {reviewSessionStats.kept + reviewSessionStats.discarded > 0
                      ? `You kept ${reviewSessionStats.kept} and discarded ${reviewSessionStats.discarded} in ${Math.round((Date.now() - reviewSessionStats.startedAt) / 60000)} min.`
                      : "No emails to review yet. Run a sync to find and classify your expenses."}
                  </div>
                  {reviewSessionStats.kept + reviewSessionStats.discarded > 0 && (
                    <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 16 }}>
                      This session: <strong style={{ color: "var(--pos)" }}>{reviewSessionStats.kept} kept</strong> · <strong style={{ color: "var(--neg)" }}>{reviewSessionStats.discarded} discarded</strong>
                      <span style={{ marginLeft: 8, opacity: 0.6 }}>· {Math.round((Date.now() - reviewSessionStats.startedAt) / 60000)} min</span>
                    </div>
                  )}
                  {lastSessionStats && reviewSessionStats.kept + reviewSessionStats.discarded === 0 && (
                    <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 16 }}>
                      Last session: <strong style={{ color: "var(--pos)" }}>{lastSessionStats.kept} kept</strong> · <strong style={{ color: "var(--neg)" }}>{lastSessionStats.discarded} discarded</strong>
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={() => { if (window._goSync) window._goSync(); }} style={{ fontSize: 12, padding: "8px 18px", borderRadius: 6, background: "var(--accent)", color: "var(--paper)", cursor: "pointer", fontWeight: 600 }}>
                      Run sync
                    </button>
                    <button onClick={() => setFilter("all")} style={{ fontSize: 13, padding: "10px 20px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontWeight: 500 }}>
                      View transactions
                    </button>
                    {needsReviewCount > 0 && (
                      <button onClick={() => setFilter("needs_review")} style={{ fontSize: 13, padding: "10px 20px", borderRadius: 6, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-2)", cursor: "pointer", fontWeight: 500 }}>
                        Legacy review ({needsReviewCount})
                      </button>
                    )}
                  </div>
                  {reviewSessionStats.kept + reviewSessionStats.discarded > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <button onClick={handleClearSessionStats} style={{ fontSize: 11, color: "var(--ink-4)", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <Icon name="check" size={12} stroke="var(--ink-4)"/> Done reviewing
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div style={isMobile ? { display: "block" } : { display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(0, 420px)", height: "calc(100dvh - 164px)", overflow: "hidden" }}>
                  <div style={isMobile ? {} : { overflowY: "auto", borderRight: "1px solid var(--line)" }}>
                    {/* Progress/scale header */}
                    <div style={{ display: "flex", gap: isMobile ? 8 : 12, padding: isMobile ? "8px 10px" : "10px 14px", borderBottom: "1px solid var(--line)", alignItems: "center", flexWrap: isMobile ? "wrap" : "nowrap", background: "var(--paper-2)" }}>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--ink)", fontFamily: "'Geist Mono', monospace" }}>{reviewEmails.length}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>pending</span>
                      </div>
                      {needsReviewCount !== null && needsReviewCount > 0 && (
                        <div style={{ display: "flex", alignItems: "baseline", gap: 4, padding: "2px 8px", borderRadius: 6, background: "var(--accent-soft)", border: "1px solid var(--accent-soft)" }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)", fontFamily: "'Geist Mono', monospace" }}>{needsReviewCount}</span>
                          <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 500 }}>needs review</span>
                        </div>
                      )}
                      {reviewSessionStats.kept + reviewSessionStats.discarded > 0 && (
                        <div style={{ display: "flex", gap: 8, fontSize: 11, color: "var(--ink-4)" }}>
                          <span>Session: <strong style={{ color: "var(--pos)" }}>{reviewSessionStats.kept}</strong> kept · <strong style={{ color: "var(--neg)" }}>{reviewSessionStats.discarded}</strong> discarded</span>
                        </div>
                      )}
                      <div style={{ flex: 1 }}/>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 8px", borderRadius: 6, background: "var(--paper-2)", border: "1px solid var(--line)" }}>
                        <Icon name="alert-circle" size={11} stroke="var(--ink-3)"/>
                        <span style={{ fontSize: 10, color: "var(--ink-3)", fontWeight: 500 }}>AI confidence below threshold</span>
                      </div>
                      <select value={reviewSort} onChange={e => setReviewSort(e.target.value)} style={{ fontSize: 11, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-2)", cursor: "pointer", minHeight: 44 }}>
                        <option value="domain">Sort: Domain</option>
                        <option value="date">Sort: Date</option>
                        <option value="sender">Sort: Sender</option>
                      </select>
                      <button onClick={() => setReviewAutoRefresh(r => !r)} style={{ fontSize: 10, padding: "8px 12px", borderRadius: 6, border: "1px solid var(--line)", background: reviewAutoRefresh ? "var(--paper-2)" : "var(--card)", color: reviewAutoRefresh ? "var(--ink-2)" : "var(--ink-3)", cursor: "pointer", fontWeight: 500, minHeight: 44 }}>
                        {reviewAutoRefresh ? "Auto ON" : "Auto OFF"}
                      </button>
                    </div>
                    {/* Global action bar */}
                    <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", alignItems: "center", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5 }}>
                      {reviewSelected.size > 0 && (
                        <span style={{ fontSize: 10, color: "var(--accent)", fontWeight: 600, background: "var(--accent-soft)", padding: "1px 6px", borderRadius: 6 }}>{reviewSelected.size} selected</span>
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
                          }} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "none", background: reviewBulkBusy ? "var(--ink-4)" : "var(--accent)", color: "var(--paper)", cursor: reviewBulkBusy ? "wait" : "pointer", fontWeight: 600, opacity: reviewBulkBusy ? 0.6 : 1 }}>
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
                          }} style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, border: "1px solid var(--line)", background: reviewBulkBusy ? "var(--ink-4)" : "var(--paper)", color: reviewBulkBusy ? "var(--paper)" : "var(--ink-2)", cursor: reviewBulkBusy ? "wait" : "pointer", fontWeight: 500, opacity: reviewBulkBusy ? 0.6 : 1 }}>
                            {reviewBulkBusy ? "Processing…" : `Discard ${reviewSelected.size}`}
                          </button>
                        </>
                      )}
                      <div style={{ flex: 1 }}/>
                      <button onClick={() => setCollapsedAll(c => c === true ? null : true)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--line)", background: collapsedAll === true ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>Collapse all</button>
                      <button onClick={() => setCollapsedAll(c => c === false ? null : false)} style={{ fontSize: 11, padding: "4px 12px", borderRadius: 6, border: "1px solid var(--line)", background: collapsedAll === false ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>Expand all</button>
                    </div>
                    {reviewBulkErrors.length > 0 && (
                      <div style={{ padding: "6px 14px", fontSize: 10, color: "var(--neg)", background: "var(--neg-soft)", borderBottom: "1px solid var(--line)" }}>
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", color: "var(--ink-4)", fontSize: 13 }}>
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
              )}
            </div>
          ) : filter === "duplicates" ? (<>
            <div style={{ padding: isMobile ? "10px max(14px, env(safe-area-inset-right, 0px)) 10px max(14px, env(safe-area-inset-left, 0px))" : "10px 16px 10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)", flexWrap: isMobile ? "wrap" : "nowrap", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-2)" }}>Duplicate detection</span>
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
                          fontSize: 12, fontWeight: 500, cursor: "pointer", textTransform: "capitalize",
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
                      style={{ padding: "4px 10px", border: "none", borderRadius: 4, background: "var(--pos)", color: "white", fontSize: 11, fontWeight: 600, cursor: dupBulkResolving ? "default" : "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>
                      Confirm {dupSelected.size}
                    </button>
                    <button onClick={() => bulkResolveDups("dismissed")} disabled={dupBulkResolving}
                      style={{ padding: "4px 10px", border: "none", borderRadius: 4, background: "var(--neg)", color: "white", fontSize: 11, fontWeight: 600, cursor: dupBulkResolving ? "default" : "pointer", ...(isMobile ? { minHeight: 44 } : {}) }}>
                      Dismiss {dupSelected.size}
                    </button>
                  </>
                )}
                <button onClick={async () => {
                  setDupScanning(true);
                  setDupBulkResult(null);
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
                  style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 500, cursor: dupScanning ? "default" : "pointer", opacity: dupScanning ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6, ...(isMobile ? { minHeight: 44 } : {}) }}>
                  {dupScanning ? <><div style={{ width: 11, height: 11, border: "2px solid var(--ink-3)", borderTopColor: "var(--paper)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/> Scanning…</> : "Run scan"}
                </button>
              </div>
            </div>
            {dupTab === "pending" ? (<>
              {dupBulkResult && (
                <div style={{ margin: isMobile ? "8px max(14px, env(safe-area-inset-right, 0px))" : "8px 12px", padding: "12px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
<div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Scan results: {dupBulkResult.checked} transactions checked</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              {dupBulkResult.same_domain_exact > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain_exact}</strong></span>}
              {dupBulkResult.same_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain}</strong></span>}
              {dupBulkResult.merchant_alias > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Merchant alias: <strong>{dupBulkResult.merchant_alias}</strong></span>}
              {dupBulkResult.investment_flow > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Investment flow: <strong>{dupBulkResult.investment_flow}</strong></span>}
              {dupBulkResult.cross_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Cross-domain: <strong>{dupBulkResult.cross_domain}</strong></span>}
               {dupBulkResult.existing_pairs > 0 && <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{dupBulkResult.existing_pairs} pair{dupBulkResult.existing_pairs > 1 ? "s" : ""} already in DB</span>}
               {dupBulkResult.already_paired > 0 && <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{dupBulkResult.already_paired} potential match{dupBulkResult.already_paired > 1 ? "es" : ""} already paired</span>}
               {(!dupBulkResult.same_domain_exact && !dupBulkResult.same_domain && !dupBulkResult.merchant_alias && !dupBulkResult.investment_flow && !dupBulkResult.cross_domain && !dupBulkResult.existing_pairs && !dupBulkResult.already_paired) && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>No matches found</span>}
             </div>
           </div>
           <button onClick={() => setDupBulkResult(null)}
             style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 2, fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</button>
         </div>
       )}
       {dupLoading && !dupScanning ?  (
        <div style={{ padding: isMobile ? "56px max(14px, env(safe-area-inset-right, 0px))" : "56px 32px", display: "flex", justifyContent: "center" }}>
          <SkeletonRow />
        </div>
              ) : dupScanning ? (
                <div style={{ padding: isMobile ? "56px max(14px, env(safe-area-inset-right, 0px))" : "56px 32px", textAlign: "center" }}>
                  <div className="skeleton" style={{ width: 32, height: 32, borderRadius: 999, margin: "0 auto 12px" }} />
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Scanning expenses for duplicates…</div>
                </div>
              ) : dupPairs.length === 0 ? (
                <div style={{ padding: isMobile ? "64px max(14px, env(safe-area-inset-right, 0px))" : "64px 32px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                    <Icon name="check" size={20} stroke="var(--pos)"/>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink-2)", marginBottom: 4 }}>No duplicates found</div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)" }}>Run a scan to check your expense history.</div>
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
                  </div>);
                })
              )}
            </>            ) : dupResolvedLoading ? (
              <div style={{ padding: "56px 32px", display: "flex", justifyContent: "center" }}>
                <SkeletonRow />
              </div>
            ) : dupResolved.length === 0 ? (
              <div style={{ padding: isMobile ? "64px max(14px, env(safe-area-inset-right, 0px))" : "64px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>No resolved duplicates yet.</div>
              </div>
            ) : (
              dupResolved.map(pair => {
                const fmtAmt = (amt) => amt != null ? `₹${Math.abs(amt).toLocaleString("en-IN")}` : "—";
                const statusColor = pair.status === "confirmed" ? "var(--pos)" : pair.status === "dismissed" ? "var(--neg)" : "var(--ink-3)";
                return (
                  <div key={pair.id} style={{ padding: isMobile ? "14px max(14px, env(safe-area-inset-right, 0px)) 14px max(14px, env(safe-area-inset-left, 0px))" : "14px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>
                          {fmtAmt(pair.primary?.amount)} · {pair.primary?.merchant || "Unknown"}
                        </span>
                        <span style={{ fontSize: 11, color: "var(--ink-4)" }}>→</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>
                          discarded {fmtAmt(pair.duplicate?.amount)} {pair.duplicate?.merchant || ""}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                        {pair.rule_source} · confidence {Math.round((pair.confidence || 0) * 100)}%
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", color: statusColor }}>{pair.status}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
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
                        style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", fontSize: 11, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap", ...(isMobile ? { minHeight: 44 } : {}) }}>
                        Undo
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </>) : (
            <>
            {showFirstHint && filter === "all" && !selectedId && (
              <div style={{ padding: "12px 16px", margin: "8px 12px 4px", background: "var(--accent-soft)", borderRadius: 8, fontSize: 12, color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Click a transaction to review and categorize it.</span>
                <button onClick={() => { setShowFirstHint(false); localStorage.setItem("mf_hint_dismissed", "1"); }} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--accent)", padding: 4, display: "flex", fontSize: 14, lineHeight: 1 }}>×</button>
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
                      <div role="listitem" style={style}>
                        <Row
                          tx={item.tx}
                          selected={selectMode ? selectedIds.has(item.tx.id) : selectedId === item.tx.id}
                          selectMode={selectMode}
                          onRowClick={() => {
                            if (selectMode) { toggleSelect(item.tx.id); }
                            else { setSelectedId(item.tx.id); updateTx(item.tx.id, { read: true }); }
                          }}
                          onCheckbox={() => { if (!selectMode) { setSelectMode(true); } toggleSelect(item.tx.id); }}
                          onEditCat={() => setPickerFor(item.tx.id)}
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
            <div style={{ padding: isMobile ? "16px max(14px, env(safe-area-inset-right, 0px))" : "16px 32px", textAlign: "center", fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
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
            boxShadow: "0 8px 32px -8px var(--shadow-lg)", fontSize: 13, fontWeight: 500,
            overflowX: isMobile ? "auto" : "visible",
            scrollBehavior: "smooth", WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            animation: "bulkBarIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
          }}>
            {/* Right-edge fade mask — applied via inline style on the scroll container itself */}
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6, whiteSpace: "nowrap", flexShrink: 0, marginLeft: 4 }}>{selectAllFlag ? totalTransactions : selectedIds.size} selected</span>
            <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Read</button>
            <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Unread</button>
            <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Flag</button>
            <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Unflag</button>
            <button onClick={bulkReclassify} disabled={bulkReclassItems.length > 0} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: bulkReclassItems.length > 0 ? "default" : "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>
              LLM
            </button>
            <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Manual</button>
            <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Delete</button>
            <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Duplicates</button>
            {bulkDetectError && <span style={{ fontSize: 11, color: "var(--neg)", flexShrink: 0 }}>{bulkDetectError}</span>}
            <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "flex", alignItems: "center", flexShrink: 0, marginRight: 4, ...(isMobile ? { minHeight: 44 } : {}) }}><Icon name="x" size={14} stroke="currentColor"/></button>
          </div>
        </div>
      )}

      {bulkManualOpen && (
        isMobile ? (
          <BottomSheet open onClose={() => setBulkManualOpen(false)}>
            <BulkManualContent />
          </BottomSheet>
        ) : (
          <Modal open onClose={() => setBulkManualOpen(false)} width={340}>
            <BulkManualContent />
          </Modal>
        )
      )}

      {bulkReclassItems.length > 0 && (
        isMobile ? (
          <BottomSheet open onClose={closeReclass}>
            <BulkReclassContent />
          </BottomSheet>
        ) : (
          <Modal open onClose={closeReclass}>
            <BulkReclassContent />
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

      {/* Floating keyboard shortcut hint for review tab */}
      {filter === "review" && reviewEmails.length > 0 && reviewShowShortcuts && (
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
            <div style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Review complete</div>
            <div style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 20, lineHeight: 1.5 }}>
              All pending emails have been reviewed.
            </div>
            <div style={{ display: "flex", gap: 16, justifyContent: "center", marginBottom: 20 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--pos)", fontFamily: "'Geist Mono', monospace" }}>{reviewSessionStats.kept}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>kept</div>
              </div>
              <div style={{ width: 1, background: "var(--line)" }}/>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--neg)", fontFamily: "'Geist Mono', monospace" }}>{reviewSessionStats.discarded}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>discarded</div>
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 20 }}>
              Session: {Math.round((Date.now() - reviewSessionStats.startedAt) / 60000)} min
            </div>
            <div style={{ display: "flex", gap: 8, flexDirection: "column" }}>
              <button
                onClick={() => { setShowReviewComplete(false); handleClearSessionStats(); setFilter("all"); }}
                style={{ fontSize: 13, padding: "10px 20px", borderRadius: 8, background: "var(--accent)", color: "var(--paper)", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                View transactions
              </button>
              <button
                onClick={() => { setShowReviewComplete(false); handleClearSessionStats(); }}
                style={{ fontSize: 12, padding: "8px 16px", borderRadius: 6, background: "none", border: "1px solid var(--line)", color: "var(--ink-3)", cursor: "pointer", fontWeight: 500 }}
              >
                Done
              </button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
});

const SearchView = React.memo(({ query, categoryFilter }) => {
  const [results, setResults] = React.useState([]);
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
        <div style={{ ...inboxStyles.toolbar, ...(isMobile ? { padding: "9px max(14px, env(safe-area-inset-right, 0px)) 9px max(14px, env(safe-area-inset-left, 0px))", overflowX: "auto", alignItems: "center", scrollbarWidth: "none", WebkitOverflowScrolling: "touch" } : {}) }}>
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
              <span style={{ fontSize: 11, color: "var(--ink-3)", marginLeft: 4 }}>{selectAllFlag ? results.length : selectedIds.size} selected</span>
              <button onClick={clearSelect} style={{ marginLeft: "auto", padding: "4px 8px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: 11, ...(isMobile ? { minHeight: 44 } : {}) }}>Cancel</button>
            </>
          ) : (
            loading
              ? <span>Searching…</span>
              : <span style={isMobile ? { fontSize: 12 } : {}}>{results.length} result{results.length !== 1 ? "s" : ""} for <strong style={{ color: "var(--ink)", fontWeight: 600 }}>"{query}"</strong></span>
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
            <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Try a different merchant, category, or amount</div>
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
             <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Scan results: {dupBulkResult.checked} transactions checked</div>
             <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
               {dupBulkResult.same_domain_exact > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain_exact}</strong></span>}
               {dupBulkResult.same_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain}</strong></span>}
               {dupBulkResult.merchant_alias > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Merchant alias: <strong>{dupBulkResult.merchant_alias}</strong></span>}
               {dupBulkResult.investment_flow > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Investment flow: <strong>{dupBulkResult.investment_flow}</strong></span>}
               {dupBulkResult.cross_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Cross-domain: <strong>{dupBulkResult.cross_domain}</strong></span>}
               {dupBulkResult.existing_pairs > 0 && <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{dupBulkResult.existing_pairs} pair{dupBulkResult.existing_pairs > 1 ? "s" : ""} already in DB</span>}
               {dupBulkResult.already_paired > 0 && <span style={{ fontSize: 11, color: "var(--ink-4)" }}>{dupBulkResult.already_paired} potential match{dupBulkResult.already_paired > 1 ? "es" : ""} already paired</span>}
               {(!dupBulkResult.same_domain_exact && !dupBulkResult.same_domain && !dupBulkResult.merchant_alias && !dupBulkResult.investment_flow && !dupBulkResult.cross_domain && !dupBulkResult.existing_pairs && !dupBulkResult.already_paired) && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>No matches found</span>}
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
            boxShadow: "0 8px 32px -8px var(--shadow-lg)", fontSize: 13, fontWeight: 500,
            overflowX: isMobile ? "auto" : "visible",
            scrollBehavior: "smooth", WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            animation: "bulkBarIn 300ms cubic-bezier(0.16, 1, 0.3, 1) both",
          }}>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6, flexShrink: 0, marginLeft: 4 }}>{selectAllFlag ? results.length : selectedIds.size} selected</span>
            <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Read</button>
            <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Mark Unread</button>
            <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Flag</button>
            <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Unflag</button>
            <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Delete</button>
            <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Duplicates</button>
            <span style={{ width: 1, height: 20, background: "var(--ink-3)", opacity: 0.4, flexShrink: 0 }} />
            <button onClick={() => setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, flexShrink: 0, ...(isMobile ? { minHeight: 44 } : {}) }}>Categorize</button>
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

window.InboxView = InboxView;
window.SearchView = SearchView;
