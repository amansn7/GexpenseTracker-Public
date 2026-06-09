/* ── API Response Types ── */

export interface Transaction {
  id: string;
  amount: number;
  label: string;
  category: string;
  merchant: string;
  date: string;
  txn_date: string;
  tag: string;
  note: string;
  flag: boolean;
  read: boolean;
  provider: string;
  sender: string;
  subject: string;
  original_csv?: string;
  fit_id?: string;
  created_at: string;
}

export interface TransactionGroup {
  date: string;
  dayTotal: number;
  items: Transaction[];
}

export interface StatsResponse {
  total_income: number;
  total_expense: number;
  balance: number;
  net_worth: number;
  income: number;
  expense: number;
  savings_rate: number;
  monthly: Record<string, { income: number; expense: number; balance: number }>;
  category_breakdown: Record<string, number>;
  daily_balance: Array<{ date: string; balance: number }>;
  projected_balance: number;
  projected_savings: number;
  income_trend: string;
  expense_trend: string;
  savings_trend: string;
  month_income: number;
  month_expense: number;
  current_savings_rate: number;
}

export interface Budget {
  id: string;
  category: string;
  amount: number;
  spent: number;
  period: string;
  month: string;
  created_at: string;
}

export interface Goal {
  id: string;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string;
  category: string;
  monthly_contribution: number;
  notes: string;
  created_at: string;
}

export interface Debt {
  id: string;
  name: string;
  total_amount: number;
  remaining_amount: number;
  interest_rate: number;
  min_payment: number;
  target_date: string;
  category: string;
  notes: string;
  created_at: string;
}

export interface Recurring {
  id: string;
  label: string;
  amount: number;
  category: string;
  frequency: string;
  next_date: string;
  merchant: string;
  active: boolean;
  created_at: string;
}

export interface SyncStatus {
  state: string;
  phase: string;
  progress: number;
  total: number;
  tally: { expense: number; income: number; ignore: number };
  previews: Array<{
    subject: string;
    sender: string;
    amount: number;
    tag: string;
  }>;
  email_filter?: string;
  sync_interval_hours?: number;
  next_sync_at?: string;
  last_synced_at?: string;
}

export interface UserSettings {
  theme: string;
  currency: string;
  locale: string;
  salary_shift_enabled: boolean;
  salary_shift_window: number;
  ai_provider: string;
  ai_api_key: string;
  sound_effects?: boolean;
  daily_digest?: boolean;
  low_confidence_alerts?: boolean;
  auto_categorize?: boolean;
  show_confidence?: boolean;
  confidence_threshold?: number;
  use_rule_engine?: boolean;
  active_ai_service_id?: string | null;
  starting_balance?: number | null;
  starting_balance_date?: string | null;
  monthly_ai_budget?: number | null;
}

export interface ApiError {
  detail: string;
  code?: string;
}

/* ── API Response wrapper ── */
export interface ApiResponse<T> {
  data: T;
  error?: string;
}

/* ── View types shared across components ── */
export type ViewName =
  | "inbox" | "search" | "review"
  | "flow" | "picture"
  | "dashboard" | "today"
  | "health"
  | "reports"
  | "recurring"
  | "debt"
  | "goals"
  | "budgets"
  | "profile" | "settings"
  | "admin"
  | "onboarding";

export type FilterCategory =
  | "expenses" | "income" | "sub" | "flagged" | "payments"
  | `cat:${string}`;

export type PeriodPreset =
  | "1w" | "1m" | "3m" | "6m" | "1y" | "all" | "custom";

export type SortOption = "date" | "amount" | "category" | "merchant";

/* ── Paginated response ── */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  next_cursor: string | null;
}

/* ── Auth / Account ── */
export interface AuthMeResponse {
  has_seed_data: boolean;
  onboarding_complete: boolean;
  name?: string;
  email?: string;
  connected_accounts?: ConnectedAccount[];
  trial_ends_at?: string | null;
}

