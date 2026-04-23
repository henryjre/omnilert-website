import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Plus } from 'lucide-react';
import Picker from 'emoji-picker-react';
import { useMostUsedEmojis } from '@/shared/hooks/useMostUsedEmojis';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
  placement?: 'above' | 'below';
  triggerRect?: DOMRect | null;
  portalMode?: boolean;
}

export function EmojiPicker({ onSelect, onClose, placement = 'above', triggerRect, portalMode }: EmojiPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const { mostUsed, addEmoji } = useMostUsedEmojis(6);

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [onClose]);

  const handleSelect = (emoji: string) => {
    addEmoji(emoji);
    onSelect(emoji);
    onClose();
  };

  const renderContent = () => {
    if (showFullPicker) {
      return (
        <div className="z-50 drop-shadow-xl rounded-[10px] overflow-hidden">
          <Picker
            onEmojiClick={(emojiData) => handleSelect(emojiData.emoji)}
            lazyLoadEmojis={true}
            searchDisabled={false}
            skinTonesDisabled={true}
            width={320}
            height={400}
          />
        </div>
      );
    }

    return (
      <div className="flex gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1.5 shadow-lg">
        {mostUsed.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handleSelect(emoji)}
            className="rounded-lg p-1 text-lg leading-none hover:bg-gray-100 active:scale-90 transition-transform"
          >
            {emoji}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowFullPicker(true)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-900 active:scale-90 transition-all"
          title="More emojis"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>
    );
  };

  if (portalMode && triggerRect) {
    const isFull = showFullPicker;
    const pickerHeight = isFull ? 400 : 44;
    
    // Default placement logic
    let rawTop = placement === 'above'
      ? triggerRect.top - (isFull ? 408 : 44) 
      : triggerRect.bottom + 4;

    // Flip to bottom if it goes off the top of the screen
    if (placement === 'above' && rawTop < 16) {
      rawTop = triggerRect.bottom + 4;
    } 
    // Flip to top if it goes off the bottom of the screen
    else if (placement === 'below' && rawTop + pickerHeight > window.innerHeight - 16) {
      rawTop = triggerRect.top - (isFull ? 408 : 44);
    }

    // Ultimate fallback clamp so it's always accessible
    rawTop = Math.max(16, Math.min(window.innerHeight - pickerHeight - 16, rawTop));
      
    const rawLeft = triggerRect.left;
    // Leave at least 16px of margin from the screen edges
    const left = Math.max(16, Math.min(window.innerWidth - (isFull ? 336 : 316), rawLeft));

    const picker = (
      <div
        ref={ref}
        style={{ position: 'fixed', top: rawTop, left, zIndex: 60 }}
      >
        {renderContent()}
      </div>
    );

    return createPortal(picker, document.body);
  }

  return (
    <div
      ref={ref}
      className={`absolute z-50 ${
        placement === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'
      }`}
    >
      {renderContent()}
    </div>
  );
}
