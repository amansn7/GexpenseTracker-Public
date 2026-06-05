const BottomSheet = ({ open, onClose, title, children, height = "auto", className = "" }) => {
  const [closing, setClosing] = React.useState(false);
  const [translateY, setTranslateY] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const sheetRef = React.useRef(null);
  const touchStartY = React.useRef(0);
  const touchCurrentY = React.useRef(0);
  const dragStartTime = React.useRef(0);

  window.useFocusTrap(sheetRef, open && !closing);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closing]);

  const handleClose = React.useCallback(() => {
    if (closing) return;
    setClosing(true);
    setTranslateY(0);
    setTimeout(() => { onClose(); setClosing(false); }, 150);
  }, [closing, onClose]);

  const handleTouchStart = React.useCallback((e) => {
    if (closing) return;
    touchStartY.current = e.touches[0].clientY;
    touchCurrentY.current = e.touches[0].clientY;
    dragStartTime.current = Date.now();
    setDragging(true);
  }, [closing]);

  const handleTouchMove = React.useCallback((e) => {
    if (!dragging || closing) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy < 0) return;
    touchCurrentY.current = e.touches[0].clientY;
    setTranslateY(dy);
  }, [dragging, closing]);

  const handleTouchEnd = React.useCallback(() => {
    if (!dragging || closing) return;
    setDragging(false);
    const dy = touchCurrentY.current - touchStartY.current;
    const elapsed = Date.now() - dragStartTime.current;
    const velocity = dy / Math.max(elapsed, 1);
    if (dy > 80 || (velocity > 0.5 && dy > 20)) {
      handleClose();
    } else {
      setTranslateY(0);
    }
  }, [dragging, closing, handleClose]);

  if (!open) return null;

  const isClosing = closing;

  return ReactDOM.createPortal(
    <div
      className={isClosing ? "backdrop-out" : "backdrop-in"}
      style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 1001, display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        ref={sheetRef}
        className={`${className}`}
        style={{
          width: "100%", maxWidth: 500, background: "var(--card)",
          borderTopLeftRadius: 12, borderTopRightRadius: 12,
          boxShadow: "0 -4px 24px rgba(0,0,0,0.3)",
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
          maxHeight: "90vh", overflowY: "auto",
          transform: isClosing ? "translateY(100%)" : `translateY(${translateY}px)`,
          transition: dragging ? "none" : "transform 280ms cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: dragging ? "transform" : "auto",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 4px" }}>
          <div style={{ width: 32, height: 4, borderRadius: 999, background: "var(--ink-4)", marginBottom: 8 }} />
        </div>
        {title && (
          <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 18, fontWeight: 500, color: "var(--ink)", marginBottom: 8, padding: "0 20px" }}>{title}</div>
        )}
        <div style={height !== "auto" ? { height } : {}}>
          {children}
        </div>
      </div>
    </div>,
    document.getElementById("modal-root")
  );
};

window.BottomSheet = BottomSheet;
