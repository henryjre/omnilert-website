import { useEffect, useState } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { X } from 'lucide-react';

type ShiftExchangeDetail = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  approval_stage: 'awaiting_employee' | 'awaiting_hr' | 'resolved';
  employee_rejection_reason: string | null;
  hr_rejection_reason: string | null;
  requester: {
    name: string;
    company_name: string;
    branch_name: string | null;
    shift_start: string | null;
    shift_end: string | null;
    duty_type: string | null;
  };
  accepting: {
    name: string;
    company_name: string;
    branch_name: string | null;
    shift_start: string | null;
    shift_end: string | null;
    duty_type: string | null;
  };
  can_respond: boolean;
  can_approve: boolean;
  can_reject: boolean;
};

interface ShiftExchangeDetailModalProps {
  isOpen: boolean;
  requestId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
  mode?: 'modal' | 'panel';
}

function fmtShift(value: string | null): string {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function stageLabel(detail: ShiftExchangeDetail | null): string {
  if (!detail) return 'Pending';
  if (detail.status === 'approved') return 'Approved';
  if (detail.status === 'rejected') return 'Rejected';
  if (detail.approval_stage === 'awaiting_employee') return 'Awaiting Employee Acceptance';
  if (detail.approval_stage === 'awaiting_hr') return 'Pending HR Approval';
  return 'Pending';
}

export function ShiftExchangeDetailModal({
  isOpen,
  requestId,
  onClose,
  onUpdated,
  mode = 'modal',
}: ShiftExchangeDetailModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<ShiftExchangeDetail | null>(null);
  const [rejectMode, setRejectMode] = useState<'employee' | 'hr' | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  async function fetchDetail() {
    if (!requestId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/shift-exchanges/${requestId}`);
      setDetail(res.data.data);
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to load shift exchange details');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOpen || !requestId) return;
    setRejectMode(null);
    setRejectReason('');
    void fetchDetail();
  }, [isOpen, requestId]);

  async function submitEmployeeResponse(action: 'accept' | 'reject') {
    if (!requestId) return;
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/shift-exchanges/${requestId}/respond`, {
        action,
        reason: action === 'reject' ? (rejectReason.trim() || undefined) : undefined,
      });
      setRejectMode(null);
      setRejectReason('');
      await fetchDetail();
      onUpdated?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  }

  async function submitHrAction(action: 'approve' | 'reject') {
    if (!requestId) return;
    if (action === 'reject' && !rejectReason.trim()) {
      setError('Rejection reason is required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (action === 'approve') {
        await api.post(`/shift-exchanges/${requestId}/approve`);
      } else {
        await api.post(`/shift-exchanges/${requestId}/reject`, { reason: rejectReason.trim() });
      }
      setRejectMode(null);
      setRejectReason('');
      await fetchDetail();
      onUpdated?.();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || 'Failed to submit decision');
    } finally {
      setSubmitting(false);
    }
  }

  if (!isOpen || !requestId) return null;

  const content = (
    <>
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <p className="font-semibold text-gray-900">Shift Exchange Request</p>
          <p className="text-xs text-gray-500">Request ID: {requestId}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={detail?.status === 'approved' ? 'success' : detail?.status === 'rejected' ? 'danger' : 'warning'}>
            {stageLabel(detail)}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className={`overflow-y-auto px-5 py-4 space-y-4 ${mode === 'panel' ? 'flex-1' : 'max-h-[70vh]'}`}>
        {loading ? (
          <div className="flex justify-center py-10">
            <Spinner size="lg" />
          </div>
        ) : (
          <>
            {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
            {detail && (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Requester Shift</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{detail.requester.name}</p>
                    <p className="text-xs text-gray-500">{detail.requester.company_name} - {detail.requester.branch_name || 'Unknown Branch'}</p>
                    <p className="mt-2 text-xs text-gray-600">{fmtShift(detail.requester.shift_start)} - {fmtShift(detail.requester.shift_end)}</p>
                    {detail.requester.duty_type && (
                      <p className="mt-1 text-xs text-gray-600">Duty: {detail.requester.duty_type}</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Accepting Shift</p>
                    <p className="mt-1 text-sm font-semibold text-gray-900">{detail.accepting.name}</p>
                    <p className="text-xs text-gray-500">{detail.accepting.company_name} - {detail.accepting.branch_name || 'Unknown Branch'}</p>
                    <p className="mt-2 text-xs text-gray-600">{fmtShift(detail.accepting.shift_start)} - {fmtShift(detail.accepting.shift_end)}</p>
                    {detail.accepting.duty_type && (
                      <p className="mt-1 text-xs text-gray-600">Duty: {detail.accepting.duty_type}</p>
                    )}
                  </div>
                </div>

                {detail.employee_rejection_reason && (
                  <div className="rounded border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    Employee rejection reason: {detail.employee_rejection_reason}
                  </div>
                )}
                {detail.hr_rejection_reason && (
                  <div className="rounded border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
                    HR rejection reason: {detail.hr_rejection_reason}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {detail && (detail.can_respond || detail.can_approve || detail.can_reject) && (
        <div className="border-t border-gray-200 px-5 py-4 space-y-3">
          {rejectMode && (
            <textarea
              rows={3}
              placeholder={rejectMode === 'employee' ? 'Reason (optional)...' : 'Reason (required)...'}
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          )}

          {detail.can_respond && (
            <div className="flex gap-3">
              {rejectMode !== 'employee' ? (
                <>
                  <Button className="flex-1" disabled={submitting} onClick={() => void submitEmployeeResponse('accept')}>
                    {submitting ? 'Processing...' : 'Confirm'}
                  </Button>
                  <Button className="flex-1" variant="danger" disabled={submitting} onClick={() => setRejectMode('employee')}>
                    Reject
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    className="flex-1"
                    variant="danger"
                    disabled={submitting}
                    onClick={() => void submitEmployeeResponse('reject')}
                  >
                    {submitting ? 'Processing...' : 'Confirm Reject'}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => {
                      setRejectMode(null);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}

          {!detail.can_respond && (detail.can_approve || detail.can_reject) && (
            <div className="flex gap-3">
              {rejectMode !== 'hr' ? (
                <>
                  {detail.can_approve && (
                    <Button
                      className="flex-1"
                      variant="success"
                      disabled={submitting}
                      onClick={() => void submitHrAction('approve')}
                    >
                      {submitting ? 'Processing...' : 'Approve'}
                    </Button>
                  )}
                  {detail.can_reject && (
                    <Button
                      className="flex-1"
                      variant="danger"
                      disabled={submitting}
                      onClick={() => setRejectMode('hr')}
                    >
                      Reject
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    className="flex-1"
                    variant="danger"
                    disabled={submitting}
                    onClick={() => void submitHrAction('reject')}
                  >
                    {submitting ? 'Processing...' : 'Confirm Reject'}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="secondary"
                    disabled={submitting}
                    onClick={() => {
                      setRejectMode(null);
                      setRejectReason('');
                    }}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  if (mode === 'panel') {
    return <div className="flex h-full flex-col bg-white">{content}</div>;
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl">
        {content}
      </div>
    </div>
  );
}
