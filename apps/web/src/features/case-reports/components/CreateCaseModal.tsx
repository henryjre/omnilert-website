import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { CompanyBranchPicker } from '@/shared/components/CompanyBranchPicker';
import type { CompanyBranchValue } from '@/shared/components/CompanyBranchPicker';

interface CreateCaseModalProps {
  onClose: () => void;
  onSubmit: (payload: { title: string; description: string; branchId?: string | null }) => Promise<void> | void;
}

const INPUT_CLS =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors placeholder:text-gray-400 hover:border-primary-200 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200';
const LABEL_CLS = 'block text-sm font-medium text-gray-700';

export function CreateCaseModal({ onClose, onSubmit }: CreateCaseModalProps) {
  const [branchValue, setBranchValue] = useState<CompanyBranchValue | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  return (
    <AnimatedModal maxWidth="max-w-2xl" onBackdropClick={submitting ? undefined : onClose}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <h3 className="text-base font-semibold text-gray-900">New Case Report</h3>
        <button
          type="button"
          onClick={onClose}
          disabled={submitting}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="space-y-4 p-6">
        {/* Branch picker */}
        <CompanyBranchPicker
          label="Branch"
          value={branchValue}
          onChange={setBranchValue}
          placeholder="Select the branch this case belongs to"
          disabled={submitting}
        />

        {/* Title */}
        <div className="space-y-1">
          <label className={LABEL_CLS}>Title</label>
          <input
            className={INPUT_CLS}
            placeholder="Brief summary of the case"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={255}
            disabled={submitting}
          />
        </div>

        {/* Description */}
        <div className="space-y-1">
          <label className={LABEL_CLS}>Description</label>
          <textarea
            className={INPUT_CLS}
            rows={8}
            maxLength={2000}
            placeholder="Describe what happened..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={submitting}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          disabled={submitting || !branchValue || !title.trim() || !description.trim()}
          onClick={async () => {
            setSubmitting(true);
            try {
              await onSubmit({ title, description, branchId: branchValue?.branchId ?? null });
              setTitle('');
              setDescription('');
              setBranchValue(null);
              onClose();
            } finally {
              setSubmitting(false);
            }
          }}
        >
          {submitting ? 'Creating…' : 'Create'}
        </Button>
      </div>
    </AnimatedModal>
  );
}

