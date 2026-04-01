import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import {
  deleteAttendanceById,
  deletePlanningSlotById,
  updateAttendanceCheckIn,
  updateAttendanceCheckOut,
  findWorkEntryByEmployeeAndDate,
  deductWorkEntryDuration,
  createOvertimeWorkEntry,
  getEmployeeByWebsiteUserKey,
} from '../services/odoo.service.js';
import { createAndDispatchNotification } from '../services/notification.service.js';
import { db } from '../config/database.js';

const INTERIM_DUTY_AUTH_TYPE = 'interim_duty';

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

export function resolveInterimDutyCleanupTargets(input: {
  shiftLog: { odoo_attendance_id: number | null } | null;
  shift: { odoo_shift_id: number | null } | null;
}): InterimDutyCleanupTargets {
  const attendanceId = Number(input.shiftLog?.odoo_attendance_id ?? 0);
  if (!Number.isFinite(attendanceId) || attendanceId <= 0) {
    throw new AppError(409, 'Interim duty rejection cannot continue: missing attendance reference');
  }

  const planningSlotIdRaw = Number(input.shift?.odoo_shift_id ?? 0);
  const planningSlotId = Number.isFinite(planningSlotIdRaw) && planningSlotIdRaw > 0
    ? planningSlotIdRaw
    : null;

  return { attendanceId, planningSlotId };
}

export async function cleanupInterimDutyOdooArtifacts(
  auth: Record<string, unknown>,
  deps: InterimDutyCleanupDeps = defaultInterimDutyCleanupDeps,
): Promise<void> {
  const shiftLogId = String(auth.shift_log_id ?? '').trim();
  const shiftId = String(auth.shift_id ?? '').trim();
  if (!shiftLogId || !shiftId) {
    throw new AppError(409, 'Interim duty rejection cannot continue: missing shift references');
  }

  const [shiftLog, shift] = await Promise.all([
    deps.loadShiftLog(shiftLogId),
    deps.loadShift(shiftId),
  ]);
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

/** Employee submits a reason for tardiness / late_check_out */
export async function submitReason(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const userId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) {
      throw new AppError(400, 'Reason is required');
    }

    const tenantDb = db.getDb();
    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.user_id !== userId) throw new AppError(403, 'Not your authorization');
    if (!auth.needs_employee_reason) {
      throw new AppError(400, 'This authorization does not require an employee reason');
    }
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }

    const [updated] = await tenantDb('shift_authorizations')
      .where({ id })
      .update({ employee_reason: reason.trim() })
      .returning('*');

    try {
      getIO()
        .of('/employee-shifts')
        .to(`branch:${auth.branch_id}`)
        .emit('shift:authorization-updated', updated);
    } catch {
      logger.warn('Socket.IO unavailable for authorization update emit');
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/** Manager approves an authorization */
export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;

    const tenantDb = db.getDb();
    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }
    if (auth.needs_employee_reason && !auth.employee_reason) {
      throw new AppError(400, 'Employee has not submitted a reason yet');
    }

    // For overtime authorizations, require overtime type selection and read duration
    const { overtimeType, hours, minutes } = req.body as { overtimeType?: string; hours?: number; minutes?: number };
    if (auth.auth_type === 'overtime') {
      if (!overtimeType || !['normal_overtime', 'overtime_premium'].includes(overtimeType)) {
        throw new AppError(400, 'Overtime type is required: normal_overtime or overtime_premium');
      }
    }

    const resolvedAt = new Date();
    const updateData: Record<string, unknown> = {
      status: 'approved',
      resolved_by: managerId,
      resolved_at: resolvedAt,
    };
    if (auth.auth_type === 'overtime' && overtimeType) {
      updateData.overtime_type = overtimeType;
    }
    const [updated] = await tenantDb('shift_authorizations')
      .where({ id })
      .update(updateData)
      .returning('*');

    // Decrement pending_approvals
    await tenantDb('employee_shifts')
      .where({ id: auth.shift_id })
      .decrement('pending_approvals', 1);

    // Create resolution shift_log
    const managerUser = await db.getDb()('users').where({ id: managerId }).select('id', 'first_name', 'last_name').first();
    const managerName = managerUser ? `${managerUser.first_name} ${managerUser.last_name}` : managerId;
    const resolvedCompanyId = (auth.company_id as string | null | undefined) ?? companyId;
    if (!resolvedCompanyId) throw new AppError(400, 'Company context is required');
    const [resolutionLog] = await tenantDb('shift_logs')
      .insert({
        company_id: resolvedCompanyId,
        shift_id: auth.shift_id,
        branch_id: auth.branch_id,
        log_type: 'authorization_resolved',
        changes: JSON.stringify({
          authorization_id: id,
          auth_type: auth.auth_type,
          resolution: 'approved',
          resolved_by_name: managerName,
          diff_minutes: auth.diff_minutes,
          ...(auth.auth_type === 'overtime' && overtimeType ? { overtime_type: overtimeType } : {}),
        }),
        event_time: resolvedAt,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*');

    // Notify employee
    if (auth.user_id) {
      const label = authTypeLabel(auth.auth_type);
      await createAndDispatchNotification({
        userId: auth.user_id,
        title: `${label} Approved`,
        message: `Your ${label.toLowerCase()} authorization has been approved.`,
        type: 'success',
        linkUrl: `/account/schedule?shiftId=${String(auth.shift_id)}&highlight=authorization_resolved`,
      });
    }

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:authorization-updated', updated);
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:log-new', resolutionLog);
    } catch {
      logger.warn('Socket.IO unavailable for authorization approve emit');
    }

    // Sync with Odoo for tardiness approval / overtime work entries
    if (auth.auth_type !== INTERIM_DUTY_AUTH_TYPE) {
      await syncOdooAttendance(auth, 'approve', { overtimeType, hours, minutes, managerName });
    }

    res.json({ success: true, data: { ...updated, resolved_by_name: managerName } });
  } catch (err) {
    next(err);
  }
}

