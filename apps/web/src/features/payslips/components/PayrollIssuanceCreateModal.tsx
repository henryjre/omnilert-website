import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import type { GroupedUsersResponse } from '@omnilert/shared';
import type { SelectorCompanyGroup } from '@/shared/components/branchSelectorState';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useAppToast } from '@/shared/hooks/useAppToast';
import {
  createPayrollAdjustmentRequest,
  fetchPayrollBranchUsers,
} from '@/features/payslips/services/payrollManagement.api';
import { PayrollEmployeeMultiSelect } from './PayrollEmployeeMultiSelect';
import { PayrollBranchSelect } from './PayrollBranchSelect';
import type {
  PayrollBranchOption,
  PayrollRequestType,
} from './payrollIssuance.shared';

const TYPE_TABS = [
  {
    id: 'issuance' as PayrollRequestType,
    label: 'Issuance',
    icon: ArrowUpCircle,
    activeClassName: 'text-green-700',
    activeIndicatorClassName: 'bg-green-600',
    inactiveClassName: 'text-gray-500 hover:text-gray-700',
  },
  {
    id: 'deduction' as PayrollRequestType,
    label: 'Deduction',
    icon: ArrowDownCircle,
    activeClassName: 'text-red-700',
    activeIndicatorClassName: 'bg-red-600',
    inactiveClassName: 'text-gray-500 hover:text-gray-700',
  },
];

interface PayrollIssuanceCreateModalProps {
  open: boolean;
  branches: PayrollBranchOption[];
  branchGroups: SelectorCompanyGroup[];
  onClose: () => void;
  onSubmitted: (created: { id: string; companyId: string }) => void;
}

function DisabledEmployeeSelect({ placeholder }: { placeholder: string }) {
  return (
    <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-left opacity-70">
      <span className="block text-sm font-medium text-gray-400">{placeholder}</span>
    </div>
  );
}

