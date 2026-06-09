// @ts-nocheck
// Money Flow view — vertical breakdown

const flowStyles = {
  wrap: { padding: "28px 32px 80px", overflowY: "auto", overflowX: "hidden", height: "calc(100dvh - 72px)" },
  kpis: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12, marginBottom: 28 },
  kpi: { padding: "18px 20px", background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", minWidth: 0, overflow: "hidden" },
  kpiLabel: { fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500 },
  kpiValue: { fontFamily: "'Geist Mono', monospace", fontSize: "1.625rem", fontWeight: 400, letterSpacing: "-0.02em", marginTop: 6, lineHeight: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  kpiSub: { fontSize: "0.75rem", color: "var(--ink-3)", marginTop: 6, display: "flex", alignItems: "center", gap: 4 },
  secWrap: { marginTop: 28 },
  secHead: { borderRadius: "var(--r) var(--r) 0 0", background: "var(--ink)", padding: "11px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" },
  secTitle: { fontSize: "0.6875rem", fontWeight: 600, color: "var(--paper)", textTransform: "uppercase", letterSpacing: "0.1em" },
  secSub: { fontSize: "0.6875rem", fontFamily: "'Geist', sans-serif", fontStyle: "italic", color: "var(--paper)", opacity: 0.45 },
  secBody: { background: "var(--card)", border: "1px solid var(--line)", borderTop: "none", borderRadius: "0 0 var(--r) var(--r)", padding: "20px 16px" },
};



const COLORS = {
  income: 'var(--pos)',
  expense: 'var(--neg)',
  surplus: 'var(--pos)',
  deficit: 'var(--accent)',
  budget: 'var(--ink-2)',
};

const SankeyFlow = ({ data, totalIncome, totalExpense, savings, onCategoryClick }) => {
  const { isMobile } = useViewport();
  const [tooltip, setTooltip] = React.useState(null);
  const tooltipRef = React.useRef(null);
  const hoveredKeyRef = React.useRef(null);
  if (!data) return null;

  const parsed = React.useMemo(() => {
    const incNodes = data.income;
    const expNodes = data.expenses.filter(e => e.cat !== "card" && e.cat !== "investment");
    const totalExp = expNodes.reduce((a, e) => a + e.amount, 0);
    const surplusAmt = savings;  // use prop: already deducts cc_payments + investments
    const hasDeficit = surplusAmt < 0;
    const totalBudget = Math.max(totalIncome, totalExp + Math.abs(surplusAmt));

    const sortedInc = [...incNodes].sort((a, b) => b.amount - a.amount);
    const sortedExp = [...expNodes].sort((a, b) => b.amount - a.amount);

    const incEnd = sortedInc.length + (hasDeficit ? 1 : 0);
    const budgetIdx = incEnd;

    const nodes = [
      ...sortedInc.map(n => ({
        name: n.label,
        value: n.amount,
        percentage: totalBudget > 0 ? Math.round((n.amount / totalBudget) * 100) : 0,
        color: COLORS.income,
        category: "income",
      })),
      ...(hasDeficit ? [{
        name: "📉 Deficit",
        value: Math.abs(surplusAmt),
        percentage: totalBudget > 0 ? Math.round((Math.abs(surplusAmt) / totalBudget) * 100) : 0,
        color: COLORS.deficit,
        category: "deficit",
      }] : []),
      { name: "Budget", value: totalBudget, percentage: 100, color: COLORS.budget, category: "budget" },
      ...sortedExp.map(n => ({
        name: n.cat,
        value: n.amount,
        percentage: totalBudget > 0 ? Math.round((n.amount / totalBudget) * 100) : 0,
        color: COLORS.expense, category: "expense", cat: n.cat,
      })),
      ...(!hasDeficit && surplusAmt > 0 ? [{
        name: "📈 Surplus", value: surplusAmt,
        percentage: totalBudget > 0 ? Math.round((surplusAmt / totalBudget) * 100) : 0,
        color: COLORS.surplus, category: "surplus",
      }] : []),
    ];

    const links = [
      ...sortedInc.map((_, i) => ({ source: i, target: budgetIdx, value: sortedInc[i].amount })),
      ...(hasDeficit ? [{ source: sortedInc.length, target: budgetIdx, value: Math.abs(surplusAmt) }] : []),
      ...sortedExp.map((_, i) => ({ source: budgetIdx, target: budgetIdx + 1 + i, value: sortedExp[i].amount })),
      ...(!hasDeficit && surplusAmt > 0 ? [{ source: budgetIdx, target: nodes.length - 1, value: surplusAmt }] : []),
    ].filter(l => l.value > 0);

    return { nodes, links, totalBudget, hasDeficit };
  }, [data, totalIncome, totalExpense]);

  const svgRef = React.useRef(null);
  const containerRef = React.useRef(null);

  React.useEffect(() => {
    if (!svgRef.current || !parsed.nodes.length) return;
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!container) return;

    const onContainerMove = (e) => {
      if (!hoveredKeyRef.current || !tooltipRef.current) return;
      const rect = container.getBoundingClientRect();
      tooltipRef.current.style.left = `${e.clientX - rect.left + 14}px`;
      tooltipRef.current.style.top = `${e.clientY - rect.top - 10}px`;
    };
    container.addEventListener('mousemove', onContainerMove);

    const width = container.clientWidth || 600;
    const height = Math.min(450, (window.innerHeight || 700) * 0.45);
    const margin = isMobile
      ? { top: 30, right: 50, bottom: 30, left: 50 }
      : { top: 30, right: 180, bottom: 30, left: 180 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const ns = "http://www.w3.org/2000/svg";

    // Snapshot old link shapes for morphing
    const oldShapes = new Map();
    const hadContent = svg.children.length > 0;
    if (hadContent) {
      svg.querySelectorAll('[data-link-key]').forEach(el => {
        oldShapes.set(el.getAttribute('data-link-key'), el.getAttribute('d'));
      });
    }

    // Clear
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.overflow = "visible";

    const gen = d3Sankey.sankey()
      .nodeWidth(isMobile ? 10 : 20)
      .nodePadding(isMobile ? 12 : 15)
      .extent([[0, 0], [innerW, innerH]]);

    const laid = gen({
      nodes: parsed.nodes.map(n => {
        const d = { ...n };
        if (n.category === "budget" && !isMobile) {
          d.height = Math.max(innerH * 0.5, d.height || 0);
        }
        return d;
      }),
      links: parsed.links.map(l => ({ ...l })),
    });

    // Center budget node vertically
    const budgetNode = laid.nodes.find(n => n.category === "budget");
    if (budgetNode) {
      const centerY = innerH / 2;
      const nodeH = budgetNode.y1 - budgetNode.y0;
      budgetNode.y0 = centerY - (nodeH / 2);
      budgetNode.y1 = centerY + (nodeH / 2);
      if (!isMobile) {
        const minH = innerH * 0.5;
        if (budgetNode.y1 - budgetNode.y0 < minH) {
          budgetNode.y0 = centerY - (minH / 2);
          budgetNode.y1 = centerY + (minH / 2);
        }
      }
    }

    const g = document.createElementNS(ns, "g");
    g.setAttribute("transform", `translate(${margin.left},${margin.top})`);
    svg.appendChild(g);

    // Manual offset tracking (Cashkey approach — needed after budget node reposition)
    const sourceOffsets = {};
    const targetOffsets = {};
    laid.nodes.forEach((node) => {
      sourceOffsets[node.index] = node.y0;
      targetOffsets[node.index] = node.y0;
    });

    const sortedLinks = [...laid.links].sort((a, b) => {
      if (a.target.index !== b.target.index) return a.target.index - b.target.index;
      return b.value - a.value;
    });

    // Links
    const linkGroup = document.createElementNS(ns, "g");
    linkGroup.setAttribute("class", "links");
    g.appendChild(linkGroup);

    const curvature = isMobile ? 0.2 : 0.5;

    const morphTargets = new Map();

    sortedLinks.forEach((link, i) => {
      const sx = link.source.x1;
      const tx = link.target.x0;
      const sy = sourceOffsets[link.source.index];
      const ty = targetOffsets[link.target.index];
      const sh = (link.value / link.source.value) * (link.source.y1 - link.source.y0);
      const th = (link.value / link.target.value) * (link.target.y1 - link.target.y0);

      sourceOffsets[link.source.index] += sh;
      targetOffsets[link.target.index] += th;

      const c1x = sx * (1 - curvature) + tx * curvature;
      const c2x = sx * curvature + tx * (1 - curvature);
      const d = [
        `M${sx},${sy}`,
        `C${c1x},${sy} ${c2x},${ty} ${tx},${ty}`,
        `L${tx},${ty + th}`,
        `C${c2x},${ty + th} ${c1x},${sy + sh} ${sx},${sy + sh}`, "Z",
      ].join(" ");

      const val = link.value;
      const pct = parsed.totalBudget > 0 ? Math.round((val / parsed.totalBudget) * 100) : 0;
      const flowLabel = `${link.source.name} to ${link.target.name}: ${window.formatShortNumber(val)}, ${pct}% of budget`;
      const linkKey = `${link.source.name}::${link.target.name}`;
      const isMorph = oldShapes.has(linkKey);
      const linkColor = link.target.color || COLORS.expense;

      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", isMorph ? oldShapes.get(linkKey) : d);
      path.style.fill = linkColor;
      path.setAttribute("fill-opacity", isMobile ? "0.8" : "0.7");
      path.setAttribute("opacity", isMorph ? "1" : "0");
      path.setAttribute("class", "link-flow");
      path.setAttribute("role", "graphics-symbol");
      path.setAttribute("aria-label", flowLabel);
      path.setAttribute("tabindex", "0");
      path.setAttribute("data-link-key", linkKey);
      // Desktop: fill-only hit target (no overlapping hit areas, no hover blink)
      // Mobile: wide transparent stroke for touch accessibility
      if (isMobile) {
        path.setAttribute("stroke", "transparent");
        path.setAttribute("stroke-width", "24");
      } else {
        path.style.pointerEvents = "fill";
      }

      if (isMorph) {
        path.style.transition = 'd 600ms cubic-bezier(0.4,0,0.2,1)';
        morphTargets.set(linkKey, d);
      } else {
        path.style.transition = `opacity 400ms cubic-bezier(0.4,0,0.2,1), transform 400ms cubic-bezier(0.4,0,0.2,1)`;
        path.style.transitionDelay = `${i * 60}ms`;
        path.style.transform = `translateY(6px)`;
      }

      path.addEventListener('mouseenter', (e) => {
        hoveredKeyRef.current = linkKey;
        const rect = container.getBoundingClientRect();
        setTooltip({
          source: link.source.name, target: link.target.name,
          value: val, percentage: pct,
          x: e.clientX - rect.left + 14, y: e.clientY - rect.top - 10,
        });
      });
      path.addEventListener('mouseleave', () => {
        hoveredKeyRef.current = null;
        setTooltip(null);
      });
      if (isMobile) {
        path.addEventListener('touchstart', (e) => {
          e.preventDefault();
          const rect = container.getBoundingClientRect();
          const touch = e.touches[0];
          const prev = linkGroup.querySelector('[data-hovered]');
          if (prev) prev.removeAttribute('data-hovered');
          path.setAttribute('data-hovered', '');
          setTooltip({
            source: link.source.name, target: link.target.name,
            value: val, percentage: pct,
            x: Math.min(touch.clientX - rect.left + 14, (container.clientWidth || 300) - 180),
            y: touch.clientY - rect.top - 10,
          });
        });
        path.addEventListener('touchend', () => { path.removeAttribute('data-hovered'); setTooltip(null); });
      }
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          const rect = container.getBoundingClientRect();
          setTooltip({
            source: link.source.name, target: link.target.name,
            value: val, percentage: pct, x: 14, y: rect.height / 2 - 10,
          });
        }
        if (e.key === 'Escape') setTooltip(null);
      });
      linkGroup.appendChild(path);
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        morphTargets.forEach((newD, key) => {
          const sel = `[data-link-key="${CSS.escape(key)}"]`;
          const p = linkGroup.querySelector(sel);
          if (p) {
            p.getBoundingClientRect();
            p.setAttribute('d', newD);
          }
        });
        sortedLinks.forEach((link, i) => {
          const key = `${link.source.name}::${link.target.name}`;
          if (!oldShapes.has(key)) {
            const p = linkGroup.querySelector(`[data-link-key="${CSS.escape(key)}"]`);
            if (p) {
              p.setAttribute('opacity', '1');
              p.style.transform = '';
            }
          }
        });
      });
    });

    // Nodes
    const nodeGroup = document.createElementNS(ns, "g");
    nodeGroup.setAttribute("class", "nodes");
    g.appendChild(nodeGroup);

    const budgetIdx = laid.nodes.findIndex(n => n.category === "budget");

    laid.nodes.forEach((d) => {
      const ng = document.createElementNS(ns, "g");

      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(d.x0));
      rect.setAttribute("y", String(d.y0));
      rect.setAttribute("width", String(d.x1 - d.x0));
      rect.setAttribute("height", String(d.y1 - d.y0));
      rect.setAttribute("rx", "4");
      rect.setAttribute("ry", "4");
      rect.setAttribute("fill", d.color || COLORS.income);
      rect.setAttribute("fill-opacity", "0.9");
      const cx = d.x0 + (d.x1 - d.x0) / 2;
      const cy = d.y0 + (d.y1 - d.y0) / 2;
      rect.style.transformOrigin = `${cx}px ${cy}px`;
      rect.style.transform = 'scale(0)';
      rect.style.transition = 'transform 500ms cubic-bezier(0.4,0,0.2,1)';
      rect.style.transitionDelay = `${400 + laid.nodes.indexOf(d) * 60}ms`;
      ng.appendChild(rect);

      if (d.category === "expense" || d.category === "income") {
        const drillCat = d.category === "income" ? "__income__" : d.cat;
        rect.style.cursor = "pointer";
        rect.setAttribute("tabindex", "0");
        rect.setAttribute("role", "button");
        rect.setAttribute("aria-label", d.category === "income" ? `View income` : `View ${CategoryService.display(d.cat).label}`);
        rect.addEventListener("click", () => onCategoryClick?.(drillCat));
        rect.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onCategoryClick?.(drillCat); }
        });
      }

      if (d.category !== "budget") {
        const isLeft = laid.nodes.indexOf(d) < budgetIdx;
        const labelOff = isMobile ? 5 : 10;
        const labelX = isLeft ? d.x0 - labelOff : d.x1 + labelOff;
        const text = document.createElementNS(ns, "text");

        const pct = d.percentage < 1 ? "<1" : Math.round(d.percentage);
        let displayName = d.category === "income" ? d.name
          : d.category === "surplus" || d.category === "deficit" ? ""
          : CategoryService.display(d.cat).label;

        if (isMobile && displayName.length > 12) {
          displayName = displayName.substring(0, 10) + "..";
        }

        const label = d.category === "income" || d.category === "surplus" || d.category === "deficit"
          ? `${pct}% ${d.name}`
          : `${pct}% ${displayName}`;
        text.setAttribute("aria-label", label);

        text.setAttribute("x", String(labelX));
        text.setAttribute("y", String(d.y0 + (d.y1 - d.y0) / 2));
        text.setAttribute("dy", "0.35em");
        text.setAttribute("text-anchor", isLeft ? "end" : "start");
        text.setAttribute("font-size", "12px");
        text.setAttribute("fill", "var(--ink-2)");
        text.style.fontFamily = "'Geist', sans-serif";
        text.textContent = label;

        if (isMobile) {
          const angle = isLeft ? 30 : -30;
          const rotX = isLeft ? d.x0 - 8 : d.x1 + 8;
          const rotY = d.y0 + (d.y1 - d.y0) / 2;
          text.setAttribute("transform", `rotate(${angle}, ${rotX}, ${rotY})`);
          text.setAttribute("stroke", "white");
          text.setAttribute("stroke-width", "0.8");
          text.setAttribute("paint-order", "stroke");
        }

        ng.appendChild(text);
      }

      nodeGroup.appendChild(ng);
    });

    // Trigger node scale bounce
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        nodeGroup.querySelectorAll('rect').forEach(r => {
          r.style.transform = 'scale(1)';
        });
      });
    });

    // Mobile: override font-size to 10px minimum
    if (isMobile) {
      const texts = svg.querySelectorAll("text");
      texts.forEach(t => t.setAttribute("font-size", "10px"));
    }

    return () => {
      container.removeEventListener('mousemove', onContainerMove);
    };
  }, [parsed, isMobile]);

  if (!parsed.nodes.length) return null;

  return (
    <div ref={containerRef} style={{ width: "100%", overflow: "hidden", position: "relative" }}>
      <svg ref={svgRef} role="img" aria-label="Sankey diagram showing income and expense flow breakdown" style={{ width: "100%", height: "100%", overflow: "visible" }} />
      {tooltip && (
        <div ref={tooltipRef} className="tooltip-entrance" style={{
          position: "absolute", left: tooltip.x, top: tooltip.y,
          background: "var(--card)", border: "1px solid var(--line)",
          borderRadius: 8, padding: "8px 12px", pointerEvents: "none",
          whiteSpace: "nowrap", zIndex: 50, boxShadow: "0 4px 16px -4px var(--shadow-lg)",
          fontSize: "0.75rem", lineHeight: 1.5,
        }}>
          <div style={{ color: "var(--ink-2)", fontWeight: 500 }}>
            {tooltip.source} <span style={{color:"var(--ink-4)",margin:"0 4px"}}>→</span> {tooltip.target}
          </div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600, color: "var(--ink)", marginTop: 4 }}>
            {"\u20B9" + window.formatShortNumber(tooltip.value)}
          </div>
          <div style={{ color: "var(--ink-3)", fontSize: "0.6875rem", marginTop: 2 }}>
            {tooltip.percentage}% of budget
          </div>
        </div>
      )}
    </div>
  );
};

