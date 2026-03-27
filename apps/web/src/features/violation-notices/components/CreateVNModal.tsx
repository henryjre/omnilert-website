import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import type { ViolationNotice, GroupedUsersResponse } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { CompanyBranchPicker } from '@/shared/components/CompanyBranchPicker';
import type { CompanyBranchValue } from '@/shared/components/CompanyBranchPicker';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { createViolationNotice, getGroupedUsers } from '../services/violationNotice.api';
import { GroupedUserSelect } from './GroupedUserSelect';

export interface CreateVNModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (vn: ViolationNotice) => void;
}

const INPUT_CLS =
  'w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 shadow-sm transition-colors placeholder:text-gray-400 hover:border-primary-200 focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200 disabled:cursor-not-allowed disabled:opacity-50';
const LABEL_CLS = 'block text-sm font-medium text-gray-700';

export function CreateVNModal({
  isOpen,
  onClose,
  onCreated,
}: CreateVNModalProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [branchValue, setBranchValue] = useState<CompanyBranchValue | null>(null);
  const [description, setDescription] = useState('');
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  function getApiErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message || fallback;
    if (typeof err !== 'object' || err === null) return fallback;

    const maybeResponse = (err as { response?: { data?: { error?: string; message?: string } } }).response;
    const maybeData = maybeResponse?.data;
    if (typeof maybeData?.error === 'string' && maybeData.error.trim()) return maybeData.error;
    if (typeof maybeData?.message === 'string' && maybeData.message.trim()) return maybeData.message;
    return fallback;
  }

  // For manual VN creation, show all users (not scoped to selected company).
  useEffect(() => {
    if (!isOpen) return;
    setLoadingUsers(true);
    setTargetUserIds([]);
    void getGroupedUsers({ allCompanies: true })
      .then((data) => setGroupedUsers(data))
      .catch(() => setGroupedUsers(null))
      .finally(() => setLoadingUsers(false));
  }, [isOpen]);

  const canSubmit = description.trim().length > 0 && targetUserIds.length > 0 && branchValue !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      console.log('[CreateVNModal] submit branchValue:', JSON.stringify(branchValue));
      const vn = await createViolationNotice({
        description: description.trim(),
        targetUserIds,
        branchId: branchValue?.branchId ?? null,
      });
      showSuccessToast("Violation notice created.");
      onCreated(vn);
      setDescription('');
      setTargetUserIds([]);
      setBranchValue(null);
      onClose();
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, "Failed to create violation notice.");
      setError(message);
      showErrorToast(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    if (submitting) return;
    setDescription('');
    setTargetUserIds([]);
    setBranchValue(null);
    setError('');
    onClose();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <AnimatedModal maxWidth="max-w-2xl" onBackdropClick={submitting ? undefined : handleClose}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <h3 className="text-base font-semibold text-gray-900">New Violation Notice</h3>
            <button
              type="button"
              onClick={handleClose}
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
              placeholder="Select the branch this VN belongs to"
              disabled={submitting}
            />

            {/* Target Employees */}
            <div className="space-y-1">
              <label className={LABEL_CLS}>
                Target Employees <span className="text-red-500">*</span>
              </label>
              <GroupedUserSelect
                groupedUsers={groupedUsers}
                selectedUserIds={targetUserIds}
                onChange={setTargetUserIds}
                loading={loadingUsers}
                disabled={submitting}
                placeholder="Select employees..."
              />
            </div>

            {/* Description */}
            <div className="space-y-1">
              <label className={LABEL_CLS}>
                Description <span className="text-red-500">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={6}
                maxLength={2000}
                disabled={submitting}
                placeholder="Describe the violation..."
                className={INPUT_CLS}
              />
              <p className="text-right text-xs text-gray-400">
                {description.length} / 2000
              </p>
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 border-t border-gray-200 px-6 py-4">
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={!canSubmit}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </div>
        </AnimatedModal>
      )}
    </AnimatePresence>
  );
}
