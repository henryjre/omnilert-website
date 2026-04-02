import { useState, useEffect } from 'react';
import { Paperclip, X } from 'lucide-react';

interface FileThumbnailProps {
  file: File;
  onRemove: () => void;
  className?: string;
}

export function FileThumbnail({ file, onRemove, className }: FileThumbnailProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const isImage = file.type.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file, isImage]);

  return (
    <div className={`group relative ${className || ''}`}>
      {isImage && previewUrl ? (
        <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm transition-shadow hover:shadow">
          <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-black/0 transition-colors group-hover:bg-black/5" />
        </div>
      ) : (
        <div className="flex h-16 items-center gap-2 rounded-xl bg-gray-100 py-1.5 pl-3 pr-2 shadow-sm ring-1 ring-gray-200">
          <Paperclip className="h-4 w-4 text-gray-400" />
          <div className="flex flex-col min-w-0">
            <span className="max-w-[120px] truncate text-xs font-semibold text-gray-700">{file.name}</span>
            <span className="text-[10px] text-gray-400">{(file.size / 1024).toFixed(1)} KB</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-gray-400 shadow-md ring-1 ring-gray-100 transition-colors hover:bg-red-50 hover:text-red-500"
        title="Remove attachment"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
