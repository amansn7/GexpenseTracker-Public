/* Gexpense Hi-Fi — shared primitives & icons */

/* ===== GxAPI — backend client (session cookie + CSRF) ===== */
const GxAPI = (() => {
  let _csrf = null;

  const _csrfToken = async () => {
    if (_csrf) return _csrf;
    const r = await fetch('/api/auth/csrf-token', { credentials: 'include' });
    if (!r.ok) return '';
    const d = await r.json();
    _csrf = d.csrf_token;
    return _csrf;
  };

  const _handle = async (r) => {
    if (r.status === 401) { window.location.href = '/login?next=/mobile'; return null; }
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  };

  const get  = (path) => fetch(path, { credentials: 'include' }).then(_handle);
  const post = async (path, body) => {
    const tok = await _csrfToken();
    return fetch(path, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tok }, body: JSON.stringify(body) }).then(_handle);
  };
  const patch = async (path, body) => {
    const tok = await _csrfToken();
    return fetch(path, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': tok }, body: JSON.stringify(body) }).then(_handle);
  };

  return { get, post, patch };
})();

/* Auth gate — call once on app mount */
const checkAuth = async () => {
  try {
    const d = await fetch('/api/auth/me', { credentials: 'include' });
    if (d.status === 401) { window.location.href = '/login?next=/mobile'; return null; }
    return d.ok ? d.json() : null;
  } catch { return null; }
};

Object.assign(window, { GxAPI, checkAuth });
const Icon = ({ name, size = 20, stroke = 2, ...rest }) => {
  const paths = {
    home:    <React.Fragment><path d="M3 11.5 12 4l9 7.5"/><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9"/><path d="M10 20v-5h4v5"/></React.Fragment>,
    list:    <React.Fragment><path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></React.Fragment>,
    plus:    <React.Fragment><path d="M12 5v14"/><path d="M5 12h14"/></React.Fragment>,
    chart:   <React.Fragment><path d="M3 3v18h18"/><path d="M7 14l4-4 4 4 5-5"/></React.Fragment>,
    cog:     <React.Fragment><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></React.Fragment>,
    bell:    <React.Fragment><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></React.Fragment>,
    search:  <React.Fragment><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></React.Fragment>,
    chevron: <React.Fragment><path d="m9 18 6-6-6-6"/></React.Fragment>,
    chevronD:<React.Fragment><path d="m6 9 6 6 6-6"/></React.Fragment>,
    arrowUp: <React.Fragment><path d="M7 17 17 7"/><path d="M7 7h10v10"/></React.Fragment>,
    arrowDn: <React.Fragment><path d="M7 7l10 10"/><path d="M17 7v10H7"/></React.Fragment>,
    sparkle: <React.Fragment><path d="M12 3v3"/><path d="M12 18v3"/><path d="M3 12h3"/><path d="M18 12h3"/><path d="M5.6 5.6l2 2"/><path d="M16.4 16.4l2 2"/><path d="M5.6 18.4l2-2"/><path d="M16.4 7.6l2-2"/></React.Fragment>,
    coffee:  <React.Fragment><path d="M17 8h1a4 4 0 0 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v3"/><path d="M10 2v3"/><path d="M14 2v3"/></React.Fragment>,
    mail:    <React.Fragment><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></React.Fragment>,
    sun:     <React.Fragment><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m4.93 19.07 1.41-1.41"/><path d="m17.66 6.34 1.41-1.41"/></React.Fragment>,
    moon:    <React.Fragment><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></React.Fragment>,
    grip:    <React.Fragment><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></React.Fragment>,
    play:    <React.Fragment><polygon points="6 4 20 12 6 20 6 4"/></React.Fragment>,
    refresh: <React.Fragment><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></React.Fragment>,
    shield:  <React.Fragment><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></React.Fragment>,
    download:<React.Fragment><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></React.Fragment>,
    trash:   <React.Fragment><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></React.Fragment>,
    edit:    <React.Fragment><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/></React.Fragment>,
    user:    <React.Fragment><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></React.Fragment>,
    logout:  <React.Fragment><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></React.Fragment>,
    car:     <React.Fragment><path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/></React.Fragment>,
    bag:     <React.Fragment><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></React.Fragment>,
    receipt: <React.Fragment><path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></React.Fragment>,
    repeat:  <React.Fragment><path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/></React.Fragment>,
    swap:    <React.Fragment><path d="M16 3h5v5"/><path d="M21 3l-7 7"/><path d="M8 21H3v-5"/><path d="M3 21l7-7"/></React.Fragment>,
    filter:  <React.Fragment><path d="M22 3H2l8 9.46V19l4 2v-8.54z"/></React.Fragment>,
    flame:   <React.Fragment><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></React.Fragment>,
    lock:    <React.Fragment><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></React.Fragment>,
    zap:     <React.Fragment><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></React.Fragment>,
    db:      <React.Fragment><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3"/></React.Fragment>,
    info:    <React.Fragment><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></React.Fragment>,
    check:   <React.Fragment><path d="M20 6 9 17l-5-5"/></React.Fragment>,
    x:       <React.Fragment><path d="M18 6 6 18"/><path d="m6 6 12 12"/></React.Fragment>,
    calendar:<React.Fragment><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/></React.Fragment>,
    clock:   <React.Fragment><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></React.Fragment>,
    note:    <React.Fragment><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></React.Fragment>,
    wallet:  <React.Fragment><path d="M20 7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-7H21a2 2 0 0 1 0-4h0V7H5"/></React.Fragment>,
    eye:     <React.Fragment><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></React.Fragment>,
    store:   <React.Fragment><path d="M3 9l1-5h16l1 5"/><path d="M5 9v11h14V9"/></React.Fragment>,
    folder:  <React.Fragment><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></React.Fragment>,
    card:    <React.Fragment><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></React.Fragment>,
    split:   <React.Fragment><path d="M16 3h5v5"/><path d="M21 3l-7 7"/></React.Fragment>,
    external:<React.Fragment><path d="M15 3h6v6"/><path d="M10 14L21 3"/></React.Fragment>,
    target:  <React.Fragment><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/></React.Fragment>,
    store:   <React.Fragment><path d="M3 9 4 4h16l1 5"/><path d="M5 9v11h14V9"/><path d="M9 20v-6h6v6"/></React.Fragment>,
    folder:  <React.Fragment><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></React.Fragment>,
    card:    <React.Fragment><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></React.Fragment>,
    split:   <React.Fragment><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/></React.Fragment>,
    target:  <React.Fragment><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/></React.Fragment>,
    external:<React.Fragment><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/></React.Fragment>,
  };
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" {...rest}>
      {paths[name] || null}
    </svg>
  );
};