const FlowBreakdown = ({ data, totalIncome, totalExpenseNumber, totalCCPayments, totalInvestments, savings, incomeSources, pctOfIncome, onCategoryClick, viewMode }) => {
  const { isMobile } = useViewport();

  const regularExpenses = data.expenses.filter(e => e.cat !== "card" && e.cat !== "investment");
  const sortedExpenses = [...regularExpenses].sort((a, b) => b.amount - a.amount);

  const cardExpenses = data.expenses.filter(e => e.cat === "card");
  const invExpenses = data.expenses.filter(e => e.cat === "investment");
  const cardAmt = totalCCPayments;
  const invAmt = totalInvestments;
  const cardTxn = cardExpenses.reduce((a, e) => a + (e.txnCount || 0), 0);
  const invTxn = invExpenses.reduce((a, e) => a + (e.txnCount || 0), 0);

  const hasCommitments = cardAmt > 0 || invAmt > 0;
  const totalSpent = totalExpenseNumber + totalInvestments;
  const totalSpentPct = totalIncome > 0 ? ((totalSpent / totalIncome) * 100).toFixed(1) : "0.0";

  const maxAmount = Math.max(...data.income.map(i => i.amount), ...sortedExpenses.map(e => e.amount), cardAmt > 0 ? cardAmt : 0, invAmt > 0 ? invAmt : 0, 1);

  const isOverspend = savings < 0 && viewMode === "overspend";
  const remainingLabel = isOverspend ? "Overspend" : "Remaining";
  const savingsAbs = Math.abs(savings);
  const displaySavings = isOverspend ? savingsAbs : savings;
  const savingsPct = totalIncome > 0 ? ((displaySavings / totalIncome) * 100).toFixed(1) : "0.0";

  const Dot = ({ cat }) => (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: cat ? CategoryService.colorInk(cat) : "var(--ink-3)",
      flexShrink: 0,
    }}/>
  );

  const BreakdownRow = ({ label, amount, pct, cat, onClick, txnCount }) => {
    const barW = isMobile ? 0 : Math.max(4, (amount / maxAmount) * 160);
    const clickable = !!onClick;
    return (
      <div onClick={onClick}
        role={clickable ? "button" : "presentation"}
        tabIndex={clickable ? 0 : -1}
        onKeyDown={e => { if (clickable && e.key === 'Enter') onClick?.(); }}
        aria-label={clickable ? `${label}: \u20B9${window.formatShortNumber(amount)}` : undefined}
        className={(clickable ? "row-clickable" : "") + (isMobile ? " row-mobile" : "")}
        style={{
          display: "flex", alignItems: "center", gap: isMobile ? 6 : 10,
          padding: isMobile ? "7px 0" : "9px 0",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <Dot cat={cat}/>
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: isMobile ? 6 : 10 }}>
          <span style={{
            fontSize: isMobile ? 12 : 13, color: "var(--ink)", fontWeight: 500,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            maxWidth: isMobile ? 80 : 140,
          }}>
            {label}
          </span>
          {txnCount > 0 && (
            <span style={{ fontSize: "0.625rem", color: "var(--ink-3)", whiteSpace: "nowrap" }}>
              {txnCount} txn
            </span>
          )}
          {barW > 0 && (
            <div style={{
              height: 6, borderRadius: 3, background: "var(--line)", overflow: "hidden",
              width: barW, minWidth: 4, flexShrink: 0,
            }}>
              <div style={{
                height: "100%", width: "100%", borderRadius: 3,
                background: CategoryService.colorInk(cat), opacity: 0.3,
              }}/>
            </div>
          )}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{
            fontFamily: "'Geist Mono', monospace", fontSize: isMobile ? 12 : 13,
            color: cat === "inc" ? "var(--pos)" : "var(--neg)", fontWeight: 500,
          }}>
            {"\u20B9" + window.formatShortNumber(amount)}
          </div>
          <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", marginTop: 1 }}>
            {pct}%
          </div>
        </div>
      </div>
    );
  };

  const SectionHeader = ({ label, amount, color }) => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: isMobile ? "10px 0 6px" : "12px 0 8px",
      marginTop: isMobile ? 4 : 8,
    }}>
      <span style={{
        fontSize: "0.6875rem", fontWeight: 600, color: "var(--ink-3)",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {label}
      </span>
      {amount != null && (
        <span style={{
          fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem",
          color: color || "var(--ink-2)", fontWeight: 500,
        }}>
          {amount}
        </span>
      )}
    </div>
  );

  const SummaryLine = ({ label, amount, pct, color }) => (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 0", borderTop: "1px solid var(--line)", marginTop: 4,
    }}>
      <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink)", letterSpacing: "0.02em" }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{
          fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem",
          color: color || "var(--ink)", fontWeight: 600,
        }}>
          {"\u20B9" + window.formatShortNumber(amount)}
        </span>
        {pct != null && (
          <span style={{
            fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem",
            color: "var(--ink-3)",
          }}>
            {pct}%
          </span>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <SectionHeader label="Total Income" amount={"\u20B9" + window.formatShortNumber(totalIncome)} color="var(--pos)"/>

      {data.income.map((inc, idx) => (
        <BreakdownRow
          key={inc.cat || idx}
          label={inc.label}
          amount={inc.amount}
          pct={totalIncome > 0 ? ((inc.amount / totalIncome) * 100).toFixed(1) : "0.0"}
          cat="inc"
          onClick={() => onCategoryClick("__income__")}
        />
      ))}

      <SectionHeader label={`Expenses · ${pctOfIncome}% of income`}/>

      {sortedExpenses.length === 0 ? (
        <div style={{ padding: "20px 0", textAlign: "center", color: "var(--ink-4)", fontSize: "0.75rem" }}>
          No expenses in this period
        </div>
      ) : (
        sortedExpenses.map((e, idx) => (
          <BreakdownRow
            key={e.cat || idx}
            label={CategoryService.display(e.cat).label}
            amount={e.amount}
            pct={totalIncome > 0 ? ((e.amount / totalIncome) * 100).toFixed(1) : "0.0"}
            cat={e.cat}
            txnCount={e.txnCount || 0}
            onClick={() => onCategoryClick(e.cat)}
          />
        ))
      )}

      {hasCommitments && (
        <>
          <SectionHeader label="Commitments"/>
          {cardAmt > 0 && (
            <BreakdownRow
              label="CC Payments"
              amount={cardAmt}
              pct={totalIncome > 0 ? ((cardAmt / totalIncome) * 100).toFixed(1) : "0.0"}
              cat="card"
              txnCount={cardTxn}
              onClick={() => onCategoryClick("card")}
            />
          )}
          {invAmt > 0 && (
            <BreakdownRow
              label="Investments"
              amount={invAmt}
              pct={totalIncome > 0 ? ((invAmt / totalIncome) * 100).toFixed(1) : "0.0"}
              cat="investment"
              txnCount={invTxn}
              onClick={() => onCategoryClick("investment")}
            />
          )}
        </>
      )}

      <SummaryLine label="Total Spent" amount={totalSpent} pct={totalSpentPct} color="var(--neg)"/>
      <SummaryLine label={remainingLabel} amount={displaySavings} pct={savingsPct} color={savings < 0 ? "var(--neg)" : "var(--pos)"}/>
    </div>
  );
};

