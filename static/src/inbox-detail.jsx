const Row = ({ tx, selected, selectMode, onRowClick, onCheckbox, onEditCat }) => {
  const tag = TAGS[tx.tag];
  const isIncome = tx.amount > 0;
  const [hovered, setHovered] = React.useState(false);
  const { isMobile } = useViewport();
  const rowStyle = isMobile
    ? { ...inboxStyles.row, gridTemplateColumns: "24px 30px minmax(0, 1fr) auto", gap: 10, padding: "13px 14px", alignItems: "start" }
    : inboxStyles.row;
  return (
    <div
      onClick={onRowClick}
      className="anim-row-spring"
      style={{ ...rowStyle, ...((selected || hovered) ? inboxStyles.rowSelected : {}), ...(!selected && !hovered && !tx.read ? inboxStyles.rowUnread : {}) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", width: 20, justifyContent: "center" }}
        onClick={e => { e.stopPropagation(); onCheckbox(); }}
        title="Select"
      >
        {selectMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => { e.stopPropagation(); onCheckbox(); }}
            onClick={e => e.stopPropagation()}
            style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)", pointerEvents: "none" }}
          />
        ) : hovered ? (
          <span style={{ width: 13, height: 13, borderRadius: 3, border: "1.5px solid var(--ink-4)", display: "inline-block", boxSizing: "border-box" }}/>
        ) : (
          <>
            {!tx.read && <span className="pulse-dot" style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }}/>}
            {tx.flag && <Icon name="star-f" size={12} stroke="var(--accent)" />}
          </>
        )}
      </div>
      {!isMobile && <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ ...inboxStyles.tagDot, background: tag.dot }}/>
      </div>}
      <MerchantLogo merchant={tx.merchant}/>
      <div style={{ minWidth: 0, display: "flex", alignItems: isMobile ? "flex-start" : "baseline", gap: isMobile ? 5 : 12, flexDirection: isMobile ? "column" : "row" }}>
        <span style={{ ...inboxStyles.merchantName, ...(!tx.read ? inboxStyles.merchantNameUnread : {}), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{tx.merchant}</span>
        <span style={inboxStyles.subject}>{tx.subject}</span>
        {isMobile && <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3, flexWrap: "wrap" }} onClick={(e)=>e.stopPropagation()}>
          <CategoryChip cat={tx.cat} editable onClick={onEditCat} />
          <span style={inboxStyles.time}>{tx.time}</span>
        </div>}
      </div>
      {!isMobile && <div onClick={(e)=>{e.stopPropagation(); onEditCat&&onEditCat();}}>
        <CategoryChip cat={tx.cat} editable />
      </div>}
      {!isMobile && <Confidence value={tx.conf} />}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", gap: 8, flexDirection: isMobile ? "column" : "row" }}>
        {!isMobile && <span style={inboxStyles.time}>{tx.time}</span>}
        <span style={{ ...inboxStyles.amount, ...(isIncome ? inboxStyles.amountPos : inboxStyles.amountNeg) }}>
          {tx.amount === 0 ? "\u2014" : `${isIncome ? "+" : "\u2212"}\u20B9${Math.abs(tx.amount).toLocaleString("en-IN")}`}
        </span>
      </div>
    </div>
  );
};

