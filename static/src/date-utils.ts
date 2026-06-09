// Shared date range utilities for MoneyFlow frontend views
// Attached to window for use across all views (loaded via script tags)

interface DateRange {
  from: string | null;
  to: string | null;
}

interface DatePreset {
  label: string;
  get: () => DateRange;
}

(function () {
  function _ymd(d: Date): string {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dy = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + dy;
  }

  function getMonthRange(year: number, month: number): DateRange {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    return { from: _ymd(first), to: _ymd(last) };
  }

  function getCurrentMonthRange(): DateRange {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth());
  }

  function getLastMonthRange(): DateRange {
    const now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth() - 1);
  }

  function getLastNDays(n: number): DateRange {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - n);
    return { from: _ymd(from), to: _ymd(now) };
  }

  function getWeekRange(): DateRange {
    return getLastNDays(7);
  }

  function getYearRange(year?: number): DateRange {
    const y = year !== undefined ? year : new Date().getFullYear();
    return { from: y + "-01-01", to: y + "-12-31" };
  }

  function getAllTimeRange(): DateRange {
    return { from: null, to: null };
  }

  function formatDateRange(range: DateRange): string {
    if (!range.from) return "All Time";
    const from = new Date(range.from + "T00:00:00");
    const to = new Date(range.to + "T00:00:00");
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    const yearOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
    const sameMonth = from.getMonth() === to.getMonth();
    const sameYear = from.getFullYear() === to.getFullYear();
    if (sameMonth && sameYear) {
      return from.toLocaleDateString("en-US", opts) + " \u2013 " + to.getDate() + ", " + to.getFullYear();
    }
    if (sameYear) {
      return from.toLocaleDateString("en-US", opts) + " \u2013 " + to.toLocaleDateString("en-US", yearOpts);
    }
    return from.toLocaleDateString("en-US", yearOpts) + " \u2013 " + to.toLocaleDateString("en-US", yearOpts);
  }

  const DATE_PRESETS: DatePreset[] = [
    { label: "This Month", get: getCurrentMonthRange },
    { label: "Last Month", get: getLastMonthRange },
    { label: "Last 7 Days", get: getWeekRange },
    { label: "Last 30 Days", get: function () { return getLastNDays(30); } },
    { label: "All Time", get: getAllTimeRange },
  ];

  window.DateUtils = {
    getMonthRange,
    getCurrentMonthRange,
    getLastMonthRange,
    getWeekRange,
    getLastNDays,
    getYearRange,
    getAllTimeRange,
    formatDateRange,
    DATE_PRESETS,
  };
})();
