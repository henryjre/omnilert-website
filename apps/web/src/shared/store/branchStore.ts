import { create } from 'zustand';
import { api } from '@/shared/services/api.client';
import {
  buildSelectorCompanyGroupsFromSnapshots,
  flattenCompanyBranches,
  flattenCompanyBranchIds,
  type SelectorCompanyGroup,
} from '@/shared/components/branchSelectorState';

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
  selectedBranchIds: [],
  loading: false,

  fetchBranches: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/user/assigned-branches');
      const groups: Array<{
        companyId: string;
        companyName: string;
        companySlug: string;
        branches: Array<{ id: string; name: string; odoo_branch_id: string | null }>;
      }> = res.data.data || [];

      const snapshots = groups.map((g) => ({
        id: g.companyId,
        name: g.companyName,
        slug: g.companySlug,
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
    } finally {
      set({ loading: false });
    }
  },

  setSelectedBranchIds: (ids) => set({ selectedBranchIds: ids }),

  toggleBranch: (id) =>
    set((state) => {
      const current = state.selectedBranchIds;
      if (current.includes(id)) {
        if (current.length <= 1) return state;
        return { selectedBranchIds: current.filter((bid) => bid !== id) };
      }
      return { selectedBranchIds: [...current, id] };
    }),

  selectAll: () =>
    set((state) => ({ selectedBranchIds: flattenCompanyBranchIds(state.companyBranchGroups) })),
}));
