// Inbox view — Gmail-style transaction list + detail panel

const inboxStyles = {
  wrap: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 0, height: "calc(100vh - 72px)", minHeight: 0 },
  wrapNoPanel: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", height: "calc(100vh - 72px)" },
  list: { overflowY: "auto", borderRight: "1px solid var(--line)" },
  toolbar: { display: "flex", alignItems: "center", gap: 6, padding: "10px 32px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5, fontSize: 12, color: "var(--ink-3)" },
  chip: { padding: "5px 10px", borderRadius: 20, border: "1px solid var(--line)", background: "var(--card)", fontSize: 11, color: "var(--ink-2)", display: "flex", alignItems: "center", gap: 6, fontWeight: 500, cursor: "pointer" },
  chipActive: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },

  dayLabel: { padding: "20px 32px 8px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 500, background: "var(--paper)", position: "sticky", top: 41, display: "flex", alignItems: "baseline", gap: 12 },
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
  confFill: { height: "100%", background: "var(--pos)", borderRadius: 2, transition: "width 200ms" },
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
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return "Unknown date";
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.floor((today - d)/(24*60*60*1000));
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
  const c = CATEGORIES[cat];
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
  return (
    <div
      onClick={onRowClick}
      style={{ ...inboxStyles.row, ...(selected ? inboxStyles.rowSelected : {}), ...(!tx.read && !selected ? inboxStyles.rowUnread : {}) }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = (!selectMode && !tx.read) ? "var(--card)" : "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {selectMode ? (
          <input
            type="checkbox"
            checked={selected}
            onChange={e => { e.stopPropagation(); onCheckbox(); }}
            onClick={e => e.stopPropagation()}
            style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }}
          />
        ) : (
          <>
            {!tx.read && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }}/>}
            {tx.flag && <Icon name="star-f" size={12} stroke="var(--accent)" />}
          </>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={{ ...inboxStyles.tagDot, background: tag.dot }}/>
      </div>
      <MerchantLogo merchant={tx.merchant}/>
      <div style={{ minWidth: 0, display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ ...inboxStyles.merchantName, ...(!tx.read ? inboxStyles.merchantNameUnread : {}) }}>{tx.merchant}</span>
        <span style={inboxStyles.subject}>{tx.subject}</span>
      </div>
      <div onClick={(e)=>{e.stopPropagation(); onEditCat&&onEditCat();}}>
        <CategoryChip cat={tx.cat} editable />
      </div>
      <Confidence value={tx.conf} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12 }}>
        <span style={inboxStyles.time}>{tx.time}</span>
        <span style={{ ...inboxStyles.amount, ...(isIncome ? inboxStyles.amountPos : inboxStyles.amountNeg) }}>
          {tx.amount === 0 ? "—" : `${isIncome ? "+" : "−"}₹${Math.abs(tx.amount).toLocaleString("en-IN")}`}
        </span>
      </div>
    </div>
  );
};

const CategoryPicker = ({ current, onPick, onClose }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 100 }}>
    <div onClick={(e)=>e.stopPropagation()} className="fade-in" style={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 8, width: 320, boxShadow: "0 20px 40px -20px rgba(0,0,0,0.3)" }}>
      <div style={{ padding: "8px 10px 10px", fontSize: 11, color: "var(--ink-3)", letterSpacing: "0.08em", textTransform: "uppercase", display:"flex", alignItems:"center", gap: 8 }}>
        <Icon name="sparkle" size={12} stroke="var(--accent)"/> Recategorize — teaches the model
      </div>
      {Object.entries(CATEGORIES).filter(([k])=>k!=="income").map(([k, c]) => (
        <button key={k} onClick={()=>onPick(k)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, border: "none", background: current===k ? "var(--paper-2)" : "transparent", width: "100%", textAlign: "left", cursor: "pointer", color: "var(--ink)", fontSize: 13 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: c.bg, border: `1px solid ${c.ink}22` }} />
          <span style={{ fontWeight: 500 }}>{c.label}</span>
          {current===k && <Icon name="check" size={14} stroke="var(--accent)" style={{ marginLeft: "auto" }}/>}
        </button>
      ))}
    </div>
  </div>
);

