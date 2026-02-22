import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { PERMISSIONS } from '@omnilert/shared';
import { Calendar, LayoutGrid, X, LogIn, LogOut, RefreshCw, Clock, AlertTriangle, CheckCircle, XCircle, Square, Filter, ChevronDown, ChevronUp, ArrowUp, ArrowDown } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────

const DUTY_COLORS: Record<number, string> = {
  1: '#FF9C9C',
  2: '#F7C698',
  7: '#89E1DB',
  8: '#97A6F9',
};

const ACCOUNT_SHIFT_STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  open: { label: 'Open', cls: 'bg-blue-100 text-blue-700' },
  active: { label: 'Active', cls: 'bg-green-100 text-green-700' },
  ended: { label: 'Closed', cls: 'bg-red-100 text-red-700' },
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
  const d = new Date(dt);
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day}, ${year} at ${time}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const month = d.toLocaleString('en-US', { month: 'long' });
  const day = String(d.getDate()).padStart(2, '0');
  const year = d.getFullYear();
  const time = d.toLocaleString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  return `${month} ${day}, ${year} at ${time}`;
}

function fmtTimeShort(dt: string) {
  return new Date(dt).toLocaleString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
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

// ─── Authorization Card ───────────────────────────────────────────────────────

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
  const [selectedOvertimeType, setSelectedOvertimeType] = useState<string>('');

  const isOwner = auth.user_id === currentUserId;
  const needsReason = auth.needs_employee_reason && !auth.employee_reason;
  const canManagerAct = canApprove && auth.status === 'pending' && (!auth.needs_employee_reason || auth.employee_reason);

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

      {auth.status === 'pending' && auth.needs_employee_reason && !auth.employee_reason && (
        <p className="text-xs text-orange-600">Awaiting employee reason before approval</p>
      )}

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

      {auth.resolved_by_name && (
        <p className="text-xs text-gray-500">
          {auth.status === 'approved' ? 'Approved' : 'Rejected'} by {auth.resolved_by_name}
        </p>
      )}

      {canManagerAct && auth.auth_type === 'overtime' && !rejectMode && (
        <div className="space-y-2">
          <select
            value={selectedOvertimeType}
            onChange={(e) => setSelectedOvertimeType(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          >
            <option value="">Select overtime type...</option>
            <option value="normal_overtime">Normal Overtime</option>
            <option value="overtime_premium">Overtime Premium</option>
          </select>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="success"
              disabled={approveLoading || !selectedOvertimeType}
              onClick={async () => {
                setApproveLoading(true);
                await onApprove(auth.id, selectedOvertimeType);
                setApproveLoading(false);
              }}
            >
              {approveLoading ? 'Approving...' : (
                <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Approve</span>
              )}
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRejectMode(true)}>
              <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Reject</span>
            </Button>
          </div>
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
            {approveLoading ? 'Approving...' : (
              <span className="flex items-center gap-1"><CheckCircle className="h-3.5 w-3.5" /> Approve</span>
            )}
          </Button>
          <Button size="sm" variant="danger" onClick={() => setRejectMode(true)}>
            <span className="flex items-center gap-1"><XCircle className="h-3.5 w-3.5" /> Reject</span>
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
            <Button size="sm" variant="secondary" onClick={() => { setRejectMode(false); setRejectText(''); }}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Log Entry ────────────────────────────────────────────────────────────────

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
          {!isApproved && !!changes?.rejection_reason && (
            <p className="mt-1 text-xs text-red-600">Reason: {String(changes!.rejection_reason)}</p>
          )}
          {isApproved && !!changes?.overtime_type && (
            <p className="mt-1 text-xs text-blue-600">
              Type: {OVERTIME_TYPE_LABELS[changes!.overtime_type as string] ?? String(changes!.overtime_type)}
            </p>
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

// ─── Shift Detail Panel ───────────────────────────────────────────────────────

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
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-4">
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

// ─── Shift Card for My Account (mirrors Employee Schedule style) ──────────────

function MyShiftCard({
  shift,
  branchName,
  onClick,
  onEndShift,
}: {
  shift: any;
  branchName?: string;
  onClick: () => void;
  onEndShift: (id: string) => void;
}) {
  const { prefix, name } = parseEmployeeName(shift.employee_name);
  const dutyColor = DUTY_COLORS[shift.duty_color] ?? "#e5e7eb";
  const [avatarError, setAvatarError] = useState(false);
  const statusCfg =
    ACCOUNT_SHIFT_STATUS_CONFIG[shift.status] ?? {
      label: String(shift.status),
      cls: "bg-gray-100 text-gray-700",
    };

  return (
    <div
      className="cursor-pointer rounded-xl transition-shadow hover:shadow-md"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
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
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.cls}`}
          >
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
          <span className="font-medium text-gray-900">
            {fmtShift(shift.shift_start)}
          </span>
          <span className="text-gray-500">Shift End</span>
          <span className="font-medium text-gray-900">
            {fmtShift(shift.shift_end)}
          </span>
          <span className="text-gray-500">Allocated Hours</span>
          <span className="font-medium text-gray-900">
            {Number(shift.allocated_hours).toFixed(2)} hrs
          </span>
          <span className="text-gray-500">Total Worked</span>
          <span className="font-medium text-gray-900">
            {shift.total_worked_hours != null
              ? `${Number(shift.total_worked_hours).toFixed(2)} hrs`
              : "—"}
          </span>
          {shift.duty_type && (
            <>
              <span className="text-gray-500">Duty Type</span>
              <span>
                <span
                  className="inline-block rounded-full px-2 py-0.5 text-xs font-medium text-gray-800"
                  style={{ backgroundColor: dutyColor }}
                >
                  {shift.duty_type}
                </span>
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
        {(shift.status === "open" || shift.status === "active") && (
          <div className="mt-auto flex gap-2 border-t border-gray-100 pt-3">
            {shift.status === "open" && (
              <Button
                variant="secondary"
                size="sm"
                disabled
                className="flex-1"
                onClick={(e) => e.stopPropagation()}
              >
                Exchange Shift
              </Button>
            )}
            {shift.status === "active" && (
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

// ─── Main Component ───────────────────────────────────────────────────────────

export function ScheduleTab() {
  type TabType = 'all' | 'open' | 'active' | 'ended';
  type SortBy = 'shift_start' | 'allocated_hours';
  type SortOrder = 'asc' | 'desc';
  interface Filters {
    branchId: string;
    dateFrom: string;
    dateTo: string;
    sortBy: SortBy;
    sortOrder: SortOrder;
  }

  const [shifts, setShifts] = useState<any[]>([]);
  const [scheduleBranches, setScheduleBranches] = useState<Array<{ id: string; name: string; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<Filters>({
    branchId: '',
    dateFrom: '',
    dateTo: '',
    sortBy: 'shift_start',
    sortOrder: 'desc',
  });
  const [selectedShift, setSelectedShift] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date());
  const [page, setPage] = useState(1);
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(max-width: 639px)').matches
      : false,
  );

  const socket = useSocket('/employee-shifts');
  const currentUser = useAuthStore((s) => s.user);
  const { hasPermission } = usePermission();
  const canApprove = hasPermission(PERMISSIONS.SHIFT_APPROVE_AUTHORIZATIONS);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    Promise.all([api.get('/account/schedule'), api.get('/account/schedule-branches')])
      .then(([scheduleRes, branchesRes]) => {
        setShifts(scheduleRes.data.data || []);
        setScheduleBranches(branchesRes.data.data || []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!socket) return;

    socket.on('shift:new', (data: any) => {
      if (data.user_id === currentUser?.id) {
        setShifts((prev) => [...prev, data].sort(
          (a, b) => new Date(a.shift_start).getTime() - new Date(b.shift_start).getTime(),
        ));
      }
    });

    socket.on('shift:updated', (data: any) => {
      setShifts((prev) => prev.map((s) => (s.id === data.id ? { ...data, logs: s.logs } : s)));
      setSelectedShift((prev: any) =>
        prev?.id === data.id ? { ...data, logs: prev.logs, authorizations: prev.authorizations } : prev,
      );
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
  }, [socket]);

  // Join branch rooms so we receive branch-scoped socket events
  useEffect(() => {
    if (!socket) return;
    const branchIds = currentUser?.branchIds ?? [];
    branchIds.forEach((id) => socket.emit('join-branch', id));
    return () => {
      branchIds.forEach((id) => socket.emit('leave-branch', id));
    };
  }, [socket, currentUser?.branchIds]);

  const openDetail = async (shiftId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/account/schedule/${shiftId}`);
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
      const updated = res.data.data;
      setShifts((prev) =>
        prev.map((s) => (s.id === shiftId ? { ...s, ...updated } : s)),
      );
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to end shift:", err);
    }
  };

  const TABS: { key: TabType; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'open', label: 'Open' },
    { key: 'ended', label: 'Closed' },
  ];

  const hasActiveFilters =
    activeTab !== 'all' ||
    filters.branchId !== '' ||
    filters.dateFrom !== '' ||
    filters.dateTo !== '' ||
    filters.sortBy !== 'shift_start' ||
    filters.sortOrder !== 'desc';

  const visibleShifts = useMemo(() => {
    const filtered = shifts.filter((s) => {
      if (activeTab !== 'all' && s.status !== activeTab) return false;
      if (filters.branchId && s.branch_id !== filters.branchId) return false;

      const shiftDate = dayKey(s.shift_start);
      if (filters.dateFrom && shiftDate < filters.dateFrom) return false;
      if (filters.dateTo && shiftDate > filters.dateTo) return false;

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
  }, [shifts, activeTab, filters]);

  const listPageSize = isMobile ? 6 : 12;
  const totalListPages = Math.max(1, Math.ceil(visibleShifts.length / listPageSize));
  const pagedShifts = visibleShifts.slice((page - 1) * listPageSize, page * listPageSize);

  useEffect(() => {
    setPage(1);
  }, [
    activeTab,
    filters.branchId,
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

  // Build month calendar grid (6 weeks, Sunday start)
  const monthStart = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth(),
    1,
  );
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-primary-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setView('list')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'list'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <LayoutGrid className="h-4 w-4" />
              Card
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                view === 'calendar'
                  ? 'bg-primary-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Calendar className="h-4 w-4" />
              Calendar
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white">
          <button
            type="button"
            className="flex w-full items-center justify-between px-4 py-3"
            onClick={() => setFiltersOpen((prev) => !prev)}
          >
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Filters</span>
              {hasActiveFilters && (
                <Badge variant="info">Filtered</Badge>
              )}
            </div>
            {filtersOpen ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </button>

          {filtersOpen && (
            <div className="grid gap-3 border-t border-gray-200 p-4 md:grid-cols-2 lg:grid-cols-5">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Branch</label>
                <select
                  value={filters.branchId}
                  onChange={(e) => setFilters((prev) => ({ ...prev, branchId: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">All Branches</option>
                  {scheduleBranches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Sort By</label>
                <select
                  value={filters.sortBy}
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      sortBy: e.target.value as SortBy,
                    }))
                  }
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="shift_start">Shift Start</option>
                  <option value="allocated_hours">Allocated Hours</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-gray-500">Sort Order</label>
                <button
                  type="button"
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
                    }))
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                >
                  {filters.sortOrder === 'asc' ? (
                    <>
                      <ArrowUp className="h-4 w-4" />
                      Ascending
                    </>
                  ) : (
                    <>
                      <ArrowDown className="h-4 w-4" />
                      Descending
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>

        {visibleShifts.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <Calendar className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">
                No shifts found for the selected filters.
              </p>
            </CardBody>
          </Card>
        ) : view === 'list' ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {pagedShifts.map((s) => (
                <MyShiftCard
                  key={s.id}
                  shift={s}
                  branchName={s.branch_name ?? "Unknown Branch"}
                  onClick={() => openDetail(s.id)}
                  onEndShift={handleEndShift}
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
        ) : (
          <div className="space-y-4">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                onClick={() =>
                  setCurrentMonth(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
                  )
                }
              >
                ‹ Prev
              </button>
              <p className="text-sm font-semibold text-gray-800">{monthLabel}</p>
              <button
                type="button"
                className="rounded-md border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                onClick={() =>
                  setCurrentMonth(
                    (prev) =>
                      new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
                  )
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
                  const isToday =
                    day.date.toDateString() === new Date().toDateString();
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
                              {fmtTimeShort(s.shift_start)}–{fmtTimeShort(s.shift_end)} ·{' '}
                              {s.duty_type}
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
      </div>

      {createPortal(
        <>
          {/* Backdrop */}
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
                branchName={selectedShift.branch_name ?? 'Unknown Branch'}
                currentUserId={currentUser?.id ?? ''}
                canApprove={canApprove}
                onClose={() => setSelectedShift(null)}
                onAuthorizationUpdate={(updatedAuth) => {
                  setSelectedShift((prev: any) => {
                    if (!prev) return prev;
                    return {
                      ...prev,
                      authorizations: (prev.authorizations || []).map((a: any) =>
                        a.id === updatedAuth.id ? updatedAuth : a,
                      ),
                    };
                  });
                }}
              />
            ) : null}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
