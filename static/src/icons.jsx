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
    case "chevron-d": return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>;
    case "plus":    return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case "trend-u": return <svg {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>;
    case "trend-d": return <svg {...p}><path d="M3 7l6 6 4-4 8 8"/><path d="M14 17h7v-7"/></svg>;
    case "bolt":    return <svg {...p}><path d="M13 2L5 14h6l-1 8 8-12h-6z"/></svg>;
    case "arrow-swap":   return <svg {...p}><path d="M7 16V4m0 0L4 7m3-3l3 3M17 8v12m0 0l3-3m-3 3l-3-3"/></svg>;
    case "repeat":       return <svg {...p}><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>;
    case "trending-down":return <svg {...p}><path d="M22 17l-8.5-8.5-5 5L2 7"/><path d="M16 17h6v-6"/></svg>;
    case "chart":        return <svg {...p}><path d="M3 3v18h18"/><path d="M7 16l4-4 4 4 4-8"/></svg>;
    case "fork":         return <svg {...p}><line x1="5" y1="2" x2="5" y2="22"/><line x1="9" y1="2" x2="9" y2="22"/><path d="M5 2a4 4 0 0 1 4 4v2H5"/></svg>;
    case "home":         return <svg {...p}><path d="M3 12L12 3l9 9"/><path d="M9 21V12h6v9"/></svg>;
    case "bag":          return <svg {...p}><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>;
    case "plane":        return <svg {...p}><path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>;
    case "heart":        return <svg {...p}><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>;
    case "book":         return <svg {...p}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>;
    case "grid":         return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>;
    case "sun":          return <svg {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>;
    case "bank":         return <svg {...p}><path d="M3 22h18M3 10h18M5 10V6l7-4 7 4v4M4 22v-4h16v4"/><rect x="8" y="14" width="2" height="4"/><rect x="14" y="14" width="2" height="4"/></svg>;
    case "trash":        return <svg {...p}><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>;
    default: return null;
  }
};

window.Icon = Icon;
