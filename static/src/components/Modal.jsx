const Modal = ({ open, onClose, title, children, width = 420, danger = false, className = "" }) => {
  const [closing, setClosing] = React.useState(false);
  const modalRef = React.useRef(null);
  window.useFocusTrap(modalRef, open && !closing);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") handleClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closing]);

  const handleClose = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => { onClose(); setClosing(false); }, 150);
  };

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      className={`${closing ? "backdrop-out" : "backdrop-in"} ${className}`}
      style={{ position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div
        ref={modalRef}
        className={closing ? "modal-out" : "modal-in"}
        style={{ background: "var(--card)", border: danger ? "1px solid var(--neg-soft)" : "1px solid var(--line)", borderRadius: 12, padding: 28, width: "100%", maxWidth: width, position: "relative" }}
      >
        {title && (
          <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 18, fontWeight: 500, color: danger ? "var(--neg)" : "var(--ink)", marginBottom: 8, paddingRight: 28 }}>{title}</div>
        )}
        {children}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Close"
          style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, border: "none", background: "transparent", color: "var(--ink-3)", cursor: "pointer", borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, lineHeight: 1 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          ✕
        </button>
      </div>
    </div>,
    document.getElementById("modal-root")
  );
};

window.Modal = Modal;
