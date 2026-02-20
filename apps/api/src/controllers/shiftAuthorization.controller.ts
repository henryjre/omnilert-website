import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { updateAttendanceCheckIn, updateAttendanceCheckOut, searchWorkEntriesByAttendanceId, updateWorkEntryDateStart, updateWorkEntryDateStop } from '../services/odoo.service.js';

/** Employee submits a reason for tardiness / late_check_out */
export async function submitReason(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) {
      throw new AppError(400, 'Reason is required');
    }

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
    const tenantDb = req.tenantDb!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;

    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }
    if (auth.needs_employee_reason && !auth.employee_reason) {
      throw new AppError(400, 'Employee has not submitted a reason yet');
    }

    // For overtime authorizations, require overtime type selection
    const { overtimeType } = req.body as { overtimeType?: string };
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
    const managerUser = await tenantDb('users').where({ id: managerId }).select('id', 'first_name', 'last_name').first();
    const managerName = managerUser ? `${managerUser.first_name} ${managerUser.last_name}` : managerId;
    const [resolutionLog] = await tenantDb('shift_logs')
      .insert({
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
      const [notif] = await tenantDb('employee_notifications').insert({
        user_id: auth.user_id,
        title: `${label} Approved`,
        message: `Your ${label.toLowerCase()} authorization has been approved.`,
        type: 'success',
        link_url: '/account/schedule',
      }).returning('*');
      try {
        getIO().of('/notifications').to(`user:${auth.user_id}`).emit('notification:new', notif);
      } catch { /* socket unavailable */ }
    }

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:authorization-updated', updated);
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:log-new', resolutionLog);
    } catch {
      logger.warn('Socket.IO unavailable for authorization approve emit');
    }

    // Sync with Odoo for tardiness approval
    await syncOdooAttendance(tenantDb, auth, 'approve');

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/** Manager rejects an authorization */
export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) {
      throw new AppError(400, 'Rejection reason is required');
    }

    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
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
    const managerUser = await tenantDb('users').where({ id: managerId }).select('id', 'first_name', 'last_name').first();
    const managerName = managerUser ? `${managerUser.first_name} ${managerUser.last_name}` : managerId;
    const [resolutionLog] = await tenantDb('shift_logs')
      .insert({
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
      const [notif] = await tenantDb('employee_notifications').insert({
        user_id: auth.user_id,
        title: `${label} Rejected`,
        message: `Your ${label.toLowerCase()} authorization has been rejected: ${reason.trim()}`,
        type: 'danger',
        link_url: '/account/schedule',
      }).returning('*');
      try {
        getIO().of('/notifications').to(`user:${auth.user_id}`).emit('notification:new', notif);
      } catch { /* socket unavailable */ }
    }

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:authorization-updated', updated);
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:log-new', resolutionLog);
    } catch {
      logger.warn('Socket.IO unavailable for authorization reject emit');
    }

    // Sync with Odoo for early_check_in and late_check_out rejection
    await syncOdooAttendance(tenantDb, auth, 'reject');

    res.json({ success: true, data: updated });
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
    default: return authType;
  }
}

/**
 * Updates Odoo attendance based on authorization type and action
 * @param tenantDb - The tenant database connection
 * @param auth - The shift authorization record
 * @param action - 'approve' or 'reject'
 */
async function syncOdooAttendance(
  tenantDb: ReturnType<typeof import('knex').default>,
  auth: Record<string, unknown>,
  action: "approve" | "reject"
): Promise<void> {
  // Get the shift_log to find odoo_attendance_id
  const shiftLog = await tenantDb("shift_logs").where({ id: auth.shift_log_id }).first();
  if (!shiftLog || !shiftLog.odoo_attendance_id) {
    logger.warn(`No odoo_attendance_id found for shift_log ${auth.shift_log_id}`);
    return;
  }

  // Get the employee_shift to find shift_start and shift_end
  const shift = await tenantDb("employee_shifts").where({ id: auth.shift_id }).first();
  if (!shift) {
    logger.warn(`No employee_shift found for shift_id ${auth.shift_id}`);
    return;
  }

  const odooAttendanceId = shiftLog.odoo_attendance_id as number;

  try {
    if (action === "approve") {
      // Tardiness approved: update check_in to shift start time
      if (auth.auth_type === "tardiness") {
        const shiftStart = shift.shift_start;
        await updateAttendanceCheckIn(odooAttendanceId, shiftStart);

        // Also update hr.work.entry date_start
        await syncWorkEntryDateStart(odooAttendanceId, shiftStart);
      }
    } else if (action === "reject") {
      // Early check-in rejected: update check_in to shift start time
      if (auth.auth_type === "early_check_in") {
        const shiftStart = shift.shift_start;
        await updateAttendanceCheckIn(odooAttendanceId, shiftStart);

        // Also update hr.work.entry date_start
        await syncWorkEntryDateStart(odooAttendanceId, shiftStart);
      }
      // Late check-out rejected: update check_out to shift end time
      if (auth.auth_type === "late_check_out") {
        const shiftEnd = shift.shift_end;
        await updateAttendanceCheckOut(odooAttendanceId, shiftEnd);

        // Also update hr.work.entry date_stop
        await syncWorkEntryDateStop(odooAttendanceId, shiftEnd);
      }
    }
  } catch (err) {
    // Log error but don't fail the authorization - Odoo sync is best-effort
    logger.error(`Failed to sync Odoo attendance for authorization ${auth.id}: ${err}`);
  }
}

/**
 * Syncs hr.work.entry date_start with the shift start time
 */
async function syncWorkEntryDateStart(
  odooAttendanceId: number,
  shiftStart: string | Date
): Promise<void> {
  try {
    // Search for work entries by attendance_id
    const workEntries = (await searchWorkEntriesByAttendanceId(
      odooAttendanceId
    )) as Array<{ id: number; employee_id: [number, string]; attendance_id: number; date_start: string }>;

    if (workEntries.length > 0) {
      // Update the work entry's date_start
      const workEntryId = workEntries[0].id;
      await updateWorkEntryDateStart(workEntryId, shiftStart);
      logger.info(`Updated hr.work.entry ${workEntryId} date_start to match shift start`);
    } else {
      logger.warn(`No hr.work.entry found for attendance ${odooAttendanceId}`);
    }
  } catch (err) {
    logger.error(`Failed to sync hr.work.entry date_start: ${err}`);
  }
}

/**
 * Syncs hr.work.entry date_stop with the shift end time
 */
async function syncWorkEntryDateStop(
  odooAttendanceId: number,
  shiftEnd: string | Date
): Promise<void> {
  try {
    // Search for work entries by attendance_id
    const workEntries = (await searchWorkEntriesByAttendanceId(
      odooAttendanceId
    )) as Array<{ id: number; employee_id: [number, string]; attendance_id: number; date_stop: string }>;

    if (workEntries.length > 0) {
      // Update the work entry's date_stop
      const workEntryId = workEntries[0].id;
      await updateWorkEntryDateStop(workEntryId, shiftEnd);
      logger.info(`Updated hr.work.entry ${workEntryId} date_stop to match shift end`);
    } else {
      logger.warn(`No hr.work.entry found for attendance ${odooAttendanceId}`);
    }
  } catch (err) {
    logger.error(`Failed to sync hr.work.entry date_stop: ${err}`);
  }
}
