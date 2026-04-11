import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { createAndDispatchNotification } from './notification.service.js';
import { db } from '../config/database.js';
import {
  createOvertimeWorkEntry,
  deductWorkEntryDuration,
  deleteAttendanceById,
  deletePlanningSlotById,
  findWorkEntryByEmployeeAndDate,
  getEmployeeByWebsiteUserKey,
  updateAttendanceCheckIn,
  updateAttendanceCheckOut,
} from './odoo.service.js';

export const INTERIM_DUTY_AUTH_TYPE = 'interim_duty';
export const MANUAL_REJECT_REQUIRES_EMPLOYEE_REASON_AUTH_TYPES = new Set([
  'early_check_in',
  'early_check_out',
  'overtime',
  INTERIM_DUTY_AUTH_TYPE,
]);
export const EXPIRING_EMPLOYEE_REASON_AUTH_TYPES = new Set([
  'early_check_in',
  'early_check_out',
  'overtime',
  INTERIM_DUTY_AUTH_TYPE,
  'tardiness',
  'late_check_out',
]);

const REGULAR_WORK_ENTRY_TYPE_ID = 1;
const OVERTIME_WORK_ENTRY_TYPE_ID: Record<string, number> = {
  normal_overtime: 2,
  overtime_premium: 118,
};

type InterimDutyCleanupTargets = {
  attendanceId: number;
  planningSlotId: number | null;
};

type InterimDutyCleanupDeps = {
  loadShiftLog: (shiftLogId: string) => Promise<{ odoo_attendance_id: number | null } | null>;
  loadShift: (shiftId: string) => Promise<{ odoo_shift_id: number | null } | null>;
  deleteAttendance: (attendanceId: number) => Promise<boolean>;
  deletePlanningSlot: (planningSlotId: number) => Promise<boolean>;
};

