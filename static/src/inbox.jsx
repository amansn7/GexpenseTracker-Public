// Inbox view — Gmail-style transaction list + detail panel

const inboxStyles = {
  wrap: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 0, height: "calc(100vh - 72px)", minHeight: 0 },
  wrapNoPanel: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", height: "calc(100vh - 72px)" },
  list: { overflowY: "auto", borderRight: "1px solid var(--line)" },
  toolbar: { display: "flex", alignItems: "center", gap: 6, padding: "10px 32px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5, fontSize: 12, color: "var(--ink-3)" },
  chip: { padding: "5px 10px", borderRadius: 20, border: "1px solid var(--line)", background: "var(--card)", fontSize: 11, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 6, fontWeight: 500, cursor: "pointer" },
  chipActive: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },

  dayLabel: { padding: "20px 32px 8px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 500, background: "var(--paper)", position: "sticky", top: 41, zIndex: 3, display: "flex", alignItems: "baseline", gap: 12 },
  dayTotal: { fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)", textTransform: "none", letterSpacing: 0 },

  row: { display: "grid", gridTemplateColumns: "24px 16px 26px minmax(0, 1fr) 150px 100px 130px", gap: 12, alignItems: "center", padding: "13px 28px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background 120ms", position: "relative" },
  rowSelected: { background: "var(--paper-2)" },
  rowUnread: { background: "var(--card)" },

  merchantLogo: { width: 26, height: 26, borderRadius: 6, background: "var(--paper-2)", display: "grid", placeItems: "center", fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 11, color: "var(--ink-2)", border: "1px solid var(--line)" },
  merchantName: { fontWeight: 600, color: "var(--ink)", fontSize: 13 },
  merchantNameUnread: { fontWeight: 700 },
  subject: { color: "var(--ink-3)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  amount: { fontFamily: "'Geist Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 14, textAlign: "right" },
  amountPos: { color: "var(--pos)" },
  amountNeg: { color: "var(--ink)" },

  catChip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" },
  tagDot: { width: 6, height: 6, borderRadius: 999 },
  tagLabel: { fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 },

  confBar: { height: 3, borderRadius: 2, background: "var(--line)", overflow: "hidden", width: 56 },
  confFill: { height: "100%", background: "var(--pos)", borderRadius: 2, transition: "transform 200ms", transformOrigin: "left" },
  confLow: { background: "var(--accent)" },
  time: { fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" },

  /* Detail panel */
  panel: { overflowY: "auto", padding: "28px 28px 0", background: "var(--card)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column" },
  panelBody: { flex: 1, paddingBottom: 16 },
  panelFooter: { position: "sticky", bottom: 0, background: "var(--card)", borderTop: "1px solid var(--line)", padding: "12px 0 16px", marginTop: "auto" },
  panelHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  bigAmount: { fontFamily: "'Fraunces', serif", fontSize: 54, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1, margin: "8px 0 4px" },
  panelSection: { padding: "16px 0", borderBottom: "1px dashed var(--line)" },
  field: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13 },
  fieldLabel: { color: "var(--ink-3)", fontSize: 12 },
  fieldVal: { color: "var(--ink)", fontWeight: 500 },
};

const fmtMoney = (n, showSign = false) => {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  const abs = Math.abs(n).toLocaleString("en-IN");
  return (showSign ? sign : "") + "₹" + abs;
};

const groupByDate = (txs) => {
  const groups = {};
  for (const t of txs) {
    if (!groups[t.date]) groups[t.date] = [];
    groups[t.date].push(t);
  }
  return Object.entries(groups).sort((a,b)=>b[0].localeCompare(a[0]));
};

const dateLabel = (isoDate) => {
  if (!isoDate) return "Unknown date";
  const d = new Date(isoDate + "T00:00:00"); // local timezone, not UTC
  if (isNaN(d.getTime())) return "Unknown date";
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today - d) / (24*60*60*1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
};

const MerchantLogo = ({ merchant, size = 26 }) => {
  const letters = merchant.replace(/[^A-Za-z]/g,"").slice(0,2).toUpperCase();
  // deterministic bg based on merchant
  const hash = [...merchant].reduce((a,c)=>a+c.charCodeAt(0),0);
  const bgs = ["var(--cat-food)","var(--cat-rent)","var(--cat-shop)","var(--cat-travel)","var(--cat-sub)","var(--cat-util)","var(--cat-inc)"];
  const inks = ["var(--cat-food-ink)","var(--cat-rent-ink)","var(--cat-shop-ink)","var(--cat-travel-ink)","var(--cat-sub-ink)","var(--cat-util-ink)","var(--cat-inc-ink)"];
  const i = hash % bgs.length;
  return <div style={{ ...inboxStyles.merchantLogo, width: size, height: size, background: bgs[i], color: inks[i], borderColor: "transparent" }}>{letters}</div>;
};

const CategoryChip = ({ cat, onClick, editable }) => {
  const c = CATEGORIES[cat] || { label: cat || "Other", bg: "var(--paper-2)", ink: "var(--ink-3)" };
  return (
    <span style={{ ...inboxStyles.catChip, background: c.bg, color: c.ink, cursor: editable ? "pointer" : "default" }} onClick={onClick}>
      <span style={{ width: 5, height: 5, borderRadius: 999, background: c.ink, opacity: 0.7 }}/>
      {c.label}
      {editable && <Icon name="arrow-d" size={10} />}
    </span>
  );
};

const Confidence = ({ value }) => {
  const low = value < 0.7;
  const pct = Math.round(value * 100);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }} title={`AI confidence ${pct}%`}>
      <div style={inboxStyles.confBar}>
        <div style={{ ...inboxStyles.confFill, width: `${pct}%`, ...(low ? inboxStyles.confLow : {}) }} />
      </div>
      <span style={{ fontSize: 10, fontFamily: "'Geist Mono', monospace", color: low ? "var(--accent)" : "var(--ink-4)", minWidth: 26 }}>{pct}%</span>
    </div>
  );
};

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
      style={{ ...rowStyle, ...(selected ? inboxStyles.rowSelected : {}), ...(!tx.read && !selected ? inboxStyles.rowUnread : {}) }}
      onMouseEnter={e => { setHovered(true); if (!selected) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={e => { setHovered(false); if (!selected) e.currentTarget.style.background = (!selectMode && !tx.read) ? "var(--card)" : "transparent"; }}
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
            {!tx.read && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }}/>}
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
          {tx.amount === 0 ? "—" : `${isIncome ? "+" : "−"}₹${Math.abs(tx.amount).toLocaleString("en-IN")}`}
        </span>
      </div>
    </div>
  );
};

