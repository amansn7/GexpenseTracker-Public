const Transactions = ({ filterPreset = null, onClearPreset = () => {}, onTxOpen = () => {}, onSearch = () => {} }) => {
  const filters = useFilters({
    time: filterPreset === 'this-month' ? 'month' : 'month',
    type: filterPreset === 'this-month' ? 'all' : 'all',
  });
  const [showMore, setShowMore] = useState(false);

  // API-backed state
  const [allRows, setAllRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [syncedAt, setSyncedAt] = useState(null);
  const scrollRef = React.useRef(null);
  const loadingMoreRef = React.useRef(false);

  const LIMIT = 30;

  const formatDay = (dateStr) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((today - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  };

  const mapTx = (tx) => ({
    id: tx.id,
    category: tx.category || 'other',
    merchant: tx.merchant || 'Unknown',
    note: '',
    time: '',
    amount: tx.amount,
    source: tx.source,
    account: '',
    type: tx.label,
    // keep raw fields for onTxOpen
    txn_date: tx.txn_date,
    label: tx.label,
    status: tx.status,
  });

  const groupItems = (items) => {
    const grouped = {};
    items.forEach(tx => {
      const key = tx.txn_date;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(tx);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, txs], i) => ({
        day: formatDay(date),
        dayOffset: i,
        items: txs.map(mapTx),
      }));
  };

  const buildQuery = (currentOffset) => {
    let q = `/api/transactions?limit=${LIMIT}&offset=${currentOffset}`;
    if (filterPreset === 'income') {
      q += '&label=income';
    } else if (filterPreset === 'expense') {
      q += '&label=expense';
    } else if (filterPreset && filterPreset !== 'this-month') {
      // treat as category filter
      q += `&category=${encodeURIComponent(filterPreset)}`;
    }
    return q;
  };

  const fetchTransactions = React.useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offset;
    if (!reset && loadingMoreRef.current) return;
    if (!reset && !hasMore) return;

    if (reset) setLoading(true);
    loadingMoreRef.current = true;

    const data = await GxAPI.get(buildQuery(currentOffset));

    loadingMoreRef.current = false;

    if (!data) {
      if (reset) setLoading(false);
      return;
    }

    const { items, total } = data;
    const newGroups = groupItems(items);

    if (reset) {
      setAllRows(newGroups);
      setOffset(items.length);
      setLoading(false);
    } else {
      // Merge new groups into existing
      setAllRows(prev => {
        const merged = [...prev];
        newGroups.forEach(ng => {
          const existing = merged.find(g => g.day === ng.day);
          if (existing) {
            existing.items = [...existing.items, ...ng.items];
          } else {
            merged.push(ng);
          }
        });
        // Re-sort by dayOffset (earlier inserted groups keep their index)
        return merged;
      });
      setOffset(currentOffset + items.length);
    }

    const fetchedSoFar = reset ? items.length : offset + items.length;
    setHasMore(fetchedSoFar < total);
    setSyncedAt(Date.now());
  }, [filterPreset, offset, hasMore]);

  // Re-fetch when filterPreset changes
  React.useEffect(() => {
    setOffset(0);
    setHasMore(true);
    setAllRows([]);
    setLoading(true);

    const fetchReset = async () => {
      const data = await GxAPI.get(buildQuery(0));
      loadingMoreRef.current = false;
      if (!data) { setLoading(false); return; }
      const { items, total } = data;
      setAllRows(groupItems(items));
      setOffset(items.length);
      setHasMore(items.length < total);
      setSyncedAt(Date.now());
      setLoading(false);
    };
    fetchReset();
  }, [filterPreset]);

  // Scroll-based pagination
  React.useEffect(() => {
    const el = document.querySelector('[data-screen-label="03 Transactions"]');
    if (!el) return;
    const handleScroll = () => {
      if (loadingMoreRef.current || !hasMore) return;
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollTop + clientHeight >= scrollHeight - 200) {
        fetchTransactions(false);
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, [fetchTransactions, hasMore]);

  // apply filters
  const groups = allRows
    .map(g => ({ ...g, items: g.items.filter(r => rowMatches({ ...r, dayOffset: g.dayOffset }, filters.values)) }))
    .filter(g => g.items.length > 0);

  const totalShown = groups.reduce((acc, g) => acc + g.items.length, 0);
  const sumExp = groups.reduce((acc, g) => acc + g.items.filter(r => r.type==='expense').reduce((a,r)=>a+r.amount,0), 0);
  const sumInc = groups.reduce((acc, g) => acc + g.items.filter(r => r.type==='income').reduce((a,r)=>a+r.amount,0), 0);

  const presets = [
    ['Eating out · this week', { time:'week', type:'expense', cats:['food','coffee'] }],
    ['Big purchases · this month', { time:'month', type:'expense', cats:[], amountMin:'2000' }],
    ['Subscriptions only', { type:'expense', cats:['subs'] }],
    ['Income this month', { time:'month', type:'income', cats:[] }],
  ];

  return (
    <div className="scroll" data-screen-label="03 Transactions">
      <div style={{padding:'8px 22px 0'}}>
        <div className="fade-up fade-up-1" style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: 16}}>
          <div className="h2">Activity</div>
          <div style={{display:'flex', gap:8}}>
            <button className="btn-ghost btn" style={{padding:'8px', borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}><Icon name="search" size={16}/></button>
            <button className="btn-ghost btn" style={{padding:'8px', borderRadius:'50%', width:36, height:36, display:'grid', placeItems:'center'}}><Icon name="filter" size={16}/></button>
          </div>
        </div>

        {filterPreset === 'this-month' && (
          <div className="card fade-up fade-up-1" style={{padding:'10px 14px', marginBottom:12, background:'var(--brand-soft)', border:'1px solid color-mix(in srgb, var(--brand) 22%, transparent)', display:'flex', alignItems:'center', gap:10}}>
            <div style={{width:28, height:28, borderRadius:8, background:'var(--brand)', color:'#fff', display:'grid', placeItems:'center', flexShrink:0}}>
              <Icon name="filter" size={14}/>
            </div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{fontSize:13, fontWeight:600, color:'var(--ink)'}}>April expenses · late-March income</div>
              <div className="small" style={{marginTop:1}}>Showing this month's spend & last week of March income</div>
            </div>
            <button className="btn-ghost btn" onClick={onClearPreset} style={{padding:'6px 10px', fontSize:11, fontWeight:600, color:'var(--brand)'}}>Clear</button>
          </div>
        )}

        {/* summary tile — driven by filtered totals */}
        <div className="card fade-up fade-up-2" style={{padding:14, marginBottom:14}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline'}}>
            <div>
              <div className="label">{filters.values.type === 'income' ? 'Income' : filters.values.type === 'expense' ? 'Spent' : 'Net'}</div>
              <div className="tabular" style={{fontSize: 26, fontWeight: 600, letterSpacing:'-0.02em', marginTop:2}}>
                {filters.values.type === 'income' ? '+' : filters.values.type === 'expense' ? '−' : ''}₹{(filters.values.type==='income'?sumInc:filters.values.type==='expense'?sumExp:Math.abs(sumInc-sumExp)).toLocaleString('en-IN')}
              </div>
            </div>
            <div style={{textAlign:'right'}}>
              <div className="label">Transactions</div>
              <div className="tabular" style={{fontSize: 18, fontWeight:600, marginTop:2}}>{totalShown}</div>
            </div>
            {sumInc > 0 && filters.values.type === 'all' && (
              <div style={{textAlign:'right'}}>
                <div className="label">Income</div>
                <div className="tabular" style={{fontSize: 18, fontWeight:600, marginTop:2, color:'var(--ok)'}}>+₹{sumInc.toLocaleString('en-IN')}</div>
              </div>
            )}
          </div>
        </div>

        {/* universal filter bar */}
        <div className="fade-up fade-up-3" style={{marginBottom:14}}>
          <FilterBar filters={filters} onMore={() => setShowMore(true)}/>
        </div>

        {loading && (
          <div style={{padding:'40px 20px', textAlign:'center', color:'var(--ink-3)'}}>Loading transactions...</div>
        )}

        {!loading && groups.length === 0 && (
          <div className="card fade-up fade-up-3" style={{padding:'30px 18px', textAlign:'center', color:'var(--ink-3)'}}>
            <Icon name="filter" size={20}/>
            <div style={{marginTop:8, fontWeight:600, color:'var(--ink-2)'}}>No transactions match</div>
            <div className="small" style={{marginTop:2}}>Try clearing some filters</div>
            <button onClick={filters.reset} className="btn btn-ghost" style={{marginTop:12, padding:'8px 14px', fontSize:12, fontWeight:600, color:'var(--brand)'}}>Reset filters</button>
          </div>
        )}

        {groups.map((g, gi) => {
          const dayTotal = g.items.reduce((a,r)=>a+r.amount,0);
          const isIncomeDay = g.items.every(r => r.type === 'income');
          return (
            <div key={g.day} className={`fade-up fade-up-${(gi%5)+3}`} style={{marginBottom:18}}>
              <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', padding:'4px 4px 8px'}}>
                <div style={{fontSize:13, fontWeight:600, color:'var(--ink-2)'}}>{g.day}</div>
                <div className="mono small tabular" style={{color: isIncomeDay ? 'var(--ok)' : 'var(--ink-2)'}}>
                  {isIncomeDay ? '+' : ''}₹{dayTotal.toLocaleString('en-IN')}
                </div>
              </div>
              <div className="card" style={{padding:'4px 0'}}>
                {g.items.map((r, i) => {
                  const isIncome = r.type === 'income';
                  return (
                    <div key={r.id || i} onClick={() => onTxOpen({ id: r.id, merchant: r.merchant, category: r.category, amount: r.amount, txn_date: r.txn_date, label: r.label, source: r.source, status: r.status })} style={{display:'flex', alignItems:'center', gap:12, padding:'12px 16px', borderBottom: i<g.items.length-1 ? '1px solid var(--line)' : 'none', cursor:'pointer'}}>
                      <CatIcon kind={r.category}/>
                      <div style={{flex:1, minWidth:0}}>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:8}}>
                          <div style={{fontWeight:600, fontSize:14}}>{r.merchant}</div>
                          <div className="tabular" style={{fontWeight:600, fontSize:14, color: isIncome ? 'var(--ok)' : 'var(--ink)'}}>
                            {isIncome ? '+' : '−'}₹{Math.abs(r.amount).toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'baseline', marginTop:2}}>
                          <div className="small">{r.note}</div>
                          <div className="small mono" style={{display:'flex', alignItems:'center', gap:6}}>
                            <span>{r.time}</span>
                            <span style={{fontSize:9, padding:'1px 6px', borderRadius:4, background:'var(--surface-2)', color:'var(--ink-3)'}}>{r.source[0].toUpperCase()+r.source.slice(1)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        <div style={{height:30}}/>
      </div>

      <FilterSheet open={showMore} onClose={() => setShowMore(false)} filters={filters} presets={presets}/>
    </div>
  );
};
// ============================================================
