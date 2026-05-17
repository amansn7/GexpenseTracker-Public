// Shared date range utilities for MoneyFlow frontend views
// Attached to window for use across all views (loaded via script tags)

(function () {
  /**
   * Format a Date as YYYY-MM-DD (internal helper).
   */
  function _ymd(d) {
    var y = d.getFullYear();
    var mo = String(d.getMonth() + 1).padStart(2, "0");
    var dy = String(d.getDate()).padStart(2, "0");
    return y + "-" + mo + "-" + dy;
  }

  /**
   * Return { from, to } for the given month (YYYY-MM-DD strings).
   */
  function getMonthRange(year, month) {
    var first = new Date(year, month, 1);
    var last = new Date(year, month + 1, 0);
    return { from: _ymd(first), to: _ymd(last) };
  }

  /**
   * Return { from, to } for the current month.
   */
  function getCurrentMonthRange() {
    var now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth());
  }

  /**
   * Return { from, to } for the previous month.
   */
  function getLastMonthRange() {
    var now = new Date();
    return getMonthRange(now.getFullYear(), now.getMonth() - 1);
  }

  /**
   * Return { from, to } for the last N days ending today.
   */
  function getLastNDays(n) {
    var now = new Date();
    var from = new Date(now);
    from.setDate(from.getDate() - n);
    return { from: _ymd(from), to: _ymd(now) };
  }

  /**
   * Return { from, to } for the last 7 days.
   */
  function getWeekRange() {
    return getLastNDays(7);
  }

  /**
   * Return { from, to } for the current year (Jan 1 – Dec 31).
   */
  function getYearRange(year) {
    var y = year !== undefined ? year : new Date().getFullYear();
    return { from: y + "-01-01", to: y + "-12-31" };
  }

  /**
   * Return "All Time" range (null, null).
   */
  function getAllTimeRange() {
    return { from: null, to: null };
  }

  /**
   * Format a { from, to } range into a human-readable label.
   */
  function formatDateRange(range) {
    if (!range.from) return "All Time";
    var from = new Date(range.from + "T00:00:00");
    var to = new Date(range.to + "T00:00:00");
    var opts = { month: "short", day: "numeric" };
    var yearOpts = { month: "short", day: "numeric", year: "numeric" };
    var sameMonth = from.getMonth() === to.getMonth();
    var sameYear = from.getFullYear() === to.getFullYear();
    if (sameMonth && sameYear) {
      return from.toLocaleDateString("en-US", opts) + " \u2013 " + to.getDate() + ", " + to.getFullYear();
    }
    if (sameYear) {
      return from.toLocaleDateString("en-US", opts) + " \u2013 " + to.toLocaleDateString("en-US", yearOpts);
    }
    return from.toLocaleDateString("en-US", yearOpts) + " \u2013 " + to.toLocaleDateString("en-US", yearOpts);
  }

  /**
   * Standard date presets for filter dropdowns.
   */
  var DATE_PRESETS = [
    { label: "This Month", get: getCurrentMonthRange },
    { label: "Last Month", get: getLastMonthRange },
    { label: "Last 7 Days", get: getWeekRange },
    { label: "Last 30 Days", get: function () { return getLastNDays(30); } },
    { label: "All Time", get: getAllTimeRange },
  ];

  window.DateUtils = {
    getMonthRange: getMonthRange,
    getCurrentMonthRange: getCurrentMonthRange,
    getLastMonthRange: getLastMonthRange,
    getWeekRange: getWeekRange,
    getLastNDays: getLastNDays,
    getYearRange: getYearRange,
    getAllTimeRange: getAllTimeRange,
    formatDateRange: formatDateRange,
    DATE_PRESETS: DATE_PRESETS,
  };
})();
