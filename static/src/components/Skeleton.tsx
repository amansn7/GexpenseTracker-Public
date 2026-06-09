// @ts-nocheck
const Skeleton = ({ width = "100%", height = 16, variant = "text", count = 1, gap = 8, className = "", style }) => {
  const borderRadiusMap = { text: 4, circle: 999, rect: 6, card: 12 };
  const br = borderRadiusMap[variant] || 4;
  const variantStyle = variant === "card" ? { border: "1px solid var(--line)", padding: 16 } : {};

  const el = (key) => (
    <div
      key={key}
      className={`skeleton ${className}`.trim()}
      style={{ width, height, borderRadius: br, ...variantStyle, ...style }}
    />
  );

  if (count <= 1) return el(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap }}>
      {Array.from({ length: count }, (_, i) => el(i))}
    </div>
  );
};

(window as any).Skeleton = Skeleton;
