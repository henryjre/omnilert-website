import { useCallback, useEffect, useMemo, useState, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { api } from '@/shared/services/api.client';
import { OvertimeTypePicker } from '@/shared/components/OvertimeTypePicker';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { ShiftExchangeFlowModal } from '@/features/shift-exchange/components/ShiftExchangeFlowModal';
import { ShiftExchangeDetailModal } from '@/features/shift-exchange/components/ShiftExchangeDetailModal';
import { PeerEvaluationModal } from '@/features/peer-evaluations/components/PeerEvaluationModal';
import { PERMISSIONS } from '@omnilert/shared';
import { formatCompactDuration, formatDuration } from '@/shared/utils/duration';
import { formatDateTimeInManila } from '@/shared/utils/dateTime';
import { deriveAdjustedShiftSummary } from '@/shared/utils/shiftSummaryAdjustments';
import { type ComponentType } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Briefcase,
  Calendar,
  CircleCheck,
  ChevronDown,
  ChevronUp,
  ArrowLeftRight,
  CalendarClock,
  Clock,
  Coffee,
  Filter,
  LayoutGrid,
  LogIn,
  LogOut,
  MapPin,
  PlayCircle,
  RefreshCw,
  Square,
  X,
  XCircle,
} from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const DUTY_COLORS: Record<number, string> = {
  1: '#FF9C9C',
  2: '#F7C698',
  7: '#89E1DB',
  8: '#97A6F9',
};
const ALLOCATED_BREAK_HOURS = 1;

const ACCOUNT_SHIFT_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Upcoming', cls: 'bg-blue-100 text-blue-700' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  ended: { label: 'Closed', cls: 'bg-red-100 text-red-700' },
  absent: { label: 'Absent', cls: 'bg-gray-100 text-gray-700' },
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtShift(dt: string) {
  return formatDateTimeInManila(dt) ?? dt;
}

function fmtTime(iso: string) {
  return formatDateTimeInManila(iso) ?? iso;
}

function fmtShiftUpdatedValue(field: string, value: unknown): string {
  if (value == null) return '—';
  if (typeof value !== 'string') return String(value);

  const isShiftDateTimeField =
    field === 'start_datetime' ||
    field === 'end_datetime' ||
    field === 'shift_start' ||
    field === 'shift_end';

  if (!isShiftDateTimeField) return value;
  return formatDateTimeInManila(value) ?? value;
}

