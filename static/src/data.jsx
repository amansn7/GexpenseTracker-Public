// Data layer — fetches from /api/* and transforms to UI shape

const CATEGORIES = {
  food:          { label: "Food & Dining",   bg: "var(--cat-food)",          ink: "var(--cat-food-ink)" },
  groceries:     { label: "Groceries",        bg: "var(--cat-groceries)",    ink: "var(--cat-groceries-ink)" },
  rent:          { label: "Rent",             bg: "var(--cat-rent)",         ink: "var(--cat-rent-ink)" },
  transport:     { label: "Transport",        bg: "var(--cat-transport)",    ink: "var(--cat-transport-ink)" },
  travel:        { label: "Travel",           bg: "var(--cat-travel)",       ink: "var(--cat-travel-ink)" },
  shop:          { label: "Shopping",         bg: "var(--cat-shop)",         ink: "var(--cat-shop-ink)" },
  entertainment: { label: "Entertainment",    bg: "var(--cat-entertainment)",ink: "var(--cat-entertainment-ink)" },
  health:        { label: "Healthcare",       bg: "var(--cat-health)",       ink: "var(--cat-health-ink)" },
  edu:           { label: "Education",        bg: "var(--cat-edu)",          ink: "var(--cat-edu-ink)" },
  sub:           { label: "Subscriptions",    bg: "var(--cat-sub)",          ink: "var(--cat-sub-ink)" },
  util:          { label: "Utilities",        bg: "var(--cat-util)",         ink: "var(--cat-util-ink)" },
  card:          { label: "CC Payment",       bg: "var(--cat-card)",         ink: "var(--cat-card-ink)" },
  transfer:      { label: "Transfers",        bg: "var(--cat-transfer)",     ink: "var(--cat-transfer-ink)" },
  investment:    { label: "Investments",      bg: "var(--cat-investment)",   ink: "var(--cat-investment-ink)" },
  income:        { label: "Income",           bg: "var(--cat-inc)",          ink: "var(--cat-inc-ink)" },
  other:         { label: "Other",            bg: "var(--cat-other)",        ink: "var(--cat-other-ink)" },
};

const TAGS = {
  expense:      { label: "Expense",      dot: "var(--neg)"    },
  income:       { label: "Income",       dot: "var(--pos)"    },
  subscription: { label: "Subscription", dot: "var(--accent)" },
  transfer:     { label: "Transfer",     dot: "var(--ink-3)"  },
  ignore:       { label: "Ignored",     dot: "var(--ink-4)"  },
};

// DB category value → CATEGORIES key.
// Single source of truth lives on the backend (`app/services/category_service.py`,
// exposed via `GET /api/categories/canonical-map`). The literal below is a
// fallback used only on first render or if the fetch fails — kept in sync with
// the backend map so dashboards still resolve categories before the network
// response lands.
let _CAT_ALIAS = {
  food: "food", dining: "food", "food & dining": "food", restaurant: "food",
  meal: "food", cafe: "food", eat: "food",
  groceries: "groceries", grocery: "groceries", kirana: "groceries",
  rent: "rent", "rent & home": "rent", home: "rent", housing: "rent",
  transport: "transport", commute: "transport", cab: "transport",
  ride: "transport", taxi: "transport", auto: "transport",
  metro: "transport", parking: "transport", toll: "transport",
  fuel: "transport", petrol: "transport", diesel: "transport",
  travel: "travel", flight: "travel", hotel: "travel", trip: "travel",
  shopping: "shop", shop: "shop", retail: "shop", clothing: "shop",
  entertainment: "entertainment", movie: "entertainment",
  cinema: "entertainment", concert: "entertainment",
  healthcare: "health", health: "health", medical: "health",
  hospital: "health", pharmacy: "health", medicine: "health", doctor: "health", clinic: "health",
  education: "edu", edu: "edu", tuition: "edu", course: "edu",
  training: "edu", school: "edu", college: "edu", university: "edu",
  subscriptions: "sub", subscription: "sub", sub: "sub",
  membership: "sub", premium: "sub", insurance: "sub", emi: "sub",
  utilities: "util", utility: "util", util: "util",
  electricity: "util", internet: "util", broadband: "util", water: "util", recharge: "util",
  "cc payment": "card", cc: "card", "credit card": "card",
  card: "card", "card payment": "card", "credit card payment": "card",
  transfers: "transfer", transfer: "transfer",
  "bank transfer": "transfer", "upi payment": "transfer",
  upi: "transfer", neft: "transfer", imps: "transfer",
  income: "income", salary: "income", freelance: "income",
  refund: "income", cashback: "income", reward: "income",
  investment: "investment", investments: "investment",
  "mutual fund": "investment", "mutual funds": "investment",
  stocks: "investment", sip: "investment",
  cash: "other",
  other: "other",
};

