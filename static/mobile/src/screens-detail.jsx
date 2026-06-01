/* Gexpense Hi-Fi — New screens (Detail, Onboarding, Goal, Category, AI Explain, Empty) */
const { useState: useStateN, useEffect: useEffectN, useRef: useRefN } = React;

// ============================================================
// 1. TRANSACTION DETAIL — full screen with edit, source email, split, delete
// ============================================================
const TxDetail = ({ tx, onBack, onSaved, onDeleted }) => {
  const [editMode, setEditMode] = useStateN(false);
  const [showSource, setShowSource] = useStateN(false);
  const [showSplit, setShowSplit] = useStateN(false);
  const [confirmDel, setConfirmDel] = useStateN(false);
  const [saving, setSaving] = useStateN(false);

  const [draft, setDraft] = useStateN({
    merchant: tx.merchant,
    amount: tx.amount,
    note: tx.note,
    category: tx.category,
    label: tx.label || (tx.type === 'income' ? 'income' : 'expense'),
    date: tx.date,
  });

  const isIncome = draft.label === 'income';

  const patchTx = async (fields) => {
    setSaving(true);
    try {
      await window.GxAPI.patch('/api/transactions/' + tx.id, fields);
      onSaved && onSaved('Saved');
    } finally {
      setSaving(false);
    }
  };

  const handleCategoryChange = (newCat) => {
    setDraft(d => ({ ...d, category: newCat }));
    patchTx({ category: newCat });
  };

  const handleLabelChange = (newLabel) => {
    setDraft(d => ({ ...d, label: newLabel }));
    patchTx({ label: newLabel });
  };

  const handleDelete = async () => {
    setConfirmDel(false);
    setSaving(true);
    try {
      await window.GxAPI.patch('/api/transactions/' + tx.id, { status: 'deleted' });
      onDeleted && onDeleted();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="scroll" data-screen-label="08 Tx Detail" style={{paddingBottom:120}}>
      {/* hero header */}
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:34, height:34, display:'grid', placeItems:'center'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div className="small mono" style={{color:'var(--ink-3)'}}>{tx.id}</div>
          <button onClick={() => setEditMode(!editMode)} className="btn btn-ghost" style={{padding:'6px 12px', fontSize:12, fontWeight:600, color: editMode ? 'var(--brand)' : 'var(--ink-2)'}}>
            {saving ? '…' : editMode ? 'Done' : 'Edit'}
          </button>
        </div>

        {/* amount hero */}
        <div className="fade-up fade-up-2" style={{textAlign:'center', padding:'18px 0 26px'}}>
          <div style={{display:'inline-flex', alignItems:'center', gap:10, padding:'6px 12px', borderRadius:999, background: isIncome ? 'color-mix(in srgb, var(--ok) 12%, transparent)' : 'var(--surface-2)', marginBottom:12}}>
            <CatIcon kind={tx.category} size={20}/>
            <span style={{fontSize:12, fontWeight:600, color: isIncome ? 'var(--ok)' : 'var(--ink-2)'}}>{tx.categoryLabel}</span>
          </div>
          <div className="tabular" style={{fontSize:42, fontWeight:600, letterSpacing:'-0.025em', color: isIncome ? 'var(--ok)' : 'var(--ink)', lineHeight:1}}>
            {isIncome ? '+' : '−'}₹{Number(draft.amount).toLocaleString('en-IN')}
          </div>
          {editMode && (
            <input
              type="text"
              inputMode="numeric"
              value={draft.amount}
              onChange={(e) => setDraft({...draft, amount: e.target.value.replace(/[^\d]/g, '')})}
              style={{display:'block', margin:'8px auto 0', padding:'6px 12px', borderRadius:8, border:'1px solid var(--line)', background:'var(--surface-2)', textAlign:'center', fontFamily:'inherit', fontSize:14, width:120}}
            />
          )}
          <div className="h3" style={{marginTop:14, fontWeight:600}}>
            {editMode ? (
              <input value={draft.merchant} onChange={(e) => setDraft({...draft, merchant: e.target.value})} style={{padding:'6px 12px', borderRadius:8, border:'1px solid var(--line)', background:'var(--surface-2)', fontFamily:'inherit', fontSize:18, fontWeight:600, textAlign:'center'}}/>
            ) : draft.merchant}
          </div>
          <div className="small mono" style={{marginTop:4}}>{tx.dateLong} · {tx.time}</div>
        </div>

        {/* meta card */}
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          <DetailRow icon="store" label="Merchant" value={draft.merchant}/>
          <Divider/>
          {editMode ? (
            <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px'}}>
              <div style={{width:30, height:30, borderRadius:8, background:'var(--surface-2)', display:'grid', placeItems:'center', color:'var(--ink-3)', flexShrink:0}}>
                <Icon name="folder" size={14}/>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div className="label" style={{fontSize:10}}>Category</div>
                <select value={draft.category} onChange={e => handleCategoryChange(e.target.value)} style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:500, color:'var(--ink)', outline:'none', width:'100%', marginTop:1}}>
                  {['food','travel','shop','bills','coffee','grocery','subs','fuel','health','entertainment','other'].map(c => (
                    <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                  ))}
                </select>
              </div>
              <Icon name="edit" size={14} style={{color:'var(--ink-3)'}}/>
            </div>
          ) : (
            <DetailRow icon="folder" label="Category" value={tx.categoryLabel || draft.category}/>
          )}
          <Divider/>
          {editMode ? (
            <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px'}}>
              <div style={{width:30, height:30, borderRadius:8, background:'var(--surface-2)', display:'grid', placeItems:'center', color:'var(--ink-3)', flexShrink:0}}>
                <Icon name="tag" size={14}/>
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div className="label" style={{fontSize:10}}>Type</div>
                <select value={draft.label} onChange={e => handleLabelChange(e.target.value)} style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:500, color:'var(--ink)', outline:'none', width:'100%', marginTop:1}}>
                  {['expense','income','ignore','transfer'].map(l => (
                    <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>
                  ))}
                </select>
              </div>
              <Icon name="edit" size={14} style={{color:'var(--ink-3)'}}/>
            </div>
          ) : (
            <DetailRow icon="tag" label="Type" value={draft.label}/>
          )}
          <Divider/>
          <DetailRow icon="card" label="Account" value={tx.account}/>
          <Divider/>
          <DetailRow icon="calendar" label="Date" value={tx.dateLong}/>
          <Divider/>
          <DetailRow icon="note" label="Note" value={draft.note || 'Add a note…'} muted={!draft.note} editable={editMode}/>
        </div>

        {/* source */}
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <div onClick={() => setShowSource(true)} style={{cursor:'pointer'}}>
            <DetailRow icon={tx.source === 'Gmail' ? 'mail' : tx.source === 'SMS' ? 'zap' : 'edit'} label="Source" value={tx.sourceDetail || tx.source} chevron/>
          </div>
        </div>

        {/* AI tags */}
        {tx.aiTags?.length > 0 && (
          <div className="fade-up fade-up-5" style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:14}}>
            {tx.aiTags.map((t, i) => (
              <span key={i} className="chip" style={{background:'var(--brand-soft)', color:'var(--brand)', border:'1px solid color-mix(in srgb, var(--brand) 20%, transparent)'}}>
                <Icon name="sparkle" size={10}/> {t}
              </span>
            ))}
          </div>
        )}

        {/* actions */}
        <div className="fade-up fade-up-6" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14}}>
          <ActionTile icon="split" label="Split" onClick={() => setShowSplit(true)}/>
          <ActionTile icon="repeat" label="Repeat" onClick={() => {}}/>
          <ActionTile icon="trash" label="Delete" tone="err" onClick={() => setConfirmDel(true)}/>
        </div>
      </div>

      {/* SOURCE SHEET */}
      {showSource && <SourceSheet tx={tx} onClose={() => setShowSource(false)}/>}

      {/* SPLIT SHEET */}
      {showSplit && <SplitSheet tx={tx} onClose={() => setShowSplit(false)} onApply={() => { setShowSplit(false); onSaved && onSaved('Split saved'); }}/>}

      {/* DELETE CONFIRM */}
      {confirmDel && (
        <>
          <div className="scrim open" onClick={() => setConfirmDel(false)}/>
          <div className="sheet open" style={{padding:'18px 22px 26px'}}>
            <div className="grabber"/>
            <div className="h3" style={{marginTop:6}}>Delete this expense?</div>
            <div className="body" style={{marginTop:6, color:'var(--ink-2)'}}>This will be removed from your records. The original {tx.source} message stays in your inbox.</div>
            <div style={{display:'flex', gap:10, marginTop:18}}>
              <button onClick={() => setConfirmDel(false)} className="btn btn-ghost" style={{flex:1, padding:12}}>Cancel</button>
              <button onClick={handleDelete} className="btn" style={{flex:1, padding:12, background:'var(--err)', color:'#fff', fontWeight:600}}>Delete</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const DetailRow = ({ icon, label, value, chevron, muted, editable }) => (
  <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px'}}>
    <div style={{width:30, height:30, borderRadius:8, background:'var(--surface-2)', display:'grid', placeItems:'center', color:'var(--ink-3)', flexShrink:0}}>
      <Icon name={icon} size={14}/>
    </div>
    <div style={{flex:1, minWidth:0}}>
      <div className="label" style={{fontSize:10}}>{label}</div>
      <div style={{fontSize:14, fontWeight:500, color: muted ? 'var(--ink-4)' : 'var(--ink)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{value}</div>
    </div>
    {editable && <Icon name="edit" size={14} style={{color:'var(--ink-3)'}}/>}
    {chevron && <Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}
  </div>
);

const ActionTile = ({ icon, label, tone, onClick }) => (
  <button onClick={onClick} className="card btn" style={{
    padding:'14px 8px', borderRadius:12,
    display:'flex', flexDirection:'column', alignItems:'center', gap:6,
    color: tone === 'err' ? 'var(--err)' : 'var(--ink-2)',
    background:'var(--surface)',
    cursor:'pointer',
  }}>
    <Icon name={icon} size={18}/>
    <span style={{fontSize:11, fontWeight:600}}>{label}</span>
  </button>
);

// ============================================================
// SOURCE EMAIL/SMS SHEET — viewing original parsed message
// ============================================================
const SourceSheet = ({ tx, onClose }) => (
  <>
    <div className="scrim open" onClick={onClose}/>
    <div className="sheet open" style={{maxHeight:'80%', display:'flex', flexDirection:'column', paddingBottom:16}}>
      <div className="grabber"/>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 12px'}}>
        <div>
          <div className="h3">Source · {tx.source}</div>
          <div className="small mono" style={{marginTop:2}}>Parsed {tx.parsedAgo || '2 min ago'}</div>
        </div>
        <button onClick={onClose} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}>
          <Icon name="x" size={16}/>
        </button>
      </div>

      <div style={{flex:1, overflowY:'auto', padding:'4px 22px 0'}}>
        {tx.source === 'Gmail' ? (
          <div className="card" style={{padding:16, marginBottom:12}}>
            <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10}}>
              <div style={{minWidth:0, flex:1}}>
                <div style={{fontSize:13, fontWeight:600}}>{tx.emailFrom || 'Swiggy <orders@swiggy.in>'}</div>
                <div className="small mono" style={{marginTop:2}}>to me · {tx.dateLong}</div>
              </div>
              <Badge tone="ok"><Icon name="check" size={9} stroke={3}/> matched</Badge>
            </div>
            <div style={{fontSize:14, fontWeight:600, marginTop:8}}>{tx.emailSubject || `Order delivered — ${tx.merchant}`}</div>
            <div style={{padding:14, borderRadius:10, background:'var(--surface-2)', marginTop:12, fontSize:13, lineHeight:1.5, color:'var(--ink-2)'}}>
              <div>Hi Aman,</div>
              <div style={{marginTop:8}}>Your order from <b>{tx.merchant}</b> has been delivered.</div>
              <div style={{display:'flex', justifyContent:'space-between', marginTop:12, padding:'10px 0', borderTop:'1px dashed var(--line-strong)', borderBottom:'1px dashed var(--line-strong)'}}>
                <span>Total paid</span>
                <span className="mono tabular" style={{fontWeight:600, color:'var(--ink)'}}>₹{Number(tx.amount).toLocaleString('en-IN')}</span>
              </div>
              <div style={{marginTop:10, fontSize:12, color:'var(--ink-3)'}}>Paid via {tx.account || 'HDFC ••1042'}</div>
            </div>
          </div>
        ) : tx.source === 'SMS' ? (
          <div className="card" style={{padding:14, marginBottom:12}}>
            <div className="small mono" style={{color:'var(--ink-3)', marginBottom:8}}>HDFCBK · {tx.dateLong} {tx.time}</div>
            <div style={{padding:'14px 16px', borderRadius:14, background:'var(--brand-soft)', fontSize:13, lineHeight:1.5, color:'var(--ink)'}}>
              Sent Rs.{tx.amount} from HDFC Bank A/C XX1042 to {tx.merchant} on {tx.dateLong}. Avl bal: Rs.42,180.50. Not you? Block via app.
            </div>
          </div>
        ) : (
          <div className="card" style={{padding:18, marginBottom:12, textAlign:'center'}}>
            <Icon name="edit" size={32} style={{color:'var(--ink-3)'}}/>
            <div style={{fontSize:14, fontWeight:600, marginTop:10}}>Manually added</div>
            <div className="small" style={{marginTop:4}}>You added this on {tx.dateLong}</div>
          </div>
        )}

        {/* extraction breakdown */}
        <div className="label" style={{margin:'14px 4px 8px'}}>What we extracted</div>
        <div className="card" style={{padding:0, marginBottom:14}}>
          <ExtractRow label="Merchant" value={tx.merchant} confidence={0.99}/>
          <Divider/>
          <ExtractRow label="Amount" value={`₹${Number(tx.amount).toLocaleString('en-IN')}`} confidence={1.00}/>
          <Divider/>
          <ExtractRow label="Category" value={tx.categoryLabel} confidence={0.92} aiInferred/>
          <Divider/>
          <ExtractRow label="Date" value={tx.dateLong} confidence={1.00}/>
        </div>

        <button className="btn btn-ghost" style={{width:'100%', padding:12, marginBottom:8}}>
          <Icon name="external" size={14} style={{marginRight:6}}/>
          Open in {tx.source === 'Gmail' ? 'Gmail' : 'Messages'}
        </button>
      </div>
    </div>
  </>
);

const ExtractRow = ({ label, value, confidence, aiInferred }) => (
  <div style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px'}}>
    <div style={{flex:1}}>
      <div className="label" style={{fontSize:10}}>{label}</div>
      <div style={{fontSize:13, fontWeight:500, marginTop:1, display:'flex', alignItems:'center', gap:6}}>
        {value}
        {aiInferred && <Icon name="sparkle" size={11} style={{color:'var(--brand)'}}/>}
      </div>
    </div>
    <div style={{display:'flex', alignItems:'center', gap:6}}>
      <div style={{width:32, height:4, borderRadius:2, background:'var(--surface-2)', overflow:'hidden'}}>
        <div style={{width:`${confidence*100}%`, height:'100%', background: confidence > 0.95 ? 'var(--ok)' : confidence > 0.85 ? 'var(--brand)' : 'var(--warn)'}}/>
      </div>
      <span className="mono tabular" style={{fontSize:10, color:'var(--ink-3)', minWidth:30}}>{Math.round(confidence*100)}%</span>
    </div>
  </div>
);

// ============================================================
// SPLIT SHEET — split a transaction across categories or people
// ============================================================
const SplitSheet = ({ tx, onClose, onApply }) => {
  const [parts, setParts] = useStateN([
    { who: 'You', amount: Math.round(tx.amount/2) },
    { who: 'Rohan', amount: Math.round(tx.amount/2) },
  ]);
  const total = parts.reduce((s, p) => s + Number(p.amount || 0), 0);
  const remaining = tx.amount - total;

  return (
    <>
      <div className="scrim open" onClick={onClose}/>
      <div className="sheet open" style={{maxHeight:'82%', display:'flex', flexDirection:'column', paddingBottom:16}}>
        <div className="grabber"/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 12px'}}>
          <div>
            <div className="h3">Split this expense</div>
            <div className="small" style={{marginTop:2}}>{tx.merchant} · ₹{Number(tx.amount).toLocaleString('en-IN')}</div>
          </div>
          <button onClick={onClose} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}><Icon name="x" size={16}/></button>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'0 22px 4px'}}>
          {parts.map((p, i) => (
            <div key={i} className="card" style={{padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:34, height:34, borderRadius:'50%', background:'var(--brand-50)', color:'var(--brand)', display:'grid', placeItems:'center', fontSize:13, fontWeight:600}}>{p.who[0]}</div>
              <div style={{flex:1, minWidth:0}}>
                <input value={p.who} onChange={(e) => setParts(parts.map((x, j) => j === i ? {...x, who: e.target.value} : x))} style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:600, outline:'none', width:'100%'}}/>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--line)'}}>
                <span className="small">₹</span>
                <input value={p.amount} onChange={(e) => setParts(parts.map((x, j) => j === i ? {...x, amount: e.target.value.replace(/[^\d]/g, '')} : x))} inputMode="numeric" style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:600, outline:'none', width:60, textAlign:'right'}}/>
              </div>
            </div>
          ))}
          <button onClick={() => setParts([...parts, { who: `Person ${parts.length+1}`, amount: 0 }])} className="btn btn-ghost" style={{width:'100%', padding:10, marginTop:4, borderStyle:'dashed', border:'1px dashed var(--line-strong)'}}>+ Add person</button>
        </div>
        <div style={{padding:'12px 22px 6px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--line)'}}>
          <span className="small">Remaining</span>
          <span className="mono tabular" style={{fontSize:14, fontWeight:600, color: remaining === 0 ? 'var(--ok)' : 'var(--err)'}}>₹{remaining.toLocaleString('en-IN')}</span>
        </div>
        <div style={{padding:'4px 22px 8px'}}>
          <button onClick={onApply} disabled={remaining !== 0} className="btn btn-primary" style={{width:'100%', padding:12, opacity: remaining === 0 ? 1 : 0.5}}>Apply split</button>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { TxDetail, SourceSheet, SplitSheet });

