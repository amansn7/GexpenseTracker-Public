// @ts-nocheck
// account-admin-settings.tsx — Admin/advanced settings for SettingsView

const TrialInfoBanner = () => {
  const [trial, setTrial] = React.useState(null);
  React.useEffect(() => {
    API.get("/api/account/settings/llm-trial").then(setTrial).catch(() => {});
  }, []);
  if (!trial || trial.trial_started_at === null) return null;
  const daysLeft = trial.days_remaining;
  const active = trial.in_trial;
  return (
    <div style={{
      padding: "12px 16px",
      borderRadius: 8,
      marginBottom: 16,
      fontSize: "0.8125rem",
      lineHeight: 1.5,
      background: active ? (daysLeft <= 2 ? "var(--accent-soft)" : "var(--pos-soft)") : "var(--paper-2)",
      color: active ? (daysLeft <= 2 ? "var(--accent)" : "var(--pos)") : "var(--ink-3)",
      border: `1px solid ${active ? (daysLeft <= 2 ? "var(--accent)" : "var(--pos)") : "var(--line)"}`,
    }}>
      {active ? (
        <span>
          <strong>Free LLM Trial</strong> — {daysLeft > 0
            ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`
            : "Last day!"}
          . Add your own LLM API key below to continue after the trial ends.
        </span>
      ) : (
        <span>
          <strong>Trial ended</strong> — configure an LLM provider below for AI-powered classification,
          or continue with rule-only mode.
        </span>
      )}
    </div>
  );
};

(window as any).TrialInfoBanner = TrialInfoBanner;
