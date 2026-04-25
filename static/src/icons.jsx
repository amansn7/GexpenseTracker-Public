// Minimal line icons — 1.5 stroke, monoline
const Icon = ({ name, size = 16, stroke = "currentColor" }) => {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke, strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "inbox":   return <svg {...p}><path d="M3 13l2.5-8h13L21 13v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z"/><path d="M3 13h5l1 2h6l1-2h5"/></svg>;
    case "flow":    return <svg {...p}><path d="M3 6c4 0 4 12 8 12s4-12 8-12"/><path d="M3 18c4 0 4-12 8-12s4 12 8 12"/></svg>;
    case "dash":    return <svg {...p}><rect x="3" y="3" width="8" height="10" rx="1"/><rect x="13" y="3" width="8" height="6" rx="1"/><rect x="13" y="11" width="8" height="10" rx="1"/><rect x="3" y="15" width="8" height="6" rx="1"/></svg>;
    case "search":  return <svg {...p}><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>;
    case "filter":  return <svg {...p}><path d="M4 5h16M7 12h10M10 19h4"/></svg>;
    case "star":    return <svg {...p}><path d="M12 3l2.6 5.6 6 .9-4.3 4.2 1 6L12 17l-5.4 2.7 1-6L3.4 9.5l6-.9z"/></svg>;
    case "star-f":  return <svg {...p} fill={stroke}><path d="M12 3l2.6 5.6 6 .9-4.3 4.2 1 6L12 17l-5.4 2.7 1-6L3.4 9.5l6-.9z"/></svg>;
    case "tag":     return <svg {...p}><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1"/></svg>;
    case "arrow-d": return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case "arrow-r": return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case "arrow-l": return <svg {...p}><path d="M15 6l-6 6 6 6"/></svg>;
    case "arrow-u-r": return <svg {...p}><path d="M7 17L17 7"/><path d="M8 7h9v9"/></svg>;
    case "check":   return <svg {...p}><path d="M5 12l4 4 10-10"/></svg>;
    case "x":       return <svg {...p}><path d="M6 6l12 12M18 6l-12 12"/></svg>;
    case "edit":    return <svg {...p}><path d="M4 20h4l10-10-4-4L4 16z"/><path d="M14 6l4 4"/></svg>;
    case "dot":     return <svg {...p}><circle cx="12" cy="12" r="3" fill={stroke}/></svg>;
    case "sparkle": return <svg {...p}><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M18 4l.6 1.8L20 6.5l-1.4.7L18 9l-.6-1.8L16 6.5l1.4-.7z"/></svg>;
    case "mail":    return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/></svg>;
    case "menu":    return <svg {...p}><path d="M4 6h16M4 12h16M4 18h16"/></svg>;
    case "gmail":   return <svg {...p}><path d="M3 6l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="1"/></svg>;
    case "info":    return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M12 8v.1M12 11v5"/></svg>;
    case "gear":    return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4l1.4-1.4M17 7l1.4-1.4"/></svg>;
    case "user":    return <svg {...p}><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>;
    case "chevron-r": return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>;
    case "plus":    return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "trend-u": return <svg {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case "trend-d": return <svg {...p}><path d="M3 7l6 6 4-4 8 8"/><path d="M14 17h7v-7"/></svg>;
    case "bolt":    return <svg {...p}><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>;
    case "arrow-swap":   return <svg {...p}><path d="M7 16V4m0 0L4 7m3-3l3 3M17 8v12m0 0l3-3m-3 3l-3-3"/></svg>;
    case "repeat":       return <svg {...p}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
    case "trending-down":return <svg {...p}><path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></svg>;
    case "chart":        return <svg {...p}><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-8"/></svg>;
    default: return null;
  }
};

window.Icon = Icon;
