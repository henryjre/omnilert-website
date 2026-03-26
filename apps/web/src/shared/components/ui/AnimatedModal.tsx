import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface AnimatedModalProps {
  /** Modal content rendered inside the animated card. */
  children: ReactNode;
  /** Called when the semi-transparent backdrop is clicked. */
  onBackdropClick?: () => void;
  /**
   * Tailwind max-width class applied to the card.
   * @default 'max-w-md'
   */
  maxWidth?: string;
  /**
   * Stacking for the portal root (e.g. `z-[60]` when a parent drawer uses `z-50`).
   * @default 'z-50'
   */
  zIndexClass?: string;
}

/**
 * Global animated modal wrapper.
 *
 * Renders a fade-in backdrop and a scale + slide-up animated card.
 * Must be wrapped in `<AnimatePresence>` at the call site to get exit animations:
 *
 * ```tsx
 * import { AnimatePresence } from 'framer-motion';
 * import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
 *
 * <AnimatePresence>
 *   {open && (
 *     <AnimatedModal onBackdropClick={() => setOpen(false)}>
 *       <YourModalContent />
 *     </AnimatedModal>
 *   )}
 * </AnimatePresence>
 * ```
 */
export function AnimatedModal({
  children,
  onBackdropClick,
  maxWidth = 'max-w-md',
  zIndexClass = 'z-50',
}: AnimatedModalProps) {
  return createPortal(
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4`}>
      {/* Backdrop — fades in/out */}
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onBackdropClick}
      />

      {/* Card — scales up and slides in from slightly below */}
      <motion.div
        className={`relative z-10 w-full ${maxWidth} rounded-xl bg-white shadow-2xl`}
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.div>
    </div>,
    document.body,
  );
}
