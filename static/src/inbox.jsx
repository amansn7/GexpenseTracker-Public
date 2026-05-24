// Inbox view — Gmail-style transaction list + detail panel

const inboxStyles = {
  wrap: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 0, height: "calc(100dvh - 72px)", minHeight: 0 },
  wrapNoPanel: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", height: "calc(100dvh - 72px)" },
  list: { overflowY: "auto", borderRight: "1px solid var(--line)" },
  toolbar: { display: "flex", alignItems: "center", gap: 4, padding: "10px 32px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5, fontSize: 12, color: "var(--ink-3)" },
  chip: { padding: "5px 12px", borderRadius: 20, border: "1px solid transparent", background: "transparent", fontSize: 12, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500, cursor: "pointer", transition: "all 120ms ease", lineHeight: 1.2 },
  chipHover: { background: "var(--paper-2)" },
  chipActive: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },
  chipDivider: { width: 1, height: 16, background: "var(--line)", margin: "0 4px", flexShrink: 0 },
  chipCount: { opacity: 0.5, fontFamily: "'Geist Mono', monospace", fontSize: 11, fontVariantNumeric: "tabular-nums" },
  chipIcon: { opacity: 0.7 },

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
  const c = catDisplay(cat);
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
          {tx.amount === 0 ? "—" : `${isIncome ? "+" : "−"}₹${Math.abs(tx.amount).toLocaleString("en-IN")}`}
        </span>
      </div>
    </div>
  );
};