const CategoryPicker = ({ current, onPick, onClose }) => {
  const { isMobile } = useViewport();
  const [closing, setClosing] = React.useState(false);
  const handleClose = () => { if (closing) return; setClosing(true); setTimeout(onClose, 150); };
  const groups = CategoryService.grouped();
  const content = (
    <>
      <div style={{ padding: "8px 10px 10px", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", display:"flex", alignItems:"center", gap: 8 }}>
        <Icon name="bolt" size={12} stroke="var(--accent)"/> Recategorize: teaches the model
      </div>
      {groups.map(g => (
        <div key={g.key}>
          <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--ink-4)", padding: "6px 10px 2px", fontWeight: 500, borderTop: g.key !== "essentials" ? "1px solid var(--line)" : "none", marginTop: g.key !== "essentials" ? 4 : 0 }}>{g.label}</div>
          {g.categories.map(item => (
            <button key={item.key} onClick={()=>onPick(item.key)} className="fade-in hover-lift" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, border: "none", background: current===item.key ? "var(--paper-2)" : "transparent", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--ink)", fontSize: 13 }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, background: item.bg, border: `1px solid ${item.ink}22`, flexShrink: 0 }} />
              <span style={{ fontWeight: 500 }}>{item.label}</span>
              {current===item.key && <Icon name="check" size={14} stroke="var(--accent)" style={{ marginLeft: "auto" }}/>}
            </button>
          ))}
        </div>
      ))}
    </>
  );

  if (!isMobile) {
    return (
      <div onClick={handleClose} style={{ position: "fixed", inset: 0, zIndex: 100 }} className={closing ? "backdrop-out" : "backdrop-in"}>
        <div onClick={(e)=>e.stopPropagation()} className={closing ? "modal-out" : "modal-in"} style={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 8, width: 320, maxHeight: "60vh", overflowY: "auto", boxShadow: "0 20px 40px -20px var(--shadow-lg)" }}>
          {content}
        </div>
      </div>
    );
  }

  return (
    <div onClick={handleClose} style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: closing ? "transparent" : "rgba(0,0,0,0.4)",
      transition: "background 200ms"
    }}>
      <div onClick={(e)=>e.stopPropagation()} style={{
        position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 101,
        background: "var(--card)",
        borderTopLeftRadius: 12,
        borderTopRightRadius: 12,
        padding: "4px 8px 24px",
        maxHeight: "70vh",
        overflowY: "auto",
        boxShadow: "0 -8px 32px -8px var(--shadow-lg)",
        transform: closing ? "translateY(100%)" : "translateY(0)",
        transition: "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)"
      }}>
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
          <div style={{ width: 32, height: 4, borderRadius: 2, background: "var(--ink-4)" }}/>
        </div>
        {content}
      </div>
    </div>
  );
};

