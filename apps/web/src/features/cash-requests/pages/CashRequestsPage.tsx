import { useCallback, useEffect, useState } from 'react';
import { CheckCircle, DollarSign, Paperclip, X, XCircle } from 'lucide-react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { ImageModal } from '@/features/pos-verification/components/ImageModal';

// --- Constants ---

const REQUEST_TYPE_LABELS: Record<string, string> = {
  salary_wage_request: 'Salary/Wage Request',
  cash_advance_request: 'Cash Advance Request',
  expense_reimbursement: 'Expense Reimbursement',
  training_allowance: 'Training Allowance',
  transport_allowance: 'Transport Allowance',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'info' | 'default'> = {
  approved: 'success',
  rejected: 'danger',
  pending: 'warning',
  disbursed: 'info',
};

type StatusTab = 'all' | 'pending' | 'approved' | 'disbursed' | 'rejected';

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'disbursed', label: 'Disbursed' },
  { key: 'rejected', label: 'Rejected' },
];

function fmtAmount(amount: string | number | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// --- Request Card ---

function CashRequestCard({ request, onClick }: { request: any; onClick: () => void }) {
  return (
    <div
      className="cursor-pointer rounded-xl transition-shadow hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <Card>
        <CardBody>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">
                {REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type ?? 'Cash Request'}
              </p>
              {request.created_by_name && (
                <p className="mt-0.5 text-xs text-blue-600">{request.created_by_name}</p>
              )}
              {request.reference && (
                <p className="mt-0.5 text-xs text-gray-400">Ref: {request.reference}</p>
              )}
              <p className="mt-1 text-sm font-semibold text-gray-800">{fmtAmount(request.amount)}</p>
              {request.bank_name && (
                <p className="mt-0.5 text-xs text-gray-400">
                  {request.bank_name} · {request.account_name} · {request.account_number}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">{fmtDate(request.created_at)}</p>
            </div>
            <Badge variant={STATUS_VARIANT[request.status] ?? 'warning'}>
              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
            </Badge>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// --- Detail Panel ---

function DetailPanel({
  request,
  canApprove,
  onClose,
  onUpdated,
  onViewAttachment,
}: {
  request: any;
  canApprove: boolean;
  onClose: () => void;
  onUpdated: (updated: any) => void;
  onViewAttachment: (url: string) => void;
}) {
  const [loading, setLoading] = useState<'approve' | 'reject' | 'disburse' | null>(null);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [error, setError] = useState('');
  const [confirmModal, setConfirmModal] = useState<{
    action: 'approve' | 'reject' | 'disburse';
    message: string;
    onConfirm: () => Promise<void>;
  } | null>(null);

  const canAct = canApprove && request.status === 'pending';
  const canDisburse = canApprove && request.status === 'approved';

  async function handleApprove() {
    setError('');
    setLoading('approve');
    try {
      const res = await api.post(`/cash-requests/${request.id}/approve`);
      onUpdated(res.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to approve.');
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectText.trim()) { setError('Rejection reason is required.'); return; }
    setError('');
    setLoading('reject');
    try {
      const res = await api.post(`/cash-requests/${request.id}/reject`, { reason: rejectText });
      onUpdated(res.data.data);
      setRejectMode(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to reject.');
    } finally {
      setLoading(null);
    }
  }

  async function handleDisburse() {
    setError('');
    setLoading('disburse');
    try {
      const res = await api.post(`/cash-requests/${request.id}/disburse`);
      onUpdated(res.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to disburse.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <>
      <div className="flex h-full flex-col">
          {/* Header — matches auth requests panel */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <p className="font-semibold text-gray-900">
                {REQUEST_TYPE_LABELS[request.request_type] ?? 'Cash Request'}
              </p>
              {request.created_by_name && (
                <p className="text-xs text-gray-500">By {request.created_by_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[request.status] ?? 'warning'}>
                {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
              </Badge>
              <button
                onClick={onClose}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Details grid */}
            <div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {request.reference && (
                  <>
                    <span className="text-gray-500">Reference</span>
                    <span className="font-medium text-gray-900">{request.reference}</span>
                  </>
                )}
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-gray-900">{fmtAmount(request.amount)}</span>
                {request.bank_name && (
                  <>
                    <span className="text-gray-500">Bank</span>
                    <span className="font-medium text-gray-900">{request.bank_name}</span>
                  </>
                )}
                {request.account_name && (
                  <>
                    <span className="text-gray-500">Account Name</span>
                    <span className="font-medium text-gray-900">{request.account_name}</span>
                  </>
                )}
                {request.account_number && (
                  <>
                    <span className="text-gray-500">Account Number</span>
                    <span className="font-medium text-gray-900">{request.account_number}</span>
                  </>
                )}
                <span className="text-gray-500">Submitted</span>
                <span className="font-medium text-gray-900">{fmtDate(request.created_at)}</span>
              </div>
            </div>

            {/* Attachment */}
            {request.attachment_url && (
              <button
                onClick={() => {
                  const url = request.attachment_url.startsWith('http')
                    ? request.attachment_url
                    : `${import.meta.env.VITE_API_URL}${request.attachment_url}`;
                  onViewAttachment(url);
                }}
                className="flex items-center gap-2 rounded border border-dashed border-gray-300 px-3 py-2 text-sm text-primary-600 hover:border-primary-400 hover:bg-primary-50"
              >
                <Paperclip className="h-4 w-4" />
                View Receipt Attachment
              </button>
            )}

            {/* Rejection reason */}
            {request.status === 'rejected' && request.rejection_reason && (
              <div className="rounded bg-red-50 p-3 text-sm text-red-700">
                <span className="font-medium">Rejection reason: </span>{request.rejection_reason}
              </div>
            )}
          </div>

          {/* Footer actions */}
          {(canAct || canDisburse) && (
            <div className="border-t border-gray-200 px-6 py-4">
              {error && (
                <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
              )}
              {canAct && !rejectMode && (
                <div className="flex gap-3">
                  <Button
                    className="flex-1"
                    variant="success"
                    disabled={loading !== null}
                    onClick={() => setConfirmModal({ action: 'approve', message: 'Confirm approval of this request?', onConfirm: handleApprove })}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <CheckCircle className="h-4 w-4" />
                      Approve
                    </span>
                  </Button>
                  <Button className="flex-1" variant="danger" onClick={() => setRejectMode(true)}>
                    <span className="flex items-center justify-center gap-1.5">
                      <XCircle className="h-4 w-4" /> Reject
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
                      onClick={() => { setRejectMode(false); setRejectText(''); setError(''); }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {canDisburse && (
                <Button
                  className="w-full"
                  disabled={loading !== null}
                  onClick={() => setConfirmModal({ action: 'disburse', message: 'Mark this request as disbursed?', onConfirm: handleDisburse })}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <DollarSign className="h-4 w-4" />
                    Disburse
                  </span>
                </Button>
              )}
            </div>
          )}
      </div>
      {confirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
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
                  confirmModal.action === 'reject'
                    ? 'danger'
                    : confirmModal.action === 'approve'
                      ? 'success'
                      : 'primary'
                }
                disabled={loading !== null}
                onClick={async () => { await confirmModal.onConfirm(); setConfirmModal(null); }}
              >
                {loading !== null ? 'Processing...' : confirmModal.action === 'approve' ? 'Approve' : confirmModal.action === 'reject' ? 'Reject' : 'Disburse'}
              </Button>
              <Button className="flex-1" variant="secondary" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// --- Main Page ---

export function CashRequestsPage() {
  const [requests, setRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [selectedRequest, setSelectedRequest] = useState<any | null>(null);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 639px)').matches
      : false,
  );

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const { hasPermission } = usePermission();
  const canApprove = hasPermission(PERMISSIONS.CASH_REQUEST_APPROVE);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    api
      .get('/cash-requests', {
        params: selectedBranchIds.length > 0 ? { branchIds: selectedBranchIds.join(',') } : {},
      })
      .then((res) => setRequests(res.data.data || []))
      .finally(() => setLoading(false));
  }, [selectedBranchIds]);

  useEffect(() => { fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  function handleUpdated(updated: any) {
    setRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedRequest(updated);
  }

  const filtered = statusTab === 'all' ? requests : requests.filter((r) => r.status === statusTab);
  const pageSize = isMobile ? 6 : 12;
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pagedFiltered = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pendingCount = requests.filter((r) => r.status === 'pending').length;

  useEffect(() => {
    setPage(1);
  }, [statusTab, isMobile]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <DollarSign className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Cash Requests</h1>
          {pendingCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
              {pendingCount}
            </span>
          )}
        </div>

        {/* Status tabs */}
        <div className="flex justify-center sm:justify-start">
          <div className="mx-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-lg bg-gray-100 p-1 sm:mx-0">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setStatusTab(tab.key);
                  setPage(1);
                }}
                className={`shrink-0 rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                  statusTab === tab.key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <DollarSign className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                {statusTab === 'all' ? 'No cash requests.' : `No ${statusTab} requests.`}
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {pagedFiltered.map((r) => (
                <CashRequestCard
                  key={r.id}
                  request={r}
                  onClick={() => setSelectedRequest(r)}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Page {page} of {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <button
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

      {/* Backdrop */}
      {selectedRequest && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedRequest(null)}
        />
      )}

      {/* Detail panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[520px] transform bg-white shadow-2xl transition-transform duration-300 ${
          selectedRequest ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedRequest && (
          <DetailPanel
            request={selectedRequest}
            canApprove={canApprove}
            onClose={() => setSelectedRequest(null)}
            onUpdated={handleUpdated}
            onViewAttachment={(url) => {
              setAttachmentUrl(url);
              setImageModalOpen(true);
            }}
          />
        )}
      </div>

      {/* Image modal for attachment preview */}
      <ImageModal
        images={attachmentUrl ? [{ file_path: attachmentUrl }] : []}
        initialIndex={0}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />
    </>
  );
}
