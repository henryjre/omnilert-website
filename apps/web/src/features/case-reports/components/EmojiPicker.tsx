import { useEffect, useRef } from 'react';

const FIXED_EMOJIS = ['✅', '❤️', '🤣', '🙏', '👌', '😭', '😊'] as const;

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  placement?: 'above' | 'below';
}

export function EmojiPicker({ onSelect, onClose, placement = 'above' }: EmojiPickerProps) {
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