const DetailPanel = ({ tx, onClose, onUpdate }) => {
  const [editingAmt, setEditingAmt] = React.useState(false);
  const [amtDraft, setAmtDraft] = React.useState(Math.abs(tx.amount));
  const [note, setNote] = React.useState(tx.note || "");
  const [reclass, setReclass] = React.useState("idle");
  const [reclassResult, setReclassResult] = React.useState(null);
  const isIncome = tx.amount > 0;
  const sign = isIncome ? "+" : "\u2212";
  const { isMobile } = useViewport();
  const [fetchedBody, setFetchedBody] = React.useState(null);
  const [reclassMethod, setReclassMethod] = React.useState(() => localStorage.getItem("_reclass_method") || "llm");
  const [editingMerchant, setEditingMerchant] = React.useState(false);
  const [merchantDraft, setMerchantDraft] = React.useState(tx.merchant || "");
  const [editDraft, setEditDraft] = React.useState(null);
  const [swipeX, setSwipeX] = React.useState(0);
  const [swiping, setSwiping] = React.useState(false);
  const touchStartX = React.useRef(0);
  const swipeXRef = React.useRef(0);
  const swipingRef = React.useRef(false);

  React.useEffect(() => {
    setAmtDraft(Math.abs(tx.amount));
    setNote(tx.note || "");
    setEditingAmt(false);
    setEditingMerchant(false);
    setMerchantDraft(tx.merchant || "");
    setReclass("idle");
    setReclassResult(null);
    setEditDraft(null);
    setFetchedBody(null);
  }, [tx.id]);

  const handleFetchBody = async () => {
    try {
      const r = await API.post(`/api/transactions/${tx.id}/fetch-body`);
      if (r?.body_text) setFetchedBody(r.body_text);
      return r;
    } catch (e) {
      console.warn("fetch body failed, proceeding without body", e);
      return null;
    }
  };

  const switchMethod = (m) => {
    setReclassMethod(m);
    setReclass("idle");
    setReclassResult(null);
    localStorage.setItem("_reclass_method", m);
  };

  const handlePreview = async () => {
    setReclass("previewing");
    try {
      await handleFetchBody();
      const result = await API.post(`/api/transactions/${tx.id}/reclassify/preview?method=${reclassMethod}`);
      setReclassResult(result);
      setEditDraft({
        label: result.label || tx.tag,
        amount: result.amount != null ? Math.abs(result.amount) : Math.abs(tx.amount),
        merchant: result.merchant || tx.merchant,
        category: result.category || tx.cat,
        confidence: result.confidence ?? tx.conf,
        txn_date: result.txn_date || tx.date,
      });
      setReclass("preview");
    } catch (e) {
      setReclass("error");
    }
  };

  const handleConfirm = async () => {
    setReclass("saving");
    try {
      const draft = editDraft;
      if (!draft) return;
      await API.patch(`/api/transactions/${tx.id}`, {
        label: draft.label,
        amount: Math.abs(draft.amount),
        merchant: draft.merchant,
        category: draft.category,
      });
      setReclass("done");
      const isIgnore = draft.label === "ignore";
      const isIncome = draft.label === "income";
      const isSelfTransfer = draft.label === "self_transfer";
      const cat = normCat(draft.category, isIncome);
      const isSub = cat === "sub";
      onUpdate({
        _skipApi: true,
        amount:   isIgnore || isSelfTransfer ? 0 : isIncome ? (draft.amount || 0) : -(draft.amount || 0),
        cat,
        tag:      isIgnore ? "ignore" : isSelfTransfer ? "self_transfer" : isIncome ? "income" : isSub ? "subscription" : "expense",
        conf:     draft.confidence ?? tx.conf,
        merchant: draft.merchant || tx.merchant,
      });
    } catch (e) {
      setReclass("error");
    }
  };

  const [saving, setSaving] = React.useState(false);

  const saveMerchant = () => {
    const m = merchantDraft.trim();
    setSaving(true);
    onUpdate({ merchant: m });
    setEditingMerchant(false);
    setTimeout(() => setSaving(false), 600);
  };

  const saveAmt = () => {
    const n = parseFloat(amtDraft) || 0;
    setSaving(true);
    onUpdate({ amount: isIncome ? n : -n });
    setEditingAmt(false);
    setTimeout(() => setSaving(false), 600);
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
    swipingRef.current = true;
    setSwiping(true);
    setSwipeX(0);
  };

  const handleTouchMove = (e) => {
    if (!swipingRef.current) return;
    var dx = e.touches[0].clientX - touchStartX.current;
    if (dx > 0) {
      swipeXRef.current = dx;
      setSwipeX(dx);
    }
  };

  const handleTouchEnd = () => {
    swipingRef.current = false;
    setSwiping(false);
    if (swipeXRef.current > 80) {
      onClose();
    }
    setSwipeX(0);
  };

  return (
    <aside style={{
      ...inboxStyles.panel,
      ...(isMobile ? {
        position: "fixed", inset: 0, zIndex: 65, padding: "18px 18px 0", height: "100dvh", borderLeft: "none",
        transform: `translateX(${swipeX}px)`,
        opacity: Math.max(0, 1 - swipeX / 300),
        transition: swiping ? "none" : "transform 0.2s ease, opacity 0.2s ease",
        touchAction: "pan-y"
      } : {})
    }} className="slide-in-right" key={tx.id}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      <div style={inboxStyles.panelBody} className="view-enter">
      <div style={inboxStyles.panelHeader}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MerchantLogo merchant={tx.merchant} size={36}/>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{tx.merchant}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{tx.domain}</div>
          </div>
        </div>
        <button onClick={onClose} className="focus-ring" style={{ border: "1px solid var(--line)", background: "var(--paper)", padding: 6, borderRadius: 6, color: "var(--ink-3)", cursor:"pointer" }}>
          <Icon name="x" size={14}/>
        </button>
      </div>

      <div style={{ marginTop: 8 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 }}>{isIncome ? "Money in" : "Money out"}</div>
        {editingAmt ? (
          <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
            <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: isMobile ? 40 : 54, color: isIncome ? "var(--pos)" : "var(--ink)", lineHeight: 1 }}>{sign}₹</span>
            <input
              autoFocus
              value={amtDraft}
              onChange={(e)=>setAmtDraft(e.target.value.replace(/[^\d.]/g,""))}
              onBlur={saveAmt}
              onKeyDown={(e)=>{ if(e.key==="Enter") saveAmt(); if(e.key==="Escape") { setAmtDraft(Math.abs(tx.amount)); setEditingAmt(false); } }}
              style={{ fontFamily: "'Geist Mono', monospace", fontSize: isMobile ? 40 : 54, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, width: isMobile ? 160 : 240, border: "none", background: "transparent", color: isIncome ? "var(--pos)" : "var(--ink)", outline: "none", borderBottom: "2px solid var(--accent)", padding: 0 }}
            />
          </div>
        ) : (
          <div onClick={()=>setEditingAmt(true)} className="hover-border-bottom" style={{ cursor: "text", display: "inline-block" }}>
            <div style={{ ...inboxStyles.bigAmount, ...(isMobile ? { fontSize: 40 } : {}), color: isIncome ? "var(--pos)" : "var(--ink)" }}>
              {sign}₹{Math.abs(tx.amount).toLocaleString("en-IN")}
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          {dateLabel(tx.date)}: {tx.time}
          {saving && (
            <span style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 4 }}>
              <span className="spinner-xs" />
              Saving...
            </span>
          )}
        </div>
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--ink-3)", marginBottom: 10, padding: "10px 12px", background: tx.conf < 0.7 ? "var(--accent-soft)" : "var(--paper-2)", borderRadius: 6 }}>
          <Icon name="info" size={14} stroke={tx.conf < 0.7 ? "var(--accent)" : "var(--ink-3)"}/>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--ink)", fontWeight: 500, fontSize: 12 }}>
              {tx.conf < 0.7 ? "Low confidence: review suggested" : "Auto-parsed by Moneyflow AI"}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {tx.conf >= 0.9 ? "Merchant, amount and category all matched high-signal heuristics." : tx.conf >= 0.7 ? "Some fields inferred: tap to verify." : "New or unusual merchant. Please confirm category."}
            </div>
          </div>
          <Confidence value={tx.conf} />
        </div>
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={inboxStyles.field}>
          <span style={inboxStyles.fieldLabel}>Category</span>
          <CategoryChip cat={tx.cat} editable onClick={()=>onUpdate({ _openPicker: true })} />
        </div>
        <div style={inboxStyles.field}>
          <span style={inboxStyles.fieldLabel}>Type</span>
          <span
            onClick={() => {
              const order = ["expense", "income", "self_transfer", "ignore"];
              const idx = order.indexOf(tx.tag);
              onUpdate({ tag: order[(idx + 1) % order.length] });
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            title="Click to cycle: expense → income → self transfer → ignore"
          >
            <span style={{ ...inboxStyles.tagDot, background: TAGS[tx.tag].dot }}/>
            <span style={inboxStyles.fieldVal}>{TAGS[tx.tag].label}</span>
          </span>
        </div>
        <div style={inboxStyles.field}>
          <span style={inboxStyles.fieldLabel}>Merchant</span>
          {editingMerchant ? (
            <input
              autoFocus
              value={merchantDraft}
              onChange={e=>setMerchantDraft(e.target.value)}
              onBlur={saveMerchant}
              onKeyDown={e=>{ if(e.key==="Enter") saveMerchant(); if(e.key==="Escape") { setMerchantDraft(tx.merchant||""); setEditingMerchant(false); } }}
              style={{ padding: "8px 10px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", outline: "none", width: 140, textAlign: "right", boxSizing: "border-box" }}
            />
          ) : (
            <span onClick={()=>setEditingMerchant(true)} className="hover-border-bottom" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 500, color: "var(--ink)", padding: "1px 0" }}>
              {tx.merchant || "\u2014"}
            </span>
          )}
        </div>
        <div style={inboxStyles.field}>
          <span style={inboxStyles.fieldLabel}>Source</span>
          <span style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--ink-3)", fontSize: 12 }}>
            <Icon name="mail" size={12}/>
            {tx.domain}
          </span>
        </div>
        {tx.method && (
          <div style={inboxStyles.field}>
            <span style={inboxStyles.fieldLabel}>Method</span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4,
              fontSize: 11, fontWeight: 600,
              background: tx.method === "llm" ? "var(--accent-soft)" : "var(--paper-2)",
              color: tx.method === "llm" ? "var(--accent)" : "var(--ink-3)",
              textTransform: "uppercase",
            }}>
              {tx.method === "llm" && <Icon name="bolt" size={10} stroke="var(--accent)"/>}
              {tx.method === "rule" && <Icon name="check" size={10} stroke="var(--ink-3)"/>}
              {tx.method}
            </span>
          </div>
        )}
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Email excerpt</div>
          <button onClick={handleFetchBody} style={{ fontSize: 11, padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-3)", cursor: "pointer", fontWeight: 500 }}>
            Fetch body
          </button>
        </div>
        <div style={{ padding: 14, background: "var(--paper-2)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, border: "1px solid var(--line)" }}>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--ink-4)", marginBottom: 6 }}>{tx.subject}</div>
          {fetchedBody ? (
            <>
              <div style={{ fontSize: 10, color: "var(--pos)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="check" size={10} stroke="var(--pos)"/> Body refreshed ({fetchedBody.length} chars)
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" }}>{fetchedBody.slice(0, 2000)}{fetchedBody.length > 2000 ? "\u2026" : ""}</div>
            </>
          ) : (
            tx.snippet || <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>No preview available</span>
          )}
        </div>
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Note</div>
          {saving && (
            <span style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 4 }}>
              <span className="spinner-xs" />
              Saving...
            </span>
          )}
        </div>
        <textarea
          value={note}
          onChange={(e)=>setNote(e.target.value)}
          onBlur={()=>{ setSaving(true); onUpdate({ note }); setTimeout(()=>setSaving(false), 600); }}
          placeholder="Add context for yourself..."
          className="focus-ring"
          style={{ width: "100%", minHeight: 60, border: "1px solid var(--line)", borderRadius: 6, padding: "8px 10px", background: "var(--card)", color: "var(--ink)", fontSize: 12, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
        />
      </div>

      </div>{/* end panelBody */}

      <div style={inboxStyles.panelFooter}>
        {reclass === "preview" && reclassResult && editDraft && (
          <div className="fade-in" style={{ marginBottom: 10, padding: 16, background: "var(--card)", borderRadius: 12, border: "1px solid var(--line)", fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name={reclassMethod === "rules" ? "check" : "bolt"} size={13} stroke="var(--accent)"/> {reclassMethod === "rules" ? "Rules found" : "AI found"}: edit & apply
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Label</div>
                <select value={editDraft.label} onChange={e=>setEditDraft(d=>({...d, label:e.target.value}))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}>
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                  <option value="self_transfer">Self Transfer</option>
                  <option value="ignore">Ignore</option>
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Amount</div>
                <input type="number" min="0" step="0.01" value={editDraft.amount} onChange={e=>setEditDraft(d=>({...d, amount: parseFloat(e.target.value) || 0}))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "'Geist Mono', monospace", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Merchant</div>
                <input type="text" value={editDraft.merchant} onChange={e=>setEditDraft(d=>({...d, merchant:e.target.value}))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Category</div>
                <select value={editDraft.category} onChange={e=>setEditDraft(d=>({...d, category:e.target.value}))} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: 12, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}>
                  {Object.entries(CATEGORIES).filter(([k])=>k!=="income").map(([k, c]) => (
                    <option key={k} value={k}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Confidence</div>
                <div style={{ fontWeight: 500, color: "var(--ink)", marginTop: 2, fontSize: 12 }}>{Math.round((editDraft.confidence ?? 0) * 100)}%</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Date</div>
                <div style={{ fontWeight: 500, color: "var(--ink)", marginTop: 2, fontSize: 12 }}>{editDraft.txn_date || "\u2014"}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={()=>setReclass("idle")} style={{ flex: 1, padding: "8px 0", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Discard</button>
              <button onClick={handleConfirm} style={{ flex: 2, padding: "8px 0", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Apply changes</button>
            </div>
          </div>
        )}

        {reclass === "saving" && (
          <div style={{ marginBottom: 10, padding: 10, background: "var(--paper-2)", borderRadius: 8, fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
            <span className="spinner-sm" />
            Saving...
          </div>
        )}

        {reclass === "done" && (
          <div className="fade-in" style={{ marginBottom: 10, padding: 10, background: "var(--pos-soft)", borderRadius: 8, border: "1px solid var(--pos)", fontSize: 12, color: "var(--pos)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="check" size={14} stroke="var(--pos)"/>
            Saved: {editDraft?.label || "—"}: ₹{Math.abs(editDraft?.amount ?? 0).toLocaleString("en-IN")} · {editDraft?.merchant || "—"}
          </div>
        )}

        {reclass === "error" && (
          <div className="fade-in" style={{ marginBottom: 10, padding: 10, background: "var(--neg-soft)", borderRadius: 8, border: "1px solid var(--neg)", fontSize: 12, color: "var(--neg)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="x" size={14} stroke="var(--neg)"/> Recategorization failed: check server logs
          </div>
        )}

        <div onClick={() => switchMethod(reclassMethod === "llm" ? "rules" : "llm")}
          style={{ position: "relative", display: "flex", background: "var(--paper-2)", borderRadius: 6, padding: 2, cursor: "pointer", marginBottom: 8 }}>
          <div style={{
            position: "absolute", top: 2, left: 2, width: "50%", height: "calc(100% - 4px)",
            background: "var(--ink)", borderRadius: 4, transition: "transform 200ms var(--ease-out-smooth)",
            transform: `translateX(${reclassMethod === "llm" ? "0%" : "100%"})`,
          }} />
          <div style={{ flex: 1, padding: "4px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: reclassMethod === "llm" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>LLM</div>
          <div style={{ flex: 1, padding: "4px 8px", textAlign: "center", fontSize: 11, fontWeight: 600, color: reclassMethod === "rules" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>Rules</div>
        </div>
        <div style={{ display: "flex", gap: 8, flexDirection: isMobile ? "column" : "row" }}>
          <button className="focus-ring" onClick={()=>onUpdate({ flag: !tx.flag })} style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: tx.flag ? "var(--accent-soft)" : "var(--paper)", color: tx.flag ? "var(--accent)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <Icon name={tx.flag ? "star-f" : "star"} size={13} stroke={tx.flag ? "var(--accent)" : "currentColor"} />
            {tx.flag ? "Flagged" : "Flag"}
          </button>
          <button
            className="focus-ring"
            onClick={()=>{ if(reclass==="idle"||reclass==="done"||reclass==="error") handlePreview(); }}
            disabled={reclass==="previewing"||reclass==="saving"||reclass==="preview"}
            style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: (reclass==="previewing"||reclass==="preview") ? "var(--paper-2)" : "var(--paper)", color: (reclass==="previewing"||reclass==="preview") ? "var(--ink-4)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: (reclass==="previewing"||reclass==="saving"||reclass==="preview") ? "default" : "pointer" }}>
            <Icon name={reclassMethod === "rules" ? "check" : "bolt"} size={13} stroke={(reclass==="previewing"||reclass==="preview") ? "var(--ink-4)" : "currentColor"}/>
            {reclass === "previewing" ? "Classifying..." : "Recategorize"}
          </button>
        </div>
      </div>
    </aside>
  );
};

const RowMemo = React.memo(Row, (prev, next) => {
  return prev.tx === next.tx
    && prev.selected === next.selected
    && prev.selectMode === next.selectMode;
});
window.Row = RowMemo;
window.CategoryPicker = CategoryPicker;
window.DetailPanel = DetailPanel;
