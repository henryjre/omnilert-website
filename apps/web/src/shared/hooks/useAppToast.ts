import { useCallback } from 'react';
import {
  useAppToastStore,
  type AppToastType,
} from '@/shared/store/appToastStore';

type ToastInput = string | {
  message: string;
  title?: string;
  duration?: number;
};

function normalizeInput(input: ToastInput): {
  message: string;
  title?: string;
  duration?: number;
} {
  if (typeof input === 'string') {
    return { message: input };
  }

  return {
    message: input.message,
    title: input.title,
    duration: input.duration,
  };
}

export function useAppToast() {
  const addToast = useAppToastStore((state) => state.addToast);
  const dismissToast = useAppToastStore((state) => state.dismissToast);
  const clearToasts = useAppToastStore((state) => state.clearToasts);

  const show = useCallback((type: AppToastType, input: ToastInput) => {
    const normalized = normalizeInput(input);
    return addToast({
      type,
      message: normalized.message,
      title: normalized.title,
      duration: normalized.duration,
    });
  }, [addToast]);

  const success = useCallback((input: ToastInput) => show('success', input), [show]);
  const error = useCallback((input: ToastInput) => show('error', input), [show]);
  const warning = useCallback((input: ToastInput) => show('warning', input), [show]);
  const info = useCallback((input: ToastInput) => show('info', input), [show]);

  return {
    show,
    success,
    error,
    warning,
    info,
    dismiss: dismissToast,
    clear: clearToasts,
  };
}
