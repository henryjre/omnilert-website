import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Users, X } from 'lucide-react';
import { canReviewSubmittedRequest, PERMISSIONS } from '@omnilert/shared';
import type { RewardRequestDetail } from '@omnilert/shared';
import { Badge } from '@/shared/components/ui/Badge';
import { LinkedReason } from '@/shared/components/ui/LinkedReason';
import { Button } from '@/shared/components/ui/Button';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { approveRewardRequest, rejectRewardRequest } from '../services/epiAdjustments.api';
import {
  formatRewardDate,
  formatSignedEpiDelta,
  getApiErrorMessage,
  getInitials,
  rewardStatusLabel,
  rewardStatusVariant,
} from './epiAdjustmentFormatters';

interface EpiAdjustmentDetailPanelProps {
  request: RewardRequestDetail;
  onClose: () => void;
  onUpdated: (updated: RewardRequestDetail) => void;
}

function TargetAvatarStack({ targets }: { targets: RewardRequestDetail['targets'] }) {
  const visibleTargets = targets.slice(0, 3);
  const overflow = targets.length > 3 ? targets.length - 3 : 0;
  const sizeClass = targets.length > 1 ? 'h-14 w-14' : 'h-16 w-16';
  const overlapClass = targets.length > 1 ? '-ml-3' : '';

  return (
    <div className="flex items-center justify-center">
      {visibleTargets.map((target, index) => (
        <div
          key={target.id}
          className={`${index > 0 ? overlapClass : ''} ${sizeClass} flex items-center justify-center overflow-hidden rounded-full bg-primary-100 text-sm font-semibold text-primary-700 ring-4 ring-white shadow-sm`}
        >
          {target.employeeAvatarUrl ? (
            <img
              src={target.employeeAvatarUrl}
              alt={target.employeeName}
              className="h-full w-full object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            getInitials(target.employeeName)
          )}
        </div>
      ))}
      {overflow > 0 && (
        <div className="-ml-3 flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600 ring-4 ring-white shadow-sm">
          +{overflow}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-xs text-gray-400">{label}</span>
      <div className="max-w-[62%] text-right text-xs font-medium text-gray-700">{value}</div>
    </div>
  );
}

export function EpiAdjustmentDetailPanel({ request, onClose, onUpdated }: EpiAdjustmentDetailPanelProps) {
  const { hasPermission } = usePermission();
  const queryClient = useQueryClient();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { success: showSuccess, error: showError } = useAppToast();
  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const canAct =
    hasPermission(PERMISSIONS.REWARDS_MANAGE) &&
    request.status === 'pending' &&
    canReviewSubmittedRequest({ actingUserId: currentUserId, requestUserId: request.createdByUserId });

  const isPositive = request.epiDelta >= 0;

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      const updated = await approveRewardRequest(request.id, request.companyId);
      showSuccess('EPI adjustment approved.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['epi-dashboard'] }),
        queryClient.invalidateQueries({ queryKey: ['epi-leaderboard-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['epi-leaderboard-detail'] }),
      ]);
      onUpdated(updated);
    } catch (error: unknown) {
      showError(getApiErrorMessage(error, 'Failed to approve EPI adjustment request.'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    const reason = rejectReason.trim();
    if (!reason) {
      showError('Rejection reason is required.');
      return;
    }
    setActionLoading('reject');
    try {
      const updated = await rejectRewardRequest(request.id, reason, request.companyId);
      showSuccess('EPI adjustment rejected.');
      setRejectMode(false);
      setRejectReason('');
      onUpdated(updated);
    } catch (error: unknown) {
      showError(getApiErrorMessage(error, 'Failed to reject EPI adjustment request.'));
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">EPI Adjustment</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`font-semibold ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
              {isPositive ? 'Add' : 'Deduct'}
            </p>
            <Badge variant={rewardStatusVariant(request.status)}>
              {rewardStatusLabel(request.status)}
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
                {request.targetCount > 1 ? 'Multiple Employees' : (request.targets[0]?.employeeName ?? 'Unknown Employee')}
              </p>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {request.targetCount} employee{request.targetCount === 1 ? '' : 's'}
            </p>

            <div className="mt-4 flex items-baseline gap-1">
              <span className={`text-4xl font-extrabold tabular-nums ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {formatSignedEpiDelta(request.epiDelta)} EPI
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {isPositive
                ? 'This EPI amount will be added to every employee upon approval.'
                : 'This EPI amount will be deducted from every employee upon approval.'}
            </p>
          </div>

          <div className="relative flex items-center px-4">
            <div className="absolute -left-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="absolute -right-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="w-full border-t-2 border-dashed border-gray-100" />
          </div>

          <div className="divide-y divide-dashed divide-gray-100 px-6 py-2">
            <DetailRow label="Reason" value={<LinkedReason value={request.reason ?? ''} className="text-right" />} />
            <DetailRow label="Requested By" value={request.createdByName || 'Unknown'} />
            <DetailRow label="Submitted" value={formatRewardDate(request.createdAt)} />
            {request.reviewedByName && <DetailRow label="Reviewed By" value={request.reviewedByName} />}
            {request.reviewedAt && <DetailRow label="Reviewed" value={formatRewardDate(request.reviewedAt)} />}
            {request.rejectionReason && (
              <DetailRow
                label="Rejection Reason"
                value={<span className="text-red-600">{request.rejectionReason}</span>}
              />
            )}
          </div>

          <div className="space-y-3 border-t border-dashed border-gray-100 px-6 py-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-gray-700">Employees</p>
              <span className="text-xs text-gray-400">{request.targets.length} total</span>
            </div>
            <div className="space-y-2">
              {request.targets.map((target) => (
                <div
                  key={target.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-800">{target.employeeName}</p>
                    {target.appliedAt ? (
                      <p className="mt-0.5 text-xs text-gray-400">
                        {target.epiBefore?.toFixed(2) ?? '-'} → {target.epiAfter?.toFixed(2) ?? '-'} EPI
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-gray-400">Awaiting approval</p>
                    )}
                  </div>
                  {target.epiDelta !== null ? (
                    <span className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${
                      (target.epiDelta ?? 0) >= 0
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-700'
                    }`}>
                      {formatSignedEpiDelta(target.epiDelta ?? 0)}
                    </span>
                  ) : (
                    <Badge variant="warning">Pending</Badge>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="h-4" />
        </div>
      </div>

      {canAct && (
        <div className="border-t border-gray-200 px-6 py-4">
          {rejectMode ? (
            <div className="mb-3">
              <label className="mb-1 block text-sm font-medium text-gray-700">Rejection Reason</label>
              <textarea
                rows={3}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                disabled={actionLoading !== null}
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
                disabled={actionLoading !== null}
                onClick={() => setRejectMode(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={actionLoading !== null}
                onClick={() => void handleReject()}
              >
                Reject
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="danger"
                className="w-full"
                disabled={actionLoading !== null}
                onClick={() => setRejectMode(true)}
              >
                Reject
              </Button>
              <Button
                type="button"
                variant="success"
                className="w-full"
                disabled={actionLoading !== null}
                onClick={() => void handleApprove()}
              >
                Approve
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
