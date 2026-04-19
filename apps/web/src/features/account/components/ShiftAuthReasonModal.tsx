import { useState, useEffect } from 'react';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/services/api.client';
import { MapPin, X } from 'lucide-react';

interface ShiftAuthData {
  id: string;
  auth_type: string;
  diff_minutes: number;
  status: string;
  employee_reason: string | null;
  needs_employee_reason: boolean;
  rejection_reason: string | null;
  created_at: string;
  resolved_at: string | null;
  resolved_by_name: string | null;
  shift: {
    id: string;
    shift_start: string;
    shift_end: string;
    status: string;
    duty_type: string | null;
    duty_color: number | null;
    branch_name: string | null;
    employee_name: string | null;
    employee_avatar_url: string | null;
    pending_approvals: number;
  } | null;
}

interface ShiftAuthReasonModalProps {
  authId: string;
  onClose: () => void;
  onReasonSubmitted?: (updatedAuth: any) => void;
}

const DUTY_COLORS: Record<number, string> = {
  1: '#FF9C9C',
  2: '#F7C698',
  7: '#89E1DB',
  8: '#97A6F9',
};

const AUTH_TYPE_LABELS: Record<string, string> = {
  early_check_in: 'Early Check In',
  tardiness: 'Tardiness',
  early_check_out: 'Early Check Out',
  late_check_out: 'Late Check Out',
  overtime: 'Overtime',
  interim_duty: 'Interim Duty',
  underbreak: 'Underbreak',
};

const STATUS_VARIANT: Record<string, 'success' | 'danger' | 'warning'> = {
  approved: 'success',
  rejected: 'danger',
  pending: 'warning',
};

function fmtDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(iso));
}

function fmtDiff(authType: string, minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const duration = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
  switch (authType) {
    case 'tardiness': return `${duration} late`;
    case 'early_check_in': return `${duration} early`;
    case 'early_check_out': return `${duration} before shift end`;
    case 'late_check_out': return `${duration} after shift end`;
    case 'underbreak': return `${minutes}m break (${minutes}m short of 1h)`;
    default: return duration;
  }
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function ShiftAuthReasonModal({ authId, onClose, onReasonSubmitted }: ShiftAuthReasonModalProps) {
  const [data, setData] = useState<ShiftAuthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    api
      .get(`/account/shift-authorizations/${authId}`)
      .then((res) => setData(res.data.data))
      .catch((err: any) => {
        setFetchError(
          err?.response?.data?.error ??
          err?.response?.data?.message ??
          'Failed to load authorization details.',
        );
      })
      .finally(() => setLoading(false));
  }, [authId]);

  const handleSubmit = async () => {
    if (!reason.trim() || !data) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await api.post(`/shift-authorizations/${authId}/reason`, { reason: reason.trim() });
      const updated = res.data.data;
      setData((prev) => prev ? { ...prev, employee_reason: updated.employee_reason } : prev);
      onReasonSubmitted?.(updated);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.error ??
        err?.response?.data?.message ??
        'Failed to submit reason.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const authLabel = data ? (AUTH_TYPE_LABELS[data.auth_type] ?? data.auth_type) : '';
  const isReadOnly = Boolean(data?.employee_reason);
  const shift = data?.shift ?? null;
  const dutyColor = shift?.duty_color ? (DUTY_COLORS[shift.duty_color] ?? '#e5e7eb') : '#e5e7eb';

  return (
    <AnimatedModal onBackdropClick={onClose} maxWidth="max-w-lg">
      <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">
            {loading ? 'Authorization' : authLabel}
          </h2>
          {data && (
            <p className="text-xs text-gray-500 mt-0.5">
              {fmtDiff(data.auth_type, data.diff_minutes)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {data && (
            <Badge variant={STATUS_VARIANT[data.status] ?? 'warning'}>
              {data.status.charAt(0).toUpperCase() + data.status.slice(1)}
            </Badge>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="max-h-[70vh] overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : fetchError ? (
          <div className="px-5 py-8 text-center text-sm text-red-600">{fetchError}</div>
        ) : data ? (
          <div className="space-y-4 px-5 py-4">
            {shift && (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                  <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                    Shift Summary
                  </span>
                </div>
                <div className="px-4 py-3">
                  <div className="flex items-center gap-3 mb-3">
                    {shift.employee_avatar_url && !avatarError ? (
                      <img
                        src={shift.employee_avatar_url}
                        alt={shift.employee_name ?? ''}
                        className="h-10 w-10 rounded-full object-cover shrink-0"
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 shrink-0">
                        {getInitials(shift.employee_name)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {shift.employee_name ?? '—'}
                      </p>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {shift.duty_type && (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-medium text-gray-800"
                            style={{ backgroundColor: dutyColor }}
                          >
                            {shift.duty_type}
                          </span>
                        )}
                        {shift.branch_name && (
                          <span className="flex items-center gap-1 text-xs text-gray-500">
                            <MapPin className="h-3 w-3" />
                            {shift.branch_name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift Start</p>
                      <p className="mt-0.5 font-medium text-gray-800">{fmtDateTime(shift.shift_start)}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wide text-gray-400">Shift End</p>
                      <p className="mt-0.5 font-medium text-gray-800">{fmtDateTime(shift.shift_end)}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Authorization
                </span>
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-medium text-gray-900">{authLabel}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Variance</span>
                  <span className="font-medium text-gray-900">{fmtDiff(data.auth_type, data.diff_minutes)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Submitted</span>
                  <span className="text-gray-700">{fmtDateTime(data.created_at)}</span>
                </div>
                {data.resolved_at && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">
                      {data.status === 'rejected' ? 'Rejected' : 'Approved'} by
                    </span>
                    <span className="text-gray-700">{data.resolved_by_name ?? '—'}</span>
                  </div>
                )}
                {data.rejection_reason && (
                  <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
                    <span className="font-semibold">Rejection reason: </span>
                    {data.rejection_reason}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
                <span className="text-xs font-semibold uppercase tracking-widest text-gray-400">
                  Your Reason
                </span>
              </div>
              <div className="px-4 py-3">
                {isReadOnly ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-md bg-gray-50 border border-gray-200 px-3 py-2">
                    {data.employee_reason}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explain the reason for this authorization…"
                      rows={3}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary-300 focus:outline-none focus:ring-2 focus:ring-primary-200 resize-none"
                    />
                    {submitError && (
                      <p className="text-xs text-red-600">{submitError}</p>
                    )}
                    <Button
                      variant="primary"
                      className="w-full"
                      disabled={!reason.trim() || submitting}
                      onClick={handleSubmit}
                    >
                      {submitting ? 'Submitting…' : 'Submit Reason'}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </AnimatedModal>
  );
}
