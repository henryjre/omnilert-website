import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { AnimatePresence, motion } from 'framer-motion';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { api } from '@/shared/services/api.client';
import { OvertimeTypePicker } from '@/shared/components/OvertimeTypePicker';
import { ShiftExchangeFlowModal } from '@/features/shift-exchange/components/ShiftExchangeFlowModal';
import { PeerEvaluationModal } from '@/features/peer-evaluations/components/PeerEvaluationModal';
import { PERMISSIONS } from '@omnilert/shared';
import { AlertTriangle, ArrowDown, ArrowUp, BadgeCheck, Briefcase, CalendarDays, Check, CheckCircle, ChevronDown, ChevronUp, Clock, Clock3, Filter, GitBranch, LogIn, LogOut, MapPin, RefreshCw, Square, Users, X, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// --- Constants ---

const DUTY_COLORS: Record<number, string> = {
  1: '#FF9C9C',
  2: '#F7C698',
  7: '#89E1DB',
  8: '#97A6F9',
};

const FIELD_LABELS: Record<string, string> = {
  start_datetime: 'Shift Start',
  end_datetime: 'Shift End',
  x_role_name: 'Duty Type',
  x_role_color: 'Duty Color',
  x_employee_contact_name: 'Employee',
  x_employee_avatar: 'Avatar',
  x_website_key: 'User Key',
  x_customer_website_key: 'Customer User Key',
};

const SHIFT_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  ended: { label: 'Closed', cls: 'bg-red-100 text-red-700' },
};

// --- Helpers ---

