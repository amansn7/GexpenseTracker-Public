// ReviewView — Queue Mode and Browse Mode

const ReviewView = ({ reviewQueue, loading, onApprove, onSkip, onEdit, onNavigate }) => {
  const [mode, setMode] = React.useState("queue"); // "queue" | "browse"
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [approvedCount, setApprovedCount] = React.useState(0);
  const [flashId, setFlashId] = React.useState(null);
  const [expandedId, setExpandedId] = React.useState(null);

  const total = reviewQueue?.length || 0;
  const current = reviewQueue?.[currentIndex] || null;

  // Keyboard shortcuts
  React.useEffect(() => {
    if (mode !== "queue" || !current) return;
    const handler = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      if (e.key === "a" || e.key === "A") handleApprove();
      if (e.key === "s" || e.key === "S") handleSkip();
      if (e.key === "e" || e.key === "E") onEdit && onEdit(current.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, current, currentIndex]);

  const handleApprove = async () => {
    if (!current) return;
    if (current.confidence >= 0.9) {
      setFlashId(current.id);
      setTimeout(() => setFlashId(null), 800);
    }
    await onApprove(current.id);
    setApprovedCount((c) => c + 1);
    if (currentIndex >= (reviewQueue?.length || 1) - 1) {
      setCurrentIndex(0);
    }
  };

  const handleSkip = async () => {
    if (!current) return;
    await onSkip(current.id);
    if (currentIndex >= (reviewQueue?.length || 1) - 1) {
      setCurrentIndex(0);
    }
  };

  const fmt = (n) => "₹" + Math.abs(n || 0).toLocaleString("en-IN");

  const confColor = (c) => {
    if (c >= 0.9) return "var(--pos)";
    if (c >= 0.7) return "var(--accent)";
    return "var(--neg)";
  };

  const confLabel = (c) => {
    if (c >= 0.9) return "High";
    if (c >= 0.7) return "Medium";
    return "Low";
  };

  // ── Queue Mode ──
  if (mode === "queue") {
    if (loading) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "calc(100vh - 72px)" }}>
          <div style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading review queue…</div>
        </div>
      );
    }

    if (total === 0) {
      return (
        <div style={{ maxWidth: 560, margin: "0 auto", padding: "48px 28px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--pos)" }} />
            <span style={{ fontSize: 14, color: "var(--ink-3)" }}>All caught up. Nothing needs review.</span>
          </div>
          <button
            onClick={() => setMode("browse")}
            style={{ padding: "8px 16px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink-2)", fontSize: 12, cursor: "pointer" }}
          >
            Browse all transactions
          </button>
        </div>
      );
    }

    const isFlash = flashId === current?.id;
    const isLowConf = current?.confidence < 0.7;

    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "28px 28px 48px" }}>
        {/* Progress */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>
            Review Queue
          </div>
          <div style={{ fontSize: 12, fontFamily: "'Geist Mono', monospace", color: "var(--ink-3)" }}>
            {approvedCount + currentIndex + 1} of {total} reviewed
          </div>
        </div>

        {/* Card */}
        <div style={{
          border: "1px solid var(--line)", borderRadius: 12, background: isFlash ? "var(--pos)" : "var(--card)",
          padding: 24, transition: "background 300ms ease",
        }}>
          {/* Merchant + Amount */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, color: isFlash ? "var(--paper)" : "var(--ink)" }}>
                {current?.merchant || "Unknown"}
              </div>
              <div style={{ fontSize: 12, color: isFlash ? "var(--paper)" : "var(--ink-3)", marginTop: 2 }}>
                {current?.category || "Uncategorized"}
              </div>
            </div>
            <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 24, color: isFlash ? "var(--paper)" : "var(--neg)", fontVariantNumeric: "tabular-nums" }}>
              {fmt(current?.amount)}
            </div>
          </div>

          {/* Confidence */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: isLowConf ? 16 : 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em",
              padding: "3px 8px", borderRadius: 4,
              background: confColor(current?.confidence) + "22",
              color: confColor(current?.confidence),
            }}>
              {confLabel(current?.confidence)} · {Math.round((current?.confidence || 0) * 100)}%
            </span>
          </div>

          {/* Low confidence: show email excerpt */}
          {isLowConf && current?.body_snippet && (
            <div style={{
              marginTop: 12, padding: "10px 12px", background: "var(--paper-2)", borderRadius: 6,
              fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5,
              border: "1px solid var(--line)",
            }}>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--ink-4)", marginBottom: 4 }}>Email excerpt</div>
              {current.body_snippet.slice(0, 200)}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            <button
              onClick={handleApprove}
              style={{
                flex: 2, padding: "12px 20px", background: isFlash ? "var(--paper)" : "var(--ink)",
                color: isFlash ? "var(--pos)" : "var(--paper)", border: "none", borderRadius: 6,
                fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                transition: "all 200ms ease",
              }}
            >
              Approve
              <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 6, fontFamily: "'Geist Mono', monospace" }}>A</span>
            </button>
            <button
              onClick={() => onEdit && onEdit(current.id)}
              style={{
                flex: 1, padding: "12px 16px", background: "var(--card)",
                color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 6,
                fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Edit
              <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4, fontFamily: "'Geist Mono', monospace" }}>E</span>
            </button>
            <button
              onClick={handleSkip}
              style={{
                flex: 1, padding: "12px 16px", background: "transparent",
                color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6,
                fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}
            >
              Skip
              <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4, fontFamily: "'Geist Mono', monospace" }}>S</span>
            </button>
          </div>
        </div>

        {/* Switch to browse */}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button
            onClick={() => setMode("browse")}
            style={{ fontSize: 12, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Browse all transactions
          </button>
        </div>
      </div>
    );
  }

  // ── Browse Mode ──
  return (
    <div style={{ padding: "20px 28px 48px", maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 500 }}>
          Browse Transactions
        </div>
        <button
          onClick={() => setMode("queue")}
          style={{ fontSize: 12, color: "var(--ink-3)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 2 }}
        >
          Back to queue
        </button>
      </div>

      {/* Dense table */}
      <div style={{ border: "1px solid var(--line)", borderRadius: 8, overflow: "hidden", background: "var(--card)" }}>
        {/* Header */}
        <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 120px 80px 80px", gap: 8, padding: "8px 14px", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-4)", fontWeight: 600, borderBottom: "1px solid var(--line)", background: "var(--paper-2)" }}>
          <span>Date</span>
          <span>Merchant</span>
          <span>Category</span>
          <span style={{ textAlign: "right" }}>Amount</span>
          <span style={{ textAlign: "right" }}>Confidence</span>
        </div>

        {/* Rows */}
        {reviewQueue?.map((tx, i) => {
          const expanded = expandedId === tx.id;
          const dateStr = tx.date ? new Date(tx.date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—";
          return (
            <div key={tx.id}>
              <button
                className="hover-row"
                onClick={() => setExpandedId(expanded ? null : tx.id)}
                style={{
                  display: "grid", gridTemplateColumns: "90px 1fr 120px 80px 80px", gap: 8,
                  padding: "10px 14px", border: "none", borderTop: i > 0 ? "1px solid var(--line)" : "none",
                  background: "transparent", cursor: "pointer", textAlign: "left", width: "100%",
                }}
              >
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{dateStr}</span>
                <span style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tx.merchant}</span>
                <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{tx.category}</span>
                <span style={{ fontSize: 13, fontFamily: "'Geist Mono', monospace", color: "var(--neg)", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(tx.amount)}</span>
                <span style={{ fontSize: 12, fontFamily: "'Geist Mono', monospace", color: confColor(tx.confidence), textAlign: "right" }}>{Math.round((tx.confidence || 0) * 100)}%</span>
              </button>
              {expanded && (
                <div style={{ padding: "12px 14px 16px", background: "var(--paper-2)", borderTop: "1px solid var(--line)" }}>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.6 }}>
                    <div style={{ marginBottom: 4 }}><strong>Subject:</strong> {tx.subject}</div>
                    <div style={{ marginBottom: 4 }}><strong>From:</strong> {tx.sender}</div>
                    {tx.body_snippet && <div><strong>Excerpt:</strong> {tx.body_snippet.slice(0, 300)}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button onClick={() => onApprove(tx.id)} style={{ padding: "6px 14px", background: "var(--ink)", color: "var(--paper)", border: "none", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>Approve</button>
                    <button onClick={() => onEdit && onEdit(tx.id)} style={{ padding: "6px 14px", background: "var(--card)", color: "var(--ink-2)", border: "1px solid var(--line)", borderRadius: 4, fontSize: 12, cursor: "pointer" }}>Edit</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {(!reviewQueue || reviewQueue.length === 0) && (
          <div style={{ padding: "24px 14px", textAlign: "center", fontSize: 13, color: "var(--ink-3)" }}>
            No transactions to review.
          </div>
        )}
      </div>
    </div>
  );
};

Object.assign(window, { ReviewView });