// Replace fallback with authoritative backend map (fire-and-forget; degrades
// gracefully if the request fails — fallback above is still valid).
fetch("/api/categories/canonical-map", { credentials: "include" })
  .then((r) => (r.ok ? r.json() : null))
  .then((j) => { if (j && j.map && typeof j.map === "object") _CAT_ALIAS = j.map; })
  .catch(() => {});

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
  const tag = t.label === "ignore" ? "ignore" : isIncome ? "income" : isSub ? "subscription" : "expense";
  const amount = t.label === "ignore" ? 0 : isIncome ? (t.amount || 0) : -(t.amount || 0);
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
    status: t.status || "confirmed",
    read: t.read ?? false,
    flag: t.flagged ?? false,
    note: t.user_notes || "",
    snippet: t.email?.body_snippet || "",
    method: t.classifier_method || null,
  };
};

// Build FLOW_SUMMARY shape from fetched data
const buildFlowSummary = (transactions, summary, catBreakdown, rangeFrom, rangeTo) => {
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const rangeStart = rangeFrom ? new Date(rangeFrom) : new Date();
  const rangeEnd = rangeTo ? new Date(rangeTo) : new Date();
  const totalDays = Math.max(1, Math.round((rangeEnd - rangeStart) / 86400000) + 1);
  const segSize = Math.max(1, Math.ceil(totalDays / 4));

  // Income sources grouped by merchant + weekly burn buckets (single pass)
  const incomeMap = {};
  const weeklyBuckets = [0, 0, 0, 0];
  for (const t of transactions) {
    if (t.amount > 0) {
      const key = t.merchant || "Other";
      incomeMap[key] = (incomeMap[key] || 0) + t.amount;
    } else if (t.amount < 0 && t.date) {
      const dayOffset = Math.floor((new Date(t.date) - rangeStart) / 86400000);
      const bucketIdx = Math.min(3, Math.max(0, Math.floor(dayOffset / segSize)));
      weeklyBuckets[bucketIdx] += Math.abs(t.amount);
    }
  }
  const income = Object.entries(incomeMap)
    .map(([label, amount]) => ({ label, amount: Math.round(amount) }))
    .sort((a, b) => b.amount - a.amount);

  if (summary?.total_income > 0) {
    const summaryTotal = Math.round(summary.total_income);
    const loadedTotal = income.reduce((a, i) => a + i.amount, 0);
    if (income.length === 0) {
      income.push({ label: "Income", amount: summaryTotal });
    } else {
      const diff = summaryTotal - loadedTotal;
      if (diff > 100) {
        income.push({ label: "Other income", amount: diff });
      } else if (diff < -100) {
        income[0].amount += diff;
      }
    }
  }

  // Expenses per category from DB breakdown (authoritative amounts + counts)
  const catMap = {};
  const txnCountMap = {};
  for (const c of (catBreakdown?.categories || [])) {
    const key = _normCat(c.category, false);
    if (key !== "income") {
      catMap[key] = (catMap[key] || 0) + c.amount;
      txnCountMap[key] = (txnCountMap[key] || 0) + (c.txn_count || 0);
    }
  }
  // Top merchants per category (from local transactions — no backend endpoint yet)
  const merchantMap = {};
  for (const t of transactions) {
    if (t.amount < 0 && t.merchant) {
      const key = t.cat || "other";
      if (!merchantMap[key]) merchantMap[key] = {};
      merchantMap[key][t.merchant] = (merchantMap[key][t.merchant] || 0) + Math.abs(t.amount);
    }
  }
  const topMerchants = {};
  for (const [cat, merchants] of Object.entries(merchantMap)) {
    topMerchants[cat] = Object.entries(merchants)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name, amt]) => ({ name, amount: Math.round(amt) }));
  }
  // Inject CC payments and investments from stats summary (excluded from category-breakdown API)
  if (summary?.total_cc_payments > 0) {
    catMap["card"] = (catMap["card"] || 0) + summary.total_cc_payments;
    txnCountMap["card"] = (txnCountMap["card"] || 0) + (summary.total_cc_payments_count || 0);
  }
  if (summary?.total_investments > 0) {
    catMap["investment"] = (catMap["investment"] || 0) + summary.total_investments;
    txnCountMap["investment"] = (txnCountMap["investment"] || 0) + (summary.total_investments_count || 0);
  }
  const expenses = Object.entries(catMap)
    .map(([cat, amount]) => ({ cat, amount: Math.round(amount), txnCount: txnCountMap[cat] || 0, topMerchants: topMerchants[cat] || [] }))
    .sort((a, b) => b.amount - a.amount);

  // Weekly burn — divide range into 4 segments
  const weekDefs = [];
  for (let i = 0; i < 4; i++) {
    const segStart = new Date(rangeStart.getTime() + i * segSize * 86400000);
    const segEnd = new Date(rangeStart.getTime() + Math.min((i + 1) * segSize - 1, totalDays - 1) * 86400000);
    const endDay = segEnd.getDate();
    const startLabel = segStart.toLocaleString("en-US", { month: "short", day: "numeric" });
    const endLabel = segStart.getMonth() !== segEnd.getMonth()
      ? segEnd.toLocaleString("en-US", { month: "short", day: "numeric" })
      : `${endDay}`;
    weekDefs.push({
      start: segStart.toISOString().slice(0, 10),
      end: segEnd.toISOString().slice(0, 10),
      label: `W${i+1} · ${startLabel}–${endLabel}`,
      projected: segStart > today,
    });
  }
  const weeklyBurn = weekDefs.map((w, i) => ({
    week: w.label,
    spent: Math.round(weeklyBuckets[i]),
    projected: w.projected || w.start > todayStr,
  }));

  const monthLabel = rangeStart.toLocaleString("en-US", { month: "long", year: "numeric" })
    + (rangeStart.getMonth() !== rangeEnd.getMonth() || rangeStart.getFullYear() !== rangeEnd.getFullYear()
      ? ` – ${rangeEnd.toLocaleString("en-US", { month: "long", year: "numeric" })}`
      : "");

  const totalIncome = summary?.total_income ? Math.round(summary.total_income) : income.reduce((a, i) => a + i.amount, 0);
  const totalExpenses = expenses.reduce((a, e) => a + e.amount, 0);
  const saved = summary?.saved ?? (totalIncome - totalExpenses);

  return { month: monthLabel, income, expenses, weeklyBurn, savings: Math.round(saved), totalIncome };
};

