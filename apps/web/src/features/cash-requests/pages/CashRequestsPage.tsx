import { useCallback, useEffect, useMemo, useState } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { canReviewSubmittedRequest, PERMISSIONS } from '@omnilert/shared';
import { ImagePreviewModal } from '@/features/case-reports/components/ImagePreviewModal';
import {
  AlertCircle, Banknote, Calendar, CircleCheck, ChevronRight,
  Clock, DollarSign, FileText, GitBranch, LayoutGrid, Paperclip,
  X, XCircle, Copy, Check,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ElementType } from 'react';

// ─── Constants ────────────────────────────────────────────────────────────────

const REQUEST_TYPE_LABELS: Record<string, string> = {
  salary_wage_request:   'Salary / Wage Request',
  cash_advance_request:  'Cash Advance Request',
  expense_reimbursement: 'Expense Reimbursement',
  training_allowance:    'Training Allowance',
  transport_allowance:   'Transport Allowance',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  approved:  'success',
  disbursed: 'success',
  rejected:  'danger',
};

type StatusTab = 'all' | 'pending' | 'approved' | 'disbursed' | 'rejected';

const STATUS_TABS: { id: StatusTab; label: string; icon: LucideIcon }[] = [
  { id: 'all',       label: 'All',       icon: LayoutGrid  },
  { id: 'pending',   label: 'Pending',   icon: Clock       },
  { id: 'approved',  label: 'Approved',  icon: CircleCheck },
  { id: 'disbursed', label: 'Disbursed', icon: Banknote    },
  { id: 'rejected',  label: 'Rejected',  icon: XCircle     },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusVariant(status: string): 'success' | 'danger' | 'warning' {
  return STATUS_VARIANT[status] ?? 'warning';
}

function fmtAmount(amount: string | number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount));
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function resolveAttachmentUrl(url: string): string {
  return url.startsWith('http') ? url : `${import.meta.env.VITE_API_URL}${url}`;
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CashRequestSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-3 w-28 rounded bg-gray-200" />
          <div className="h-3 w-20 rounded bg-gray-200" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────

type ConfirmModalState = {
  action: 'approve' | 'reject' | 'disburse';
  message: string;
  onConfirm: () => Promise<void>;
} | null;

interface DetailPanelProps {
  request: any;
  detailLoading: boolean;
  canReview: boolean;
  canDisburse: boolean;
  onClose: () => void;
  onUpdated: (updated: any) => void;
  onViewAttachment: (url: string) => void;
}

function DetailPanel({ request, detailLoading, canReview, canDisburse, onClose, onUpdated, onViewAttachment }: DetailPanelProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [loading, setLoading] = useState<'approve' | 'reject' | 'disburse' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>(null);
  const [copiedAccountNumber, setCopiedAccountNumber] = useState(false);

  const canAct = canReview && request.status === 'pending';
  const canDisburseAction = canDisburse && request.status === 'approved';
  const typeLabel = REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type;

  /**
   * Copy text to clipboard with a safe fallback for non-HTTPS local dev.
   * This avoids breaking copy in environments where `navigator.clipboard` is unavailable.
   */
  function copyToClipboard(text: string): void {
    const markCopied = () => {
      setCopiedAccountNumber(true);
      setTimeout(() => setCopiedAccountNumber(false), 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(markCopied).catch(() => {
        fallbackCopy(text, markCopied);
      });
      return;
    }

    fallbackCopy(text, markCopied);
  }

  /** Fallback clipboard copy via a temporary textarea and `document.execCommand("copy")`. */
  function fallbackCopy(text: string, onSuccess: () => void): void {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      if (document.execCommand("copy")) onSuccess();
    } finally {
      document.body.removeChild(el);
    }
  }

  /** Copy the request's bank account number (if present). */
  function handleCopyAccountNumber(): void {
    const accountNumber = typeof request.account_number === "string" ? request.account_number : "";
    if (!accountNumber) return;
    copyToClipboard(accountNumber);
  }

  async function handleApprove() {
    setLoading('approve');
    try {
      const res = await api.post(`/cash-requests/${request.id}/approve`);
      onUpdated(res.data.data);
      showSuccessToast('Cash request approved.');
    } catch (e: any) {
      showErrorToast(e?.response?.data?.error || e?.response?.data?.message || 'Failed to approve.');
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectText.trim()) { showErrorToast('Rejection reason is required.'); return; }
    setLoading('reject');
    try {
      const res = await api.post(`/cash-requests/${request.id}/reject`, { reason: rejectText });
      onUpdated(res.data.data);
      setRejectMode(false);
      setRejectText('');
      showSuccessToast('Cash request rejected.');
    } catch (e: any) {
      showErrorToast(e?.response?.data?.error || e?.response?.data?.message || 'Failed to reject.');
    } finally {
      setLoading(null);
    }
  }

  async function handleDisburse() {
    setLoading('disburse');
    try {
      const res = await api.post(`/cash-requests/${request.id}/disburse`);
      onUpdated(res.data.data);
      showSuccessToast('Cash request marked as disbursed.');
    } catch (e: any) {
      showErrorToast(e?.response?.data?.error || e?.response?.data?.message || 'Failed to disburse.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="flex h-full flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-primary-600" />
            <div>
              <h2 className="text-base font-semibold text-gray-900">{typeLabel}</h2>
              <p className="text-xs text-gray-500">{fmtDate(request.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant={statusVariant(request.status)}>
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        {detailLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : (
          <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
            {/* Rejection reason callout */}
            {request.status === 'rejected' && request.rejection_reason && (
              <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                <div>
                  <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
                  <p className="mt-0.5 text-sm text-red-600">{request.rejection_reason}</p>
                </div>
              </div>
            )}

            {/* Requester */}
            {request.created_by_name && (
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Requested By</h3>
                <p className="text-sm text-gray-800">{request.created_by_name}</p>
              </section>
            )}

            {/* Branch */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</h3>
              <div className="flex items-center gap-2 text-sm text-gray-800">
                <GitBranch className="h-4 w-4 shrink-0 text-gray-400" />
                <span>{request.branch_name ?? request.branch_id}</span>
              </div>
            </section>

            {/* Financial details */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Financial Details</h3>
              <dl className="space-y-3">
                {request.reference && (
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Reference</dt>
                      <dd className="text-sm font-medium text-gray-900">{request.reference}</dd>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Requested Amount</dt>
                    <dd className="text-sm font-semibold text-gray-900">{fmtAmount(request.amount)}</dd>
                  </div>
                </div>
                {(request.bank_name ?? request.account_name ?? request.account_number) && (
                  <div className="flex items-start gap-2">
                    <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Bank Account</dt>
                      <dd className="mt-0.5 space-y-0.5 text-sm text-gray-900">
                        {request.bank_name && <p>{request.bank_name}</p>}
                        {request.account_name && <p>{request.account_name}</p>}
                        {request.account_number && (
                          <div className="flex items-center gap-1.5">
                            <p className="font-mono text-xs text-gray-600">{request.account_number}</p>
                            <button
                              type="button"
                              onClick={handleCopyAccountNumber}
                              className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                              title="Copy account number"
                              aria-label="Copy account number"
                            >
                              {copiedAccountNumber
                                ? <Check className="h-3.5 w-3.5 text-green-500" />
                                : <Copy className="h-3.5 w-3.5" />
                              }
                            </button>
                          </div>
                        )}
                      </dd>
                    </div>
                  </div>
                )}
                {request.attachment_url && (
                  <div className="flex items-start gap-2">
                    <Paperclip className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Attachment</dt>
                      <dd className="mt-0.5">
                        <button
                          type="button"
                          onClick={() => onViewAttachment(resolveAttachmentUrl(request.attachment_url as string))}
                          className="text-sm font-medium text-primary-600 hover:underline"
                        >
                          View Receipt
                        </button>
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </section>

            {/* Timeline */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Timeline</h3>
              <dl className="space-y-3">
                <div className="flex items-start gap-2">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Submitted</dt>
                    <dd className="text-sm text-gray-900">{fmtDate(request.created_at)}</dd>
                  </div>
                </div>
                {request.reviewed_at && (
                  <div className="flex items-start gap-2">
                    <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">
                        {request.status === 'rejected' ? 'Rejected' : 'Reviewed'} by
                      </dt>
                      <dd className="text-sm text-gray-900">
                        {request.reviewed_by_name ?? '—'}
                        <span className="ml-2 text-xs text-gray-500">{fmtDate(request.reviewed_at)}</span>
                      </dd>
                    </div>
                  </div>
                )}
              </dl>
            </section>
          </div>
        )}

        {/* Footer actions */}
        {(canAct || canDisburseAction) && (
          <div className="border-t border-gray-200 px-6 py-4">
            {canAct && !rejectMode && (
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant="success"
                  disabled={loading !== null}
                  onClick={() => setConfirmModal({ action: 'approve', message: 'Confirm approval of this request?', onConfirm: handleApprove })}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <CircleCheck className="h-4 w-4" />
                    Approve
                  </span>
                </Button>
                <Button className="flex-1" variant="danger" disabled={loading !== null} onClick={() => setRejectMode(true)}>
                  <span className="flex items-center justify-center gap-1.5">
                    <XCircle className="h-4 w-4" />
                    Reject
                  </span>
                </Button>
              </div>
            )}
            {canAct && rejectMode && (
              <div className="space-y-3">
                <textarea
                  rows={2}
                  placeholder="Reason for rejection..."
                  value={rejectText}
                  onChange={(e) => setRejectText(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    variant="danger"
                    disabled={!rejectText.trim() || loading !== null}
                    onClick={() => setConfirmModal({ action: 'reject', message: `Reject with reason: "${rejectText.trim()}"?`, onConfirm: handleReject })}
                  >
                    Confirm Reject
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    disabled={loading !== null}
                    onClick={() => { setRejectMode(false); setRejectText(''); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
            {canDisburseAction && (
              <Button
                className="w-full"
                disabled={loading !== null}
                onClick={() => setConfirmModal({ action: 'disburse', message: 'Mark this request as disbursed?', onConfirm: handleDisburse })}
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Banknote className="h-4 w-4" />
                  Disburse
                </span>
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Confirm modal */}
      <AnimatePresence>
        {confirmModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={loading !== null ? undefined : () => setConfirmModal(null)}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {confirmModal.action === 'approve' ? 'Confirm Approval'
                  : confirmModal.action === 'reject' ? 'Confirm Rejection'
                  : 'Confirm Disbursement'}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant={
                  confirmModal.action === 'reject' ? 'danger'
                    : confirmModal.action === 'approve' ? 'success'
                    : 'primary'
                }
                disabled={loading !== null}
                onClick={async () => { await confirmModal.onConfirm(); setConfirmModal(null); }}
              >
                {loading !== null ? 'Processing…'
                  : confirmModal.action === 'approve' ? 'Approve'
                  : confirmModal.action === 'reject' ? 'Reject'
                  : 'Disburse'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={loading !== null}
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export function CashRequestsPage() {
  const PAGE_SIZE = 10;
  const { error: showErrorToast } = useAppToast();
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [page, setPage] = useState(1);

  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState<{ url: string; fileName: string }[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const { branches, selectedBranchIds } = useBranchStore();
  const { hasPermission } = usePermission();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const canApprove = hasPermission(PERMISSIONS.CASH_REQUESTS_MANAGE);

  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/cash-requests', {
        params: selectedBranchIds.length > 0 ? { branchIds: selectedBranchIds.join(',') } : {},
      });
      setRequests(res.data.data || []);
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to load cash requests');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchIds, showErrorToast]);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  async function openDetail(id: string) {
    setDetailLoading(true);
    const partial = requests.find((r) => r.id === id) ?? null;
    setSelectedRequest(partial);
    try {
      const res = await api.get(`/cash-requests/${id}`);
      setSelectedRequest(res.data.data);
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to load request details.');
    } finally {
      setDetailLoading(false);
    }
  }

  function handleUpdated(updated: any) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRequest(updated);
  }

  const filteredRequests = useMemo(() => {
    if (statusTab === 'all') return requests;
    return requests.filter((r) => r.status === statusTab);
  }, [requests, statusTab]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const pagedRequests = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const canReviewRequest = useCallback(
    (request: any) => canApprove && canReviewSubmittedRequest({
      actingUserId: currentUserId,
      requestUserId: request?.user_id,
    }),
    [canApprove, currentUserId],
  );

  useEffect(() => { setPage(1); }, [statusTab]);
  useEffect(() => { setPage((prev) => Math.min(prev, totalPages)); }, [totalPages]);

  return (
    <>
      <div className="space-y-5">
        {/* Header */}
        <div>
          <div className="flex items-center gap-3">
            <DollarSign className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Cash Requests</h1>
            {pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                {pendingCount}
              </span>
            )}
            {branchLabel && (
              <span className="mt-1 hidden text-sm font-medium text-primary-600 sm:inline">
                {branchLabel}
              </span>
            )}
          </div>
          {branchLabel && (
            <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
              {branchLabel}
            </p>
          )}

          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Review and act on employee cash request submissions.
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={(id) => { setStatusTab(id); setPage(1); }}
            layoutId="cash-request-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <CashRequestSkeleton key={i} />
            ))}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <DollarSign className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              {statusTab === 'all' ? 'No cash requests yet.' : `No ${statusTab} requests found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {pagedRequests.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => void openDetail(r.id)}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3.5 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Left: type, requester, branch, date */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-gray-900">
                      {REQUEST_TYPE_LABELS[r.request_type] ?? r.request_type}
                    </p>
                    {r.created_by_name && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{r.created_by_name}</p>
                    )}
                    {r.branch_name && (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-blue-600">
                        <GitBranch className="h-3 w-3 shrink-0" />
                        {r.branch_name}
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-400">{fmtDate(r.created_at)}</p>
                  </div>

                  {/* Right: badge + amount */}
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <Badge variant={statusVariant(r.status)}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </Badge>
                    <p className="text-sm font-semibold text-gray-800">{fmtAmount(r.amount)}</p>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
                </div>
              </button>
            ))}

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
                <span>Page {page} of {totalPages}</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page === totalPages}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attachment image modal */}
      <ImagePreviewModal
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewItems(null)}
      />

      {createPortal(
        <>
          <AnimatePresence>
            {selectedRequest && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => { setSelectedRequest(null); setDetailLoading(false); }}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedRequest && (
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] bg-white shadow-2xl"
              >
                <DetailPanel
                  request={selectedRequest}
                  detailLoading={detailLoading}
                  canReview={canReviewRequest(selectedRequest)}
                  canDisburse={canApprove}
                  onClose={() => { setSelectedRequest(null); setDetailLoading(false); }}
                  onUpdated={handleUpdated}
                  onViewAttachment={(url) => { setPreviewItems([{ url, fileName: 'receipt' }]); setPreviewIndex(0); }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