const Monogram = ({ size = 32, brand = false }) => (
  <div className={`monogram ${brand ? 'brand' : ''}`} style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), fontSize: Math.round(size * 0.44) }}>
    <span style={{ display: 'inline-flex', alignItems: 'baseline' }}>
      <span>G</span>
      <span style={{ fontSize: '0.78em', fontWeight: 500, opacity: 0.85, marginLeft: '-0.06em', marginBottom: '-0.04em' }}>x</span>
    </span>
  </div>
);

const StatusBar = () => (
  <div className="statusbar">
    <span className="tabular">9:41</span>
    <span className="icons">
      <svg viewBox="0 0 18 12" width="18" height="12" fill="currentColor"><rect x="0" y="6" width="3" height="6" rx="1"/><rect x="5" y="3" width="3" height="9" rx="1"/><rect x="10" y="0" width="3" height="12" rx="1"/></svg>
      <svg viewBox="0 0 16 12" width="16" height="12" fill="currentColor"><path d="M8 3a7 7 0 0 1 4.95 2.05l1.4-1.4A9 9 0 0 0 8 1a9 9 0 0 0-6.36 2.65l1.41 1.4A7 7 0 0 1 8 3zm0 4a3 3 0 0 1 2.12.88l1.41-1.41A5 5 0 0 0 8 5a5 5 0 0 0-3.54 1.46l1.42 1.42A3 3 0 0 1 8 7zM8 11l2-2a2.83 2.83 0 0 0-4 0z"/></svg>
      <svg viewBox="0 0 26 12" width="26" height="12" fill="none" stroke="currentColor"><rect x="0.5" y="0.5" width="22" height="11" rx="3"/><rect x="2" y="2" width="17" height="8" rx="1.5" fill="currentColor"/><rect x="23.5" y="4" width="2" height="4" rx="1" fill="currentColor" stroke="none"/></svg>
    </span>
  </div>
);

const TabBar = ({ active, onChange, onAdd }) => (
  <div className="tabbar">
    {[
      ['home', 'Home', 'home'],
      ['transactions', 'Activity', 'list'],
      ['add', '', 'plus'],
      ['insights', 'Insights', 'chart'],
      ['settings', 'Settings', 'cog'],
    ].map(([k, label, icon]) => (
      k === 'add'
        ? <div key={k} className="fab-tab"><button className="fab" onClick={onAdd} aria-label="Add expense"><Icon name="plus" size={26} stroke={2.4}/></button></div>
        : <div key={k} className={`tab ${active === k ? 'active' : ''}`} onClick={() => onChange(k)}>
            <Icon name={icon} size={22} stroke={active === k ? 2.4 : 2}/>
            <span>{label}</span>
          </div>
    ))}
  </div>
);

