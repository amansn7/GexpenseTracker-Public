// ============================================================
// UNIVERSAL FILTER BAR — shared by Activity, Insights, etc.
// ============================================================
// Usage:
//   const f = useFilters({ time:'month', type:'all', cats:[] });
//   <FilterBar filters={f} groups={ACTIVITY_GROUPS}/>
//   const visible = applyFilters(rows, f.values);
// ============================================================

const { useState: useFState, useEffect: useFEffect, useMemo: useFMemo } = React;

// ----- shared option sets -----
const FILTER_TIME    = [['today','Today'],['week','Week'],['month','Month'],['90d','90d'],['year','Year']];
const FILTER_TYPE    = [['all','All'],['expense','Out'],['income','In']];
const FILTER_CATS    = [['food','Food'],['travel','Travel'],['bills','Bills'],['shop','Shop'],['subs','Subs'],['fuel','Fuel'],['grocery','Grocery'],['coffee','Coffee']];
const FILTER_ACCOUNTS = [['cards','Cards','card'],['upi','UPI','zap'],['cash','Cash','wallet']];
const FILTER_SOURCES  = [['gmail','Gmail','mail'],['sms','SMS','zap'],['manual','Manual','edit']];

// ----- the hook -----
function useFilters(initial = {}) {
  const [values, setValues] = useFState({
    time: 'month',
    type: 'all',
    cats: [],
    amountMin: '',
    amountMax: '',
    accounts: [],
    sources: [],
    dateFrom: '',
    dateTo: '',
    ...initial,
  });
  const set = (key, val) => setValues(v => ({ ...v, [key]: val }));
  const toggleArr = (key, k) => setValues(v => ({ ...v, [key]: v[key].includes(k) ? v[key].filter(x=>x!==k) : [...v[key], k] }));
  const reset = () => setValues({
    time: 'month', type: 'all', cats: [],
    amountMin: '', amountMax: '', accounts: [], sources: [], dateFrom: '', dateTo: ''
  });
  // counts
  const customCount = (values.amountMin?1:0) + (values.amountMax?1:0)
    + values.accounts.length + values.sources.length
    + (values.dateFrom?1:0) + (values.dateTo?1:0);
  const activeCount = (values.time !== 'month' ? 1 : 0)
    + (values.type !== 'all' ? 1 : 0)
    + values.cats.length
    + customCount;
  return { values, set, toggleArr, reset, customCount, activeCount, replace: setValues };
}

// ----- universal filter function -----
// row: { amount, category, source, account, date(JS Date), type:'expense'|'income' }
function rowMatches(row, f) {
  if (f.type !== 'all' && row.type !== f.type) return false;
  if (f.cats.length && !f.cats.includes(row.category)) return false;
  if (f.amountMin && row.amount < Number(f.amountMin)) return false;
  if (f.amountMax && row.amount > Number(f.amountMax)) return false;
  if (f.accounts.length && !f.accounts.includes(row.account)) return false;
  if (f.sources.length && !f.sources.includes((row.source || '').toLowerCase())) return false;
  // time bucket — synthetic; assumes data has dayOffset (0 = today, increasing into past)
  if (f.time !== 'month' && row.dayOffset !== undefined) {
    const limits = { today: 0, week: 7, month: 30, '90d': 90, year: 365 };
    if (row.dayOffset > limits[f.time]) return false;
  }
  // explicit date range
  if (f.dateFrom && row.date && row.date < new Date(f.dateFrom)) return false;
  if (f.dateTo && row.date && row.date > new Date(f.dateTo)) return false;
  return true;
}

// ----- the bar -----
const FilterBar = ({ filters, groups = ['time','type','cats'], onMore }) => {
  const f = filters;
  const showGroup = (g) => groups.includes(g);
  return (
    <div style={{display:'flex', gap:8, overflowX:'auto', paddingBottom:6, scrollbarWidth:'none'}}>
      {showGroup('time') && FILTER_TIME.map(([k,l]) => (
        <Chip key={'t'+k} active={f.values.time===k} onClick={() => f.set('time', k)}>{l}</Chip>
      ))}
      {showGroup('type') && showGroup('time') && <span style={{width:1, background:'var(--line)', flexShrink:0, margin:'2px 4px'}}/>}
      {showGroup('type') && FILTER_TYPE.map(([k,l]) => (
        <Chip key={'y'+k} active={f.values.type===k} onClick={() => f.set('type', k)}>{l}</Chip>
      ))}
      {showGroup('cats') && (showGroup('type') || showGroup('time')) && <span style={{width:1, background:'var(--line)', flexShrink:0, margin:'2px 4px'}}/>}
      {showGroup('cats') && FILTER_CATS.slice(0,5).map(([k,l]) => (
        <Chip key={'c'+k} active={f.values.cats.includes(k)} onClick={() => f.toggleArr('cats', k)}>{l}</Chip>
      ))}
      <button onClick={onMore} className="chip" style={{border:'1px dashed var(--line-strong)', background:'transparent', flexShrink:0, fontWeight:600, gap:5, cursor:'pointer'}}>
        <Icon name="filter" size={11} stroke={2.2}/>
        More{f.customCount > 0 ? ` · ${f.customCount}` : ''}
      </button>
      {f.activeCount > 0 && (
        <button onClick={f.reset} className="chip" style={{background:'transparent', color:'var(--ink-3)', border:'none', flexShrink:0, fontWeight:500, gap:4, cursor:'pointer'}}>
          <Icon name="x" size={10} stroke={2.4}/>
          Clear
        </button>
      )}
    </div>
  );
};

