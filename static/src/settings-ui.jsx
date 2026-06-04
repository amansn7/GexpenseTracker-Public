// Shared settings UI components — Modal, DataTable, Section, Row, helpers

const mqOverrides = (isMobile) => ({
  wrap: isMobile ? { height: window.mobileStyles.navOffset } : {},
  inner: isMobile ? { padding: "16px 14px 80px" } : {},
  section: isMobile ? { padding: "12px 14px" } : {},
  row: isMobile ? { gridTemplateColumns: "1fr", gap: 8, padding: "10px 0" } : {},
  h1: isMobile ? { fontSize: 22 } : {},
});

const Modal = ({ open, onClose, title, children, width = 420, danger = false }) => {
  const [closing, setClosing] = React.useState(false);
  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { onClose(); setClosing(false); }, 150);
  };
  if (!open) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      className={closing ? "backdrop-out" : "backdrop-in"} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className={closing ? "modal-out" : "modal-in"}
        style={{ background: "var(--card)", border: danger ? "1px solid var(--neg-soft)" : "1px solid var(--line)", borderRadius: 12, padding: 28, width: "100%", maxWidth: width }}>
        {title && <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 18, fontWeight: 500, color: danger ? "var(--neg)" : "var(--ink)", marginBottom: 8 }}>{title}</div>}
        {children}
      </div>
    </div>
  );
};

const SettingsSection = ({ title, subtitle, children, danger = false, action, style }) => (
  <div style={{ ...window.accountStyles.section, ...(danger ? { border: "1px solid var(--neg-soft)" } : {}), ...style }}>
    {title && (
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <h3 style={{ ...window.accountStyles.sectionTitle, ...(danger ? { color: "var(--neg)" } : {}) }}>{title}</h3>
        {action}
      </div>
    )}
    {subtitle && <div style={window.accountStyles.sectionSub}>{subtitle}</div>}
    {children}
  </div>
);

const SettingsRow = ({ label, description, children, last = false }) => (
  <div style={{ ...window.accountStyles.row, ...(last ? window.accountStyles.rowLast : {}) }}>
    <div>
      <div style={window.accountStyles.label}>{label}</div>
      {description && <div style={window.accountStyles.sub}>{description}</div>}
    </div>
    <div />
    {children}
  </div>
);

const DataTable = ({ columns, rows, loading, error, emptyMessage = "Nothing here yet.", emptyAction, page, total, pageSize, onPageChange }) => {
  const TH = { padding: "10px 12px", textAlign: "left", borderBottom: "1px solid var(--line)", fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600 };
  const TD = { padding: "11px 12px", borderBottom: "1px solid var(--line)", verticalAlign: "middle", fontSize: 13 };
  const totalPages = pageSize && total ? Math.ceil(total / pageSize) : 0;

  if (loading) return <div style={{ fontSize: 13, color: "var(--ink-3)", padding: "12px 0" }}>Loading…</div>;
  if (error) return <div style={{ padding: 10, background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: 13, marginBottom: 8 }}>{error}</div>;
  if (!rows || rows.length === 0) return (
    <div style={{ fontSize: 13, color: "var(--ink-4)", padding: "12px 0", fontStyle: "italic" }}>
      {emptyMessage}
      {emptyAction}
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr>{columns.map((col, i) => <th key={i} style={{ ...TH, ...(col.thStyle || {}) }}>{col.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => (
          <tr key={row.id || i}>
            {columns.map((col, j) => {
              const val = typeof col.render === "function" ? col.render(row) : row[col.key];
              return <td key={j} style={{ ...TD, ...(col.tdStyle || {}) }}>{val != null ? val : ""}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
      {totalPages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0 4px", fontSize: 12, color: "var(--ink-3)" }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 11 }}>
            {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
          </span>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => onPageChange(page - 1)} disabled={page === 0}
              style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: page === 0 ? "var(--paper-2)" : "var(--paper)", color: page === 0 ? "var(--ink-4)" : "var(--ink-3)", fontSize: 11, fontWeight: 500, cursor: page === 0 ? "default" : "pointer" }}>← Prev</button>
            <button onClick={() => onPageChange(page + 1)} disabled={(page + 1) >= totalPages}
              style={{ padding: "4px 10px", border: "1px solid var(--line)", borderRadius: 4, background: (page + 1) >= totalPages ? "var(--paper-2)" : "var(--paper)", color: (page + 1) >= totalPages ? "var(--ink-4)" : "var(--ink-3)", fontSize: 11, fontWeight: 500, cursor: (page + 1) >= totalPages ? "default" : "pointer" }}>Next →</button>
          </div>
        </div>
      )}
    </div>
  );
};

const labelBadge = (l) => {
  const s = { expense: { background: "var(--neg-soft)", color: "var(--neg)" }, income: { background: "var(--pos-soft)", color: "var(--pos)" }, ignore: { background: "var(--paper-2)", color: "var(--ink-3)" } }[l] || {};
  return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, fontWeight: 600, letterSpacing: "0.03em", ...s }}>{l}</span>;
};

const confColor = (c) => c >= 0.85 ? "var(--pos)" : c >= 0.65 ? "var(--accent)" : "var(--neg)";

const TabBtn = ({ active, onClick, children, compact, style }) => (
  <button type="button" onClick={onClick}
    style={{ padding: compact ? "5px 10px" : "6px 14px", borderRadius: 20, border: "none", cursor: "pointer",
      fontSize: compact ? 11 : 12,
      background: active ? "var(--ink)" : "transparent",
      color: active ? "var(--paper)" : "var(--ink-3)", fontFamily: "inherit", ...style }}>
    {children}
  </button>
);

const AdminTabBtn = ({ active, onClick, children, compact }) => (
  <button type="button" onClick={onClick}
    style={{ padding: compact ? "4px 10px" : "5px 13px", borderRadius: 20, cursor: "pointer",
      fontSize: compact ? 11 : 12, fontWeight: 700,
      border: "1.5px dashed var(--red)",
      background: active ? "color-mix(in srgb, var(--red) 10%, transparent)" : "transparent",
      color: "var(--red)", fontFamily: "inherit", letterSpacing: "0.3px" }}>
    ⚡ {children}
  </button>
);

Object.assign(window, { Modal, SettingsSection, SettingsRow, DataTable, labelBadge, confColor, mqOverrides, TabBtn, AdminTabBtn });
