// Data layer — fetches from /api/* and transforms to UI shape

const CATEGORIES = {
  food:    { label: "Food & Dining", bg: "var(--cat-food)",   ink: "var(--cat-food-ink)" },
  rent:    { label: "Rent & Home",   bg: "var(--cat-rent)",   ink: "var(--cat-rent-ink)" },
  shop:    { label: "Shopping",      bg: "var(--cat-shop)",   ink: "var(--cat-shop-ink)" },
  travel:  { label: "Travel",        bg: "var(--cat-travel)", ink: "var(--cat-travel-ink)" },
  sub:     { label: "Subscriptions", bg: "var(--cat-sub)",    ink: "var(--cat-sub-ink)" },
  util:    { label: "Utilities",     bg: "var(--cat-util)",   ink: "var(--cat-util-ink)" },
  income:  { label: "Income",        bg: "var(--cat-inc)",    ink: "var(--cat-inc-ink)" },
  other:   { label: "Other",         bg: "var(--cat-other)",  ink: "var(--cat-other-ink)" },
};

const TAGS = {
  expense:      { label: "Expense",      dot: "var(--neg)"    },
  income:       { label: "Income",       dot: "var(--pos)"    },
  subscription: { label: "Subscription", dot: "var(--accent)" },
  transfer:     { label: "Transfer",     dot: "var(--ink-3)"  },
};

// DB category value → CATEGORIES key
const _CAT_ALIAS = {
  food: "food", dining: "food", "food & dining": "food", groceries: "food", restaurant: "food",
  rent: "rent", "rent & home": "rent", home: "rent", housing: "rent",
  utilities: "util", utility: "util", util: "util", electricity: "util", internet: "util", broadband: "util",
  shopping: "shop", shop: "shop", retail: "shop",
  travel: "travel", transport: "travel", commute: "travel", flight: "travel",
  subscriptions: "sub", subscription: "sub", sub: "sub",
  income: "income", salary: "income", freelance: "income",
  "cc payment": "other", cc: "other",
  insurance: "sub",
  investment: "other",
  refund: "other",
  emi: "sub",
  entertainment: "sub",
  healthcare: "other",
  fuel: "travel",
  cash: "other",
  "bank transfer": "other",
  "upi payment": "other",
  other: "other",
};

const _normCat = (cat, isIncome) => {
  if (isIncome) return "income";
  const key = _CAT_ALIAS[(cat || "").toLowerCase().trim()];
  return key || "other";
};

const _catDisplay = (cat) =>
  CATEGORIES[cat] || { label: cat || "Other", bg: "var(--paper-2)", ink: "var(--ink-3)" };

const _domainFromSender = (sender) => {
  if (!sender) return "";
  const m = sender.match(/<[^>]*@([^>]+)>/) || sender.match(/@([^\s>]+)/);
  return m ? m[1].trim().toLowerCase() : sender;
};

const _timeStr = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
};

// Transform API transaction → UI shape
const transformTransaction = (t) => {
  const isIncome = t.label === "income";
  const cat = _normCat(t.category, isIncome);
  const isSub = cat === "sub";
  const tag = isIncome ? "income" : isSub ? "subscription" : "expense";
  const amount = isIncome ? (t.amount || 0) : -(t.amount || 0);
  const conf = t.confidence ?? 0.5;

  const _localDate = (iso) => {
    const d = new Date(iso);
    const y = d.getFullYear(), mo = String(d.getMonth()+1).padStart(2,"0"), dy = String(d.getDate()).padStart(2,"0");
    return `${y}-${mo}-${dy}`;
  };
  return {
    id: t.id,
    date: t.txn_date || (t.email?.received_at ? _localDate(t.email.received_at) : ""),
    time: _timeStr(t.email?.received_at),
    merchant: t.merchant || t.email?.sender?.replace(/\s*<.*>/, "").trim() || "Unknown",
    domain: _domainFromSender(t.email?.sender),
    subject: t.email?.subject || "",
    amount,
    tag,
    cat,
    conf,
    paid: "",
    status: t.status || "confirmed",
    read: t.read ?? false,
    flag: t.flagged ?? false,
    note: t.user_notes || "",
    snippet: t.email?.body_snippet || "",
    method: t.classifier_method || null,
  };
};

