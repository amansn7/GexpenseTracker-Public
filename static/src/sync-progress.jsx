// Floating sync progress panel — minimizable, persistent across nav
const { useState, useEffect, useRef } = React;

const _syncMessages = {
  connect: "Connecting to Gmail…",
  fetch: "Reading your recent emails…",
  parse: "Extracting transaction details…",
  classify: "Categorizing your spending…",
  dedup: "Checking for duplicates…",
  done: "All caught up!",
};

const SyncProgressOverlay = ({ progress, syncing, onClose, onFullView, position = "bottom-right" }) => {
  const [minimized, setMinimized] = useState(false);
  const logEndRef = useRef(null);
  const isError = progress.phase === "error";
  const isDone = progress.phase === "done";
  const isComplete = isDone || isError;

  const posStyles = {
    "bottom-right": { bottom: 16, right: 16 },
    "bottom-center": { bottom: 16, left: "50%", transform: "translateX(-50%)" },
    "bottom-left": { bottom: 16, left: 16 },
  };
  const panelPos = posStyles[position] || posStyles["bottom-right"];

  // Auto-scroll log
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [progress.log?.length]);

  if (isComplete && minimized) {
    // Completed but minimized — just show nothing until dismissed
    return null;
  }

  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  // Minimized badge
  if (minimized) {
    const tally = progress.tally || {};
    const totalClassified = (tally.expense || 0) + (tally.income || 0) + (tally.ignore || 0);
    return (
      <div
        onClick={() => setMinimized(false)}
        style={{
          position: "fixed", bottom: 16, right: 16, zIndex: 999,
          display: "flex", alignItems: "center", gap: 8,
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: 24, padding: "8px 14px",
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
          cursor: "pointer", fontSize: 12, color: "var(--ink-2)",
          fontFamily: "'Geist Mono', monospace",
        }}
      >
        {!isComplete && <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:"var(--accent)", animation:"pulse 1.2s ease-in-out infinite" }}/>}
        <span>{isComplete ? "Done" : progress.phase}</span>
        <span style={{ color:"var(--ink-4)" }}>{progress.current}/{progress.total}</span>
        <svg onClick={(e) => { e.stopPropagation(); onClose(); }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" style={{ cursor:"pointer", marginLeft:4 }}><path d="M6 6l12 12M18 6l-12 12"/></svg>
      </div>
    );
  }

  // Full panel
  return (
    <div role="status" aria-live="polite" aria-label={`Sync ${progress.phase}`} style={{
      position: "fixed", ...panelPos,
      zIndex: 999, width: 420, maxWidth: "calc(100vw - 32px)",
      background: "var(--card)", border: "1px solid var(--line)",
      borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
      display: "flex", flexDirection: "column",
      animation: "slideUp 200ms ease-out",
    }}>
      <style>{`@keyframes slideUp{from{transform:translateY(20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap: 8, padding:"14px 16px 0" }}>
        {!isComplete && (
          <span style={{ width:8, height:8, borderRadius:"50%", background: isError ? "var(--neg)" : "var(--accent)", animation: isError ? "none" : "pulse 1.2s ease-in-out infinite" }}/>
        )}
        {isDone && <Icon name="check" size={16} stroke="var(--pos)"/>}
        {isError && <Icon name="x" size={16} stroke="var(--neg)"/>}
        <span style={{ fontFamily:"'Fraunces',serif", fontSize:14, fontWeight:500, flex:1 }}>
          {isDone ? "Sync Complete" : isError ? "Sync Failed" : "Syncing Gmail"}
        </span>
        <button onClick={() => setMinimized(true)} style={{ background:"none", border:"none", color:"var(--ink-3)", cursor:"pointer", padding:4, display:"flex" }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 15l6-6 6 6"/></svg>
        </button>
        <button onClick={onClose} style={{ background:"none", border:"none", color:"var(--ink-3)", cursor:"pointer", padding:4, display:"flex" }}>
          <Icon name="x" size={14}/>
        </button>
      </div>

      {/* Phase detail — friendly message when no detail, or the detail itself */}
      <div style={{ padding:"4px 16px 0", fontSize:11, color:"var(--ink-3)", fontFamily:"'Geist Mono',monospace" }}>
        {!isComplete ? (_syncMessages[progress.phase] || progress.phase_detail || progress.phase) : ""}
      </div>

      {/* Progress bar */}
      {progress.total > 0 && (
        <div style={{ padding:"10px 16px 0" }}>
          <div style={{ height:3, background:"var(--line)", borderRadius:2, overflow:"hidden" }}>
            <div className={isDone ? "" : "progress-fill-sync"} style={{ height:"100%", width:"100%", background: isDone ? "var(--pos)" : "var(--accent)", borderRadius:2, transform: `scaleX(${Math.min(pct, 100) / 100})` }}/>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:3, fontSize:10, color:"var(--ink-4)", fontFamily:"'Geist Mono',monospace" }}>
            <span>{progress.current}/{progress.total}</span>
            <span>{pct}%</span>
          </div>
        </div>
      )}

      {/* Current email */}
      {progress.current_email && !isComplete && (
        <div style={{ padding:"8px 16px 0", display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ width:6, height:6, borderRadius:"50%", background:"var(--accent)", animation:"pulse 1.2s ease-in-out infinite", flexShrink:0 }}/>
          <div style={{ fontSize:11, color:"var(--ink-2)", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>
            {progress.current_email.subject}
          </div>
          {progress.current_email.amount != null && (
            <span style={{ fontSize:11, color:"var(--ink-4)", fontFamily:"'Geist Mono',monospace", flexShrink:0 }}>
              Rs.{Math.abs(progress.current_email.amount).toLocaleString()}
            </span>
          )}
        </div>
      )}

      {/* Tally */}
      {progress.tally && (
        <div style={{ display:"flex", gap:12, padding:"8px 16px 0", fontSize:11, color:"var(--ink-3)", fontFamily:"'Geist Mono',monospace" }}>
          {[["expense","var(--neg)"],["income","var(--pos)"],["ignore","var(--ink-4)"],["review","var(--accent)"]].map(([k, color]) =>
            (progress.tally[k] || 0) > 0 ? (
              <span key={k}><span style={{ color, fontWeight:600 }}>{progress.tally[k]}</span> {k}</span>
            ) : null
          )}
        </div>
      )}

      {/* Error message */}
      {progress.error && (
        <div style={{ padding:"6px 16px 0", fontSize:11, color:"var(--neg)" }}>
          {progress.error}
        </div>
      )}

      {/* Scrolling log */}
      {(progress.log || []).length > 0 && (
        <div style={{ margin:"10px 12px 8px", maxHeight:160, overflowY:"auto", background:"var(--paper)", borderRadius:6, padding:"6px 8px", fontFamily:"'Geist Mono',monospace", fontSize:10, lineHeight:1.7 }}>
          {progress.log.slice(-30).map((entry, i) => {
            const t = entry.time ? entry.time.slice(11, 22) : "";
            const color = entry.type === "error" ? "var(--neg)" : entry.type === "success" ? "var(--pos)" : "var(--ink-3)";
            return (
              <div key={i} style={{ color, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                <span style={{ opacity:0.4, marginRight:6 }}>{t}</span>
                {entry.message}
              </div>
            );
          })}
          <div ref={logEndRef}/>
        </div>
      )}

      {/* Footer */}
      {isDone && progress.tally && (progress.tally.expense || progress.tally.income || progress.tally.ignore) && (
        <div style={{ padding:"6px 16px 2px", fontSize:11, color:"var(--ink-3)" }}>
          Found <strong style={{color:"var(--neg)"}}>{progress.tally.expense || 0} expenses</strong>
          {progress.tally.income > 0 && <span> and <strong style={{color:"var(--pos)"}}>{progress.tally.income} income entries</strong></span>}.
        </div>
      )}
      {isComplete && (
        <div style={{ display:"flex", justifyContent:"flex-end", gap:8, padding:"10px 16px 12px" }}>
          <button onClick={onClose} style={{
            padding:"6px 14px", background:"var(--ink)", color:"var(--paper)",
            border:"none", borderRadius:6, fontSize:11, cursor:"pointer", fontFamily:"inherit",
          }}>
            {isDone ? "Done" : "Dismiss"}
          </button>
        </div>
      )}
    </div>
  );
};

window.SyncProgressOverlay = SyncProgressOverlay;
