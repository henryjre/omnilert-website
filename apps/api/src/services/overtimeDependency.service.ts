export const OVERTIME_BLOCKER_AUTH_TYPES = new Set([
  'tardiness',
  'early_check_out',
  'late_check_out',
  'underbreak',
] as const);

export type OvertimeBlockerAuthType = 'tardiness' | 'early_check_out' | 'late_check_out' | 'underbreak';

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
  const ALLOCATED_BREAK_HOURS = 1;
  const netWorkedMinutes = Math.max(0, input.totalWorkedHours - input.totalBreakHours) * 60;
  const effectiveAllocatedMinutes = Math.max(0, input.allocatedHours - ALLOCATED_BREAK_HOURS) * 60;

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

  return Math.max(0, paidMinutes - effectiveAllocatedMinutes);
}