const DetailPanel = ({ tx, onClose, onUpdate }) => {
  const [editingAmt, setEditingAmt] = React.useState(false);
  const [amtDraft, setAmtDraft] = React.useState(Math.abs(tx.amount));
  const [note, setNote] = React.useState(tx.note || "");
  const [reclass, setReclass] = React.useState("idle"); // idle | previewing | preview | saving | done | error
  const [reclassResult, setReclassResult] = React.useState(null);
  const isIncome = tx.amount > 0;
  const sign = isIncome ? "+" : "−";

  React.useEffect(() => {
    setAmtDraft(Math.abs(tx.amount));
    setNote(tx.note || "");
    setEditingAmt(false);
    setReclass("idle");
    setReclassResult(null);
  }, [tx.id]);

  const handlePreview = async () => {
    setReclass("previewing");
    try {
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
    <aside style={inboxStyles.panel} className="slide-in" key={tx.id}>
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
            <span className="serif" style={{ fontSize: 54, color: isIncome ? "var(--pos)" : "var(--ink)", lineHeight: 1 }}>{sign}₹</span>
            <input
              autoFocus
              value={amtDraft}
              onChange={(e)=>setAmtDraft(e.target.value.replace(/[^\d.]/g,""))}
              onBlur={saveAmt}
              onKeyDown={(e)=>{ if(e.key==="Enter") saveAmt(); if(e.key==="Escape") { setAmtDraft(Math.abs(tx.amount)); setEditingAmt(false); } }}
              className="serif focus-ring"
              style={{ fontSize: 54, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1, width: 240, border: "none", background: "transparent", color: isIncome ? "var(--pos)" : "var(--ink)", outline: "none", borderBottom: "2px solid var(--accent)", padding: 0 }}
            />
          </div>
        ) : (
          <div onClick={()=>setEditingAmt(true)} style={{ cursor: "text", display: "inline-block", borderBottom: "1px dashed transparent" }}
            onMouseEnter={e=>e.currentTarget.style.borderBottomColor="var(--line)"}
            onMouseLeave={e=>e.currentTarget.style.borderBottomColor="transparent"}>
            <div style={{ ...inboxStyles.bigAmount, color: isIncome ? "var(--pos)" : "var(--ink)" }}>
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
      </div>

      <div style={inboxStyles.panelSection}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Email excerpt</div>
        <div style={{ padding: 14, background: "var(--paper-2)", borderRadius: 6, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, borderLeft: "2px solid var(--accent)" }}>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 10, color: "var(--ink-4)", marginBottom: 6 }}>{tx.subject}</div>
          Dear customer, your {tx.tag === "income" ? "deposit" : "transaction"} of ₹{Math.abs(tx.amount).toLocaleString("en-IN")} on {tx.date} has been processed. Ref: #{tx.id.toUpperCase()}22{Math.abs(tx.amount).toString().slice(-3)}.
        </div>
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
              <button onClick={handleConfirm} style={{ flex: 2, padding: "8px 0", border: "none", borderRadius: 6, background: "var(--ink)", color: "var(--paper)", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Save to DB</button>
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
            <Icon name="x" size={14} stroke="var(--neg)"/> Re-classification failed — check server logs
          </div>
        )}

        <div style={{ display: "flex", gap: 8 }}>
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
            {reclass === "previewing" ? "Classifying…" : "Re-classify"}
          </button>
        </div>
      </div>
    </aside>
  );
};