const CategoryPicker = ({ current, onPick, onClose }) => {
  const { isMobile } = useViewport();

  const groups = CategoryService.grouped();

  return (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100 }}>
    <div onClick={(e)=>e.stopPropagation()} className="fade-in" style={{ position: "absolute", top: isMobile ? 72 : "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 8, width: isMobile ? "calc(100vw - 28px)" : 320, maxHeight: "60vh", overflowY: "auto", boxShadow: "0 20px 40px -20px var(--shadow-lg)" }}>
      <div style={{ padding: "8px 10px 10px", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", display:"flex", alignItems:"center", gap: 8 }}>
        <Icon name="sparkle" size={12} stroke="var(--accent)"/> Recategorize — teaches the model
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
  const [reclassMethod, setReclassMethod] = React.useState(() => localStorage.getItem("_reclass_method") || "llm");

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
      if (fetchBodyOn) await handleFetchBody();
      const result = await API.post(`/api/transactions/${tx.id}/reclassify/preview?method=${reclassMethod}`);
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
      const result = await API.post(`/api/transactions/${tx.id}/reclassify?method=${reclassMethod}`);
      setReclassResult(result);
      setReclass("done");
      // Map API _fmt response → UI tx fields via normCat, then update parent (no extra PATCH)
      const isIgnore = result.label === "ignore";
      const isIncome = result.label === "income";
      const cat = normCat(result.category, isIncome);
      const isSub = cat === "sub";
      onUpdate({
        _skipApi: true,
        amount:   isIgnore ? 0 : isIncome ? (result.amount || 0) : -(result.amount || 0),
        cat,
        tag:      isIgnore ? "ignore" : isIncome ? "income" : isSub ? "subscription" : "expense",
        conf:     result.confidence ?? tx.conf,
        merchant: result.merchant || tx.merchant,
      });
      if (result.learned_rule) {
        showToast(<span><Icon name="check" size={12} stroke="var(--pos)"/> Learned: {result.learned_rule.domain} → {result.learned_rule.label} / {result.learned_rule.category}</span>);
      }
    } catch (e) {
      setReclass("error");
    }
  };

  const [saving, setSaving] = React.useState(false);

  const saveAmt = () => {
    const n = parseFloat(amtDraft) || 0;
    setSaving(true);
    onUpdate({ amount: isIncome ? n : -n });
    setEditingAmt(false);
    setTimeout(() => setSaving(false), 600);
  };

  return (
    <aside style={{ ...inboxStyles.panel, ...(isMobile ? { position: "fixed", inset: 0, zIndex: 65, padding: "18px 18px 0", height: "100dvh", borderLeft: "none" } : {}) }} className="slide-in-right" key={tx.id}>
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
          <div onClick={()=>setEditingAmt(true)} className="hover-border-bottom" style={{ cursor: "text", display: "inline-block" }}>
            <div style={{ ...inboxStyles.bigAmount, ...(isMobile ? { fontSize: 40 } : {}), color: isIncome ? "var(--pos)" : "var(--ink)" }}>
              {sign}₹{Math.abs(tx.amount).toLocaleString("en-IN")}
            </div>
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}>
          {dateLabel(tx.date)} · {tx.time}
          {saving && (
            <span style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 4 }}>
              <span className="spinner-xs" />
              Saving…
            </span>
          )}
        </div>
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
          <span
            onClick={() => {
              const order = ["expense", "income", "ignore"];
              const idx = order.indexOf(tx.tag);
              onUpdate({ tag: order[(idx + 1) % order.length] });
            }}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            title="Click to cycle: expense → income → ignore"
          >
            <span style={{ ...inboxStyles.tagDot, background: TAGS[tx.tag].dot }}/>
            <span style={inboxStyles.fieldVal}>{TAGS[tx.tag].label}</span>
          </span>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Note</div>
          {saving && (
            <span style={{ fontSize: 10, color: "var(--ink-4)", display: "flex", alignItems: "center", gap: 4 }}>
              <span className="spinner-xs" />
              Saving…
            </span>
          )}
        </div>
        <textarea
          value={note}
          onChange={(e)=>setNote(e.target.value)}
          onBlur={()=>{ setSaving(true); onUpdate({ note }); setTimeout(()=>setSaving(false), 600); }}
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
              <Icon name={reclassMethod === "rules" ? "check" : "sparkle"} size={13} stroke="var(--accent)"/> {reclassMethod === "rules" ? "Rules found" : "AI found"} — does this look right?
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
            <span className="spinner-sm" />
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
            <Icon name={reclassMethod === "rules" ? "check" : "sparkle"} size={13} stroke={(reclass==="previewing"||reclass==="preview") ? "var(--ink-4)" : "currentColor"}/>
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
                <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflowY: "auto" }}>{fetchedBody.slice(0, 2000)}{fetchedBody.length > 2000 ? "…" : ""}</div>
              </>
            ) : (
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                <div style={{ fontSize: 11, color: "var(--ink-4)", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{tx.email?.body_snippet}</div>
                <button onClick={handleFetchBody} disabled={fetching} className="focus-ring" style={{ flexShrink: 0, fontSize: 10, padding: "2px 7px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", cursor: fetching ? "default" : "pointer" }}>
                  {fetching ? "…" : "Full"}
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
    ? "Investment flow — order + confirmation"
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

const _looksLikeTx = (email) => {
  const text = `${email.subject || ""} ${email.body_snippet || ""}`;
  return /Rs\.?\s*[\d,]+|INR\s*[\d,]+|₹\s*[\d,]+|debited|credited|spent|purchased?|paid|refund|cashback|received.*(?:payment|amount|rupees)/i.test(text);
};

const ReviewEmailRow = ({ email, onKeep, onDiscard, isFocused, isSelected, onFocus, onToggleSelect, previewId, onTogglePreview }) => {
  const looksLikeTx = React.useMemo(() => _looksLikeTx(email), [email]);
  const rowRef = React.useRef(null);
  const [hovered, setHovered] = React.useState(false);

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
    <div ref={rowRef} tabIndex={0}
      onClick={() => { onFocus(); onTogglePreview(); }}
      onKeyDown={e => { if (e.key === "Enter") { onFocus(); onTogglePreview(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px",
        borderBottom: "1px solid var(--line)", cursor: "pointer",
        background: isSelected ? "var(--paper-2)" : hovered ? "var(--paper-2)" : "transparent",
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
    for (const e of emails) {
      try { await API.post(`/api/emails/${e.id}/review`, { action: "discard" }); } catch (_) {}
      onDiscard(e.id);
    }
    setBusy(false);
    setConfirmDiscard(false);
  };

  const handleKeepAll = async () => {
    setBusy(true);
    for (const e of emails) {
      try { await API.post(`/api/emails/${e.id}/review`, { action: "keep" }); } catch (_) {}
      onKeep(e.id);
    }
    setBusy(false);
  };

  const allSelected = emails.every(e => selectedIds?.has(e.id));
  const emailIds = emails.map(e => e.id);

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, marginBottom: 10, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--paper-2)", borderBottom: collapsed ? "none" : "1px solid var(--line)", cursor: "pointer", userSelect: "none" }} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontSize: 10, color: "var(--ink-4)", transition: "transform 120ms", transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}>▼</span>
        <input type="checkbox" checked={allSelected} onChange={e => { e.stopPropagation(); allSelected ? onClearSelect(emailIds) : onSelectAll(emailIds); }} onClick={e => e.stopPropagation()}
          style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", flex: 1, fontFamily: "'Geist Mono', monospace" }}>{domain}</span>
        <span style={{ fontSize: 10, color: "var(--ink-4)", padding: "1px 6px", borderRadius: 6, background: "var(--card)" }}>{emails.length}</span>
        {(() => { const c = [...selectedIds].filter(id => emails.some(e => e.id === id)).length; if (c === 0) return null; return <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "'Geist Mono', monospace", fontWeight: 600 }}>({c})</span>; })()}
        <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 6, background: hasTxs ? "var(--accent-soft)" : "var(--paper-2)", color: hasTxs ? "var(--accent)" : "var(--ink-4)" }}>{hasTxs ? `${emails.filter(e => _looksLikeTx(e)).length} tx` : "noise"}</span>
        <div style={{ display: "flex", gap: 4 }} onClick={e => e.stopPropagation()}>
          <button onClick={handleKeepAll} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, background: "var(--accent)", color: "var(--paper)", cursor: busy ? "wait" : "pointer", fontWeight: 500, opacity: busy ? 0.6 : 1 }}>Keep all</button>
          {!confirmDiscard ? (
            <button onClick={() => setConfirmDiscard(true)} disabled={busy} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: busy ? "wait" : "pointer", opacity: busy ? 0.6 : 1 }}>Discard all</button>
          ) : (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {hasTxs ? (
                <span style={{ fontSize: 10, color: "var(--neg)", maxWidth: 180, lineHeight: 1.3 }}>{emails.filter(e => _looksLikeTx(e)).length} look like transactions. Discard anyway?</span>
              ) : (
                <span style={{ fontSize: 10, color: "var(--ink-3)", maxWidth: 180, lineHeight: 1.3 }}>Discard {emails.length} email{emails.length > 1 ? "s" : ""}?</span>
              )}
              <button onClick={handleDiscardAll} disabled={busy} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: "var(--neg)", color: "var(--paper)", cursor: "pointer", fontWeight: 600 }}>Yes</button>
              <button onClick={() => setConfirmDiscard(false)} style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: "pointer" }}>No</button>
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

