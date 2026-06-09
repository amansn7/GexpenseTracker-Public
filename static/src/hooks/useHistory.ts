// @ts-nocheck
// Browser back/forward navigation via history.pushState / popstate

const { useEffect, useRef } = React;

const VALID_HASH_VIEWS = ["inbox", "flow", "dashboard", "health", "reports", "recurring", "debt", "goals", "budgets", "profile", "settings", "search", "review", "today", "picture"];

const _normalizeHash = () => {
  return window.location.hash.replace(/^#\/?/, "");
};

const useHistory = (view, setView) => {
  const isPopState = useRef(false);
  const skipNext = useRef(true);

  useEffect(() => {
    const hash = _normalizeHash();
    if (hash && VALID_HASH_VIEWS.includes(hash) && hash !== view) {
      history.replaceState({ view: hash }, "", "#/" + hash);
      setView(hash);
      return;
    }
    history.replaceState({ view }, "", view === "inbox" ? "/" : "#/" + view);
  }, []);

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    if (isPopState.current) {
      isPopState.current = false;
      return;
    }
    history.pushState({ view }, "", view === "inbox" ? "/" : "#/" + view);
  }, [view]);

  useEffect(() => {
    const onPop = (e) => {
      const v = e.state?.view;
      if (v) {
        isPopState.current = true;
        setView(v);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [setView]);
};

Object.assign(window as any, { useHistory });
// touch
