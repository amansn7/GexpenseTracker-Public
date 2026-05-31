const inboxStyles = {
  wrap: { display: "grid", gridTemplateColumns: "minmax(0, 1fr) 420px", gap: 0, height: "calc(100dvh - 72px)", minHeight: 0 },
  wrapNoPanel: { display: "grid", gridTemplateColumns: "minmax(0, 1fr)", height: "calc(100dvh - 72px)" },
  list: { overflowY: "auto", borderRight: "1px solid var(--line)" },
  toolbar: { display: "flex", alignItems: "center", gap: 4, padding: "10px 32px", borderBottom: "1px solid var(--line)", position: "sticky", top: 0, background: "var(--paper)", zIndex: 5, fontSize: 12, color: "var(--ink-3)" },
  chip: { padding: "5px 12px", borderRadius: 20, border: "1px solid transparent", background: "transparent", fontSize: 12, color: "var(--ink-3)", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 500, cursor: "pointer", transition: "all 120ms var(--ease-out-quart)", lineHeight: 1.2 },
  chipHover: { background: "var(--paper-2)" },
  chipActive: { background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)" },
  chipDivider: { width: 1, height: 16, background: "var(--line)", margin: "0 4px", flexShrink: 0 },
  chipCount: { opacity: 0.5, fontFamily: "'Geist Mono', monospace", fontSize: 11, fontVariantNumeric: "tabular-nums" },
  chipIcon: { opacity: 0.7 },

  dayLabel: { padding: "20px 32px 8px", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--ink-4)", fontWeight: 500, background: "var(--paper)", position: "sticky", top: 41, zIndex: 3, display: "flex", alignItems: "baseline", gap: 12 },
  dayTotal: { fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)", textTransform: "none", letterSpacing: 0 },

  row: { display: "grid", gridTemplateColumns: "24px 16px 26px minmax(0, 1fr) 150px 100px 130px", gap: 12, alignItems: "center", padding: "13px 28px", borderBottom: "1px solid var(--line)", cursor: "pointer", transition: "background 120ms var(--ease-out-quart)", position: "relative" },
  rowSelected: { background: "var(--paper-2)" },
  rowUnread: { background: "var(--card)" },

  merchantLogo: { width: 26, height: 26, borderRadius: 6, background: "var(--paper-2)", display: "grid", placeItems: "center", fontFamily: "'Geist', sans-serif", fontWeight: 600, fontSize: 11, color: "var(--ink-2)", border: "1px solid var(--line)" },
  merchantName: { fontWeight: 600, color: "var(--ink)", fontSize: 13 },
  merchantNameUnread: { fontWeight: 700 },
  subject: { color: "var(--ink-3)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },

  amount: { fontFamily: "'Geist Mono', monospace", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: 14, textAlign: "right" },
  amountPos: { color: "var(--pos)" },
  amountNeg: { color: "var(--neg)" },

  catChip: { display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500, whiteSpace: "nowrap" },
  tagDot: { width: 6, height: 6, borderRadius: 999 },
  tagLabel: { fontSize: 10, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500 },

  confBar: { height: 3, borderRadius: 2, background: "var(--line)", overflow: "hidden", width: 56 },
  confFill: { height: "100%", background: "var(--pos)", borderRadius: 2, transition: "transform 200ms var(--ease-out-quart)", transformOrigin: "left" },
  confLow: { background: "var(--accent)" },
  time: { fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" },

  panel: { overflowY: "auto", padding: "28px 28px 0", background: "var(--card)", borderLeft: "1px solid var(--line)", display: "flex", flexDirection: "column" },
  panelBody: { flex: 1, paddingBottom: 16 },
  panelFooter: { position: "sticky", bottom: 0, background: "var(--card)", borderTop: "1px solid var(--line)", padding: "12px 0 max(16px, env(safe-area-inset-bottom, 0px))", marginTop: "auto" },
  panelHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 },
  bigAmount: { fontFamily: "'Geist Mono', monospace", fontSize: 54, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, margin: "8px 0 4px" },
  panelSection: { padding: "16px 0", borderBottom: "1px dashed var(--line)" },
  field: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", fontSize: 13 },
  fieldLabel: { color: "var(--ink-3)", fontSize: 12 },
  fieldVal: { color: "var(--ink)", fontWeight: 500 },
};

window.inboxStyles = inboxStyles;
