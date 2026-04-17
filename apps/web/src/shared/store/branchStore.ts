import { create } from 'zustand';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import {
  buildSelectorCompanyGroupsFromSnapshots,
  flattenCompanyBranches,
  flattenCompanyBranchIds,
  type SelectorCompanyGroup,
} from '@/shared/components/branchSelectorState';

/**
 * Storage key versioning allows safe future format changes.
 */
const BRANCH_SELECTION_STORAGE_VERSION = 'v1';

/**
 * Builds a per-user storage key for persisted branch selection.
 * Returns null when user is unknown (e.g. before auth hydration).
 */
function buildBranchSelectionStorageKey(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return `omnilert-branch-selection:${BRANCH_SELECTION_STORAGE_VERSION}:${userId}`;
}

/**
 * Safely parses a JSON string into a string[].
 */
function parseStringArrayJson(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const strings: string[] = parsed.filter((v): v is string => typeof v === 'string');
    return strings;
  } catch {
    return [];
  }
}

/**
 * Loads the persisted selection for the current authenticated user.
 */
function loadPersistedBranchSelection(): string[] {
  if (typeof window === 'undefined') return [];
  const userId = useAuthStore.getState().user?.id ?? null;
  const key = buildBranchSelectionStorageKey(userId);
  if (!key) return [];
  return parseStringArrayJson(window.localStorage.getItem(key));
}

/**
 * Persists the selection for the current authenticated user.
 * Best-effort only; failures should not break UX.
 */
function persistBranchSelection(ids: string[]): void {
  if (typeof window === 'undefined') return;
  const userId = useAuthStore.getState().user?.id ?? null;
  const key = buildBranchSelectionStorageKey(userId);
  if (!key) return;

  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // Ignore storage failures (quota, privacy mode, etc.)
  }
}

interface Branch {
  id: string;
  name: string;
  odoo_branch_id?: string | null;
  companyId: string;
  companyName: string;
  companySlug?: string | null;
}

interface BranchState {
  branches: Branch[];
  companyBranchGroups: SelectorCompanyGroup[];
  selectedBranchIds: string[];
  loading: boolean;
  fetchBranches: () => Promise<void>;
  setSelectedBranchIds: (ids: string[]) => void;
  toggleBranch: (id: string) => void;
  selectAll: () => void;
}

export const useBranchStore = create<BranchState>()((set, get) => ({
  branches: [],
  companyBranchGroups: [],
  selectedBranchIds: loadPersistedBranchSelection(),
  loading: false,

  fetchBranches: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/user/assigned-branches');
      const groups: Array<{
        companyId: string;
        companyName: string;
        companySlug: string;
        logoUrl: string | null;
        branches: Array<{ id: string; name: string; odoo_branch_id: string | null }>;
      }> = res.data.data || [];

      const snapshots = groups.map((g) => ({
        id: g.companyId,
        name: g.companyName,
        slug: g.companySlug,
        logoUrl: g.logoUrl ?? null,
        branches: g.branches,
      }));

      const companyBranchGroups = buildSelectorCompanyGroupsFromSnapshots(snapshots);
      const branches = flattenCompanyBranches(companyBranchGroups) as Branch[];
      const orderedIds = flattenCompanyBranchIds(companyBranchGroups);
      const currentSelected = get().selectedBranchIds;
      const validIds = new Set(orderedIds);
      const sanitized = currentSelected.filter((id) => validIds.has(id));
      const nextSelectedBranchIds = sanitized.length > 0 ? sanitized : orderedIds;

      set({ branches, companyBranchGroups, selectedBranchIds: nextSelectedBranchIds });
      persistBranchSelection(nextSelectedBranchIds);
    } finally {
      set({ loading: false });
    }
  },

  setSelectedBranchIds: (ids) => {
    const groups = get().companyBranchGroups;
    const orderedIds = flattenCompanyBranchIds(groups);
    const validIds = new Set(orderedIds);

    const inputIds = Array.isArray(ids) ? ids : [];
    const sanitized =
      orderedIds.length > 0
        ? inputIds.filter((id) => typeof id === 'string' && validIds.has(id))
        : inputIds.filter((id) => typeof id === 'string');

    const nextSelected =
      sanitized.length > 0 ? sanitized : orderedIds[0] ? [orderedIds[0]] : [];

    set({ selectedBranchIds: nextSelected });
    persistBranchSelection(nextSelected);
  },

  toggleBranch: (id) =>
    set((state) => {
      const current = state.selectedBranchIds;
      if (current.includes(id)) {
        if (current.length <= 1) return state;
        const nextSelectedBranchIds = current.filter((bid) => bid !== id);
        persistBranchSelection(nextSelectedBranchIds);
        return { selectedBranchIds: nextSelectedBranchIds };
      }
      const nextSelectedBranchIds = [...current, id];
      persistBranchSelection(nextSelectedBranchIds);
      return { selectedBranchIds: nextSelectedBranchIds };
    }),

  selectAll: () =>
    set((state) => {
      const nextSelectedBranchIds = flattenCompanyBranchIds(state.companyBranchGroups);
      persistBranchSelection(nextSelectedBranchIds);
      return { selectedBranchIds: nextSelectedBranchIds };
    }),
}));