const Toggle = ({ on, onClick }) => (
  <div className={`toggle ${on ? 'on' : ''}`} onClick={onClick} role="switch" aria-checked={on} />
);

const Badge = ({ tone = 'ok', children }) => (
  <span className={`badge ${tone}`}>{children}</span>
);

const Chip = ({ active, brand, onClick, children }) => (
  <span className={`chip ${active ? 'on' : ''} ${brand ? 'brand' : ''}`} onClick={onClick}>{children}</span>
);

const CatIcon = ({ kind }) => {
  const map = {
    food: ['food', 'coffee'],
    travel: ['travel', 'car'],
    shop: ['shop', 'bag'],
    bills: ['bills', 'receipt'],
    coffee: ['coffee', 'coffee'],
    grocery: ['grocery', 'bag'],
    subs: ['subs', 'repeat'],
    fuel: ['fuel', 'flame'],
    health: ['health', 'shield'],
    rent: ['rent', 'home'],
  };
  const [cls, ico] = map[kind] || ['rent', 'wallet'];
  return <div className={`cat cat-${cls}`}><Icon name={ico} size={20} stroke={2}/></div>;
};

Object.assign(window, { Icon, Monogram, StatusBar, TabBar, Toggle, Badge, Chip, CatIcon });



// ============================================================
// PROFILE MENU — popover from avatar
// ============================================================
const ProfileMenu = ({ open, onClose, onNavigate }) => {
  if (!open) return null;
  const item = (icon, label, sub, onClick, danger) => (
    <button onClick={() => { onClick && onClick(); onClose(); }} className="btn" style={{display:'flex', alignItems:'center', gap:12, padding:'12px 14px', width:'100%', textAlign:'left', background:'transparent', border:'none', cursor:'pointer', color: danger ? 'var(--err)' : 'var(--ink)'}}>
      <div style={{width:30, height:30, borderRadius:8, background: danger ? 'color-mix(in srgb, var(--err) 12%, transparent)' : 'var(--surface-2)', color: danger ? 'var(--err)' : 'var(--ink-2)', display:'grid', placeItems:'center', flexShrink:0}}>
        <Icon name={icon} size={14}/>
      </div>
      <div style={{flex:1, minWidth:0}}>
        <div style={{fontSize:13, fontWeight:600}}>{label}</div>
        {sub && <div className="small" style={{marginTop:1}}>{sub}</div>}
      </div>
    </button>
  );
  return (
    <React.Fragment>
      <div onClick={onClose} style={{position:'absolute', inset:0, zIndex:40, background:'transparent'}}/>
      <div className="card" style={{position:'absolute', top:78, right:18, zIndex:50, width:248, padding:0, boxShadow:'0 12px 32px rgba(0,0,0,0.18)', overflow:'hidden', animation:'fadeUp 160ms ease-out'}}>
        <div style={{padding:'14px 14px 12px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:11}}>
          <div style={{width:40, height:40, borderRadius:'50%', background:'var(--brand-50)', color:'var(--brand)', display:'grid', placeItems:'center', fontSize:16, fontWeight:600, flexShrink:0}}>A</div>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontSize:13, fontWeight:600}}>Aman Sharma</div>
            <div className="small mono" style={{whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>aman@gmail.com</div>
          </div>
        </div>
        <div style={{padding:'4px 0'}}>
          {item('user', 'Profile & account', 'Name, email, plan', () => onNavigate && onNavigate('settings'))}
          {item('wallet', 'Budgets & goals', '6 categories · 3 goals', () => onNavigate && onNavigate('settings', 'budgets'))}
          {item('sparkle', 'AI settings', 'Privacy, model, monthly cap', () => onNavigate && onNavigate('settings', 'ai'))}
          {item('mail', 'Connections', 'Gmail · SMS · Manual', () => onNavigate && onNavigate('settings'))}
          {item('moon', 'Appearance', 'Light / Dark', () => onNavigate && onNavigate('settings'))}
          <div style={{height:1, background:'var(--line)', margin:'4px 0'}}/>
          {item('download', 'Export data', 'CSV · last 12 months')}
          {item('x', 'Sign out', null, null, true)}
        </div>
      </div>
    </React.Fragment>
  );
};

Object.assign(window, { ProfileMenu });
