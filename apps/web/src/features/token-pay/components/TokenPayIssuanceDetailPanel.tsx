import { useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { canReviewSubmittedRequest, PERMISSIONS } from '@omnilert/shared';
import type { TokenPayIssuanceRequest } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { approveIssuance, rejectIssuance } from '../services/tokenPayManagement.api';

function formatCurrency(value: number): string {
  return `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function statusVariant(status: TokenPayIssuanceRequest['status']): 'warning' | 'success' | 'danger' {
  if (status === 'pending') return 'warning';
  if (status === 'completed') return 'success';
  return 'danger';
}

function statusLabel(status: TokenPayIssuanceRequest['status']): string {
  if (status === 'pending') return 'Pending';
  if (status === 'completed') return 'Approved';
  return 'Rejected';
}

interface TokenPayIssuanceDetailPanelProps {
  request: TokenPayIssuanceRequest;
  onClose: () => void;
  onUpdated: (updated: TokenPayIssuanceRequest) => void;
}

export function TokenPayIssuanceDetailPanel({
  request,
  onClose,
  onUpdated,
}: TokenPayIssuanceDetailPanelProps) {
  const { hasPermission } = usePermission();
  const { success: showSuccess, error: showError } = useAppToast();
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);

  const canManage = hasPermission(PERMISSIONS.TOKEN_PAY_MANAGE);
  const canAct =
    canManage &&
    request.status === 'pending' &&
    canReviewSubmittedRequest({ actingUserId: currentUserId, requestUserId: request.issuedByUserId });

  const [actionLoading, setActionLoading] = useState<'approve' | 'reject' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const isCredit = request.type === 'credit';

  const handleApprove = async () => {
    setActionLoading('approve');
    try {
      await approveIssuance(request.id);
      showSuccess('Issuance request approved.');
      onUpdated({ ...request, status: 'completed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to approve.';
      showError(message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      showError('Rejection reason is required.');
      return;
    }
    setActionLoading('reject');
    try {
      await rejectIssuance(request.id, rejectReason.trim());
      showSuccess('Issuance request rejected.');
      onUpdated({ ...request, status: 'rejected', rejectionReason: rejectReason.trim() });
      setRejectMode(false);
      setRejectReason('');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to reject.';
      showError(message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Issuance Request</p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className={`font-semibold ${isCredit ? 'text-green-700' : 'text-red-700'}`}>
              {isCredit ? 'Token Issuance' : 'Token Deduction'}
            </p>
            <Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge>
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

      {/* Scrollable body */}
      <div className="flex flex-1 flex-col overflow-y-auto bg-gray-50">
        {/* Receipt */}
        <div className="mx-4 my-4 rounded-2xl bg-white shadow-sm ring-1 ring-gray-100">

          {/* Receipt top: avatar + name + amount */}
          <div className="flex flex-col items-center px-6 pb-5 pt-6 text-center">
            {request.userAvatarUrl ? (
              <img
                src={request.userAvatarUrl}
                alt={request.userName}
                className="h-16 w-16 rounded-full object-cover ring-4 ring-gray-100"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700 ring-4 ring-gray-100">
                {getInitials(request.userName)}
              </div>
            )}
            <p className="mt-3 text-xs font-medium uppercase tracking-widest text-gray-400">Target Employee</p>
            <p className="mt-0.5 text-lg font-bold text-gray-900">{request.userName}</p>

            {/* Amount */}
            <div className="mt-4 flex items-baseline gap-1">
              {isCredit
                ? <ArrowUpCircle className="mb-0.5 h-5 w-5 text-green-500" />
                : <ArrowDownCircle className="mb-0.5 h-5 w-5 text-red-500" />}
              <span className={`text-4xl font-extrabold tabular-nums ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                {isCredit ? '+' : '−'}{formatCurrency(request.amount)}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {isCredit ? 'Will be added to token pay wallet' : 'Will be deducted from token pay wallet'}
            </p>
          </div>

          {/* Dashed tear */}
          <div className="relative flex items-center px-4">
            <div className="absolute -left-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="absolute -right-3 h-6 w-6 rounded-full bg-gray-50 ring-1 ring-gray-100" />
            <div className="w-full border-t-2 border-dashed border-gray-100" />
          </div>

          {/* Receipt rows */}
          <div className="divide-y divide-dashed divide-gray-100 px-6 py-2">
            <div className="flex items-start justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Reason</span>
              <span className="max-w-[60%] text-right text-xs font-medium text-gray-700">{request.reason}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Requested By</span>
              <span className="truncate text-right text-xs font-medium text-gray-700">{request.issuedByName}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Date Submitted</span>
              <span className="text-right text-xs font-medium text-gray-700">{formatDate(request.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 py-2.5">
              <span className="text-xs text-gray-400">Status</span>
              <Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge>
            </div>
            {request.reviewedByName && (
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-xs text-gray-400">Reviewed By</span>
                <span className="truncate text-right text-xs font-medium text-gray-700">{request.reviewedByName}</span>
              </div>
            )}
            {request.reviewedAt && (
              <div className="flex items-center justify-between gap-4 py-2.5">
                <span className="text-xs text-gray-400">Reviewed At</span>
                <span className="text-right text-xs font-medium text-gray-700">{formatDate(request.reviewedAt)}</span>
              </div>
            )}
            {request.rejectionReason && (
              <div className="flex items-start justify-between gap-4 py-2.5">
                <span className="shrink-0 text-xs text-gray-400">Rejection Reason</span>
                <span className="text-right text-xs font-medium text-red-600">{request.rejectionReason}</span>
              </div>
            )}
          </div>

          {/* Receipt bottom fade */}
          <div className="h-4" />
        </div>
      </div>

      {/* Footer actions */}
      {canAct && (
        <div className="border-t border-gray-200 px-6 py-4">
          {!rejectMode ? (
            <div className="flex gap-3">
              <Button
                type="button"
                variant="success"
                className="flex-1"
                disabled={actionLoading !== null}
                onClick={() => void handleApprove()}
              >
                {actionLoading === 'approve' ? 'Processing…' : 'Approve'}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="flex-1"
                disabled={actionLoading !== null}
                onClick={() => setRejectMode(true)}
              >
                Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <textarea
                rows={2}
                placeholder="Reason for rejection…"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="danger"
                  className="flex-1"
                  disabled={!rejectReason.trim() || actionLoading !== null}
                  onClick={() => void handleReject()}
                >
                  {actionLoading === 'reject' ? 'Processing…' : 'Confirm Reject'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  disabled={actionLoading !== null}
                  onClick={() => { setRejectMode(false); setRejectReason(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
