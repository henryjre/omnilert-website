import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

interface MediaItem {
  url: string;
  fileName: string;
}

interface ImagePreviewModalProps {
  items: MediaItem[] | null; // null = closed
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}

export function ImagePreviewModal({ items, index, onIndexChange, onClose }: ImagePreviewModalProps) {
  const isOpen = items !== null && items.length > 0;
  const current = isOpen ? items[index] : null;
  const hasPrev = isOpen && index > 0;
  const hasNext = isOpen && index < items.length - 1;

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, index, hasPrev, hasNext, onClose, onIndexChange]);

  useEffect(() => {
    if (!isOpen) return;
    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [isOpen]);

  if (!isOpen || !current) return null;

  const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(current.fileName);

  const modalContent = (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* Top-right controls */}
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <a
          href={current.url}
          download={current.fileName}
          onClick={(e) => e.stopPropagation()}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          title="Download"
        >
          <Download className="h-5 w-5" />
        </a>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Prev button */}
      {hasPrev && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndexChange(index - 1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
        >
          <ChevronLeft className="h-7 w-7" />
        </button>
      )}

      {/* Next button */}
      {hasNext && (
        <button
          onClick={(e) => { e.stopPropagation(); onIndexChange(index + 1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/25"
        >
          <ChevronRight className="h-7 w-7" />
        </button>
      )}

      {/* Media */}
      <div
        className="flex max-h-full max-w-full items-center justify-center p-16"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            key={current.url}
            src={current.url}
            controls
            autoPlay
            className="max-h-[85vh] max-w-[85vw] rounded-xl"
          />
        ) : (
          <img
            key={current.url}
            src={current.url}
            alt={current.fileName}
            className="max-h-[85vh] max-w-[85vw] object-contain"
          />
        )}
      </div>

      {/* Bottom bar: filename + counter */}
      <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-1">
        <p className="text-sm text-white/60">{current.fileName}</p>
        {items.length > 1 && (
          <div className="flex items-center gap-1.5">
            {items.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); onIndexChange(i); }}
                className={`h-1.5 rounded-full transition-all ${i === index ? 'w-4 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
