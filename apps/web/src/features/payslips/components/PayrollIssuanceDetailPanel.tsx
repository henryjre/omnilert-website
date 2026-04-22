import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { GroupedUsersResponse, UpdatePayrollAdjustmentProcessingInput } from '@omnilert/shared';
import { FileText, Users, X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PayrollEmployeeMultiSelect } from './PayrollEmployeeMultiSelect';
import {
  calculatePayrollSplit,
  formatPayrollRequestCurrency,
  formatPayrollRequestDate,
  getPayrollAdjustmentActionLabel,
  getPayrollEmployeeInitials,
  getPayrollRequestStatusLabel,
  getPayrollRequestStatusVariant,
  getPayrollRequestTypeLabel,
  type PayrollRequestDetailRecord,
} from './payrollIssuance.shared';

interface PayrollIssuanceDetailPanelProps {
  request: PayrollRequestDetailRecord;
  groupedUsers: GroupedUsersResponse | null;
  groupedUsersLoading?: boolean;
  actionLoading?: boolean;
  onClose: () => void;
  onConfirm?: () => void;
  onApprove?: (payload: UpdatePayrollAdjustmentProcessingInput) => void;
  onReject?: (reason: string) => void;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="max-w-[62%] text-right text-xs font-medium text-gray-700">{value}</div>
    </div>
  );
}