const WeeklyBurn = ({ data }) => {
  const max = Math.max(...data.weeklyBurn.map(w => w.spent));
  const { isMobile } = useViewport();
  return (
    <div style={{ padding: "4px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, alignItems: "end", height: isMobile ? 160 : 200, borderBottom: "1px solid var(--line)", paddingBottom: 12, position: "relative" }}>
        {data.weeklyBurn.map((w, idx) => {
          const pct = max > 0 ? (w.spent / max) * 100 : 0;
          return (
            <div key={idx} className="anim-row" style={{"--i": idx, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", borderLeft: idx === 0 ? "none" : "1px dashed var(--line)", height: "100%", padding: isMobile ? "0 6px" : "0 20px", position: "relative" }}>
              <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 6 }}>
                {"\u20B9" + window.formatShortNumber(w.spent)}
              </div>
              <div style={{ width: "100%", maxWidth: 120, background: w.projected ? "url(#diag) var(--paper-2)" : "var(--accent)", opacity: w.projected ? 0.4 : 0.85, height: "100%", borderRadius: "3px 3px 0 0", border: w.projected ? "1px dashed var(--ink-4)" : "none", transform: `scaleY(${Math.max(pct, 2) / 100})`, transformOrigin: "bottom", transition: `transform 400ms cubic-bezier(.2,.8,.2,1) ${idx * 60}ms` }}/>
            </div>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", marginTop: 10 }}>
        {data.weeklyBurn.map((w, idx) => (
          <div key={idx} className="anim-row" style={{"--i": idx, textAlign: "center", fontSize: "0.6875rem", color: "var(--ink-3)", padding: "0 10px" }}>
            <div style={{ fontWeight: 500, color: w.projected ? "var(--ink-4)" : "var(--ink-2)" }}>{w.week}</div>
            {w.projected && <div style={{ fontStyle: "italic", fontFamily: "'Geist', sans-serif", fontSize: "0.75rem", color: "var(--ink-4)" }}>projected</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

const FlowView = React.memo(({ transactions, categoryFilter, dateRange, setDateRange, onNavigateToView, onSetCategoryFilter, onSetFilter, onSetDateRange, onSetInboxDateRange }) => {
  const { isMobile, isTablet } = useViewport();
  const todayStr = new Date().toISOString().slice(0, 10);
  const [activePreset, setActivePreset] = React.useState(null);
  const [stats, setStats] = React.useState(null);
  const [catBreakdown, setCatBreakdown] = React.useState(null);
  const [flowLoading, setFlowLoading] = React.useState(false);
  const [flowError, setFlowError] = React.useState(null);
  const [retryKey, setRetryKey] = React.useState(0);
  const flowScrollRef = React.useRef(null);
  const { pulling: flowPulling, refreshing: flowRefreshing, pullY: flowPullY, handleTouchStart: flowTouchStart, handleTouchMove: flowTouchMove, handleTouchEnd: flowTouchEnd } = usePullToRefresh(function() { setRetryKey(function(k) { return k + 1; }); }, { scrollRef: flowScrollRef });
  const [viewMode, setViewMode] = React.useState("remaining");
  const [showSankey, setShowSankey] = React.useState(false);
  const [compareStats, setCompareStats] = React.useState(null);
  const [drillCategory, setDrillCategory] = React.useState(null);
  const [drillTxns, setDrillTxns] = React.useState(null);
  const [drillClosing, setDrillClosing] = React.useState(false);
  const closeDrill = () => { if (drillClosing) return; setDrillClosing(true); setTimeout(() => { setDrillCategory(null); setDrillClosing(false); }, 150); };

  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setFlowLoading(true);
      try {
        const dateQP = (dateRange.from && dateRange.to) ? `date_from=${dateRange.from}&date_to=${dateRange.to}` : "";
        const catQP = categoryFilter ? `&category=${encodeURIComponent(categoryFilter)}` : "";
        const sections = "summary,categoryBreakdown";
        const result = await API.get(`/api/stats?sections=${sections}&${dateQP}${catQP}&compare=true`);
        if (!cancelled) {
          setStats(result.summary || null);
          setCatBreakdown(result.categoryBreakdown || null);
          setCompareStats(result.previousPeriod?.summary || null);
        }
      } catch (e) {
        if (!cancelled) setFlowError(e.message || "Failed to load");
      }
      if (!cancelled) setFlowLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [dateRange.from, dateRange.to, categoryFilter, retryKey]);

  React.useEffect(() => {
    if (!drillCategory) { setDrillTxns(null); return; }
    setDrillTxns(null);
    let cancelled = false;
    const isIncome = drillCategory === "__income__";
    const dateQP = (dateRange.from && dateRange.to) ? `&date_from=${dateRange.from}&date_to=${dateRange.to}` : "";
    const qp = isIncome
      ? `label=income${dateQP}&limit=200`
      : `category=${encodeURIComponent(drillCategory)}${dateQP}&limit=200`;
    API.get(`/api/transactions?${qp}`)
      .then(d => { if (!cancelled) setDrillTxns(d.items || []); })
      .catch(() => { if (!cancelled) setDrillTxns([]); });
    return () => { cancelled = true; };
  }, [drillCategory, dateRange.from, dateRange.to]);

  const rangeTxs = !dateRange.from
    ? transactions.filter(t => !categoryFilter || t.cat === categoryFilter)
    : transactions.filter(t => t.date >= dateRange.from && t.date <= dateRange.to && (!categoryFilter || t.cat === categoryFilter));
  const flow = stats && catBreakdown ? buildFlowSummary(rangeTxs, stats, catBreakdown, dateRange.from, dateRange.to) : null;

  const totalIncome = flow ? flow.totalIncome : 0;
  const totalExpense = flow ? flow.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").reduce((a, e) => a + e.amount, 0) : 0;
  const totalCCPayments = stats?.total_cc_payments ?? 0;
  const totalInvestments = stats?.total_investments ?? 0;
  const savings = totalIncome - totalExpense - totalCCPayments - totalInvestments;
  const savingsRate = totalIncome > 0 ? (savings / totalIncome * 100).toFixed(1) : "0.0";
  const rangeDays = !dateRange.from
    ? (() => {
        const dates = rangeTxs.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
        if (dates.length < 2) return 1;
        return Math.max(1, Math.round((Math.max(...dates) - Math.min(...dates)) / 86400000) + 1);
      })()
    : Math.max(1, Math.round((new Date(dateRange.to) - new Date(dateRange.from)) / 86400000) + 1);
  const daily = flow ? Math.round(totalExpense / rangeDays) : 0;
  const incomeSources = flow ? flow.income.length : 0;
  const pctOfIncome = totalIncome > 0 ? Math.round(totalExpense / totalIncome * 100) : 0;

  const deltaPct = (current, previous) => {
    if (!previous || previous === 0) return null;
    return ((current - previous) / previous * 100).toFixed(1);
  };
  const prevExpense = compareStats?.total_expenses ?? null;
  const prevIncome = compareStats?.total_income ?? null;
  const prevSavings = compareStats?.saved ?? null;
  const expDelta = deltaPct(totalExpense, prevExpense);
  const incDelta = deltaPct(totalIncome, prevIncome);
  const savDelta = deltaPct(savings, prevSavings);
  const isBadUp = viewMode === "overspend" && savings < 0;
  const savUp = savDelta != null && parseFloat(savDelta) >= 0;

  const handleCategoryClick = (cat) => {
    setDrillCategory(cat || "__income__");
  };

  return (
    <div ref={flowScrollRef} className="view-enter" style={{ ...flowStyles.wrap, ...(isMobile ? { padding: "16px 14px 80px", height: mobileStyles.navOffset } : isTablet ? { padding: "24px 22px 64px" } : {}), ...(isMobile ? { touchAction: "pan-y" } : {}) }}
      onTouchStart={isMobile ? flowTouchStart : undefined}
      onTouchMove={isMobile ? flowTouchMove : undefined}
      onTouchEnd={isMobile ? flowTouchEnd : undefined}>
      {(flowPulling || flowRefreshing) && (
        <div style={{
          height: flowRefreshing ? 36 : flowPullY,
          display: "flex", alignItems: "center",
          justifyContent: "center", gap: 8, fontSize: "0.8125rem", color: "var(--ink-3)",
          flexShrink: 0,
          transition: flowPullY === 0 && !flowPulling ? "height 0.2s ease" : "none"
        }}>
          {flowRefreshing ? (
            <><span className="spinner-sm" /> Refreshing…</>
          ) : (
            <><Icon name={flowPullY > 80 ? "refresh" : "arrow-down"}
              style={{ transform: flowPullY > 80 ? "rotate(180deg)" : "none",
                       transition: "transform 0.2s ease" }} />
              {flowPullY > 80 ? "Release to refresh" : "Pull to refresh"}</>
          )}
        </div>
      )}
      {flowError && (
        <div className="flow-error" style={{ padding: "10px 16px", background: "var(--neg-soft)", border: "1px solid var(--neg)", borderRadius: "var(--r)", marginBottom: 16, fontSize: "0.8125rem", color: "var(--neg)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Couldn't load flow data. <span style={{ cursor: "pointer", textDecoration: "underline", fontWeight: 600 }} onClick={() => setRetryKey(k => k + 1)}>Retry</span></span>
          <button onClick={() => setFlowError(null)} style={{ background: "none", border: "none", color: "var(--neg)", cursor: "pointer", fontWeight: 600, fontSize: "0.75rem" }}>Dismiss</button>
        </div>
      )}
      <div style={{ ...flowStyles.kpis, ...(isMobile ? { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" } : {}) }}>
        {flowLoading
          ? <>
              {[["Remaining", "var(--pos)"], ["Income", "var(--pos)"], ["Spent", "var(--ink)"], ["Daily burn", "var(--ink)"]].map(([label, _], i) => (
                <div key={i} style={flowStyles.kpi}>
                  <div style={flowStyles.kpiLabel}>{label}</div>
                  <div style={{ marginTop: 8 }}><Skeleton width="70%" height={26} /></div>
                  <div style={{ marginTop: 8 }}><Skeleton width="40%" height={12} /></div>
                </div>
              ))}
            </>
          : <>
              <div className="anim-row-spring" style={{"--i": 0, ...flowStyles.kpi}}>
                <div style={flowStyles.kpiLabel}>{viewMode === "overspend" && savings < 0 ? "Overspend" : "Remaining"}</div>
                <div style={{ ...flowStyles.kpiValue, color: viewMode === "overspend" && savings < 0 ? "var(--neg)" : "var(--pos)", ...(isMobile ? { fontSize: "1.25rem" } : {}) }} title={`₹${savings.toLocaleString("en-IN")}`}>{"\u20B9" + window.formatShortNumber(savings)}</div>
                <div style={flowStyles.kpiSub}>{viewMode === "overspend" && savings < 0 ? `${Math.abs(parseFloat(savingsRate))}% overspend` : `${savingsRate}% savings rate`}{savDelta != null && <span style={{color: savUp !== isBadUp ? "var(--pos)" : "var(--neg)", marginLeft: 4, fontSize: "0.6875rem"}}><span aria-hidden="true">{savUp ? "↑" : "↓"}</span><span aria-label={`${savUp ? "Increased" : "Decreased"} by ${Math.abs(savDelta)}%`}>{Math.abs(savDelta)}%</span></span>}</div>
              </div>
              <div className="anim-row-spring" style={{"--i": 1, ...flowStyles.kpi}}>
                <div style={flowStyles.kpiLabel}>Income</div>
                <div style={{ ...flowStyles.kpiValue, color: "var(--pos)", ...(isMobile ? { fontSize: "1.25rem" } : {}) }} title={`₹${totalIncome.toLocaleString("en-IN")}`}>{"\u20B9" + window.formatShortNumber(totalIncome)}</div>
                <div style={flowStyles.kpiSub}><Icon name="trend-u" size={11}/> {incomeSources} source{incomeSources !== 1 ? "s" : ""}{incDelta != null && <span style={{color: parseFloat(incDelta) >= 0 ? "var(--pos)" : "var(--neg)", marginLeft: 4, fontSize: "0.6875rem"}}><span aria-hidden="true">{parseFloat(incDelta) >= 0 ? "\u2191" : "\u2193"}</span><span aria-label={`${parseFloat(incDelta) >= 0 ? "Increased" : "Decreased"} by ${Math.abs(incDelta)}%`}>{Math.abs(incDelta)}%</span></span>}</div>
              </div>
              <div className="anim-row-spring" style={{"--i": 2, ...flowStyles.kpi}}>
                <div style={flowStyles.kpiLabel}>Spent</div>
                <div style={{ ...flowStyles.kpiValue, ...(isMobile ? { fontSize: "1.25rem" } : {}) }} title={`₹${totalExpense.toLocaleString("en-IN")}`}>{"\u20B9" + window.formatShortNumber(totalExpense)}</div>
                <div style={flowStyles.kpiSub}><Icon name="trend-d" size={11}/> {pctOfIncome}% of income{expDelta != null && <span style={{color: parseFloat(expDelta) >= 0 ? "var(--neg)" : "var(--pos)", marginLeft: 4, fontSize: "0.6875rem"}}><span aria-hidden="true">{parseFloat(expDelta) >= 0 ? "↑" : "↓"}</span><span aria-label={`${parseFloat(expDelta) >= 0 ? "Increased" : "Decreased"} by ${Math.abs(expDelta)}%`}>{Math.abs(expDelta)}%</span></span>}</div>
              </div>
              <div className="anim-row-spring" style={{"--i": 3, ...flowStyles.kpi}}>
                <div style={flowStyles.kpiLabel}>Daily burn</div>
                <div style={{ ...flowStyles.kpiValue, ...(isMobile ? { fontSize: "1.25rem" } : {}) }}>{"\u20B9" + window.formatShortNumber(daily)}</div>
                <div style={flowStyles.kpiSub}>over {rangeDays} day{rangeDays !== 1 ? "s" : ""}{expDelta != null && <span style={{fontSize: "0.6875rem", color: "var(--ink-3)", marginLeft: 4}}>vs prev <span aria-hidden="true">{parseFloat(expDelta) >= 0 ? "↑" : "↓"}</span><span aria-label={`${parseFloat(expDelta) >= 0 ? "Increased" : "Decreased"} by ${Math.abs(expDelta)}%`}>{Math.abs(expDelta)}%</span></span>}</div>
              </div>
            </>
        }
      </div>

      <div style={flowStyles.secWrap}>
        <div style={flowStyles.secHead}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={flowStyles.secTitle}>How money moved · {rangeTxs.length} emails</span>
            {savings < 0 && (
              <div role="radiogroup" aria-label="View mode" className="flow-toggle-group" style={{ display: "flex", gap: 0, borderRadius: 4, padding: 2 }}>
                <button role="radio" aria-checked={viewMode === "remaining"} onClick={() => setViewMode("remaining")} style={{
                  padding: "3px 8px", fontSize: "0.625rem", fontWeight: 500, lineHeight: 1, fontFamily: "'Geist', sans-serif",
                  background: viewMode === "remaining" ? "var(--paper)" : "transparent",
                  color: viewMode === "remaining" ? "var(--ink)" : "var(--paper)",
                  border: "none", borderRadius: 3, cursor: "pointer", transition: "all 120ms", outline: "none"
                }}
                  onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}>Remaining</button>
                <button role="radio" aria-checked={viewMode === "overspend"} onClick={() => setViewMode("overspend")} style={{
                  padding: "3px 8px", fontSize: "0.625rem", fontWeight: 500, lineHeight: 1, fontFamily: "'Geist', sans-serif",
                  background: viewMode === "overspend" ? "var(--paper)" : "transparent",
                  color: viewMode === "overspend" ? "var(--ink)" : "var(--paper)",
                  border: "none", borderRadius: 3, cursor: "pointer", transition: "all 120ms", outline: "none"
                }}
                  onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
                  onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}>Overspend</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ background: "var(--paper-2)", border: "1px solid var(--line)", borderTop: "none", padding: isMobile ? "10px 12px" : "8px 20px", display: "flex", justifyContent: "flex-end", overflowX: "auto" }}>
          <DateRangeControl
            rangeFrom={dateRange.from}
            rangeTo={dateRange.to}
            activePreset={activePreset}
            onChange={(f, t, p) => { setDateRange({ from: f, to: t }); setActivePreset(p); }}
          />
        </div>
        <div style={{ ...flowStyles.secBody }}>
          {flowLoading
            ? <>
                <div style={{ marginBottom: 20, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: isMobile ? "14px 8px" : "16px 14px" }}>
                  <div style={{ display: "flex", gap: 24, alignItems: "stretch", justifyContent: "center", height: 180 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
                      <Skeleton width={50} height={10} />
                      <Skeleton width={40} height={10} />
                      <Skeleton width={60} height={10} />
                    </div>
                    <div style={{ flex: 1, position: "relative", maxWidth: 200 }}>
                      <Skeleton width="56%" height="100%" variant="rect" style={{ position: "absolute", left: "22%", top: 0, borderRadius: 4 }} />
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, justifyContent: "center" }}>
                      <Skeleton width={50} height={10} />
                      <Skeleton width={55} height={10} />
                      <Skeleton width={45} height={10} />
                      <Skeleton width={60} height={10} />
                    </div>
                  </div>
                </div>
                <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
                  {[1,2,3,4,5,6].map(i => (
                    <div key={i} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <Skeleton width={`${30 + i * 8}%`} height={12} />
                      <div style={{ flex: 1 }}><Skeleton width="100%" height={20} /></div>
                    </div>
                  ))}
                </div>
              </>
            : flow
               ? <>
                   {(!isMobile || showSankey) && (
                     <div style={{ marginBottom: 20, background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r)", padding: isMobile ? "14px 8px" : "16px 14px" }}>
                       <SankeyFlow data={flow} totalIncome={totalIncome} totalExpense={totalExpense} savings={savings} onCategoryClick={handleCategoryClick}/>
                       {isMobile && (
                         <div style={{ marginTop: 8, textAlign: "center" }}>
                           <button onClick={() => setShowSankey(false)} style={{ padding: "6px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.75rem", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit" }}>
                             View list
                           </button>
                         </div>
                       )}
                     </div>
                   )}
                   {isMobile && !showSankey && (
                     <div style={{ marginBottom: 12 }}>
                       <button onClick={() => setShowSankey(true)} style={{ padding: "6px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.75rem", color: "var(--ink-2)", cursor: "pointer", fontFamily: "inherit", width: "100%" }}>
                         View Sankey diagram
                       </button>
                     </div>
                   )}
                   <FlowBreakdown data={flow} totalIncome={totalIncome} totalExpenseNumber={totalExpense} totalCCPayments={totalCCPayments} totalInvestments={totalInvestments} savings={savings} incomeSources={incomeSources} pctOfIncome={pctOfIncome} onCategoryClick={handleCategoryClick} viewMode={viewMode}/>
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--line)", display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}>
                      <span style={{ fontSize: "0.625rem", color: "var(--ink-4)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase", whiteSpace: "nowrap" }}>Timeline</span>
                      {flow.weeklyBurn.map((w, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: w.projected ? "var(--ink-4)" : "var(--accent)", opacity: w.projected ? 0.3 : 1 }}/>
                          {i < flow.weeklyBurn.length - 1 && <div style={{ width: 12, height: 1, background: "var(--line)" }}/>}
                        </div>
                      ))}
                      <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)", marginLeft: 4 }}>
                        {(() => {
                          const now = new Date();
                          const activeIdx = flow.weeklyBurn.findIndex(w => !w.projected && new Date(w.week.match(/W\d · (.+)/)?.[1]?.split("–")[0] || "") <= now);
                          return activeIdx >= 0 ? `${flow.weeklyBurn.filter(w => !w.projected).length} of ${flow.weeklyBurn.length} weeks` : "";
                        })()}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      {(() => {
                        const sr = savingsRate;
                        const topCat = flow.expenses.filter(e => e.cat !== "card" && e.cat !== "investment").sort((a, b) => b.amount - a.amount)[0];
                        return [
                          { label: "Saved", value: `${sr}%`, color: "var(--pos)" },
                          { label: "Daily", value: "\u20B9" + window.formatShortNumber(daily), color: "var(--ink)" },
                          { label: "Top", value: topCat ? (CategoryService.display(topCat.cat).label || topCat.cat) : "\u2014", color: "var(--accent)" },
                        ].map((pill, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", background: "var(--paper-2)", borderRadius: 6, fontSize: "0.6875rem", whiteSpace: "nowrap" }}>
                            <span style={{ color: "var(--ink-4)", fontWeight: 500 }}>{pill.label}</span>
                            <span style={{ color: pill.color, fontWeight: 600, fontFamily: "'Geist Mono', monospace" }}>{pill.value}</span>
                          </div>
                        ));
                      })()}
                    </div>
                  </div>
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--line)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: "0.625rem", color: "var(--ink-4)", fontWeight: 500, letterSpacing: "0.08em", textTransform: "uppercase" }}>Weekly burn</span>
                      <span style={{ fontSize: "0.6875rem", fontFamily: "'Geist', sans-serif", fontStyle: "italic", color: "var(--ink-4)", opacity: 0.6 }}>when the money actually leaves</span>
                    </div>
                    <WeeklyBurn data={flow}/>
                  </div>
                </>
              : <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <div style={{ fontSize: "1.75rem", marginBottom: 8, opacity: 0.3 }}>┄</div>
                  <div style={{ color: "var(--ink-3)", fontSize: "0.8125rem", fontWeight: 500 }}>No transactions in this range</div>
                  <div style={{ color: "var(--ink-3)", fontSize: "0.75rem", marginTop: 4 }}>
                    Try a wider date range or sync your inbox
                  </div>
                  <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "center" }}>
                    <button onClick={() => { setActivePreset("3m"); setDateRange({ from: DateUtils.getLastNDays(89).from, to: todayStr }); }}
                      style={{ padding: "6px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.75rem", color: "var(--ink-2)", cursor: "pointer" }}>Last 3 months</button>
                    <button onClick={() => { setActivePreset("1y"); setDateRange({ from: DateUtils.getLastNDays(364).from, to: todayStr }); }}
                      style={{ padding: "6px 14px", background: "var(--paper-2)", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.75rem", color: "var(--ink-2)", cursor: "pointer" }}>Last year</button>
                  </div>
                </div>
          }
        </div>
      </div>

      {drillCategory && (isMobile ? (
        <div style={{...bottomSheetStyles.overlay, zIndex: 200}}
          className={drillClosing ? "backdrop-out" : "backdrop-in"}
          role="dialog" aria-modal="true" aria-label={drillCategory === "__income__" ? "Income" : (CategoryService.display(drillCategory)?.label || drillCategory)}
          onClick={closeDrill}>
          <div style={bottomSheetStyles.sheet} onClick={e => e.stopPropagation()}>
            <div style={bottomSheetStyles.handle} />
            <div style={{padding: "0 16px 8px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", flexShrink: 0}}>
              <span style={{fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)"}}>
                {drillCategory === "__income__" ? "Income" : (CategoryService.display(drillCategory)?.label || drillCategory)}
              </span>
              <span style={{marginLeft: 12, fontSize: "0.75rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace"}}>
                {drillCategory === "__income__"
                  ? "\u20B9" + window.formatShortNumber(totalIncome)
                  : (() => {
                      const c = catBreakdown?.categories?.find(c => normCat(c.category, false) === drillCategory);
                      return c ? "\u20B9" + window.formatShortNumber(c.amount) : "";
                    })()
                }
              </span>
              <button onClick={closeDrill} aria-label="Close"
                style={{marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex"}}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div style={{padding: "8px 16px"}}>
              {drillTxns === null ? (
                <div style={{padding: "40px 0", textAlign: "center", color: "var(--ink-3)", fontSize: "0.8125rem"}}>Loading transactions</div>
              ) : drillTxns.length === 0 ? (
                <div style={{padding: "40px 0", textAlign: "center", color: "var(--ink-4)", fontSize: "0.8125rem"}}>No transactions in this range</div>
              ) : (() => {
                const nonzero = drillTxns.filter(tx => tx.amount != null && tx.amount !== 0);
                return nonzero.length === 0 ? (
                  <div style={{padding: "40px 0", textAlign: "center", color: "var(--ink-4)", fontSize: "0.8125rem"}}>No transactions in this range</div>
                ) : nonzero.map((tx, i) => (
                  <div key={tx.id} className="anim-row" style={{"--i": i, display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < nonzero.length - 1 ? "1px solid var(--line)" : "none"}}>
                    <MerchantLogo merchant={tx.merchant || "?"} size={24}/>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)"}}>{tx.merchant || "Unknown"}</div>
                      <div style={{fontSize: "0.6875rem", color: "var(--ink-4)", marginTop: 1}}>{tx.date}</div>
                    </div>
                    <div style={{fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600, color: "var(--pos)"}}>
                      {"\u20B9" + window.formatShortNumber(Math.abs(tx.amount))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div style={bottomSheetStyles.footer}>
              <button onClick={() => {
                const cat = drillCategory;
                setDrillCategory(null);
                if (!onNavigateToView) return;
                if (onSetCategoryFilter) onSetCategoryFilter(cat === "__income__" ? "income" : cat);
                if (onSetFilter) onSetFilter(cat === "__income__" ? "all" : "all");
                if (onSetDateRange) onSetDateRange({ from: dateRange.from, to: dateRange.to });
                if (onSetInboxDateRange) onSetInboxDateRange({ from: dateRange.from, to: dateRange.to });
                onNavigateToView("inbox");
              }}
                style={{border: "none", background: "none", color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500}}>
                View all in inbox
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div style={{position: "fixed", inset: 0, background: "var(--overlay)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 16}}
          className={drillClosing ? "backdrop-out" : "backdrop-in"}
          role="dialog" aria-modal="true" aria-label={drillCategory === "__income__" ? "Income" : (CategoryService.display(drillCategory)?.label || drillCategory)}
          onClick={closeDrill}
          onKeyDown={e => { if (e.key === 'Escape') closeDrill(); }}>
          <div className={drillClosing ? "modal-out" : "modal-in"} style={{background: "var(--card)", border: "1px solid var(--line)", borderRadius: 10, width: "100%", maxWidth: 520, maxHeight: "80vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px -16px var(--shadow-lg)"}}
            onClick={e => e.stopPropagation()}>
            <div style={{padding: "16px 20px", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", flexShrink: 0}}>
              <span style={{fontSize: "0.75rem", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--ink-3)"}}>
                {drillCategory === "__income__" ? "Income" : (CategoryService.display(drillCategory)?.label || drillCategory)}
              </span>
              <span style={{marginLeft: 12, fontSize: "0.75rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace"}}>
                {drillCategory === "__income__"
                  ? "\u20B9" + window.formatShortNumber(totalIncome)
                  : (() => {
                      const c = catBreakdown?.categories?.find(c => normCat(c.category, false) === drillCategory);
                      return c ? "\u20B9" + window.formatShortNumber(c.amount) : "";
                    })()
                }
              </span>
              <button onClick={closeDrill} aria-label="Close"
                style={{marginLeft: "auto", border: "none", background: "none", cursor: "pointer", color: "var(--ink-3)", padding: 4, display: "flex"}}>
                <Icon name="x" size={16}/>
              </button>
            </div>
            <div style={{overflowY: "auto", padding: "8px 0", flex: 1}}>
              {drillTxns === null ? (
                <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-3)", fontSize: "0.8125rem"}}>Loading transactions</div>
              ) : drillTxns.length === 0 ? (
                <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-4)", fontSize: "0.8125rem"}}>No transactions in this range</div>
              ) : (() => {
                const nonzero = drillTxns.filter(tx => tx.amount != null && tx.amount !== 0);
                return nonzero.length === 0 ? (
                  <div style={{padding: "40px 20px", textAlign: "center", color: "var(--ink-4)", fontSize: "0.8125rem"}}>No transactions in this range</div>
                ) : nonzero.map((tx, i) => (
                  <div key={tx.id} className="anim-row" style={{"--i": i, display: "flex", alignItems: "center", gap: 10, padding: "8px 20px", borderBottom: i < nonzero.length - 1 ? "1px solid var(--line)" : "none"}}>
                    <MerchantLogo merchant={tx.merchant || "?"} size={24}/>
                    <div style={{flex: 1, minWidth: 0}}>
                      <div style={{fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)"}}>{tx.merchant || "Unknown"}</div>
                      <div style={{fontSize: "0.6875rem", color: "var(--ink-4)", marginTop: 1}}>{tx.date}</div>
                    </div>
                    <div style={{fontFamily: "'Geist Mono', monospace", fontSize: "0.875rem", fontWeight: 600, color: "var(--pos)"}}>
                      {"\u20B9" + window.formatShortNumber(Math.abs(tx.amount))}
                    </div>
                  </div>
                ));
              })()}
            </div>
            <div style={{padding: "10px 20px", borderTop: "1px solid var(--line)", textAlign: "center", flexShrink: 0}}>
              <button onClick={() => {
                const cat = drillCategory;
                setDrillCategory(null);
                if (!onNavigateToView) return;
                if (onSetCategoryFilter) onSetCategoryFilter(cat === "__income__" ? "income" : cat);
                if (onSetFilter) onSetFilter(cat === "__income__" ? "all" : "all");
                if (onSetDateRange) onSetDateRange({ from: dateRange.from, to: dateRange.to });
                if (onSetInboxDateRange) onSetInboxDateRange({ from: dateRange.from, to: dateRange.to });
                onNavigateToView("inbox");
              }}
                style={{border: "none", background: "none", color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500}}>
                View all in inbox
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
});

Object.assign(window as any, { FlowView });
