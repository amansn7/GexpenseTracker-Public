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
  panel: { overflowY: "auto", padding: "28px 28px 120px", background: "var(--card)", borderLeft: "1px solid var(--line)" },
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

const Row = ({ tx, selected, onSelect, onEditCat }) => {
  const tag = TAGS[tx.tag];
  const isIncome = tx.amount > 0;
  return (
    <div
      onClick={onSelect}
      style={{ ...inboxStyles.row, ...(selected ? inboxStyles.rowSelected : {}), ...(!tx.read && !selected ? inboxStyles.rowUnread : {}) }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = "var(--paper-2)"; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = !tx.read ? "var(--card)" : "transparent"; }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {!tx.read && <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--accent)" }}/>}
        {tx.flag && <Icon name="star-f" size={12} stroke="var(--accent)" />}
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
  const isIncome = tx.amount > 0;
  const sign = isIncome ? "+" : "−";

  React.useEffect(() => {
    setAmtDraft(Math.abs(tx.amount));
    setNote(tx.note || "");
    setEditingAmt(false);
  }, [tx.id]);

  const saveAmt = () => {
    const n = parseFloat(amtDraft) || 0;
    onUpdate({ amount: isIncome ? n : -n });
    setEditingAmt(false);
  };

  return (
    <aside style={inboxStyles.panel} className="slide-in" key={tx.id}>
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

      <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
        <button className="focus-ring" onClick={()=>onUpdate({ flag: !tx.flag })} style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: tx.flag ? "var(--accent-soft)" : "var(--paper)", color: tx.flag ? "var(--accent)" : "var(--ink-2)", fontSize: 12, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
          <Icon name={tx.flag ? "star-f" : "star"} size={13} stroke={tx.flag ? "var(--accent)" : "currentColor"} />
          {tx.flag ? "Flagged" : "Flag"}
        </button>
        <button className="focus-ring" style={{ flex: 1, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink-2)", fontSize: 12, fontWeight: 500 }}>
          Split transaction
        </button>
      </div>
    </aside>
  );
};

const InboxView = ({ transactions, setTransactions, selectedId, setSelectedId, filter = "all", setFilter = () => {} }) => {
  const [pickerFor, setPickerFor] = React.useState(null); // tx id

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
    // Persist to DB
    const apiPatch = {};
    if (patch.cat    !== undefined) apiPatch.category   = patch.cat;
    if (patch.note   !== undefined) apiPatch.user_notes = patch.note;
    if (patch.amount !== undefined) apiPatch.amount     = Math.abs(patch.amount);
    if (Object.keys(apiPatch).length > 0) {
      API.patch(`/api/transactions/${id}`, apiPatch).catch(err => console.error("patch failed:", err));
    }
  };

  return (
    <>
      <div style={selected ? inboxStyles.wrap : inboxStyles.wrapNoPanel}>
        <div style={inboxStyles.list}>
          <div style={inboxStyles.toolbar}>
            {[
              ["all","All", transactions.length],
              ["expenses","Expenses"],
              ["income","Income"],
              ["sub","Subscriptions"],
              ["flagged","Flagged"],
              ["low","Needs review"],
            ].map(([k,label,count]) => (
              <button key={k} onClick={()=>setFilter(k)} style={{ ...inboxStyles.chip, ...(filter===k ? inboxStyles.chipActive : {}) }}>
                {label}{count!=null && <span style={{ opacity: 0.6, fontFamily: "'Geist Mono', monospace" }}>{count}</span>}
              </button>
            ))}
            <div style={{ flex: 1 }}/>
            <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{filtered.length} transactions · {new Date().toLocaleString("en-US",{month:"long",year:"numeric"})}</span>
          </div>

          {grouped.map(([date, txs]) => {
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
                    selected={selectedId===tx.id}
                    onSelect={()=>{ setSelectedId(tx.id); updateTx(tx.id, { read: true }); }}
                    onEditCat={()=>setPickerFor(tx.id)}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {selected && <DetailPanel tx={selected} onClose={()=>setSelectedId(null)} onUpdate={(p)=>updateTx(selected.id, p)} />}
      </div>

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
