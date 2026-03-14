import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';

interface TextInputModalProps {
  isOpen: boolean;
  title: string;
  initialValue?: string | null;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void> | void;
}

export function TextInputModal({
  isOpen,
  title,
  initialValue,
  onClose,
  onSubmit,
}: TextInputModalProps) {
  const [value, setValue] = useState(initialValue ?? '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) setValue(initialValue ?? '');
  }, [initialValue, isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="px-5 py-4">
            <textarea
              value={value}
              onChange={(event) => setValue(event.target.value)}
              rows={8}
              className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              placeholder="Enter details..."
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSubmit(value);
                  onClose();
                } finally {
                  setSubmitting(false);
                }
              }}
              disabled={submitting || !value.trim()}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
