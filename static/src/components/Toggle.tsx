// @ts-nocheck
const Toggle = ({ checked, onChange, label, disabled = false, id }) => {
  const toggleId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <button
        id={toggleId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="focus-ring"
        style={{
          width: 36,
          height: 20,
          borderRadius: 999,
          padding: 2,
          border: "none",
          cursor: disabled ? "not-allowed" : "pointer",
          background: checked ? "var(--pos)" : "var(--ink-4)",
          transition: "background 160ms",
          display: "flex",
          alignItems: "center",
          opacity: disabled ? 0.5 : 1,
          flexShrink: 0,
        }}
      >
        <span style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          background: "var(--paper)",
          transition: "transform 160ms",
          transform: checked ? "translateX(16px)" : "translateX(0)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
          display: "block",
        }} />
      </button>
      {label && (
        <label
          htmlFor={toggleId}
          style={{
            fontFamily: "'Geist', sans-serif",
            fontSize: "0.8125rem",
            color: "var(--ink)",
            cursor: disabled ? "not-allowed" : "pointer",
            userSelect: "none",
          }}
        >
          {label}
        </label>
      )}
    </div>
  );
};

(window as any).Toggle = Toggle;