// Thin fetch wrappers
const _checkAuth = (r) => {
  if (r.status === 401) { window.location.href = "/login"; return null; }
  return r;
};

let _csrfToken = null;

const _initCSRF = async () => {
  if (_csrfToken) return;
  try {
    const r = await fetch("/api/auth/csrf-token", { credentials: "include" });
    if (r.ok) {
      const data = await r.json();
      _csrfToken = data.csrf_token;
    }
  } catch (_) {}
};

const _withCSRF = (headers) => {
  if (!_csrfToken) return headers;
  return { ...headers, "X-CSRF-Token": _csrfToken };
};

const API = {
  init: async () => { await _initCSRF(); },
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
      headers: _withCSRF({ "Content-Type": "application/json" }),
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
      headers: _withCSRF({ "Content-Type": "application/json" }),
      body: body ? JSON.stringify(body) : undefined,
    }));
    if (!r) return;
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  delete: async (path) => {
    const r = _checkAuth(await fetch(path, {
      method: "DELETE",
      credentials: "include",
      headers: _withCSRF({}),
    }));
    if (!r) return;
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    if (r.status === 204) return null;
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
    btn.style.cssText = "background:var(--ink-3);border:1px solid var(--line);color:var(--paper);border-radius:4px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap;font-family:inherit";
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
  { key: "essentials", label: "Essentials", icon: "heart", children: ["food", "groceries", "rent"] },
  { key: "transport", label: "Transport", icon: "navigation", children: ["transport", "travel"] },
  { key: "bills", label: "Bills & Subscriptions", icon: "file-text", children: ["sub", "util", "card", "transfer"] },
  { key: "lifestyle", label: "Lifestyle", icon: "shopping-bag", children: ["shop", "entertainment", "health", "edu"] },
  { key: "finance", label: "Finance", icon: "trending-up", children: ["income", "investment"] },
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
    const builtinLabels = new Set(Object.values(CATEGORIES).map(c => c.label.toLowerCase()));
    for (const uc of this._userCats) {
      const lower = uc.name.toLowerCase().trim();
      if (seen.has(lower) || builtinLabels.has(lower) || lower === "income" || lower === "other") continue;
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

Object.assign(window, { CATEGORIES, TAGS, transformTransaction, buildFlowSummary, API, normCat: _normCat, catDisplay: _catDisplay, CategoryService, CATEGORY_GROUPS, useBackgroundJob, showToast, _csrfToken: () => _csrfToken });