function fmtShift(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleString("en-US", {
    month: "long",
    day: "2-digit",
    year: "numeric",
  });
  const time = d.toLocaleString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} at ${time}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day}, ${year} at ${time}`;
}

function fmtShiftUpdatedValue(field: string, value: unknown): string {
  if (value == null) return "—";
  if (typeof value !== "string") return String(value);

  const isShiftDateTimeField = field === "start_datetime"
    || field === "end_datetime"
    || field === "shift_start"
    || field === "shift_end";

  if (!isShiftDateTimeField) return value;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return fmtShift(d.toISOString());
}

function parseEmployeeName(raw: string): { prefix: string; name: string } {
  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    return { prefix: parts[0].trim(), name: parts.slice(1).join(' - ').trim() };
  }
  return { prefix: '', name: raw };
}

function resolveShiftAvatarUrl(shift: any): string | null {
  return shift?.user_avatar_url || shift?.employee_avatar_url || null;
}

function AvatarFallback({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
  const cls =
    size === 'sm'
      ? 'flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs font-semibold text-gray-600'
      : 'flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600';
  return <div className={cls}>{initials}</div>;
}

// --- Authorization helpers ---

function formatDiffMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

const AUTH_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: ComponentType<{ className?: string }>; diffLabel: string }> = {
  early_check_in: { label: 'Early Check In', color: 'blue', Icon: Clock, diffLabel: 'before shift start' },
  tardiness: { label: 'Tardiness', color: 'orange', Icon: AlertTriangle, diffLabel: 'late' },
  early_check_out: { label: 'Early Check Out', color: 'yellow', Icon: LogOut, diffLabel: 'early' },
  late_check_out: { label: 'Late Check Out', color: 'purple', Icon: Clock, diffLabel: 'after shift end' },
  overtime: { label: 'Overtime', color: 'red', Icon: Clock, diffLabel: 'overtime' },
  interim_duty: { label: 'Interim Duty', color: 'indigo', Icon: Briefcase, diffLabel: 'interim duty duration' },
  shift_exchange: { label: 'Shift Exchange', color: 'indigo', Icon: RefreshCw, diffLabel: '' },
};

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  approved: 'success',
  rejected: 'danger',
  no_approval_needed: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  no_approval_needed: 'No Approval Needed',
};

const OVERTIME_TYPE_LABELS: Record<string, string> = {
  normal_overtime: 'Normal Overtime',
  overtime_premium: 'Overtime Premium',
};

// --- AuthorizationCard ---

function AuthorizationCard({
  auth,
  currentUserId,
  canApprove,
  canSubmitPublicAuthRequest,
  onReasonSubmit,
  onApprove,
  onReject,
}: {
  auth: any;
  currentUserId: string;
  canApprove: boolean;
  canSubmitPublicAuthRequest: boolean;
  onReasonSubmit: (id: string, reason: string) => Promise<void>;
  onApprove: (id: string, overtimeType?: string, hours?: number, minutes?: number) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const config = AUTH_TYPE_CONFIG[auth.auth_type] ?? { label: auth.auth_type, color: 'gray', Icon: Clock, diffLabel: '' };
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const { Icon } = config;

  const [reasonText, setReasonText] = useState('');
  const [reasonLoading, setReasonLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [selectedOvertimeType, setSelectedOvertimeType] = useState('normal_overtime');
  const [overtimeHours, setOvertimeHours] = useState(Math.floor((auth.diff_minutes || 0) / 60));
  const [overtimeMinutes, setOvertimeMinutes] = useState((auth.diff_minutes || 0) % 60);
  const [confirmModal, setConfirmModal] = useState<{ action: 'approve' | 'reject'; message: string; onConfirm: () => Promise<void> } | null>(null);
  const [showOvertimeModal, setShowOvertimeModal] = useState(false);

  const isOwner = auth.user_id === currentUserId;
  const needsReason = auth.needs_employee_reason && !auth.employee_reason;
  const canManagerAct = canApprove && auth.status === 'pending' && (!auth.needs_employee_reason || auth.employee_reason);
  const canSubmitReason = auth.status === 'pending' && isOwner && needsReason && canSubmitPublicAuthRequest;
  const showSubmitReasonPermissionHint = auth.status === 'pending' && isOwner && needsReason && !canSubmitPublicAuthRequest;
  const isOvertime = auth.auth_type === 'overtime';

  const iconColorCls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    yellow: 'bg-yellow-100 text-yellow-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    purple: 'bg-purple-100 text-purple-600',
    red: 'bg-red-100 text-red-600',
    gray: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="rounded-lg border border-gray-200 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconColorCls[config.color] ?? iconColorCls.gray}`}>
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <p className="font-medium text-gray-900 text-sm">{config.label}</p>
            <p className="text-xs text-gray-500">{formatDiffMinutes(auth.diff_minutes)} {config.diffLabel}</p>
          </div>
        </div>
        <Badge variant={STATUS_VARIANT[auth.status] ?? 'default'}>
          {STATUS_LABEL[auth.status] ?? auth.status}
        </Badge>
      </div>

      {/* Pending — awaiting employee reason */}
      {auth.status === 'pending' && auth.needs_employee_reason && !auth.employee_reason && (
        <p className="text-xs text-orange-600">Awaiting employee reason before approval</p>
      )}

      {/* Employee submits reason */}
      {canSubmitReason && (
        <div className="space-y-2">
          <textarea
            rows={2}
            placeholder="Enter your reason..."
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <Button
            size="sm"
            disabled={!reasonText.trim() || reasonLoading}
            onClick={async () => {
              setReasonLoading(true);
              try {
                await onReasonSubmit(auth.id, reasonText);
                setReasonText('');
                showSuccessToast('Reason submitted.');
              } catch (err: any) {
                showErrorToast(err?.response?.data?.error || 'Failed to submit reason.');
              } finally {
                setReasonLoading(false);
              }
            }}
          >
            {reasonLoading ? 'Submitting...' : 'Submit Reason'}
          </Button>
        </div>
      )}

      {showSubmitReasonPermissionHint && (
        <p className="text-xs text-amber-700">
          You do not have permission to submit a reason for this request.
        </p>
      )}

      {/* Show submitted reason */}
      {auth.employee_reason && (
        <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
          <span className="font-medium">Employee reason: </span>{auth.employee_reason}
        </div>
      )}

      {/* Show rejection reason */}
      {auth.status === 'rejected' && auth.rejection_reason && (
        <div className="rounded bg-red-50 p-2 text-xs text-red-700">
          <span className="font-medium">Rejection reason: </span>{auth.rejection_reason}
        </div>
      )}

      {/* Show approved overtime type */}
      {auth.status === 'approved' && auth.overtime_type && (
        <div className="rounded bg-blue-50 p-2 text-xs text-blue-700">
          <span className="font-medium">Overtime Type: </span>
          {OVERTIME_TYPE_LABELS[auth.overtime_type] ?? auth.overtime_type}
        </div>
      )}

      {/* Resolved by */}
      {auth.resolved_by_name && (
        <p className="text-xs text-gray-500">
          {auth.status === 'approved' ? 'Approved' : 'Rejected'} by {auth.resolved_by_name}
        </p>
      )}

      {/* Manager overtime approve */}
      {canManagerAct && isOvertime && !rejectMode && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() => setShowOvertimeModal(true)}
          >
            <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Approve</span>
          </Button>
          <Button size="sm" variant="danger" onClick={() => setRejectMode(true)}>
            <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Reject</span>
          </Button>
        </div>
      )}

      {/* Manager standard approve/reject */}
      {canManagerAct && !isOvertime && !rejectMode && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="success"
            onClick={() => setConfirmModal({
              action: 'approve',
              message: 'Confirm approval of this request?',
              onConfirm: async () => {
                setApproveLoading(true);
                try {
                  await onApprove(auth.id);
                  showSuccessToast('Authorization approved.');
                } catch (err: any) {
                  showErrorToast(err?.response?.data?.error || 'Failed to approve request.');
                } finally {
                  setApproveLoading(false);
                }
              },
            })}
          >
            <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Approve</span>
          </Button>
          <Button size="sm" variant="danger" onClick={() => setRejectMode(true)}>
            <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Reject</span>
          </Button>
        </div>
      )}

      {/* Reject form */}
      {canManagerAct && rejectMode && (
        <div className="space-y-2">
          <textarea
            rows={2}
            placeholder="Reason for rejection..."
            value={rejectText}
            onChange={(e) => setRejectText(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={!rejectText.trim()}
              onClick={() => setConfirmModal({
                action: 'reject',
                message: `Reject with reason: "${rejectText}"?`,
                onConfirm: async () => {
                  setRejectLoading(true);
                  try {
                    await onReject(auth.id, rejectText);
                    setRejectText('');
                    setRejectMode(false);
                    showSuccessToast('Authorization rejected.');
                  } catch (err: any) {
                    showErrorToast(err?.response?.data?.error || 'Failed to reject request.');
                  } finally {
                    setRejectLoading(false);
                  }
                },
              })}
            >
              Confirm Reject
            </Button>
            <Button size="sm" variant="secondary" onClick={() => { setRejectMode(false); setRejectText(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={approveLoading || rejectLoading ? undefined : () => setConfirmModal(null)}
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
                disabled={approveLoading || rejectLoading}
                onClick={async () => {
                  await confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {(approveLoading || rejectLoading) ? 'Processing...' : (confirmModal.action === 'approve' ? 'Approve' : 'Reject')}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={approveLoading || rejectLoading}
                onClick={() => setConfirmModal(null)}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}

        {showOvertimeModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={approveLoading ? undefined : () => setShowOvertimeModal(false)}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">Approve Overtime</p>
              <p className="mt-0.5 text-xs text-gray-500">Please select the overtime type to apply for this request.</p>
            </div>
            <div className="space-y-4 px-5 py-6">
              <OvertimeTypePicker
                value={selectedOvertimeType}
                onChange={setSelectedOvertimeType}
                hours={overtimeHours}
                setHours={setOvertimeHours}
                minutes={overtimeMinutes}
                setMinutes={setOvertimeMinutes}
                maxMinutes={auth.diff_minutes}
              />
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant="success"
                disabled={!selectedOvertimeType || approveLoading}
                onClick={async () => {
                  setApproveLoading(true);
                  try {
                    await onApprove(auth.id, selectedOvertimeType, overtimeHours, overtimeMinutes);
                    showSuccessToast('Authorization approved.');
                    setShowOvertimeModal(false);
                  } catch (err: any) {
                    showErrorToast(err?.response?.data?.error || 'Failed to approve request.');
                  } finally {
                    setApproveLoading(false);
                  }
                }}
              >
                {approveLoading ? 'Processing...' : 'Approve'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={approveLoading}
                onClick={() => setShowOvertimeModal(false)}
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

// --- Shift Card ---

function ShiftCard({
  shift,
  branchName,
  canEndShift,
  canExchangeShift,
  onClick,
  onEndShift,
  onExchangeShift,
}: {
  shift: any;
  branchName?: string;
  canEndShift: boolean;
  canExchangeShift: boolean;
  onClick: () => void;
  onEndShift: (id: string) => void;
  onExchangeShift: (shift: any) => void;
}) {
  const { prefix, name } = parseEmployeeName(shift.employee_name);
  const avatarUrl = resolveShiftAvatarUrl(shift);
  const dutyColor = DUTY_COLORS[shift.duty_color] ?? '#e5e7eb';
  const [avatarError, setAvatarError] = useState(false);
  const statusCfg = SHIFT_STATUS_CONFIG[shift.status] ?? { label: shift.status, cls: 'bg-gray-100 text-gray-700' };

  return (
    <div
      className={`flex flex-col rounded-xl border bg-white transition hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        'border-gray-200 hover:border-gray-300'
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Colored duty type bar at top */}
      <div
        className="h-1 w-full rounded-t-xl"
        style={{ backgroundColor: dutyColor }}
      />

      <div className="flex flex-col flex-1 p-4 gap-3">
        {/* Identity row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 min-w-0">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={name}
                className="h-9 w-9 shrink-0 rounded-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <AvatarFallback name={name} size="sm" />
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-sm text-gray-900">{name}</p>
              {prefix && <p className="text-[11px] text-gray-400">ID: {prefix}</p>}
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Metadata rows */}
        <div className="space-y-1.5 border-t border-gray-100 pt-2.5">
          {/* Duty type */}
          {shift.duty_type && (
            <div className="flex items-center gap-2">
              <span title="Duty Type"><Briefcase className="h-3.5 w-3.5 shrink-0 text-indigo-400" /></span>
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium text-gray-800"
                style={{ backgroundColor: dutyColor }}
              >
                {shift.duty_type}
              </span>
            </div>
          )}
          {/* Branch */}
          {branchName && (
            <div className="flex items-center gap-2">
              <span title="Branch"><MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" /></span>
              <span className="text-xs text-gray-700 truncate">{branchName}</span>
            </div>
          )}
          {/* Shift start */}
          <div className="flex items-center gap-2">
            <span title="Shift Start"><LogIn className="h-3.5 w-3.5 shrink-0 text-gray-400" /></span>
            <span className="text-xs text-gray-700">{fmtShift(shift.shift_start)}</span>
          </div>
          {/* Shift end */}
          <div className="flex items-center gap-2">
            <span title="Shift End"><LogOut className="h-3.5 w-3.5 shrink-0 text-gray-400" /></span>
            <span className="text-xs text-gray-700">{fmtShift(shift.shift_end)}</span>
          </div>
          {/* Hours */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span title="Allocated Hours"><Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" /></span>
              <span className="text-xs text-gray-700">{Number(shift.allocated_hours).toFixed(2)} hrs allocated</span>
            </div>
          </div>
          {shift.total_worked_hours != null && (
            <div className="flex items-center gap-2">
              <span title="Worked Hours"><BadgeCheck className="h-3.5 w-3.5 shrink-0 text-green-500" /></span>
              <span className="text-xs text-gray-700">{Number(shift.total_worked_hours).toFixed(2)} hrs worked</span>
            </div>
          )}
          {/* Attendance */}
          {shift.check_in_status && (
            <div className="flex items-center gap-2">
              {shift.check_in_status === 'checked_in' ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                  <span className="text-[11px] font-medium text-green-700">Checked In</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-gray-400 shrink-0" />
                  <span className="text-[11px] font-medium text-gray-500">Checked Out</span>
                </>
              )}
            </div>
          )}
          {/* Pending approvals badge */}
          {shift.pending_approvals > 0 && (
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
              <span className="text-[11px] font-medium text-amber-700">{shift.pending_approvals} pending approval{shift.pending_approvals > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {(canExchangeShift || (shift.status === 'active' && canEndShift)) && (
          <div className="mt-auto border-t border-gray-100 pt-3 flex gap-2">
            {canExchangeShift && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onExchangeShift(shift);
                }}
              >
                Exchange Shift
              </Button>
            )}
            {shift.status === 'active' && canEndShift && (
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onEndShift(shift.id);
                }}
              >
                End Shift
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Log Entry ---

function LogEntry({
  log,
  isLast,
  currentUserId,
  shiftOwnerUserId,
  onOpenPeerEvaluation,
}: {
  log: any;
  isLast: boolean;
  currentUserId: string;
  shiftOwnerUserId: string | null;
  onOpenPeerEvaluation: (evaluationId: string) => void;
}) {
  const payload = log.odoo_payload as Record<string, unknown> | null;
  const empName = payload?.x_employee_contact_name
    ? parseEmployeeName(String(payload.x_employee_contact_name)).name
    : null;

  if (log.log_type === 'check_in') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <LogIn className="h-4 w-4 text-green-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">Check In</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          {empName && <p className="mt-1 text-sm text-gray-700">{empName}</p>}
          {log.cumulative_minutes != null && (
            <p className="text-xs text-gray-500">Cumulative: {log.cumulative_minutes} min</p>
          )}
        </div>
      </div>
    );
  }

  if (log.log_type === 'check_out') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
            <LogOut className="h-4 w-4 text-red-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">Check Out</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          {empName && <p className="mt-1 text-sm text-gray-700">{empName}</p>}
          <div className="mt-1 flex gap-4 text-xs text-gray-500">
            {log.worked_hours != null && (
              <span>Session: {Number(log.worked_hours).toFixed(2)} hrs</span>
            )}
            {log.cumulative_minutes != null && (
              <span>Cumulative: {log.cumulative_minutes} min</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (log.log_type === 'shift_updated') {
    const changes = log.changes as Record<string, { from: unknown; to: unknown }> | null;
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-100">
            <RefreshCw className="h-4 w-4 text-yellow-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="min-w-0 flex-1 pb-4">
          <p className="font-medium text-gray-900">Shift Updated</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          {changes && Object.keys(changes).length > 0 && (
            <div className="mt-2 overflow-x-auto rounded border border-gray-200 text-xs">
              <table className="min-w-full whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">Field</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">From</th>
                    <th className="px-3 py-1.5 text-left font-medium text-gray-500">To</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(changes).map(([field, { from, to }]) => (
                    <tr key={field} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 font-medium text-gray-700">
                        {FIELD_LABELS[field] ?? field}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500 line-through">
                        {fmtShiftUpdatedValue(field, from)}
                      </td>
                      <td className="px-3 py-1.5 font-medium text-gray-900">
                        {fmtShiftUpdatedValue(field, to)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (log.log_type === 'authorization_resolved') {
    const changes = log.changes as Record<string, unknown> | null;
    const resolution = changes?.resolution as string | undefined;
    const resolvedByName = typeof changes?.resolved_by_name === 'string'
      ? changes.resolved_by_name
      : null;
    const counterpartName = typeof changes?.counterpart_name === 'string'
      ? changes.counterpart_name
      : null;
    const showCounterpartLine = Boolean(counterpartName && counterpartName !== resolvedByName);
    const isApproved = resolution === 'approved';
    const isRejected = resolution === 'rejected';
    const isPendingLike = !isApproved && !isRejected;
    const authLabel = AUTH_TYPE_CONFIG[changes?.auth_type as string]?.label ?? (changes?.auth_type as string ?? '');
    const shiftExchangeTitle = (() => {
      switch (resolution) {
        case 'requested':
          return 'Shift Exchange Requested';
        case 'awaiting_hr':
          return 'Shift Exchange Awaiting Approval';
        case 'approved':
          return 'Shift Exchange Approved';
        case 'rejected':
          return 'Shift Exchange Rejected';
        default:
          return 'Shift Exchange Updated';
      }
    })();
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            isApproved ? 'bg-green-100' : isRejected ? 'bg-red-100' : 'bg-yellow-100'
          }`}>
            {isApproved ? (
              <CheckCircle className="h-4 w-4 text-green-600" />
            ) : isRejected ? (
              <XCircle className="h-4 w-4 text-red-600" />
            ) : (
              <Clock className="h-4 w-4 text-yellow-700" />
            )}
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">
            {changes?.auth_type === 'shift_exchange'
              ? shiftExchangeTitle
              : `${authLabel} ${isApproved ? 'Approved' : 'Rejected'}`}
          </p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          {resolvedByName && (
            <p className="text-xs text-gray-500">By {resolvedByName}</p>
          )}
          {showCounterpartLine && counterpartName && (
            <p className="text-xs text-gray-500">Counterpart: {counterpartName}</p>
          )}
          {!!changes?.note && (
            <p className="mt-1 text-xs text-gray-600">{String(changes.note)}</p>
          )}
          {!isPendingLike && isApproved && !!changes?.overtime_type && (
            <p className="text-xs text-blue-600">
              Type: {OVERTIME_TYPE_LABELS[changes!.overtime_type as string] ?? String(changes!.overtime_type)}
            </p>
          )}
          {isRejected && !!changes?.rejection_reason && (
            <p className="mt-1 text-xs text-red-600">Reason: {String(changes!.rejection_reason)}</p>
          )}
        </div>
      </div>
    );
  }

  if (log.log_type === 'shift_ended') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100">
            <Square className="h-4 w-4 text-gray-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">Shift Ended</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
        </div>
      </div>
    );
  }

  if (log.log_type === 'peer_evaluation_available') {
    const changes = log.changes as Record<string, unknown> | null;
    const evaluationId = typeof changes?.peer_evaluation_id === 'string'
      ? changes.peer_evaluation_id
      : null;
    const evaluationCount = Number(changes?.peer_evaluation_count ?? 1);
    const canReview = Boolean(
      evaluationId
      && shiftOwnerUserId
      && currentUserId
      && shiftOwnerUserId === currentUserId,
    );

    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100">
            <Clock className="h-4 w-4 text-blue-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">Peer Evaluation Available</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          <p className="mt-1 text-xs text-gray-600">
            {evaluationCount === 1
              ? 'You have a peer evaluation to complete for this shift.'
              : `You have ${evaluationCount} peer evaluations to complete for this shift.`}
          </p>
          {canReview && evaluationId && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-2"
              onClick={() => onOpenPeerEvaluation(evaluationId)}
            >
              Review Evaluation
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (log.log_type === 'peer_evaluation_submitted') {
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100">
            <CheckCircle className="h-4 w-4 text-green-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">Peer Evaluation Submitted</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
        </div>
      </div>
    );
  }

  if (log.log_type === 'peer_evaluation_expired') {
    const changes = log.changes as Record<string, unknown> | null;
    const evaluationCount = Number(changes?.peer_evaluation_count ?? 1);
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100">
            <XCircle className="h-4 w-4 text-red-600" />
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">Peer Evaluation Expired</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          <p className="mt-1 text-xs text-gray-600">
            {evaluationCount === 1
              ? 'The pending peer evaluation for this shift has expired.'
              : `${evaluationCount} pending peer evaluations for this shift have expired.`}
          </p>
        </div>
      </div>
    );
  }

  return null;
}

// --- Shift Detail Panel ---

function ShiftDetailPanel({
  shift,
  branchName,
  currentUserId,
  canApprove,
  canSubmitPublicAuthRequest,
  onClose,
  onAuthorizationUpdate,
  onOpenPeerEvaluation,
}: {
  shift: any;
  branchName?: string;
  currentUserId: string;
  canApprove: boolean;
  canSubmitPublicAuthRequest: boolean;
  onClose: () => void;
  onAuthorizationUpdate: (updatedAuth: any) => void;
  onOpenPeerEvaluation: (evaluationId: string) => void;
}) {
  const { prefix, name } = parseEmployeeName(shift.employee_name);
  const avatarUrl = resolveShiftAvatarUrl(shift);
  const [avatarError, setAvatarError] = useState(false);
  const logs: any[] = shift.logs ?? [];
  const authorizations: any[] = shift.authorizations ?? [];
  const statusCfg = SHIFT_STATUS_CONFIG[shift.status] ?? { label: shift.status, cls: 'bg-gray-100 text-gray-700' };

  const handleReasonSubmit = async (authId: string, reason: string) => {
    const res = await api.post(`/shift-authorizations/${authId}/reason`, { reason });
    onAuthorizationUpdate(res.data.data);
  };

  const handleApprove = async (authId: string, overtimeType?: string, hours?: number, minutes?: number) => {
    const body = overtimeType ? { overtimeType, hours, minutes } : {};
    const res = await api.post(`/shift-authorizations/${authId}/approve`, body);
    onAuthorizationUpdate(res.data.data);
  };

  const handleReject = async (authId: string, reason: string) => {
    const res = await api.post(`/shift-authorizations/${authId}/reject`, { reason });
    onAuthorizationUpdate(res.data.data);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Sticky top bar */}
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 shrink-0">
        <p className="text-sm font-semibold text-gray-700">Shift Details</p>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Dossier header block */}
        <div className="flex items-start gap-4 border-b border-gray-200 bg-white px-6 py-5">
          <div className="shrink-0">
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt={name}
                className="h-16 w-16 rounded-full object-cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-200 text-lg font-semibold text-gray-600">
                {name.split(' ').slice(0, 2).map((w: string) => w[0]?.toUpperCase() ?? '').join('')}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 leading-tight">{name}</h2>
            {prefix && <p className="text-xs text-gray-400 mt-0.5">ID: {prefix}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              {shift.duty_type && (
                <span
                  className="rounded-full px-2.5 py-0.5 text-xs font-medium text-gray-800"
                  style={{ backgroundColor: DUTY_COLORS[shift.duty_color] ?? '#e5e7eb' }}
                >
                  {shift.duty_type}
                </span>
              )}
              {branchName && (
                <span className="flex items-center gap-1 text-xs text-gray-500">
                  <MapPin className="h-3 w-3" />
                  {branchName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-3 px-5 py-4">
          {/* Shift Summary section */}
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Shift Summary</span>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                <p className="mt-0.5 text-sm font-medium text-gray-800">{fmtShift(shift.shift_start)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                <p className="mt-0.5 text-sm font-medium text-gray-800">{fmtShift(shift.shift_end)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Allocated Hours</p>
                <p className="mt-0.5 text-sm font-medium text-gray-800">{Number(shift.allocated_hours).toFixed(2)} hrs</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Total Worked</p>
                <p className="mt-0.5 text-sm font-medium text-gray-800">
                  {shift.total_worked_hours != null ? `${Number(shift.total_worked_hours).toFixed(2)} hrs` : '—'}
                </p>
              </div>
              {shift.check_in_status && (
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-gray-400">Attendance</p>
                  <p className="mt-0.5 text-sm font-medium">
                    {shift.check_in_status === 'checked_in' ? (
                      <span className="inline-flex items-center gap-1 text-green-700">
                        <span className="h-2 w-2 rounded-full bg-green-500" /> Checked In
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-gray-500">
                        <span className="h-2 w-2 rounded-full bg-gray-400" /> Checked Out
                      </span>
                    )}
                  </p>
                </div>
              )}
              <div>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Pending Approvals</p>
                <p className="mt-0.5 text-sm font-medium text-gray-800">
                  {shift.pending_approvals > 0 ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      {shift.pending_approvals}
                    </span>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Authorizations section */}
          {authorizations.length > 0 && (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Authorizations</span>
              </div>
              <div className="divide-y divide-gray-100 px-4 py-3 space-y-0">
                {authorizations.map((auth: any) => (
                  <div key={auth.id} className="py-2 first:pt-0 last:pb-0">
                    <AuthorizationCard
                      auth={auth}
                      currentUserId={currentUserId}
                      canApprove={canApprove}
                      canSubmitPublicAuthRequest={canSubmitPublicAuthRequest}
                      onReasonSubmit={handleReasonSubmit}
                      onApprove={handleApprove}
                      onReject={handleReject}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Log section */}
          <div className="overflow-hidden rounded-lg border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">Activity Log</span>
            </div>
            <div className="px-4 py-3">
              {logs.length === 0 ? (
                <p className="text-sm text-gray-400">No activity recorded yet.</p>
              ) : (
                <div>
                  {logs.map((log: any, idx: number) => (
                    <LogEntry
                      key={log.id}
                      log={log}
                      isLast={idx === logs.length - 1}
                      currentUserId={currentUserId}
                      shiftOwnerUserId={shift.user_id ?? null}
                      onOpenPeerEvaluation={onOpenPeerEvaluation}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Page ---

type TabType = 'all' | 'open' | 'active' | 'ended';

interface Filters {
  employeeName: string;
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  hasPendingApprovals: boolean;
  dutyType: string;
}

const DEFAULT_FILTERS: Filters = {
  employeeName: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'shift_start',
  sortOrder: 'desc',
  hasPendingApprovals: false,
  dutyType: '',
};

export function EmployeeShiftsPage() {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShift, setSelectedShift] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exchangeShiftSource, setExchangeShiftSource] = useState<any | null>(null);
  const [peerEvaluationModalId, setPeerEvaluationModalId] = useState<string | null>(null);
  const [isSuspendedSelf, setIsSuspendedSelf] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 639px)').matches
      : false,
  );

  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const branchList = useBranchStore((s) => s.branches);
  const socket = useSocket('/employee-shifts');
  const currentUser = useAuthStore((s) => s.user);
  const { hasAnyPermission, hasPermission } = usePermission();
  const canManageShift = hasAnyPermission(
    PERMISSIONS.SCHEDULE_MANAGE_SHIFT,
    PERMISSIONS.SCHEDULE_END_SHIFT,
    PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC,
  );
  const canApprove = canManageShift;
  const canEndShift = canManageShift;
  const canSubmitPublicAuthRequest = hasPermission(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE);

  type EndShiftConfirmStep = 1 | 2;
  interface EndShiftConfirmState {
    shiftId: string;
    step: EndShiftConfirmStep;
  }

  const [endShiftConfirm, setEndShiftConfirm] = useState<EndShiftConfirmState | null>(null);
  const [endShiftLoading, setEndShiftLoading] = useState(false);

  useEffect(() => {
    api
      .get('/account/profile')
      .then((res) => {
        const status = String(res.data?.data?.workInfo?.status ?? '').toLowerCase();
        setIsSuspendedSelf(status === 'suspended');
      })
      .catch(() => {});
  }, []);

  const branchMap = Object.fromEntries(branchList.map((b) => [b.id, b.name]));

  const fetchShifts = useCallback(() => {
    if (selectedBranchIds.length === 0) return;
    setLoading(true);
    const params: Record<string, string> = {
      branchIds: selectedBranchIds.join(','),
    };
    if (activeTab !== 'all') params.status = activeTab;
    if (filters.employeeName) params.employeeName = filters.employeeName;
    if (filters.dateFrom) params.shiftStartFrom = filters.dateFrom;
    if (filters.dateTo) params.shiftStartTo = filters.dateTo;
    if (filters.sortBy) params.sortBy = filters.sortBy;
    if (filters.sortOrder) params.sortOrder = filters.sortOrder;
    if (filters.hasPendingApprovals) params.hasPendingApprovals = 'true';
    if (filters.dutyType) params.dutyType = filters.dutyType;

    api
      .get('/employee-shifts', { params })
      .then((res) => setShifts(res.data.data || []))
      .catch((err: any) => {
        showErrorToast(err?.response?.data?.error || 'Failed to load employee shifts');
      })
      .finally(() => setLoading(false));
  }, [selectedBranchIds, activeTab, filters, showErrorToast]);

  const openDetail = async (shiftId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/employee-shifts/${shiftId}`);
      setSelectedShift(res.data.data);
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, "Failed to load shift detail");
      showErrorToast(message);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEndShift = async (shiftId: string): Promise<boolean> => {
    try {
      const res = await api.post(`/employee-shifts/${shiftId}/end`);
      setShifts((prev) =>
        prev.map((s) => (s.id === shiftId ? { ...s, ...res.data.data } : s)).filter(
          (s) => activeTab === 'all' || s.status === activeTab,
        ),
      );
      showSuccessToast('Shift ended successfully.');
      return true;
    } catch (err: unknown) {
      const message = getApiErrorMessage(err, "Failed to end shift");
      showErrorToast(message);
      return false;
    }
  };

  const requestEndShift = (shiftId: string) => {
    setEndShiftConfirm({ shiftId, step: 1 });
  };

  const closeEndShiftConfirm = () => {
    if (endShiftLoading) return;
    setEndShiftConfirm(null);
  };

  const continueEndShiftConfirm = () => {
    setEndShiftConfirm((prev) => (prev ? { ...prev, step: 2 } : prev));
  };

  const confirmEndShift = async () => {
    if (!endShiftConfirm) return;
    setEndShiftLoading(true);
    try {
      const ok = await handleEndShift(endShiftConfirm.shiftId);
      if (ok) setEndShiftConfirm(null);
    } finally {
      setEndShiftLoading(false);
    }
  };

  useEffect(() => {
    fetchShifts();
  }, [fetchShifts]);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!socket || selectedBranchIds.length === 0) return;
    for (const id of selectedBranchIds) socket.emit('join-branch', id);
    return () => {
      for (const id of selectedBranchIds) socket.emit('leave-branch', id);
    };
  }, [socket, selectedBranchIds]);

  useEffect(() => {
    if (!socket) return;

    socket.on('shift:new', (data: any) => {
      if (activeTab === 'all' || data.status === activeTab) {
        setShifts((prev) => [data, ...prev]);
      }
    });

    socket.on('shift:updated', (data: any) => {
      setShifts((prev) =>
        prev
          .map((s) => (s.id === data.id ? { ...s, ...data, logs: s.logs } : s))
          .filter((s) => activeTab === 'all' || s.status === activeTab),
      );
      setSelectedShift((prev: any) =>
        prev?.id === data.id ? { ...prev, ...data, logs: prev.logs, authorizations: prev.authorizations } : prev,
      );
    });

    socket.on('shift:log-new', (data: any) => {
      if (data.log_type === 'check_out' && data.shift_id && data.total_worked_hours != null) {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === data.shift_id
              ? { ...s, total_worked_hours: data.total_worked_hours }
              : s,
          ),
        );
        setSelectedShift((prev: any) =>
          prev?.id === data.shift_id
            ? { ...prev, total_worked_hours: data.total_worked_hours }
            : prev,
        );
      }
      setSelectedShift((prev: any) => {
        if (!prev || prev.id !== data.shift_id) return prev;
        return { ...prev, logs: [...(prev.logs || []), data] };
      });
    });

    socket.on('shift:authorization-new', (data: any) => {
      setSelectedShift((prev: any) => {
        if (!prev || prev.id !== data.shift_id) return prev;
        return { ...prev, authorizations: [...(prev.authorizations || []), data] };
      });
      if (data.status === 'pending') {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === data.shift_id
              ? { ...s, pending_approvals: (s.pending_approvals ?? 0) + 1 }
              : s,
          ),
        );
      }
    });

    socket.on('shift:authorization-updated', (data: any) => {
      setSelectedShift((prev: any) => {
        if (!prev || prev.id !== data.shift_id) return prev;
        return {
          ...prev,
          authorizations: (prev.authorizations || []).map((a: any) =>
            a.id === data.id ? data : a,
          ),
        };
      });
    });

    return () => {
      socket.off('shift:new');
      socket.off('shift:updated');
      socket.off('shift:log-new');
      socket.off('shift:authorization-new');
      socket.off('shift:authorization-updated');
    };
  }, [socket, activeTab]);

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    filters.employeeName,
    filters.dateFrom,
    filters.dateTo,
    filters.sortBy,
    filters.sortOrder,
    filters.hasPendingApprovals,
    selectedBranchIds.join(','),
    isMobile,
  ]);

  const hasActiveFilters =
    filters.employeeName ||
    filters.dateFrom ||
    filters.dateTo ||
    filters.hasPendingApprovals ||
    filters.dutyType ||
    filters.sortBy !== 'shift_start' ||
    filters.sortOrder !== 'desc';

  const toggleFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setPage(1);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setPage(1);
    setFiltersOpen(false);
  };

  const cancelFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(false);
  };

  const TABS: { id: TabType; label: string; icon: LucideIcon }[] = [
    { id: 'all', label: 'All', icon: Users },
    { id: 'open', label: 'Open', icon: CalendarDays },
    { id: 'active', label: 'Active', icon: Clock },
    { id: 'ended', label: 'Closed', icon: X },
  ];

  const pageSize = isMobile ? 6 : 12;
  const totalPages = Math.max(1, Math.ceil(shifts.length / pageSize));
  const pagedShifts = shifts.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const dutyTypeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const s of shifts) {
      if (s.duty_type) types.add(s.duty_type);
    }
    return Array.from(types).sort();
  }, [shifts]);

  return (
    <>
      <div className="space-y-5">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-3">
            <CalendarDays className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Employee Schedule</h1>
          </div>
          <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
            {TABS.find((t) => t.id === activeTab)?.label}
          </p>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Monitor and manage employee shifts across branches.
          </p>
        </div>

        {/* Status tabs + filter toggle */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={TABS}
            activeId={activeTab}
            onChange={(id) => {
              setActiveTab(id);
              setPage(1);
            }}
            layoutId="employee-shift-tabs"
            className="sm:flex-1"
          />

          <button
            type="button"
            onClick={toggleFilters}
            className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${
              hasActiveFilters
                ? 'border-primary-300 bg-primary-50 text-primary-700'
                : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">
                  !
                </span>
              )}
            </div>
            <span className="ml-auto">
              {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          </button>
        </div>

        {hasActiveFilters && (
          <p className="text-xs text-gray-500">Filters applied</p>
        )}

        {/* Filter panel — animated */}
        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              key="filter-panel"
              initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
              animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {/* Employee name */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Employee Name</label>
                    <input
                      type="text"
                      placeholder="Search employee..."
                      value={draftFilters.employeeName}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, employeeName: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  {/* Date range */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Date Range</label>
                    <DateRangePicker
                      dateFrom={draftFilters.dateFrom}
                      dateTo={draftFilters.dateTo}
                      onChange={(from, to) => setDraftFilters((f) => ({ ...f, dateFrom: from, dateTo: to }))}
                    />
                  </div>

                  {/* Duty type */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Duty Type</label>
                    <select
                      value={draftFilters.dutyType}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, dutyType: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">All duty types</option>
                      {dutyTypeOptions.map((dt) => (
                        <option key={dt} value={dt}>{dt}</option>
                      ))}
                    </select>
                  </div>

                  {/* Sort by + order */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Sort By</label>
                    <div className="flex gap-1.5">
                      <select
                        value={draftFilters.sortBy}
                        onChange={(e) => setDraftFilters((f) => ({ ...f, sortBy: e.target.value }))}
                        className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="shift_start">Shift Start</option>
                        <option value="allocated_hours">Allocated Hours</option>
                        <option value="pending_approvals">Pending Approvals</option>
                      </select>
                      <button
                        title="Descending"
                        type="button"
                        onClick={() => setDraftFilters((f) => ({ ...f, sortOrder: 'desc' }))}
                        className={`flex h-[34px] w-8 shrink-0 items-center justify-center rounded border text-sm transition-colors ${
                          draftFilters.sortOrder === 'desc'
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        title="Ascending"
                        type="button"
                        onClick={() => setDraftFilters((f) => ({ ...f, sortOrder: 'asc' }))}
                        className={`flex h-[34px] w-8 shrink-0 items-center justify-center rounded border text-sm transition-colors ${
                          draftFilters.sortOrder === 'asc'
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Pending approvals toggle */}
                  <div className="flex items-end">
                    <div className="flex w-full items-center rounded border border-gray-300 bg-white px-3 py-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <button
                          type="button"
                          onClick={() => setDraftFilters((f) => ({ ...f, hasPendingApprovals: !f.hasPendingApprovals }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            draftFilters.hasPendingApprovals ? 'bg-primary-600' : 'bg-gray-300'
                          }`}
                          aria-label="Toggle Pending Approvals"
                          aria-pressed={draftFilters.hasPendingApprovals}
                          role="switch"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              draftFilters.hasPendingApprovals ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span>Pending Approvals</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={clearFilters}>
                    Clear
                  </Button>
                  <Button type="button" className="w-full sm:w-auto" onClick={applyFilters}>
                    Apply
                  </Button>
                  <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={cancelFilters}>
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Shift grid */}
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
                <div className="h-1 w-[calc(100%+2rem)] rounded bg-gray-100 -mx-4 -mt-4 mb-4" />
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="h-9 w-9 rounded-full bg-gray-100" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3.5 w-28 rounded bg-gray-100" />
                    <div className="h-2.5 w-16 rounded bg-gray-100" />
                  </div>
                </div>
                <div className="space-y-2 border-t border-gray-100 pt-2.5">
                  <div className="h-3 w-24 rounded bg-gray-100" />
                  <div className="h-3 w-32 rounded bg-gray-100" />
                  <div className="h-3 w-28 rounded bg-gray-100" />
                </div>
              </div>
            ))}
          </div>
        ) : shifts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Users className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">No shifts found for the selected filters.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pagedShifts.map((shift) => (
                <ShiftCard
                  key={shift.id}
                  shift={shift}
                  branchName={branchMap[shift.branch_id]}
                  canEndShift={canEndShift}
                  canExchangeShift={
                    !isSuspendedSelf
                    && shift.status === 'open'
                    && shift.user_id
                    && shift.user_id === currentUser?.id
                  }
                  onClick={() => openDetail(shift.id)}
                  onEndShift={requestEndShift}
                  onExchangeShift={setExchangeShiftSource}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>Page {page} of {totalPages}</span>
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

      {/* Detail panel backdrop */}
      {(selectedShift || detailLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedShift(null)}
        />
      )}

      {/* End shift confirmation (2-step) */}
      <AnimatePresence>
        {endShiftConfirm && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={endShiftLoading ? undefined : closeEndShiftConfirm}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {endShiftConfirm.step === 1 ? "End this shift?" : "Final confirmation"}
              </p>
            </div>
            <div className="px-5 py-4">
              {endShiftConfirm.step === 1 ? (
                <p className="text-sm text-gray-700">
                  This will end the active shift and record a checkout time for the employee.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">
                    You are about to end this shift.
                  </p>
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-800">
                      This action can’t be undone.
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant="secondary"
                disabled={endShiftLoading}
                onClick={closeEndShiftConfirm}
              >
                Cancel
              </Button>
              {endShiftConfirm.step === 1 ? (
                <Button
                  className="flex-1"
                  variant="primary"
                  disabled={endShiftLoading}
                  onClick={continueEndShiftConfirm}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  className="flex-1"
                  variant="danger"
                  disabled={endShiftLoading}
                  onClick={confirmEndShift}
                >
                  {endShiftLoading ? "Ending..." : "End Shift"}
                </Button>
              )}
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>

      {/* Detail panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[560px] transform bg-white shadow-2xl transition-transform duration-300 ${
          selectedShift ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {detailLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-primary-600" />
          </div>
        ) : selectedShift ? (
          <ShiftDetailPanel
            shift={selectedShift}
            branchName={branchMap[selectedShift.branch_id]}
            currentUserId={currentUser?.id ?? ''}
            canApprove={canApprove}
            canSubmitPublicAuthRequest={canSubmitPublicAuthRequest}
            onClose={() => setSelectedShift(null)}
            onAuthorizationUpdate={(updatedAuth) => {
              setSelectedShift((prev: any) => {
                if (!prev) return prev;
                const updatedAuths = (prev.authorizations || []).map((a: any) =>
                  a.id === updatedAuth.id ? updatedAuth : a,
                );
                const newPending = updatedAuths.filter((a: any) => a.status === 'pending').length;
                setShifts((prevShifts) =>
                  prevShifts.map((s) =>
                    s.id === prev.id ? { ...s, pending_approvals: newPending } : s,
                  ),
                );
                return { ...prev, authorizations: updatedAuths, pending_approvals: newPending };
              });
            }}
            onOpenPeerEvaluation={(evaluationId) => setPeerEvaluationModalId(evaluationId)}
          />
        ) : null}
      </div>

      <ShiftExchangeFlowModal
        isOpen={Boolean(exchangeShiftSource)}
        fromShift={exchangeShiftSource ? {
          id: exchangeShiftSource.id,
          shift_start: exchangeShiftSource.shift_start,
          shift_end: exchangeShiftSource.shift_end,
          duty_type: exchangeShiftSource.duty_type,
          branch_name: branchMap[exchangeShiftSource.branch_id] ?? null,
        } : null}
        onClose={() => setExchangeShiftSource(null)}
        onCreated={() => { fetchShifts(); }}
      />

      <PeerEvaluationModal
        isOpen={Boolean(peerEvaluationModalId)}
        initialEvaluationId={peerEvaluationModalId}
        onClose={() => setPeerEvaluationModalId(null)}
      />
    </>
  );
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;

  const maybeResponse = "response" in err ? err.response : undefined;
  if (!maybeResponse || typeof maybeResponse !== "object") return fallback;

  const maybeData = "data" in maybeResponse ? maybeResponse.data : undefined;
  if (!maybeData || typeof maybeData !== "object") return fallback;

  const maybeError = "error" in maybeData ? maybeData.error : undefined;
  if (typeof maybeError === "string" && maybeError.trim() !== "") return maybeError;

  const maybeMessage = "message" in maybeData ? maybeData.message : undefined;
  if (typeof maybeMessage === "string" && maybeMessage.trim() !== "") return maybeMessage;

  return fallback;
}
