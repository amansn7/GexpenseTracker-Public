/* Gexpense Hi-Fi — Transaction detail, source sheet, split sheet */
const { useState: useStateN, useRef: useRefN } = React;

const _fmtDateLong = (d) => {
  if (!d) return '—';
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }); }
  catch { return d; }
};

const _catLabel = k => k ? k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g,' ') : 'Other';

const TX_CATS = [
  { k:'food',     label:'Food',        icon:'coffee'  },
  { k:'grocery',  label:'Grocery',     icon:'bag'     },
  { k:'travel',   label:'Travel',      icon:'car'     },
  { k:'fuel',     label:'Fuel',        icon:'flame'   },
  { k:'shop',     label:'Shopping',    icon:'bag'     },
  { k:'subs',     label:'Subscriptions', icon:'repeat'},
  { k:'bills',    label:'Bills',       icon:'zap'     },
  { k:'rent',     label:'Rent',        icon:'home'    },
  { k:'health',   label:'Health',      icon:'shield'  },
  { k:'income',   label:'Income',      icon:'arrowUp' },
  { k:'invest',   label:'Investment',  icon:'chart'   },
  { k:'other',    label:'Other',       icon:'folder'  },
];

const TX_LABELS = ['expense','income','self_transfer','cc_payment','investment','ignore'];