// Build FLOW_SUMMARY shape from fetched data
const buildFlowSummary = (transactions, summary, catBreakdown) => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const todayDay = today.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthAbbr = today.toLocaleString("en-US", { month: "short" });
  const monthLabel = today.toLocaleString("en-US", { month: "long", year: "numeric" });

  // Income sources grouped by merchant
  const incomeMap = {};
  for (const t of transactions) {
    if (t.amount > 0) {
      const key = t.merchant || "Other";
      incomeMap[key] = (incomeMap[key] || 0) + t.amount;
    }
  }
  const income = Object.entries(incomeMap)
    .map(([label, amount]) => ({ label, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Expenses per category from DB breakdown
  const catMap = {};
  for (const c of (catBreakdown?.categories || [])) {
    const key = _normCat(c.category, false);
    if (key !== "income") catMap[key] = (catMap[key] || 0) + c.amount;
  }
  const expenses = Object.entries(catMap)
    .map(([cat, amount]) => ({ cat, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Weekly burn from transactions
  const weekDefs = [
    { start: 1,  end: 7,           label: `W1 · ${monthAbbr} 1–7`   },
    { start: 8,  end: 14,          label: `W2 · ${monthAbbr} 8–14`  },
    { start: 15, end: 21,          label: `W3 · ${monthAbbr} 15–21` },
    { start: 22, end: daysInMonth, label: `W4 · ${monthAbbr} 22–${daysInMonth}` },
  ];
  const weeklyBurn = weekDefs.map(w => {
    const spent = transactions
      .filter(t => {
        if (!t.date || t.amount >= 0) return false;
        const d = parseInt(t.date.split("-")[2], 10);
        return d >= w.start && d <= w.end;
      })
      .reduce((a, t) => a + Math.abs(t.amount), 0);
    return { week: w.label, spent: Math.round(spent), projected: w.start > todayDay };
  });

  const totalIncome = income.reduce((a, i) => a + i.amount, 0);
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
  const saved = summary?.saved ?? (totalIncome - totalExpenses);

  return { month: monthLabel, income, expenses, weeklyBurn, savings: Math.round(saved) };
};

// Thin fetch wrappers
const _checkAuth = (r) => {
  if (r.status === 401) { window.location.href = "/login"; return null; }
  return r;
};

const API = {
  get: async (path) => {
    const r = _checkAuth(await fetch(path, { credentials: "include" }));
    if (!r) return;
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  patch: async (path, body) => {
    const r = _checkAuth(await fetch(path, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }));
    if (!r) return;
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  post: async (path, body) => {
    const r = _checkAuth(await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }));
    if (!r) return;
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  delete: async (path) => {
    const r = _checkAuth(await fetch(path, { method: "DELETE", credentials: "include" }));
    if (!r) return;
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
};

const useBackgroundJob = () => {
  const [progress, setProgress] = React.useState(null);
  const [running, setRunning] = React.useState(false);
  const intervalRef = React.useRef(null);

  React.useEffect(() => () => { if (intervalRef.current) clearInterval(intervalRef.current); }, []);

  const start = async (triggerUrl, body = {}) => {
    if (running) return;
    setRunning(true);
    setProgress(null);
    try {
      await API.post(triggerUrl, body);
      intervalRef.current = setInterval(async () => {
        try {
          const p = await API.get("/api/sync/progress");
          setProgress(p);
          if (!p.running && p.phase && p.phase !== "idle") {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
            setRunning(false);
          }
        } catch (_) { clearInterval(intervalRef.current); intervalRef.current = null; setRunning(false); }
      }, 1200);
    } catch (_) { setRunning(false); }
  };

  const dismiss = () => setProgress(null);

  return { progress, running, start, dismiss };
};

const showToast = (message, action, duration = 5000) => {
  const container = document.getElementById("toast-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "toast toast-info";
  el.style.display = "flex";
  el.style.alignItems = "center";
  el.style.gap = "10px";
  el.style.justifyContent = "space-between";
  const span = document.createElement("span");
  span.textContent = message;
  el.appendChild(span);
  if (action) {
    const btn = document.createElement("button");
    btn.textContent = action.label;
    btn.style.cssText = "background:rgba(255,255,255,0.2);border:1px solid rgba(255,255,255,0.3);color:#fff;border-radius:4px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit";
    btn.onclick = () => { action.onClick(); el.remove(); };
    el.appendChild(btn);
  }
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add("toast-out");
    setTimeout(() => el.remove(), 280);
  }, duration);
};

// ── CategoryService ──────────────────────────────────────────────────

const CATEGORY_GROUPS = [
  { key: "essentials", label: "Essentials", icon: "heart", children: ["food", "rent"] },
  { key: "transport", label: "Transport", icon: "navigation", children: ["travel"] },
  { key: "bills", label: "Bills & Subscriptions", icon: "file-text", children: ["sub", "util"] },
  { key: "lifestyle", label: "Shopping & Lifestyle", icon: "shopping-bag", children: ["shop"] },
  { key: "finance", label: "Finance", icon: "trending-up", children: ["income"] },
  { key: "other", label: "Other", icon: "more-horizontal", children: ["other"] },
];

const _catEventBus = document.createElement("div");

const CategoryService = {
  _userCats: [],

  init(account) {
    this._userCats = (account?.categories || []).filter(c => c.active !== false);
  },

  onChange(fn) {
    _catEventBus.addEventListener("change", fn);
    return () => _catEventBus.removeEventListener("change", fn);
  },

  notify() {
    _catEventBus.dispatchEvent(new CustomEvent("change"));
  },

  _userCat(name) {
    return this._userCats.find(c => c.name.toLowerCase() === (name || "").toLowerCase());
  },

  display(cat) {
    const uc = this._userCat(cat);
    if (uc) return { label: uc.name, bg: uc.color, ink: "var(--ink-3)" };
    return CATEGORIES[cat] || { label: cat || "Other", bg: "var(--paper-2)", ink: "var(--ink-3)" };
  },

  resolve(cat, isIncome) {
    return normCat(cat, isIncome);
  },

  isBuiltin(name) {
    return !!CATEGORIES[(name || "").toLowerCase().trim()];
  },

  isUserCat(name) {
    return !!this._userCat(name);
  },

  groups() {
    return CATEGORY_GROUPS;
  },

  groupOf(cat) {
    const lower = (cat || "").toLowerCase().trim();
    for (const g of CATEGORY_GROUPS) {
      if (g.children.includes(lower)) return g;
    }
    return CATEGORY_GROUPS[CATEGORY_GROUPS.length - 1];
  },

  colorVar(cat) {
    const uc = this._userCat(cat);
    if (uc) return uc.color;
    return `var(--cat-${cat})`;
  },

  colorInk(cat) {
    const uc = this._userCat(cat);
    if (uc) return uc.color;
    return `var(--cat-${cat}-ink)`;
  },

  _iter() {
    const seen = new Set();
    const items = [];
    for (const g of CATEGORY_GROUPS) {
      for (const key of g.children) {
        const c = CATEGORIES[key];
        if (!c) continue;
        items.push({ key, label: c.label, bg: c.bg, ink: c.ink, group: g, isUser: false });
        seen.add(key);
      }
    }
    for (const uc of this._userCats) {
      const lower = uc.name.toLowerCase().trim();
      if (seen.has(lower) || lower === "income" || lower === "other") continue;
      items.push({ key: lower, label: uc.name, bg: uc.color, ink: "var(--ink-3)", group: null, isUser: true });
      seen.add(lower);
    }
    if (!seen.has("other")) {
      const o = CATEGORIES.other;
      items.push({ key: "other", label: o.label, bg: o.bg, ink: o.ink, group: CategoryService.groupOf("other"), isUser: false });
    }
    return items;
  },

  all() {
    return this._iter();
  },

  expenseCategories() {
    return this._iter().filter(i => i.key !== "income");
  },

  grouped() {
    const map = {};
    for (const g of CATEGORY_GROUPS) {
      map[g.key] = { ...g, categories: [] };
    }
    map._user = { key: "_user", label: "Custom", icon: "grid", categories: [] };

    for (const item of this._iter()) {
      const gk = item.isUser ? "_user" : (item.group?.key || "other");
      if (!map[gk]) map[gk] = { key: gk, label: gk, icon: "more-horizontal", categories: [] };
      map[gk].categories.push(item);
    }

    return Object.values(map).filter(g => g.categories.length > 0);
  },
};

Object.assign(window, { CATEGORIES, TAGS, transformTransaction, buildFlowSummary, API, normCat: _normCat, catDisplay: _catDisplay, CategoryService, CATEGORY_GROUPS, useBackgroundJob, showToast });