function TargetAvatarStack({
  targets,
}: {
  targets: PayrollRequestDetailRecord['targets'];
}) {
  const visibleTargets = targets.slice(0, 3);
  const overflow = targets.length > 3 ? targets.length - 3 : 0;
  const avatarSizeClassName = targets.length > 1 ? 'h-14 w-14' : 'h-16 w-16';
  const overlapClassName = targets.length > 1 ? '-ml-3' : '';

  return (
    <div className="flex items-center justify-center">
      {visibleTargets.map((target, index) => (
        <div
          key={target.id}
          className={`${index > 0 ? overlapClassName : ''} ${avatarSizeClassName} flex items-center justify-center overflow-hidden rounded-full bg-primary-100 text-sm font-semibold text-primary-700 ring-4 ring-white shadow-sm`}
        >
          {target.employeeAvatarUrl?.trim() ? (
            <img
              src={target.employeeAvatarUrl}
              alt={target.employeeName}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            getPayrollEmployeeInitials(target.employeeName)
          )}
        </div>
      ))}
      {overflow > 0 ? (
        <div className="-ml-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 ring-4 ring-white shadow-sm">
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}

export function PayrollIssuanceDetailPanel({
  request,
  groupedUsers,
  groupedUsersLoading = false,
  actionLoading = false,
  onClose,
  onConfirm,
  onApprove,
  onReject,
}: PayrollIssuanceDetailPanelProps) {
  const { error: showError } = useAppToast();
  const isIssuance = request.type === 'issuance';
  const isProcessingEditable = Boolean(onApprove);
  const canReject = Boolean(onReject);
  const fieldShellClassName =
    'group rounded-xl border border-gray-200 bg-white px-4 py-2.5 transition-all hover:border-blue-400 hover:shadow-sm focus-within:border-blue-400 focus-within:shadow-sm focus-within:ring-2 focus-within:ring-blue-500/20';

  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(request.targets.map((target) => target.userId));
  const [draftAmount, setDraftAmount] = useState(String(request.totalAmount));
  const [draftPayrollPeriods, setDraftPayrollPeriods] = useState(String(request.payrollPeriods));
  const [rejectionReason, setRejectionReason] = useState(request.rejectionReason ?? '');
  const [rejectMode, setRejectMode] = useState(false);

  useEffect(() => {
    setSelectedUserIds(request.targets.map((target) => target.userId));
    setDraftAmount(String(request.totalAmount));
    setDraftPayrollPeriods(String(request.payrollPeriods));
    setRejectionReason(request.rejectionReason ?? '');
    setRejectMode(false);
  }, [request]);

  const parsedAmount = Number.parseFloat(draftAmount);
  const parsedPayrollPeriods = Math.max(1, Number.parseInt(draftPayrollPeriods, 10) || 1);

  const draftAllocations = useMemo(
    () =>
      Number.isFinite(parsedAmount) && parsedAmount > 0 && selectedUserIds.length > 0
        ? calculatePayrollSplit(parsedAmount, selectedUserIds.length, parsedPayrollPeriods)
        : [],
    [parsedAmount, selectedUserIds.length, parsedPayrollPeriods],
  );
  const selectableUsersById = useMemo(() => {
    if (!groupedUsers) return new Map<string, string>();
    return new Map(
      [...groupedUsers.management, ...groupedUsers.service_crew, ...groupedUsers.other].map(
        (user) => [user.id, user.name],
      ),
    );
  }, [groupedUsers]);

  const firstDraftAllocation = draftAllocations[0] ?? null;
  const actionLabel = getPayrollAdjustmentActionLabel(request.type);
  const noteSubject = selectedUserIds.length > 1 ? 'Each selected employee' : 'This employee';

  const handleReject = () => {
    const trimmedReason = rejectionReason.trim();
    if (!trimmedReason) {
      showError('Rejection reason is required.');
      return;
    }
    onReject?.(trimmedReason);
  };

  const handleApprove = () => {
    if (selectedUserIds.length === 0) {
      showError('Please select at least one employee.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      showError('Please enter a valid amount greater than 0.');
      return;
    }
    if (!Number.isInteger(parsedPayrollPeriods) || parsedPayrollPeriods <= 0) {
      showError('Payroll periods must be at least 1.');
      return;
    }

    onApprove?.({
      targetUserIds: selectedUserIds,
      totalAmount: parsedAmount,
      payrollPeriods: parsedPayrollPeriods,
    });
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Payroll Adjustment</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`font-semibold ${isIssuance ? 'text-green-700' : 'text-red-700'}`}>
              {getPayrollRequestTypeLabel(request.type)}
            </p>
            <Badge variant={getPayrollRequestStatusVariant(request.status)}>
              {getPayrollRequestStatusLabel(request.status)}
            </Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Close panel"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-y-auto bg-gray-50">
        <div className="mx-4 my-4 rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">
          <div className="flex flex-col items-center px-6 pb-5 pt-6 text-center">
            <div className="rounded-full bg-gray-50 p-1 ring-4 ring-gray-100">
              <TargetAvatarStack targets={request.targets} />
            </div>
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-gray-400">
              Target Employees
            </p>
            <div className="mt-1 flex items-center gap-2">
              <Users className="h-4 w-4 text-gray-400" />
              <p className="text-lg font-bold text-gray-900">
                {request.targets.length > 1
                  ? 'Multiple Employees'
                  : request.targets[0]?.employeeName ?? 'Unknown Employee'}
              </p>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {request.targets.length} employee{request.targets.length === 1 ? '' : 's'} in{' '}
              {request.branchName}
            </p>

            <div className="mt-4 flex items-baseline gap-1">
              <span
                className={`text-4xl font-extrabold tabular-nums ${
                  isIssuance ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {isIssuance ? '+' : '−'}
                {formatPayrollRequestCurrency(
                  isProcessingEditable && Number.isFinite(parsedAmount) && parsedAmount > 0
                    ? parsedAmount
                    : request.totalAmount,
                )}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {isIssuance
                ? 'This amount will be added as a payroll adjustment.'
                : 'This amount will be deducted as a payroll adjustment.'}
            </p>
          </div>

          <div className="relative flex items-center px-4">
            <div className="absolute -left-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="absolute -right-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="w-full border-t-2 border-dashed border-gray-100" />
          </div>

          <div className="divide-y divide-dashed divide-gray-100 px-6 py-2">
            <DetailRow label="Reason" value={request.reason} />
            <DetailRow label="Company" value={request.companyName} />
            <DetailRow label="Branch" value={request.branchName} />
            <DetailRow label="Issuer" value={request.createdByName} />
            <DetailRow label="Date Submitted" value={formatPayrollRequestDate(request.createdAt, 'long')} />
            <DetailRow
              label="Payroll Periods"
              value={isProcessingEditable ? parsedPayrollPeriods : request.payrollPeriods}
            />
            {request.processingOwnerName ? (
              <DetailRow label="Confirmed By" value={request.processingOwnerName} />
            ) : null}
            {request.confirmedAt ? (
              <DetailRow label="Confirmed At" value={formatPayrollRequestDate(request.confirmedAt, 'long')} />
            ) : null}
            {request.approvedAt ? (
              <DetailRow label="Approved At" value={formatPayrollRequestDate(request.approvedAt, 'long')} />
            ) : null}
            {request.rejectedAt ? (
              <DetailRow label="Rejected At" value={formatPayrollRequestDate(request.rejectedAt, 'long')} />
            ) : null}
            {request.rejectionReason ? (
              <DetailRow label="Rejection Reason" value={request.rejectionReason} />
            ) : null}
          </div>

          {isProcessingEditable ? (
            <div className="space-y-4 border-t border-dashed border-gray-100 px-6 py-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Employees Involved
                </label>
                <PayrollEmployeeMultiSelect
                  groupedUsers={groupedUsers}
                  selectedUserIds={selectedUserIds}
                  onChange={setSelectedUserIds}
                  loading={groupedUsersLoading}
                  disabled={actionLoading}
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Total Amount (₱)
                </label>
                <div className={fieldShellClassName}>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draftAmount}
                    onChange={(event) => setDraftAmount(event.target.value)}
                    disabled={actionLoading}
                    className="w-full border-none bg-transparent py-1 text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Payroll Periods
                </label>
                <div className={fieldShellClassName}>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draftPayrollPeriods}
                    onChange={(event) => setDraftPayrollPeriods(event.target.value)}
                    disabled={actionLoading}
                    className="w-full border-none bg-transparent py-1 text-sm font-semibold text-gray-800 placeholder:text-gray-400 focus:outline-none"
                  />
                </div>
              </div>

              {parsedPayrollPeriods > 1 && firstDraftAllocation ? (
                <div className="rounded-xl border border-blue-100 bg-blue-50 px-3.5 py-3 text-sm text-blue-800">
                  {noteSubject} will be {actionLabel} {formatPayrollRequestCurrency(firstDraftAllocation.allocatedMonthlyAmount)} for {parsedPayrollPeriods} payslip periods.
                </div>
              ) : null}

              <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div className="mb-2 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-gray-400" />
                  <p className="text-sm font-semibold text-gray-700">Per Employee Allocation</p>
                </div>
                <div className="space-y-2">
                  {selectedUserIds.map((userId, index) => {
                      const allocation = draftAllocations[index];
                      if (!allocation) return null;
                      const existingTarget = request.targets.find((target) => target.userId === userId);
                      const label = existingTarget?.employeeName ?? selectableUsersById.get(userId) ?? 'Employee';

                      return (
                        <div
                          key={userId}
                          className="flex items-center justify-between gap-3 text-xs text-gray-600"
                        >
                          <span className="truncate">{label}</span>
                          <span className="shrink-0 font-semibold text-gray-800">
                            {formatPayrollRequestCurrency(allocation.allocatedTotalAmount)}
                          </span>
                        </div>
                      );
                    })}
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-3 border-t border-dashed border-gray-100 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-700">Employees</p>
              <span className="text-xs text-gray-400">
                {request.targets.length} employee{request.targets.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="space-y-2">
              {request.targets.map((target) => (
                <div
                  key={target.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {target.employeeName}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatPayrollRequestCurrency(target.allocatedTotalAmount)}
                      {request.payrollPeriods > 1
                        ? ` · ${formatPayrollRequestCurrency(target.allocatedMonthlyAmount)} / period`
                        : ''}
                    </p>
                  </div>
                  <Badge variant={getPayrollRequestStatusVariant(target.status)}>
                    {getPayrollRequestStatusLabel(target.status)}
                  </Badge>
                </div>
              ))}
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>

      {onConfirm || onApprove ? (
        <div className="border-t border-gray-200 px-6 py-4">
          {canReject && rejectMode ? (
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Rejection Reason
              </label>
              <textarea
                rows={3}
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                disabled={actionLoading}
                placeholder="Required if you reject this request..."
                className="min-h-[84px] w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          ) : null}

          {rejectMode ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="secondary"
                className="w-full"
                disabled={actionLoading}
                onClick={() => setRejectMode(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={actionLoading}
                onClick={handleReject}
              >
                Reject
              </Button>
            </div>
          ) : onConfirm ? (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={actionLoading}
                onClick={() => setRejectMode(true)}
              >
                Reject
              </Button>
              <Button
                type="button"
                variant="success"
                className="w-full"
                disabled={actionLoading}
                onClick={onConfirm}
              >
                Confirm
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={actionLoading}
                onClick={() => setRejectMode(true)}
              >
                Reject
              </Button>
              <Button
                type="button"
                variant="success"
                className="w-full"
                disabled={actionLoading}
                onClick={handleApprove}
              >
                Approve
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
