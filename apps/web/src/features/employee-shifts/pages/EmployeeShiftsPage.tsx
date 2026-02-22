import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { api } from '@/shared/services/api.client';
import { ShiftExchangeFlowModal } from '@/features/shift-exchange/components/ShiftExchangeFlowModal';
import { PERMISSIONS } from '@omnilert/shared';
import { Calendar, X, LogIn, LogOut, RefreshCw, Clock, AlertTriangle, CheckCircle, XCircle, Filter, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Square, ArrowUp, ArrowDown } from 'lucide-react';

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
  return new Date(iso).toLocaleString('en-US', {
    month: 'long',
    day: '2-digit',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day}, ${year} at ${time}`;
}

function parseEmployeeName(raw: string): { prefix: string; name: string } {
  const parts = raw.split(' - ');
  if (parts.length >= 2) {
    return { prefix: parts[0].trim(), name: parts.slice(1).join(' - ').trim() };
  }
  return { prefix: '', name: raw };
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

const AUTH_TYPE_CONFIG: Record<string, { label: string; color: string; Icon: React.ElementType; diffLabel: string }> = {
  early_check_in: { label: 'Early Check In', color: 'blue', Icon: Clock, diffLabel: 'before shift start' },
  tardiness: { label: 'Tardiness', color: 'orange', Icon: AlertTriangle, diffLabel: 'late' },
  early_check_out: { label: 'Early Check Out', color: 'yellow', Icon: LogOut, diffLabel: 'early' },
  late_check_out: { label: 'Late Check Out', color: 'purple', Icon: Clock, diffLabel: 'after shift end' },
  overtime: { label: 'Overtime', color: 'red', Icon: Clock, diffLabel: 'overtime' },
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
  onReasonSubmit,
  onApprove,
  onReject,
}: {
  auth: any;
  currentUserId: string;
  canApprove: boolean;
  onReasonSubmit: (id: string, reason: string) => Promise<void>;
  onApprove: (id: string, overtimeType?: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}) {
  const config = AUTH_TYPE_CONFIG[auth.auth_type] ?? { label: auth.auth_type, color: 'gray', Icon: Clock, diffLabel: '' };
  const { Icon } = config;

  const [reasonText, setReasonText] = useState('');
  const [reasonLoading, setReasonLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectText, setRejectText] = useState('');
  const [rejectLoading, setRejectLoading] = useState(false);
  const [approveLoading, setApproveLoading] = useState(false);
  const [selectedOvertimeType, setSelectedOvertimeType] = useState('');
  const [confirmModal, setConfirmModal] = useState<{ action: 'approve' | 'reject'; message: string; onConfirm: () => Promise<void> } | null>(null);

  const isOwner = auth.user_id === currentUserId;
  const needsReason = auth.needs_employee_reason && !auth.employee_reason;
  const canManagerAct = canApprove && auth.status === 'pending' && (!auth.needs_employee_reason || auth.employee_reason);
  const isOvertime = auth.auth_type === 'overtime';

  const iconColorCls: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    orange: 'bg-orange-100 text-orange-600',
    yellow: 'bg-yellow-100 text-yellow-600',
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
      {auth.status === 'pending' && isOwner && needsReason && (
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

      {/* Manager overtime approve — requires type selection */}
      {canManagerAct && isOvertime && !rejectMode && (
        <div className="space-y-2">
          <select
            value={selectedOvertimeType}
            onChange={(e) => setSelectedOvertimeType(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select overtime type...</option>
            <option value="normal_overtime">Normal Overtime</option>
            <option value="overtime_premium">Overtime Premium</option>
          </select>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              disabled={!selectedOvertimeType}
              onClick={() => setConfirmModal({
                action: 'approve',
                message: 'Confirm approval of this overtime request?',
                onConfirm: async () => {
                  setApproveLoading(true);
                  await onApprove(auth.id, selectedOvertimeType);
                  setApproveLoading(false);
                },
              })}
            >
              <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Approve</span>
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRejectMode(true)}>
              <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Reject</span>
            </Button>
          </div>
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
                await onApprove(auth.id);
                setApproveLoading(false);
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
                  await onReject(auth.id, rejectText);
                  setRejectText('');
                  setRejectMode(false);
                  setRejectLoading(false);
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
                disabled={approveLoading || rejectLoading}
                onClick={async () => {
                  await confirmModal.onConfirm();
                  setConfirmModal(null);
                }}
              >
                {(approveLoading || rejectLoading) ? 'Processing...' : (confirmModal.action === 'approve' ? 'Approve' : 'Reject')}
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
  const dutyColor = DUTY_COLORS[shift.duty_color] ?? '#e5e7eb';
  const [avatarError, setAvatarError] = useState(false);
  const statusCfg = SHIFT_STATUS_CONFIG[shift.status] ?? { label: shift.status, cls: 'bg-gray-100 text-gray-700' };

  return (
    <div
      className="cursor-pointer rounded-xl transition-shadow hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <Card className="flex h-full flex-col gap-4 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          {shift.employee_avatar_url && !avatarError ? (
            <img
              src={shift.employee_avatar_url}
              alt={name}
              className="h-12 w-12 rounded-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <AvatarFallback name={name} />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-gray-900">{name}</p>
            {prefix && <p className="text-xs text-gray-400">ID: {prefix}</p>}
          </div>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        </div>

        {/* Details */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {branchName && (
            <>
              <span className="text-gray-500">Branch</span>
              <span className="font-medium text-gray-900">{branchName}</span>
            </>
          )}
          <span className="text-gray-500">Shift Start</span>
          <span className="font-medium text-gray-900">{fmtShift(shift.shift_start)}</span>
          <span className="text-gray-500">Shift End</span>
          <span className="font-medium text-gray-900">{fmtShift(shift.shift_end)}</span>
          <span className="text-gray-500">Allocated Hours</span>
          <span className="font-medium text-gray-900">
            {Number(shift.allocated_hours).toFixed(2)} hrs
          </span>
          <span className="text-gray-500">Total Worked</span>
          <span className="font-medium text-gray-900">
            {shift.total_worked_hours != null
              ? `${Number(shift.total_worked_hours).toFixed(2)} hrs`
              : '—'}
          </span>
          {shift.duty_type && (
            <>
              <span className="text-gray-500">Duty Type</span>
              <span>
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-gray-800"
                  style={{ backgroundColor: DUTY_COLORS[shift.duty_color] ?? '#e5e7eb' }}
                >
                  {shift.duty_type}
                </span>
              </span>
            </>
          )}
          {shift.check_in_status && (
            <>
              <span className="text-gray-500">Attendance</span>
              <span>
                {shift.check_in_status === 'checked_in' ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                    <span className="h-2 w-2 rounded-full bg-green-500" /> Checked In
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                    <span className="h-2 w-2 rounded-full bg-gray-400" /> Checked Out
                  </span>
                )}
              </span>
            </>
          )}
          <span className="text-gray-500">Pending Approvals</span>
          <span>
            {shift.pending_approvals > 0 ? (
              <Badge variant="warning">{shift.pending_approvals}</Badge>
            ) : (
              <span className="text-gray-400">None</span>
            )}
          </span>
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
      </Card>
    </div>
  );
}

// --- Log Entry ---

function LogEntry({ log, isLast }: { log: any; isLast: boolean }) {
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
        <div className="pb-4">
          <p className="font-medium text-gray-900">Shift Updated</p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          {changes && Object.keys(changes).length > 0 && (
            <div className="mt-2 overflow-hidden rounded border border-gray-200 text-xs">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-2 py-1 text-left text-gray-500">Field</th>
                    <th className="px-2 py-1 text-left text-gray-500">From</th>
                    <th className="px-2 py-1 text-left text-gray-500">To</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(changes).map(([field, { from, to }]) => (
                    <tr key={field} className="border-t border-gray-100">
                      <td className="px-2 py-1 font-medium text-gray-700">
                        {FIELD_LABELS[field] ?? field}
                      </td>
                      <td className="max-w-[100px] truncate px-2 py-1 text-gray-500 line-through">
                        {String(from ?? '—')}
                      </td>
                      <td className="max-w-[100px] truncate px-2 py-1 text-gray-900">
                        {String(to ?? '—')}
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
    const isApproved = resolution === 'approved';
    const authLabel = AUTH_TYPE_CONFIG[changes?.auth_type as string]?.label ?? (changes?.auth_type as string ?? '');
    return (
      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${isApproved ? 'bg-green-100' : 'bg-red-100'}`}>
            {isApproved ? <CheckCircle className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
          </div>
          {!isLast && <div className="w-px flex-1 bg-gray-200" />}
        </div>
        <div className="pb-4">
          <p className="font-medium text-gray-900">
            {authLabel} {isApproved ? 'Approved' : 'Rejected'}
          </p>
          <p className="text-xs text-gray-500">{fmtTime(log.event_time)}</p>
          {!!changes?.resolved_by_name && (
            <p className="text-xs text-gray-500">By {String(changes!.resolved_by_name)}</p>
          )}
          {isApproved && !!changes?.overtime_type && (
            <p className="text-xs text-blue-600">
              Type: {OVERTIME_TYPE_LABELS[changes!.overtime_type as string] ?? String(changes!.overtime_type)}
            </p>
          )}
          {!isApproved && !!changes?.rejection_reason && (
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

  return null;
}

// --- Shift Detail Panel ---

function ShiftDetailPanel({
  shift,
  branchName,
  currentUserId,
  canApprove,
  onClose,
  onAuthorizationUpdate,
}: {
  shift: any;
  branchName?: string;
  currentUserId: string;
  canApprove: boolean;
  onClose: () => void;
  onAuthorizationUpdate: (updatedAuth: any) => void;
}) {
  const { prefix, name } = parseEmployeeName(shift.employee_name);
  const dutyColor = DUTY_COLORS[shift.duty_color] ?? '#e5e7eb';
  const [avatarError, setAvatarError] = useState(false);
  const logs: any[] = shift.logs ?? [];
  const authorizations: any[] = shift.authorizations ?? [];
  const statusCfg = SHIFT_STATUS_CONFIG[shift.status] ?? { label: shift.status, cls: 'bg-gray-100 text-gray-700' };

  const handleReasonSubmit = async (authId: string, reason: string) => {
    const res = await api.post(`/shift-authorizations/${authId}/reason`, { reason });
    onAuthorizationUpdate(res.data.data);
  };

  const handleApprove = async (authId: string, overtimeType?: string) => {
    const body = overtimeType ? { overtimeType } : {};
    const res = await api.post(`/shift-authorizations/${authId}/approve`, body);
    onAuthorizationUpdate(res.data.data);
  };

  const handleReject = async (authId: string, reason: string) => {
    const res = await api.post(`/shift-authorizations/${authId}/reject`, { reason });
    onAuthorizationUpdate(res.data.data);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          {shift.employee_avatar_url && !avatarError ? (
            <img
              src={shift.employee_avatar_url}
              alt={name}
              className="h-8 w-8 rounded-full object-cover"
              onError={() => setAvatarError(true)}
            />
          ) : (
            <AvatarFallback name={name} size="sm" />
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-gray-900">{name}</p>
            {prefix && <p className="text-xs text-gray-400">ID: {prefix}</p>}
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-gray-800"
            style={{ backgroundColor: dutyColor }}
          >
            {shift.duty_type}
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.cls}`}>
            {statusCfg.label}
          </span>
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
        {/* Shift Details */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Shift Details
          </h3>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {branchName && (
              <>
                <span className="text-gray-500">Branch</span>
                <span className="font-medium text-gray-900">{branchName}</span>
              </>
            )}
            <span className="text-gray-500">Shift Start</span>
            <span className="font-medium text-gray-900">{fmtShift(shift.shift_start)}</span>
            <span className="text-gray-500">Shift End</span>
            <span className="font-medium text-gray-900">{fmtShift(shift.shift_end)}</span>
            <span className="text-gray-500">Allocated Hours</span>
            <span className="font-medium text-gray-900">
              {Number(shift.allocated_hours).toFixed(2)} hrs
            </span>
            <span className="text-gray-500">Total Worked</span>
            <span className="font-medium text-gray-900">
              {shift.total_worked_hours != null
                ? `${Number(shift.total_worked_hours).toFixed(2)} hrs`
                : '—'}
            </span>
            {shift.check_in_status && (
              <>
                <span className="text-gray-500">Attendance</span>
                <span>
                  {shift.check_in_status === 'checked_in' ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700">
                      <span className="h-2 w-2 rounded-full bg-green-500" /> Checked In
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-500">
                      <span className="h-2 w-2 rounded-full bg-gray-400" /> Checked Out
                    </span>
                  )}
                </span>
              </>
            )}
            <span className="text-gray-500">Pending Approvals</span>
            <span>
              {shift.pending_approvals > 0 ? (
                <Badge variant="warning">{shift.pending_approvals}</Badge>
              ) : (
                <span className="text-gray-400">None</span>
              )}
            </span>
          </div>
        </div>

        {/* Authorizations */}
        {authorizations.length > 0 && (
          <div>
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Authorizations
            </h3>
            <div className="space-y-3">
              {authorizations.map((auth: any) => (
                <AuthorizationCard
                  key={auth.id}
                  auth={auth}
                  currentUserId={currentUserId}
                  canApprove={canApprove}
                  onReasonSubmit={handleReasonSubmit}
                  onApprove={handleApprove}
                  onReject={handleReject}
                />
              ))}
            </div>
          </div>
        )}

        {/* Activity Log */}
        <div>
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
            Activity Log
          </h3>
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400">No activity recorded yet.</p>
          ) : (
            <div>
              {logs.map((log: any, idx: number) => (
                <LogEntry key={log.id} log={log} isLast={idx === logs.length - 1} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- DateRangePicker ---

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtRangeLabel(from: string, to: string): string {
  if (!from && !to) return '';
  const fmt = (ymd: string) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  };
  if (from && to) return `${fmt(from)} – ${fmt(to)}`;
  return `From ${fmt(from)}`;
}

function CalendarGrid({
  viewYear,
  viewMonth,
  dateFrom,
  dateTo,
  onDayClick,
}: {
  viewYear: number;
  viewMonth: number;
  dateFrom: string;
  dateTo: string;
  onDayClick: (ymd: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="grid grid-cols-7" onMouseLeave={() => setHovered(null)}>
      {cells.map((day, idx) => {
        if (!day) return <div key={idx} className="h-7" />;
        const ymd = toYMD(new Date(viewYear, viewMonth, day));
        const isStart = ymd === dateFrom;
        const isEnd = ymd === dateTo;
        const isInRange = !!(dateFrom && dateTo && ymd > dateFrom && ymd < dateTo);
        const isHoveredRange = !!(dateFrom && !dateTo && hovered && (
          (ymd > dateFrom && ymd < hovered) || (ymd < dateFrom && ymd > hovered)
        ));
        const isEdge = isStart || isEnd;
        const col = idx % 7;

        const bandActive = isInRange || isHoveredRange;
        const bandCls = bandActive
          ? `bg-primary-100${col === 0 ? ' rounded-l' : ''}${col === 6 ? ' rounded-r' : ''}`
          : '';

        return (
          <div
            key={idx}
            className={`relative flex h-7 items-center justify-center ${bandCls}`}
            onMouseEnter={() => { if (dateFrom && !dateTo) setHovered(ymd); }}
          >
            {isStart && (dateTo || (hovered && hovered > dateFrom)) && (
              <div className="absolute inset-y-0 right-0 w-1/2 bg-primary-100" />
            )}
            {isEnd && dateFrom && (
              <div className="absolute inset-y-0 left-0 w-1/2 bg-primary-100" />
            )}
            <button
              onClick={() => onDayClick(ymd)}
              className={`relative z-10 flex h-6 w-6 items-center justify-center rounded-full text-xs transition-colors
                ${isEdge ? 'bg-primary-600 font-semibold text-white' : ''}
                ${!isEdge && !bandActive ? 'text-gray-700 hover:bg-gray-100' : ''}
                ${bandActive && !isEdge ? 'text-gray-800' : ''}
              `}
            >
              {day}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function DateRangePicker({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string;
  dateTo: string;
  onChange: (from: string, to: string) => void;
}) {
  const today = new Date();
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  }

  function handleDayClick(ymd: string) {
    if (!dateFrom || (dateFrom && dateTo)) {
      onChange(ymd, '');
    } else {
      if (ymd < dateFrom) onChange(ymd, dateFrom);
      else if (ymd === dateFrom) onChange('', '');
      else { onChange(dateFrom, ymd); setOpen(false); }
    }
  }

  const label = fmtRangeLabel(dateFrom, dateTo);
  const hasValue = !!(dateFrom || dateTo);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm transition-colors ${
          hasValue
            ? 'border-primary-500 bg-primary-50 text-primary-700'
            : 'border-gray-300 bg-white text-gray-400 hover:border-gray-400'
        }`}
      >
        <span className={hasValue ? 'text-primary-700' : 'text-gray-400'}>
          {label || 'Select date range...'}
        </span>
        <div className="flex shrink-0 items-center gap-1">
          {hasValue && (
            <span
              role="button"
              onClick={(e) => { e.stopPropagation(); onChange('', ''); }}
              className="flex h-4 w-4 items-center justify-center rounded-full text-primary-400 hover:bg-primary-100 hover:text-primary-600"
            >
              <X className="h-3 w-3" />
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''} ${hasValue ? 'text-primary-500' : 'text-gray-400'}`} />
        </div>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 select-none rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          {/* Month nav */}
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={prevMonth}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs font-semibold text-gray-700">
              {MONTHS_FULL[viewMonth]} {viewYear}
            </span>
            <button
              onClick={nextMonth}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7">
            {DAYS.map((d) => (
              <span key={d} className="text-center text-[10px] font-medium text-gray-400">{d}</span>
            ))}
          </div>

          <CalendarGrid
            viewYear={viewYear}
            viewMonth={viewMonth}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDayClick={handleDayClick}
          />

          {/* Footer hint */}
          <p className="mt-2 text-center text-[10px] text-gray-400">
            {!dateFrom ? 'Click to set start date' : !dateTo ? 'Click to set end date' : 'Click a date to reset'}
          </p>
        </div>
      )}
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
}

const DEFAULT_FILTERS: Filters = {
  employeeName: '',
  dateFrom: '',
  dateTo: '',
  sortBy: 'shift_start',
  sortOrder: 'desc',
  hasPendingApprovals: false,
};

export function EmployeeShiftsPage() {
  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedShift, setSelectedShift] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exchangeShiftSource, setExchangeShiftSource] = useState<any | null>(null);
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
  const { hasPermission } = usePermission();
  const canApprove = hasPermission(PERMISSIONS.SHIFT_APPROVE_AUTHORIZATIONS);
  const canEndShift = hasPermission(PERMISSIONS.SHIFT_END_SHIFT);

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

    api
      .get('/employee-shifts', { params })
      .then((res) => setShifts(res.data.data || []))
      .finally(() => setLoading(false));
  }, [selectedBranchIds, activeTab, filters]);

  const openDetail = async (shiftId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/employee-shifts/${shiftId}`);
      setSelectedShift(res.data.data);
    } catch (err) {
      console.error('Failed to load shift detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleEndShift = async (shiftId: string) => {
    try {
      const res = await api.post(`/employee-shifts/${shiftId}/end`);
      setShifts((prev) =>
        prev.map((s) => (s.id === shiftId ? { ...s, ...res.data.data } : s)).filter(
          (s) => activeTab === 'all' || s.status === activeTab,
        ),
      );
    } catch (err) {
      console.error('Failed to end shift:', err);
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
          .map((s) => (s.id === data.id ? { ...data, logs: s.logs } : s))
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

  const TABS: { key: TabType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'open', label: 'Open' },
    { key: 'active', label: 'Active' },
    { key: 'ended', label: 'Closed' },
  ];

  const pageSize = isMobile ? 6 : 12;
  const totalPages = Math.max(1, Math.ceil(shifts.length / pageSize));
  const pagedShifts = shifts.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  return (
    <>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <Calendar className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Employee Schedule</h1>
        </div>

        {/* Status tabs + filter toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
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
          <div className="text-xs text-gray-500">
            Filters applied
          </div>
        )}

        {/* Filter panel */}
        {filtersOpen && (
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
                      onClick={() =>
                        setDraftFilters((f) => ({ ...f, hasPendingApprovals: !f.hasPendingApprovals }))
                      }
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
        )}

        {/* Shift grid */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : shifts.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-gray-500">
                No shifts found for the selected filters.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  onEndShift={handleEndShift}
                  onExchangeShift={setExchangeShiftSource}
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

      {/* Detail panel backdrop */}
      {(selectedShift || detailLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedShift(null)}
        />
      )}

      {/* Detail panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[560px] transform bg-white shadow-2xl transition-transform duration-300 ${
          selectedShift ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {detailLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : selectedShift ? (
          <ShiftDetailPanel
            shift={selectedShift}
            branchName={branchMap[selectedShift.branch_id]}
            currentUserId={currentUser?.id ?? ''}
            canApprove={canApprove}
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
        onCreated={() => {
          fetchShifts();
        }}
      />
    </>
  );
}
