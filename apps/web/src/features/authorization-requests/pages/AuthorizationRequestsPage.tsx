import { useEffect, useState, useCallback } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { createPortal } from 'react-dom';
import { AnimatePresence } from 'framer-motion';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSIONS } from '@omnilert/shared';
import { ShiftExchangeDetailModal } from '@/features/shift-exchange/components/ShiftExchangeDetailModal';
import { resolveAuthorizationRequestSectionAccess } from './authorizationRequestAccess';
import {
  FileText,
  X,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  AlertCircle,
  LogOut,
  Repeat2,
  LayoutList,
  ChevronRight,
  GitBranch,
  Building2,
  Calendar,
  DollarSign,
  Landmark,
  Copy,
  Check,
  Briefcase,
  ArrowLeftRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// --- Constants ---

const REQUEST_TYPE_LABELS: Record<string, string> = {
  payment_request: 'Payment Request',
  replenishment_request: 'Replenishment Request',
};

const AUTH_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType; diffLabel: string }> = {
  early_check_in: { label: 'Early Check In', color: 'blue', Icon: Clock, diffLabel: 'before shift start' },
  tardiness: { label: 'Tardiness', color: 'orange', Icon: AlertTriangle, diffLabel: 'late' },
  early_check_out: { label: 'Early Check Out', color: 'yellow', Icon: LogOut, diffLabel: 'early' },
  late_check_out: { label: 'Late Check Out', color: 'purple', Icon: Clock, diffLabel: 'after shift end' },
  overtime: { label: 'Overtime', color: 'red', Icon: Clock, diffLabel: 'overtime' },
  interim_duty: { label: 'Interim Duty', color: 'indigo', Icon: Briefcase, diffLabel: 'interim duty duration' },
};

const OVERTIME_TYPE_LABELS: Record<string, string> = {
  normal_overtime: 'Normal Overtime',
  overtime_premium: 'Overtime Premium',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning' | 'default'> = {
  approved: 'success',
  rejected: 'danger',
  pending: 'warning',
  no_approval_needed: 'default',
};

type StatusTab = 'all' | 'pending' | 'approved' | 'rejected';

