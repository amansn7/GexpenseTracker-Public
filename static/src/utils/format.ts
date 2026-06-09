// Typed formatting utilities for MoneyFlow.
// Attached to window for use across all views (loaded via script tags).

function formatMoney(amount: number, options?: { compact?: boolean; currency?: string; showSign?: boolean }): string {
  const sign = amount > 0 ? "+" : amount < 0 ? "\u2212" : "";
  const abs = Math.abs(amount).toLocaleString("en-IN");
  const showSign = options?.showSign ?? false;
  const sym = options?.currency ? ({ INR: "\u20B9", USD: "$", EUR: "\u20AC", GBP: "\u00A3" }[options.currency] || "\u20B9") : "\u20B9";
  return (showSign ? sign : "") + sym + abs;
}

function formatPercent(v: number): string {
  return (v * 100).toFixed(1) + "%";
}

function formatShortNumber(n: number): string {
  if (n >= 10000000) return (n / 10000000).toFixed(1) + "Cr";
  if (n >= 100000) return (n / 100000).toFixed(1) + "L";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toString();
}

function formatDate(d: string | Date, fmt?: string): string {
  const date = typeof d === "string" ? new Date(d + (d.includes("T") ? "" : "T00:00:00")) : d;
  if (isNaN(date.getTime())) return "—";
  if (fmt === "short") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (fmt === "full") {
    return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  }
  if (fmt === "month") {
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }
  if (fmt === "time") {
    return date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseCustomDate(s: string): string {
  if (!s) return "—";
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${dy}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "—";
}

function renderToString(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") {
    try { return JSON.stringify(v); } catch { return "[Object]"; }
  }
  return String(v);
}

window.formatMoney = formatMoney;
window.formatPercent = formatPercent;
window.formatShortNumber = formatShortNumber;
window.formatDate = formatDate;
window.parseCustomDate = parseCustomDate;
window.renderToString = renderToString;
