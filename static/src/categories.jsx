// CategoryService — centralized category logic with hierarchy

const CATEGORY_GROUPS = [
  { key: "essentials", label: "Essentials", icon: "heart", children: ["food", "rent"] },
  { key: "transport", label: "Transport", icon: "navigation", children: ["travel"] },
  { key: "bills", label: "Bills & Subscriptions", icon: "file-text", children: ["sub", "util"] },
  { key: "lifestyle", label: "Shopping & Lifestyle", icon: "shopping-bag", children: ["shop"] },
  { key: "finance", label: "Finance", icon: "trending-up", children: ["income"] },
  { key: "other", label: "Other", icon: "more-horizontal", children: ["other"] },
];

const _eventBus = document.createElement("div");

const CategoryService = {
  _userCats: [],

  init(account) {
    this._userCats = (account?.categories || []).filter(c => c.active !== false);
  },

  onChange(fn) {
    _eventBus.addEventListener("change", fn);
    return () => _eventBus.removeEventListener("change", fn);
  },

  notify() {
    _eventBus.dispatchEvent(new CustomEvent("change"));
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

Object.assign(window, { CategoryService, CATEGORY_GROUPS });