type ShiftAuthorizationRejectResolverDeps = {
  updateAuthorization: (
    id: string,
    updates: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  decrementShiftPendingApprovals: (shiftId: string) => Promise<void>;
  createResolutionLog: (input: {
    companyId: string;
    shiftId: string;
    branchId: string;
    changes: string;
    eventTime: Date;
  }) => Promise<Record<string, unknown>>;
  dispatchNotification: (input: {
    userId: string;
    title: string;
    message: string;
    type: 'danger';
    linkUrl: string;
  }) => Promise<void>;
  emitSocketEvent: (event: string, payload: Record<string, unknown>) => void;
  runRejectSideEffects: (auth: Record<string, unknown>) => Promise<void>;
};

const defaultInterimDutyCleanupDeps: InterimDutyCleanupDeps = {
  loadShiftLog: async (shiftLogId) =>
    (await db.getDb()('shift_logs')
      .where({ id: shiftLogId })
      .first('odoo_attendance_id')) as { odoo_attendance_id: number | null } | null,
  loadShift: async (shiftId) =>
    (await db.getDb()('employee_shifts')
      .where({ id: shiftId })
      .first('odoo_shift_id')) as { odoo_shift_id: number | null } | null,
  deleteAttendance: deleteAttendanceById,
  deletePlanningSlot: deletePlanningSlotById,
};

const defaultShiftAuthorizationRejectResolverDeps: ShiftAuthorizationRejectResolverDeps = {
  updateAuthorization: async (id, updates) =>
    ((await db.getDb()('shift_authorizations')
      .where({ id })
      .update(updates)
      .returning('*'))[0] ?? {}) as Record<string, unknown>,
  decrementShiftPendingApprovals: async (shiftId) => {
    await db.getDb()('employee_shifts').where({ id: shiftId }).decrement('pending_approvals', 1);
  },
  createResolutionLog: async (input) =>
    ((await db.getDb()('shift_logs')
      .insert({
        company_id: input.companyId,
        shift_id: input.shiftId,
        branch_id: input.branchId,
        log_type: 'authorization_resolved',
        changes: input.changes,
        event_time: input.eventTime,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*'))[0] ?? {}) as Record<string, unknown>,
  dispatchNotification: async (input) => {
    await createAndDispatchNotification(input);
  },
  emitSocketEvent: (event, payload) => {
    try {
      getIO()
        .of('/employee-shifts')
        .to(`branch:${String(payload.branch_id)}`)
        .emit(event as any, payload as any);
    } catch {
      logger.warn('Socket.IO unavailable for authorization reject emit');
    }
  },
  runRejectSideEffects: async (auth) => {
    if (String(auth.auth_type ?? '') === INTERIM_DUTY_AUTH_TYPE) {
      await cleanupInterimDutyOdooArtifacts(auth);
      return;
    }

    await syncShiftAuthorizationWithOdoo(auth, 'reject');
  },
};

function getTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function hasSubmittedEmployeeReason(auth: Record<string, unknown>): boolean {
  return getTrimmedString(auth.employee_reason).length > 0;
}

export function assertEmployeeReasonSubmittedForManualReject(
  auth: Record<string, unknown>,
): void {
  const authType = getTrimmedString(auth.auth_type);
  if (!MANUAL_REJECT_REQUIRES_EMPLOYEE_REASON_AUTH_TYPES.has(authType)) {
    return;
  }
  if (!auth.needs_employee_reason || hasSubmittedEmployeeReason(auth)) {
    return;
  }
  throw new AppError(400, 'Employee has not submitted a reason yet');
}

export function resolveInterimDutyCleanupTargets(input: {
  shiftLog: { odoo_attendance_id: number | null } | null;
  shift: { odoo_shift_id: number | null } | null;
}): InterimDutyCleanupTargets {
  const attendanceId = Number(input.shiftLog?.odoo_attendance_id ?? 0);
  if (!Number.isFinite(attendanceId) || attendanceId <= 0) {
    throw new AppError(409, 'Interim duty rejection cannot continue: missing attendance reference');
  }

  const planningSlotIdRaw = Number(input.shift?.odoo_shift_id ?? 0);
  const planningSlotId =
    Number.isFinite(planningSlotIdRaw) && planningSlotIdRaw > 0 ? planningSlotIdRaw : null;

  return { attendanceId, planningSlotId };
}

export async function cleanupInterimDutyOdooArtifacts(
  auth: Record<string, unknown>,
  deps: InterimDutyCleanupDeps = defaultInterimDutyCleanupDeps,
): Promise<void> {
  const shiftLogId = getTrimmedString(auth.shift_log_id);
  const shiftId = getTrimmedString(auth.shift_id);
  if (!shiftLogId || !shiftId) {
    throw new AppError(409, 'Interim duty rejection cannot continue: missing shift references');
  }

  const [shiftLog, shift] = await Promise.all([deps.loadShiftLog(shiftLogId), deps.loadShift(shiftId)]);
  const targets = resolveInterimDutyCleanupTargets({ shiftLog, shift });

  if (targets.planningSlotId !== null) {
    const planningDeleted = await deps.deletePlanningSlot(targets.planningSlotId);
    if (!planningDeleted) {
      throw new AppError(502, `Failed to delete Odoo planning.slot ${targets.planningSlotId}`);
    }
  }

  const attendanceDeleted = await deps.deleteAttendance(targets.attendanceId);
  if (!attendanceDeleted) {
    throw new AppError(502, `Failed to delete Odoo attendance ${targets.attendanceId}`);
  }
}

export function authTypeLabel(authType: string): string {
  switch (authType) {
    case 'early_check_in':
      return 'Early Check In';
    case 'tardiness':
      return 'Tardiness';
    case 'early_check_out':
      return 'Early Check Out';
    case 'late_check_out':
      return 'Late Check Out';
    case 'overtime':
      return 'Overtime';
    case INTERIM_DUTY_AUTH_TYPE:
      return 'Interim Duty';
    default:
      return authType;
  }
}

export function createShiftAuthorizationRejectResolver(
  overrides: Partial<ShiftAuthorizationRejectResolverDeps> = {},
) {
  const deps: ShiftAuthorizationRejectResolverDeps = {
    ...defaultShiftAuthorizationRejectResolverDeps,
    ...overrides,
  };

  return async function rejectShiftAuthorization(input: {
    auth: Record<string, unknown>;
    reason: string;
    resolvedAt: Date;
    resolvedBy: string | null;
    resolvedByName: string;
    companyId?: string | null;
  }) {
    const trimmedReason = input.reason.trim();
    if (!trimmedReason) {
      throw new AppError(400, 'Rejection reason is required');
    }

    const auth = input.auth;
    const resolvedCompanyId =
      getTrimmedString(auth.company_id) || getTrimmedString(input.companyId);
    if (!resolvedCompanyId) {
      throw new AppError(400, 'Company context is required');
    }

    await deps.runRejectSideEffects(auth);

    const updatedRecord = await deps.updateAuthorization(getTrimmedString(auth.id), {
      status: 'rejected',
      rejection_reason: trimmedReason,
      resolved_by: input.resolvedBy,
      resolved_at: input.resolvedAt,
    });
    const updated = {
      ...auth,
      ...updatedRecord,
    } as Record<string, unknown>;

    await deps.decrementShiftPendingApprovals(getTrimmedString(auth.shift_id));

    const resolutionLog = await deps.createResolutionLog({
      companyId: resolvedCompanyId,
      shiftId: getTrimmedString(auth.shift_id),
      branchId: getTrimmedString(auth.branch_id),
      changes: JSON.stringify({
        authorization_id: auth.id,
        auth_type: auth.auth_type,
        resolution: 'rejected',
        rejection_reason: trimmedReason,
        resolved_by_name: input.resolvedByName,
        diff_minutes: auth.diff_minutes,
      }),
      eventTime: input.resolvedAt,
    });

    const userId = getTrimmedString(auth.user_id);
    if (userId) {
      const label = authTypeLabel(getTrimmedString(auth.auth_type));
      await deps.dispatchNotification({
        userId,
        title: `${label} Rejected`,
        message: `Your ${label.toLowerCase()} authorization has been rejected: ${trimmedReason}`,
        type: 'danger',
        linkUrl: `/account/schedule?shiftId=${String(auth.shift_id)}&highlight=authorization_resolved`,
      });
    }

    deps.emitSocketEvent('shift:authorization-updated', updated);
    deps.emitSocketEvent('shift:log-new', resolutionLog);

    return {
      updated,
      resolutionLog,
    };
  };
}

export async function syncShiftAuthorizationWithOdoo(
  auth: Record<string, unknown>,
  action: 'approve' | 'reject',
  overtimeParams?: { overtimeType?: string; hours?: number; minutes?: number; managerName?: string },
): Promise<void> {
  if (auth.auth_type === 'early_check_out') {
    return;
  }

  const tenantDb = db.getDb();

  if (auth.auth_type === 'overtime') {
    const shift = await tenantDb('employee_shifts').where({ id: auth.shift_id }).first();
    if (!shift) {
      logger.warn(`No employee_shift found for shift_id ${auth.shift_id}`);
      return;
    }

    try {
      if (action === 'approve' && overtimeParams?.overtimeType) {
        await syncOvertimeApproval(auth, shift, overtimeParams, overtimeParams.managerName ?? 'Unknown');
      } else if (action === 'reject') {
        await syncOvertimeRejection(auth, shift);
      }
    } catch (err) {
      logger.error(`Failed to sync Odoo work entry for overtime authorization ${auth.id}: ${err}`);
    }
    return;
  }

  const shiftLog = await tenantDb('shift_logs').where({ id: auth.shift_log_id }).first();
  if (!shiftLog || !shiftLog.odoo_attendance_id) {
    logger.warn(`No odoo_attendance_id found for shift_log ${auth.shift_log_id}`);
    return;
  }

  const shift = await tenantDb('employee_shifts').where({ id: auth.shift_id }).first();
  if (!shift) {
    logger.warn(`No employee_shift found for shift_id ${auth.shift_id}`);
    return;
  }

  const odooAttendanceId = shiftLog.odoo_attendance_id as number;

  try {
    if (action === 'approve') {
      if (auth.auth_type === 'tardiness') {
        await updateAttendanceCheckIn(odooAttendanceId, shift.shift_start);
      }
    } else if (action === 'reject') {
      if (auth.auth_type === 'early_check_in') {
        await updateAttendanceCheckIn(odooAttendanceId, shift.shift_start);
      }
      if (auth.auth_type === 'late_check_out') {
        const checkInLog = await tenantDb('shift_logs')
          .where({ odoo_attendance_id: odooAttendanceId, log_type: 'check_in' })
          .first();

        const checkInTime = checkInLog ? new Date(checkInLog.event_time) : null;
        const shiftEndTime = new Date(shift.shift_end);

        if (checkInTime && checkInTime >= shiftEndTime) {
          await deleteAttendanceById(odooAttendanceId);
          logger.info(
            `Deleted Odoo attendance ${odooAttendanceId} due to late check-out rejection (arrival after shift end).`,
          );
        } else {
          await updateAttendanceCheckOut(odooAttendanceId, shiftEndTime);
        }
      }
    }
  } catch (err) {
    logger.error(`Failed to sync Odoo attendance for authorization ${auth.id}: ${err}`);
  }
}

async function resolveOdooEmployeeIdForAuth(
  auth: Record<string, unknown>,
): Promise<number | null> {
  const tenantDb = db.getDb();

  const user = await tenantDb('users').where({ id: auth.user_id }).select('user_key').first();
  const userKey = getTrimmedString(user?.user_key);
  if (!userKey) {
    logger.warn(`No user_key found for user_id ${auth.user_id}`);
    return null;
  }

  const branch = await tenantDb('branches').where({ id: auth.branch_id }).select('odoo_branch_id').first();
  const odooCompanyId = Number(branch?.odoo_branch_id ?? 0);
  if (!odooCompanyId) {
    logger.warn(`No odoo_branch_id found for branch_id ${auth.branch_id}`);
    return null;
  }

  const employee = await getEmployeeByWebsiteUserKey(userKey, odooCompanyId);
  if (!employee) {
    logger.warn(`No Odoo employee found for userKey ${userKey}, company ${odooCompanyId}`);
    return null;
  }

  return employee.id;
}

async function syncOvertimeApproval(
  auth: Record<string, unknown>,
  shift: Record<string, unknown>,
  params: { overtimeType?: string; hours?: number; minutes?: number },
  approverName: string,
): Promise<void> {
  const { overtimeType, hours = 0, minutes = 0 } = params;
  if (!overtimeType) return;

  const workEntryTypeId = OVERTIME_WORK_ENTRY_TYPE_ID[overtimeType];
  if (!workEntryTypeId) {
    logger.warn(`Unknown overtime type: ${overtimeType}`);
    return;
  }

  const odooEmployeeId = await resolveOdooEmployeeIdForAuth(auth);
  if (!odooEmployeeId) return;

  const shiftDate = toShiftDateYmd(shift.shift_start);

  const regularEntry = await findWorkEntryByEmployeeAndDate(
    odooEmployeeId,
    shiftDate,
    REGULAR_WORK_ENTRY_TYPE_ID,
  );
  if (!regularEntry) {
    logger.warn(
      `No regular work entry (type ${REGULAR_WORK_ENTRY_TYPE_ID}) found for employee ${odooEmployeeId} on ${shiftDate}`,
    );
    return;
  }

  const approvedMinutes = hours * 60 + minutes;
  await deductWorkEntryDuration(regularEntry.id, regularEntry.duration, approvedMinutes);

  const description =
    overtimeType === 'overtime_premium'
      ? `Overtime Premium - Approved By: ${approverName}`
      : `Overtime - Approved By: ${approverName}`;

  await createOvertimeWorkEntry({
    employeeId: odooEmployeeId,
    date: shiftDate,
    workEntryTypeId,
    durationMinutes: approvedMinutes,
    description,
  });

  logger.info(
    `Overtime approval synced for auth ${auth.id}: deducted ${approvedMinutes}min from entry ${regularEntry.id}, created ${overtimeType} entry.`,
  );
}

async function syncOvertimeRejection(
  auth: Record<string, unknown>,
  shift: Record<string, unknown>,
): Promise<void> {
  const odooEmployeeId = await resolveOdooEmployeeIdForAuth(auth);
  if (!odooEmployeeId) return;

  const shiftDate = toShiftDateYmd(shift.shift_start);

  const regularEntry = await findWorkEntryByEmployeeAndDate(
    odooEmployeeId,
    shiftDate,
    REGULAR_WORK_ENTRY_TYPE_ID,
  );
  if (!regularEntry) {
    logger.warn(
      `No regular work entry (type ${REGULAR_WORK_ENTRY_TYPE_ID}) found for employee ${odooEmployeeId} on ${shiftDate} during rejection`,
    );
    return;
  }

  const diffMinutes = Number(auth.diff_minutes ?? 0);
  if (diffMinutes <= 0) {
    logger.warn(`diff_minutes is 0 or missing for authorization ${auth.id}, skipping work entry deduction.`);
    return;
  }

  await deductWorkEntryDuration(regularEntry.id, regularEntry.duration, diffMinutes);
  logger.info(`Overtime rejection synced for auth ${auth.id}: deducted ${diffMinutes}min from entry ${regularEntry.id}.`);
}

function toShiftDateYmd(dateInput: unknown): string {
  const d = new Date(String(dateInput));
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
