// @ts-nocheck
// Shared pull-to-refresh hook for mobile scrollable views

function usePullToRefresh(onRefresh, opts) {
  if (opts === void 0) { opts = {}; }
  var threshold = opts.threshold || 80;
  var scrollRef = opts.scrollRef;
  var isMobile = useViewport().isMobile;
  var _a = React.useState(0), pullY = _a[0], setPullY = _a[1];
  var _b = React.useState(false), pulling = _b[0], setPulling = _b[1];
  var _c = React.useState(false), refreshing = _c[0], setRefreshing = _c[1];
  var pullStartY = React.useRef(0);
  var pullStartScroll = React.useRef(0);
  var pullYRef = React.useRef(0);

  function handleTouchStart(e) {
    if (!isMobile) return;
    pullStartY.current = e.touches[0].clientY;
    pullStartScroll.current = (scrollRef && scrollRef.current ? scrollRef.current.scrollTop : 0);
  }

  function handleTouchMove(e) {
    if (!isMobile) return;
    if (pullStartScroll.current > 0) return;
    var dy = e.touches[0].clientY - pullStartY.current;
    if (dy > 0) {
      e.preventDefault();
      setPulling(true);
      var clamped = Math.min(dy * 0.5, 120);
      pullYRef.current = clamped;
      setPullY(clamped);
    }
  }

  function handleTouchEnd() {
    if (!isMobile) return;
    if (pullYRef.current > threshold) {
      setRefreshing(true);
      Promise.resolve(onRefresh()).then(function () {
        setRefreshing(false);
      }).catch(function () {
        setRefreshing(false);
      });
    }
    setPulling(false);
    setPullY(0);
    pullYRef.current = 0;
  }

  return {
    pullY: pullY,
    pulling: pulling,
    refreshing: refreshing,
    handleTouchStart: handleTouchStart,
    handleTouchMove: handleTouchMove,
    handleTouchEnd: handleTouchEnd,
  };
}

Object.assign(window, { usePullToRefresh: usePullToRefresh });
