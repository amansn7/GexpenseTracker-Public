/* ── React globals (loaded via script tags, not imports) ── */
declare const React: typeof import("react");
declare const ReactDOM: typeof import("react-dom");

/* ── React type namespace (for type annotations in ambient files) ── */
declare namespace React {
  type RefObject<T> = import("react").RefObject<T>;
  type Dispatch<T> = import("react").Dispatch<T>;
  type SetStateAction<T> = import("react").SetStateAction<T>;
  type ReactNode = import("react").ReactNode;
  type ReactElement<P = any> = import("react").ReactElement<P>;
  type CSSProperties = import("react").CSSProperties;
  type MouseEvent<T = Element, E = MouseEvent> = import("react").MouseEvent<T, E>;
  type FormEvent<T = Element> = import("react").FormEvent<T>;
  type KeyboardEvent<T = Element> = import("react").KeyboardEvent<T>;
  type ChangeEvent<T = Element> = import("react").ChangeEvent<T>;
  type FC<P = {}> = import("react").FC<P>;
  type ComponentProps<T> = import("react").ComponentProps<T>;
}

/* ── JSX IntrinsicElements (React 18 types scope JSX under React.JSX) ── */
declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

/* ── React Hooks (convenience aliases) ── */
declare const useState: <S>(initialState: S | (() => S)) => [S, import("react").Dispatch<import("react").SetStateAction<S>>];
declare const useEffect: typeof import("react").useEffect;
declare const useRef: typeof import("react").useRef;
declare const useMemo: typeof import("react").useMemo;
declare const useCallback: typeof import("react").useCallback;
declare const useContext: typeof import("react").useContext;
declare const createContext: typeof import("react").createContext;

/* ── D3 Sankey (vendor bundle) ── */
declare const d3Sankey: {
  sankey: (opts?: any) => any;
  sankeyLinkHorizontal: () => any;
  sankeyCenter: () => any;
  sankeyJustify: () => any;
  sankeyLeft: () => any;
  sankeyRight: () => any;
};

/* ── react-window (vendor bundle) ── */
declare const ReactWindow: {
  FixedSizeList: any;
  VariableSizeList: any;
  FixedSizeGrid: any;
};

/* ── Zod schema builder (vendor bundle global) ── */
declare const z: typeof import("zod")["z"];
declare namespace z {
  type infer<T extends import("zod").ZodType<any, any, any>> = import("zod").infer<T>;
}

/* ── Application globals ── */
interface Window {
  __mfChunks: Record<string, string>;
  __mfCache: Record<string, any>;
  API: {
    get<T = any>(url: string, schema?: z.ZodType<T>): Promise<T>;
    post<T = any>(url: string, body?: any, schema?: z.ZodType<T>): Promise<T>;
    put<T = any>(url: string, body?: any, opts?: Record<string, any>): Promise<T>;
    del<T = any>(url: string, opts?: Record<string, any>): Promise<T>;
  };
  mf: {
    setView: (view: string) => void;
    getView: () => string;
    navigateTo: (...args: any[]) => void;
  };
  Toast: (msg: string, type?: string) => void;
  _isMobileDevice: () => boolean;
  _navHints: Record<string, string>;
  TAGS: Record<string, { dot: string; label: string; bg: string }>;
  CATEGORY_MAP: Record<string, string>;
  formatMoney: (amount: number, opts?: any) => string;
  formatPercent: (v: number) => string;
  formatShortNumber: (n: number) => string;
  formatDate: (d: string | Date, fmt?: string) => string;
  parseCustomDate: (s: string) => string;
  renderToString: (v: any) => string;
  unfilteredList: any[];
  domCache: Record<string, any>;
  cachedLayout: any;
  debounce: (fn: Function, ms: number) => (...args: any[]) => void;
  throttle: (fn: Function, ms: number) => (...args: any[]) => void;
  classNames: (...args: any[]) => string;
  n: (obj: any, ...keys: string[]) => any;
  renderIcon: (name: string, size?: number, stroke?: string, fill?: string) => import("react").ReactElement;
  DateUtils: {
    getMonthRange: (year: number, month: number) => { from: string | null; to: string | null };
    getCurrentMonthRange: () => { from: string | null; to: string | null };
    getLastMonthRange: () => { from: string | null; to: string | null };
    getWeekRange: () => { from: string | null; to: string | null };
    getLastNDays: (n: number) => { from: string | null; to: string | null };
    getYearRange: (year?: number) => { from: string | null; to: string | null };
    getAllTimeRange: () => { from: string | null; to: string | null };
    formatDateRange: (range: { from: string | null; to: string | null }) => string;
    DATE_PRESETS: Array<{ label: string; get: () => { from: string | null; to: string | null } }>;
  };
  ReactMemoComponent: (props?: any) => import("react").ReactElement;
  SANKEY_COLORS: Record<string, string>;

  /* Shared component constructors */
  Modal: (props: any) => import("react").ReactElement;
  Button: (props: any) => import("react").ReactElement;
  Input: (props: any) => import("react").ReactElement;
  Toggle: (props: any) => import("react").ReactElement;
  ProgressBar: (props: any) => import("react").ReactElement;
  Skeleton: (props: any) => import("react").ReactElement;

  /* View renderers */
  InboxView: (props?: any) => import("react").ReactElement;
  FlowView: (props?: any) => import("react").ReactElement;
  DashboardView: (props?: any) => import("react").ReactElement;
  HealthView: (props?: any) => import("react").ReactElement;
  ReportsView: (props?: any) => import("react").ReactElement;
  RecurringView: (props?: any) => import("react").ReactElement;
  DebtView: (props?: any) => import("react").ReactElement;
  GoalsView: (props?: any) => import("react").ReactElement;
  BudgetsView: (props?: any) => import("react").ReactElement;
  AccountView: (props?: any) => import("react").ReactElement;
  AdminView: (props?: any) => import("react").ReactElement;
  OnboardingView: (props?: any) => import("react").ReactElement;
  SettingsView: (props?: any) => import("react").ReactElement;
  useViewport: () => { width: number; isMobile: boolean; isTablet: boolean };

  /* Validation schemas (static/src/types/validation.ts) */
  TransactionSchema: z.ZodType<any>;
  StatsResponseSchema: z.ZodType<any>;
  BudgetSchema: z.ZodType<any>;
  GoalSchema: z.ZodType<any>;
  DebtSchema: z.ZodType<any>;
  RecurringSchema: z.ZodType<any>;
  SyncStatusSchema: z.ZodType<any>;
  UserLLMBudgetSchema: z.ZodType<any>;
  InsightsResponseSchema: z.ZodType<any>;
  AccountBundleSchema: z.ZodType<any>;
  PaginatedResponseSchema: <T>(schema: z.ZodType<T>) => z.ZodType<any>;

  /* Validation helper */
  validateOrThrow: <T>(data: unknown, schema: z.ZodType<T>) => T;
}
