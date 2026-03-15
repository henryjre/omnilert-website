import { useEffect } from 'react';
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

  if (!isOpen) return null;

  const itemClass =
    'w-full px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors';
  const dangerClass =
    'w-full px-4 py-3 text-left text-sm text-red-600 hover:bg-red-50 transition-colors';

  function handleAction(action: () => void) {
    action();
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl">
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-2">
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
        <div className="divide-y divide-gray-100 pb-safe">
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
      </div>
    </>
  );
}