const TxCard = ({ tx, isPrimary, resolving, onResolve, pairId }) => {
  const fmtAmt = (amt) => amt != null ? `₹${Math.abs(amt).toLocaleString("en-IN")}` : "—";
  return (
    <div style={{ flex: 1, padding: "16px 18px", background: "var(--paper-2)", borderRadius: 8, border: isPrimary ? "2px solid var(--accent)" : "1px solid var(--line)" }}>
      {isPrimary && <div style={{ fontSize: 10, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, marginBottom: 8 }}>Suggested primary</div>}
      <MerchantLogo merchant={tx.merchant || "?"} size={28}/>
      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 8 }}>{tx.merchant || "Unknown"}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{tx.email?.sender_domain || ""}</div>
      <div style={{ fontFamily: "'Geist Mono', monospace", fontWeight: 700, fontSize: 18, marginTop: 8 }}>{fmtAmt(tx.amount)}</div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{tx.txn_date || ""}</div>
      <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.email?.subject || ""}</div>
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
  return (
    <div style={{ padding: "20px 28px", borderBottom: "1px solid var(--line)" }}>
      <div style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>
        {pair.rule_source === "domain_pair" ? `Known pair · ${Math.round(pair.confidence * 100)}% confidence` : "Possible duplicate · same amount + date"}
      </div>
      <div style={{ display: "flex", gap: 12 }}>
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

const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {}, loadMore = () => {}, totalTransactions = 0, loadingMore = false }) => {
  const [pickerFor, setPickerFor] = React.useState(null); // tx id
  const [selectedIds, setSelectedIds] = React.useState(new Set());
  const [selectMode, setSelectMode] = React.useState(false);
  const listRef = React.useRef(null);
  const [bulkReclassState, setBulkReclassState] = React.useState("idle"); // idle | running | done
  const [bulkProgress, setBulkProgress] = React.useState({ done: 0, total: 0 });
  const [bulkManualOpen, setBulkManualOpen] = React.useState(false);
  const [bulkManualCat, setBulkManualCat] = React.useState("other");
  const [bulkManualLabel, setBulkManualLabel] = React.useState("expense");
  const [dupPairs, setDupPairs] = React.useState([]);
  const [dupLoading, setDupLoading] = React.useState(false);

  React.useEffect(() => {
    if (!selectMode) return;
    const onKey = (e) => { if (e.key === "Escape") { setSelectMode(false); setSelectedIds(new Set()); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode]);

  React.useEffect(() => {
    if (filter !== "duplicates") return;
    setDupLoading(true);
    API.get("/api/duplicates?status=pending")
      .then(data => { setDupPairs(data); setDupLoading(false); })
      .catch(() => setDupLoading(false));
  }, [filter]);

  React.useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 100
          && transactions.length < totalTransactions
          && !loadingMore) {
        loadMore();
      }
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [transactions.length, totalTransactions, loadingMore, loadMore]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filtered.map(t => t.id)));
  const clearSelect = () => { setSelectMode(false); setSelectedIds(new Set()); };

  const bulkAction = async (action, localPatch) => {
    const ids = [...selectedIds];
    setTransactions(ts => ts.map(t => selectedIds.has(t.id) ? { ...t, ...localPatch } : t));
    clearSelect();
    await API.post("/api/transactions/bulk", { ids, action }).catch(() => {});
  };

  const bulkMarkRead   = () => bulkAction("mark_read",   { read: true });
  const bulkMarkUnread = () => bulkAction("mark_unread", { read: false });
  const bulkFlag       = () => bulkAction("flag",        { flag: true });
  const bulkUnflag     = () => bulkAction("unflag",      { flag: false });

  const bulkDelete = async () => {
    const count = selectedIds.size;
    if (!window.confirm(`Delete ${count} email(s)? Classification data is kept.`)) return;
    const ids = [...selectedIds];
    setTransactions(ts => ts.filter(t => !selectedIds.has(t.id)));
    clearSelect();
    await API.post("/api/transactions/bulk", { ids, action: "delete" }).catch(() => {});
  };

  const bulkReclassify = async () => {
    const ids = [...selectedIds];
    setBulkReclassState("running");
    setBulkProgress({ done: 0, total: ids.length });
    for (let i = 0; i < ids.length; i++) {
      try {
        const result = await API.post(`/api/transactions/${ids[i]}/reclassify`);
        const isIncome = result.label === "income";
        const cat = normCat(result.category, isIncome);
        setTransactions(ts => ts.map(t => t.id === ids[i] ? {
          ...t,
          cat,
          tag: isIncome ? "income" : cat === "sub" ? "subscription" : "expense",
          conf: result.confidence ?? t.conf,
          merchant: result.merchant || t.merchant,
        } : t));
      } catch (_) {}
      setBulkProgress({ done: i + 1, total: ids.length });
    }
    setBulkReclassState("done");
    setTimeout(() => { setBulkReclassState("idle"); clearSelect(); }, 1500);
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
    if (filter.startsWith("cat:")) return t.cat === filter.slice(4);
    return true;
  });

  const grouped = groupByDate(filtered);
  const selected = transactions.find(t => t.id === selectedId);

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

  return (
    <>
      <div style={selected ? inboxStyles.wrap : inboxStyles.wrapNoPanel}>
        <div ref={listRef} style={inboxStyles.list}>
          <div style={inboxStyles.toolbar}>
            {selectMode ? (
              <>
                <input
                  type="checkbox"
                  checked={selectedIds.size === filtered.length && filtered.length > 0}
                  onChange={e => e.target.checked ? selectAll() : setSelectedIds(new Set())}
                  style={{ cursor: "pointer", width: 14, height: 14, accentColor: "var(--accent)" }}
                />
                <span style={{ fontSize: 12, color: "var(--ink-2)", fontWeight: 500 }}>
                  {selectedIds.size} selected
                </span>
                <div style={{ flex: 1 }}/>
                <button onClick={clearSelect} style={{ ...inboxStyles.chip, color: "var(--ink-3)" }}>✕ Clear</button>
              </>
            ) : (
              <>
                {[
                  ["all","All", transactions.length],
                  ["expenses","Expenses"],
                  ["income","Income"],
                  ["sub","Subscriptions"],
                  ["flagged","Flagged"],
                  ["low","Needs review"],
                  ["duplicates","Duplicates"],
                ].map(([k,label,count]) => (
                  <button key={k} onClick={()=>setFilter(k)} style={{ ...inboxStyles.chip, ...(filter===k ? inboxStyles.chipActive : {}) }}>
                    {label}{count!=null && <span style={{ opacity: 0.6, fontFamily: "'Geist Mono', monospace" }}>{count}</span>}
                  </button>
                ))}
                <div style={{ flex: 1 }}/>
                <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{filtered.length} transactions · {new Date().toLocaleString("en-US",{month:"long",year:"numeric"})}</span>
              </>
            )}
          </div>

          {filter === "duplicates" ? (
            dupLoading ? (
              <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>Loading…</div>
            ) : dupPairs.length === 0 ? (
              <div style={{ padding: "40px 32px", color: "var(--ink-3)", fontSize: 13 }}>No pending duplicates. 🎉</div>
            ) : (
              dupPairs.map(pair => (
                <DuplicatePairCard key={pair.id} pair={pair} onResolve={resolveDup} />
              ))
            )
          ) : grouped.map(([date, txs]) => {
            const dayTotal = txs.reduce((a,t)=>a+t.amount,0);
            return (
              <div key={date}>
                <div style={inboxStyles.dayLabel}>
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
          {loadingMore && (
            <div style={{ padding: "20px 32px", display: "flex", justifyContent: "center" }}>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
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
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", borderRadius: 10, padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 8px 32px -8px rgba(0,0,0,0.4)", zIndex: 50, fontSize: 13, fontWeight: 500 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11, opacity: 0.6 }}>{selectedIds.size} selected</span>
          <button onClick={bulkMarkRead} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Read</button>
          <button onClick={bulkMarkUnread} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Mark Unread</button>
          <button onClick={bulkFlag} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Flag</button>
          <button onClick={bulkUnflag} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Unflag</button>
          <button onClick={bulkReclassify} disabled={bulkReclassState==="running"} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: bulkReclassState==="running"?"default":"pointer", fontWeight: 500 }}>
            {bulkReclassState==="running" ? `${bulkProgress.done}/${bulkProgress.total} done` : bulkReclassState==="done" ? "Done ✓" : "Re-classify (LLM)"}
          </button>
          <button onClick={()=>setBulkManualOpen(true)} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "var(--paper)", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Re-classify (Manual)</button>
          <button onClick={bulkDelete} style={{ padding: "6px 12px", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 6, background: "transparent", color: "#fca5a5", fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Delete</button>
          <button onClick={clearSelect} style={{ padding: "6px 10px", border: "none", background: "transparent", color: "rgba(255,255,255,0.5)", fontSize: 18, cursor: "pointer", lineHeight: 1 }}>✕</button>
        </div>
      )}

      {bulkManualOpen && (
        <div onClick={()=>setBulkManualOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 100, background: "rgba(0,0,0,0.2)" }}>
          <div onClick={e=>e.stopPropagation()} style={{ position: "absolute", top: "30%", left: "50%", transform: "translateX(-50%)", background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, padding: 20, width: 340, boxShadow: "0 20px 40px -20px rgba(0,0,0,0.3)" }}>
            <div style={{ fontWeight: 600, marginBottom: 14, fontSize: 13 }}>Re-classify {selectedIds.size} transactions</div>
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

      {pickerFor && (
        <CategoryPicker
          current={transactions.find(t=>t.id===pickerFor)?.cat}
          onPick={(cat)=>{ updateTx(pickerFor, { cat, conf: 1.0 }); setPickerFor(null); }}
          onClose={()=>setPickerFor(null)}
        />
      )}
    </>
  );
};

Object.assign(window, { InboxView, fmtMoney, MerchantLogo, CategoryChip, Confidence, dateLabel });