const STATUS_TABS: { id: StatusTab; label: string; icon: LucideIcon }[] = [
  { id: 'all',      label: 'All',      icon: LayoutList },
  { id: 'pending',  label: 'Pending',  icon: Clock },
  { id: 'approved', label: 'Approved', icon: CheckCircle },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

function fmtAmount(amount: string | number | null) {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(amount));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDiffMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// --- Management Request Detail Panel ---

function ManagementDetailPanel({
  request,
  canApprove,
  onClose,
  onUpdated,
}: {
  request: any;
  canApprove: boolean;
  onClose: () => void;
  onUpdated: (updated: any) => void;
}) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ action: 'approve' | 'reject'; message: string; onConfirm: () => Promise<void> } | null>(null);
  const [copiedNumber, setCopiedNumber] = useState(false);

  const canAct = canApprove && request.status === 'pending';

  /** Copy text to clipboard with an execCommand fallback for non-HTTPS dev environments. */
  function copyToClipboard(text: string) {
    const markCopied = () => {
      setCopiedNumber(true);
      setTimeout(() => setCopiedNumber(false), 2000);
    };

    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(markCopied).catch(() => {
        fallbackCopy(text, markCopied);
      });
    } else {
      fallbackCopy(text, markCopied);
    }
  }

  function fallbackCopy(text: string, onSuccess: () => void) {
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.focus();
    el.select();
    try {
      if (document.execCommand('copy')) onSuccess();
    } finally {
      document.body.removeChild(el);
    }
  }

  function copyAccountNumber() {
    if (!request.account_number) return;
    copyToClipboard(String(request.account_number));
  }

  async function handleApprove() {
    setLoading('approve');
    try {
      const res = await api.post(`/authorization-requests/${request.id}/approve`);
      onUpdated(res.data.data);
      showSuccessToast('Request approved.');
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
      const res = await api.post(`/authorization-requests/${request.id}/reject`, { reason: rejectText });
      onUpdated(res.data.data);
      setRejectMode(false);
      setRejectText('');
      showSuccessToast('Request rejected.');
    } catch (e: any) {
      showErrorToast(e?.response?.data?.error || e?.response?.data?.message || 'Failed to reject.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-5 w-5 text-primary-600" />
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type}
            </h2>
            {request.created_by_name ? (
              <p className="text-xs text-gray-500">By {request.created_by_name}</p>
            ) : (
              <p className="text-xs text-gray-500">{fmtDate(request.created_at)}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[request.status] ?? 'warning'}>
            {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
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

        {/* Branch */}
        {(request.branch_name || request.company_name) && (
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</h3>
            <dl className="space-y-2.5">
              {request.company_name && (
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Company</dt>
                    <dd className="text-sm font-medium text-gray-900">{request.company_name}</dd>
                  </div>
                </div>
              )}
              {request.branch_name && (
                <div className="flex items-start gap-2">
                  <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Branch</dt>
                    <dd className="text-sm font-medium text-primary-700">{request.branch_name}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Financial Details */}
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
            {request.requested_amount != null && (
              <div className="flex items-start gap-2">
                <DollarSign className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Requested Amount</dt>
                  <dd className="text-sm font-semibold text-gray-900">{fmtAmount(request.requested_amount)}</dd>
                </div>
              </div>
            )}
            {(request.bank_name ?? request.account_name ?? request.account_number) && (
              <div className="flex items-start gap-2">
                <Landmark className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Bank Account</dt>
                  <dd className="mt-0.5 space-y-0.5 text-sm text-gray-900">
                    {request.bank_name && <p>{request.bank_name}</p>}
                    {request.account_name && <p>{request.account_name}</p>}
                    {request.account_number && (
                      <div className="flex items-center gap-1.5">
                        <p className="font-mono text-xs text-gray-600">{String(request.account_number)}</p>
                        <button
                          type="button"
                          onClick={copyAccountNumber}
                          className="rounded p-0.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                          title="Copy account number"
                        >
                          {copiedNumber
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
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">
                    {request.status === 'approved'
                      ? 'Approved by'
                      : request.status === 'rejected'
                        ? 'Rejected by'
                        : 'Reviewed by'}
                  </dt>
                  <dd className="text-sm text-gray-900">
                    {request.reviewed_by_name ?? request.reviewed_by ?? '—'}
                    <span className="ml-2 text-xs text-gray-500">{fmtDate(request.reviewed_at)}</span>
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* Footer actions */}
      {canAct && (
        <div className="border-t border-gray-200 px-6 py-4">
          {!rejectMode ? (
            <div className="flex gap-3">
              <Button
                className="flex-1"
                variant="success"
                onClick={() => setConfirmModal({
                  action: 'approve',
                  message: 'Confirm approval of this request?',
                  onConfirm: handleApprove,
                })}
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
          ) : (
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
                  disabled={!rejectText.trim()}
                  onClick={() => setConfirmModal({
                    action: 'reject',
                    message: `Reject with reason: "${rejectText}"?`,
                    onConfirm: handleReject,
                  })}
                >
                  Confirm Reject
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => { setRejectMode(false); setRejectText(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {confirmModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={loading !== null ? undefined : () => setConfirmModal(null)}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {confirmModal.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant={confirmModal.action === 'approve' ? 'success' : 'danger'}
                disabled={loading !== null}
                onClick={async () => {
                  await confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {loading !== null ? 'Processing...' : (confirmModal.action === 'approve' ? 'Approve' : 'Reject')}
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
    </div>
  );
}

// --- Service Crew Request Detail Panel ---

function ServiceCrewDetailPanel({
  auth,
  canApprove,
  onClose,
  onUpdated,
}: {
  auth: any;
  canApprove: boolean;
  onClose: () => void;
  onUpdated: (updated: any) => void;
}) {
  const config = AUTH_TYPE_CONFIG[auth.auth_type] ?? { label: auth.auth_type, color: 'gray', Icon: Clock, diffLabel: '' };
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const { Icon } = config;
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [selectedOvertimeType, setSelectedOvertimeType] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ action: 'approve' | 'reject'; message: string; onConfirm: () => Promise<void> } | null>(null);

  const canAct = canApprove && auth.status === 'pending' && (!auth.needs_employee_reason || auth.employee_reason);
  const isOvertime = auth.auth_type === 'overtime';

  const iconColorCls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-600',
  };

  async function handleApprove() {
    setLoading('approve');
    try {
      const body = isOvertime && selectedOvertimeType ? { overtimeType: selectedOvertimeType } : {};
      const res = await api.post(`/shift-authorizations/${auth.id}/approve`, body);
      onUpdated(res.data.data);
      showSuccessToast('Request approved.');
    } catch (e: any) {
      showErrorToast(e?.response?.data?.error || e?.response?.data?.message || 'Failed to approve.');
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectText.trim()) {
      showErrorToast('Rejection reason is required.');
      return;
    }
    setLoading('reject');
    try {
      const res = await api.post(`/shift-authorizations/${auth.id}/reject`, { reason: rejectText });
      onUpdated(res.data.data);
      setRejectText('');
      showSuccessToast('Request rejected.');
    } catch (e: any) {
      showErrorToast(e?.response?.data?.error || e?.response?.data?.message || 'Failed to reject.');
    } finally {
      setLoading(null);
      setRejectMode(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconColorCls[config.color] ?? iconColorCls.gray}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{config.label}</h2>
            {auth.employee_name && (
              <p className="text-xs text-gray-500">{auth.employee_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[auth.status] ?? 'warning'}>
            {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
          </Badge>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {/* Rejection reason callout */}
        {auth.status === 'rejected' && auth.rejection_reason && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <div>
              <p className="text-xs font-semibold text-red-700">Rejection Reason</p>
              <p className="mt-0.5 text-sm text-red-600">{auth.rejection_reason}</p>
            </div>
          </div>
        )}

        {/* Awaiting employee reason callout */}
        {auth.status === 'pending' && auth.needs_employee_reason && !auth.employee_reason && (
          <div className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
            <p className="text-sm text-orange-700">Awaiting employee reason before approval.</p>
          </div>
        )}

        {/* Employee reason callout */}
        {auth.employee_reason && (
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div>
              <p className="text-xs font-semibold text-gray-600">Employee Reason</p>
              <p className="mt-0.5 text-sm text-gray-700">{auth.employee_reason}</p>
            </div>
          </div>
        )}

        {/* Approved overtime type callout */}
        {auth.status === 'approved' && auth.overtime_type && (
          <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
            <div>
              <p className="text-xs font-semibold text-blue-700">Overtime Type</p>
              <p className="mt-0.5 text-sm text-blue-700">
                {OVERTIME_TYPE_LABELS[auth.overtime_type] ?? auth.overtime_type}
              </p>
            </div>
          </div>
        )}

        {/* Branch */}
        {(auth.branch_name || auth.company_name) && (
          <section>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</h3>
            <dl className="space-y-2.5">
              {auth.company_name && (
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Company</dt>
                    <dd className="text-sm font-medium text-gray-900">{auth.company_name}</dd>
                  </div>
                </div>
              )}
              {auth.branch_name && (
                <div className="flex items-start gap-2">
                  <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Branch</dt>
                    <dd className="text-sm font-medium text-primary-700">{auth.branch_name}</dd>
                  </div>
                </div>
              )}
            </dl>
          </section>
        )}

        {/* Attendance Details */}
        <section>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Attendance Details</h3>
          <dl className="space-y-3">
            <div className="flex items-start gap-2">
              <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
              <div>
                <dt className="text-xs text-gray-500">Duration</dt>
                <dd className="text-sm font-medium text-gray-900">
                  {formatDiffMinutes(auth.diff_minutes)} {config.diffLabel}
                </dd>
              </div>
            </div>
            {auth.duty_type && (
              <div className="flex items-start gap-2">
                <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Duty Type</dt>
                  <dd className="text-sm font-medium text-gray-900">{auth.duty_type}</dd>
                </div>
              </div>
            )}
            {auth.shift_start && (
              <div className="flex items-start gap-2">
                <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">Shift Start</dt>
                  <dd className="text-sm font-medium text-gray-900">{fmtDate(auth.shift_start)}</dd>
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
                <dd className="text-sm text-gray-900">{fmtDate(auth.created_at)}</dd>
              </div>
            </div>
            {auth.resolved_at && (
              <div className="flex items-start gap-2">
                <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                <div>
                  <dt className="text-xs text-gray-500">
                    {auth.status === 'approved'
                      ? 'Approved by'
                      : auth.status === 'rejected'
                        ? 'Rejected by'
                        : 'Resolved by'}
                  </dt>
                  <dd className="text-sm text-gray-900">
                    {auth.resolved_by_name ?? auth.resolved_by ?? '—'}
                    <span className="ml-2 text-xs text-gray-500">{fmtDate(auth.resolved_at)}</span>
                  </dd>
                </div>
              </div>
            )}
          </dl>
        </section>
      </div>

      {/* Footer actions */}
      {canAct && (
        <div className="border-t border-gray-200 px-6 py-4">
          {!rejectMode ? (
            <div className="space-y-3">
              {isOvertime && (
                <select
                  value={selectedOvertimeType}
                  onChange={(e) => setSelectedOvertimeType(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">Select overtime type...</option>
                  <option value="normal_overtime">Normal Overtime</option>
                  <option value="overtime_premium">Overtime Premium</option>
                </select>
              )}
              <div className="flex gap-3">
                <Button
                  className="flex-1"
                  variant="success"
                  disabled={isOvertime && !selectedOvertimeType}
                  onClick={() => setConfirmModal({
                    action: 'approve',
                    message: 'Confirm approval of this request?',
                    onConfirm: handleApprove,
                  })}
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
            </div>
          ) : (
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
                  disabled={!rejectText.trim()}
                  onClick={() => setConfirmModal({
                    action: 'reject',
                    message: `Reject with reason: "${rejectText}"?`,
                    onConfirm: handleReject,
                  })}
                >
                  Confirm Reject
                </Button>
                <Button
                  className="flex-1"
                  variant="secondary"
                  onClick={() => { setRejectMode(false); setRejectText(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {confirmModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={loading !== null ? undefined : () => setConfirmModal(null)}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {confirmModal.action === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
              </p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-gray-700">{confirmModal.message}</p>
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant={confirmModal.action === 'approve' ? 'success' : 'danger'}
                disabled={loading !== null}
                onClick={async () => {
                  await confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {loading !== null ? 'Processing...' : (confirmModal.action === 'approve' ? 'Approve' : 'Reject')}
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
    </div>
  );
}

// --- Skeleton components ---

/** Single card placeholder that mirrors the management/service crew card shape. */
function RequestCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <div className="h-4 w-40 rounded bg-gray-200" />
          <div className="h-3 w-28 rounded bg-gray-200" />
          <div className="h-3 w-20 rounded bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
        </div>
        <div className="h-5 w-16 shrink-0 rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

/** Full-page skeleton that mirrors the two-section layout while data is loading. */
function AuthorizationRequestsPageSkeleton() {
  return (
    <div className="space-y-8">
      {/* Header skeleton */}
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-md bg-gray-200" />
          <div className="h-7 w-56 rounded bg-gray-200" />
        </div>
        <div className="h-4 w-80 rounded bg-gray-200" />
      </div>

      {/* Two section skeletons */}
      {[0, 1].map((i) => (
        <div key={i} className="animate-pulse space-y-3">
          {/* Section heading */}
          <div className="flex items-center gap-2">
            <div className="h-4 w-36 rounded bg-gray-200" />
            <div className="h-5 w-5 rounded-full bg-gray-200" />
          </div>
          {/* Tab strip */}
          <div className="flex gap-1 border-b border-gray-200 pb-px">
            {[80, 88, 96, 96].map((w, j) => (
              <div key={j} style={{ width: w }} className="h-8 rounded-t bg-gray-100" />
            ))}
          </div>
          {/* Card grid */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, j) => (
              <RequestCardSkeleton key={j} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// --- Request Cards ---

function ManagementRequestCard({ request, onClick }: { request: any; onClick: () => void }) {
  return (
    <button
      type="button"
      className="flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
      onClick={onClick}
    >
      {/* Top block: type + badge, then creator + branch */}
      <div className="flex items-start justify-between gap-3">
        <p className="font-medium text-gray-900">
          {REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type}
        </p>
        <Badge variant={STATUS_VARIANT[request.status] ?? 'warning'}>
          {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
        </Badge>
      </div>

      <div className="mt-1.5 min-w-0 space-y-0.5">
        {request.created_by_name && (
          <p className="truncate text-xs text-gray-500">{request.created_by_name}</p>
        )}
        {request.branch_name && (
          <p className="truncate text-xs text-primary-600">{request.branch_name}</p>
        )}
        {request.company_name && !request.branch_name && (
          <p className="truncate text-xs text-gray-400">{request.company_name}</p>
        )}
      </div>

      {/* Spacer so equal-height cards pin the footer to the bottom */}
      <div className="flex-1" />

      {/* Footer strip: submitted date + reviewer on left · amount + chevron on right */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <div className="min-w-0">
          <p className="text-xs text-gray-400">{fmtDate(request.created_at)}</p>
          {request.status !== 'pending' && (request.reviewed_by_name || request.reviewed_by) && (
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {request.status === 'approved'
                ? 'Approved by '
                : request.status === 'rejected'
                  ? 'Rejected by '
                  : 'Reviewed by '}
              {request.reviewed_by_name || request.reviewed_by}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {request.requested_amount != null && (
            <p className="text-sm font-semibold text-gray-800">
              {fmtAmount(request.requested_amount)}
            </p>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
        </div>
      </div>
    </button>
  );
}

const ICON_COLOR_CLS: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-600',
  orange: 'bg-orange-100 text-orange-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  purple: 'bg-purple-100 text-purple-600',
  red:    'bg-red-100 text-red-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  gray:   'bg-gray-100 text-gray-600',
};

function ServiceCrewRequestCard({ auth, onClick }: { auth: any; onClick: () => void }) {
  if (auth.auth_type === 'shift_exchange') {
    return (
      <button
        type="button"
        className="flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
        onClick={onClick}
      >
        {/* Top block: icon + label + badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ICON_COLOR_CLS.indigo}`}>
              <Repeat2 className="h-4 w-4" />
            </div>
            <p className="font-medium text-gray-900">Shift Exchange</p>
          </div>
          <Badge variant={STATUS_VARIANT[auth.status] ?? 'warning'}>
            {auth.stage_label || auth.status}
          </Badge>
        </div>

        {/* Participant names + branches */}
        <div className="mt-2 min-w-0 space-y-0.5">
          {(auth.requester_name || auth.accepting_name) && (
            <p className="flex items-center gap-1 truncate text-xs text-gray-500">
              <ArrowLeftRight className="h-3 w-3 shrink-0 text-gray-400" />
              {[auth.requester_name, auth.accepting_name].filter(Boolean).join(' ↔ ')}
            </p>
          )}
          {auth.requester_branch_name && (
            <p className="truncate text-xs text-primary-600">{auth.requester_branch_name}</p>
          )}
          {auth.accepting_branch_name && auth.accepting_branch_name !== auth.requester_branch_name && (
            <p className="truncate text-xs text-primary-600">{auth.accepting_branch_name}</p>
          )}
        </div>

        <div className="flex-1" />

        {/* Footer */}
        <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
          <p className="text-xs text-gray-400">{fmtDate(auth.created_at)}</p>
          <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
        </div>
      </button>
    );
  }

  const config = AUTH_TYPE_CONFIG[auth.auth_type] ?? { label: auth.auth_type, color: 'gray', Icon: Clock, diffLabel: '' };
  const { Icon } = config;

  return (
    <button
      type="button"
      className="flex h-full w-full flex-col rounded-xl border border-gray-200 bg-white p-4 text-left transition-colors hover:border-primary-200 hover:bg-primary-50/30"
      onClick={onClick}
    >
      {/* Top block: icon + label + badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${ICON_COLOR_CLS[config.color] ?? ICON_COLOR_CLS.gray}`}>
            <Icon className="h-4 w-4" />
          </div>
          <p className="font-medium text-gray-900">{config.label}</p>
        </div>
        <Badge variant={STATUS_VARIANT[auth.status] ?? 'warning'}>
          {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
        </Badge>
      </div>

      {/* Employee + branch */}
      <div className="mt-1.5 min-w-0 space-y-0.5">
        {auth.employee_name && (
          <p className="truncate text-xs text-gray-500">{auth.employee_name}</p>
        )}
        {auth.branch_name && (
          <p className="truncate text-xs text-primary-600">{auth.branch_name}</p>
        )}
      </div>

      <div className="flex-1" />

      {/* Footer: duration · duty on left, date + reviewer + chevron on right */}
      <div className="mt-3 flex items-end justify-between gap-2 border-t border-gray-100 pt-2.5">
        <div className="min-w-0">
          <p className="text-xs text-gray-400">
            {formatDiffMinutes(auth.diff_minutes)} {config.diffLabel}
            {auth.duty_type ? ` · ${auth.duty_type}` : ''}
          </p>
          <p className="mt-0.5 text-xs text-gray-400">{fmtDate(auth.created_at)}</p>
          {auth.status !== 'pending' && (auth.resolved_by_name || auth.resolved_by) && (
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {auth.status === 'approved' ? 'Approved by ' : auth.status === 'rejected' ? 'Rejected by ' : 'Resolved by '}
              {auth.resolved_by_name || auth.resolved_by}
            </p>
          )}
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300" />
      </div>
    </button>
  );
}

// --- Page ---

type DetailItem = { type: 'management' | 'service_crew' | 'shift_exchange'; data: any };

export function AuthorizationRequestsPage() {
  const { error: showErrorToast } = useAppToast();
  const [managementRequests, setManagementRequests] = useState<any[]>([]);
  const [serviceCrewRequests, setServiceCrewRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<DetailItem | null>(null);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 639px)').matches
      : false,
  );
  const [mgmtPage, setMgmtPage] = useState(1);
  const [crewPage, setCrewPage] = useState(1);

  const [mgmtTab, setMgmtTab] = useState<StatusTab>('pending');
  const [crewTab, setCrewTab] = useState<StatusTab>('pending');

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const { hasPermission, hasAnyPermission } = usePermission();

  const canViewAuthorizationRequestsPage = hasPermission(PERMISSIONS.AUTH_REQUEST_VIEW_PAGE);
  const canViewManagementData = hasAnyPermission(
    PERMISSIONS.AUTH_REQUEST_VIEW_PRIVATE,
    PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE,
  );
  const canViewServiceCrewData = hasAnyPermission(
    PERMISSIONS.AUTH_REQUEST_VIEW_PUBLIC,
    PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC,
  );
  const canApproveManagement = hasPermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE);
  const canApproveServiceCrew = hasPermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC);
  const {
    showManagementSection,
    showServiceCrewSection,
    showNoDataPermissionState,
  } = resolveAuthorizationRequestSectionAccess({
    canApproveManagement,
    canApproveServiceCrew,
    canViewManagementData,
    canViewServiceCrewData,
    canViewAuthorizationRequestsPage,
  });

  const filteredManagement = mgmtTab === 'all' ? managementRequests : managementRequests.filter((r) => r.status === mgmtTab);
  const filteredServiceCrew = crewTab === 'all' ? serviceCrewRequests : serviceCrewRequests.filter((r) => r.status === crewTab);
  const pageSize = isMobile ? 6 : 12;
  const totalMgmtPages = Math.max(1, Math.ceil(filteredManagement.length / pageSize));
  const totalCrewPages = Math.max(1, Math.ceil(filteredServiceCrew.length / pageSize));
  const pagedManagement = filteredManagement.slice((mgmtPage - 1) * pageSize, mgmtPage * pageSize);
  const pagedServiceCrew = filteredServiceCrew.slice((crewPage - 1) * pageSize, crewPage * pageSize);

  const fetchRequests = useCallback(async () => {
    if (!showManagementSection && !showServiceCrewSection) {
      setManagementRequests([]);
      setServiceCrewRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(
        '/authorization-requests',
        { params: selectedBranchIds.length > 0 ? { branchIds: selectedBranchIds.join(',') } : {} },
      );
      setManagementRequests(res.data.data?.managementRequests || []);
      setServiceCrewRequests(res.data.data?.serviceCrewRequests || []);
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to load authorization requests');
    } finally {
      setLoading(false);
    }
  }, [selectedBranchIds, showErrorToast, showManagementSection, showServiceCrewSection]);

  useEffect(() => { void fetchRequests(); }, [fetchRequests]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    setMgmtPage(1);
  }, [mgmtTab, isMobile]);

  useEffect(() => {
    setCrewPage(1);
  }, [crewTab, isMobile]);

  useEffect(() => {
    setMgmtPage((prev) => Math.min(prev, totalMgmtPages));
  }, [totalMgmtPages]);

  useEffect(() => {
    setCrewPage((prev) => Math.min(prev, totalCrewPages));
  }, [totalCrewPages]);

  function handleManagementUpdated(updated: any) {
    /**
     * Merge rather than replace so that joined fields (branch_name, company_name,
     * created_by_name) from the list query are not lost when the approve/reject
     * endpoint returns only the raw updated row.
     */
    setManagementRequests((prev) =>
      prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
    );
    setSelectedItem((prev) =>
      prev?.type === 'management' && prev.data.id === updated.id
        ? { type: 'management', data: { ...prev.data, ...updated } }
        : prev,
    );
  }

  function handleServiceCrewUpdated(updated: any) {
    /**
     * Same merge strategy: preserve branch_name, company_name, employee_name,
     * duty_type etc. that the approve/reject endpoint does not re-join.
     */
    setServiceCrewRequests((prev) =>
      prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)),
    );
    setSelectedItem((prev) =>
      prev?.type === 'service_crew' && prev.data.id === updated.id
        ? { type: 'service_crew', data: { ...prev.data, ...updated } }
        : prev,
    );
  }

  const mgmtPendingCount = managementRequests.filter((r) => r.status === 'pending').length;
  const crewPendingCount = serviceCrewRequests.filter((r) => r.status === 'pending').length;

  return (
    <>
      <div className="space-y-8">
          {/* ─── Page header ───────────────────────────────────────── */}
          <div>
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Authorization Requests</h1>
            </div>
            <p className="mt-1 hidden text-sm text-gray-500 sm:block">
              Review and act on management payment requests and service crew attendance authorizations.
            </p>
          </div>

          {/* ─── Management Requests section ───────────────────────── */}
          {showNoDataPermissionState && (
            <div className="flex min-h-[18rem] items-center justify-center rounded-xl border border-gray-200 bg-white px-6 py-10">
              <div className="text-center">
                <AlertCircle className="mx-auto h-8 w-8 text-gray-300" />
                <p className="mt-3 text-sm font-medium text-gray-700">No Accessible Authorization Data</p>
                <p className="mt-1 text-sm text-gray-500">You have no permission to view data.</p>
              </div>
            </div>
          )}

          {showManagementSection && (
            <section className="space-y-3">
              {/* Section heading + pending count badge */}
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Management Requests
                </h2>
                {mgmtPendingCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                    {mgmtPendingCount}
                  </span>
                )}
              </div>

              <ViewToggle
                options={STATUS_TABS}
                activeId={mgmtTab}
                onChange={(id) => {
                  setMgmtTab(id);
                  setMgmtPage(1);
                }}
                layoutId="mgmt-request-tabs"
              />

              {/* Empty state or card grid */}
              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <RequestCardSkeleton key={j} />
                  ))}
                </div>
              ) : filteredManagement.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
                  <FileText className="h-4 w-4 shrink-0 text-gray-300" />
                  <p className="text-sm text-gray-400">
                    {mgmtTab === 'all' ? 'No management requests.' : `No ${mgmtTab} management requests.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pagedManagement.map((r) => (
                      <ManagementRequestCard
                        key={r.id}
                        request={r}
                        onClick={() => setSelectedItem({ type: 'management', data: r })}
                      />
                    ))}
                  </div>

                  {totalMgmtPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Page {mgmtPage} of {totalMgmtPages}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setMgmtPage((prev) => Math.max(1, prev - 1))}
                          disabled={mgmtPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setMgmtPage((prev) => Math.min(totalMgmtPages, prev + 1))}
                          disabled={mgmtPage === totalMgmtPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ─── Service Crew Requests section ─────────────────────── */}
          {showServiceCrewSection && (
            <section className="space-y-3">
              {/* Section heading + pending count badge */}
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Service Crew Requests
                </h2>
                {crewPendingCount > 0 && (
                  <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                    {crewPendingCount}
                  </span>
                )}
              </div>

              <ViewToggle
                options={STATUS_TABS}
                activeId={crewTab}
                onChange={(id) => {
                  setCrewTab(id);
                  setCrewPage(1);
                }}
                layoutId="crew-request-tabs"
              />

              {/* Empty state or card grid */}
              {loading ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, j) => (
                    <RequestCardSkeleton key={j} />
                  ))}
                </div>
              ) : filteredServiceCrew.length === 0 ? (
                <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
                  <Repeat2 className="h-4 w-4 shrink-0 text-gray-300" />
                  <p className="text-sm text-gray-400">
                    {crewTab === 'all' ? 'No service crew requests.' : `No ${crewTab} service crew requests.`}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pagedServiceCrew.map((r) => (
                      <ServiceCrewRequestCard
                        key={r.id}
                        auth={r}
                        onClick={() => {
                          if (r.auth_type === 'shift_exchange') {
                            setSelectedItem({ type: 'shift_exchange', data: r });
                            return;
                          }
                          setSelectedItem({ type: 'service_crew', data: r });
                        }}
                      />
                    ))}
                  </div>

                  {totalCrewPages > 1 && (
                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <span>Page {crewPage} of {totalCrewPages}</span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setCrewPage((prev) => Math.max(1, prev - 1))}
                          disabled={crewPage === 1}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setCrewPage((prev) => Math.min(totalCrewPages, prev + 1))}
                          disabled={crewPage === totalCrewPages}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

      {/* ─── Detail panel + backdrop (portalled to document.body) ──── */}
      {createPortal(
        <>
          {selectedItem && (
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setSelectedItem(null)}
            />
          )}
          <div
            className={`fixed inset-y-0 right-0 z-50 w-full max-w-[560px] transform bg-white shadow-2xl transition-transform duration-300 ${
              selectedItem ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {selectedItem?.type === 'management' && (
              <ManagementDetailPanel
                request={selectedItem.data}
                canApprove={canApproveManagement}
                onClose={() => setSelectedItem(null)}
                onUpdated={handleManagementUpdated}
              />
            )}
            {selectedItem?.type === 'service_crew' && (
              <ServiceCrewDetailPanel
                auth={selectedItem.data}
                canApprove={canApproveServiceCrew}
                onClose={() => setSelectedItem(null)}
                onUpdated={handleServiceCrewUpdated}
              />
            )}
            {selectedItem?.type === 'shift_exchange' && (
              <ShiftExchangeDetailModal
                isOpen
                mode="panel"
                requestId={selectedItem.data.id}
                onClose={() => setSelectedItem(null)}
                onUpdated={() => { void fetchRequests(); }}
              />
            )}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
