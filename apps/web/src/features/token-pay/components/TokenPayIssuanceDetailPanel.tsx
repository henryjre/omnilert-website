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
      <div className="flex flex-1 flex-col overflow-y-auto">
        {/* Hero: target user + amount */}
        <div
          className="px-6 py-5"
          style={{
            background: isCredit
              ? 'linear-gradient(145deg, #14532d 0%, #166534 50%, #15803d 100%)'
              : 'linear-gradient(145deg, #450a0a 0%, #7f1d1d 50%, #991b1b 100%)',
          }}
        >
          <div className="flex items-center gap-3">
            {request.userAvatarUrl ? (
              <img
                src={request.userAvatarUrl}
                alt={request.userName}
                className="h-14 w-14 shrink-0 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white/20 text-base font-bold text-white ring-2 ring-white/20">
                {getInitials(request.userName)}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-white/80 text-sm">Target Employee</p>
              <p className="truncate text-lg font-bold text-white">{request.userName}</p>
            </div>
          </div>

          <div className="mt-4 flex items-baseline gap-1.5">
            <span className="text-lg font-semibold" style={{ color: isCredit ? 'rgba(134,239,172,0.7)' : 'rgba(252,165,165,0.7)' }}>
              {isCredit ? '+' : '−'}
            </span>
            <span
              className="text-4xl font-extrabold tabular-nums leading-none"
              style={{ color: isCredit ? '#86efac' : '#fca5a5' }}
            >
              {formatCurrency(request.amount)}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-2">
            {isCredit ? (
              <ArrowUpCircle className="h-4 w-4 shrink-0 text-green-300" />
            ) : (
              <ArrowDownCircle className="h-4 w-4 shrink-0 text-red-300" />
            )}
            <p className="text-sm" style={{ color: isCredit ? 'rgba(134,239,172,0.75)' : 'rgba(252,165,165,0.75)' }}>
              {isCredit ? 'Will be added to wallet' : 'Will be deducted from wallet'}
            </p>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 py-5 space-y-4">
          {/* Reason */}
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Reason</p>
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-sm text-gray-700 leading-relaxed">{request.reason}</p>
            </div>
          </div>

          {/* Detail rows */}
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Details</p>
            <div className="divide-y divide-gray-100 rounded-xl border border-gray-100 bg-white px-4">
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="shrink-0 text-xs font-medium text-gray-400">Requested By</span>
                <span className="truncate text-right text-sm font-medium text-gray-700">{request.issuedByName}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="shrink-0 text-xs font-medium text-gray-400">Date Submitted</span>
                <span className="truncate text-right text-sm font-medium text-gray-700">{formatDate(request.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 py-3">
                <span className="shrink-0 text-xs font-medium text-gray-400">Status</span>
                <Badge variant={statusVariant(request.status)}>{statusLabel(request.status)}</Badge>
              </div>
              {request.reviewedByName && (
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="shrink-0 text-xs font-medium text-gray-400">Reviewed By</span>
                  <span className="truncate text-right text-sm font-medium text-gray-700">{request.reviewedByName}</span>
                </div>
              )}
              {request.reviewedAt && (
                <div className="flex items-center justify-between gap-4 py-3">
                  <span className="shrink-0 text-xs font-medium text-gray-400">Reviewed At</span>
                  <span className="truncate text-right text-sm font-medium text-gray-700">{formatDate(request.reviewedAt)}</span>
                </div>
              )}
              {request.rejectionReason && (
                <div className="flex items-start justify-between gap-4 py-3">
                  <span className="shrink-0 text-xs font-medium text-gray-400">Rejection Reason</span>
                  <span className="text-right text-sm font-medium text-red-600">{request.rejectionReason}</span>
                </div>
              )}
            </div>
          </div>
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