const CategoryPicker = ({ current, onPick, onClose }) => {
  const { isMobile } = useViewport();
  const [userCats, setUserCats] = React.useState(null);

  React.useEffect(() => {
    API.get("/api/account/categories")
      .then(d => setUserCats(d.categories || []))
      .catch(() => setUserCats([]));
  }, []);

  const items = userCats && userCats.length > 0
    ? userCats.map(c => ({ key: c.name.toLowerCase(), label: c.name, bg: c.color, ink: "var(--ink-3)" }))
    : Object.entries(CATEGORIES).filter(([k]) => k !== "income").map(([k, c]) => ({ key: k, label: c.label, bg: c.bg, ink: c.ink }));

  return (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100 }}>
    <div onClick={(e)=>e.stopPropagation()} className="fade-in" style={{ position: "absolute", top: isMobile ? 72 : "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 8, width: isMobile ? "calc(100vw - 28px)" : 320, maxHeight: "60vh", overflowY: "auto", boxShadow: "0 20px 40px -20px rgba(0,0,0,0.3)" }}>
      <div style={{ padding: "8px 10px 10px", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", display:"flex", alignItems:"center", gap: 8 }}>
        <Icon name="sparkle" size={12} stroke="var(--accent)"/> Recategorize — teaches the model
      </div>
      {userCats === null
        ? <div style={{ padding: "12px 10px", fontSize: 12, color: "var(--ink-4)" }}>Loading…</div>
        : items.map(({ key, label, bg, ink }) => (
          <button key={key} onClick={()=>onPick(key)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, border: "none", background: current===key ? "var(--paper-2)" : "transparent", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--ink)", fontSize: 13 }}>
            <span style={{ width: 14, height: 14, borderRadius: 4, background: bg, border: `1px solid ${ink}22`, flexShrink: 0 }} />
            <span style={{ fontWeight: 500 }}>{label}</span>
            {current===key && <Icon name="check" size={14} stroke="var(--accent)" style={{ marginLeft: "auto" }}/>}
          </button>
        ))
      }
    </div>
  </div>
);
};

const DetailPanel = ({ tx, onClose, onUpdate }) => {
  const [editingAmt, setEditingAmt] = React.useState(false);
  const [amtDraft, setAmtDraft] = React.useState(Math.abs(tx.amount));
  const [note, setNote] = React.useState(tx.note || "");
  const [reclass, setReclass] = React.useState("idle"); // idle | previewing | preview | saving | done | error
  const [reclassResult, setReclassResult] = React.useState(null);
  const isIncome = tx.amount > 0;
  const sign = isIncome ? "+" : "−";
  const { isMobile } = useViewport();
  const [fetchBodyOn, setFetchBodyOn] = React.useState(false);
  const [fetchedBody, setFetchedBody] = React.useState(null);

  React.useEffect(() => {
    setAmtDraft(Math.abs(tx.amount));
    setNote(tx.note || "");
    setEditingAmt(false);
    setReclass("idle");
    setReclassResult(null);
    setFetchBodyOn(false);
    setFetchedBody(null);
  }, [tx.id]);

  const handleFetchBody = async () => {
    const r = await API.post(`/api/transactions/${tx.id}/fetch-body`);
    if (r?.body_text) setFetchedBody(r.body_text);
    return r;
  };

  const handlePreview = async () => {
    setReclass("previewing");
    try {
      if (fetchBodyOn) await handleFetchBody();
      const result = await API.post(`/api/transactions/${tx.id}/reclassify/preview`);
      setReclassResult(result);
      setReclass("preview");
    } catch (e) {
      setReclass("error");
    }
  };

  const handleConfirm = async () => {
    setReclass("saving");
    try {
      if (fetchBodyOn) await handleFetchBody();
      const result = await API.post(`/api/transactions/${tx.id}/reclassify`);
      setReclassResult(result);
      setReclass("done");
      // Map API _fmt response → UI tx fields via normCat, then update parent (no extra PATCH)
      const isIncome = result.label === "income";
      const cat = normCat(result.category, isIncome);
      const isSub = cat === "sub";
      onUpdate({
        _skipApi: true,
        amount:   isIncome ? (result.amount || 0) : -(result.amount || 0),
        cat,
        tag:      isIncome ? "income" : isSub ? "subscription" : "expense",
        conf:     result.confidence ?? tx.conf,
        merchant: result.merchant || tx.merchant,
      });
    } catch (e) {
      setReclass("error");
    }
  };

  const saveAmt = () => {
    const n = parseFloat(amtDraft) || 0;
    onUpdate({ amount: isIncome ? n : -n });
    setEditingAmt(false);
  };

  return (
    <aside style={{ ...inboxStyles.panel, ...(isMobile ? { position: "fixed", inset: 0, zIndex: 65, padding: "18px 18px 0", height: "100dvh", borderLeft: "none" } : {}) }} className="slide-in" key={tx.id}>
      <div style={inboxStyles.panelBody}>
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
            <span className="serif" style={{ fontSize: isMobile ? 40 : 54, color: isIncome ? "var(--pos)" : "var(--ink)", lineHeight: 1 }}>{sign}₹</span>
            <input
              autoFocus
              value={amtDraft}
              onChange={(e)=>setAmtDraft(e.target.value.replace(/[^\d.]/g,""))}
              onBlur={saveAmt}
              onKeyDown={(e)=>{ if(e.key==="Enter") saveAmt(); if(e.key==="Escape") { setAmtDraft(Math.abs(tx.amount)); setEditingAmt(false); } }}
              className="serif focus-ring"
              style={{ fontSize: isMobile ? 40 : 54, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1, width: isMobile ? 160 : 240, border: "none", background: "transparent", color: isIncome ? "var(--pos)" : "var(--ink)", outline: "none", borderBottom: "2px solid var(--accent)", padding: 0 }}
            />
          </div>
        ) : (
          <div onClick={()=>setEditingAmt(true)} style={{ cursor: "text", display: "inline-block", borderBottom: "1px dashed transparent" }}
            onMouseEnter={e=>e.currentTarget.style.borderBottomColor="var(--line)"}
            onMouseLeave={e=>e.currentTarget.style.borderBottomColor="transparent"}>
            <div style={{ ...inboxStyles.bigAmount, ...(isMobile ? { fontSize: 40 } : {}), color: isIncome ? "var(--pos)" : "var(--ink)" }}>
              {sign}₹{Math.abs(tx.amount).toLocaleString("en-IN")}
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>{dateLabel(tx.date)} · {tx.time}</div>
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: "var(--ink-3)", marginBottom: 10, padding: "10px 12px", background: tx.conf < 0.7 ? "var(--accent-soft)" : "var(--paper-2)", borderRadius: 6 }}>
          <Icon name="sparkle" size={14} stroke={tx.conf < 0.7 ? "var(--accent)" : "var(--ink-3)"}/>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--ink)", fontWeight: 500, fontSize: 12 }}>
              {tx.conf < 0.7 ? "Low confidence — review suggested" : "Auto-parsed by Moneyflow AI"}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>
              {tx.conf >= 0.9 ? "Merchant, amount and category all matched high-signal heuristics." : tx.conf >= 0.7 ? "Some fields inferred — tap to verify." : "New or unusual merchant. Please confirm category."}
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
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ ...inboxStyles.tagDot, background: TAGS[tx.tag].dot }}/>
            <span style={inboxStyles.fieldVal}>{TAGS[tx.tag].label}</span>
          </span>
        </div>
        <div style={inboxStyles.field}>
          <span style={inboxStyles.fieldLabel}>Paid with</span>
          <span style={inboxStyles.fieldVal}>{tx.paid}</span>
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
              {tx.method === "llm" && <Icon name="sparkle" size={10} stroke="var(--accent)"/>}
              {tx.method === "rule" && "📋"}
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
        <div style={{ padding: 14, background: "var(--paper-2)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, borderLeft: "2px solid var(--accent)" }}>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--ink-4)", marginBottom: 6 }}>{tx.subject}</div>
          {fetchedBody ? (
            <>
              <div style={{ fontSize: 10, color: "var(--pos)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
                <Icon name="check" size={10} stroke="var(--pos)"/> Body refreshed ({fetchedBody.length} chars)
              </div>
              <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{fetchedBody.slice(0, 2000)}{fetchedBody.length > 2000 ? "…" : ""}</div>
            </>
          ) : (
            tx.snippet || <span style={{ color: "var(--ink-4)", fontStyle: "italic" }}>No preview available</span>
          )}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 12, color: "var(--ink-3)", cursor: "pointer" }}>
          <input type="checkbox" checked={fetchBodyOn} onChange={e => setFetchBodyOn(e.target.checked)} style={{ accentColor: "var(--accent)" }} />
          Refresh body before recategorizing
        </label>
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Note</div>
        <textarea
          value={note}
          onChange={(e)=>setNote(e.target.value)}
          onBlur={()=>onUpdate({ note })}
          placeholder="Add context for yourself…"
          className="focus-ring"
          style={{ width: "100%", minHeight: 60, border: "1px solid var(--line)", borderRadius: 6, padding: 10, background: "var(--paper)", color: "var(--ink)", fontSize: 12, resize: "vertical", outline: "none", fontFamily: "inherit" }}
        />
      </div>

      </div>{/* end panelBody */}

      <div style={inboxStyles.panelFooter}>
        {reclass === "preview" && reclassResult && (
          <div className="fade-in" style={{ marginBottom: 10, padding: 14, background: "var(--paper-2)", borderRadius: 8, border: "1px solid var(--line)", fontSize: 12 }}>
            <div style={{ fontWeight: 600, color: "var(--ink)", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="sparkle" size={13} stroke="var(--accent)"/> AI found — does this look right?
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 16px", marginBottom: 12 }}>
              {[
                ["Label",    reclassResult.label || "—"],
                ["Amount",   reclassResult.amount != null ? `₹${Math.abs(reclassResult.amount).toLocaleString("en-IN")}` : "—"],
                ["Merchant", reclassResult.merchant || "—"],
                ["Category", reclassResult.category || "—"],
                ["Confidence", `${Math.round((reclassResult.confidence ?? 0) * 100)}%`],
                ["Date",     reclassResult.txn_date || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>{k}</div>
                  <div style={{ fontWeight: 500, color: "var(--ink)", marginTop: 2 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={()=>setReclass("idle")} style={{ flex: 1, padding: "8px 0", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Discard</button>
              <button onClick={handleConfirm} style={{ flex: 2, padding: "8px 0", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Apply changes</button>
            </div>
          </div>
        )}

        {reclass === "saving" && (
          <div style={{ marginBottom: 10, padding: 10, background: "var(--paper-2)", borderRadius: 8, fontSize: 12, color: "var(--ink-3)", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 12, height: 12, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite", flexShrink: 0 }}/>
            Saving…
          </div>
        )}

        {reclass === "done" && reclassResult && (
          <div className="fade-in" style={{ marginBottom: 10, padding: 10, background: "var(--pos-soft)", borderRadius: 8, border: "1px solid var(--pos)", fontSize: 12, color: "var(--pos)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="check" size={14} stroke="var(--pos)"/>
            Saved · {reclassResult.label} · {reclassResult.amount != null ? `₹${Math.abs(reclassResult.amount).toLocaleString("en-IN")}` : "no amount"} · {Math.round((reclassResult.confidence ?? 0) * 100)}% confidence
          </div>
        )}

        {reclass === "error" && (
          <div className="fade-in" style={{ marginBottom: 10, padding: 10, background: "var(--neg-soft)", borderRadius: 8, border: "1px solid var(--neg)", fontSize: 12, color: "var(--neg)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="x" size={14} stroke="var(--neg)"/> Recategorization failed — check server logs
          </div>
        )}

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
            <Icon name="sparkle" size={13} stroke={(reclass==="previewing"||reclass==="preview") ? "var(--ink-4)" : "currentColor"}/>
            {reclass === "previewing" ? "Classifying…" : "Recategorize"}
          </button>
        </div>
      </div>
    </aside>
  );
};

const TxCard = ({ tx, isPrimary, resolving, onResolve, pairId }) => {
  const fmtAmt = (amt) => amt != null ? `₹${Math.abs(amt).toLocaleString("en-IN")}` : "—";
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
    <div style={{ flex: 1, padding: "16px 18px", background: "var(--paper-2)", borderRadius: 8, border: isPrimary ? "2px solid var(--accent)" : "1px solid var(--line)" }}>
      {isPrimary && <div style={{ fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>Suggested primary</div>}
      <MerchantLogo merchant={tx.merchant || "?"} size={28}/>
      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{tx.merchant || "Unknown"}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{tx.email?.sender_domain || ""}</div>
      <div style={{ fontFamily: "'Geist Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 8 }}>{fmtAmt(tx.amount)}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{tx.txn_date || ""}</div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.email?.subject || ""}</div>

      <div style={{ marginTop: 10, padding: 10, background: "var(--paper)", borderRadius: 6, fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5, borderLeft: "2px solid var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Email body</span>
          <button onClick={handleFetchBody} disabled={fetching} style={{ fontSize: 10, padding: "2px 8px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", cursor: fetching ? "default" : "pointer" }}>
            {fetching ? "Fetching…" : "Fetch clean body"}
          </button>
        </div>
        {fetchedBody ? (
          <>
            <div style={{ fontSize: 10, color: "var(--pos)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}>
              <Icon name="check" size={10} stroke="var(--pos)"/> Body refreshed ({fetchedBody.length} chars)
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 200, overflowY: "auto" }}>{fetchedBody.slice(0, 2000)}{fetchedBody.length > 2000 ? "…" : ""}</div>
          </>
        ) : (
          <div style={{ color: "var(--ink-4)", fontStyle: "italic" }}>
            {tx.email?.body_snippet || "Click 'Fetch clean body' to load the full email text."}
          </div>
        )}
      </div>

      <button
        onClick={async ()=>{ if(resolving) return; await onResolve(pairId, "confirmed", tx.id); }}
        disabled={resolving}
        style={{ marginTop: 12, width: "100%", padding: "8px 0", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: resolving?"default":"pointer" }}>
        Keep this
      </button>
    </div>
  );
};

const DuplicatePairCard = ({ pair, onResolve }) => {
  const [resolving, setResolving] = React.useState(false);
  const { isMobile } = useViewport();
  return (
    <div style={{ padding: isMobile ? "16px 14px" : "20px 28px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        {pair.rule_source === "domain_pair" ? `Known pair · ${Math.round(pair.confidence * 100)}% confidence` : "Possible duplicate · same amount + date"}
      </div>
      <div style={{ display: "flex", gap: 12, flexDirection: isMobile ? "column" : "row" }}>
        <TxCard tx={pair.primary} isPrimary resolving={resolving} onResolve={async (...args) => { setResolving(true); await onResolve(...args); setResolving(false); }} pairId={pair.id} />
        <TxCard tx={pair.duplicate} isPrimary={false} resolving={resolving} onResolve={async (...args) => { setResolving(true); await onResolve(...args); setResolving(false); }} pairId={pair.id} />
      </div>
      <button
        onClick={async ()=>{ if(resolving) return; setResolving(true); await onResolve(pair.id, "dismissed", pair.primary.id); setResolving(false); }}
        disabled={resolving}
        style={{ marginTop: 10, padding: "6px 14px", border: "1px solid var(--line)", borderRadius: 6, background: "transparent", color: "var(--ink-3)", fontSize: 12, cursor: resolving?"default":"pointer" }}>
        Not a duplicate
      </button>
    </div>
  );
};

const IncomeRow = ({ tx, onUpdate }) => {
  const [toggling, setToggling] = React.useState(false);
  const { isMobile } = useViewport();
  const isPaid = tx.status === "confirmed";
  const monthLabel = tx.date ? new Date(tx.date + "T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" }) : "—";
  const dateLabel = tx.date ? new Date(tx.date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : "—";

  const togglePaid = async () => {
    if (toggling) return;
    setToggling(true);
    const newStatus = isPaid ? "needs_review" : "confirmed";
    onUpdate(tx.id, { status: newStatus, _skipApi: true });
    try {
      await API.patch(`/api/transactions/${tx.id}`, { status: newStatus });
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
        <span title="Received">✓</span>
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

const _looksLikeTx = (email) => {
  const text = `${email.subject || ""} ${email.body_snippet || ""}`;
  return /Rs\.?\s*[\d,]+|INR\s*[\d,]+|₹\s*[\d,]+|debited|credited|spent|purchased?|paid|refund|cashback|received.*(?:payment|amount|rupees)/i.test(text);
};

const ReviewEmailRow = ({ email, onKeep, onDiscard }) => {
  const [loading, setLoading] = React.useState(false);
  const [learned, setLearned] = React.useState(null);
  const looksLikeTx = React.useMemo(() => _looksLikeTx(email), [email]);

  const handleAction = async (action) => {
    setLoading(true);
    setLearned(null);
    try {
      await API.post(`/api/emails/${email.id}/review`, { action });
      if (action === "keep") { onKeep(email.id); setLearned("allowlisted"); }
      else { onDiscard(email.id); setLearned("blocklisted"); }
    } catch(e) {
      console.error("Review action failed", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--line)", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        {looksLikeTx && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)", flexShrink: 0 }} title="Looks like a transaction"/>}
        <span style={{ fontSize: 11, fontWeight: 600, color: looksLikeTx ? "var(--amber)" : "var(--ink-4)", background: looksLikeTx ? "color-mix(in srgb, var(--amber) 20%, transparent)" : "var(--paper-2)", border: `1px solid ${looksLikeTx ? "color-mix(in srgb, var(--amber) 40%, transparent)" : "var(--line)"}`, borderRadius: 4, padding: "1px 5px", textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0 }}>
          {looksLikeTx ? "Tx" : "Noise"}
        </span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.subject || "(no subject)"}</span>
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{email.sender || email.sender_domain || ""} {email.body_snippet ? `· ${email.body_snippet.slice(0, 120)}` : ""}</div>
      {learned && <div style={{ fontSize: 10, color: "var(--pos)", fontStyle: "italic" }}>✓ {email.sender_domain} {learned}</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
        <button disabled={loading} onClick={() => handleAction("keep")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--paper)", cursor: loading ? "wait" : "pointer", fontWeight: 500, opacity: loading ? 0.6 : 1 }}>Keep</button>
        <button disabled={loading} onClick={() => handleAction("discard")} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.6 : 1 }}>Discard</button>
      </div>
    </div>
  );
};

const GroupSection = ({ domain, emails, hasTxs, onKeep, onDiscard, collapsed: forceCollapsed }) => {
  const [collapsed, setCollapsed] = React.useState(!!forceCollapsed);
  const [busy, setBusy] = React.useState(false);
  const [confirmDiscard, setConfirmDiscard] = React.useState(false);

  React.useEffect(() => { setCollapsed(!!forceCollapsed); }, [forceCollapsed]);

  const handleDiscardAll = async () => {
    setBusy(true);
    for (const e of emails) {
      try {
        await API.post(`/api/emails/${e.id}/review`, { action: "discard" });
        onDiscard(e.id);
      } catch (_) {}
    }
    setBusy(false);
    setConfirmDiscard(false);
  };

  const handleKeepAll = async () => {
    setBusy(true);
    for (const e of emails) {
      try {
        await API.post(`/api/emails/${e.id}/review`, { action: "keep" });
        onKeep(e.id);
      } catch (_) {}
    }
    setBusy(false);
  };

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 7, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--paper-2)", borderBottom: collapsed ? "none" : "1px solid var(--line)", cursor: "pointer", userSelect: "none" }} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: 10, color: "var(--ink-4)", transition: "transform 120ms", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1, fontFamily: "'Geist Mono', monospace" }}>{domain}</span>
        <span style={{ fontSize: 10, color: "var(--ink-4)", padding: "1px 6px", borderRadius: 3, background: "var(--card)" }}>{emails.length}</span>
        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 3, background: hasTxs ? "var(--accent-soft)" : "var(--paper-2)", color: hasTxs ? "var(--accent)" : "var(--ink-4)" }}>{hasTxs ? `${emails.filter(e => _looksLikeTx(e)).length} tx` : "noise"}</span>
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={handleKeepAll} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--paper)", cursor: busy ? "wait" : "pointer", fontWeight: 500, opacity: busy ? 0.6 : 1 }}>Keep all</button>
          {!confirmDiscard ? (
            <button onClick={() => setConfirmDiscard(true)} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>Discard all</button>
          ) : (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {hasTxs ? (
                <span style={{ fontSize: 10, color: "var(--neg)", maxWidth: 180, lineHeight: 1.3 }}>{emails.filter(e => _looksLikeTx(e)).length} look like transactions. Discard anyway?</span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--ink-3)", maxWidth: 180, lineHeight: 1.3 }}>Discard {emails.length} email{emails.length > 1 ? "s" : ""}?</span>
              )}
              <button onClick={handleDiscardAll} disabled={busy} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, border: "none", background: "var(--neg)", color: "var(--paper)", cursor: "pointer", fontWeight: 600 }}>Yes</button>
              <button onClick={() => setConfirmDiscard(false)} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: "pointer" }}>No</button>
            </div>
          )}
        </div>
      </div>
      {!collapsed && emails.map(e => (
        <ReviewEmailRow key={e.id} email={e} onKeep={onKeep} onDiscard={onDiscard} />
      ))}
    </div>
  );
};

const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, dateRange, setDateRange = () => {}, loadMore = () => {}, totalTransactions = 0, loadingMore = false, reviewEmails = [], setReviewEmails = () => {} }) => {
  const { isMobile } = useViewport();
  const [pickerFor, setPickerFor] = React.useState(null); // tx id
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [selectMode, setSelectMode] = React.useState(false);
  const [selectAllFlag, setSelectAllFlag] = React.useState(false);
  const [collapsedAll, setCollapsedAll] = React.useState(null); // null=default, true=all collapsed, false=all expanded
  const [showFirstHint, setShowFirstHint] = React.useState(() => !localStorage.getItem("mf_hint_dismissed"));
  const listRef = React.useRef(null);

  // Date range presets
  const datePresets = [
    { label: "This Month", get: () => { const now = new Date(); return { from: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0], to: new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0] }; } },
    { label: "Last Month", get: () => { const now = new Date(); return { from: new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split("T")[0], to: new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split("T")[0] }; } },
    { label: "Last 7 Days", get: () => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate() - 7); return { from: d.toISOString().split("T")[0], to: now.toISOString().split("T")[0] }; } },
    { label: "Last 30 Days", get: () => { const now = new Date(); const d = new Date(now); d.setDate(d.getDate() - 30); return { from: d.toISOString().split("T")[0], to: now.toISOString().split("T")[0] }; } },
    { label: "All Time", get: () => ({ from: null, to: null }) },
  ];
  const currentPreset = datePresets.find(p => {
    const range = dateRange.from ? dateRange : datePresets[0].get();
    return range.from === p.get().from && range.to === p.get().to;
  }) || null;
  const [bulkReclassItems, setBulkReclassItems] = React.useState([]);  // each: { id, subject, snippet, current, preview, status }
  const [bulkReclassIdx, setBulkReclassIdx] = React.useState(0);       // index of currently-displayed item
  const [bulkManualOpen, setBulkManualOpen] = React.useState(false);
  const [bulkManualCat, setBulkManualCat] = React.useState("other");
  const [bulkManualLabel, setBulkManualLabel] = React.useState("expense");
  const [dupPairs, setDupPairs] = React.useState([]);
  const [dupLoading, setDupLoading] = React.useState(false);
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

  // Reset selection when switching filter tabs
  React.useEffect(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
    setSelectAllFlag(false);
  }, [filter]);

  React.useEffect(() => {
    if (filter !== "duplicates") return;
    setDupLoading(true);
    API.get("/api/duplicates?status=pending")
      .then(data => { setDupPairs(data); setDupLoading(false); })
      .catch(() => setDupLoading(false));
  }, [filter]);

  const loadMoreRef = React.useRef(loadMore);
  React.useEffect(() => { loadMoreRef.current = loadMore; }, [loadMore]);

  const autoLoadAttemptsRef = React.useRef(0);
  React.useEffect(() => { autoLoadAttemptsRef.current = 0; }, [filter]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100
          && transactions.length < totalTransactions
          && !loadingMore) {
        loadMoreRef.current();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [transactions.length, totalTransactions, loadingMore]);

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
      await API.post("/api/transactions/bulk", { ids: [], action, select_all: true }).catch(() => {});
    } else {
      const ids = [...selectedIds];
      setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? { ...t, ...localPatch } : t));
      clearSelect();
      await API.post("/api/transactions/bulk", { ids, action }).catch(() => {});
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
    await API.post("/api/transactions/bulk", { ids, action: "delete" }).catch(() => {});
  };

  const bulkDetectDuplicates = async () => {
    const ids = [...selectedIds];
    clearSelect();
    await API.post("/api/transactions/bulk", { ids, action: "detect_duplicates" }).catch(() => {});
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
      const result = await API.post(`/api/transactions/${itemsRef[idx].id}/reclassify/preview`);
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
      const result = await API.post(`/api/transactions/${item.id}/reclassify`);
      const isIncome = result.label === "income";
      const cat = normCat(result.category, isIncome);
      setTransactions(ts => ts.map(t => t.id === item.id ? {
        ...t,
        cat,
        amount: isIncome ? (result.amount || 0) : -(result.amount || 0),
        tag: isIncome ? "income" : cat === "sub" ? "subscription" : "expense",
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

  const bulkCloseReclass = () => {
    clearSelect();
    setBulkReclassItems([]);
  };

  const bulkManualApply = async () => {
    const apiPatch = { label: bulkManualLabel, category: bulkManualCat };
    await Promise.all([...selectedIds].map(id =>
      API.patch(`/api/transactions/${id}`, apiPatch).catch(() => {})
    ));
    setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? {
      ...t,
      cat: normCat(bulkManualCat, bulkManualLabel === "income"),
      tag: bulkManualLabel === "income" ? "income" : bulkManualCat === "sub" ? "subscription" : "expense",
    } : t));
    setBulkManualOpen(false);
    clearSelect();
  };

  const resolveDup = async (pairId, action, primaryTxId) => {
    try {
      await API.patch(`/api/duplicates/${pairId}`, { action, primary_tx_id: primaryTxId });
      setDupPairs(prev => prev.filter(p => p.id !== pairId));
    } catch (e) {
      console.error("resolve dup failed", e);
    }
  };

  const filtered = transactions.filter(t => {
    if (filter === "all") return true;
    if (filter === "expenses") return t.amount < 0 && t.tag !== "subscription";
    if (filter === "income") return t.amount > 0;
    if (filter === "sub") return t.tag === "subscription";
    if (filter === "flagged") return t.flag;
    if (filter === "low") return t.conf < 0.7;
    if (filter === "payments") return t.amount < 0 && ["rent","util","sub"].includes(t.cat);
    if (filter.startsWith("cat:")) return t.cat === filter.slice(4);
    return true;
  });

  const grouped = groupByDate(filtered);
  const selected = transactions.find(t => t.id === selectedId);

  // Dismiss first-visit hint on first interaction
  React.useEffect(() => { if (selectedId && showFirstHint) { setShowFirstHint(false); localStorage.setItem("mf_hint_dismissed", "1"); } }, [selectedId]);

  // Auto-load more when a filtered tab has fewer than 10 visible rows but
  // more data exists — capped at 3 attempts per tab to avoid chain-fetching
  // sparse tabs (e.g. income) that would exhaust all transactions.
  React.useEffect(() => {
    if (filter === "all" || filter === "duplicates") return;
    if (transactions.length >= totalTransactions) return;
    if (filtered.length >= 10) return;
    if (loadingMore) return;
    if (autoLoadAttemptsRef.current >= 3) return;
    autoLoadAttemptsRef.current += 1;
    loadMore();
  }, [filter, filtered.length, transactions.length, totalTransactions, loadingMore]);

  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }
    // Optimistic local update
    setTransactions(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi) return;
    // Persist to DB
    const apiPatch = {};
    if (patch.cat    !== undefined) apiPatch.category   = patch.cat;
    if (patch.note   !== undefined) apiPatch.user_notes = patch.note;
    if (patch.amount !== undefined) apiPatch.amount     = Math.abs(patch.amount);
    if (patch.read   !== undefined) apiPatch.read       = patch.read;
    if (patch.flag   !== undefined) apiPatch.flagged    = patch.flag;
    if (Object.keys(apiPatch).length > 0) {
      API.patch(`/api/transactions/${id}`, apiPatch).catch(err => console.error("patch failed:", err));
    }
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

  return (
    <>
      <div style={{ ...(selected && !isMobile ? inboxStyles.wrap : inboxStyles.wrapNoPanel), height: isMobile ? "calc(100dvh - 115px)" : (selected ? inboxStyles.wrap.height : inboxStyles.wrapNoPanel.height) }}>
        <div ref={listRef} style={{ ...inboxStyles.list, ...(isMobile ? { borderRight: "none" } : {}) }}>
          <div style={{ ...inboxStyles.toolbar, ...(isMobile ? { padding: "9px 14px", overflowX: "auto", alignItems: "center" } : {}) }}>
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
                {!selectAllFlag && selectedIds.size === filtered.length && filtered.length > 0 && transactions.length < totalTransactions && (
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
                  ["all","All", transactions.length],
                  ["expenses","Expenses"],
                  ["income","Income"],
                  ["sub","Subscriptions"],
                  ["flagged","Flagged"],
                  ["low","Low conf."],
                  ["duplicates","Duplicates"],
                  ["review","Pending", reviewEmails.length],
                ].map(([k,label,count]) => (
                  <button key={k} onClick={()=>setFilter(k)} style={{ ...inboxStyles.chip, ...(filter===k ? inboxStyles.chipActive : {}) }}>
                    {label}{count!=null && <span style={{ opacity: 0.6, fontFamily: "'Geist Mono', monospace" }}>{count}</span>}
                  </button>
                ))}
                <div style={{ flex: 1 }}/>
                <select
                  value={currentPreset?.label || "This Month"}
                  onChange={(e) => { const preset = datePresets.find(p => p.label === e.target.value); if (preset) setDateRange(preset.get()); }}
                  style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: "pointer" }}
                >
                  {datePresets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                {!isMobile && <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{filtered.length} transactions</span>}
                {!isMobile && selectedId && <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", display: "flex", alignItems: "center", gap: 4 }}>↑↓ <span style={{ opacity: 0.4 }}>·</span> Esc</span>}
              </>
            )}
          </div>

          {filter === "review" ? (
            <div>
              {reviewEmails.length === 0 ? (
                <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>No emails pending review.</div>
              ) : (
                <>
                <div style={{ display: "flex", gap: 8, padding: "8px 14px", borderBottom: "1px solid var(--line)", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--ink-3)", fontWeight: 500 }}>{reviewEmails.length} pending</span>
                  <div style={{ flex: 1 }}/>
                  <button onClick={() => setCollapsedAll(c => c === true ? null : true)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--line)", background: collapsedAll === true ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer" }}>Collapse all</button>
                  <button onClick={() => setCollapsedAll(c => c === false ? null : false)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--line)", background: collapsedAll === false ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer" }}>Expand all</button>
                </div>
                {(() => {
                  const groups = {};
                  reviewEmails.forEach(e => {
                    const domain = e.sender_domain || e.sender || "unknown";
                    if (!groups[domain]) groups[domain] = [];
                    groups[domain].push(e);
                  });
                  return Object.entries(groups).map(([domain, emails]) => {
                    const hasTxs = emails.some(_looksLikeTx);
                    return (
                      <GroupSection key={domain} domain={domain} emails={emails} hasTxs={hasTxs}
                        collapsed={collapsedAll}
                        onKeep={id => setReviewEmails(es => es.filter(e => e.id !== id))}
                        onDiscard={id => setReviewEmails(es => es.filter(e => e.id !== id))}
                      />
                    );
                  });
                })()}
                </>
              )}
            </div>
          ) : filter === "duplicates" ? (
            dupLoading ? (
              <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
            ) : dupPairs.length === 0 ? (
              <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>No pending duplicates — all clear.</div>
            ) : (
              dupPairs.map(pair => (
                <DuplicatePairCard key={pair.id} pair={pair} onResolve={resolveDup} />
              ))
            )
          ) : (
            <>
            {showFirstHint && filter === "all" && !selectedId && (
              <div style={{ padding: "12px 16px", margin: "8px 12px 4px", background: "var(--accent-soft)", borderRadius: 8, fontSize: 12, color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>Click a transaction to review and categorize it.</span>
                <button onClick={() => { setShowFirstHint(false); localStorage.setItem("mf_hint_dismissed", "1"); }} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--accent)", padding: 4, display: "flex", fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
            )}
            {grouped.map(([date, txs]) => {
            const dayTotal = txs.reduce((a,t)=>a+t.amount,0);
            return (
              <div key={date}>
                <div style={{ ...inboxStyles.dayLabel, ...(isMobile ? { padding: "16px 14px 7px", top: 41 } : {}) }}>
                  <span>{dateLabel(date)}</span>
                  <span style={inboxStyles.dayTotal}>
                    {dayTotal !== 0 && (dayTotal > 0 ? <span style={{color:"var(--pos)"}}>+₹{dayTotal.toLocaleString("en-IN")}</span> : <span>−₹{Math.abs(dayTotal).toLocaleString("en-IN")}</span>)}
                  </span>
                </div>
                {txs.map(tx => (
                  <Row
                    key={tx.id}
                    tx={tx}
                    selected={selectMode ? selectedIds.has(tx.id) : selectedId===tx.id}
                    selectMode={selectMode}
                    onRowClick={()=>{
                      if (selectMode) { toggleSelect(tx.id); }
                      else { setSelectedId(tx.id); updateTx(tx.id, { read: true }); }
                    }}
                    onCheckbox={()=>{ if (!selectMode) { setSelectMode(true); } toggleSelect(tx.id); }}
                    onEditCat={()=>setPickerFor(tx.id)}
                  />
                ))}
              </div>
            );
          })}
            </>
          )}
          {loadingMore && (
            <div style={{ padding: "20px 32px", display: "flex", justifyContent: "center" }}>
              <div style={{ width: 20, height: 20, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/>
            </div>
          )}
          {!loadingMore && transactions.length < totalTransactions && transactions.length > 0 && (
            <div style={{ padding: "16px 32px", textAlign: "center", fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
              {transactions.length} of {totalTransactions} · scroll for more
            </div>
          )}
        </div>

        {selected && <DetailPanel tx={selected} onClose={()=>setSelectedId(null)} onUpdate={(p)=>updateTx(selected.id, p)} />}
      </div>

      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: isMobile ? 12 : 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px -8px rgba(0,0,0,0.4)", zIndex: 50, fontSize: 13, fontWeight: 500, width: isMobile ? "calc(100vw - 24px)" : "auto", overflowX: isMobile ? "auto" : "visible" }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6 }}>{selectedIds.size} selected</span>
          <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Read</button>
          <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Unread</button>
          <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Flag</button>
          <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Unflag</button>
          <button onClick={bulkReclassify} disabled={bulkReclassItems.length > 0} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: bulkReclassItems.length > 0 ? "default" : "pointer", fontWeight: 500 }}>
            Recategorize (LLM)
          </button>
          <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>Recategorize (Manual)</button>
          <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Delete</button>
          <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Detect Duplicates</button>
          <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center" }}><Icon name="x" size={14} stroke="currentColor"/></button>
        </div>
      )}

      {bulkManualOpen && (
        <div onClick={()=>setBulkManualOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.2)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ position: "absolute", top: isMobile ? 80 : "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 20, width: isMobile ? "calc(100vw - 28px)" : 340, boxShadow: "0 20px 40px -20px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13 }}>Recategorize {selectedIds.size} transactions</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Label</div>
              <select value={bulkManualLabel} onChange={e=>setBulkManualLabel(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13 }}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
                <option value="ignore">Ignore</option>
              </select>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 4 }}>Category</div>
              <select value={bulkManualCat} onChange={e=>setBulkManualCat(e.target.value)} style={{ width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13 }}>
                {Object.entries(CATEGORIES).map(([k,c])=>(
                  <option key={k} value={k}>{c.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={()=>setBulkManualOpen(false)} style={{ flex: 1, padding: "9px 0", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={bulkManualApply} style={{ flex: 2, padding: "9px 0", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Apply to {selectedIds.size}</button>
            </div>
          </div>
        </div>
      )}

      {bulkReclassItems.length > 0 && (
        <div onClick={bulkCloseReclass} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.3)" }}>
          <div onClick={e => { if (e.target === e.currentTarget) return; e.stopPropagation(); }} style={{ position: "absolute", top: isMobile ? 60 : "15%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 0, width: isMobile ? "calc(100vw - 20px)" : 520, maxHeight: isMobile ? "calc(100dvh - 80px)" : "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px -20px rgba(0,0,0,0.4)" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Recategorize {bulkReclassItems.length} emails</span>
                <button onClick={bulkCloseReclass} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}><Icon name="x" size={14} stroke="currentColor"/></button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: "var(--line)", overflow: "hidden" }}>
                  {(() => {
                    const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing").length;
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
            </div>

            {/* Body */}
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
                  const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing").length;
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
                  return (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "40px 0", color: "var(--ink-3)", fontSize: 13 }}>
                      {item.status === "applying" ? (
                        <><div style={{ width: 16, height: 16, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/> Applying…</>
                      ) : (
                        "Loading next…"
                      )}
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

            {/* Footer */}
            {(() => {
              const item = bulkReclassItems[bulkReclassIdx];
              if (!item) return null;
              const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview").length;
              const isAllDone = done >= bulkReclassItems.length && item.status !== "preview";
              if (isAllDone) {
                return (
                  <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={bulkCloseReclass} style={{ flex: 1, padding: "9px 0", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, cursor: "pointer" }}>Close</button>
                  </div>
                );
              }
              if (item.status !== "preview") return null;
              return (
                <div style={{ padding: "12px 20px", borderTop: "1px solid var(--line)", display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={bulkSkipAll} style={{ padding: "9px 14px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-3)", fontSize: 12, cursor: "pointer" }}>
                    Skip all
                  </button>
                  <div style={{ flex: 1 }}/>
                  <button onClick={bulkSkip} style={{ padding: "9px 16px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, cursor: "pointer" }}>
                    Skip
                  </button>
                  <button onClick={bulkAccept} style={{ padding: "9px 20px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Accept & Next
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
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
        <div
          style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.4)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
          onClick={() => setShowShortcuts(false)}
        >
          <div
            style={{ background:"var(--card)", border:"1px solid var(--line)", borderRadius:12, padding:"28px 32px", maxWidth:360, width:"90%" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ fontFamily:"'Fraunces',serif", fontSize:18, fontWeight:500, marginBottom:16 }}>Keyboard shortcuts</div>
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
          </div>
        </div>
      )}
    </>
  );
};

const SearchView = ({ query }) => {
  const [results, setResults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(null);
  const [pickerFor, setPickerFor] = React.useState(null);
  const { isMobile } = useViewport();

  React.useEffect(() => {
    if (!query || query.trim().length < 2) return;
    setLoading(true);
    setSelectedId(null);
    API.get(`/api/search?q=${encodeURIComponent(query.trim())}&limit=200`)
      .then(d => setResults((d.items || []).map(transformTransaction)))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [query]);

  const updateTx = (id, patch) => {
    if (patch._openPicker) { setPickerFor(id); return; }
    setResults(rs => rs.map(t => t.id === id ? { ...t, ...patch } : t));
    if (patch._skipApi || patch._delete) return;
    const api = {};
    if (patch.cat    !== undefined) api.category   = patch.cat;
    if (patch.note   !== undefined) api.user_notes = patch.note;
    if (patch.amount !== undefined) api.amount     = Math.abs(patch.amount);
    if (patch.read   !== undefined) api.read       = patch.read;
    if (patch.flag   !== undefined) api.flagged    = patch.flag;
    if (Object.keys(api).length > 0)
      API.patch(`/api/transactions/${id}`, api).catch(e => console.error(e));
  };

  const grouped = groupByDate(results);
  const selected = results.find(t => t.id === selectedId);
  const wrapStyle = selected && !isMobile ? inboxStyles.wrap : inboxStyles.wrapNoPanel;

  return (
    <div style={{ ...wrapStyle, height: "calc(100vh - 72px)" }}>
      <div style={inboxStyles.list}>
        <div style={{ ...inboxStyles.toolbar }}>
          {loading
            ? <span>Searching…</span>
            : <span>{results.length} result{results.length !== 1 ? "s" : ""} for <strong style={{ color: "var(--ink)", fontWeight: 600 }}>"{query}"</strong></span>
          }
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 56 }}>
            <div style={{ width: 24, height: 24, border: "2px solid var(--line)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/>
          </div>
        )}

        {!loading && results.length === 0 && (
          <div style={{ padding: "72px 32px", textAlign: "center" }}>
            <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, color: "var(--ink-3)", marginBottom: 8 }}>No results</div>
            <div style={{ fontSize: 13, color: "var(--ink-4)" }}>Try a different merchant, category, or amount</div>
          </div>
        )}

        {!loading && grouped.map(([date, txs]) => (
          <div key={date}>
            <div style={{ ...inboxStyles.dayLabel, ...(isMobile ? { padding: "16px 14px 7px", top: 41 } : {}) }}>
              <span>{dateLabel(date)}</span>
            </div>
            {txs.map(tx => (
              <Row
                key={tx.id}
                tx={tx}
                selected={selectedId === tx.id}
                selectMode={false}
                onRowClick={() => { setSelectedId(tx.id); updateTx(tx.id, { read: true }); }}
                onCheckbox={() => {}}
                onEditCat={() => setPickerFor(tx.id)}
              />
            ))}
          </div>
        ))}
      </div>

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
};

Object.assign(window, { InboxView, SearchView, fmtMoney, MerchantLogo, CategoryChip, Confidence, dateLabel });