/** Manager rejects an authorization */
export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) {
      throw new AppError(400, 'Rejection reason is required');
    }

    const tenantDb = db.getDb();
    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }

    if (auth.auth_type === INTERIM_DUTY_AUTH_TYPE) {
      await cleanupInterimDutyOdooArtifacts(auth);
    }

    const resolvedAt = new Date();
    const [updated] = await tenantDb('shift_authorizations')
      .where({ id })
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        resolved_by: managerId,
        resolved_at: resolvedAt,
      })
      .returning('*');

    // Decrement pending_approvals
    await tenantDb('employee_shifts')
      .where({ id: auth.shift_id })
      .decrement('pending_approvals', 1);

    // Create resolution shift_log
    const managerUser = await db.getDb()('users').where({ id: managerId }).select('id', 'first_name', 'last_name').first();
    const managerName = managerUser ? `${managerUser.first_name} ${managerUser.last_name}` : managerId;
    const resolvedCompanyId = (auth.company_id as string | null | undefined) ?? companyId;
    if (!resolvedCompanyId) throw new AppError(400, 'Company context is required');
    const [resolutionLog] = await tenantDb('shift_logs')
      .insert({
        company_id: resolvedCompanyId,
        shift_id: auth.shift_id,
        branch_id: auth.branch_id,
        log_type: 'authorization_resolved',
        changes: JSON.stringify({
          authorization_id: id,
          auth_type: auth.auth_type,
          resolution: 'rejected',
          rejection_reason: reason.trim(),
          resolved_by_name: managerName,
          diff_minutes: auth.diff_minutes,
        }),
        event_time: resolvedAt,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*');

    // Notify employee
    if (auth.user_id) {
      const label = authTypeLabel(auth.auth_type);
      await createAndDispatchNotification({
        userId: auth.user_id,
        title: `${label} Rejected`,
        message: `Your ${label.toLowerCase()} authorization has been rejected: ${reason.trim()}`,
        type: 'danger',
        linkUrl: `/account/schedule?shiftId=${String(auth.shift_id)}&highlight=authorization_resolved`,
      });
    }

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:authorization-updated', updated);
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:log-new', resolutionLog);
    } catch {
      logger.warn('Socket.IO unavailable for authorization reject emit');
    }

    // Sync with Odoo for early_check_in and late_check_out rejection
    if (auth.auth_type !== INTERIM_DUTY_AUTH_TYPE) {
      await syncOdooAttendance(auth, 'reject');
    }

    res.json({ success: true, data: { ...updated, resolved_by_name: managerName } });
  } catch (err) {
    next(err);
  }
}

