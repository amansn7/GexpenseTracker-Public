const fmtMoney = (n, showSign = false) => {
  const sign = n > 0 ? "+" : n < 0 ? "\u2212" : "";
  const abs = Math.abs(n).toLocaleString("en-IN");
  return (showSign ? sign : "") + "\u20B9" + abs;
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
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return "Unknown date";
  const today = new Date(); today.setHours(0,0,0,0);
  const diff = Math.round((today - d) / (24*60*60*1000));
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" });
};

const MerchantLogo = ({ merchant, size = 26 }) => {
  const safe = merchant || "";
  const letters = safe.replace(/[^A-Za-z]/g,"").slice(0,2).toUpperCase();
  const hash = [...safe].reduce((a,c)=>a+c.charCodeAt(0),0);
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
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}
    >
      {icon && <Icon name={icon} size={13} stroke={active ? "currentColor" : "var(--ink-4)"} style={inboxStyles.chipIcon} />}
      {label}
      {count != null && <span style={inboxStyles.chipCount}>{count}</span>}
    </button>
  );
};

const SkeletonRow = () => (
  <div style={{ display: "grid", gridTemplateColumns: "24px 16px 26px minmax(0, 1fr) 150px 100px 130px", gap: 12, alignItems: "center", padding: "13px 28px", borderBottom: "1px solid var(--line)" }}>
    <div className="skeleton" style={{ width: 14, height: 14, borderRadius: 3 }} />
    <div className="skeleton" style={{ width: 6, height: 6, borderRadius: 999 }} />
    <div className="skeleton" style={{ width: 26, height: 26, borderRadius: 6 }} />
    <div>
      <div className="skeleton" style={{ width: "60%", height: 12, marginBottom: 4 }} />
      <div className="skeleton" style={{ width: "40%", height: 10 }} />
    </div>
    <div className="skeleton" style={{ width: 56, height: 10, marginLeft: "auto" }} />
    <div className="skeleton" style={{ width: 30, height: 10, marginLeft: "auto" }} />
    <div className="skeleton" style={{ width: 56, height: 14, marginLeft: "auto" }} />
  </div>
);

window.fmtMoney = fmtMoney;
window.groupByDate = groupByDate;
window.dateLabel = dateLabel;
window.MerchantLogo = React.memo(MerchantLogo);
window.CategoryChip = React.memo(CategoryChip);
window.Confidence = React.memo(Confidence);
window.FilterChip = React.memo(FilterChip);
window.SkeletonRow = React.memo(SkeletonRow);
