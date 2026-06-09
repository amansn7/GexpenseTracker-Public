// @ts-nocheck
// View caching — keeps up to 3 recently-viewed views in DOM with display:none

const ViewCacheContext = React.createContext({ cachedViews: [] });

const ViewSlot = ({ view, activeView, children }) => {
  const { cachedViews } = useContext(ViewCacheContext);
  const isActive = view === activeView;
  const inCache = cachedViews.includes(view);

  if (!inCache) return null;

  return React.createElement("div", { style: { display: isActive ? "" : "none" } }, children);
};

Object.assign(window as any, { ViewCacheContext, ViewSlot });