function authTypeLabel(authType: string): string {
  switch (authType) {
    case 'early_check_in': return 'Early Check In';
    case 'tardiness': return 'Tardiness';
    case 'early_check_out': return 'Early Check Out';
    case 'late_check_out': return 'Late Check Out';
    case 'overtime': return 'Overtime';
    case 'interim_duty': return 'Interim Duty';
    default: return authType;
  }
}

/**
 * Updates Odoo attendance/work entries based on authorization type and action.
 * For overtime approvals: deducts from the regular work entry (type 1) and creates an overtime entry.
 * For overtime rejections: deducts the actual overtime duration from the regular work entry (type 1).
 */
async function syncOdooAttendance(
  auth: Record<string, unknown>,
  action: 'approve' | 'reject',
  overtimeParams?: { overtimeType?: string; hours?: number; minutes?: number; managerName?: string },
): Promise<void> {
  const tenantDb = db.getDb();

  // Overtime auth types operate on work entries, not attendance records.
  // Skip the attendance lookup entirely and go straight to work entry logic.
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

  // For all other auth types, we need the attendance record
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
        await updateAttendanceCheckOut(odooAttendanceId, shift.shift_end);
      }
    }
  } catch (err) {
    logger.error(`Failed to sync Odoo attendance for authorization ${auth.id}: ${err}`);
  }
}

const REGULAR_WORK_ENTRY_TYPE_ID = 1;
const OVERTIME_WORK_ENTRY_TYPE_ID: Record<string, number> = {
  normal_overtime: 2,
  overtime_premium: 118,
};

async function resolveOdooEmployeeIdForAuth(
  auth: Record<string, unknown>,
): Promise<number | null> {
  const tenantDb = db.getDb();

  const user = await tenantDb('users').where({ id: auth.user_id }).select('user_key').first();
  const userKey = String(user?.user_key ?? '').trim();
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

  const regularEntry = await findWorkEntryByEmployeeAndDate(odooEmployeeId, shiftDate, REGULAR_WORK_ENTRY_TYPE_ID);
  if (!regularEntry) {
    logger.warn(`No regular work entry (type ${REGULAR_WORK_ENTRY_TYPE_ID}) found for employee ${odooEmployeeId} on ${shiftDate}`);
    return;
  }

  const approvedMinutes = (hours * 60) + minutes;
  await deductWorkEntryDuration(regularEntry.id, regularEntry.duration, approvedMinutes);

  const description = overtimeType === 'overtime_premium'
    ? `Overtime Premium - Approved By: ${approverName}`
    : `Overtime - Approved By: ${approverName}`;

  await createOvertimeWorkEntry({
    employeeId: odooEmployeeId,
    date: shiftDate,
    workEntryTypeId,
    durationMinutes: approvedMinutes,
    description,
  });

  logger.info(`Overtime approval synced for auth ${auth.id}: deducted ${approvedMinutes}min from entry ${regularEntry.id}, created ${overtimeType} entry.`);
}

async function syncOvertimeRejection(
  auth: Record<string, unknown>,
  shift: Record<string, unknown>,
): Promise<void> {
  const odooEmployeeId = await resolveOdooEmployeeIdForAuth(auth);
  if (!odooEmployeeId) return;

  const shiftDate = toShiftDateYmd(shift.shift_start);

  const regularEntry = await findWorkEntryByEmployeeAndDate(odooEmployeeId, shiftDate, REGULAR_WORK_ENTRY_TYPE_ID);
  if (!regularEntry) {
    logger.warn(`No regular work entry (type ${REGULAR_WORK_ENTRY_TYPE_ID}) found for employee ${odooEmployeeId} on ${shiftDate} during rejection`);
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

/**
 * Converts a date/timestamp to YYYY-MM-DD format for Odoo work entry search.
 */
function toShiftDateYmd(dateInput: any): string {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
