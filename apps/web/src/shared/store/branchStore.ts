import { create } from 'zustand';
import { api } from '@/shared/services/api.client';

interface Branch {
  id: string;
  name: string;
  odoo_branch_id: string;
}

interface BranchState {
  branches: Branch[];
  selectedBranchIds: string[];
  loading: boolean;
  fetchBranches: () => Promise<void>;
  setSelectedBranchIds: (ids: string[]) => void;
  toggleBranch: (id: string) => void;
  selectAll: () => void;
}

export const useBranchStore = create<BranchState>()((set, get) => ({
  branches: [],
  selectedBranchIds: [],
  loading: false,

  fetchBranches: async () => {
    set({ loading: true });
    try {
      const res = await api.get('/branches');
      const data: Branch[] = res.data.data || [];
      set({ branches: data });
      // Auto-select all branches on first load
      if (get().selectedBranchIds.length === 0) {
        set({ selectedBranchIds: data.map((b) => b.id) });
      }
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
    set((state) => ({ selectedBranchIds: state.branches.map((b) => b.id) })),
}));
