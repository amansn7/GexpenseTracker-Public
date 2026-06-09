// @ts-nocheck
// account-rule-modal.tsx — Rule editor modal/bottom-sheet

const RuleModal = ({ mode, ruleType, rule, categories, onSave, onClose }) => {
  const defaults = {
    sender_domain: { sender_domain: "", label: "expense", category: "", enabled: true },
    pattern: { regex_pattern: "", label: "expense", category: "", merchant: "", enabled: true },
    merchant: { raw: "", canonical: "", category: "" },
    filter: { rule_type: "allowlist_domain", value: "" },
  };
  const [form, setForm] = React.useState(rule || defaults[ruleType] || {});
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true); setError(null);
    try {
      const result = await API.post(RULE_TYPES[ruleType].apiPath, form);
      onSave(result);
      onClose();
    } catch (e) { setError(e.message || "Save failed"); }
    setSaving(false);
  };

  const isCreate = mode === "create";
  const { isMobile } = useViewport();

  const title = isCreate ? `New ${RULE_TYPES[ruleType].label}` : `Edit ${RULE_TYPES[ruleType].label}`;
  const formContent = (
    <>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {ruleType === "sender_domain" && (<>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Sender domain</div>
              <input value={form.sender_domain} onChange={e => set("sender_domain", e.target.value)} style={accountStyles.input} placeholder="e.g. amazon.in" disabled={!isCreate} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Label</div>
              <div role="radiogroup" aria-label="Label" style={{ display: "flex", gap: 6 }}>
                {["expense", "income", "ignore"].map(l => (
                  <button key={l} type="button" role="radio" aria-checked={form.label === l} onClick={() => set("label", l)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer", fontSize: "0.75rem", background: form.label === l ? "var(--ink)" : "transparent", color: form.label === l ? "var(--paper)" : "var(--ink-3)", fontFamily: "inherit", outline: "none", transition: "background 120ms ease, color 120ms ease" }}
                    onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
                    onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Category</div>
              <select value={form.category || ""} onChange={e => set("category", e.target.value)} style={accountStyles.input}>
                <option value="">— none —</option>
                {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>Enabled</span>
              <Toggle checked={form.enabled !== false} onChange={v => set("enabled", v)} />
            </div>
          </>)}
          {ruleType === "pattern" && (<>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Regex pattern</div>
              <input value={form.regex_pattern} onChange={e => set("regex_pattern", e.target.value)} style={{ ...accountStyles.input, fontFamily: "'Geist Mono', monospace" }} placeholder="e.g. (swiggy|zomato)" disabled={!isCreate} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Label</div>
              <div role="radiogroup" aria-label="Label" style={{ display: "flex", gap: 6 }}>
                {["expense", "income"].map(l => (
                  <button key={l} type="button" role="radio" aria-checked={form.label === l} onClick={() => set("label", l)} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid var(--line)", cursor: "pointer", fontSize: "0.75rem", background: form.label === l ? "var(--ink)" : "transparent", color: form.label === l ? "var(--paper)" : "var(--ink-3)", fontFamily: "inherit", outline: "none", transition: "background 120ms ease, color 120ms ease" }}
                    onFocus={e => { e.currentTarget.style.boxShadow = "0 0 0 2px var(--accent)"; }}
                    onBlur={e => { e.currentTarget.style.boxShadow = "none"; }}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Merchant (optional)</div>
              <input value={form.merchant || ""} onChange={e => set("merchant", e.target.value)} style={accountStyles.input} placeholder="e.g. Swiggy" />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Category</div>
              <select value={form.category || ""} onChange={e => set("category", e.target.value)} style={accountStyles.input}>
                <option value="">— none —</option>
                {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 500 }}>Enabled</span>
              <Toggle checked={form.enabled !== false} onChange={v => set("enabled", v)} />
            </div>
          </>)}
          {ruleType === "merchant" && (<>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Raw merchant name</div>
              <input value={form.raw} onChange={e => set("raw", e.target.value)} style={accountStyles.input} placeholder="e.g. swiggy instamart" disabled={!isCreate} />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Canonical name</div>
              <input value={form.canonical} onChange={e => set("canonical", e.target.value)} style={accountStyles.input} placeholder="e.g. Swiggy Instamart" />
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Category</div>
              <select value={form.category || ""} onChange={e => set("category", e.target.value)} style={accountStyles.input}>
                <option value="">— none —</option>
                {categories.map(c => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
          </>)}
          {ruleType === "filter" && (<>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Rule type</div>
              <select value={form.rule_type} onChange={e => set("rule_type", e.target.value)} style={accountStyles.input}>
                <option value="allowlist_domain">Allowlist — keep emails from this domain</option>
                <option value="blocklist_domain">Blocklist — discard emails from this domain</option>
                <option value="keyword_pattern">Keyword — match against subject/body</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: "0.625rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 4 }}>Value</div>
              <input value={form.value} onChange={e => set("value", e.target.value)} style={accountStyles.input} placeholder={form.rule_type === "keyword_pattern" ? "e.g. invoice" : "e.g. amazon.in"} />
            </div>
          </>)}
        </div>
        {error && <div role="alert" style={{ padding: "8px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.75rem", marginTop: 14 }}>{error}</div>}
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={accountStyles.btn}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...accountStyles.btn, ...accountStyles.btnPrimary, opacity: saving ? 0.65 : 1 }}>
            {saving ? "Saving…" : isCreate ? "Create" : "Save"}
          </button>
      </div>
    </>
  );

  return isMobile ? (
    <BottomSheet open title={title} onClose={onClose}>
      {formContent}
    </BottomSheet>
  ) : (
    <Modal open title={title} onClose={onClose} width={480}>
      {formContent}
    </Modal>
  );
};

(window as any).RuleModal = RuleModal;
