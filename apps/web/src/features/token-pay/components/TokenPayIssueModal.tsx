import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { GroupedUserSelect } from '@/features/violation-notices/components/GroupedUserSelect';
import { createIssuanceRequest, fetchGroupedUsers } from '../services/tokenPayManagement.api';

// ── Tab types ─────────────────────────────────────────────────────────────────

type IssuanceType = 'credit' | 'debit';

const TYPE_TABS_WITH_ICONS = [
  {
    id: 'credit' as IssuanceType,
    label: 'Issuance',
    icon: ArrowUpCircle,
    activeClassName: 'text-green-700',
    activeIndicatorClassName: 'bg-green-600',
    inactiveClassName: 'text-gray-500 hover:text-gray-700',
  },
  {
    id: 'debit' as IssuanceType,
    label: 'Deduction',
    icon: ArrowDownCircle,
    activeClassName: 'text-red-700',
    activeIndicatorClassName: 'bg-red-600',
    inactiveClassName: 'text-gray-500 hover:text-gray-700',
  },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface TokenPayIssueModalProps {
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}

export function TokenPayIssueModal({ open, onClose, onSubmitted }: TokenPayIssueModalProps) {
  const { success: showSuccess, error: showError } = useAppToast();

  const [type, setType] = useState<IssuanceType>('credit');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setType('credit');
      setSelectedUserIds([]);
      setAmount('');
      setReason('');
    }
  }, [open]);

  // Load grouped users when modal opens
  useEffect(() => {
    if (!open) return;
    setUsersLoading(true);
    fetchGroupedUsers()
      .then((data) => setGroupedUsers(data))
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Failed to load users';
        showError(message);
      })
      .finally(() => setUsersLoading(false));
  }, [open, showError]);

  const handleSubmit = useCallback(async () => {
    const trimmedReason = reason.trim();
    const parsedAmount = parseFloat(amount);

    if (selectedUserIds.length === 0) {
      showError('Please select a target employee.');
      return;
    }
    if (!trimmedReason) {
      showError('Please provide a reason.');
      return;
    }
    if (!amount || isNaN(parsedAmount) || parsedAmount <= 0) {
      showError('Please enter a valid amount greater than 0.');
      return;
    }

    setSubmitting(true);
    try {
      await createIssuanceRequest({
        targetUserId: selectedUserIds[0],
        type,
        amount: parsedAmount,
        reason: trimmedReason,
      });
      showSuccess(`${type === 'credit' ? 'Issuance' : 'Deduction'} request submitted.`);
      onClose();
      onSubmitted();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to submit request.';
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }, [selectedUserIds, reason, amount, type, showError, showSuccess, onClose, onSubmitted]);

  const isCredit = type === 'credit';

  return (
    <AnimatePresence>
      {open && (
        <AnimatedModal maxWidth="max-w-lg" onBackdropClick={submitting ? undefined : onClose}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Token Pay</p>
              <p className="font-semibold text-gray-900">Issue / Deduct Tokens</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Type tabs */}
          <div className="px-5 pt-4">
            <ViewToggle
              options={TYPE_TABS_WITH_ICONS}
              activeId={type}
              onChange={setType}
              layoutId="issue-modal-type-tab"
            />
          </div>

          {/* Form */}
          <div className="px-5 py-4 space-y-4">
            {/* Context note */}
            <div
              className={`rounded-lg px-3.5 py-2.5 text-sm ${
                isCredit
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-800'
              }`}
            >
              {isCredit
                ? 'Tokens will be credited to the selected employee\'s wallet after approval.'
                : 'Tokens will be deducted from the selected employee\'s wallet after approval.'}
            </div>

            {/* Target employee */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Target Employee
              </label>
              <GroupedUserSelect
                groupedUsers={groupedUsers}
                selectedUserIds={selectedUserIds}
                onChange={setSelectedUserIds}
                loading={usersLoading}
                disabled={submitting}
                placeholder="Select employee…"
                singleSelect
                suspendedUserIds={groupedUsers?.suspended_user_ids}
              />
            </div>

            {/* Amount */}
            <div>
              <Input
                label="Amount (₱)"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={submitting}
              />
            </div>

            {/* Reason */}
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Reason
              </label>
              <textarea
                rows={3}
                placeholder="Explain why this issuance or deduction is needed…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
            <Button
              type="button"
              variant="ghost"
              disabled={submitting}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={isCredit ? 'success' : 'danger'}
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting
                ? 'Submitting…'
                : isCredit
                  ? 'Submit Issuance'
                  : 'Submit Deduction'}
            </Button>
          </div>
        </AnimatedModal>
      )}
    </AnimatePresence>
  );
}