function fmtTimeShort(dt: string) {
  return new Date(dt).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function isInterimDutyShift(shift: any): boolean {
  return shift?.duty_type === 'Interim Duty';
}

function isActiveInterimDutyShift(shift: any): boolean {
  return isInterimDutyShift(shift) && shift?.status === 'active';
}

function getShiftEndDisplay(shift: any): string {
  return isActiveInterimDutyShift(shift) ? 'In Progress' : fmtShift(shift.shift_end);
}

function getAllocatedHoursDisplay(shift: any): string {
  return isActiveInterimDutyShift(shift)
    ? 'In Progress'
    : `${formatDuration(shift.allocated_hours)} allocated`;
}

function getShiftRangeDisplay(shift: any): string {
  return isActiveInterimDutyShift(shift)
    ? `${fmtTimeShort(shift.shift_start)}–In Progress`
    : `${fmtTimeShort(shift.shift_start)}–${fmtTimeShort(shift.shift_end)}`;
}

function getLinkedShiftIdFromInterimPayload(shift: any): string | null {
  if (!isInterimDutyShift(shift)) return null;
  const rawPayload = shift?.odoo_payload;
  const payload =
    typeof rawPayload === 'string'
      ? (() => {
          try {
            return JSON.parse(rawPayload) as Record<string, unknown>;
          } catch {
            return null;
          }
        })()
      : rawPayload && typeof rawPayload === 'object'
        ? (rawPayload as Record<string, unknown>)
        : null;
  const linkedShiftId =
    typeof payload?.linked_shift_id === 'string' ? payload.linked_shift_id.trim() : '';
  return linkedShiftId || null;
}

function dayKey(dt: string) {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function fmtDayHeading(key: string) {
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
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

function formatDiffMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

const AUTH_TYPE_CONFIG: Record<
  string,
  { label: string; color: string; Icon: ComponentType<{ className?: string }>; diffLabel: string }
> = {
  early_check_in: {
    label: 'Early Check In',
    color: 'blue',
    Icon: Clock,
    diffLabel: 'before shift start',
  },
  tardiness: { label: 'Tardiness', color: 'orange', Icon: AlertTriangle, diffLabel: 'late' },
  early_check_out: { label: 'Early Check Out', color: 'red', Icon: LogOut, diffLabel: 'early' },
  late_check_out: {
    label: 'Late Check Out',
    color: 'red',
    Icon: LogOut,
    diffLabel: 'after shift end',
  },
  overtime: { label: 'Overtime', color: 'red', Icon: Clock, diffLabel: 'overtime' },
  interim_duty: {
    label: 'Interim Duty',
    color: 'indigo',
    Icon: Briefcase,
    diffLabel: 'interim duty duration',
  },
  shift_exchange: { label: 'Shift Exchange', color: 'indigo', Icon: RefreshCw, diffLabel: '' },
  underbreak: { label: 'Underbreak', color: 'amber', Icon: Coffee, diffLabel: '' },
};

const OVERTIME_TYPE_LABELS: Record<string, string> = {
  normal_overtime: 'Normal Overtime',
  overtime_premium: 'Overtime Premium',
};

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'danger' | 'default'> = {
  pending: 'warning',
  locked: 'warning',
  approved: 'success',
  rejected: 'danger',
  no_approval_needed: 'default',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  locked: 'Locked',
  approved: 'Approved',
  rejected: 'Rejected',
  no_approval_needed: 'No Approval Needed',
};

function isPendingApprovalStatus(status: string | null | undefined): boolean {
  return status === 'pending' || status === 'locked';
}

// ─── Overtime blocker utility ─────────────────────────────────────────────────

function deriveOvertimeBlockState(auths: Array<{ auth_type: string; status: string }>): {
  blocked: boolean;
  blockerLabels: string[];
} {
  const BLOCKER_TYPES = new Set([
    'early_check_in',
    'tardiness',
    'early_check_out',
    'late_check_out',
    'interim_duty',
    'underbreak',
  ]);
  const AUTH_LABELS: Record<string, string> = {
    early_check_in: 'Early Check In',
    tardiness: 'Tardiness',
    early_check_out: 'Early Check Out',
    late_check_out: 'Late Check Out',
    interim_duty: 'Interim Duty',
    underbreak: 'Underbreak',
  };
  const pendingBlockers = auths.filter(
    (a) => BLOCKER_TYPES.has(a.auth_type) && a.status === 'pending',
  );
  return {
    blocked: pendingBlockers.length > 0,
    blockerLabels: pendingBlockers.map((a) => AUTH_LABELS[a.auth_type] ?? a.auth_type),
  };
}

// ─── Authorization Card ───────────────────────────────────────────────────────

const AuthorizationCard = memo(
  ({
    auth,
    currentUserId,
    canApprove,
    canSubmitPublicAuthRequest,
    siblingAuths,
    onReasonSubmit,
    onApprove,
    onReject,
  }: {
    auth: any;
    currentUserId: string;
    canApprove: boolean;
    canSubmitPublicAuthRequest: boolean;
    siblingAuths: Array<{ auth_type: string; status: string }>;
    onReasonSubmit: (id: string, reason: string) => Promise<void>;
    onApprove: (
      id: string,
      overtimeType?: string,
      hours?: number,
      minutes?: number,
    ) => Promise<void>;
    onReject: (id: string, reason: string) => Promise<void>;
  }) => {
    const config = AUTH_TYPE_CONFIG[auth.auth_type] ?? {
      label: auth.auth_type,
      color: 'gray',
      Icon: Clock,
      diffLabel: '',
    };
    const { Icon } = config;

    const [reasonText, setReasonText] = useState('');
    const [reasonLoading, setReasonLoading] = useState(false);
    const [rejectMode, setRejectMode] = useState(false);
    const [rejectText, setRejectText] = useState('');
    const [rejectLoading, setRejectLoading] = useState(false);
    const [approveLoading, setApproveLoading] = useState(false);
    const [selectedOvertimeType, setSelectedOvertimeType] = useState<string>('normal_overtime');
    const [overtimeHours, setOvertimeHours] = useState(Math.floor((auth.diff_minutes || 0) / 60));
    const [overtimeMinutes, setOvertimeMinutes] = useState((auth.diff_minutes || 0) % 60);
    const [showOvertimeModal, setShowOvertimeModal] = useState(false);

    const isOwner = auth.user_id === currentUserId;
    const needsReason = auth.needs_employee_reason && !auth.employee_reason;
    const canManagerAct =
      canApprove &&
      auth.status === 'pending' &&
      (!auth.needs_employee_reason || auth.employee_reason);
    const canSubmitReason =
      auth.status === 'pending' && isOwner && needsReason && canSubmitPublicAuthRequest;
    const showSubmitReasonPermissionHint =
      auth.status === 'pending' && isOwner && needsReason && !canSubmitPublicAuthRequest;
    const isOvertime = auth.auth_type === 'overtime';
    const { blocked: overtimeBlocked, blockerLabels } = isOvertime
      ? deriveOvertimeBlockState(siblingAuths)
      : { blocked: false, blockerLabels: [] };

    const iconColorCls: Record<string, string> = {
      blue: 'bg-blue-100 text-blue-600',
      orange: 'bg-orange-100 text-orange-600',
      yellow: 'bg-yellow-100 text-yellow-600',
      indigo: 'bg-indigo-100 text-indigo-600',
      purple: 'bg-purple-100 text-purple-600',
      red: 'bg-red-100 text-red-600',
      amber: 'bg-amber-100 text-amber-600',
      gray: 'bg-gray-100 text-gray-600',
    };

    return (
      <div className="rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${iconColorCls[config.color] ?? iconColorCls.gray}`}
            >
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">{config.label}</p>
              <p className="text-xs text-gray-500">
                {formatDiffMinutes(auth.diff_minutes)} {config.diffLabel}
              </p>
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[auth.status] ?? 'default'}>
            {STATUS_LABEL[auth.status] ?? auth.status}
          </Badge>
        </div>

        {auth.status === 'pending' && auth.needs_employee_reason && !auth.employee_reason && (
          <p className="text-xs text-orange-600">Awaiting employee reason before manager review</p>
        )}

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
                await onReasonSubmit(auth.id, reasonText);
                setReasonText('');
                setReasonLoading(false);
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

        {auth.employee_reason && (
          <div className="rounded bg-gray-50 p-2 text-xs text-gray-700">
            <span className="font-medium">Employee reason: </span>
            {auth.employee_reason}
          </div>
        )}

        {auth.auth_type === 'overtime' && auth.status === 'locked' && (
          <div className="rounded bg-amber-50 p-2 text-xs text-amber-700">
            {blockerLabels.length > 0
              ? `Resolve ${blockerLabels.join(' and ')} before reviewing overtime.`
              : 'Resolve the remaining shift authorizations before reviewing overtime.'}
          </div>
        )}

        {auth.status === 'rejected' && auth.rejection_reason && (
          <div className="rounded bg-red-50 p-2 text-xs text-red-700">
            <span className="font-medium">Rejection reason: </span>
            {auth.rejection_reason}
          </div>
        )}

        {auth.status === 'approved' && auth.overtime_type && (
          <div className="rounded bg-blue-50 p-2 text-xs text-blue-700">
            <span className="font-medium">Overtime Type: </span>
            {OVERTIME_TYPE_LABELS[auth.overtime_type] ?? auth.overtime_type}
          </div>
        )}

        {auth.resolved_by_name && (
          <p className="text-xs text-gray-500">
            {auth.status === 'approved' ? 'Approved' : 'Rejected'} by {auth.resolved_by_name}
          </p>
        )}

        {canManagerAct && auth.auth_type === 'overtime' && !rejectMode && (
          <div className="space-y-1">
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="success"
                disabled={overtimeBlocked}
                onClick={() => setShowOvertimeModal(true)}
              >
                <span className="flex items-center gap-1">
                  <CircleCheck className="h-3.5 w-3.5" /> Approve
                </span>
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={overtimeBlocked}
                onClick={() => setRejectMode(true)}
              >
                <span className="flex items-center gap-1">
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </span>
              </Button>
            </div>
            {overtimeBlocked && (
              <p className="text-xs text-amber-600 mt-1">
                Resolve {blockerLabels.join(' and ')} before reviewing overtime.
              </p>
            )}
          </div>
        )}

        {canManagerAct && auth.auth_type !== 'overtime' && !rejectMode && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              disabled={approveLoading}
              onClick={async () => {
                setApproveLoading(true);
                await onApprove(auth.id);
                setApproveLoading(false);
              }}
            >
              {approveLoading ? (
                'Approving...'
              ) : (
                <span className="flex items-center gap-1">
                  <CircleCheck className="h-3.5 w-3.5" /> Approve
                </span>
              )}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRejectMode(true)}>
              <span className="flex items-center gap-1">
                <XCircle className="h-3.5 w-3.5" /> Reject
              </span>
            </Button>
          </div>
        )}

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
                disabled={!rejectText.trim() || rejectLoading}
                onClick={async () => {
                  setRejectLoading(true);
                  await onReject(auth.id, rejectText);
                  setRejectText('');
                  setRejectMode(false);
                  setRejectLoading(false);
                }}
              >
                {rejectLoading ? 'Rejecting...' : 'Confirm Reject'}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRejectMode(false);
                  setRejectText('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <AnimatePresence>
          {showOvertimeModal && (
            <AnimatedModal
              maxWidth="max-w-sm"
              zIndexClass="z-[60]"
              onBackdropClick={approveLoading ? undefined : () => setShowOvertimeModal(false)}
            >
              <div className="border-b border-gray-200 px-5 py-4">
                <p className="font-semibold text-gray-900">Approve Overtime</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Please select the overtime type to apply for this request.
                </p>
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
                      await onApprove(
                        auth.id,
                        selectedOvertimeType,
                        overtimeHours,
                        overtimeMinutes,
                      );
                      setShowOvertimeModal(false);
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
  },
);

// ─── Log Entry ────────────────────────────────────────────────────────────────

const LogEntry = memo(
  ({
    log,
    isLast,
    highlight,
    currentUserId,
    shiftOwnerUserId,
    onOpenShiftExchangeRequest,
    onOpenPeerEvaluation,
  }: {
    log: any;
    isLast: boolean;
    /** When true, the entry pulses with a yellow highlight to draw the user's eye. */
    highlight?: boolean;
    currentUserId: string;
    shiftOwnerUserId: string | null;
    onOpenShiftExchangeRequest?: (requestId: string) => void;
    onOpenPeerEvaluation?: (evaluationId: string) => void;
  }) => {
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
            {log.worked_hours != null && (
              <p className="mt-1 text-xs text-gray-600">
                Duration: {formatDuration(Number(log.worked_hours))}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (log.log_type === 'shift_updated') {
      const changes = log.changes as Record<string, { from: unknown; to: unknown }> | null;
      const inner = (
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

      if (highlight) {
        return (
          <motion.div
            className="-mx-2 rounded-lg px-2"
            animate={{
              backgroundColor: [
                'rgba(254, 240, 138, 0)',
                'rgba(254, 240, 138, 0.7)',
                'rgba(254, 240, 138, 0)',
                'rgba(254, 240, 138, 0.5)',
                'rgba(254, 240, 138, 0)',
              ],
            }}
            transition={{ duration: 2.8, ease: 'easeInOut', times: [0, 0.2, 0.5, 0.7, 1] }}
          >
            {inner}
          </motion.div>
        );
      }
      return inner;
    }

    if (log.log_type === 'authorization_resolved') {
      const changes = log.changes as Record<string, unknown> | null;
      const resolution = changes?.resolution as string | undefined;
      const shiftExchangeRequestId =
        typeof changes?.shift_exchange_request_id === 'string'
          ? changes.shift_exchange_request_id
          : null;
      const shiftExchangeSideRaw = changes?.shift_exchange_side;
      const shiftExchangeSide =
        shiftExchangeSideRaw === 'requester' || shiftExchangeSideRaw === 'accepting'
          ? shiftExchangeSideRaw
          : null;
      const resolvedByName =
        typeof changes?.resolved_by_name === 'string' ? changes.resolved_by_name : null;
      const counterpartName =
        typeof changes?.counterpart_name === 'string' ? changes.counterpart_name : null;
      const showCounterpartLine = Boolean(counterpartName && counterpartName !== resolvedByName);
      const noteLower = String(changes?.note ?? '').toLowerCase();
      const inferredSide =
        shiftExchangeSide ??
        (noteLower.startsWith('you ') || noteLower.includes('with you')
          ? 'accepting'
          : 'requester');
      const canReviewFromLog =
        changes?.auth_type === 'shift_exchange' &&
        Boolean(shiftExchangeRequestId) &&
        inferredSide === 'accepting';
      const isApproved = resolution === 'approved';
      const isRejected = resolution === 'rejected';
      const isPendingLike = !isApproved && !isRejected;
      const authLabel =
        AUTH_TYPE_CONFIG[changes?.auth_type as string]?.label ??
        (changes?.auth_type as string) ??
        '';
      const shiftExchangeTitle = (() => {
        switch (resolution) {
          case 'requested':
            return 'Shift Exchange Requested';
          case 'awaiting_hr':
            return 'Shift Exchange Approved – Awaiting HR Approval';
          case 'approved':
            return 'Shift Exchange Approved';
          case 'rejected':
            return 'Shift Exchange Rejected';
          default:
            return 'Shift Exchange Updated';
        }
      })();
      const inner = (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                changes?.auth_type === 'shift_exchange'
                  ? 'bg-orange-100'
                  : isApproved
                    ? 'bg-green-100'
                    : isRejected
                      ? 'bg-red-100'
                      : 'bg-yellow-100'
              }`}
            >
              {changes?.auth_type === 'shift_exchange' ? (
                <ArrowLeftRight className="h-4 w-4 text-orange-600" />
              ) : isApproved ? (
                <CircleCheck className="h-4 w-4 text-green-600" />
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
            {resolvedByName && <p className="text-xs text-gray-500">By {resolvedByName}</p>}
            {showCounterpartLine && counterpartName && (
              <p className="text-xs text-gray-500">
                {changes?.auth_type === 'shift_exchange'
                  ? `${inferredSide === 'accepting' ? 'Requester' : 'Receiver'}: ${counterpartName}`
                  : `Counterpart: ${counterpartName}`}
              </p>
            )}
            {!!changes?.note && (
              <p className="mt-1 text-xs text-gray-600">{String(changes.note)}</p>
            )}
            {canReviewFromLog && shiftExchangeRequestId && onOpenShiftExchangeRequest && (
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                onClick={() => onOpenShiftExchangeRequest(shiftExchangeRequestId)}
              >
                Review Request
              </Button>
            )}
            {isRejected && !!changes?.rejection_reason && (
              <p className="mt-1 text-xs text-red-600">
                Reason: {String(changes!.rejection_reason)}
              </p>
            )}
            {!isPendingLike && isApproved && !!changes?.overtime_type && (
              <p className="mt-1 text-xs text-blue-600">
                Type:{' '}
                {OVERTIME_TYPE_LABELS[changes!.overtime_type as string] ??
                  String(changes!.overtime_type)}
              </p>
            )}
          </div>
        </div>
      );

      if (highlight) {
        return (
          <motion.div
            className="-mx-2 rounded-lg px-2"
            animate={{
              backgroundColor: [
                'rgba(219, 234, 254, 0)',
                'rgba(219, 234, 254, 0.85)',
                'rgba(219, 234, 254, 0)',
                'rgba(219, 234, 254, 0.6)',
                'rgba(219, 234, 254, 0)',
              ],
            }}
            transition={{ duration: 2.8, ease: 'easeInOut', times: [0, 0.2, 0.5, 0.7, 1] }}
          >
            {inner}
          </motion.div>
        );
      }

      return inner;
    }

    if (log.log_type === 'shift_ended') {
      const changes = log.changes as Record<string, unknown> | null;
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
            {Boolean(changes?.ended_by) && (
              <p className="text-xs text-gray-600 mt-1">
                Ended by:{' '}
                <span className="font-medium">{String(changes?.ended_by ?? 'Unknown')}</span>
              </p>
            )}
          </div>
        </div>
      );
    }

    if (log.log_type === 'peer_evaluation_available') {
      const changes = log.changes as Record<string, unknown> | null;
      const evaluationId =
        typeof changes?.peer_evaluation_id === 'string' ? changes.peer_evaluation_id : null;
      const evaluationCount = Number(changes?.peer_evaluation_count ?? 1);
      const canReview = Boolean(
        evaluationId &&
        onOpenPeerEvaluation &&
        shiftOwnerUserId &&
        currentUserId &&
        shiftOwnerUserId === currentUserId,
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
                onClick={() => onOpenPeerEvaluation?.(evaluationId)}
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
              <CircleCheck className="h-4 w-4 text-green-600" />
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

    if (log.log_type === 'break_start' || log.log_type === 'break_end') {
      const isStart = log.log_type === 'break_start';
      const changes = log.changes as any;
      return (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
              <Coffee className="h-4 w-4 text-amber-600" />
            </div>
            {!isLast && <div className="w-px flex-1 bg-gray-200" />}
          </div>
          <div className="pb-4">
            <p className="font-medium text-gray-900">{isStart ? 'Started Break' : 'Ended Break'}</p>
            <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
            {!isStart && changes?.duration_minutes != null && (
              <p className="mt-1 text-xs text-gray-600">
                Duration: {formatDuration(Number(changes.duration_minutes) / 60)}
              </p>
            )}
          </div>
        </div>
      );
    }

    if (log.log_type === 'field_task_start' || log.log_type === 'field_task_end') {
      const isStart = log.log_type === 'field_task_start';
      const changes = log.changes as any;
      return (
        <div className="flex gap-3">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100">
              <MapPin className="h-4 w-4 text-purple-600" />
            </div>
            {!isLast && <div className="w-px flex-1 bg-gray-200" />}
          </div>
          <div className="pb-4">
            <p className="font-medium text-gray-900">
              {isStart ? 'Started Field Task' : 'Ended Field Task'}
            </p>
            <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
            {isStart && changes?.details?.reason && (
              <p className="mt-1 text-xs text-gray-600">Reason: {changes.details.reason}</p>
            )}
            {!isStart && changes?.duration_minutes != null && (
              <p className="mt-1 text-xs text-gray-600">
                Duration: {formatDuration(Number(changes.duration_minutes) / 60)}
              </p>
            )}
          </div>
        </div>
      );
    }

    return null;
  },
);

// ─── Shift Progress Bar ───────────────────────────────────────────────────────

function ShiftProgressBar({
  label,
  value,
  max,
  color,
  adjusted = false,
  uncapped = false,
}: {
  label: string;
  value: number;
  max?: number | null;
  color: 'blue' | 'amber';
  adjusted?: boolean;
  uncapped?: boolean;
}) {
  const resolvedMax = typeof max === 'number' ? max : 0;
  const isOverflow = !uncapped && value > resolvedMax && resolvedMax > 0;
  const displayMax = uncapped ? value : isOverflow ? value : resolvedMax;
  const normalPct =
    uncapped || resolvedMax <= 0 || displayMax <= 0
      ? 0
      : Math.min((resolvedMax / displayMax) * 100, 100);
  const fillPct = uncapped
    ? value > 0
      ? 100
      : 0
    : displayMax > 0
      ? Math.min((value / displayMax) * 100, 100)
      : 0;

  const trackCls = 'h-2 w-full overflow-hidden rounded-full bg-gray-100 relative';
  const normalFillCls =
    color === 'blue'
      ? 'h-full rounded-full bg-primary-500'
      : 'h-full rounded-full bg-amber-400';
  const overflowFillCls = 'h-full bg-red-400';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-600 uppercase tracking-wide">
          {label}
          {adjusted ? ' (ADJUSTED)' : ''}
        </span>
        <span className="text-gray-500 tabular-nums">
          <span className="sm:hidden">
            {uncapped
              ? formatCompactDuration(value)
              : `${formatCompactDuration(value)} / ${formatCompactDuration(resolvedMax)}`}
          </span>
          <span className="hidden sm:inline">
            {uncapped
              ? formatDuration(value)
              : `${formatDuration(value)} / ${formatDuration(resolvedMax)}`}
          </span>
        </span>
      </div>
      <div className={trackCls}>
        {uncapped ? (
          <div className={normalFillCls} style={{ width: `${fillPct}%` }} />
        ) : isOverflow ? (
          <>
            <div
              className={color === 'blue' ? 'h-full bg-primary-500' : 'h-full bg-amber-400'}
              style={{ width: `${normalPct}%`, position: 'absolute', top: 0, left: 0 }}
            />
            <div
              className={overflowFillCls}
              style={{ left: `${normalPct}%`, width: `${fillPct - normalPct}%`, position: 'absolute', top: 0, bottom: 0 }}
            />
            <div
              style={{
                position: 'absolute',
                top: 0,
                bottom: 0,
                left: `${normalPct}%`,
                width: '2px',
                backgroundColor: 'white',
                transform: 'translateX(-50%)',
              }}
            />
          </>
        ) : (
          <div className={normalFillCls} style={{ width: `${fillPct}%` }} />
        )}
      </div>
    </div>
  );
}

// ─── Shift Stacked Bar ────────────────────────────────────────────────────────

function ShiftStackedBar({
  segments,
  total,
  adjusted = false,
}: {
  segments: { label: string; value: number; color: 'blue' | 'amber' | 'purple' }[];
  total: number;
  adjusted?: boolean;
}) {
  const colorCls: Record<string, string> = {
    blue: 'bg-blue-500',
    amber: 'bg-amber-400',
    purple: 'bg-purple-500',
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-gray-600 uppercase tracking-wide">
          Total Active Hours
          {adjusted ? ' (ADJUSTED)' : ''}
        </span>
        <span className="text-gray-500 tabular-nums">
          <span className="sm:hidden">{formatCompactDuration(total)} total</span>
          <span className="hidden sm:inline">{formatDuration(total)} total</span>
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 flex">
        {total > 0
          ? segments.map((seg) => (
              <div
                key={seg.label}
                className={colorCls[seg.color]}
                style={{ width: `${(seg.value / total) * 100}%` }}
              />
            ))
          : null}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
        {segments.map((seg) => (
          <span key={seg.label} className="flex items-center gap-1 text-[11px] text-gray-500">
            <span className={`h-1.5 w-1.5 rounded-full ${colorCls[seg.color]}`} />
            <span className="sm:hidden">{formatCompactDuration(seg.value)} {seg.label}</span>
            <span className="hidden sm:inline">{formatDuration(seg.value)} {seg.label}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Shift Detail Panel ───────────────────────────────────────────────────────

const ShiftDetailPanel = memo(
  ({
    shift,
    branchName,
    currentUserId,
    canApprove,
    canSubmitPublicAuthRequest,
    highlightLog,
    onClose,
    onAuthorizationUpdate,
    onOpenShiftExchangeRequest,
    onOpenPeerEvaluation,
    onEndShift,
    canEndShift,
    onOpenActivityModal,
    showActivityModal,
    activityLoading,
    activityReason,
    onSetActivityReason,
    onActivityStart,
    onActivityEnd,
    onCloseActivityModal,
  }: {
    shift: any;
    branchName?: string;
    currentUserId: string;
    canApprove: boolean;
    canSubmitPublicAuthRequest: boolean;
    highlightLog?: string | null;
    onClose: () => void;
    onAuthorizationUpdate: (updatedAuth: any) => void;
    onOpenShiftExchangeRequest: (requestId: string) => void;
    onOpenPeerEvaluation: (evaluationId: string) => void;
    onEndShift: (shiftId: string) => void;
    canEndShift: boolean;
    onOpenActivityModal: (id: string, type: 'break' | 'field_task', isEnd: boolean) => void;
    showActivityModal: { id: string; type: 'break' | 'field_task'; isEnd: boolean } | null;
    activityLoading: boolean;
    activityReason: string;
    onSetActivityReason: (val: string) => void;
    onActivityStart: (type: 'break' | 'field_task') => void;
    onActivityEnd: () => void;
    onCloseActivityModal: () => void;
  }) => {
    const { prefix, name } = parseEmployeeName(shift.employee_name);
    const avatarUrl = resolveShiftAvatarUrl(shift);
    const dutyColor = DUTY_COLORS[shift.duty_color] ?? '#e5e7eb';
    const [avatarError, setAvatarError] = useState(false);
    const logs: any[] = shift.logs ?? [];
    const authorizations: any[] = shift.authorizations ?? [];
    const activeActivity = shift.active_activity;

    const totalBreakMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'break_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const totalFieldTaskMinutes = useMemo(
      () =>
        logs
          .filter((l) => l.log_type === 'field_task_end')
          .reduce((sum, l) => sum + (Number((l.changes as any)?.duration_minutes) || 0), 0),
      [logs],
    );

    const allocatedBreakHours = ALLOCATED_BREAK_HOURS;
    const effectiveAllocatedHours = Math.max(
      0,
      Number(shift.allocated_hours || 0) - allocatedBreakHours,
    );

    const isActive = shift.status === 'active';
    const isActiveInterimDuty = isActiveInterimDutyShift(shift);
    const checkInTime = useMemo(
      () => {
        const log = [...logs].reverse().find((l: any) => l.log_type === 'check_in');
        return log ? new Date(log.event_time).getTime() : null;
      },
      [logs],
    );
    const activeActivityStartMs = activeActivity?.start_time
      ? new Date(activeActivity.start_time).getTime()
      : null;

    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
      if (!isActive) return;
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }, [isActive]);

    const liveBreakHours = isActive && activeActivity?.activity_type === 'break' && activeActivityStartMs
      ? totalBreakMinutes / 60 + (now - activeActivityStartMs) / 3_600_000
      : totalBreakMinutes / 60;
    const liveFieldTaskHours = isActive && activeActivity?.activity_type === 'field_task' && activeActivityStartMs
      ? totalFieldTaskMinutes / 60 + (now - activeActivityStartMs) / 3_600_000
      : totalFieldTaskMinutes / 60;
    const totalBreakHours = liveBreakHours;
    const totalFieldTaskHours = liveFieldTaskHours;
    const liveSessionHours = isActive && checkInTime
      ? (now - checkInTime) / 3_600_000
      : 0;
    const totalWorkedHours = Number(shift.total_worked_hours || 0) + liveSessionHours;
    const adjustedSummary = useMemo(
      () =>
        deriveAdjustedShiftSummary({
          totalWorkedHours,
          totalBreakHours,
          totalFieldTaskHours,
          authorizations,
        }),
      [authorizations, totalBreakHours, totalFieldTaskHours, totalWorkedHours],
    );
    const adjustedWorkedHours =
      (adjustedSummary.adjusted.workedMinutes + adjustedSummary.adjusted.fieldTaskMinutes) / 60;
    const adjustedBreakHours = adjustedSummary.adjusted.breakMinutes / 60;
    const adjustedFieldTaskHours = adjustedSummary.adjusted.fieldTaskMinutes / 60;
    const adjustedTotalActiveHours = adjustedSummary.adjusted.totalActiveMinutes / 60;

    const highlightIdx = useMemo(() => {
      if (!highlightLog) return -1;
      for (let i = logs.length - 1; i >= 0; i--) {
        if ((logs[i] as any).log_type === highlightLog) return i;
      }
      return -1;
    }, [logs, highlightLog]);

    const handleReasonSubmit = async (authId: string, reason: string) => {
      const res = await api.post(`/shift-authorizations/${authId}/reason`, { reason });
      onAuthorizationUpdate(res.data.data);
    };

    const handleApprove = async (
      authId: string,
      overtimeType?: string,
      hours?: number,
      minutes?: number,
    ) => {
      const body = overtimeType ? { overtimeType, hours, minutes } : {};
      const res = await api.post(`/shift-authorizations/${authId}/approve`, body);
      onAuthorizationUpdate(res.data.data);
    };

    const handleReject = async (authId: string, reason: string) => {
      const res = await api.post(`/shift-authorizations/${authId}/reject`, { reason });
      onAuthorizationUpdate(res.data.data);
    };

    const statusCfg = ACCOUNT_SHIFT_STATUS_CONFIG[shift.status] ?? {
      label: String(shift.status),
      cls: 'bg-gray-100 text-gray-700',
    };

    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3.5 shrink-0">
          <p className="text-sm font-semibold text-gray-700">Shift Details</p>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
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
                  {name
                    .split(' ')
                    .slice(0, 2)
                    .map((w: string) => w[0]?.toUpperCase() ?? '')
                    .join('')}
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
                {activeActivity?.activity_type === 'break' && (
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                    On Break
                  </span>
                )}
                {activeActivity?.activity_type === 'field_task' && (
                  <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
                    Field Task
                  </span>
                )}
                {shift.duty_type && (
                  <span
                    className="rounded-full px-2.5 py-0.5 text-xs font-medium text-gray-800"
                    style={{ backgroundColor: dutyColor }}
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
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Shift Summary
                </span>
              </div>
              <div className="px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {fmtShift(shift.shift_start)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                    <p className="mt-0.5 text-sm font-medium text-gray-800">
                      {getShiftEndDisplay(shift)}
                    </p>
                  </div>
                  {shift.pending_approvals > 0 && (
                    <div className="col-span-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">
                        Pending Approvals
                      </p>
                      <p className="mt-0.5 text-sm font-bold text-amber-700 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        {shift.pending_approvals}
                      </p>
                    </div>
                  )}
                </div>
                <div className="border-t border-gray-100 pt-3 space-y-3">
                  <ShiftProgressBar
                    label="Worked Hours"
                    value={adjustedWorkedHours}
                    max={isActiveInterimDuty ? null : effectiveAllocatedHours}
                    color="blue"
                    adjusted={adjustedSummary.flags.workedAdjusted}
                    uncapped={isActiveInterimDuty}
                  />
                  <ShiftProgressBar
                    label="Break Hours"
                    value={adjustedBreakHours}
                    max={allocatedBreakHours}
                    color="amber"
                    adjusted={adjustedSummary.flags.breakAdjusted}
                  />
                  <ShiftStackedBar
                    total={adjustedTotalActiveHours}
                    segments={[
                      { label: 'worked', value: adjustedWorkedHours, color: 'blue' },
                      { label: 'break', value: adjustedBreakHours, color: 'amber' },
                      { label: 'field task', value: adjustedFieldTaskHours, color: 'purple' },
                    ]}
                    adjusted={adjustedSummary.flags.totalAdjusted}
                  />
                </div>
              </div>
              {shift.status === 'active' && (
                <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-3 space-y-3">
                  <div className="flex gap-2">
                    {(!activeActivity || activeActivity?.activity_type === 'break') &&
                      (activeActivity?.activity_type === 'break' ? (
                        <Button
                          className="flex-1"
                          variant="outline-danger"
                          size="sm"
                          disabled={activityLoading}
                          onClick={() => onOpenActivityModal(shift.id, 'break', true)}
                        >
                          <Coffee className="mr-2 h-4 w-4" />
                          End Break
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          variant="primary"
                          size="sm"
                          disabled={activityLoading || !!activeActivity}
                          onClick={() => onOpenActivityModal(shift.id, 'break', false)}
                        >
                          <Coffee className="mr-2 h-4 w-4" />
                          Break
                        </Button>
                      ))}

                    {(!activeActivity || activeActivity?.activity_type === 'field_task') &&
                      (activeActivity?.activity_type === 'field_task' ? (
                        <Button
                          className="flex-1"
                          variant="outline-danger"
                          size="sm"
                          disabled={activityLoading}
                          onClick={() => onOpenActivityModal(shift.id, 'field_task', true)}
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          End Task
                        </Button>
                      ) : (
                        <Button
                          className="flex-1"
                          variant="success"
                          size="sm"
                          disabled={activityLoading || !!activeActivity}
                          onClick={() => onOpenActivityModal(shift.id, 'field_task', false)}
                        >
                          <MapPin className="mr-2 h-4 w-4" />
                          Field Task
                        </Button>
                      ))}
                  </div>

                </div>
              )}
            </div>

            {authorizations.length > 0 && (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Authorizations
                  </span>
                </div>
                <div className="divide-y divide-gray-100 px-4 py-3">
                  {authorizations.map((auth: any) => (
                    <div key={auth.id} className="py-2 first:pt-0 last:pb-0">
                      <AuthorizationCard
                        auth={auth}
                        currentUserId={currentUserId}
                        canApprove={canApprove}
                        canSubmitPublicAuthRequest={canSubmitPublicAuthRequest}
                        siblingAuths={authorizations.filter((a: any) => a.auth_type !== 'overtime')}
                        onReasonSubmit={handleReasonSubmit}
                        onApprove={handleApprove}
                        onReject={handleReject}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-2.5">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Activity Log
                </span>
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
                        highlight={idx === highlightIdx}
                        currentUserId={currentUserId}
                        shiftOwnerUserId={shift.user_id ?? null}
                        onOpenShiftExchangeRequest={onOpenShiftExchangeRequest}
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
  },
);

// ─── Shift Card for My Account (mirrors Employee Schedule style) ──────────────

const MyShiftCard = memo(
  ({
    shift,
    branchName,
    canExchangeShift,
    canEndShift,
    onClick,
    onEndShift,
    onExchangeShift,
    onOpenActivityModal,
    activityLoading,
  }: {
    shift: any;
    branchName?: string;
    canExchangeShift: boolean;
    canEndShift: boolean;
    onClick: () => void;
    onEndShift: (id: string) => void;
    onExchangeShift: (shift: any) => void;
    onOpenActivityModal: (id: string, type: 'break' | 'field_task', isEnd: boolean) => void;
    activityLoading: boolean;
  }) => {
    const { prefix, name } = parseEmployeeName(shift.employee_name);
    const avatarUrl = resolveShiftAvatarUrl(shift);
    const dutyColor = DUTY_COLORS[shift.duty_color] ?? '#e5e7eb';
    const [avatarError, setAvatarError] = useState(false);
    const activeActivity = shift.active_activity;
    const statusCfg = ACCOUNT_SHIFT_STATUS_CONFIG[shift.status] ?? {
      label: String(shift.status),
      cls: 'bg-gray-100 text-gray-700',
    };

    return (
      <div
        className="flex flex-col rounded-xl border bg-white overflow-hidden transition hover:shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 border-gray-200 hover:border-gray-300"
        onClick={onClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick()}
      >
        <div className="h-1 w-full" style={{ backgroundColor: dutyColor }} />

        <div className="flex flex-col flex-1 p-4 gap-3">
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
            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusCfg.cls}`}>
                {statusCfg.label}
              </span>
              {activeActivity?.activity_type === 'break' && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                  On Break
                </span>
              )}
              {activeActivity?.activity_type === 'field_task' && (
                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-medium text-purple-700">
                  Field Task
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1.5 border-t border-gray-100 pt-2.5">
            {shift.duty_type && (
              <div className="flex items-center gap-2">
                <span title="Duty Type">
                  <Briefcase className="h-3.5 w-3.5 shrink-0 text-indigo-400" />
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-medium text-gray-800"
                  style={{ backgroundColor: dutyColor }}
                >
                  {shift.duty_type}
                </span>
              </div>
            )}
            {branchName && (
              <div className="flex items-center gap-2">
                <span title="Branch">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                </span>
                <span className="text-xs text-gray-700 truncate">{branchName}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span title="Shift Start">
                <LogIn className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              </span>
              <span className="text-xs text-gray-700">{fmtShift(shift.shift_start)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span title="Shift End">
                <LogOut className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              </span>
              <span className="text-xs text-gray-700">{getShiftEndDisplay(shift)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span title="Allocated Hours">
                <Clock className="h-3.5 w-3.5 shrink-0 text-gray-400" />
              </span>
              <span className="text-xs text-gray-700">{getAllocatedHoursDisplay(shift)}</span>
            </div>
            {shift.total_worked_hours != null && (
              <div className="flex items-center gap-2">
                <span title="Net Worked Hours">
                  <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                </span>
                <span className="text-xs text-gray-700">
                  {formatDuration(
                    Math.max(
                      0,
                      Number(shift.total_worked_hours || 0) - Number(shift.total_break_hours || 0),
                    ),
                  )}{' '}
                  worked
                </span>
              </div>
            )}
            {shift.pending_approvals > 0 && (
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-[11px] font-medium text-amber-700">
                  {shift.pending_approvals} pending approval{shift.pending_approvals > 1 ? 's' : ''}
                </span>
              </div>
            )}
          </div>

          {(canExchangeShift || (shift.status === 'active' && canEndShift)) && (
            <div className="mt-auto flex flex-col gap-2 border-t border-gray-100 pt-3">
              {shift.status === 'active' && (
                <>
                  <div className="flex gap-2">
                    {(!activeActivity || activeActivity?.activity_type === 'break') &&
                      (activeActivity?.activity_type === 'break' ? (
                        <Button
                          className="flex-1 px-1"
                          variant="outline-danger"
                          size="sm"
                          disabled={activityLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenActivityModal(shift.id, 'break', true);
                          }}
                        >
                          <Coffee className="mr-1.5 h-3.5 w-3.5" />
                          End Break
                        </Button>
                      ) : (
                        <Button
                          className="flex-1 px-1"
                          variant="primary"
                          size="sm"
                          disabled={activityLoading || !!activeActivity}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenActivityModal(shift.id, 'break', false);
                          }}
                        >
                          <Coffee className="mr-1.5 h-3.5 w-3.5" />
                          Break
                        </Button>
                      ))}

                    {(!activeActivity || activeActivity?.activity_type === 'field_task') &&
                      (activeActivity?.activity_type === 'field_task' ? (
                        <Button
                          className="flex-1 px-1"
                          variant="outline-danger"
                          size="sm"
                          disabled={activityLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenActivityModal(shift.id, 'field_task', true);
                          }}
                        >
                          <MapPin className="mr-1.5 h-3.5 w-3.5" />
                          End Task
                        </Button>
                      ) : (
                        <Button
                          className="flex-1 px-1"
                          variant="success"
                          size="sm"
                          disabled={activityLoading || !!activeActivity}
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenActivityModal(shift.id, 'field_task', false);
                          }}
                        >
                          <MapPin className="mr-1.5 h-3.5 w-3.5" />
                          Field Task
                        </Button>
                      ))}
                  </div>

                  {/* Removed Check Out button from card per user request */}
                </>
              )}

              {canExchangeShift && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    onExchangeShift(shift);
                  }}
                >
                  Exchange Shift
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
);

// ─── Shift Card Skeleton ──────────────────────────────────────────────────────

function MyShiftCardSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="h-1 w-full bg-gray-100" />
      <div className="p-4">
        <div className="flex items-center gap-2.5 mb-3">
          <div className="h-9 w-9 shrink-0 rounded-full bg-gray-100" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 w-28 rounded bg-gray-100" />
            <div className="h-2.5 w-16 rounded bg-gray-100" />
          </div>
          <div className="h-5 w-12 shrink-0 rounded-full bg-gray-100" />
        </div>
        <div className="space-y-2 border-t border-gray-100 pt-2.5">
          <div className="h-3 w-20 rounded bg-gray-100" />
          <div className="h-3 w-32 rounded bg-gray-100" />
          <div className="h-3 w-28 rounded bg-gray-100" />
          <div className="h-3 w-24 rounded bg-gray-100" />
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type TabType = 'all' | 'open' | 'active' | 'ended' | 'absent';
type SortBy = 'shift_start' | 'allocated_hours';
type SortOrder = 'asc' | 'desc';
interface Filters {
  dateFrom: string;
  dateTo: string;
  dutyType: string;
  sortBy: SortBy;
  sortOrder: SortOrder;
}

export function ScheduleTab() {
  const DEFAULT_FILTERS: Filters = {
    dateFrom: '',
    dateTo: '',
    dutyType: '',
    sortBy: 'shift_start',
    sortOrder: 'desc',
  };

  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuspendedSelf, setIsSuspendedSelf] = useState(false);
  const [exchangeShiftSource, setExchangeShiftSource] = useState<any | null>(null);
  const [shiftExchangeDetailRequestId, setShiftExchangeDetailRequestId] = useState<string | null>(
    null,
  );
  const [peerEvaluationModalId, setPeerEvaluationModalId] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectedShift, setSelectedShift] = useState<any | null>(null);
  const [highlightLog, setHighlightLog] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false,
  );

  const [searchParams, setSearchParams] = useSearchParams();
  const socket = useSocket('/employee-shifts');
  const currentUser = useAuthStore((s) => s.user);
  const { branches, selectedBranchIds } = useBranchStore();
  const { hasPermission } = usePermission();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const canApprove = hasPermission(PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC);
  const canSubmitPublicAuthRequest = hasPermission(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE);
  const canEndOwnShift =
    hasPermission(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE) ||
    hasPermission(PERMISSIONS.SCHEDULE_MANAGE_SHIFT) ||
    hasPermission(PERMISSIONS.SCHEDULE_END_SHIFT);

  type EndShiftConfirmStep = 1 | 2;
  interface EndShiftConfirmState {
    shiftId: string;
    step: EndShiftConfirmStep;
  }

  const [endShiftConfirm, setEndShiftConfirm] = useState<EndShiftConfirmState | null>(null);
  const [endShiftLoading, setEndShiftLoading] = useState(false);

  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));

    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) {
      return 'All Branches';
    }

    if (selectedBranches.length === 1) {
      return selectedBranches[0].name;
    }

    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const [activityLoading, setActivityLoading] = useState(false);
  const [activityReason, setActivityReason] = useState('');
  const [showActivityModal, setShowActivityModal] = useState<{
    id: string;
    type: 'break' | 'field_task';
    isEnd: boolean;
  } | null>(null);

  const onOpenActivityModal = (id: string, type: 'break' | 'field_task', isEnd: boolean) => {
    setShowActivityModal({ id, type, isEnd });
  };

  const handleActivityStart = async (type: 'break' | 'field_task') => {
    if (!showActivityModal) return;
    setActivityLoading(true);
    try {
      const { id } = showActivityModal;
      const res = await api.post(`/employee-shifts/${id}/activities/start`, {
        activityType: type,
        details: type === 'field_task' ? { reason: activityReason } : undefined,
      });
      setShifts((prev) =>
        prev.map((s) => (s.id === id ? { ...s, active_activity: res.data.data } : s)),
      );
      setSelectedShift((prev: any) =>
        prev?.id === id ? { ...prev, active_activity: res.data.data } : prev,
      );
      showSuccessToast(`Activity started: ${type === 'break' ? 'Break' : 'Field Task'}`);
      setShowActivityModal(null);
      setActivityReason('');
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, 'Failed to start activity'));
    } finally {
      setActivityLoading(false);
    }
  };

  const handleActivityEnd = async () => {
    if (!showActivityModal) return;
    setActivityLoading(true);
    try {
      const { id, type } = showActivityModal;
      const shift = shifts.find((s) => s.id === id);
      if (!shift?.active_activity) return;

      await api.post(`/employee-shifts/${id}/activities/end`, {
        activityId: shift.active_activity.id,
      });
      setShifts((prev) => prev.map((s) => (s.id === id ? { ...s, active_activity: null } : s)));
      setSelectedShift((prev: any) =>
        prev?.id === id ? { ...prev, active_activity: null } : prev,
      );
      showSuccessToast(`Activity ended: ${type === 'break' ? 'Break' : 'Field Task'}`);
      setShowActivityModal(null);
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, 'Failed to end activity'));
    } finally {
      setActivityLoading(false);
    }
  };

  const onCloseActivityModal = () => {
    if (activityLoading) return;
    setShowActivityModal(null);
    setActivityReason('');
  };

  const refreshSelectedShiftDetail = useCallback(async (shiftId: string) => {
    try {
      const res = await api.get(`/account/schedule/${shiftId}`);
      setSelectedShift((prev: any) => (prev?.id === shiftId ? res.data.data : prev));
    } catch {}
  }, []);

  const openDetail = useCallback(
    async (shiftId: string, highlight?: string) => {
      setHighlightLog(highlight ?? null);
      setDetailLoading(true);
      try {
        const res = await api.get(`/account/schedule/${shiftId}`);
        setSelectedShift(res.data.data);
      } catch (err: any) {
        showErrorToast(
          err?.response?.data?.error ||
            err?.response?.data?.message ||
            'Failed to load shift details.',
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [showErrorToast],
  );

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
    api
      .get('/account/profile')
      .then((res) => {
        const status = String(res.data?.data?.workInfo?.status ?? '').toLowerCase();
        setIsSuspendedSelf(status === 'suspended');
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    api
      .get('/account/schedule')
      .then((res) => {
        setShifts(res.data.data || []);
      })
      .catch((err: any) => {
        showErrorToast(
          err?.response?.data?.error || err?.response?.data?.message || 'Failed to load schedule.',
        );
      })
      .finally(() => setLoading(false));
  }, [showErrorToast]);

  useEffect(() => {
    const shiftId = searchParams.get('shiftId');
    if (!shiftId) return;

    const highlight = searchParams.get('highlight') ?? undefined;

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('shiftId');
        next.delete('highlight');
        return next;
      },
      { replace: true },
    );

    void openDetail(shiftId, highlight);
  }, [searchParams]);

  useEffect(() => {
    if (!socket) return;

    socket.on('shift:new', (data: any) => {
      if (data.user_id === currentUser?.id) {
        api
          .get('/account/schedule')
          .then((res) => setShifts(res.data.data || []))
          .catch(() => {
            setShifts((prev) =>
              [...prev, data].sort(
                (a, b) => new Date(a.shift_start).getTime() - new Date(b.shift_start).getTime(),
              ),
            );
          });
      }
      if (selectedShift?.id && getLinkedShiftIdFromInterimPayload(data) === selectedShift.id) {
        void refreshSelectedShiftDetail(selectedShift.id);
      }
    });

    socket.on('shift:updated', (data: any) => {
      setShifts((prev) =>
        prev.map((s) => (s.id === data.id ? { ...s, ...data, logs: s.logs } : s)),
      );
      setSelectedShift((prev: any) =>
        prev?.id === data.id
          ? { ...prev, ...data, logs: prev.logs, authorizations: prev.authorizations }
          : prev,
      );
      if (selectedShift?.id && getLinkedShiftIdFromInterimPayload(data) === selectedShift.id) {
        void refreshSelectedShiftDetail(selectedShift.id);
      }
    });

    socket.on('shift:log-new', (data: any) => {
      if (data.log_type === 'check_out' && data.shift_id && data.total_worked_hours != null) {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === data.shift_id ? { ...s, total_worked_hours: data.total_worked_hours } : s,
          ),
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
      if (selectedShift?.id !== data.shift_id && isPendingApprovalStatus(data.status)) {
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
        const updatedAuths = (prev.authorizations || []).map((a: any) =>
          a.id === data.id ? data : a,
        );
        const newPending = updatedAuths.filter((a: any) => isPendingApprovalStatus(a.status)).length;
        setShifts((prevShifts) =>
          prevShifts.map((s) =>
            s.id === prev.id ? { ...s, pending_approvals: newPending } : s,
          ),
        );
        return {
          ...prev,
          authorizations: updatedAuths,
          pending_approvals: newPending,
        };
      });
      if (selectedShift?.id !== data.shift_id) {
        const wasPending = isPendingApprovalStatus(data.previous_status);
        const isPending = isPendingApprovalStatus(data.status);
        if (wasPending !== isPending) {
          setShifts((prev) =>
            prev.map((s) =>
              s.id === data.shift_id
                ? {
                    ...s,
                    pending_approvals: Math.max(
                      0,
                      (s.pending_approvals ?? 0) + (isPending ? 1 : -1),
                    ),
                  }
                : s,
            ),
          );
        }
      }
    });

    socket.on('shift:authorization-deleted', (data: any) => {
      setSelectedShift((prev: any) => {
        if (!prev || prev.id !== data.shift_id) return prev;
        const remainingAuths = (prev.authorizations || []).filter((a: any) => a.id !== data.id);
        const newPending = remainingAuths.filter((a: any) => isPendingApprovalStatus(a.status)).length;
        setShifts((prevShifts) =>
          prevShifts.map((s) =>
            s.id === prev.id ? { ...s, pending_approvals: newPending } : s,
          ),
        );
        return {
          ...prev,
          authorizations: remainingAuths,
          pending_approvals: newPending,
        };
      });
      if (selectedShift?.id !== data.shift_id && isPendingApprovalStatus(data.status)) {
        setShifts((prev) =>
          prev.map((s) =>
            s.id === data.shift_id
              ? { ...s, pending_approvals: Math.max(0, (s.pending_approvals ?? 0) - 1) }
              : s,
          ),
        );
      }
    });

    socket.on('shift:activity-started', (data: { shiftId: string; activity: any }) => {
      setSelectedShift((prev: any) => {
        if (!prev || prev.id !== data.shiftId) return prev;
        return { ...prev, active_activity: data.activity };
      });
      setShifts((prev) =>
        prev.map((s) => (s.id === data.shiftId ? { ...s, active_activity: data.activity } : s)),
      );
    });

    socket.on('shift:activity-ended', (data: { shiftId: string; activity: any }) => {
      setSelectedShift((prev: any) => {
        if (!prev || prev.id !== data.shiftId) return prev;
        return { ...prev, active_activity: null };
      });
      setShifts((prev) =>
        prev.map((s) => (s.id === data.shiftId ? { ...s, active_activity: null } : s)),
      );
    });

    return () => {
      socket.off('shift:new');
      socket.off('shift:updated');
      socket.off('shift:log-new');
      socket.off('shift:authorization-new');
      socket.off('shift:authorization-updated');
      socket.off('shift:authorization-deleted');
      socket.off('shift:activity-started');
      socket.off('shift:activity-ended');
    };
  }, [currentUser?.id, refreshSelectedShiftDetail, selectedShift?.id, socket]);

  useEffect(() => {
    if (!socket) return;
    const branchIds = currentUser?.branchIds ?? [];
    branchIds.forEach((id) => socket.emit('join-branch', id));
    return () => {
      branchIds.forEach((id) => socket.emit('leave-branch', id));
    };
  }, [socket, currentUser?.branchIds]);

  const handleEndShift = async (shiftId: string): Promise<boolean> => {
    try {
      const res = await api.post(`/employee-shifts/${shiftId}/end`);
      const updated = res.data.data;
      setShifts((prev) => prev.map((s) => (s.id === shiftId ? { ...s, ...updated } : s)));
      showSuccessToast('Shift ended successfully.');
      return true;
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, 'Failed to end shift.'));
      return false;
    }
  };

  const requestEndShift = (shiftId: string) => {
    setEndShiftConfirm({ shiftId, step: 1 });
  };

  const TABS: ViewOption<TabType>[] = [
    { id: 'all', label: 'All', icon: LayoutGrid },
    { id: 'active', label: 'Active', icon: PlayCircle },
    { id: 'open', label: 'Upcoming', icon: CalendarClock },
    { id: 'ended', label: 'Closed', icon: CircleCheck },
    { id: 'absent', label: 'Absent', icon: XCircle },
  ];

  const hasActiveFilters =
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.dutyType !== '' ||
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
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setFiltersOpen(false);
  };

  const cancelFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(false);
  };

  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);

  const dutyTypeOptions = useMemo(() => {
    const types = new Set<string>();
    for (const s of shifts) {
      if (s.x_role_name) types.add(s.x_role_name);
    }
    return Array.from(types).sort();
  }, [shifts]);

  const visibleShifts = useMemo(() => {
    const filtered = shifts.filter((s) => {
      if (selectedBranchIdSet.size > 0 && !selectedBranchIdSet.has(s.branch_id)) return false;
      if (activeTab !== 'all' && s.status !== activeTab) return false;

      const shiftDate = dayKey(s.shift_start);
      if (filters.dateFrom && shiftDate < filters.dateFrom) return false;
      if (filters.dateTo && shiftDate > filters.dateTo) return false;
      if (filters.dutyType && s.x_role_name !== filters.dutyType) return false;

      return true;
    });

    filtered.sort((a, b) => {
      if (filters.sortBy === 'allocated_hours') {
        const aHours = Number(a.allocated_hours ?? 0);
        const bHours = Number(b.allocated_hours ?? 0);
        return filters.sortOrder === 'asc' ? aHours - bHours : bHours - aHours;
      }

      const aStart = new Date(a.shift_start).getTime();
      const bStart = new Date(b.shift_start).getTime();
      return filters.sortOrder === 'asc' ? aStart - bStart : bStart - aStart;
    });

    return filtered;
  }, [shifts, activeTab, filters, selectedBranchIdSet]);

  const listPageSize = isMobile ? 6 : 12;
  const totalListPages = Math.max(1, Math.ceil(visibleShifts.length / listPageSize));
  const pagedShifts = visibleShifts.slice((page - 1) * listPageSize, page * listPageSize);

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    selectedBranchIds,
    filters.dateFrom,
    filters.dateTo,
    filters.sortBy,
    filters.sortOrder,
    view,
    isMobile,
  ]);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalListPages));
  }, [totalListPages]);

  const grouped: Record<string, any[]> = {};
  for (const s of visibleShifts) {
    const k = dayKey(s.shift_start);
    if (!grouped[k]) grouped[k] = [];
    grouped[k].push(s);
  }

  const monthStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
  const startOfGrid = new Date(monthStart);
  startOfGrid.setDate(monthStart.getDate() - monthStart.getDay());

  const calendarDays: {
    date: Date;
    key: string;
    isCurrentMonth: boolean;
    shifts: any[];
  }[] = [];

  for (let i = 0; i < 42; i += 1) {
    const d = new Date(startOfGrid);
    d.setDate(startOfGrid.getDate() + i);
    const key = dayKey(d.toISOString());
    calendarDays.push({
      date: d,
      key,
      isCurrentMonth: d.getMonth() === currentMonth.getMonth(),
      shifts: grouped[key] || [],
    });
  }

  const monthLabel = currentMonth.toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const containerVariant: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
  const sectionVariant: Variants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } };

  return (
    <motion.div className="space-y-5" initial="hidden" animate="visible" variants={containerVariant}>
      <motion.div variants={sectionVariant} className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Calendar className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
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
            View your upcoming and past shifts. Click a card to see full details.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
          {(['list', 'calendar'] as const).map((v) => {
            const isActive = view === v;
            const Icon = v === 'list' ? LayoutGrid : Calendar;
            const label = v === 'list' ? 'Card' : 'Calendar';
            return (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive ? 'text-white' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="toggle-indicator"
                    className="absolute inset-0 rounded-md bg-primary-600"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.5 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon className="h-4 w-4" />
                  <span className="hidden sm:inline whitespace-nowrap">{label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.div variants={sectionVariant} className="space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={TABS}
            activeId={activeTab}
            onChange={(id) => {
              setActiveTab(id);
              setPage(1);
            }}
            layoutId="schedule-status-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
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
              {filtersOpen ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </span>
          </button>
        </div>

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
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Date Range</label>
                    <DateRangePicker
                      dateFrom={draftFilters.dateFrom}
                      dateTo={draftFilters.dateTo}
                      onChange={(from, to) =>
                        setDraftFilters((prev) => ({ ...prev, dateFrom: from, dateTo: to }))
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Duty Type</label>
                    <select
                      value={draftFilters.dutyType}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, dutyType: e.target.value }))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">All duty types</option>
                      {dutyTypeOptions.map((dt) => (
                        <option key={dt} value={dt}>
                          {dt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Sort By</label>
                    <select
                      value={draftFilters.sortBy}
                      onChange={(e) =>
                        setDraftFilters((prev) => ({ ...prev, sortBy: e.target.value as SortBy }))
                      }
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="shift_start">Shift Start</option>
                      <option value="allocated_hours">Allocated Hours</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Sort Order</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        title="Newest first"
                        onClick={() => setDraftFilters((prev) => ({ ...prev, sortOrder: 'desc' }))}
                        className={`flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded border text-sm transition-colors ${
                          draftFilters.sortOrder === 'desc'
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <ArrowDown className="h-4 w-4" />
                        <span className="hidden sm:inline">Desc</span>
                      </button>
                      <button
                        type="button"
                        title="Oldest first"
                        onClick={() => setDraftFilters((prev) => ({ ...prev, sortOrder: 'asc' }))}
                        className={`flex h-[38px] flex-1 items-center justify-center gap-1.5 rounded border text-sm transition-colors ${
                          draftFilters.sortOrder === 'asc'
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <ArrowUp className="h-4 w-4" />
                        <span className="hidden sm:inline">Asc</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={clearFilters}
                  >
                    Clear
                  </Button>
                  <Button type="button" className="w-full sm:w-auto" onClick={applyFilters}>
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={cancelFilters}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {hasActiveFilters && <div className="text-xs text-gray-500">Filters applied</div>}

        {view === 'list' && loading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <MyShiftCardSkeleton key={i} />
            ))}
          </div>
        )}

        {view === 'list' && !loading && visibleShifts.length === 0 && (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Calendar className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">No shifts found for the selected filters.</p>
          </div>
        )}

        {view === 'list' && !loading && visibleShifts.length > 0 ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pagedShifts.map((s) => (
                <MyShiftCard
                  key={s.id}
                  shift={s}
                  branchName={s.branch_name ?? 'Unknown Branch'}
                  canExchangeShift={
                    !isSuspendedSelf &&
                    s.status === 'open' &&
                    s.user_id &&
                    s.user_id === currentUser?.id
                  }
                  canEndShift={canEndOwnShift}
                  onClick={() => openDetail(s.id)}
                  onEndShift={requestEndShift}
                  onExchangeShift={setExchangeShiftSource}
                  onOpenActivityModal={onOpenActivityModal}
                  activityLoading={activityLoading}
                />
              ))}
            </div>

            {totalListPages > 1 && (
              <div className="flex items-center justify-between text-sm text-gray-600">
                <span>
                  Page {page} of {totalListPages}
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
                    onClick={() => setPage((prev) => Math.min(totalListPages, prev + 1))}
                    disabled={page === totalListPages}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {view === 'calendar' && (
          <div className="space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                onClick={() =>
                  setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                }
              >
                ‹ Prev
              </button>
              <p className="text-sm font-semibold text-gray-800">{monthLabel}</p>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                onClick={() =>
                  setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                }
              >
                Next ›
              </button>
            </div>

            {/* Calendar grid */}
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <div className="grid grid-cols-7 bg-gray-50 text-center text-[11px] font-semibold text-gray-500">
                {dayNames.map((name) => (
                  <div key={name} className="border-b border-gray-200 px-2 py-1.5">
                    {name}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-px bg-gray-200">
                {calendarDays.map((day) => {
                  const isToday = day.date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={day.key + day.date.getDate()}
                      className={`min-h-[90px] bg-white p-1.5 text-[11px] ${
                        !day.isCurrentMonth ? 'bg-gray-50 text-gray-400' : ''
                      }`}
                    >
                      <div className="mb-1 flex items-center justify-between">
                        <span
                          className={`font-semibold ${
                            isToday ? 'rounded-full bg-primary-600 px-1.5 py-0.5 text-white' : ''
                          }`}
                        >
                          {day.date.getDate()}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        {day.shifts.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => openDetail(s.id)}
                            className="w-full rounded bg-primary-50 px-1 py-0.5 text-left text-[11px] text-primary-800 hover:bg-primary-100"
                          >
                            <div className="truncate">
                              {getShiftRangeDisplay(s)} · {s.duty_type}
                            </div>
                            <div className="truncate text-[10px] text-gray-500">
                              {s.branch_name ?? 'Unknown Branch'}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {createPortal(
        <AnimatePresence>
          {selectedShift && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={() => {
                  setSelectedShift(null);
                  setShiftExchangeDetailRequestId(null);
                  setHighlightLog(null);
                }}
              />

              {/* Detail panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white shadow-2xl"
              >
                {detailLoading ? (
                  <div className="flex h-full items-center justify-center">
                    <Spinner size="lg" />
                  </div>
                ) : (
                  <ShiftDetailPanel
                    shift={selectedShift}
                    branchName={selectedShift.branch_name ?? 'Unknown Branch'}
                    currentUserId={currentUser?.id ?? ''}
                    canApprove={canApprove}
                    canSubmitPublicAuthRequest={canSubmitPublicAuthRequest}
                    highlightLog={highlightLog}
                    onClose={() => {
                      setSelectedShift(null);
                      setShiftExchangeDetailRequestId(null);
                      setHighlightLog(null);
                    }}
                    onAuthorizationUpdate={(updatedAuth) => {
                      setSelectedShift((prev: any) => {
                        if (!prev) return prev;
                        const updatedAuths = (prev.authorizations || []).map((a: any) =>
                          a.id === updatedAuth.id ? updatedAuth : a,
                        );
                        const newPending = updatedAuths.filter((a: any) => isPendingApprovalStatus(a.status)).length;
                        setShifts((prevShifts) =>
                          prevShifts.map((s) =>
                            s.id === prev.id ? { ...s, pending_approvals: newPending } : s,
                          ),
                        );
                        return {
                          ...prev,
                          authorizations: updatedAuths,
                          pending_approvals: newPending,
                        };
                      });
                    }}
                    onOpenShiftExchangeRequest={(requestId) => {
                      setShiftExchangeDetailRequestId(requestId);
                    }}
                    onOpenPeerEvaluation={(evaluationId) => {
                      setPeerEvaluationModalId(evaluationId);
                    }}
                    onEndShift={requestEndShift}
                    canEndShift={canEndOwnShift}
                    onOpenActivityModal={onOpenActivityModal}
                    showActivityModal={showActivityModal}
                    activityLoading={activityLoading}
                    activityReason={activityReason}
                    onSetActivityReason={setActivityReason}
                    onActivityStart={handleActivityStart}
                    onActivityEnd={handleActivityEnd}
                    onCloseActivityModal={onCloseActivityModal}
                  />
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <ShiftExchangeDetailModal
        isOpen={Boolean(shiftExchangeDetailRequestId)}
        requestId={shiftExchangeDetailRequestId}
        onClose={() => setShiftExchangeDetailRequestId(null)}
        onUpdated={() => {
          if (selectedShift?.id) {
            void openDetail(selectedShift.id);
          }
        }}
      />

      <ShiftExchangeFlowModal
        isOpen={Boolean(exchangeShiftSource)}
        fromShift={
          exchangeShiftSource
            ? {
                id: exchangeShiftSource.id,
                shift_start: exchangeShiftSource.shift_start,
                shift_end: exchangeShiftSource.shift_end,
                duty_type: exchangeShiftSource.duty_type,
                branch_name: exchangeShiftSource.branch_name ?? null,
              }
            : null
        }
        onClose={() => setExchangeShiftSource(null)}
        onConfirmed={({ fromShiftId }) => {
          void openDetail(fromShiftId);
        }}
        onCreated={async () => {
          try {
            const scheduleRes = await api.get('/account/schedule');
            setShifts(scheduleRes.data.data || []);
          } catch {
            // no-op; next refresh/socket update will reconcile
          }
        }}
      />

      {/* Activity Start/End confirmation */}
      <AnimatePresence>
        {showActivityModal && (
          <AnimatedModal
            maxWidth="max-w-sm"
            zIndexClass="z-[60]"
            onBackdropClick={activityLoading ? undefined : onCloseActivityModal}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">
                {showActivityModal.isEnd ? 'End' : 'Start'}{' '}
                {showActivityModal.type === 'break' ? 'Break' : 'Field Task'}?
              </p>
            </div>
            <div className="px-5 py-4 space-y-4">
              <p className="text-sm text-gray-700">
                {showActivityModal.isEnd
                  ? `Are you sure you want to end your ${
                      showActivityModal.type === 'break' ? 'break' : 'field task'
                    }?`
                  : `This will record the start time of your ${
                      showActivityModal.type === 'break' ? 'break' : 'field task'
                    }.`}
              </p>

              {!showActivityModal.isEnd && showActivityModal.type === 'field_task' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-gray-500">Reason / Task Details</label>
                  <textarea
                    value={activityReason}
                    onChange={(e) => setActivityReason(e.target.value)}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="e.g. Market, Deposit, Stock Delivery..."
                    rows={3}
                  />
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant={
                  showActivityModal.type === 'field_task'
                    ? 'success'
                    : showActivityModal.isEnd
                      ? 'outline-danger'
                      : 'primary'
                }
                disabled={
                  activityLoading ||
                  (!showActivityModal.isEnd &&
                    showActivityModal.type === 'field_task' &&
                    !activityReason.trim())
                }
                onClick={() =>
                  showActivityModal.isEnd
                    ? handleActivityEnd()
                    : handleActivityStart(showActivityModal.type)
                }
              >
                {activityLoading ? 'Processing...' : 'Confirm'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={activityLoading}
                onClick={onCloseActivityModal}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>

      <PeerEvaluationModal
        isOpen={Boolean(peerEvaluationModalId)}
        initialEvaluationId={peerEvaluationModalId}
        onClose={() => setPeerEvaluationModalId(null)}
      />

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
                {endShiftConfirm.step === 1 ? 'End this shift?' : 'Final confirmation'}
              </p>
            </div>
            <div className="px-5 py-4">
              {endShiftConfirm.step === 1 ? (
                <p className="text-sm text-gray-700">
                  This will end your active shift and record your checkout time.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-700">You are about to end this shift.</p>
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-sm text-amber-800">This action can’t be undone.</p>
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              {endShiftConfirm.step === 1 ? (
                <Button
                  className="flex-1"
                  variant="danger"
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
                  {endShiftLoading ? 'Ending...' : 'End Shift'}
                </Button>
              )}
              <Button
                className="flex-1"
                variant="secondary"
                disabled={endShiftLoading}
                onClick={closeEndShiftConfirm}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== 'object') return fallback;

  const maybeResponse = 'response' in err ? err.response : undefined;
  if (!maybeResponse || typeof maybeResponse !== 'object') return fallback;

  const maybeData = 'data' in maybeResponse ? maybeResponse.data : undefined;
  if (!maybeData || typeof maybeData !== 'object') return fallback;

  const maybeError = 'error' in maybeData ? maybeData.error : undefined;
  if (typeof maybeError === 'string' && maybeError.trim() !== '') return maybeError;

  const maybeMessage = 'message' in maybeData ? maybeData.message : undefined;
  if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') return maybeMessage;

  return fallback;
}
