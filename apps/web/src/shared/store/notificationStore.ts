import { create } from 'zustand';

interface NotificationState {
  unreadCount: number;
  setUnreadCount: (count: number) => void;
  increment: () => void;
  decrement: () => void;
  reset: () => void;
  // Used to broadcast new notifications to any subscribed component (e.g. the tab)
  latestNotification: any | null;
  pushNotification: (notif: any) => void;
  // Used to broadcast read-state changes across same-session components
  latestNotificationPatch: { id: string; changes: Record<string, unknown> } | null;
  patchNotification: (id: string, changes: Record<string, unknown>) => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  unreadCount: 0,
  setUnreadCount: (count) => set({ unreadCount: count }),
  increment: () => set((s) => ({ unreadCount: s.unreadCount + 1 })),
  decrement: () => set((s) => ({ unreadCount: Math.max(0, s.unreadCount - 1) })),
  reset: () => set({ unreadCount: 0 }),
  latestNotification: null,
  pushNotification: (notif) => set({ latestNotification: notif }),
  latestNotificationPatch: null,
  patchNotification: (id, changes) => set({ latestNotificationPatch: { id, changes } }),
}));
