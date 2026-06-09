// @ts-nocheck
// Onboarding wizard — 5-step setup flow for MoneyFlow
// No module system: raw JSX loaded via Babel in browser.
// React / ReactDOM are global. API global from data.jsx.

const { useState, useEffect, useRef, useCallback } = React;

// ---------------------------------------------------------------------------
// DottedSurface — animated gradient background (CSS-only)
// ---------------------------------------------------------------------------
const DottedSurface = () => {
  return <div style={{ position: "fixed", inset: 0, zIndex: 999, pointerEvents: "none", background: "radial-gradient(ellipse 80% 60% at 50% -20%,var(--accent-soft) 0%,transparent 60%),radial-gradient(ellipse 60% 50% at 80% 80%,var(--accent-soft) 0%,transparent 50%),radial-gradient(ellipse 50% 40% at 20% 60%,var(--accent-soft) 0%,transparent 50%)", backgroundSize: "200% 200%", animation: "bgShift 20s ease-in-out infinite" }} />;
};

// ---------------------------------------------------------------------------
// ThemeToggle — sun↔moon morph with spring-like CSS + tick sound
// ---------------------------------------------------------------------------
let _atCtx = null, _atBuf = null;
function _atTick(ref) {
  const now = performance.now();
  if (now - (ref.current || 0) < 80) return;
  ref.current = now;
  try {
    if (!_atCtx) _atCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_atCtx.state === "suspended") _atCtx.resume();
    const ac = _atCtx;
    if (!_atBuf || _atBuf.sampleRate !== ac.sampleRate) {
      const rate = ac.sampleRate, len = Math.floor(rate * 0.006);
      const buf = ac.createBuffer(1, len, rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        ch[i] = (Math.sin(2 * Math.PI * 3400 * t) * 0.6 + (Math.random() * 2 - 1) * 0.4) * Math.pow(1 - t, 3);
      }
      _atBuf = buf;
    }
    const src = ac.createBufferSource();
    const gain = ac.createGain();
    src.buffer = _atBuf;
    gain.gain.value = 0.08;
    src.connect(gain);
    gain.connect(ac.destination);
    src.start();
  } catch {}
}

