/* ── Context types for ViewContext / FilterContext / SyncContext ── */

import type { SyncStatus, SyncProgress } from "./api";

export interface DateRange {
  from: string | null;
  to: string | null;
}

export interface ViewContextType {
  view: string;
  setView: (v: string) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export interface FilterContextType {
  inboxFilter: string;
  setInboxFilter: (f: string) => void;
  categoryFilter: string | null;
  setCategoryFilter: (c: string | null) => void;
  dateRange: DateRange;
  setDateRange: (r: DateRange) => void;
  inboxDateRange: DateRange;
  setInboxDateRange: (r: DateRange) => void;
  catOpen: boolean;
  setCatOpen: (o: boolean | ((prev: boolean) => boolean)) => void;
  catRef: React.RefObject<HTMLDivElement | null>;
  tweaksOn: boolean;
  setTweaksOn: (t: boolean) => void;
}

export interface SyncContextType {
  syncStatus: SyncStatus | null;
  setSyncStatus: (s: SyncStatus | null) => void;
  syncing: boolean;
  setSyncing: (s: boolean) => void;
  syncProgress: SyncProgress | null;
  setSyncProgress: (p: SyncProgress | null) => void;
  syncPanelDismissed: boolean;
  setSyncPanelDismissed: (d: boolean) => void;
  syncPanelPosition: string;
  setSyncPanelPosition: (p: string) => void;
  startPolling: (initialProgress: SyncProgress | null) => Promise<void>;
  handleRescan: () => Promise<void>;
  syncLabel: () => string;
}