export interface Profile {
  full_name?: string;
  display_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  default_currency?: string;
  timezone?: string;
  avatar_url?: string | null;
}

export interface User {
  id: string;
  email: string;
  role: string;
  created_at: string;
  passkeys_enabled?: boolean;
  totp_enabled?: boolean;
  trial_ends_at?: string | null;
}

export interface UserCategory {
  id: string;
  name: string;
  color: string;
  active?: boolean;
}

export interface ConnectedAccount {
  id: string;
  provider: string;
  account_email: string;
  status: string;
  last_synced_at?: string | null;
}

export interface AIService {
  id: string;
  provider: string;
  display_name: string;
  model_id: string;
  base_url?: string;
  auth_header?: string;
  api_key_hint?: string;
  enabled: boolean;
}

export interface AccountBundle {
  user?: User;
  profile?: Profile;
  settings: UserSettings;
  categories: UserCategory[];
  connected_accounts: ConnectedAccount[];
  ai_services: AIService[];
  email: string;
  role: string;
  name?: string;
  avatar_url?: string | null;
  created_at?: string;
  trial_ends_at?: string | null;
  scheduled_deletion_at?: string | null;
}

/* ── LLM Budget ── */
export interface UserLLMBudget {
  exceeded: boolean;
  tier: string;
  daily_budget_cents: number;
  spent_cents: number;
  upgrade_url: string | null;
}

/* ── Email / Review ── */
export interface ReviewEmail {
  id: string;
  sender: string;
  sender_domain: string;
  subject: string;
  body_snippet?: string;
  received_at: string;
  amount?: number | null;
}

export interface ReviewCountResponse {
  count: number;
}

/* ── Sync progress (moved from contexts.ts) ── */
export interface SyncProgress {
  running: boolean;
  phase: string;
  error?: string;
  current?: number;
  total?: number;
  current_email?: { subject: string; amount?: number };
  tally?: { expense?: number; income?: number; ignore?: number; review?: number };
  phase_detail?: string;
  log?: Array<{ time: string; type: string; message: string }>;
}

export interface ExportJobStatus {
  id: string;
  status: string;
  error?: string;
}

/* ── Categories ── */
export interface CanonicalCategoryMapResponse {
  map: Record<string, string>;
}

/* ── Stats sections (from ?sections=... parameter) ── */
export interface HealthData {
  current_balance: number;
  savings_rate: number;
  runway_months: number;
  starting_balance?: number;
  starting_balance_date?: string;
  balance_mode?: string;
  total_cc_payments?: number;
  total_investments?: number;
  monthly_net?: Array<{
    month: string;
    net: number;
    income: number;
    expenses: number;
  }>;
}

export interface StatsSectionsResponse {
  summary?: {
    total_income: number;
    total_expenses: number;
    total_cc_payments?: number;
    total_investments?: number;
    saved?: number;
    needs_review_count?: number;
  };
  health?: HealthData;
  categoryBreakdown?: {
    categories: Array<{
      category: string;
      amount: number;
      txn_count?: number;
    }>;
  };
  topMerchants?: {
    merchants: Array<{
      merchant: string;
      amount: number;
    }>;
  };
  budgets?: {
    budgets: Array<{
      id: string;
      category: string;
      spent_this_month: number;
      monthly_limit: number;
      over_budget: boolean;
      pct: number;
    }>;
  };
  confidence?: {
    total: number;
    auto_confirmed: number;
    correction_rate: number;
  };
  previousPeriod?: {
    summary?: {
      total_expenses?: number;
      total_income?: number;
      needs_review_count?: number;
    };
  };
}

/* ── Insights compare (Phase F3) ── */
export interface Insight {
  type: string;
  category: string;
  title: string;
  description: string;
}

export interface InsightsCompareResponse {
  insights: Insight[];
  weekly_summary: string | null;
  savings_suggestion: string | null;
}