const FilterChip = ({ label, icon, count, active, onClick }) => {
  const [hovered, setHovered] = React.useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...inboxStyles.chip,
        ...(active ? inboxStyles.chipActive : {}),
        ...(!active && hovered ? inboxStyles.chipHover : {}),
      }}
    >
      {icon && <Icon name={icon} size={13} stroke={active ? "currentColor" : "var(--ink-4)"} style={inboxStyles.chipIcon} />}
      {label}
      {count != null && <span style={inboxStyles.chipCount}>{count}</span>}
    </button>
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
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>{email.sender || email.sender_domain || "—"}</div>
        {email.received_at && (
          <div style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>
            {new Date(email.received_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>

      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--ink)", marginBottom: 16, fontFamily: "'Fraunces', serif", lineHeight: 1.3 }}>
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
            {fullBody.slice(0, 3000)}{fullBody.length > 3000 ? "…" : ""}
          </div>
        ) : (
          <div style={{ padding: 12, background: "var(--paper)", borderRadius: 6, border: "1px solid var(--line)", fontSize: 12, color: "var(--ink-4)", lineHeight: 1.5 }}>
            {email.body_snippet || "No preview available"}
            {!fullBody && (
              <button onClick={handleFetchBody} disabled={fetchingBody} style={{ marginLeft: 8, fontSize: 10, padding: "2px 8px", border: "1px solid var(--line)", borderRadius: 4, background: "transparent", color: "var(--ink-3)", cursor: fetchingBody ? "default" : "pointer" }}>
                {fetchingBody ? "Loading…" : "Load full body"}
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <button disabled={loading} onClick={() => handleAction("keep")} style={{ flex: 1, fontSize: 12, padding: "8px 16px", borderRadius: 6, border: "1px solid var(--accent)", background: "var(--accent)", color: "var(--paper)", cursor: loading ? "wait" : "pointer", fontWeight: 600, opacity: loading ? 0.6 : 1 }}>
          Keep as transaction
        </button>
        <button disabled={loading} onClick={() => handleAction("discard")} style={{ flex: 1, fontSize: 12, padding: "8px 16px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: loading ? "wait" : "pointer", fontWeight: 500, opacity: loading ? 0.6 : 1 }}>
          Discard as noise
        </button>
      </div>
      {learned && <div style={{ fontSize: 11, color: "var(--pos)", marginTop: 8 }}><Icon name="check" size={10} stroke="var(--pos)"/> {email.sender_domain} {learned}</div>}
    </div>
  );
};

const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, categoryFilter, dateRange, setDateRange = () => {}, loadMore = () => {}, loadData = () => {}, totalTransactions = 0, loadingMore = false, reviewEmails = [], setReviewEmails = () => {} }) => {
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
  const listRef = React.useRef(null);

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
    }
  };

  const handleClearSessionStats = () => {
    const stats = { ...reviewSessionStats };
    setLastSessionStats(stats);
    localStorage.setItem("mf_review_last_session", JSON.stringify(stats));
    setReviewSessionStats({ kept: 0, discarded: 0, startedAt: Date.now() });
    showToast("Session complete — nice work!");
  };

  // Date range presets
  var datePresets = DateUtils.DATE_PRESETS;
  const currentPreset = datePresets.find(p => {
    const range = dateRange.from ? dateRange : datePresets[0].get();
    return range.from === p.get().from && range.to === p.get().to;
  }) || null;
  const [bulkReclassItems, setBulkReclassItems] = React.useState([]);  // each: { id, subject, snippet, current, preview, status }
  const [bulkReclassIdx, setBulkReclassIdx] = React.useState(0);       // index of currently-displayed item
  const [bulkManualOpen, setBulkManualOpen] = React.useState(false);
  const [bulkManualCat, setBulkManualCat] = React.useState("other");
  const [bulkManualLabel, setBulkManualLabel] = React.useState("expense");
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
  }, [filter, dupTab, dupSelected.size]);

  // Keyboard shortcuts for review (pending) tab
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

  // Fetch needs_review count from legacy review queue
  React.useEffect(() => {
    API.get("/api/review?count=true")
      .then(data => setNeedsReviewCount(data?.count ?? null))
      .catch(() => {});
  }, []);

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
      try {
        await API.post("/api/transactions/bulk", { ids: [], action, select_all: true });
      } catch (err) {
        console.error("bulk action failed:", err);
        showToast(`Bulk ${action} failed — check connection and try again`);
      }
    } else {
      const ids = [...selectedIds];
      setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? { ...t, ...localPatch } : t));
      clearSelect();
      try {
        await API.post("/api/transactions/bulk", { ids, action });
      } catch (err) {
        console.error("bulk action failed:", err);
        showToast(`Bulk ${action} failed — check connection and try again`);
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
      showToast("Bulk delete failed — check connection and try again");
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
      tag: bulkManualLabel === "ignore" ? "ignore" : bulkManualLabel === "income" ? "income" : bulkManualCat === "sub" ? "subscription" : "expense",
    } : t));
    setBulkManualOpen(false);
    clearSelect();
  };

  const resolveDup = async (pairId, action, primaryTxId) => {
    try {
      await API.patch(`/api/duplicates/${pairId}`, { action, primary_tx_id: primaryTxId });
      setDupPairs(prev => prev.filter(p => p.id !== pairId));
      setDupSelected(prev => { const n = new Set(prev); n.delete(pairId); return n; });
    } catch (e) {
      console.error("resolve dup failed", e);
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
    setDupSelected(new Set());
    setDupBulkResolving(false);
  };

  const filtered = transactions.filter(t => {
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
    if (patch._skipApi) return;

    // Build API patch object
    const apiPatch = {};
    if (patch.tag   !== undefined) apiPatch.label     = patch.tag;
    if (patch.cat    !== undefined) apiPatch.category   = patch.cat;
    if (patch.note   !== undefined) apiPatch.user_notes = patch.note;
    if (patch.amount !== undefined) apiPatch.amount     = Math.abs(patch.amount);
    if (patch.read   !== undefined) apiPatch.read       = patch.read;
    if (patch.flag   !== undefined) apiPatch.flagged    = patch.flag;
    if (patch.status !== undefined) apiPatch.status     = patch.status;
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
        })
        .catch(err => {
          console.error("patch failed:", err);
          // Rollback optimistic update
          if (prevSnapshot) {
            setTransactions(ts => ts.map(t => t.id === id ? { ...prevSnapshot } : t));
          }
          showToast("Save failed — check connection and try again");
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
                  ["all","All", "grid", transactions.length],
                  ["expenses","Expenses", "bag"],
                  ["income","Income", "trend-u"],
                ].map(([k,label,icon,count]) => (
                  <FilterChip key={k} label={label} icon={icon} count={count} active={filter===k} onClick={()=>setFilter(k)} />
                ))}
                <div style={inboxStyles.chipDivider} />
                {[
                  ["sub","Subscriptions", "repeat"],
                  ["flagged","Flagged", "star"],
                  ["low","Low confidence", "sparkle"],
                  ["needs_review","Needs review", "alert-circle", transactions.filter(t => t.status === "needs_review" && t.tag !== "ignore").length],
                  ["duplicates","Duplicates", "arrow-swap"],
                  ["review","Pending", "inbox", reviewEmails.length],
                ].map(([k,label,icon,count]) => (
                  <FilterChip key={k} label={label} icon={icon} count={count} active={filter===k} onClick={()=>setFilter(k)} />
                ))}
                <div style={{ flex: 1 }}/>
                <select
                  value={currentPreset?.label || "This Month"}
                  onChange={(e) => { const preset = datePresets.find(p => p.label === e.target.value); if (preset) setDateRange(preset.get()); }}
                  style={{ fontSize: 11, padding: "5px 24px 5px 8px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-3)", cursor: "pointer", appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2378736a' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {datePresets.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
                </select>
                {!isMobile && <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", marginLeft: 4 }}>{filtered.length} transactions</span>}
                {!isMobile && selectedId && <span style={{ fontSize: 10, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace", display: "flex", alignItems: "center", gap: 4, marginLeft: 4 }}>↑↓ <span style={{ opacity: 0.4 }}>·</span> Esc</span>}
              </>
            )}
          </div>

          {filter === "review" ? (
            <div>
              {reviewEmails.length === 0 ? (
                <div style={{ padding: "64px 32px", textAlign: "center" }}>
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
                    <button onClick={() => setFilter("all")} style={{ fontSize: 12, padding: "8px 18px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: "pointer", fontWeight: 500 }}>
                      View transactions
                    </button>
                    {needsReviewCount > 0 && (
                      <button onClick={() => setFilter("needs_review")} style={{ fontSize: 12, padding: "8px 18px", borderRadius: 6, border: "1px solid var(--line)", background: "var(--paper)", color: "var(--ink-2)", cursor: "pointer", fontWeight: 500 }}>
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
                <div style={{ display: "grid", gridTemplateColumns: "minmax(360px, 1fr) minmax(0, 420px)", height: "calc(100dvh - 164px)", overflow: "hidden" }}>
                  <div style={{ overflowY: "auto", borderRight: "1px solid var(--line)" }}>
                    {/* Progress/scale header */}
                    <div style={{ display: "flex", gap: 12, padding: "10px 14px", borderBottom: "1px solid var(--line)", alignItems: "center", background: "var(--paper-2)" }}>
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
                      <button onClick={() => setCollapsedAll(c => c === true ? null : true)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: collapsedAll === true ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer" }}>Collapse all</button>
                      <button onClick={() => setCollapsedAll(c => c === false ? null : false)} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, border: "1px solid var(--line)", background: collapsedAll === false ? "var(--paper-2)" : "var(--card)", color: "var(--ink-2)", cursor: "pointer" }}>Expand all</button>
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
                      return (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", color: "var(--ink-4)", fontSize: 13 }}>
                          Select an email to review
                        </div>
                      );
                    }
                    return (
                      <div style={{ overflowY: "auto", background: "var(--card)", padding: "24px" }}>
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
            <div style={{ padding: "10px 16px 10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--line)" }}>
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
                          transition: "all 120ms ease",
                        }}>
                        {tab}{count > 0 ? ` (${count})` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {dupTab === "pending" && dupSelected.size > 0 && (
                  <>
                    <button onClick={() => bulkResolveDups("confirmed")} disabled={dupBulkResolving}
                      style={{ padding: "4px 10px", border: "none", borderRadius: 4, background: "var(--pos)", color: "white", fontSize: 11, fontWeight: 600, cursor: dupBulkResolving ? "default" : "pointer" }}>
                      Confirm {dupSelected.size}
                    </button>
                    <button onClick={() => bulkResolveDups("dismissed")} disabled={dupBulkResolving}
                      style={{ padding: "4px 10px", border: "none", borderRadius: 4, background: "var(--neg)", color: "white", fontSize: 11, fontWeight: 600, cursor: dupBulkResolving ? "default" : "pointer" }}>
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
                    showToast("Scan failed — check server logs");
                  }
                  setDupScanning(false);
                }} disabled={dupScanning}
                  className="focus-ring"
                  style={{ padding: "6px 14px", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 500, cursor: dupScanning ? "default" : "pointer", opacity: dupScanning ? 0.6 : 1, display: "flex", alignItems: "center", gap: 6 }}>
                  {dupScanning ? <><div style={{ width: 11, height: 11, border: "2px solid var(--ink-3)", borderTopColor: "var(--paper)", borderRadius: "50%", animation: "spin 700ms linear infinite" }}/> Scanning…</> : "Run scan"}
                </button>
              </div>
            </div>
            {dupTab === "pending" ? (<>
              {dupBulkResult && (
                <div style={{ margin: "8px 12px", padding: "12px 16px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 8, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Scan results — {dupBulkResult.checked} transactions checked</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
                      {dupBulkResult.same_domain_exact > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain_exact}</strong></span>}
                      {dupBulkResult.same_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain}</strong></span>}
                      {dupBulkResult.merchant_alias > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Merchant alias: <strong>{dupBulkResult.merchant_alias}</strong></span>}
                      {dupBulkResult.investment_flow > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Investment flow: <strong>{dupBulkResult.investment_flow}</strong></span>}
                      {dupBulkResult.cross_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Cross-domain: <strong>{dupBulkResult.cross_domain}</strong></span>}
                      {dupBulkResult.existing_pairs > 0 && <span style={{ fontSize: 11, color: "var(--amber-9)" }}>{dupBulkResult.existing_pairs} pair{dupBulkResult.existing_pairs > 1 ? "s" : ""} already in DB</span>}
                      {dupBulkResult.already_paired > 0 && <span style={{ fontSize: 11, color: "var(--amber-9)" }}>{dupBulkResult.already_paired} potential match{dupBulkResult.already_paired > 1 ? "es" : ""} already paired</span>}
                      {(!dupBulkResult.same_domain_exact && !dupBulkResult.same_domain && !dupBulkResult.merchant_alias && !dupBulkResult.investment_flow && !dupBulkResult.cross_domain && !dupBulkResult.existing_pairs && !dupBulkResult.already_paired) && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>No matches found</span>}
                    </div>
                  </div>
                  <button onClick={() => setDupBulkResult(null)}
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 2, fontSize: 14, lineHeight: 1, flexShrink: 0 }}>×</button>
                </div>
              )}
              {dupLoading && !dupScanning ? (
                <div style={{ padding: "56px 32px", display: "flex", justifyContent: "center" }}>
                  <span className="spinner-md" />
                </div>
              ) : dupScanning ? (
                <div style={{ padding: "56px 32px", textAlign: "center" }}>
                  <span className="spinner-md" style={{ margin: "0 auto 12px" }} />
                  <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Scanning expenses for duplicates…</div>
                </div>
              ) : dupPairs.length === 0 ? (
                <div style={{ padding: "64px 32px", textAlign: "center" }}>
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
                  <div key={pair.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "4px 16px 4px 12px", borderBottom: "1px solid var(--line)" }}>
                    <input type="checkbox" checked={dupSelected.has(pair.id)} onChange={e => {
                      setDupSelected(prev => { const n = new Set(prev); e.target.checked ? n.add(pair.id) : n.delete(pair.id); return n; });
                    }} style={{ marginTop: 22, accentColor: "var(--accent)", cursor: "pointer", flexShrink: 0 }} />
                    <div style={{ flex: 1 }}><DuplicatePairCard pair={pair} onResolve={resolveDup} isNew={isNew} /></div>
                  </div>);
                })
              )}
            </>) : dupResolvedLoading ? (
              <div style={{ padding: "56px 32px", display: "flex", justifyContent: "center" }}>
                <span className="spinner-md" />
              </div>
            ) : dupResolved.length === 0 ? (
              <div style={{ padding: "64px 32px", textAlign: "center" }}>
                <div style={{ fontSize: 13, color: "var(--ink-3)" }}>No resolved duplicates yet.</div>
              </div>
            ) : (
              dupResolved.map(pair => {
                const fmtAmt = (amt) => amt != null ? `₹${Math.abs(amt).toLocaleString("en-IN")}` : "—";
                const statusColor = pair.status === "confirmed" ? "var(--pos)" : pair.status === "dismissed" ? "var(--neg)" : "var(--ink-3)";
                return (
                  <div key={pair.id} style={{ padding: "14px 24px", borderBottom: "1px solid var(--line)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
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
                        style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: "var(--paper)", color: "var(--ink-3)", fontSize: 11, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>
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
            {grouped.map(([date, txs]) => {
            const dayTotal = txs.reduce((a,t)=>a+t.amount,0);
            const allSelected = txs.every(t => selectedIds.has(t.id));
            const someSelected = txs.some(t => selectedIds.has(t.id));
            return (
              <div key={date}>
                <div
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
                  style={{ ...inboxStyles.dayLabel, ...(isMobile ? { padding: "16px 14px 7px", top: 41 } : {}), cursor: "pointer", userSelect: "none" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {selectMode && (
                      <span style={{
                        width: 14, height: 14, borderRadius: 3,
                        border: `1.5px solid ${allSelected ? "var(--accent)" : someSelected ? "var(--ink-3)" : "var(--line)"}`,
                        background: allSelected ? "var(--accent)" : "transparent",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 120ms ease",
                      }}>
                        {allSelected && <Icon name="check" size={10} stroke="var(--paper)" />}
                      </span>
                    )}
                    {dateLabel(date)}
                  </span>
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
              <span className="spinner-md" />
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
        <div style={{ position: "fixed", bottom: isMobile ? 12 : 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px -8px var(--shadow-lg)", zIndex: 50, fontSize: 13, fontWeight: 500, width: isMobile ? "calc(100vw - 24px)" : "auto", overflowX: isMobile ? "auto" : "visible" }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6 }}>{selectAllFlag ? totalTransactions : selectedIds.size} selected</span>
          <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Read</button>
          <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Unread</button>
          <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Flag</button>
          <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Unflag</button>
          <button onClick={bulkReclassify} disabled={bulkReclassItems.length > 0} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: bulkReclassItems.length > 0 ? "default" : "pointer", fontWeight: 500 }}>
            Recategorize (LLM)
          </button>
          <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500, whiteSpace: "nowrap" }}>Recategorize (Manual)</button>
          <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Delete</button>
          <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Detect Duplicates</button>
          {bulkDetectError && <span style={{ fontSize: 11, color: "var(--neg)" }}>{bulkDetectError}</span>}
          <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "flex", alignItems: "center" }}><Icon name="x" size={14} stroke="currentColor"/></button>
        </div>
      )}

      {bulkManualOpen && (
        <div onClick={()=>setBulkManualOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--overlay)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ position: "absolute", top: isMobile ? 80 : "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 20, width: isMobile ? "calc(100vw - 28px)" : 340, boxShadow: "0 20px 40px -20px var(--shadow-lg)" }}>
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13 }}>Recategorize {selectAllFlag ? totalTransactions : selectedIds.size} transactions</div>
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
              <button onClick={bulkManualApply} style={{ flex: 2, padding: "9px 0", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Apply to {selectAllFlag ? totalTransactions : selectedIds.size}</button>
            </div>
          </div>
        </div>
      )}

      {bulkReclassItems.length > 0 && (
        <div onClick={bulkCloseReclass} style={{ position: "fixed", inset: 0, zIndex: 100, background: "var(--overlay)" }}>
          <div onClick={e => { if (e.target === e.currentTarget) return; e.stopPropagation(); }} style={{ position: "absolute", top: isMobile ? 60 : "15%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 0, width: isMobile ? "calc(100vw - 20px)" : 520, maxHeight: isMobile ? "calc(100dvh - 80px)" : "70vh", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px -20px var(--shadow-lg)" }}>
            {/* Header */}
            <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--line)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Recategorize {bulkReclassItems.length} emails</span>
                <button onClick={bulkCloseReclass} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex" }}><Icon name="x" size={14} stroke="currentColor"/></button>
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
                  background: "var(--ink)", borderRadius: 3, transition: "transform 200ms ease",
                  transform: `translateX(${bulkMethod === "llm" ? "0%" : "100%"})`,
                }} />
                <div style={{ flex: 1, padding: "2px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, color: bulkMethod === "llm" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>LLM</div>
                <div style={{ flex: 1, padding: "2px 8px", textAlign: "center", fontSize: 10, fontWeight: 600, color: bulkMethod === "rules" ? "var(--paper)" : "var(--ink-3)", position: "relative", zIndex: 1 }}>Rules</div>
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

            {/* Footer */}
            {(() => {
              const item = bulkReclassItems[bulkReclassIdx];
              if (!item) return null;
              const done = bulkReclassItems.filter(it => it.status !== "pending" && it.status !== "previewing" && it.status !== "preview" && it.status !== "applying").length;
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
                  <button onClick={bulkAcceptAll} style={{ padding: "9px 14px", border: "1px solid var(--accent)", borderRadius: 6, background: "var(--accent-soft)", color: "var(--accent)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Accept all
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
          style={{ position:"fixed", inset:0, background:"var(--overlay)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:200 }}
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
    </>
  );
};

const SearchView = ({ query, categoryFilter }) => {
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
    if (patch.tag   !== undefined) api.label       = patch.tag;
    if (patch.cat    !== undefined) api.category   = patch.cat;
    if (patch.note   !== undefined) api.user_notes = patch.note;
    if (patch.amount !== undefined) api.amount     = Math.abs(patch.amount);
    if (patch.read   !== undefined) api.read       = patch.read;
    if (patch.flag   !== undefined) api.flagged    = patch.flag;
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
          showToast("Save failed — check connection and try again");
        });
  };

  const grouped = groupByDate(results);
  const selected = results.find(t => t.id === selectedId);
  const wrapStyle = selected && !isMobile ? inboxStyles.wrap : inboxStyles.wrapNoPanel;

  return (
    <div style={{ ...wrapStyle, height: "calc(100dvh - 72px)" }}>
      <div style={inboxStyles.list}>
        <div style={{ ...inboxStyles.toolbar }}>
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
              <button onClick={clearSelect} style={{ marginLeft: "auto", padding: "4px 8px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", fontSize: 11 }}>Cancel</button>
            </>
          ) : (
            loading
              ? <span>Searching…</span>
              : <span>{results.length} result{results.length !== 1 ? "s" : ""} for <strong style={{ color: "var(--ink)", fontWeight: 600 }}>"{query}"</strong></span>
          )}
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: 56 }}>
            <span className="spinner-lg" />
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
            }} style={{ ...inboxStyles.dayLabel, ...(isMobile ? { padding: "16px 14px 7px", top: 41 } : {}), cursor: "pointer" }}>
              <span>{dateLabel(date)}</span>
            </div>
            {txs.map(tx => (
              <Row
                key={tx.id}
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
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)", marginBottom: 6 }}>Scan results — {dupBulkResult.checked} transactions checked</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px" }}>
              {dupBulkResult.same_domain_exact > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain_exact}</strong></span>}
              {dupBulkResult.same_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Same sender: <strong>{dupBulkResult.same_domain}</strong></span>}
              {dupBulkResult.merchant_alias > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Merchant alias: <strong>{dupBulkResult.merchant_alias}</strong></span>}
              {dupBulkResult.investment_flow > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Investment flow: <strong>{dupBulkResult.investment_flow}</strong></span>}
              {dupBulkResult.cross_domain > 0 && <span style={{ fontSize: 11, color: "var(--ink-2)" }}>Cross-domain: <strong>{dupBulkResult.cross_domain}</strong></span>}
              {dupBulkResult.existing_pairs > 0 && <span style={{ fontSize: 11, color: "var(--amber-9)" }}>{dupBulkResult.existing_pairs} pair{dupBulkResult.existing_pairs > 1 ? "s" : ""} already in DB</span>}
              {dupBulkResult.already_paired > 0 && <span style={{ fontSize: 11, color: "var(--amber-9)" }}>{dupBulkResult.already_paired} potential match{dupBulkResult.already_paired > 1 ? "es" : ""} already paired</span>}
              {(!dupBulkResult.same_domain_exact && !dupBulkResult.same_domain && !dupBulkResult.merchant_alias && !dupBulkResult.investment_flow && !dupBulkResult.cross_domain && !dupBulkResult.existing_pairs && !dupBulkResult.already_paired) && <span style={{ fontSize: 11, color: "var(--ink-3)" }}>No matches found</span>}
            </div>
          </div>
          <button onClick={() => setDupBulkResult(null)} style={{ padding: "4px 8px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer" }}>Dismiss</button>
        </div>
      )}

      {selectedIds.size > 0 && (
        <div style={{ position: "fixed", bottom: isMobile ? 12 : 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: isMobile ? "10px 12px" : "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px -8px var(--shadow-lg)", zIndex: 50, fontSize: 13, fontWeight: 500, width: isMobile ? "calc(100vw - 24px)" : "auto", overflowX: isMobile ? "auto" : "visible" }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6 }}>{selectAllFlag ? results.length : selectedIds.size} selected</span>
          <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Read</button>
          <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Unread</button>
          <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Flag</button>
          <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Unflag</button>
          <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--neg)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Delete</button>
          <button onClick={bulkDetectDuplicates} style={{ padding: "6px 12px", border: "1px solid var(--ink-3)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Detect Duplicates</button>
          <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", display: "flex", alignItems: "center" }}><Icon name="x" size={14} stroke="currentColor"/></button>
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
};

Object.assign(window, { InboxView, SearchView, fmtMoney, MerchantLogo, CategoryChip, Confidence, dateLabel });