// ----- the More sheet -----
const FilterSheet = ({ open, onClose, filters, presets = [] }) => {
  if (!open) return null;
  const f = filters;
  return (
    <React.Fragment>
      <div className="scrim open" onClick={onClose}/>
      <div className="sheet open" style={{paddingBottom:8, maxHeight:'82%'}}>
        <div className="grabber"/>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 22px 14px'}}>
          <div className="h3">More filters</div>
          <button onClick={onClose} className="btn-ghost btn" style={{padding:'6px 12px', fontSize:12, fontWeight:600, cursor:'pointer'}}>Done</button>
        </div>
        <div style={{flex:1, overflowY:'auto', padding:'0 22px 18px'}}>

          <div className="label" style={{marginBottom:8}}>Date range</div>
          <div style={{display:'flex', gap:8, marginBottom:18}}>
            <div style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)'}}>
              <div className="small" style={{marginBottom:2}}>From</div>
              <input type="date" value={f.values.dateFrom} onChange={(e) => f.set('dateFrom', e.target.value)} style={{width:'100%', border:'none', background:'transparent', fontFamily:'inherit', fontSize:13, color:'var(--ink)', outline:'none'}}/>
            </div>
            <div style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)'}}>
              <div className="small" style={{marginBottom:2}}>To</div>
              <input type="date" value={f.values.dateTo} onChange={(e) => f.set('dateTo', e.target.value)} style={{width:'100%', border:'none', background:'transparent', fontFamily:'inherit', fontSize:13, color:'var(--ink)', outline:'none'}}/>
            </div>
          </div>

          <div className="label" style={{marginBottom:8}}>Amount range</div>
          <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:10}}>
            <div style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)', display:'flex', alignItems:'center', gap:6}}>
              <span className="small">₹</span>
              <input inputMode="numeric" placeholder="Min" value={f.values.amountMin} onChange={(e) => f.set('amountMin', e.target.value.replace(/[^\d]/g,''))} style={{width:'100%', border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, color:'var(--ink)', outline:'none'}}/>
            </div>
            <span style={{color:'var(--ink-3)'}}>—</span>
            <div style={{flex:1, padding:'10px 12px', borderRadius:10, border:'1px solid var(--line)', background:'var(--surface-2)', display:'flex', alignItems:'center', gap:6}}>
              <span className="small">₹</span>
              <input inputMode="numeric" placeholder="Max" value={f.values.amountMax} onChange={(e) => f.set('amountMax', e.target.value.replace(/[^\d]/g,''))} style={{width:'100%', border:'none', background:'transparent', fontFamily:'inherit', fontSize:14, color:'var(--ink)', outline:'none'}}/>
            </div>
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:18}}>
            {[['<500','',500],['500-2k',500,2000],['2k-10k',2000,10000],['>10k',10000,'']].map(([l,mn,mx]) => (
              <Chip key={l} onClick={() => { f.set('amountMin', mn?String(mn):''); f.set('amountMax', mx?String(mx):''); }}>{l}</Chip>
            ))}
          </div>

          <div className="label" style={{marginBottom:8}}>Accounts</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:18}}>
            {FILTER_ACCOUNTS.map(([k,l,ic]) => (
              <Chip key={k} active={f.values.accounts.includes(k)} onClick={() => f.toggleArr('accounts', k)}>
                <Icon name={ic} size={12}/> {l}
              </Chip>
            ))}
          </div>

          <div className="label" style={{marginBottom:8}}>Source</div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap', marginBottom:18}}>
            {FILTER_SOURCES.map(([k,l,ic]) => (
              <Chip key={k} active={f.values.sources.includes(k)} onClick={() => f.toggleArr('sources', k)}>
                <Icon name={ic} size={12}/> {l}
              </Chip>
            ))}
          </div>

          {presets.length > 0 && <React.Fragment>
            <div className="label" style={{marginBottom:8}}>Quick presets</div>
            <div style={{display:'flex', flexDirection:'column', gap:6}}>
              {presets.map(([l, vals]) => (
                <button key={l} onClick={() => { f.replace(v => ({ ...v, ...vals })); onClose(); }} className="card btn" style={{padding:'12px 14px', textAlign:'left', display:'flex', justifyContent:'space-between', alignItems:'center', borderRadius:12, fontSize:13, fontWeight:500, color:'var(--ink)', cursor:'pointer'}}>
                  <span>{l}</span>
                  <Icon name="chevron" size={14} style={{color:'var(--ink-3)'}}/>
                </button>
              ))}
            </div>
          </React.Fragment>}

          <div style={{height:14}}/>
          <button onClick={() => { f.reset(); onClose(); }} className="btn btn-ghost" style={{width:'100%', padding:13, fontWeight:600, color:'var(--ink-2)', cursor:'pointer'}}>
            Reset all filters
          </button>
        </div>
      </div>
    </React.Fragment>
  );
};

Object.assign(window, { useFilters, FilterBar, FilterSheet, rowMatches, FILTER_TIME, FILTER_TYPE, FILTER_CATS });
