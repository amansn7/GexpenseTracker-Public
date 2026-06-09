// @ts-nocheck
// useFocusTrap — traps Tab/Shift+Tab within a modal container
// Usage: const trapRef = useRef(null); useFocusTrap(trapRef, isOpen);
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

function _useFocusTrap(containerRef, active) {
  const prevFocusRef = React.useRef(null);

  React.useEffect(() => {
    if (!active || !containerRef.current) return;

    prevFocusRef.current = document.activeElement;

    const container = containerRef.current;
    const focusable = container.querySelectorAll(FOCUSABLE);
    if (focusable.length > 0) focusable[0].focus();

    function onKeyDown(e) {
      if (e.key !== "Tab") return;
      const els = container.querySelectorAll(FOCUSABLE);
      if (els.length === 0) { e.preventDefault(); return; }
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (prevFocusRef.current && prevFocusRef.current.focus) {
        prevFocusRef.current.focus();
      }
    };
  }, [active, containerRef]);
}

(window as any).useFocusTrap = _useFocusTrap;
