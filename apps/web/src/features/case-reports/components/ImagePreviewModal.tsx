import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface ImagePreviewModalProps {
  imageUrl: string | null; // null = closed
  fileName?: string;
  onClose: () => void;
}

/**
 * Modal component for viewing a single image in full screen.
 */
export function ImagePreviewModal({ imageUrl, fileName, onClose }: ImagePreviewModalProps) {
  // Escape key closes the modal
  useEffect(() => {
    if (!imageUrl) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imageUrl, onClose]);

  // Body scroll lock while modal is open
  useEffect(() => {
    if (!imageUrl) return;

    document.body.classList.add("overflow-hidden");
    return () => document.body.classList.remove("overflow-hidden");
  }, [imageUrl]);

  if (!imageUrl) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-6 w-6" />
      </button>

      {/* Image container — stopPropagation prevents backdrop close */}
      <div
        className="flex max-h-full max-w-full items-center justify-center p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={imageUrl}
          alt={fileName ?? "Image"}
          className="max-h-[90vh] max-w-[90vw] object-contain"
        />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
