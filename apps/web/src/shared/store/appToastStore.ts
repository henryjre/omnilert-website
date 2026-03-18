import { create } from 'zustand';

export type AppToastType = 'success' | 'error' | 'warning' | 'info';

export interface AppToast {
  id: string;
  type: AppToastType;
  message: string;
  title?: string;
  duration: number;
}

interface AddToastInput {
  type: AppToastType;
  message: string;
  title?: string;
  duration?: number;
}

interface AppToastState {
  toasts: AppToast[];
  addToast: (input: AddToastInput) => string;
  dismissToast: (id: string) => void;
  clearToasts: () => void;
}

export const APP_TOAST_MAX_VISIBLE = 4;
export const APP_TOAST_DEFAULT_DURATION = 4000;

function generateToastId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export const useAppToastStore = create<AppToastState>((set) => ({
  toasts: [],
  addToast: (input) => {
    const id = generateToastId();
    const toast: AppToast = {
      id,
      type: input.type,
      message: input.message,
      title: input.title,
      duration: input.duration ?? APP_TOAST_DEFAULT_DURATION,
    };

    set((state) => ({
      toasts: [toast, ...state.toasts].slice(0, APP_TOAST_MAX_VISIBLE),
    }));

    return id;
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    }));
  },
  clearToasts: () => set({ toasts: [] }),
}));
