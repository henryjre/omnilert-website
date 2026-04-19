export const OVERTIME_BLOCKER_AUTH_TYPES = new Set([
  'early_check_in',
  'tardiness',
  'early_check_out',
  'late_check_out',
  'interim_duty',
  'underbreak',
] as const);

export type OvertimeBlockerAuthType =
  | 'early_check_in'
  | 'tardiness'
  | 'early_check_out'
  | 'late_check_out'
  | 'interim_duty'
  | 'underbreak';

export interface OvertimeBlockerState {
  blocked: boolean;
  blockerAuthTypes: OvertimeBlockerAuthType[];
}

export function computeOvertimeBlockerState(
  auths: Array<{ auth_type: string; status: string }>,
): OvertimeBlockerState {
  const pendingBlockers = auths.filter(
    (a) => OVERTIME_BLOCKER_AUTH_TYPES.has(a.auth_type as OvertimeBlockerAuthType) && a.status === 'pending',
  );
  return {
    blocked: pendingBlockers.length > 0,
    blockerAuthTypes: pendingBlockers.map((a) => a.auth_type as OvertimeBlockerAuthType),
  };
}

interface ResolvedAdjustment {
  auth_type: string;
  status: string;
  diff_minutes: number;
}

export function deriveOvertimeMinutes(input: {
  totalWorkedHours: number;
  totalBreakHours: number;
  allocatedHours: number;
  resolvedAdjustments: ResolvedAdjustment[];
}): number {
  const netWorkedMinutes = Math.max(0, input.totalWorkedHours - input.totalBreakHours) * 60;
  const allocatedMinutes = Math.max(0, input.allocatedHours) * 60;

  let paidMinutes = netWorkedMinutes;
  for (const adj of input.resolvedAdjustments) {
    if (adj.auth_type === 'tardiness' && adj.status === 'approved') {
      paidMinutes += adj.diff_minutes;
    } else if (adj.auth_type === 'early_check_out' && adj.status === 'rejected') {
      paidMinutes += adj.diff_minutes;
    } else if (adj.auth_type === 'late_check_out' && adj.status === 'rejected') {
      paidMinutes -= adj.diff_minutes;
    }
  }

  return Math.max(0, paidMinutes - allocatedMinutes);
}
