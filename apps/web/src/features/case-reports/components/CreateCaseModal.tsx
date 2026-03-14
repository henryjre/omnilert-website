import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';

interface CreateCaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string }) => Promise<void> | void;
}

export function CreateCaseModal({ isOpen, onClose, onSubmit }: CreateCaseModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose} />
      <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
        <div className="w-full max-w-2xl rounded-2xl bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <h3 className="text-lg font-semibold text-gray-900">New Case Report</h3>
            <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-4 px-5 py-4">
            <Input label="Title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={255} />
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={8}
                maxLength={2000}
                className="w-full rounded-xl border border-gray-300 px-3 py-3 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-4">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button
              disabled={submitting || !title.trim() || !description.trim()}
              onClick={async () => {
                setSubmitting(true);
                try {
                  await onSubmit({ title, description });
                  setTitle('');
                  setDescription('');
                  onClose();
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              Create
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
