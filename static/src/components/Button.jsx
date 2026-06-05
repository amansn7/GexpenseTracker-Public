const Button = ({ variant = "primary", size = "md", loading = false, disabled = false, icon, children, onClick, type = "button", style, className = "", ...props }) => {
  const sizeMap = { sm: "5px 10px", md: "7px 18px", lg: "10px 24px" };
  const padding = sizeMap[size] || sizeMap.md;

  const fontSizeMap = { sm: 11, md: 13, lg: 15 };
  const fontSize = fontSizeMap[size] || fontSizeMap.md;

  const spinnerSize = size === "sm" ? "spinner-sm" : size === "lg" ? "spinner-md" : "spinner";

  let classes = "btn-press focus-ring";
  let baseStyles = { padding, fontSize, fontFamily: "'Geist', sans-serif", fontWeight: 500, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6, transition: "filter 150ms, background 150ms" };
  let variantStyles = {};
  let disabledStyles = {};
  let spinnerColor = "currentColor";

  if (variant === "primary") {
    classes += " btn-primary";
    spinnerColor = "var(--on-accent)";
  } else if (variant === "ghost") {
    classes += " btn-ghost";
  } else if (variant === "subtle") {
    classes += " btn-ghost-subtle";
    baseStyles = { ...baseStyles, padding };
  } else if (variant === "danger") {
    variantStyles = { background: "var(--neg-soft)", color: "var(--neg)", border: "1px solid var(--neg-soft)", borderRadius: "var(--r-sm)" };
  }

  if (disabled || loading) {
    disabledStyles = { opacity: 0.5, cursor: "not-allowed", pointerEvents: "none" };
  }

  return (
    <button
      type={type}
      className={`${classes} ${className}`.trim()}
      style={{ ...baseStyles, ...variantStyles, ...disabledStyles, ...style }}
      onClick={disabled || loading ? undefined : onClick}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className={spinnerSize} style={{ borderTopColor: spinnerColor, flexShrink: 0 }} />
      ) : icon ? (
        <span style={{ display: "inline-flex", alignItems: "center", lineHeight: 0 }}>{icon}</span>
      ) : null}
      {children}
    </button>
  );
};

window.Button = Button;
