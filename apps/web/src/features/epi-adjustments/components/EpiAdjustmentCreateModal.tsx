import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { GroupedUserSelect } from '@/features/violation-notices/components/GroupedUserSelect';
import { createRewardRequest, fetchRewardGroupedUsers } from '../services/epiAdjustments.api';
import { getApiErrorMessage } from './epiAdjustmentFormatters';

type AdjustmentType = 'add' | 'deduct';

const TYPE_TABS = [
  {
    id: 'add' as AdjustmentType,
    label: 'Add',
    icon: ArrowUpCircle,
    activeClassName: 'text-green-700',
    activeIndicatorClassName: 'bg-green-600',
    inactiveClassName: 'text-gray-500 hover:text-gray-700',
  },
  {
    id: 'deduct' as AdjustmentType,
    label: 'Deduct',
    icon: ArrowDownCircle,
    activeClassName: 'text-red-700',
    activeIndicatorClassName: 'bg-red-600',
    inactiveClassName: 'text-gray-500 hover:text-gray-700',
  },
];

interface EpiAdjustmentCreateModalProps {
  open: boolean;
  companyId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

export function EpiAdjustmentCreateModal({
  open,
  companyId,
  onClose,
  onSubmitted,
}: EpiAdjustmentCreateModalProps) {
  const { success: showSuccess, error: showError } = useAppToast();
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [type, setType] = useState<AdjustmentType>('add');
  const [epiAmount, setEpiAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedUserIds([]);
    setType('add');
    setEpiAmount('');
    setReason('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setUsersLoading(true);
    fetchRewardGroupedUsers(companyId)
      .then(setGroupedUsers)
      .catch((error: unknown) => {
        showError(getApiErrorMessage(error, 'Failed to load employees.'));
      })
      .finally(() => setUsersLoading(false));
  }, [companyId, open, showError]);

  const parsedAmount = useMemo(() => Number(epiAmount), [epiAmount]);

  const handleSubmit = useCallback(async () => {
    const trimmedReason = reason.trim();
    if (selectedUserIds.length === 0) {
      showError('Please select at least one employee.');
      return;
    }
    if (!epiAmount || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || Math.round(parsedAmount * 100) !== parsedAmount * 100) {
      showError('EPI amount must be a positive number with at most 2 decimal places.');
      return;
    }
    if (!trimmedReason) {
      showError('Please provide a reason for this EPI adjustment.');
      return;
    }

    const epiDelta = type === 'add' ? parsedAmount : -parsedAmount;

    setSubmitting(true);
    try {
      await createRewardRequest({
        companyId,
        body: {
          targetUserIds: selectedUserIds,
          epiDelta,
          reason: trimmedReason,
        },
      });
      showSuccess('EPI adjustment request submitted.');
      onClose();
      onSubmitted();
    } catch (error: unknown) {
      showError(getApiErrorMessage(error, 'Failed to submit EPI adjustment request.'));
    } finally {
      setSubmitting(false);
    }
  }, [companyId, onClose, onSubmitted, parsedAmount, reason, selectedUserIds, showError, showSuccess, type, epiAmount]);

  const isAdd = type === 'add';

  return (
    <AnimatePresence>
      {open && (
        <AnimatedModal maxWidth="max-w-lg" onBackdropClick={submitting ? undefined : onClose}>
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">EPI Adjustment</p>
              <p className="font-semibold text-gray-900">Create EPI Adjustment</p>
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

          <div className="px-5 pt-4">
            <ViewToggle
              options={TYPE_TABS}
              activeId={type}
              onChange={setType}
              layoutId="epi-adjustment-type-tab"
              labelAboveOnMobile
            />
          </div>

          <div className="space-y-4 px-5 py-4">
            <div className={`rounded-lg px-3.5 py-2.5 text-sm ${
              isAdd ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
            }`}>
              {isAdd
                ? 'Approval will apply this EPI increase to every selected employee.'
                : 'Approval will deduct this EPI amount from every selected employee.'}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Employees</label>
              <GroupedUserSelect
                groupedUsers={groupedUsers}
                selectedUserIds={selectedUserIds}
                onChange={setSelectedUserIds}
                loading={usersLoading}
                disabled={submitting}
                placeholder="Select employees..."
              />
            </div>

            <Input
              label="EPI Amount"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={epiAmount}
              onChange={(event) => setEpiAmount(event.target.value)}
              disabled={submitting}
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Reason</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={submitting}
                placeholder="Explain why this adjustment is needed..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 disabled:opacity-50"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-5 py-4">
            <Button type="button" variant="ghost" disabled={submitting} onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant={isAdd ? 'success' : 'danger'}
              disabled={submitting}
              onClick={() => void handleSubmit()}
            >
              {submitting
                ? 'Submitting...'
                : isAdd
                  ? 'Submit Addition'
                  : 'Submit Deduction'}
            </Button>
          </div>
        </AnimatedModal>
      )}
    </AnimatePresence>
  );
}
