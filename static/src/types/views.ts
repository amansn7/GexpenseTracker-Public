/* ── View prop types and shared component prop types ── */

import type { Transaction, SyncStatus, Budget, ViewName } from "./api";
import type { DateRange } from "./contexts";
import type { SyncProgress } from "./api";

/* ── Shared view props ── */

export interface ViewProps {
  transactions?: Transaction[];
}

export interface InboxViewProps {
  transactions: any[];
  setTransactions: React.Dispatch<React.SetStateAction<any[]>>;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  filter: string;
  setFilter: (f: string) => void;
  categoryFilter: string | null;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  loadMore: () => Promise<void>;
  loadData: () => Promise<void>;
  totalTransactions: number;
  loadingMore: boolean;
  reviewEmails: any[];
  setReviewEmails: React.Dispatch<React.SetStateAction<any[]>>;
}

export interface DashboardViewProps {
  transactions: any[];
  categoryFilter: string | null;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
}

export interface FlowViewProps {
  transactions: any[];
  categoryFilter: string | null;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  onNavigateToView?: (v: string) => void;
  onSetCategoryFilter?: (c: string | null) => void;
  onSetFilter?: (f: string) => void;
  onSetDateRange?: (r: DateRange) => void;
  onSetInboxDateRange?: (r: DateRange) => void;
}

export interface SettingsViewProps {
  syncStatus: SyncStatus | null;
  setSyncStatus: (s: SyncStatus | null) => void;
  onRescan: () => Promise<void>;
  syncing: boolean;
  account: any;
  setAccount: (a: any) => void;
}

export interface ProfileViewProps {
  transactions: any[];
  account: any;
  setAccount: (a: any) => void;
}

export interface RecurringViewProps {
  userCategories?: string[];
}

/* ── Shared component props ── */

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  width?: number;
  danger?: boolean;
  className?: string;
}

export interface ButtonProps {
  variant?: "primary" | "ghost" | "subtle" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  disabled?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
  style?: React.CSSProperties;
  className?: string;
}

export interface ProgressBarProps {
  value?: number;
  size?: "sm" | "md";
  color?: "accent" | "pos" | "neg" | "amber";
  animated?: boolean;
  showLabel?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  variant?: "text" | "circle" | "rect" | "card";
  count?: number;
  gap?: number;
  className?: string;
  style?: React.CSSProperties;
}

export interface InboxRowProps {
  tx: any;
  selected: boolean;
  selectMode: boolean;
  onRowClick: () => void;
  onCheckbox: () => void;
  onEditCat?: (cat: string) => void;
}

export interface MerchantLogoProps {
  merchant: string;
  size?: number;
}

export interface CategoryChipProps {
  cat: string;
  onClick?: (e: React.MouseEvent) => void;
  editable?: boolean;
}

export interface ConfidenceProps {
  value: number;
}

export interface FilterChipProps {
  label: string;
  icon?: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}

export interface SyncProgressOverlayProps {
  progress: SyncProgress;
  syncing: boolean;
  onClose: () => void;
  onFullView?: () => void;
  position?: string;
}