// ============================================================
// TRANSACTION DETAIL
// ============================================================
const TxDetail = ({ tx, onBack, onSaved, onDeleted }) => {
  const [editMode,    setEditMode]    = useStateN(false);
  const [showSource,  setShowSource]  = useStateN(false);
  const [showSplit,   setShowSplit]   = useStateN(false);
  const [confirmDel,  setConfirmDel]  = useStateN(false);
  const [catPicker,   setCatPicker]   = useStateN(false);
  const [saving,      setSaving]      = useStateN(false);
  const [saveErr,     setSaveErr]     = useStateN('');

  const initialDraft = {
    merchant: tx.merchant || '',
    amount:   String(Math.abs(tx.amount || 0)),
    note:     tx.note || tx.user_notes || '',
    category: tx.category || 'other',
    label:    tx.label || (tx.type === 'income' ? 'income' : 'expense'),
    txn_date: tx.txn_date || '',
  };
  const [draft, setDraft] = useStateN(initialDraft);

  const hasRealId = tx.id && !String(tx.id).startsWith('tx_');
  const dateLong  = tx.dateLong || _fmtDateLong(tx.txn_date);
  const isIncome  = draft.label === 'income';

  const handleSave = async () => {
    setSaving(true);
    setSaveErr('');
    const patch = {};
    if (draft.merchant !== initialDraft.merchant) patch.merchant  = draft.merchant.trim();
    if (draft.amount   !== initialDraft.amount)   patch.amount    = parseFloat(draft.amount) || 0;
    if (draft.note     !== initialDraft.note)     patch.user_notes = draft.note.trim();
    if (draft.category !== initialDraft.category) patch.category  = draft.category;
    if (draft.label    !== initialDraft.label)    patch.label     = draft.label;
    if (draft.txn_date !== initialDraft.txn_date && draft.txn_date) patch.txn_date = draft.txn_date;

    if (hasRealId && Object.keys(patch).length > 0) {
      const res = await GxAPI.patch('/api/transactions/' + tx.id, patch);
      if (!res) { setSaveErr('Could not save — check connection'); setSaving(false); return; }
    }
    setSaving(false);
    setEditMode(false);
    onSaved && onSaved('Saved');
  };

  const handleDelete = async () => {
    setConfirmDel(false);
    if (hasRealId) {
      await GxAPI.patch('/api/transactions/' + tx.id, { label: 'ignore' });
    }
    onDeleted && onDeleted();
  };

  const cancelEdit = () => {
    setDraft(initialDraft);
    setEditMode(false);
    setSaveErr('');
  };

  return (
    <div className="scroll" data-screen-label="08 Tx Detail" style={{paddingBottom:120}}>
      <div style={{padding:'8px 22px 0'}}>

        {/* header */}
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14}}>
          <button onClick={onBack} className="btn btn-ghost" style={{padding:6, borderRadius:'50%', width:34, height:34, display:'grid', placeItems:'center'}}>
            <Icon name="chevron" size={16} style={{transform:'rotate(180deg)'}}/>
          </button>
          <div className="small mono" style={{color:'var(--ink-3)'}}>
            {hasRealId ? tx.id.substring(0,8)+'…' : ''}
          </div>
          {editMode ? (
            <div style={{display:'flex', gap:6}}>
              <button onClick={cancelEdit} className="btn btn-ghost" style={{padding:'6px 10px', fontSize:12, fontWeight:600}}>Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn" style={{padding:'6px 12px', fontSize:12, fontWeight:600, background:'var(--brand)', color:'#fff', opacity: saving ? 0.6 : 1}}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          ) : (
            <button onClick={() => setEditMode(true)} className="btn btn-ghost" style={{padding:'6px 12px', fontSize:12, fontWeight:600, color:'var(--ink-2)'}}>Edit</button>
          )}
        </div>

        {saveErr && (
          <div style={{padding:'8px 12px', borderRadius:8, background:'var(--err)', color:'#fff', fontSize:12, marginBottom:10, textAlign:'center'}}>{saveErr}</div>
        )}

        {/* amount hero */}
        <div className="fade-up fade-up-2" style={{textAlign:'center', padding:'18px 0 26px'}}>
          <div style={{display:'inline-flex', alignItems:'center', gap:10, padding:'6px 12px', borderRadius:999,
            background: isIncome ? 'color-mix(in srgb, var(--ok) 12%, transparent)' : 'var(--surface-2)', marginBottom:12}}>
            <CatIcon kind={draft.category} size={20}/>
            <span style={{fontSize:12, fontWeight:600, color: isIncome ? 'var(--ok)' : 'var(--ink-2)'}}>{_catLabel(draft.category)}</span>
          </div>
          <div className="tabular" style={{fontSize:42, fontWeight:600, letterSpacing:'-0.025em', color: isIncome ? 'var(--ok)' : 'var(--ink)', lineHeight:1}}>
            {isIncome ? '+' : '−'}₹{Number(draft.amount || 0).toLocaleString('en-IN')}
          </div>
          {editMode && (
            <input type="text" inputMode="numeric" value={draft.amount}
              onChange={(e) => setDraft({...draft, amount: e.target.value.replace(/[^\d.]/g,'')})}
              style={{display:'block', margin:'10px auto 0', padding:'7px 14px', borderRadius:8, border:'1.5px solid var(--brand)', background:'var(--surface-2)', textAlign:'center', fontFamily:'inherit', fontSize:14, width:130, outline:'none'}}
            />
          )}
          <div className="h3" style={{marginTop:14, fontWeight:600}}>
            {editMode ? (
              <input value={draft.merchant} onChange={(e) => setDraft({...draft, merchant:e.target.value})}
                style={{padding:'7px 14px', borderRadius:8, border:'1.5px solid var(--brand)', background:'var(--surface-2)', fontFamily:'inherit', fontSize:18, fontWeight:600, textAlign:'center', outline:'none', width:'100%', maxWidth:280}}
              />
            ) : draft.merchant}
          </div>
          <div className="small mono" style={{marginTop:4, color:'var(--ink-3)'}}>{dateLong}</div>
        </div>

        {/* meta card */}
        <div className="card fade-up fade-up-3" style={{padding:0, marginBottom:14}}>
          <DetailRow icon="store" label="Merchant" value={draft.merchant || '—'}/>
          <Divider/>

          {/* Category — tappable picker in edit mode */}
          {editMode ? (
            <div onClick={() => setCatPicker(true)} style={{cursor:'pointer', display:'flex', alignItems:'center', gap:12, padding:'14px 16px'}}>
              <div style={{width:30,height:30,borderRadius:8,background:'var(--brand-soft)',display:'grid',placeItems:'center',color:'var(--brand)',flexShrink:0}}>
                <Icon name="folder" size={14}/>
              </div>
              <div style={{flex:1}}>
                <div className="label" style={{fontSize:10}}>Category</div>
                <div style={{fontSize:14, fontWeight:500, marginTop:1, color:'var(--brand)'}}>{_catLabel(draft.category)}</div>
              </div>
              <Icon name="chevron" size={16} style={{color:'var(--brand)'}}/>
            </div>
          ) : (
            <DetailRow icon="folder" label="Category" value={_catLabel(draft.category)}/>
          )}
          <Divider/>

          {/* Label/type */}
          {editMode ? (
            <div style={{display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px'}}>
              <div style={{width:30,height:30,borderRadius:8,background:'var(--surface-2)',display:'grid',placeItems:'center',color:'var(--ink-3)',flexShrink:0,marginTop:2}}>
                <Icon name="wallet" size={14}/>
              </div>
              <div style={{flex:1}}>
                <div className="label" style={{fontSize:10, marginBottom:8}}>Type</div>
                <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                  {TX_LABELS.map(l => (
                    <button key={l} onClick={() => setDraft({...draft, label:l})}
                      style={{padding:'5px 10px', borderRadius:999, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', fontFamily:'inherit',
                        background: draft.label===l ? 'var(--brand)' : 'var(--surface-2)',
                        color:      draft.label===l ? '#fff'         : 'var(--ink-3)'}}>
                      {l.replace(/_/g,' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <DetailRow icon="wallet" label="Type" value={(draft.label||'expense').replace(/_/g,' ')}/>
          )}
          <Divider/>

          <DetailRow icon="calendar" label="Date" value={dateLong}/>
          <Divider/>

          {/* Note — inline textarea in edit mode */}
          {editMode ? (
            <div style={{display:'flex', alignItems:'flex-start', gap:12, padding:'14px 16px'}}>
              <div style={{width:30,height:30,borderRadius:8,background:'var(--surface-2)',display:'grid',placeItems:'center',color:'var(--ink-3)',flexShrink:0,marginTop:2}}>
                <Icon name="note" size={14}/>
              </div>
              <div style={{flex:1}}>
                <div className="label" style={{fontSize:10, marginBottom:4}}>Note</div>
                <textarea value={draft.note} onChange={(e) => setDraft({...draft, note:e.target.value})}
                  placeholder="Add a note…" rows={2}
                  style={{width:'100%', border:'1.5px solid var(--brand)', borderRadius:8, padding:'7px 10px', fontFamily:'inherit', fontSize:13, resize:'none', background:'var(--surface-2)', outline:'none', color:'var(--ink)'}}
                />
              </div>
            </div>
          ) : (
            <DetailRow icon="note" label="Note" value={draft.note || 'No note'} muted={!draft.note}/>
          )}
        </div>

        {/* source */}
        <div className="card fade-up fade-up-4" style={{padding:0, marginBottom:14}}>
          <div onClick={() => setShowSource(true)} style={{cursor:'pointer'}}>
            <DetailRow
              icon={tx.source === 'Gmail' || tx.source === 'gmail' ? 'mail' : tx.source === 'SMS' || tx.source === 'sms' ? 'zap' : 'edit'}
              label="Source"
              value={tx.sourceDetail || (tx.source ? tx.source.charAt(0).toUpperCase()+tx.source.slice(1) : 'Manual')}
              chevron
            />
          </div>
        </div>

        {/* action tiles */}
        <div className="fade-up fade-up-6" style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:14}}>
          <ActionTile icon="split"  label="Split"  onClick={() => setShowSplit(true)}/>
          <ActionTile icon="repeat" label="Repeat" onClick={() => {}}/>
          <ActionTile icon="trash"  label="Delete" tone="err" onClick={() => setConfirmDel(true)}/>
        </div>

      </div>

      {/* CATEGORY PICKER SHEET */}
      {catPicker && (
        <>
          <div className="scrim open" onClick={() => setCatPicker(false)}/>
          <div className="sheet open" style={{maxHeight:'72%', display:'flex', flexDirection:'column', paddingBottom:24}}>
            <div className="grabber"/>
            <div style={{padding:'4px 22px 14px', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
              <div className="h3">Choose category</div>
              <button onClick={() => setCatPicker(false)} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div style={{overflowY:'auto', padding:'0 16px 8px'}}>
              <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8}}>
                {TX_CATS.map(c => (
                  <button key={c.k} onClick={() => { setDraft({...draft, category:c.k}); setCatPicker(false); }}
                    style={{padding:'14px 8px', borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', gap:7,
                      background: draft.category===c.k ? 'var(--brand-soft)' : 'var(--surface-2)',
                      border:     draft.category===c.k ? '1.5px solid var(--brand)' : '1.5px solid transparent',
                      color:      draft.category===c.k ? 'var(--brand)' : 'var(--ink-2)',
                      cursor:'pointer', fontFamily:'inherit'}}>
                    <Icon name={c.icon} size={22}/>
                    <span style={{fontSize:11, fontWeight:600, textAlign:'center', lineHeight:1.2}}>{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

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
            <div className="h3" style={{marginTop:6}}>Delete this transaction?</div>
            <div className="body" style={{marginTop:6, color:'var(--ink-2)'}}>
              It will be excluded from all reports and stats. The original {tx.source || 'source'} message stays in your inbox.
            </div>
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

const DetailRow = ({ icon, label, value, chevron, muted }) => (
  <div style={{display:'flex', alignItems:'center', gap:12, padding:'14px 16px'}}>
    <div style={{width:30,height:30,borderRadius:8,background:'var(--surface-2)',display:'grid',placeItems:'center',color:'var(--ink-3)',flexShrink:0}}>
      <Icon name={icon} size={14}/>
    </div>
    <div style={{flex:1, minWidth:0}}>
      <div className="label" style={{fontSize:10}}>{label}</div>
      <div style={{fontSize:14, fontWeight:500, color:muted?'var(--ink-4)':'var(--ink)', marginTop:1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{value}</div>
    </div>
    {chevron && <Icon name="chevron" size={16} style={{color:'var(--ink-3)'}}/>}
  </div>
);

const ActionTile = ({ icon, label, tone, onClick }) => (
  <button onClick={onClick} className="card btn" style={{
    padding:'14px 8px', borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', gap:6,
    color: tone==='err' ? 'var(--err)' : 'var(--ink-2)', background:'var(--surface)', cursor:'pointer',
  }}>
    <Icon name={icon} size={18}/>
    <span style={{fontSize:11, fontWeight:600}}>{label}</span>
  </button>
);

// ============================================================
// SOURCE SHEET
// ============================================================
const SourceSheet = ({ tx, onClose }) => {
  const srcUpper = tx.source ? tx.source.charAt(0).toUpperCase()+tx.source.slice(1) : 'Manual';
  return (
    <>
      <div className="scrim open" onClick={onClose}/>
      <div className="sheet open" style={{maxHeight:'80%', display:'flex', flexDirection:'column', paddingBottom:16}}>
        <div className="grabber"/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 12px'}}>
          <div>
            <div className="h3">Source · {srcUpper}</div>
            <div className="small mono" style={{marginTop:2}}>Parsed {tx.parsedAgo || 'automatically'}</div>
          </div>
          <button onClick={onClose} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}>
            <Icon name="x" size={16}/>
          </button>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'4px 22px 0'}}>
          {(tx.source === 'Gmail' || tx.source === 'gmail') ? (
            <div className="card" style={{padding:16, marginBottom:12}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10, marginBottom:10}}>
                <div style={{minWidth:0, flex:1}}>
                  <div style={{fontSize:13, fontWeight:600}}>{tx.emailFrom || (tx.merchant ? tx.merchant+'<no-reply@receipt.com>' : 'Gmail receipt')}</div>
                  <div className="small mono" style={{marginTop:2}}>to me · {tx.dateLong || _fmtDateLong(tx.txn_date)}</div>
                </div>
                <Badge tone="ok"><Icon name="check" size={9} stroke={3}/> matched</Badge>
              </div>
              <div style={{fontSize:14, fontWeight:600, marginTop:8}}>{tx.emailSubject || `Receipt — ${tx.merchant}`}</div>
              <div style={{padding:14, borderRadius:10, background:'var(--surface-2)', marginTop:12, fontSize:13, lineHeight:1.5, color:'var(--ink-2)'}}>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:4, padding:'10px 0', borderTop:'1px dashed var(--line-strong)', borderBottom:'1px dashed var(--line-strong)'}}>
                  <span>Amount</span>
                  <span className="mono tabular" style={{fontWeight:600, color:'var(--ink)'}}>₹{Number(tx.amount).toLocaleString('en-IN')}</span>
                </div>
                <div style={{marginTop:10, fontSize:12, color:'var(--ink-3)'}}>Merchant: {tx.merchant}</div>
              </div>
            </div>
          ) : (tx.source === 'SMS' || tx.source === 'sms') ? (
            <div className="card" style={{padding:14, marginBottom:12}}>
              <div className="small mono" style={{color:'var(--ink-3)', marginBottom:8}}>SMS · {tx.dateLong || _fmtDateLong(tx.txn_date)}</div>
              <div style={{padding:'14px 16px', borderRadius:14, background:'var(--brand-soft)', fontSize:13, lineHeight:1.5, color:'var(--ink)'}}>
                Debited ₹{tx.amount} from account to {tx.merchant} on {tx.dateLong || _fmtDateLong(tx.txn_date)}.
              </div>
            </div>
          ) : (
            <div className="card" style={{padding:18, marginBottom:12, textAlign:'center'}}>
              <Icon name="edit" size={32} style={{color:'var(--ink-3)'}}/>
              <div style={{fontSize:14, fontWeight:600, marginTop:10}}>Manually added</div>
              <div className="small" style={{marginTop:4}}>Added on {tx.dateLong || _fmtDateLong(tx.txn_date)}</div>
            </div>
          )}

          <div className="label" style={{margin:'14px 4px 8px'}}>What we extracted</div>
          <div className="card" style={{padding:0, marginBottom:14}}>
            <ExtractRow label="Merchant" value={tx.merchant || '—'} confidence={0.95}/>
            <Divider/>
            <ExtractRow label="Amount" value={`₹${Number(tx.amount).toLocaleString('en-IN')}`} confidence={0.99}/>
            <Divider/>
            <ExtractRow label="Category" value={_catLabel(tx.category)} confidence={0.85} aiInferred/>
            <Divider/>
            <ExtractRow label="Date" value={tx.dateLong || _fmtDateLong(tx.txn_date)} confidence={0.99}/>
          </div>
        </div>
      </div>
    </>
  );
};

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
        <div style={{width:`${Math.round(confidence*100)}%`, height:'100%', background: confidence>0.95?'var(--ok)':confidence>0.85?'var(--brand)':'var(--warn)'}}/>
      </div>
      <span className="mono tabular" style={{fontSize:10, color:'var(--ink-3)', minWidth:30}}>{Math.round(confidence*100)}%</span>
    </div>
  </div>
);

// ============================================================
// SPLIT SHEET
// ============================================================
const SplitSheet = ({ tx, onClose, onApply }) => {
  const [parts, setParts] = useStateN([
    { who:'You',   amount: Math.round((tx.amount||0)/2) },
    { who:'Other', amount: Math.round((tx.amount||0)/2) },
  ]);
  const total     = parts.reduce((s,p) => s + Number(p.amount||0), 0);
  const remaining = (tx.amount||0) - total;

  return (
    <>
      <div className="scrim open" onClick={onClose}/>
      <div className="sheet open" style={{maxHeight:'82%', display:'flex', flexDirection:'column', paddingBottom:16}}>
        <div className="grabber"/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 12px'}}>
          <div>
            <div className="h3">Split this expense</div>
            <div className="small" style={{marginTop:2}}>{tx.merchant} · ₹{Number(tx.amount||0).toLocaleString('en-IN')}</div>
          </div>
          <button onClick={onClose} className="btn-ghost btn" style={{padding:6, borderRadius:'50%', width:32, height:32, display:'grid', placeItems:'center'}}>
            <Icon name="x" size={16}/>
          </button>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'0 22px 4px'}}>
          {parts.map((p,i) => (
            <div key={i} className="card" style={{padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:34,height:34,borderRadius:'50%',background:'var(--brand-50)',color:'var(--brand)',display:'grid',placeItems:'center',fontSize:13,fontWeight:600}}>
                {p.who[0]?.toUpperCase()}
              </div>
              <div style={{flex:1, minWidth:0}}>
                <input value={p.who} onChange={(e) => setParts(parts.map((x,j) => j===i ? {...x,who:e.target.value} : x))}
                  style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:600, outline:'none', width:'100%'}}/>
              </div>
              <div style={{display:'flex', alignItems:'center', gap:6, padding:'6px 10px', borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--line)'}}>
                <span className="small">₹</span>
                <input value={p.amount} inputMode="numeric"
                  onChange={(e) => setParts(parts.map((x,j) => j===i ? {...x,amount:e.target.value.replace(/[^\d]/g,'')} : x))}
                  style={{border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, fontWeight:600, outline:'none', width:60, textAlign:'right'}}/>
              </div>
              {parts.length > 2 && (
                <button onClick={() => setParts(parts.filter((_,j)=>j!==i))} style={{border:'none',background:'transparent',cursor:'pointer',color:'var(--err)',padding:4}}>
                  <Icon name="x" size={14}/>
                </button>
              )}
            </div>
          ))}
          <button onClick={() => setParts([...parts, {who:`Person ${parts.length+1}`, amount:0}])}
            className="btn btn-ghost"
            style={{width:'100%', padding:10, marginTop:4, border:'1px dashed var(--line-strong)', borderRadius:10}}>
            + Add person
          </button>
        </div>
        <div style={{padding:'12px 22px 6px', display:'flex', justifyContent:'space-between', alignItems:'center', borderTop:'1px solid var(--line)'}}>
          <span className="small">Remaining</span>
          <span className="mono tabular" style={{fontSize:14, fontWeight:600, color: remaining===0 ? 'var(--ok)' : 'var(--err)'}}>
            ₹{remaining.toLocaleString('en-IN')}
          </span>
        </div>
        <div style={{padding:'4px 22px 8px'}}>
          <button onClick={onApply} disabled={remaining!==0} className="btn btn-primary" style={{width:'100%', padding:12, opacity:remaining===0?1:0.5}}>
            Apply split
          </button>
        </div>
      </div>
    </>
  );
};

Object.assign(window, { TxDetail, SourceSheet, SplitSheet });
