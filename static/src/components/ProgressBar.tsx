// @ts-nocheck
const ProgressBar = ({ value = 0, size = "md", color = "accent", animated = true, showLabel = false, className = "", style }) => {
  const pct = Math.min(value, 100);
  const sizePx = size === "sm" ? 4 : 6;
  const colorMap = { accent: "var(--accent)", pos: "var(--pos)", neg: "var(--neg)", amber: "var(--amber)" };
  const fillColor = colorMap[color] || colorMap.accent;
  const transition = animated ? "transform 600ms var(--ease-out-quart)" : "none";

  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      className={className}
      style={{ display: "flex", alignItems: "center", gap: 8, ...style }}
    >
      <div style={{ flex: 1, height: sizePx, borderRadius: 99, background: "var(--line)", overflow: "hidden" }}>
        <div style={{
          height: "100%", borderRadius: 99, background: fillColor,
          transition,
          transform: `scaleX(${pct / 100})`,
          transformOrigin: "left",
          ...(value >= 100 ? { animation: "pbar-pulse 2s var(--ease-out-quart) infinite" } : {})
        }} />
      </div>
      {value >= 100 && <style>{`@keyframes pbar-pulse{0%,100%{opacity:1}50%{opacity:0.55}}`}</style>}
      {showLabel && (
        <span style={{
          fontSize: "0.75rem", color: "var(--ink-3)", fontVariantNumeric: "tabular-nums",
          flexShrink: 0, minWidth: 36, textAlign: "right"
        }}>
          {Math.round(value)}%
        </span>
      )}
    </div>
  );
};

(window as any).ProgressBar = ProgressBar;
