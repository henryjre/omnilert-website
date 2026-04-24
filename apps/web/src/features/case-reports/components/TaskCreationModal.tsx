import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { GroupedUserSelect } from '@/features/violation-notices/components/GroupedUserSelect';
import { Spinner } from '@/shared/components/ui/Spinner';

interface TaskCreationModalProps {
  groupedUsers: GroupedUsersResponse | null;
  defaultDescription?: string;
  isOpen: boolean;
  onSubmit: (payload: { description: string; assigneeUserIds: string[] }) => Promise<void>;
  onClose: () => void;
}

export function TaskCreationModal({
  groupedUsers,
  defaultDescription = '',
  isOpen,
  onSubmit,
  onClose,
}: TaskCreationModalProps) {
  const [description, setDescription] = useState(defaultDescription);
  const [assigneeUserIds, setAssigneeUserIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens with a new defaultDescription
  function handleClose() {
    setDescription(defaultDescription);
    setAssigneeUserIds([]);
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    if (assigneeUserIds.length === 0) {
      setError('Please select at least one assignee.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ description: description.trim(), assigneeUserIds });
      handleClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create task.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <AnimatedModal onBackdropClick={submitting ? undefined : handleClose} maxWidth="max-w-lg" zIndexClass="z-[60]">
          <form onSubmit={(e) => void handleSubmit(e)} className="p-5">
            <h2 className="mb-4 text-base font-semibold text-gray-900">Create Task</h2>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Task description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Describe the task..."
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                autoFocus
              />
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Assign to
              </label>
              <GroupedUserSelect
                groupedUsers={groupedUsers}
                selectedUserIds={assigneeUserIds}
                onChange={setAssigneeUserIds}
                placeholder="Select employees..."
                loading={groupedUsers === null}
              />
            </div>

            {error && (
              <p className="mb-3 text-sm text-red-600">{error}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !description.trim() || assigneeUserIds.length === 0}
                className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {submitting && <Spinner size="sm" />}
                Create Task
              </button>
            </div>
          </form>
        </AnimatedModal>
      )}
    </AnimatePresence>
  );
}
