// @ts-nocheck
const Input = ({ label, error, hint, prefix, type = "text", value, onChange, placeholder, style, className = "", id, ...props }) => {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
  const errorStyle = error ? { borderColor: "var(--neg)" } : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0, ...style }} className={className}>
      {label && (
        <label
          htmlFor={inputId}
          className="label-upper"
          style={{ display: "block", marginBottom: 4 }}
        >
          {label}
        </label>
      )}
      <div style={{ display: "flex", alignItems: "center", position: "relative" }}>
        {prefix && (
          <span style={{
            position: "absolute",
            left: 10,
            color: "var(--ink-3)",
            fontSize: "0.8125rem",
            fontFamily: "'Geist', sans-serif",
            pointerEvents: "none",
            lineHeight: 1,
            zIndex: 1,
          }}>
            {prefix}
          </span>
        )}
        <input
          id={inputId}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          style={{
            width: "100%",
            paddingLeft: prefix ? 28 : undefined,
            ...errorStyle,
          }}
          {...props}
        />
      </div>
      {error ? (
        <span style={{ color: "var(--neg)", fontSize: "0.6875rem", marginTop: 4, fontFamily: "'Geist', sans-serif" }}>
          {error}
        </span>
      ) : hint ? (
        <span style={{ color: "var(--ink-3)", fontSize: "0.6875rem", marginTop: 4, fontFamily: "'Geist', sans-serif" }}>
          {hint}
        </span>
      ) : null}
    </div>
  );
};

(window as any).Input = Input;
