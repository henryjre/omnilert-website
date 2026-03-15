import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FIXED_EMOJIS = ['✅', '❤️', '🤣', '🙏', '👌', '😭', '😊'] as const;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  placement?: 'above' | 'below';
  triggerRect?: DOMRect | null;
  portalMode?: boolean;
}

export function EmojiPicker({ onSelect, onClose, placement = 'above', triggerRect, portalMode }: EmojiPickerProps) {
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

  if (portalMode && triggerRect) {
    const rawTop =
      placement === 'above'
        ? triggerRect.top - 40 - 4
        : triggerRect.bottom + 4;
    const rawLeft = triggerRect.left;
    const left = Math.max(8, Math.min(window.innerWidth - 300, rawLeft));

    const picker = (
      <div
        ref={ref}
        style={{ position: 'fixed', top: rawTop, left, zIndex: 60 }}
        className="flex gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1.5 shadow-lg"
      >
        {FIXED_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="rounded-lg p-1 text-lg leading-none hover:bg-gray-100 active:scale-90 transition-transform"
          >
            {emoji}
          </button>
        ))}
      </div>
    );

    return createPortal(picker, document.body);
  }

  return (
    <div
      ref={ref}
      className={`absolute z-50 flex gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1.5 shadow-lg ${
        placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      {FIXED_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onClick={() => {
            onSelect(emoji);
            onClose();
          }}
          className="rounded-lg p-1 text-lg leading-none hover:bg-gray-100 active:scale-90 transition-transform"
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
