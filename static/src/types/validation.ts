/* ── Runtime API response validation schemas (zod) ── */

const TransactionSchema = z.object({
  id: z.string(),
  amount: z.number(),
  label: z.string(),
  category: z.string(),
  merchant: z.string(),
  date: z.string(),
  txn_date: z.string(),
  tag: z.string(),
  note: z.string(),
  flag: z.boolean(),
  read: z.boolean(),
  provider: z.string(),
  sender: z.string(),
  subject: z.string(),
  original_csv: z.string().optional(),
  fit_id: z.string().optional(),
  created_at: z.string(),
});
type Transaction = z.infer<typeof TransactionSchema>;

const StatsResponseSchema = z.object({
  total_income: z.number(),
  total_expense: z.number(),
  balance: z.number(),
  net_worth: z.number(),
  income: z.number(),
  expense: z.number(),
  savings_rate: z.number(),
  monthly: z.record(z.string(), z.object({
    income: z.number(),
    expense: z.number(),
    balance: z.number(),
  })),
  category_breakdown: z.record(z.string(), z.number()),
  daily_balance: z.array(z.object({
    date: z.string(),
    balance: z.number(),
  })),
  projected_balance: z.number(),
  projected_savings: z.number(),
  income_trend: z.string(),
  expense_trend: z.string(),
  savings_trend: z.string(),
  month_income: z.number(),
  month_expense: z.number(),
  current_savings_rate: z.number(),
});
type StatsResponse = z.infer<typeof StatsResponseSchema>;

const BudgetSchema = z.object({
  id: z.string(),
  category: z.string(),
  amount: z.number(),
  spent: z.number(),
  period: z.string(),
  month: z.string(),
  created_at: z.string(),
});
type Budget = z.infer<typeof BudgetSchema>;

const GoalSchema = z.object({
  id: z.string(),
  name: z.string(),
  target_amount: z.number(),
  current_amount: z.number(),
  target_date: z.string(),
  category: z.string(),
  monthly_contribution: z.number(),
  notes: z.string(),
  created_at: z.string(),
});
type Goal = z.infer<typeof GoalSchema>;

const DebtSchema = z.object({
  id: z.string(),
  name: z.string(),
  total_amount: z.number(),
  remaining_amount: z.number(),
  interest_rate: z.number(),
  min_payment: z.number(),
  target_date: z.string(),
  category: z.string(),
  notes: z.string(),
  created_at: z.string(),
});
type Debt = z.infer<typeof DebtSchema>;

const RecurringSchema = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number(),
  category: z.string(),
  frequency: z.string(),
  next_date: z.string(),
  merchant: z.string(),
  active: z.boolean(),
  created_at: z.string(),
});
type Recurring = z.infer<typeof RecurringSchema>;

const SyncStatusSchema = z.object({
  state: z.string(),
  phase: z.string(),
  progress: z.number(),
  total: z.number(),
  tally: z.object({
    expense: z.number(),
    income: z.number(),
    ignore: z.number(),
  }),
  previews: z.array(z.object({
    subject: z.string(),
    sender: z.string(),
    amount: z.number(),
    tag: z.string(),
  })),
});
type SyncStatus = z.infer<typeof SyncStatusSchema>;

const UserLLMBudgetSchema = z.object({
  daily_budget_cents: z.number().nullable(),
  spent_cents: z.number(),
  remaining_cents: z.number().nullable(),
  tier: z.string(),
  exceeded: z.boolean(),
  upgrade_url: z.string().nullable(),
});
type UserLLMBudget = z.infer<typeof UserLLMBudgetSchema>;

const InsightsResponseSchema = z.object({
  insights: z.array(z.object({
    type: z.string(),
    category: z.string(),
    title: z.string(),
    description: z.string(),
    percent_change: z.number(),
    amount_change: z.number(),
    positive: z.boolean(),
  })),
  weekly_summary: z.string().nullable(),
  savings_suggestion: z.string().nullable(),
});
type InsightsResponse = z.infer<typeof InsightsResponseSchema>;

function PaginatedResponseSchema<T>(itemSchema: import("zod").ZodType<T>) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    next_cursor: z.string().nullable(),
  });
}
// type PaginatedResponse<T> = z.infer<ReturnType<typeof PaginatedResponseSchema<T>>>;

const AccountBundleSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string(),
    role: z.string(),
    status: z.string(),
    onboarding_complete: z.boolean(),
    totp_enabled: z.boolean(),
    passkeys_enabled: z.boolean(),
    created_at: z.string().nullable(),
  }),
  profile: z.object({
    full_name: z.string().nullable(),
    display_name: z.string().nullable(),
    phone: z.string().nullable(),
    location: z.string().nullable(),
    avatar_url: z.string().nullable(),
    default_currency: z.string().nullable(),
    timezone: z.string().nullable(),
  }),
  settings: z.object({
    daily_digest: z.boolean(),
    low_confidence_alerts: z.boolean(),
    auto_categorize: z.boolean(),
    show_confidence: z.boolean(),
    sound_effects: z.boolean(),
    two_factor_enabled: z.boolean(),
    confidence_threshold: z.number(),
    monthly_ai_budget: z.number().nullable(),
    active_ai_service_id: z.string().nullable(),
    digest_hour: z.number().nullable(),
    use_rule_engine: z.boolean(),
    starting_balance: z.number().nullable(),
    starting_balance_date: z.string().nullable(),
  }),
  connected_accounts: z.array(z.object({
    id: z.string(),
    provider: z.string(),
    account_email: z.string(),
    status: z.string(),
    external_id: z.string().nullable(),
    last_synced_at: z.string().nullable(),
  })),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    color: z.string(),
    icon: z.string(),
    kind: z.string(),
    active: z.boolean(),
    sort_order: z.number(),
  })),
  ai_services: z.array(z.object({
    id: z.string(),
    provider: z.string(),
    display_name: z.string(),
    model_id: z.string(),
    base_url: z.string().nullable(),
    auth_header: z.string().nullable(),
    api_key_hint: z.string().nullable(),
    enabled: z.boolean(),
    rotation_enabled: z.boolean(),
    last_rotated_at: z.string().nullable(),
    key_expires_at: z.string().nullable(),
  })),
});
type AccountBundle = z.infer<typeof AccountBundleSchema>;

(window as any).TransactionSchema = TransactionSchema;
(window as any).StatsResponseSchema = StatsResponseSchema;
(window as any).BudgetSchema = BudgetSchema;
(window as any).GoalSchema = GoalSchema;
(window as any).DebtSchema = DebtSchema;
(window as any).RecurringSchema = RecurringSchema;
(window as any).SyncStatusSchema = SyncStatusSchema;
(window as any).UserLLMBudgetSchema = UserLLMBudgetSchema;
(window as any).InsightsResponseSchema = InsightsResponseSchema;
(window as any).AccountBundleSchema = AccountBundleSchema;
(window as any).PaginatedResponseSchema = PaginatedResponseSchema;
