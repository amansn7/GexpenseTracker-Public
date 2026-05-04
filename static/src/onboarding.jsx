// Onboarding wizard — 5-step setup flow for MoneyFlow
// No module system: raw JSX loaded via Babel in browser.
// React / ReactDOM are global. API global from data.jsx.

const { useState, useEffect, useRef } = React;

// ---------------------------------------------------------------------------
// Provider presets (Step 3)
// ---------------------------------------------------------------------------
const providerPresets = [
  { provider: "openai",     display_name: "OpenAI",         model_id: "gpt-4o-mini",                          base_url: "https://api.openai.com/v1" },
  { provider: "openrouter", display_name: "OpenRouter",     model_id: "google/gemini-2.0-flash-exp:free",     base_url: "https://openrouter.ai/api/v1" },
  { provider: "gemini",     display_name: "Google Gemini",  model_id: "gemini-2.0-flash",                     base_url: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { provider: "grok",       display_name: "Grok",           model_id: "grok-3-mini",                          base_url: "https://api.x.ai/v1" },
  { provider: "scaleway",   display_name: "Scaleway",       model_id: "llama-3.3-70b-instruct",               base_url: "https://api.scaleway.ai/v1" },
  { provider: "custom",     display_name: "Custom",         model_id: "",                                     base_url: "" },
];

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const S = {
  label: { fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, marginBottom: 5, display: "block" },
  input: { width: "100%", padding: "9px 12px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--paper)", color: "var(--ink)", fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  inputReadonly: { background: "var(--paper-2)", color: "var(--ink-3)", cursor: "default" },
  btnPrimary: { padding: "10px 20px", background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)", borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  btnSecondary: { padding: "10px 20px", background: "transparent", color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6, fontSize: 13, cursor: "pointer", fontFamily: "inherit" },
  error: { padding: "10px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: 13, marginBottom: 16 },
  success: { padding: "10px 12px", background: "var(--pos-soft, #d1fae5)", color: "var(--pos, #059669)", borderRadius: 6, fontSize: 13, marginBottom: 16 },
  fieldWrap: { marginBottom: 14 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  h2: { fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 400, letterSpacing: "-0.02em", margin: "0 0 6px", color: "var(--ink)" },
  sub: { fontSize: 13, color: "var(--ink-3)", marginBottom: 24, lineHeight: 1.5 },
};

// ---------------------------------------------------------------------------
// WizardShell — full-viewport centered card with progress bar
// ---------------------------------------------------------------------------
const WizardShell = ({ step, children }) => {
  const pct = (step / 5) * 100;
  return (
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "var(--paper)", zIndex: 1000 }}>
      <div style={{ maxWidth: 480, width: "90%", display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Progress bar — sits above card */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.05em" }}>Step {step} of 5</span>
            <span style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{Math.round(pct)}%</span>
          </div>
          <div style={{ height: 3, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "var(--accent)", borderRadius: 99, transition: "width 300ms ease" }} />
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: 40 }}>
          {children}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 1 — Profile
// ---------------------------------------------------------------------------
const StepProfile = ({ advance }) => {
  const [form, setForm] = useState({ full_name: "", email: "", display_name: "", default_currency: "INR", timezone: "Asia/Kolkata" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [alreadySetUp, setAlreadySetUp] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setAlreadySetUp(false);
    try {
      await API.post("/api/account/onboarding", form);
      advance(2, { email: form.email });
    } catch (err) {
      if (err.status === 409 || (err.message || "").includes("409")) {
        setAlreadySetUp(true);
      } else {
        setError(err.message || "Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h2 style={S.h2}>Set up your profile</h2>
      <p style={S.sub}>Tell us a little about yourself to get started with MoneyFlow.</p>

      {alreadySetUp && (
        <div style={S.error}>
          Account already set up — connect Gmail to continue.
          <div style={{ marginTop: 10 }}>
            <button onClick={() => advance(2)} style={S.btnPrimary}>Continue to Gmail</button>
          </div>
        </div>
      )}

      {error && (
        <div style={S.error}>
          {error}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setError(null)} style={{ ...S.btnSecondary, fontSize: 12, padding: "6px 12px" }}>Dismiss</button>
          </div>
        </div>
      )}

      {!alreadySetUp && (
        <form onSubmit={submit}>
          <div style={S.fieldWrap}>
            <label style={S.label}>Full name <span style={{ color: "var(--neg)" }}>*</span></label>
            <input required style={S.input} value={form.full_name} onChange={e => set("full_name", e.target.value)} placeholder="Aman Saini" />
          </div>
          <div style={S.fieldWrap}>
            <label style={S.label}>Email <span style={{ color: "var(--neg)" }}>*</span></label>
            <input required type="email" style={S.input} value={form.email} onChange={e => set("email", e.target.value)} placeholder="you@example.com" />
          </div>
          <div style={S.fieldWrap}>
            <label style={S.label}>Display name</label>
            <input style={S.input} value={form.display_name} onChange={e => set("display_name", e.target.value)} placeholder="Short name shown in the app" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
            <div>
              <label style={S.label}>Currency</label>
              <select style={S.input} value={form.default_currency} onChange={e => set("default_currency", e.target.value)}>
                <option value="INR">INR — ₹ Rupee</option>
                <option value="USD">USD — $ Dollar</option>
                <option value="EUR">EUR — € Euro</option>
                <option value="GBP">GBP — £ Pound</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Timezone</label>
              <select style={S.input} value={form.timezone} onChange={e => set("timezone", e.target.value)}>
                <option value="Asia/Kolkata">Asia/Kolkata</option>
                <option value="America/Los_Angeles">America/Los_Angeles</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
            <button type="submit" disabled={saving} style={{ ...S.btnPrimary, opacity: saving ? 0.65 : 1 }}>
              {saving ? "Creating account…" : "Continue →"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 2 — Connect Gmail
// ---------------------------------------------------------------------------
const StepGmail = ({ advance }) => {
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("error");

  const handleConnect = () => {
    localStorage.setItem("mf_onboarding_step", 3);
    window.location = "/api/auth/google";
  };

  return (
    <div>
      <h2 style={S.h2}>Connect your Gmail</h2>
      <p style={S.sub}>MoneyFlow reads your inbox to extract transactions automatically. We only read emails — never send.</p>

      {oauthError && (
        <div style={S.error}>
          Gmail connection failed — please try again.
          <div style={{ fontSize: 12, marginTop: 4, color: "var(--neg)", opacity: 0.75 }}>
            Error: {oauthError}
          </div>
        </div>
      )}

      <div style={{ padding: "20px 24px", background: "var(--paper-2)", borderRadius: 8, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--card)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>G</span>
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>Gmail</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>Read-only access to your inbox for transaction parsing</div>
        </div>
      </div>

      <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 20, lineHeight: 1.6 }}>
        You'll be redirected to Google to authorize access. MoneyFlow never stores your Gmail password and access can be revoked anytime from your Google account settings.
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleConnect} style={S.btnPrimary}>
          Connect Gmail →
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 3 — AI Setup
// ---------------------------------------------------------------------------
const StepAI = ({ advance }) => {
  // If we just returned from OAuth redirect, show a banner (no error param = success)
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("error");
  const showGmailBanner = !oauthError;

  // Clean URL so banner doesn't persist
  useEffect(() => {
    if (window.location.search) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const [selected, setSelected] = useState(providerPresets[0]);
  const [apiKey, setApiKey] = useState("");
  const [customModelId, setCustomModelId] = useState("");
  const [customBaseUrl, setCustomBaseUrl] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);

  const isCustom = selected.provider === "custom";
  const modelId = isCustom ? customModelId : selected.model_id;
  const baseUrl = isCustom ? customBaseUrl : selected.base_url;

  const choosePreset = (preset) => {
    setSelected(preset);
    setError(null);
    if (preset.provider !== "custom") {
      setCustomModelId("");
      setCustomBaseUrl("");
    }
  };

  const validate = async () => {
    if (!apiKey.trim()) { setError("Please enter an API key."); return; }
    if (isCustom && !customModelId.trim()) { setError("Please enter a model ID."); return; }
    if (isCustom && !customBaseUrl.trim()) { setError("Please enter a base URL."); return; }

    setValidating(true);
    setError(null);
    try {
      await API.post("/api/account/ai-services/validate", {
        provider: selected.provider,
        api_key: apiKey.trim(),
        model_id: modelId,
        base_url: baseUrl,
      });
      // Validation succeeded — persist the service
      await API.post("/api/account/ai-services", {
        provider: selected.provider,
        display_name: selected.display_name,
        model_id: modelId,
        base_url: baseUrl,
        api_key: apiKey.trim(),
        enabled: true,
      });
      advance(4, { aiProvider: selected.display_name });
    } catch (err) {
      setError(err.message || "API key validation failed. Please check your key and try again.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div>
      {showGmailBanner && (
        <div style={S.success}>
          Gmail connected ✓
        </div>
      )}

      <h2 style={S.h2}>Set up AI</h2>
      <p style={S.sub}>MoneyFlow uses an AI model to parse your emails. Bring your own API key — you control the model and budget.</p>

      {/* Provider pills */}
      <div style={{ marginBottom: 16 }}>
        <span style={S.label}>Provider</span>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {providerPresets.map(p => (
            <button
              key={p.provider}
              onClick={() => choosePreset(p)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: "1px solid var(--line)",
                background: selected.provider === p.provider ? "var(--ink)" : "var(--paper)",
                color: selected.provider === p.provider ? "var(--paper)" : "var(--ink-2)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                fontFamily: "inherit",
                transition: "background 120ms",
              }}
            >
              {p.display_name}
            </button>
          ))}
        </div>
      </div>

      {/* Model ID */}
      <div style={S.fieldWrap}>
        <label style={S.label}>Model ID</label>
        <input
          style={{ ...S.input, ...(!isCustom ? S.inputReadonly : {}) }}
          value={modelId}
          readOnly={!isCustom}
          onChange={isCustom ? e => setCustomModelId(e.target.value) : undefined}
          placeholder={isCustom ? "e.g. meta-llama/llama-3-70b-instruct" : ""}
        />
      </div>

      {/* Base URL */}
      <div style={S.fieldWrap}>
        <label style={S.label}>Base URL</label>
        <input
          style={{ ...S.input, ...(!isCustom ? S.inputReadonly : {}) }}
          value={baseUrl}
          readOnly={!isCustom}
          onChange={isCustom ? e => setCustomBaseUrl(e.target.value) : undefined}
          placeholder={isCustom ? "https://your-endpoint/v1" : ""}
        />
      </div>

      {/* API key */}
      <div style={S.fieldWrap}>
        <label style={S.label}>API key</label>
        <input
          type="password"
          style={{ ...S.input, fontFamily: "'Geist Mono', monospace" }}
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="sk-…"
          autoComplete="off"
        />
      </div>

      {error && (
        <div style={S.error}>
          {error}
          <div style={{ marginTop: 8 }}>
            <a
              href="https://console.scaleway.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 12, color: "var(--neg)", fontWeight: 600 }}
            >
              Try Scaleway (free tier, no credit card) →
            </a>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <button onClick={validate} disabled={validating} style={{ ...S.btnPrimary, opacity: validating ? 0.65 : 1 }}>
          {validating ? "Validating…" : "Validate & Continue →"}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 4 — Live Preview
// ---------------------------------------------------------------------------
const StepPreview = ({ advance }) => {
  const [transactions, setTransactions] = useState([]);
  const [emailCount, setEmailCount] = useState(0);
  const [running, setRunning] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const [stalled, setStalled] = useState(false);
  const intervalRef = useRef(null);
  const stallRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const startSync = async () => {
      try {
        await API.post("/api/sync/trigger");
        if (!mountedRef.current) return;
        setRunning(true);
      } catch (_) {
        if (!mountedRef.current) return;
        setSyncFailed(true);
      }
    };

    const poll = async () => {
      try {
        const progress = await API.get("/api/sync/progress");
        if (!mountedRef.current) return;
        if (progress.emails_found != null) setEmailCount(progress.emails_found);
        if (!progress.running) setRunning(false);
      } catch (_) {}

      try {
        const data = await API.get("/api/transactions?offset=0&limit=20");
        if (!mountedRef.current) return;
        if (data.items) setTransactions(data.items);
      } catch (_) {}
    };

    startSync();

    intervalRef.current = setInterval(poll, 2000);

    // 30s stall watchdog
    stallRef.current = setTimeout(() => {
      if (mountedRef.current) setStalled(true);
    }, 30000);

    return () => {
      mountedRef.current = false;
      clearInterval(intervalRef.current);
      clearTimeout(stallRef.current);
    };
  }, []);

  const handleContinue = () => {
    clearInterval(intervalRef.current);
    clearTimeout(stallRef.current);
    advance(5, { txCount: transactions.length });
  };

  const handleSkip = () => {
    clearInterval(intervalRef.current);
    clearTimeout(stallRef.current);
    advance(5, { txCount: 0 });
  };

  const spinnerStyle = {
    display: "inline-block",
    width: 14,
    height: 14,
    border: "2px solid var(--line)",
    borderTopColor: "var(--accent)",
    borderRadius: "50%",
    animation: "spin 700ms linear infinite",
    flexShrink: 0,
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {running && <span style={spinnerStyle} />}
        <h2 style={{ ...S.h2, margin: 0 }}>
          {running ? `Scanning inbox… ${emailCount > 0 ? emailCount + " emails found" : ""}` : "Inbox scan complete"}
        </h2>
      </div>
      <p style={S.sub}>Here's a live preview of what MoneyFlow found in your inbox.</p>

      {syncFailed && (
        <div style={S.error}>
          Couldn't start sync — this sometimes happens if Gmail needs a moment.
          <div style={{ marginTop: 10 }}>
            <button onClick={handleSkip} style={{ ...S.btnSecondary, fontSize: 12, padding: "6px 14px" }}>Skip preview</button>
          </div>
        </div>
      )}

      {stalled && (
        <div style={{ padding: "10px 12px", background: "var(--accent-soft)", borderRadius: 6, fontSize: 13, color: "var(--ink-2)", marginBottom: 16 }}>
          Still working… sync runs in the background. You can continue now and check your inbox later.
        </div>
      )}

      {/* Transaction preview cards */}
      {transactions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 20, maxHeight: 260, overflowY: "auto" }}>
          {transactions.map((tx, i) => {
            const merchant = tx.merchant || tx.email?.sender?.replace(/\s*<.*>/, "").trim() || "Unknown";
            const amount = tx.amount != null ? tx.amount : null;
            const isIncome = tx.label === "income";
            const amountColor = isIncome ? "var(--pos)" : "var(--neg)";
            const amountStr = amount != null
              ? (isIncome ? "+" : "−") + "₹" + Math.abs(amount).toLocaleString("en-IN")
              : "";
            return (
              <div key={tx.id || i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--paper-2)", borderRadius: 6, gap: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{merchant}</div>
                {amountStr && (
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 13, fontWeight: 600, color: amountColor, flexShrink: 0 }}>{amountStr}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {transactions.length === 0 && !syncFailed && (
        <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--ink-4)", fontSize: 13, marginBottom: 20 }}>
          {running ? "Waiting for first results…" : "No transactions found yet."}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={handleContinue} style={S.btnPrimary}>
          Continue →
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Step 5 — Done
// ---------------------------------------------------------------------------
const StepDone = ({ stepData }) => {
  const txCount = stepData.txCount || 0;
  const aiProvider = stepData.aiProvider || "AI";

  const handleOpen = () => {
    localStorage.removeItem("mf_onboarding_step");
    window.location.reload();
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--pos-soft, #d1fae5)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", fontSize: 26 }}>
          ✓
        </div>
        <h2 style={{ ...S.h2, fontSize: 32, textAlign: "center" }}>You're set up.</h2>
        <p style={{ ...S.sub, textAlign: "center", marginBottom: 0 }}>MoneyFlow is ready to track your finances.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28, marginTop: 20 }}>
        <div style={{ padding: "16px", background: "var(--paper-2)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>Transactions found</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 400, color: "var(--ink)" }}>{txCount}</div>
        </div>
        <div style={{ padding: "16px", background: "var(--paper-2)", borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>AI provider</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 400, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aiProvider}</div>
        </div>
      </div>

      <button onClick={handleOpen} style={{ ...S.btnPrimary, padding: "12px 32px", fontSize: 14 }}>
        Open Moneyflow →
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// OnboardingWizard — top-level
// ---------------------------------------------------------------------------
const OnboardingWizard = () => {
  const [step, setStep] = useState(
    parseInt(localStorage.getItem("mf_onboarding_step") || "1")
  );
  const [stepData, setStepData] = useState({});

  const advance = (n, extraData = {}) => {
    localStorage.setItem("mf_onboarding_step", n);
    setStep(n);
    setStepData(prev => ({ ...prev, ...extraData }));
  };

  const renderStep = () => {
    if (step === 1) return <StepProfile advance={advance} />;
    if (step === 2) return <StepGmail advance={advance} />;
    if (step === 3) return <StepAI advance={advance} />;
    if (step === 4) return <StepPreview advance={advance} />;
    if (step === 5) return <StepDone stepData={stepData} />;
    return <StepProfile advance={advance} />;
  };

  return (
    <WizardShell step={Math.min(Math.max(step, 1), 5)}>
      {renderStep()}
    </WizardShell>
  );
};

// Expose to global scope (no module system)
Object.assign(window, { OnboardingWizard });
