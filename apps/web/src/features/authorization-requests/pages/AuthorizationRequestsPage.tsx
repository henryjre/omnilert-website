import { useEffect, useState, useCallback } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useBranchStore } from '@/shared/store/branchStore';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { ShiftExchangeDetailModal } from '@/features/shift-exchange/components/ShiftExchangeDetailModal';
import {
  FileText,
  X,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  LogOut,
  Repeat2,
} from 'lucide-react';

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
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [loading, setLoading] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ action: 'approve' | 'reject'; message: string; onConfirm: () => Promise<void> } | null>(null);

  const canAct = canApprove && request.status === 'pending';

  async function handleApprove() {
    setError('');
    setLoading('approve');
    try {
      const res = await api.post(`/authorization-requests/${request.id}/approve`);
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
      const res = await api.post(`/authorization-requests/${request.id}/reject`, { reason: rejectText });
      onUpdated(res.data.data);
      setRejectMode(false);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.response?.data?.message || 'Failed to reject.');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div>
          <p className="font-semibold text-gray-900">
            {REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type}
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
        {/* Payment Details */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Payment Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {request.reference && (
              <>
                <span className="text-gray-500">Reference</span>
                <span className="font-medium text-gray-900">{request.reference}</span>
              </>
            )}
            {request.requested_amount != null && (
              <>
                <span className="text-gray-500">Amount</span>
                <span className="font-medium text-gray-900">{fmtAmount(request.requested_amount)}</span>
              </>
            )}
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

        {/* Rejection reason display */}
        {request.status === 'rejected' && request.rejection_reason && (
          <div className="rounded bg-red-50 p-3 text-sm text-red-700">
            <span className="font-medium">Rejection reason: </span>{request.rejection_reason}
          </div>
        )}
      </div>

      {/* Footer actions */}
      {canAct && (
        <div className="border-t border-gray-200 px-6 py-4">
          {error && (
            <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
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
                  onClick={() => { setRejectMode(false); setRejectText(''); setError(''); }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
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
              <Button className="flex-1" variant="secondary" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
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
    } finally {
      setLoading(null);
    }
  }

  async function handleReject() {
    if (!rejectText.trim()) return;
    setLoading('reject');
    try {
      const res = await api.post(`/shift-authorizations/${auth.id}/reject`, { reason: rejectText });
      onUpdated(res.data.data);
    } finally {
      setLoading(null);
      setRejectMode(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconColorCls[config.color] ?? iconColorCls.gray}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="font-semibold text-gray-900">{config.label}</p>
            {auth.employee_name && <p className="text-xs text-gray-500">{auth.employee_name}</p>}
            {auth.branch_name && <p className="text-xs text-primary-600">{auth.branch_name}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={STATUS_VARIANT[auth.status] ?? 'warning'}>
            {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
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
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <span className="text-gray-500">Type</span>
          <span className="font-medium text-gray-900">{config.label}</span>
          <span className="text-gray-500">Duration</span>
          <span className="font-medium text-gray-900">{formatDiffMinutes(auth.diff_minutes)} {config.diffLabel}</span>
          {auth.duty_type && (
            <>
              <span className="text-gray-500">Duty</span>
              <span className="font-medium text-gray-900">{auth.duty_type}</span>
            </>
          )}
          {auth.shift_start && (
            <>
              <span className="text-gray-500">Shift Start</span>
              <span className="font-medium text-gray-900">{fmtDate(auth.shift_start)}</span>
            </>
          )}
          <span className="text-gray-500">Submitted</span>
          <span className="font-medium text-gray-900">{fmtDate(auth.created_at)}</span>
        </div>

        {auth.status === 'pending' && auth.needs_employee_reason && !auth.employee_reason && (
          <p className="text-xs text-orange-600">Awaiting employee reason before approval.</p>
        )}
        {auth.employee_reason && (
          <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
            <span className="font-medium">Employee reason: </span>{auth.employee_reason}
          </div>
        )}
        {auth.status === 'rejected' && auth.rejection_reason && (
          <div className="rounded bg-red-50 p-2 text-xs text-red-700">
            <span className="font-medium">Rejection reason: </span>{auth.rejection_reason}
          </div>
        )}
        {auth.status === 'approved' && auth.overtime_type && (
          <div className="rounded bg-blue-50 p-2 text-xs text-blue-700">
            <span className="font-medium">Overtime Type: </span>
            {OVERTIME_TYPE_LABELS[auth.overtime_type] ?? auth.overtime_type}
          </div>
        )}
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

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white shadow-xl">
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
              <Button className="flex-1" variant="secondary" onClick={() => setConfirmModal(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Request Cards ---

function ManagementRequestCard({ request, onClick }: { request: any; onClick: () => void }) {
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
                {REQUEST_TYPE_LABELS[request.request_type] ?? request.request_type}
              </p>
              {request.created_by_name && (
                <p className="mt-0.5 text-xs text-gray-500">{request.created_by_name}</p>
              )}
              {request.reference && (
                <p className="mt-0.5 text-xs text-gray-400">Ref: {request.reference}</p>
              )}
              {request.requested_amount != null && (
                <p className="mt-1 text-sm font-semibold text-gray-800">
                  {fmtAmount(request.requested_amount)}
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

function ServiceCrewRequestCard({ auth, onClick }: { auth: any; onClick: () => void }) {
  if (auth.auth_type === 'shift_exchange') {
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
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-indigo-600">
                <Repeat2 className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">Shift Exchange</p>
                    <p className="text-xs text-gray-500">
                      {auth.requester_name} ↔ {auth.accepting_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {auth.requester_company_name} · {auth.requester_branch_name || 'Unknown Branch'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {auth.accepting_company_name} · {auth.accepting_branch_name || 'Unknown Branch'}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">{fmtDate(auth.created_at)}</p>
                  </div>
                  <Badge variant={STATUS_VARIANT[auth.status] ?? 'warning'}>
                    {auth.stage_label || auth.status}
                  </Badge>
                </div>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  const config = AUTH_TYPE_CONFIG[auth.auth_type] ?? { label: auth.auth_type, color: 'gray', Icon: Clock, diffLabel: '' };
  const { Icon } = config;
  const iconColorCls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-600',
  };

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
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${iconColorCls[config.color] ?? iconColorCls.gray}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{config.label}</p>
                  {auth.employee_name && (
                    <p className="text-xs text-gray-500">{auth.employee_name}</p>
                  )}
                  {auth.branch_name && (
                    <p className="text-xs text-primary-600">{auth.branch_name}</p>
                  )}
                  <p className="mt-0.5 text-xs text-gray-400">
                    {formatDiffMinutes(auth.diff_minutes)} {config.diffLabel}
                    {auth.duty_type ? ` · ${auth.duty_type}` : ''}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{fmtDate(auth.created_at)}</p>
                </div>
                <Badge variant={STATUS_VARIANT[auth.status] ?? 'warning'}>
                  {auth.status.charAt(0).toUpperCase() + auth.status.slice(1)}
                </Badge>
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

// --- Page ---

type DetailItem = { type: 'management' | 'service_crew' | 'shift_exchange'; data: any };

export function AuthorizationRequestsPage() {
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

  type StatusTab = 'all' | 'pending' | 'approved' | 'rejected';
  const STATUS_TABS: { key: StatusTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'approved', label: 'Approved' },
    { key: 'rejected', label: 'Rejected' },
  ];
  const [mgmtTab, setMgmtTab] = useState<StatusTab>('pending');
  const [crewTab, setCrewTab] = useState<StatusTab>('pending');

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const { hasPermission, hasAnyPermission } = usePermission();

  const canApproveManagement = hasPermission(PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT);
  const canViewServiceCrew = hasAnyPermission(
    PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
    PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
  );
  const canApproveServiceCrew = hasPermission(PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW);

  const filteredManagement = mgmtTab === 'all' ? managementRequests : managementRequests.filter((r) => r.status === mgmtTab);
  const filteredServiceCrew = crewTab === 'all' ? serviceCrewRequests : serviceCrewRequests.filter((r) => r.status === crewTab);
  const pageSize = isMobile ? 6 : 12;
  const totalMgmtPages = Math.max(1, Math.ceil(filteredManagement.length / pageSize));
  const totalCrewPages = Math.max(1, Math.ceil(filteredServiceCrew.length / pageSize));
  const pagedManagement = filteredManagement.slice((mgmtPage - 1) * pageSize, mgmtPage * pageSize);
  const pagedServiceCrew = filteredServiceCrew.slice((crewPage - 1) * pageSize, crewPage * pageSize);

  const fetchRequests = useCallback(() => {
    setLoading(true);
    api
      .get('/authorization-requests', { params: selectedBranchIds.length > 0 ? { branchIds: selectedBranchIds.join(',') } : {} })
      .then((res) => {
        setManagementRequests(res.data.data?.managementRequests || []);
        setServiceCrewRequests(res.data.data?.serviceCrewRequests || []);
      })
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
    setManagementRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedItem((prev) =>
      prev?.type === 'management' && prev.data.id === updated.id
        ? { type: 'management', data: updated }
        : prev,
    );
  }

  function handleServiceCrewUpdated(updated: any) {
    setServiceCrewRequests((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    setSelectedItem((prev) =>
      prev?.type === 'service_crew' && prev.data.id === updated.id
        ? { type: 'service_crew', data: updated }
        : prev,
    );
  }

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Authorization Requests</h1>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Management Requests Section */}
            {canApproveManagement && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Management Requests
                  </h2>
                  {managementRequests.filter((r) => r.status === 'pending').length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                      {managementRequests.filter((r) => r.status === 'pending').length}
                    </span>
                  )}
                </div>
                <div className="mx-auto flex w-full items-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setMgmtTab(tab.key);
                        setMgmtPage(1);
                      }}
                      className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none ${
                        mgmtTab === tab.key
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {filteredManagement.length === 0 ? (
                  <Card>
                    <CardBody className="py-8 text-center">
                      <p className="text-sm text-gray-500">
                        {mgmtTab === 'all' ? 'No management requests.' : `No ${mgmtTab} requests.`}
                      </p>
                    </CardBody>
                  </Card>
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
                        <span>
                          Page {mgmtPage} of {totalMgmtPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setMgmtPage((prev) => Math.max(1, prev - 1))}
                            disabled={mgmtPage === 1}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <button
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
              </div>
            )}

            {/* Service Crew Section */}
            {canViewServiceCrew && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                    Service Crew Requests
                  </h2>
                  {serviceCrewRequests.filter((r) => r.status === 'pending').length > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-600 px-1.5 text-[10px] font-bold text-white">
                      {serviceCrewRequests.filter((r) => r.status === 'pending').length}
                    </span>
                  )}
                </div>
                <div className="mx-auto flex w-full items-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit">
                  {STATUS_TABS.map((tab) => (
                    <button
                      key={tab.key}
                      onClick={() => {
                        setCrewTab(tab.key);
                        setCrewPage(1);
                      }}
                      className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none ${
                        crewTab === tab.key
                          ? 'bg-primary-600 text-white shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
                {filteredServiceCrew.length === 0 ? (
                  <Card>
                    <CardBody className="py-8 text-center">
                      <p className="text-sm text-gray-500">
                        {crewTab === 'all' ? 'No service crew requests.' : `No ${crewTab} requests.`}
                      </p>
                    </CardBody>
                  </Card>
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
                        <span>
                          Page {crewPage} of {totalCrewPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setCrewPage((prev) => Math.max(1, prev - 1))}
                            disabled={crewPage === 1}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Previous
                          </button>
                          <button
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
              </div>
            )}
          </>
        )}
      </div>

      {/* Backdrop */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedItem(null)}
        />
      )}

      {/* Detail Panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[520px] transform bg-white shadow-2xl transition-transform duration-300 ${
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
            onUpdated={() => {
              fetchRequests();
            }}
          />
        )}
      </div>
    </>
  );
}