const ThemeToggle = () => {
  const id = React.useId();
  const maskId = `atm${id.replace(/:/g, "")}`;
  const lastSnd = useRef(0);
  const [dark, setDark] = useState(() => document.documentElement.getAttribute("data-theme") === "midnight");
  const [hover, setHover] = useState(false);
  const [pressing, setPressing] = useState(false);

  const toggle = useCallback(() => {
    window.hapticLight?.();
    const html = document.documentElement;
    const next = html.getAttribute("data-theme") === "midnight" ? "paper" : "midnight";
    html.setAttribute("data-theme", next);
    localStorage.setItem("mf_theme", next);
    setDark(next === "midnight");
    _atTick(lastSnd);
  }, []);

  const spring = "all 400ms cubic-bezier(.34,1.56,.64,1)";
  const scale = pressing ? 0.86 : hover ? 1.1 : 1;

  return (
    <button onClick={toggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setPressing(false); }}
      onMouseDown={() => setPressing(true)}
      onMouseUp={() => setPressing(true)}
      style={{ position: "fixed", bottom: 20, right: 20, zIndex: 1001, background: "var(--card)", border: "1px solid var(--line)", borderRadius: 999, width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "var(--ink-2)", padding: 0, boxShadow: "0 2px 8px var(--shadow-sm)", transform: `scale(${scale})`, transition: spring, WebkitTapHighlightColor: "transparent" }}
      aria-label="Toggle theme">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ overflow: "visible" }}>
        <mask id={maskId}>
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <circle cx={dark ? 17 : 33} cy={dark ? 8 : 0} r="9" fill="black" style={{ transition: spring, transformOrigin: "12px 12px" }} />
        </mask>
        <circle cx="12" cy="12" fill="currentColor" stroke="none" mask={`url(#${maskId})`} r={dark ? 9 : 5} style={{ transition: spring }} />
        <g style={{ opacity: dark ? 0 : 1, transform: `scale(${dark ? 0 : 1}) rotate(${dark ? -30 : 0}deg)`, transformOrigin: "12px 12px", transition: spring }}>
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="5.64" y1="5.64" x2="4.22" y2="4.22" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          <line x1="5.64" y1="18.36" x2="4.22" y2="19.78" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        </g>
      </svg>
    </button>
  );
};

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const S = {
  label: { fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, marginBottom: 5, display: "block" },
  input: { width: "100%", padding: "8px 10px", border: "1px solid var(--line)", borderRadius: 6, background: "var(--card)", color: "var(--ink)", fontSize: "0.8125rem", fontFamily: "inherit", outline: "none", boxSizing: "border-box" },
  btnPrimary: { padding: "10px 20px", background: "var(--ink)", color: "var(--paper)", border: "1px solid var(--ink)", borderRadius: 6, fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit", transition: "background 120ms ease" },
  btnSecondary: { padding: "10px 20px", background: "transparent", color: "var(--ink-3)", border: "1px solid var(--line)", borderRadius: 6, fontSize: "0.8125rem", cursor: "pointer", fontFamily: "inherit", transition: "background 120ms ease" },
  error: { padding: "10px 12px", background: "var(--neg-soft)", color: "var(--neg)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 16 },
  success: { padding: "10px 12px", background: "var(--pos-soft)", color: "var(--pos)", borderRadius: 6, fontSize: "0.8125rem", marginBottom: 16 },
  fieldWrap: { marginBottom: 14 },
  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  h2: { fontFamily: "'Geist', sans-serif", fontSize: "1.625rem", fontWeight: 400, letterSpacing: "-0.02em", margin: "0 0 6px", color: "var(--ink)" },
  sub: { fontSize: "0.8125rem", color: "var(--ink-3)", marginBottom: 24, lineHeight: 1.5 },
};

// ---------------------------------------------------------------------------
// WizardShell — full-viewport centered card with progress bar
// ---------------------------------------------------------------------------
const WizardShell = ({ step, children, totalSteps }) => {
  const pct = (step / (totalSteps || 5)) * 100;
  return (
    <>
    <DottedSurface />
    <ThemeToggle />
    <div style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
      <div style={{ maxWidth: 480, width: "90%", display: "flex", flexDirection: "column", gap: 0 }}>
        {/* Progress bar — sits above card */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span style={{ fontSize: "0.6875rem", color: "var(--ink-3)", fontFamily: "'Geist Mono', monospace", letterSpacing: "0.05em" }}>Step {step} of 5</span>
            <span style={{ fontSize: "0.6875rem", color: "var(--ink-4)", fontFamily: "'Geist Mono', monospace" }}>{Math.round(pct)}%</span>
          </div>
          <div style={{ height: 3, background: "var(--line)", borderRadius: 99, overflow: "hidden" }}>
            <div className="progress-fill" style={{ height: "100%", width: "100%", background: "var(--accent)", borderRadius: 99, transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>

        {/* Card */}
        <div style={{ background: "var(--card)", border: "1px solid var(--line)", borderRadius: 12, padding: "clamp(20px, 5vw, 40px)" }}>
          {children}
        </div>
      </div>
    </div>
    </>
  );
};

// ---------------------------------------------------------------------------
// Step 1 — Profile
// ---------------------------------------------------------------------------
const StepProfile = ({ advance, accountData }) => {
  const [form, setForm] = useState({ full_name: accountData?.name || "", email: accountData?.email || "", display_name: "", default_currency: "INR", timezone: "Asia/Kolkata" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [alreadySetUp, setAlreadySetUp] = useState(false);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const submit = async (e) => {
    e.preventDefault();
    if (accountData) {
      // User already exists from OAuth — just advance
      advance(2, { email: form.email });
      return;
    }
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
            <button onClick={() => setError(null)} style={{ ...S.btnSecondary, fontSize: "0.75rem", padding: "6px 12px" }}>Dismiss</button>
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
const StepGmail = ({ advance, accountData }) => {
  const params = new URLSearchParams(window.location.search);
  const oauthError = params.get("error");
  const isLocal = window.__mfLocalMode;
  const gmailConnected = accountData?.connected_accounts?.some(
    a => a.provider === "gmail" && a.status === "connected"
  );

  const handleConnect = () => {
    if (!accountData) return;
    localStorage.setItem("mf_onboarding_step", 3);
    window.location = "/api/auth/google";
  };

  const handleSkipGmail = async () => {
    try {
      await API.post("/api/account/onboarding/skip-gmail", {});
    } catch (_) {}
    localStorage.setItem("mf_onboarding_step", 3);
    advance(3, { gmailSkipped: true });
  };

  if (!accountData) {
    return (
      <div>
        <h2 style={S.h2}>{isLocal ? "Get started" : "Connect your Gmail"}</h2>
        <p style={S.sub}>Unable to load account data. Please try logging in again.</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => { window.location.href = "/login"; }} style={S.btnPrimary}>
            Back to login →
          </button>
        </div>
      </div>
    );
  }

  if (gmailConnected) {
    return (
      <div>
        <div style={S.success}>Gmail connected <Icon name="check" size={12} stroke="var(--pos)"/></div>
        <h2 style={S.h2}>Gmail connected</h2>
        <p style={S.sub}>Your {accountData.email} account is already connected and ready to sync.</p>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => advance(3)} style={S.btnPrimary}>Continue →</button>
        </div>
      </div>
    );
  }

  if (isLocal) {
    return (
      <div>
        <h2 style={S.h2}>Welcome to MoneyFlow</h2>
        <p style={S.sub}>You're running in local mode — no external accounts needed. Your data stays on this device.</p>

        <div style={{ padding: "20px 24px", background: "var(--paper-2)", borderRadius: 8, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--card)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
          <div>
            <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink)" }}>Local mode</div>
            <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: 2 }}>Add transactions manually or import a CSV file</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={handleSkipGmail} style={S.btnPrimary}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={S.h2}>Connect your Gmail</h2>
      <p style={S.sub}>MoneyFlow reads your inbox to extract transactions automatically. We only read emails — never send.</p>

      {oauthError && (
        <div style={S.error}>
          Gmail connection failed — please try again.
          <div style={{ fontSize: "0.75rem", marginTop: 4, color: "var(--neg)", opacity: 0.75 }}>
            Error: {oauthError}
          </div>
        </div>
      )}

      <div style={{ padding: "20px 24px", background: "var(--paper-2)", borderRadius: 8, marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "var(--card)", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.75rem", fontWeight: 700, color: "var(--accent)" }}>G</span>
        </div>
        <div>
          <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--ink)" }}>Gmail</div>
          <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", marginTop: 2 }}>Read-only access to your inbox for transaction parsing</div>
        </div>
      </div>

      <div style={{ fontSize: "0.75rem", color: "var(--ink-4)", marginBottom: 20, lineHeight: 1.6 }}>
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
const StepAI = ({ advance, accountData }) => {
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

  const trialEndsAt = accountData?.trial_ends_at;
  const trialDaysLeft = trialEndsAt ? Math.max(0, Math.ceil((new Date(trialEndsAt) - Date.now()) / 86400000)) : 0;
  const inTrial = trialDaysLeft > 0;

  const [displayName, setDisplayName] = useState("");
  const [modelId, setModelId] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const [showSkip, setShowSkip] = useState(false);

  const validate = async () => {
    if (!displayName.trim()) { setError("Please enter a display name."); return; }
    if (!modelId.trim()) { setError("Please enter a model ID."); return; }
    if (!baseUrl.trim()) { setError("Please enter a base URL."); return; }
    if (!apiKey.trim()) { setError("Please enter an API key."); return; }

    setValidating(true);
    setError(null);
    setShowSkip(false);
    try {
      const result = await API.post("/api/account/ai-services/validate", {
        provider: "custom",
        api_key: apiKey.trim(),
        model_id: modelId.trim(),
        base_url: baseUrl.trim(),
      });
      if (!result.ok) {
        setError(result.error || "Validation failed");
        setShowSkip(true);
        setValidating(false);
        return;
      }
      await API.post("/api/account/ai-services", {
        provider: "custom",
        display_name: displayName.trim(),
        model_id: modelId.trim(),
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        enabled: true,
      });
      advance(4, { aiProvider: displayName });
    } catch (err) {
      setError(err.message || "Validation failed. Please check your details.");
      setShowSkip(true);
    } finally {
      setValidating(false);
    }
  };

  const skipAI = () => {
    advance(4, { aiProvider: null });
  };

  return (
    <div>
      {showGmailBanner && <div style={S.success}>Gmail connected <Icon name="check" size={12} stroke="var(--pos)"/></div>}

      <h2 style={S.h2}>Set up AI</h2>
      <p style={S.sub}>MoneyFlow uses AI to parse your emails into transactions.</p>

      {/* Trial banner */}
      {inTrial && (
        <div style={{ padding: "14px 16px", borderRadius: 8, marginBottom: 20, background: "var(--accent-soft)", border: "1px solid var(--accent)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>
            Free trial active — {trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} remaining
          </div>
          <div style={{ color: "var(--ink-3)" }}>
            AI parsing is included free for 7 days. No credit card needed. Add your own API key below to continue after the trial ends.
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={skipAI} style={{ padding: "8px 16px", background: "var(--accent)", color: "var(--on-accent)", border: "none", borderRadius: 6, fontSize: "0.75rem", fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              Use free trial →
            </button>
          </div>
        </div>
      )}

      {/* BYOK form */}
      <div style={{ fontSize: "0.6875rem", color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, marginBottom: 12, textAlign: "center", position: "relative" }}>
        <span style={{ background: "var(--card)", padding: "0 8px", position: "relative", zIndex: 1 }}>or bring your own API key</span>
        <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px solid var(--line)", zIndex: 0 }} />
      </div>

      <div style={S.fieldWrap}>
        <label style={S.label}>Display name</label>
        <input style={S.input} value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="e.g. My OpenAI"/>
      </div>

      <div style={S.fieldWrap}>
        <label style={S.label}>Model ID</label>
        <input style={S.input} value={modelId} onChange={e => setModelId(e.target.value)} placeholder="gpt-4o-mini"/>
      </div>

      <div style={S.fieldWrap}>
        <label style={S.label}>Base URL</label>
        <input style={S.input} value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://api.openai.com/v1"/>
      </div>

      <div style={S.fieldWrap}>
        <label style={S.label}>API key</label>
        <input type="password" style={{ ...S.input, fontFamily: "'Geist Mono', monospace" }} value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-…" autoComplete="off"/>
      </div>

      {error && (
        <div style={{ marginBottom: 16 }}>
          <div style={S.error}>{error}</div>
          {showSkip && (
            <div style={{ fontSize: "0.75rem", color: "var(--ink-3)", lineHeight: 1.5 }}>
              You can skip AI setup and configure it later in Settings.
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
        <button onClick={skipAI} style={S.btnSecondary}>
          Skip AI Setup
        </button>
        <button onClick={validate} disabled={validating} style={{ ...S.btnPrimary, opacity: validating ? 0.65 : 1 }}>
          {validating ? "Validating…" : "Validate & Continue →"}
        </button>
      </div>

      {/* FreeLLMAPI self-host link */}
      <div style={{ marginTop: 24 }}>
        <div style={{ fontSize: "0.6875rem", color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 500, marginBottom: 12, textAlign: "center", position: "relative" }}>
          <span style={{ background: "var(--card)", padding: "0 8px", position: "relative", zIndex: 1 }}>or self-host FreeLLMAPI</span>
          <div style={{ position: "absolute", top: "50%", left: 0, right: 0, borderTop: "1px solid var(--line)", zIndex: 0 }} />
        </div>
        <div style={{ padding: "14px 16px", borderRadius: 8, background: "var(--paper-2)", border: "1px solid var(--line)", fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--ink-3)" }}>
          Run your own free LLM proxy locally. Aggregate free tiers from 11+ providers behind one OpenAI-compatible endpoint.
          <div style={{ marginTop: 8 }}>
            <a href="https://github.com/tashfeenahmed/freellmapi" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", fontWeight: 500, textDecoration: "none" }}>
              github.com/tashfeenahmed/freellmapi →
            </a>
          </div>
        </div>
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

  if (window.__mfLocalMode) {
    return (
      <div>
        <h2 style={S.h2}>Ready to go</h2>
        <p style={S.sub}>MoneyFlow is set up in local mode. Add your first transaction to get started.</p>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20, marginTop: 8 }}>
          <div style={{ padding: "16px", background: "var(--paper-2)", borderRadius: 8, textAlign: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ margin: "0 auto 8px", display: "block" }}>
              <path d="M12 5v14"/><path d="M5 12h14"/>
            </svg>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Add manually</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>One transaction at a time</div>
          </div>
          <div style={{ padding: "16px", background: "var(--paper-2)", borderRadius: 8, textAlign: "center" }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{ margin: "0 auto 8px", display: "block" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink)", marginBottom: 4 }}>Import CSV</div>
            <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)" }}>Batch import from your bank</div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => advance(5, { txCount: 0 })} style={S.btnPrimary}>
            Continue →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {running && <span className="spinner" />}
        <h2 style={{ ...S.h2, margin: 0 }}>
          {running ? `Scanning inbox… ${emailCount > 0 ? emailCount + " emails found" : ""}` : "Inbox scan complete"}
        </h2>
      </div>
      <p style={S.sub}>Here's a live preview of what MoneyFlow found in your inbox.</p>

      {syncFailed && (
        <div style={S.error}>
          Couldn't start sync — this sometimes happens if Gmail needs a moment.
          <div style={{ marginTop: 10 }}>
            <button onClick={handleSkip} style={{ ...S.btnSecondary, fontSize: "0.75rem", padding: "6px 14px" }}>Skip preview</button>
          </div>
        </div>
      )}

      {stalled && (
        <div style={{ padding: "10px 12px", background: "var(--accent-soft)", borderRadius: 6, fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 16 }}>
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
                <div style={{ fontSize: "0.8125rem", fontWeight: 500, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{merchant}</div>
                {amountStr && (
                  <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "0.8125rem", fontWeight: 600, color: amountColor, flexShrink: 0 }}>{amountStr}</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {transactions.length === 0 && !syncFailed && (
        <div style={{ padding: "20px 14px", textAlign: "center", color: "var(--ink-4)", fontSize: "0.8125rem", marginBottom: 20 }}>
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
  const [pkDone, setPkDone] = React.useState(false);
  const [pkBusy, setPkBusy] = React.useState(false);

  const supportsPasskey = typeof window.PublicKeyCredential !== "undefined";

  const handleSetupPasskey = async () => {
    setPkBusy(true);
    const result = await registerPasskey("");
    if (result.ok) setPkDone(true);
    setPkBusy(false);
  };

  const handleOpen = async () => {
    localStorage.removeItem("mf_onboarding_step");
    try {
      await API.patch("/api/account/onboarding/complete", {});
    } catch (_) {}
    window.location.reload();
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ width: 56, height: 56, borderRadius: 999, background: "var(--pos-soft)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Icon name="check" size={26} stroke="var(--pos)"/>
        </div>
        <h2 style={{ ...S.h2, fontSize: "2rem", textAlign: "center" }}>You're set up.</h2>
        <p style={{ ...S.sub, textAlign: "center", marginBottom: 0 }}>MoneyFlow is ready to track your finances.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 28, marginTop: 20 }}>
        <div style={{ padding: "16px", background: "var(--paper-2)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>Transactions found</div>
          <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: "1.75rem", fontWeight: 400, color: "var(--ink)" }}>{txCount}</div>
        </div>
        <div style={{ padding: "16px", background: "var(--paper-2)", borderRadius: 8 }}>
          <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 500, marginBottom: 6 }}>AI provider</div>
          <div style={{ fontFamily: "'Geist', sans-serif", fontSize: "1.25rem", fontWeight: 400, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{aiProvider}</div>
        </div>
      </div>

      {supportsPasskey && !pkDone && (
        <div style={{ marginBottom: 20, padding: "16px", background: "var(--paper-2)", borderRadius: 8, textAlign: "center" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginBottom: 6 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a6 6 0 0 0-6 6v4a6 6 0 0 0 6 6 6 6 0 0 0 6-6V8a6 6 0 0 0-6-6z"/><path d="M12 12a2 2 0 0 0-2 2v2a2 2 0 0 0 4 0v-2a2 2 0 0 0-2-2z"/><path d="M6 8a6 6 0 0 1 12 0"/></svg>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--ink-2)" }}>Optional: Secure with passkey</div>
          </div>
          <div style={{ fontSize: "0.6875rem", color: "var(--ink-3)", marginBottom: 12, lineHeight: 1.4 }}>
            Sign in with Touch ID, Face ID, or a security key — no passwords needed.
          </div>
          <button onClick={handleSetupPasskey} disabled={pkBusy}
            style={{
              padding: "7px 18px", borderRadius: 6, border: "1px solid var(--line)",
              background: "var(--card)", color: "var(--ink)", fontSize: "0.75rem", cursor: pkBusy ? "default" : "pointer", fontFamily: "inherit",
            }}
          >
            {pkBusy ? "Setting up…" : "Set up passkey"}
          </button>
        </div>
      )}

      {pkDone && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: "var(--pos-soft)", borderRadius: 8, textAlign: "center", fontSize: "0.75rem", color: "var(--pos)" }}>
          <Icon name="check" size={12} stroke="var(--pos)"/> Passkey enabled — next time you'll sign in with biometrics
        </div>
      )}

      <button onClick={handleOpen} style={{ ...S.btnPrimary, padding: "12px 32px", fontSize: "0.875rem" }}>
        Open Moneyflow →
      </button>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PasskeyChallenge — shown after OAuth when passkey verification is needed
// ---------------------------------------------------------------------------
const PasskeyChallenge = () => {
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  const handleUsePasskey = async () => {
    setVerifying(true);
    setError(null);
    const result = await assertPasskey();
    if (result.ok) {
      window.location.reload();
    } else {
      setError(result.error);
    }
    setVerifying(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--paper)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16, padding: 24,
    }}>
      <div style={{
        fontFamily: "'Instrument Serif', serif", fontSize: "2rem", fontStyle: "italic",
        color: "var(--ink)", marginBottom: 8,
      }}>
        MoneyFlow
      </div>
      <div style={{
        fontSize: "0.9375rem", fontWeight: 500, color: "var(--ink)",
        marginBottom: 4,
      }}>
        Verify your identity
      </div>
      <div style={{
        fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 16,
        textAlign: "center", maxWidth: 300,
      }}>
        Use your passkey (Touch ID, Face ID, or security key) to continue.
      </div>
      {error && (
        <div style={{
          fontSize: "0.75rem", color: "var(--neg)", marginBottom: 8,
          textAlign: "center",
        }}>
          {error}
        </div>
      )}
      <button
        onClick={handleUsePasskey}
        disabled={verifying}
        style={{
          padding: "10px 28px",
          background: verifying ? "var(--ink-3)" : "var(--ink)",
          color: "var(--paper)",
          border: "none", borderRadius: 8,
          fontSize: "0.875rem", fontWeight: 500,
          cursor: verifying ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {verifying ? "Verifying…" : "Use passkey"}
      </button>
    </div>
  );
};


// ---------------------------------------------------------------------------
// OnboardingWizard — top-level
// ---------------------------------------------------------------------------
const OnboardingWizard = ({ accountData }) => {
  const isLocal = window.__mfLocalMode;
  const totalSteps = 5;
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
    const props = { advance, accountData };
    if (step === 1) return <StepProfile {...props} />;
    if (step === 2) return <StepGmail {...props} />;
    if (step === 3) return <StepAI {...props} />;
    if (step === 4) return <StepPreview advance={advance} />;
    if (step === 5) return <StepDone stepData={stepData} />;
    return <StepProfile {...props} />;
  };

  return (
    <WizardShell step={Math.min(Math.max(step, 1), totalSteps)} totalSteps={totalSteps}>
      {renderStep()}
    </WizardShell>
  );
};

// ---------------------------------------------------------------------------
// TotpChallenge — shown after OAuth when TOTP verification is needed
// ---------------------------------------------------------------------------
const TotpChallenge = () => {
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(null);

  const handleVerify = async () => {
    if (code.length !== 6) return;
    setVerifying(true);
    setError(null);
    const result = await verifyTOTP(code);
    if (result.ok) {
      window.location.reload();
    } else {
      setError(result.error || "Verification failed.");
    }
    setVerifying(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--paper)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16, padding: 24,
    }}>
      <div style={{
        fontFamily: "'Instrument Serif', serif", fontSize: "2rem", fontStyle: "italic",
        color: "var(--ink)", marginBottom: 8,
      }}>
        MoneyFlow
      </div>
      <div style={{
        fontSize: "0.9375rem", fontWeight: 500, color: "var(--ink)",
        marginBottom: 4,
      }}>
        Two-factor authentication
      </div>
      <div style={{
        fontSize: "0.8125rem", color: "var(--ink-2)", marginBottom: 16,
        textAlign: "center", maxWidth: 300,
      }}>
        Enter the 6-digit code from your authenticator app.
      </div>
      {error && (
        <div style={{
          fontSize: "0.75rem", color: "var(--neg)", marginBottom: 8,
          textAlign: "center",
        }}>
          {error}
        </div>
      )}
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
        onKeyDown={e => { if (e.key === "Enter") handleVerify(); }}
        placeholder="000000"
        style={{
          width: 180, padding: "12px 16px",
          fontSize: "1.5rem", fontWeight: 600, fontFamily: "'Geist Mono', monospace",
          textAlign: "center", letterSpacing: 8,
          background: "var(--paper-2)", color: "var(--ink)",
          border: "1px solid var(--line)", borderRadius: 8,
          outline: "none",
        }}
        autoFocus
      />
      <button
        onClick={handleVerify}
        disabled={verifying || code.length !== 6}
        style={{
          padding: "10px 28px",
          background: verifying || code.length !== 6 ? "var(--ink-3)" : "var(--ink)",
          color: "var(--paper)",
          border: "none", borderRadius: 8,
          fontSize: "0.875rem", fontWeight: 500,
          cursor: (verifying || code.length !== 6) ? "default" : "pointer",
          fontFamily: "inherit",
        }}
      >
        {verifying ? "Verifying…" : "Verify"}
      </button>
    </div>
  );
};

// Expose to global scope (no module system)
Object.assign((window as any), { OnboardingWizard, PasskeyChallenge, TotpChallenge });