export function PayrollIssuanceCreateModal({
  open,
  branches,
  branchGroups,
  onClose,
  onSubmitted,
}: PayrollIssuanceCreateModalProps) {
  const { error: showError, success: showSuccess } = useAppToast();

  const [type, setType] = useState<PayrollRequestType>('deduction');
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersByBranchId, setUsersByBranchId] = useState<Record<string, GroupedUsersResponse>>({});

  useEffect(() => {
    if (!open) return;
    setType('deduction');
    setSelectedBranchId('');
    setSelectedEmployeeIds([]);
    setAmount('');
    setReason('');
    setSubmitting(false);
    setGroupedUsers(null);
    setUsersLoading(false);
  }, [open]);

  useEffect(() => {
    if (!open || !selectedBranchId) {
      setGroupedUsers(null);
      setUsersLoading(false);
      return;
    }

    const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
    if (!selectedBranch) {
      setGroupedUsers(null);
      setUsersLoading(false);
      return;
    }

    const cached = usersByBranchId[selectedBranchId];
    if (cached) {
      setGroupedUsers(cached);
      return;
    }

    let active = true;
    setUsersLoading(true);

    void fetchPayrollBranchUsers({
      branchId: selectedBranchId,
      companyId: selectedBranch.companyId,
    })
      .then((response) => {
        if (!active) return;
        setUsersByBranchId((prev) => ({ ...prev, [selectedBranchId]: response }));
        setGroupedUsers(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Failed to load branch users.';
        showError(message);
        setGroupedUsers({ management: [], service_crew: [], other: [] });
      })
      .finally(() => {
        if (active) setUsersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, selectedBranchId, branches, usersByBranchId, showError]);

  const selectedBranch = branches.find((branch) => branch.id === selectedBranchId) ?? null;
  const hasBranches = branches.length > 0;
  const isIssuance = type === 'issuance';
  const fieldShellClassName =
    'group rounded-xl border border-gray-200 bg-white px-4 py-2.5 transition-all hover:border-blue-400 hover:shadow-sm focus-within:border-blue-400 focus-within:shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20';

  const selectedUsers = useMemo(() => {
    if (!groupedUsers) return [];
    return [
      ...groupedUsers.management,
      ...groupedUsers.service_crew,
      ...groupedUsers.other,
    ].filter((user) => selectedEmployeeIds.includes(user.id));
  }, [groupedUsers, selectedEmployeeIds]);

  const handleSubmit = async () => {
    const trimmedReason = reason.trim();
    const parsedAmount = Number.parseFloat(amount);

    if (!hasBranches) {
      showError('No selected branches are available for this request.');
      return;
    }
    if (!selectedBranch) {
      showError('Please select a branch.');
      return;
    }
    if (selectedUsers.length === 0) {
      showError('Please select at least one employee.');
      return;
    }
    if (!amount || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      showError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!trimmedReason) {
      showError('Please provide a reason.');
      return;
    }

    setSubmitting(true);

    try {
      const created = await createPayrollAdjustmentRequest({
        companyId: selectedBranch.companyId,
        payload: {
          branchId: selectedBranch.id,
          targetUserIds: selectedEmployeeIds,
          type,
          totalAmount: parsedAmount,
          reason: trimmedReason,
          payrollPeriods: 1,
        },
      });

      onSubmitted({ id: created.id, companyId: selectedBranch.companyId });
      showSuccess(
        `${selectedUsers.length} ${isIssuance ? 'issuance' : 'deduction'} request${selectedUsers.length === 1 ? '' : 's'} submitted.`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to create payroll adjustment request.';
      showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open ? (
        <AnimatedModal
          maxWidth="max-w-lg"
          onBackdropClick={submitting ? undefined : onClose}
        >
          <div className="relative flex max-h-[88vh] flex-col overflow-hidden sm:max-h-[80vh]">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3.5 sm:px-5 sm:py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-500">Payroll</p>
                <p className="font-semibold text-gray-900">Create Adjustment Request</p>
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

            <div className="px-4 pt-3 sm:px-5 sm:pt-4">
              <ViewToggle
                options={TYPE_TABS}
                activeId={type}
                onChange={setType}
                layoutId="payroll-issue-modal-type-tab"
                labelAboveOnMobile
              />
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
              <div
                className={`rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                  isIssuance ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
                }`}
              >
                {isIssuance
                  ? 'The approved amount will be added as a payroll adjustment for the selected employee.'
                  : 'The approved amount will be deducted as a payroll adjustment for the selected employee.'}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Branch
                </label>
                <PayrollBranchSelect
                  groups={branchGroups}
                  selectedBranchId={selectedBranchId}
                  onSelect={(branchId) => {
                    setSelectedBranchId(branchId);
                    setSelectedEmployeeIds([]);
                  }}
                  disabled={submitting || !hasBranches}
                  placeholder={
                    hasBranches ? 'Select a branch...' : 'No selected branches available'
                  }
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Target Employees
                </label>
                {selectedBranchId ? (
                  <PayrollEmployeeMultiSelect
                    groupedUsers={groupedUsers}
                    selectedUserIds={selectedEmployeeIds}
                    onChange={setSelectedEmployeeIds}
                    loading={usersLoading}
                    disabled={submitting}
                    placeholder="Select employee(s)..."
                  />
                ) : (
                  <DisabledEmployeeSelect placeholder="Select a branch first..." />
                )}
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Amount (₱)
                </label>
                <div className={fieldShellClassName}>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    disabled={submitting}
                    className="w-full border-none bg-transparent py-1 text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Reason
                </label>
                <div className={fieldShellClassName}>
                  <textarea
                    rows={4}
                    placeholder="Explain why this adjustment is needed..."
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={submitting}
                    className="min-h-[104px] w-full resize-none border-none bg-transparent py-1 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 border-t border-gray-200 px-4 py-3 sm:gap-3 sm:px-5 sm:py-4">
              <Button
                type="button"
                variant="ghost"
                disabled={submitting}
                onClick={onClose}
                className="min-w-0 flex-1"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant={isIssuance ? 'success' : 'danger'}
                disabled={submitting}
                onClick={() => void handleSubmit()}
                className="min-w-0 flex-1"
              >
                {isIssuance ? 'Submit Issuance' : 'Submit Deduction'}
              </Button>
            </div>
          </div>
        </AnimatedModal>
      ) : null}
    </AnimatePresence>
  );
}
