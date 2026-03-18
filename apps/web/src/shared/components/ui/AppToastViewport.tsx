import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from 'lucide-react';
import { useAppToastStore, type AppToast, type AppToastType } from '@/shared/store/appToastStore';

const TOAST_META: Record<
  AppToastType,
  {
    title: string;
    Icon: typeof CheckCircle2;
    containerClass: string;
    iconClass: string;
  }
> = {
  success: {
    title: 'Success',
    Icon: CheckCircle2,
    containerClass: 'border-green-200 bg-green-50/95 text-green-900',
    iconClass: 'bg-green-100 text-green-700',
  },
  error: {
    title: 'Error',
    Icon: AlertCircle,
    containerClass: 'border-red-200 bg-red-50/95 text-red-900',
    iconClass: 'bg-red-100 text-red-700',
  },
  warning: {
    title: 'Warning',
    Icon: AlertTriangle,
    containerClass: 'border-amber-200 bg-amber-50/95 text-amber-900',
    iconClass: 'bg-amber-100 text-amber-700',
  },
  info: {
    title: 'Notice',
    Icon: Info,
    containerClass: 'border-blue-200 bg-blue-50/95 text-blue-900',
    iconClass: 'bg-blue-100 text-blue-700',
  },
};

function ToastCard({
  toast,
  onDismiss,
}: {
  toast: AppToast;
  onDismiss: (id: string) => void;
}) {
  const meta = TOAST_META[toast.type];
  const Icon = meta.Icon;

  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.duration, toast.id, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34, mass: 0.62 }}
      className={`pointer-events-auto rounded-xl border shadow-lg backdrop-blur-sm ${meta.containerClass}`}
    >
      <div className="flex items-start gap-3 p-3.5">
        <span className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${meta.iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{toast.title || meta.title}</p>
          <p className="mt-0.5 text-sm leading-5">{toast.message}</p>
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(toast.id)}
          className="rounded-md p-1 text-current/70 transition hover:bg-black/5 hover:text-current"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}

export function AppToastViewport() {
  const toasts = useAppToastStore((state) => state.toasts);
  const dismissToast = useAppToastStore((state) => state.dismissToast);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-[70] flex justify-center px-3 md:inset-x-auto md:left-auto md:right-6 md:top-20 md:justify-end md:px-0">
      <motion.div layout className="pointer-events-none flex w-full max-w-[24rem] flex-col gap-2 md:w-[24rem]">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
