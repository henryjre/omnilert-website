import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CaseMessage } from '@omnilert/shared';

const FIXED_EMOJIS = ['✅', '❤️', '🤣', '🙏', '👌', '😭', '😊'] as const;

interface MessageDrawerProps {
  isOpen: boolean;
  message: CaseMessage;
  currentUserId: string;
  canManage: boolean;
  chatLocked: boolean;
  userHasReacted: (emoji: string) => boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onCopyText: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MessageDrawer({
  isOpen,
  message,
  currentUserId,
  canManage,
  chatLocked,
  userHasReacted,
  onReact,
  onReply,
  onCopyText,
  onEdit,
  onDelete,
  onClose,
}: MessageDrawerProps) {
  const isOwnMessage = message.user_id === currentUserId;

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden');
    } else {
      document.body.classList.remove('overflow-hidden');
    }
    return () => document.body.classList.remove('overflow-hidden');
  }, [isOpen]);

  const itemClass =
    'w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors';
  const dangerClass =
    'w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition-colors';

  function handleAction(action: () => void) {
    action();
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/30"
            onClick={onClose}
          />

          {/* Drawer */}
          <motion.div
            key="drawer"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pb-2 pt-3">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Emoji row */}
            <div className="flex justify-around border-b border-gray-100 px-4 pb-3">
              {FIXED_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleAction(() => onReact(emoji))}
                  className={`flex flex-col items-center gap-1 rounded-xl p-2 transition-colors ${
                    userHasReacted(emoji)
                      ? 'bg-primary-50 ring-1 ring-primary-400'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <span className="text-2xl leading-none">{emoji}</span>
                </button>
              ))}
            </div>

            {/* Action list */}
            <div className="divide-y divide-gray-100 pb-[env(safe-area-inset-bottom)]">
              {!chatLocked && (
                <button type="button" className={itemClass} onClick={() => handleAction(onReply)}>
                  Reply
                </button>
              )}
              <button type="button" className={itemClass} onClick={() => handleAction(onCopyText)}>
                Copy Text
              </button>
              {isOwnMessage && !chatLocked && (
                <button type="button" className={itemClass} onClick={() => handleAction(onEdit)}>
                  Edit Message
                </button>
              )}
              {(isOwnMessage || canManage) && (
                <button type="button" className={dangerClass} onClick={() => handleAction(onDelete)}>
                  Delete Message
                </button>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
