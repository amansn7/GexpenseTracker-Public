// @ts-nocheck
// KeyboardHint — reusable floating shortcut reference
// Usage: <KeyboardHint shortcuts={[["j/k", "Navigate"], ["Enter", "Open"]]} storageKey="my_feature_shortcuts" />

const KeyboardHint = ({ shortcuts, storageKey, position = "bottom-left" }) => {
  const [open, setOpen] = React.useState(() => !localStorage.getItem(storageKey));
  const { isMobile } = useViewport();

  const posMap = {
    "bottom-left":  { bottom: isMobile ? 72 : 20, left: 16, right: "auto" },
    "bottom-right": { bottom: isMobile ? 72 : 20, right: 16, left: "auto" },
    "top-left":     { top: 80, left: 16, right: "auto" },
    "top-right":    { top: 80, right: 16, left: "auto" },
  };
  const pos = posMap[position] || posMap["bottom-left"];

  return (
    <div style={{ position: "fixed", zIndex: 45, ...pos }}>
      {open ? (
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 6, padding: "10px 14px", boxShadow: "0 8px 24px -8px var(--shadow-lg)", minWidth: 200 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: "0.625rem", fontWeight: 600, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Shortcuts</span>
            <button onClick={() => { setOpen(false); localStorage.setItem(storageKey, "1"); }} style={{ border: "none", background: "none", cursor: "pointer", color: "var(--ink-4)", padding: 2, display: "flex", lineHeight: 1 }}>
              <Icon name="x" size={12} stroke="currentColor"/>
            </button>
          </div>
          {shortcuts.map(([key, desc]) => (
            <div key={key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: "0.6875rem" }}>
              <span style={{ color: "var(--ink-3)" }}>{desc}</span>
              <kbd style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.625rem", padding: "1px 6px", background: "var(--paper-2)", borderRadius: 3, color: "var(--ink-2)", marginLeft: 12 }}>{key}</kbd>
            </div>
          ))}
        </div>
      ) : (
        <button onClick={() => setOpen(true)} aria-label="Show keyboard shortcuts" style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 10px", borderRadius: 20, border: "1px solid var(--line)", background: "var(--card)", color: "var(--ink-4)", fontSize: "0.6875rem", cursor: "pointer", fontWeight: 500, boxShadow: "0 2px 8px -4px var(--shadow-lg)" }}>
          <Icon name="keyboard" size={13} stroke="currentColor"/>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.625rem", opacity: 0.7 }}>?</span>
        </button>
      )}
    </div>
  );
};

(window as any).KeyboardHint = KeyboardHint;
