// @ts-nocheck
// inbox-bulk-reclass.tsx — Bulk reclassification wizard

const BulkReclassWizard = React.memo(({ selectedIds, transactions, setTransactions, clearSelect, selectAllFlag, totalTransactions, isMobile, onClose }) => {
  const [items, setItems] = React.useState([]);
  const [idx, setIdx] = React.useState(0);
  const [method, setMethod] = React.useState(() => localStorage.getItem("_reclass_method") || "llm");

  const switchMethod = (m) => {
    setMethod(m);
    localStorage.setItem("_reclass_method", m);
  };

  const handleClose = () => {
    clearSelect();
    onClose();
  };

  const processBulkItem = async (itemIdx, itemsRef) => {
    if (itemIdx >= itemsRef.length) return;
    setIdx(itemIdx);
    const updated = itemsRef.map((it, i) => i === itemIdx ? { ...it, status: "previewing" } : it);
    setItems(updated);
    try {
      const result = await API.post(`/api/transactions/${itemsRef[itemIdx].id}/reclassify/preview?method=${method}`);
      const next = updated.map((it, i) => i === itemIdx ? { ...it, preview: result, status: "preview" } : it);
      setItems(next);
    } catch (_) {
      const next = updated.map((it, i) => i === itemIdx ? { ...it, status: "error" } : it);
      setItems(next);
    }
  };

  const bulkAccept = async () => {
    const curItems = items;
    const curIdx = idx;
    const item = curItems[curIdx];
    if (!item || item.status !== "preview") return;
    const marked = curItems.map((it, i) => i === curIdx ? { ...it, status: "applying" } : it);
    setItems(marked);
    try {
      const result = await API.post(`/api/transactions/${item.id}/reclassify?method=${method}`);
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
      const next = curItems.map((it, i) => i === curIdx ? { ...it, status: "accepted" } : it);
      setItems(next);
      processBulkItem(curIdx + 1, next);
    } catch (_) {
      setItems(curItems.map((it, i) => i === curIdx ? { ...it, status: "error" } : it));
      return;
    }
  };

  const bulkAcceptAll = async () => {
    const curItems = items;
    const curIdx = idx;
    const remaining = curItems.slice(curIdx).filter(it => it.status === "preview" || it.status === "pending");
    if (remaining.length === 0) return;
    setItems(curItems.map((it, i) =>
      i >= curIdx && (it.status === "preview" || it.status === "pending")
        ? { ...it, status: "applying" } : it
    ));
    const promises = remaining.map((item, i) =>
      API.post(`/api/transactions/${item.id}/reclassify?method=${method}`)
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
          setItems(prev => prev.map((it, j) =>
            j === curIdx + i ? { ...it, status: "accepted" } : it
          ));
        })
        .catch(() => {
          setItems(prev => prev.map((it, j) =>
            j === curIdx + i ? { ...it, status: "error" } : it
          ));
        })
    );
    await Promise.allSettled(promises);
    setIdx(items.length - 1);
  };

  const bulkSkip = () => {
    const curItems = items;
    const curIdx = idx;
    const next = curItems.map((it, i) => i === curIdx ? { ...it, status: "skipped" } : it);
    setItems(next);
    processBulkItem(curIdx + 1, next);
  };

  const bulkSkipAll = () => {
    handleClose();
  };

  React.useEffect(() => {
    const initItems = [...selectedIds].map(id => {
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
        status: "pending",
      };
    });
    if (initItems.length === 0) { handleClose(); return; }
    setItems(initItems);
    setIdx(0);
    processBulkItem(0, initItems);
  }, []);

  React.useEffect(() => {
    if (items.length === 0) return;
    const curItem = items[idx];
    if (!curItem || curItem.status !== "preview") return;
    const onKey = (e) => {
      if (e.key === "Enter") { e.preventDefault(); bulkAccept(); }
      else if (e.key === "s" || e.key === "S") { e.preventDefault(); bulkSkip(); }
      else if (e.key === "Escape") { bulkSkipAll(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items, idx]);

  if (items.length === 0) return null;

  return (
    <>
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>Recategorize {items.length} emails</span>
          <button onClick={handleClose} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}><Icon name="x" size={14} stroke="currentColor"/></button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
            {(() => {
              const done = items.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
              const pct = items.length > 0 ? (done / items.length * 100) : 0;
              return <div style={{ height: "100%", background: "var(--accent)", borderRadius: 2, transition: "transform 300ms", transformOrigin: "left", transform: `scaleX(${pct / 100})` }} />;
            })()}
          </div>
          <span style={{ fontSize: "0.6875rem", fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>{idx + 1}/{items.length}</span>
        </div>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", display: "flex", gap: 10 }}>
          <span style={{ color: "var(--pos)" }}>{items.filter(it => it.status === "accepted").length} accepted</span>
          <span>{items.filter(it => it.status === "skipped").length} skipped</span>
          <span style={{ color: "var(--neg)" }}>{items.filter(it => it.status === "error").length} error</span>
        </div>
        <div onClick={() => switchMethod(method === "llm" ? "rules" : "llm")}
          style={{ position: "relative", display: "flex", background: "var(--paper-2)", borderRadius: 5, padding: 2, cursor: "pointer", marginTop: 8, maxWidth: 140 }}>
          <div style={{
            position: "absolute", top: 2, left: 2, width: "50%", height: "calc(100% - 4px)",
            background: "var(--ink)", borderRadius: 3, transition: "transform 200ms var(--ease-out-quart)",
            transform: `translateX(${method === "llm" ? "0%" : "100%"})`,
          }} />
          <div style={{ flex: 1, padding: "2px 8px", textAlign: "center", fontSize: "0.625rem", fontWeight: 600, color: method === "llm" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>LLM</div>
          <div style={{ flex: 1, padding: "2px 8px", textAlign: "center", fontSize: "0.625rem", fontWeight: 600, color: method === "rules" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>Rules</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
        {(() => {
          const item = items[idx];
          if (!item) return null;

          if (item.status === "previewing") {
            return (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "var(--ink-3)", fontSize: "0.8125rem" }}>
                <div style={{ width: 16, height: 16, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/>
                Classifying…
              </div>
            );
          }

          if (item.status === "error") {
            return (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--neg)", fontSize: "0.8125rem" }}>
                Classification failed for this email. <span style={{ cursor: "pointer", color: "var(--accent)", textDecoration: "underline" }} onClick={() => processBulkItem(idx, items)}>Retry</span>
              </div>
            );
          }

          if (item.status === "pending") {
            return (
              <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: "0.8125rem" }}>Waiting…</div>
            );
          }

          if (item.status === "accepted" || item.status === "skipped" || item.status === "applying") {
            const done = items.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
            const isAllDone = done >= items.length;
            if (isAllDone) {
              const accepted = items.filter(it => it.status === "accepted").length;
              const skipped = items.filter(it => it.status === "skipped").length;
              const errors = items.filter(it => it.status === "error").length;
              return (
                <div style={{ padding: "24px 0", textAlign: "center" }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: 8 }}>
                    {errors === 0 && skipped === 0 ? <Icon name="check" size={28} stroke="var(--pos)"/> :
                     errors === 0 ? <Icon name="check" size={28} stroke="var(--accent)"/> :
                     <Icon name="x" size={28} stroke="var(--neg)"/>}
                  </div>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: 4, color: "var(--ink)" }}>Done</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginBottom: 16 }}>
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
                    <span style={{ fontSize: "0.75rem", color: "var(--ink-3)" }}>Processing {idx + 1} of {items.length}&hellip;</span>
                  </div>
                  <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {item.subject || "(no subject)"}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                    {[
                      ["Label",      curr.label,           p.label || "\u2014"],
                      ["Amount",     curr.amount ? `\u20B9${Math.abs(curr.amount).toLocaleString("en-IN")}` : "\u2014", p.amount != null ? `\u20B9${Math.abs(p.amount).toLocaleString("en-IN")}` : "\u2014"],
                      ["Merchant",   curr.merchant || "\u2014", p.merchant || "\u2014"],
                      ["Category",   curr.category || "\u2014", (normCat(p.category, isIncome)) || "\u2014"],
                      ["Confidence", `${Math.round((curr.confidence ?? 0) * 100)}%`, `${Math.round((p.confidence ?? 0) * 100)}%`],
                    ].map(([k, cv, pv]) => {
                      const changed = cv !== pv && !(k === "Confidence" && (Math.round((item.current.confidence ?? 0) * 100) === Math.round((p.confidence ?? 0) * 100)));
                      return (
                        <div key={k} style={{ background: "var(--paper-2)", borderRadius: 6, padding: "8px 10px" }}>
                          <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{k}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem" }}>
                            <span style={{ color: "var(--ink-2)" }}>{cv}</span>
                            <span style={{ color: "var(--ink-4)", fontSize: "0.625rem" }}>→</span>
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
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "var(--ink-3)", fontSize: "0.8125rem" }}>
                Loading next&hellip;
              </div>
            );
          }

          const p = item.preview;
          const isIncome = p.label === "income";
          const curr = item.current;
          return (
            <div>
              <div style={{ fontSize: "0.75rem", fontWeight: 500, color: "var(--ink)", marginBottom: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.subject || "(no subject)"}
              </div>
              {item.snippet && (
                <div style={{ fontSize: "0.6875rem", color: "var(--ink-4)", marginBottom: 12, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {item.snippet}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 16px", marginBottom: 12 }}>
                {[
                  ["Label",      curr.label,           p.label || "\u2014"],
                  ["Amount",     curr.amount ? `\u20B9${Math.abs(curr.amount).toLocaleString("en-IN")}` : "\u2014", p.amount != null ? `\u20B9${Math.abs(p.amount).toLocaleString("en-IN")}` : "\u2014"],
                  ["Merchant",   curr.merchant || "\u2014", p.merchant || "\u2014"],
                  ["Category",   curr.category || "\u2014", (normCat(p.category, isIncome)) || "\u2014"],
                  ["Confidence", `${Math.round((curr.confidence ?? 0) * 100)}%`, `${Math.round((p.confidence ?? 0) * 100)}%`],
                ].map(([k, cv, pv]) => {
                  const changed = cv !== pv && !(k === "Confidence" && (Math.round((item.current.confidence ?? 0) * 100) === Math.round((p.confidence ?? 0) * 100)));
                  return (
                    <div key={k} style={{ background: "var(--paper-2)", borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ fontSize: "0.625rem", color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>{k}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.75rem" }}>
                        <span style={{ color: "var(--ink-2)" }}>{cv}</span>
                        <span style={{ color: "var(--ink-4)", fontSize: "0.625rem" }}>→</span>
                        <span style={{ color: changed ? "var(--accent)" : "var(--ink)", fontWeight: changed ? 600 : 400 }}>{pv}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {(p.txn_date && p.txn_date !== curr.txn_date) && (
                <div style={{ fontSize: "0.6875rem", color: "var(--accent)", marginBottom: 4 }}>
                  Date: {curr.txn_date || "\u2014"} → {p.txn_date}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {(() => {
        const item = items[idx];
        if (!item) return null;
        const done = items.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
        const isAllDone = done >= items.length && item.status !== "preview";
        if (isAllDone) {
          return (
            <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
              <button onClick={handleClose} style={{ flex: 1, padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: "0.8125rem", cursor: "pointer" }}>Close</button>
            </div>
          );
        }
        if (item.status !== "preview") return null;
        return (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={bulkSkipAll} style={{ padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-3)", fontSize: "0.8125rem", cursor: "pointer" }}>
              Skip all
            </button>
            <button onClick={bulkAcceptAll} style={{ padding: "10px 20px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--accent-soft)", color: "var(--accent)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>
              Accept all
            </button>
            <div style={{ flex: 1 }}/>
            <button onClick={bulkSkip} style={{ padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: "0.8125rem", cursor: "pointer" }}>
              Skip
            </button>
            <button onClick={bulkAccept} style={{ padding: "10px 20px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>
              Accept & Next
            </button>
          </div>
        );
      })()}
    </>
  );
});

const BulkManualForm = React.memo(({ selectedIds, selectAllFlag, totalTransactions, setTransactions, clearSelect, isMobile, onClose }) => {
  const [cat, setCat] = React.useState("other");
  const [label, setLabel] = React.useState("expense");
  const [amount, setAmount] = React.useState("");
  const [merchant, setMerchant] = React.useState("");

  const apply = async () => {
    const apiPatch = { label, category: cat };
    if (amount) apiPatch.amount = Math.abs(parseFloat(amount)) || 0;
    if (merchant.trim()) apiPatch.merchant = merchant.trim();
    await Promise.all([...selectedIds].map(id =>
      API.patch(`/api/transactions/${id}`, apiPatch).catch(() => {})
    ));
    const isIncome = label === "income";
    setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? {
      ...t,
      cat: normCat(cat, isIncome),
      tag: label === "ignore" ? "ignore" : isIncome ? "income" : cat === "sub" ? "subscription" : "expense",
      ...(amount ? { amount: label === "ignore" ? 0 : isIncome ? (parseFloat(amount) || 0) : -(parseFloat(amount) || 0) } : {}),
      ...(merchant.trim() ? { merchant: merchant.trim() } : {}),
    } : t));
    onClose();
    clearSelect();
  };

  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ fontWeight: 600, marginBottom: 14, fontSize: "0.8125rem" }}>Recategorize {selectAllFlag ? totalTransactions : selectedIds.size} transactions</div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 4 }}>Label</div>
        <select value={label} onChange={e=>setLabel(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
          <option value="ignore">Ignore</option>
        </select>
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 4 }}>Category</div>
        <select value={cat} onChange={e=>setCat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}>
          {Object.entries(CATEGORIES).map(([k,c])=>(
            <option key={k} value={k}>{c.label}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 4 }}>Amount (optional)</div>
        <input type="number" min="0" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Leave blank to keep current" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "'Geist Mono', monospace", outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 4 }}>Merchant (optional)</div>
        <input type="text" value={merchant} onChange={e=>setMerchant(e.target.value)} placeholder="Leave blank to keep current" style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "10px 20px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-2)", fontSize: "0.8125rem", cursor: "pointer" }}>Cancel</button>
        <button onClick={apply} style={{ flex: 2, padding: "10px 20px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: "0.8125rem", fontWeight: 600, cursor: "pointer" }}>Apply to {selectAllFlag ? totalTransactions : selectedIds.size}</button>
      </div>
    </div>
  );
});

(window as any).BulkReclassWizard = BulkReclassWizard;
(window as any).BulkManualForm = BulkManualForm;
