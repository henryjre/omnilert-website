import { useEffect, useRef } from 'react';

interface MessageActionMenuProps {
  isOwnMessage: boolean;
  canManage: boolean;
  chatLocked: boolean;
  onReply: () => void;
  onCopyText: () => void;
  onAddReaction: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export function MessageActionMenu({
  isOwnMessage,
  canManage,
  chatLocked,
  onReply,
  onCopyText,
  onAddReaction,
  onEdit,
  onDelete,
  onClose,
}: MessageActionMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  const itemClass =
    'w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors';
  const dangerClass =
    'w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors';

  return (
    <div
      ref={ref}
      className="absolute right-0 top-6 z-50 min-w-[160px] rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
    >
      {!chatLocked && (
        <button type="button" className={itemClass} onClick={() => { onReply(); onClose(); }}>
          Reply
        </button>
      )}
      <button type="button" className={itemClass} onClick={() => { onCopyText(); onClose(); }}>
        Copy Text
      </button>
      {!chatLocked && (
        <button type="button" className={itemClass} onClick={() => { onAddReaction(); onClose(); }}>
          Add Reaction
        </button>
      )}
      {isOwnMessage && !chatLocked && (
        <button type="button" className={itemClass} onClick={() => { onEdit(); onClose(); }}>
          Edit Message
        </button>
      )}
      {(isOwnMessage || canManage) && (
        <button type="button" className={dangerClass} onClick={() => { onDelete(); onClose(); }}>
          Delete Message
        </button>
      )}
    </div>
  );
}
