import { create } from 'zustand';

interface PosVerificationState {
  pendingCount: number;
  setPendingCount: (count: number) => void;
  increment: () => void;
  decrement: () => void;
}

export const usePosVerificationStore = create<PosVerificationState>((set) => ({
  pendingCount: 0,
  setPendingCount: (count) => set({ pendingCount: count }),
  increment: () => set((s) => ({ pendingCount: s.pendingCount + 1 })),
  decrement: () => set((s) => ({ pendingCount: Math.max(0, s.pendingCount - 1) })),
}));
