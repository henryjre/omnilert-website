import type { Request, Response, NextFunction } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';
import { db } from '../config/database.js';
import { enqueuePeerEvaluationJob } from '../services/peerEvaluationQueue.service.js';
import { logger } from '../utils/logger.js';
import * as shiftActivityService from '../services/shiftActivity.service.js';
import { batchCheckOutAttendances } from '../services/odoo.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const user = req.user!;
    const branchIdsParam = req.query.branchIds as string | undefined;
    const branchId = req.query.branchId as string | undefined;

    let requestedIds: string[] | undefined;
    if (branchIdsParam) {
      requestedIds = branchIdsParam.split(',').filter(Boolean);
    } else if (branchId) {
      requestedIds = [branchId];
    }

    let query = tenantDb('employee_shifts')
      .leftJoin('users', 'employee_shifts.user_id', 'users.id')
      .select(
        'employee_shifts.*',
        'users.avatar_url as user_avatar_url',
      );

    if (requestedIds && requestedIds.length > 0) {
      const allowed = user.permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES)
        ? requestedIds
        : requestedIds.filter((id) => user.branchIds.includes(id));
      query = query.whereIn('employee_shifts.branch_id', allowed);
    } else if (!user.permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES)) {
      query = query.whereIn('employee_shifts.branch_id', user.branchIds);
    }

    // Filtering
    const status = req.query.status as string | undefined;
    if (status) query = query.where('employee_shifts.status', status);

    const employeeName = req.query.employeeName as string | undefined;
    if (employeeName) query = query.where('employee_shifts.employee_name', 'ilike', `%${employeeName}%`);

    const shiftStartFrom = req.query.shiftStartFrom as string | undefined;
    if (shiftStartFrom) query = query.where('employee_shifts.shift_start', '>=', new Date(shiftStartFrom));

    const shiftStartTo = req.query.shiftStartTo as string | undefined;
    if (shiftStartTo) query = query.where('employee_shifts.shift_start', '<=', new Date(shiftStartTo));

    const shiftEndFrom = req.query.shiftEndFrom as string | undefined;
    if (shiftEndFrom) query = query.where('employee_shifts.shift_end', '>=', new Date(shiftEndFrom));

    const shiftEndTo = req.query.shiftEndTo as string | undefined;
    if (shiftEndTo) query = query.where('employee_shifts.shift_end', '<=', new Date(shiftEndTo));

    const hasPendingApprovals = req.query.hasPendingApprovals as string | undefined;
    if (hasPendingApprovals === 'true') query = query.where('employee_shifts.pending_approvals', '>', 0);

    // Sorting
    const allowedSortFields = ['shift_start', 'allocated_hours', 'pending_approvals'];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : 'shift_start';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.orderBy(`employee_shifts.${sortBy}`, sortOrder);

    const shifts = await query;
    const shiftIds = shifts.map((s: any) => s.id);
    const activeActivities = shiftIds.length > 0
      ? await tenantDb('shift_activities')
          .whereIn('shift_id', shiftIds)
          .whereNull('end_time')
      : [];
    
    const activityMap = Object.fromEntries(activeActivities.map((a: any) => [a.shift_id, a]));
    
    const breakDurations = shiftIds.length > 0
      ? await tenantDb('shift_activities')
          .whereIn('shift_id', shiftIds)
          .where({ activity_type: 'break' })
          .whereNotNull('end_time')
          .select('shift_id')
          .sum('duration_minutes as break_minutes')
          .groupBy('shift_id')
      : [];
    
    const breakMap = Object.fromEntries(breakDurations.map((b: any) => [b.shift_id, Number(b.break_minutes) || 0]));

    const data = shifts.map((s: any) => ({
      ...s,
      active_activity: activityMap[s.id] || null,
      total_break_hours: (breakMap[s.id] || 0) / 60,
    }));

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const id = req.params.id as string;

    const shift = await tenantDb('employee_shifts')
      .leftJoin('users', 'employee_shifts.user_id', 'users.id')
      .where('employee_shifts.id', id)
      .select(
        'employee_shifts.*',
        'users.avatar_url as user_avatar_url',
      )
      .first();
    if (!shift) throw new AppError(404, 'Shift not found');

    const logs = await tenantDb('shift_logs')
      .where({ shift_id: id })
      .orderBy('event_time', 'asc');

    const authorizations = await tenantDb('shift_authorizations')
      .where({ shift_id: id })
      .orderBy('created_at', 'asc');

    // Attach resolver name for display
    const resolvedByIds = authorizations
      .map((a: Record<string, unknown>) => a.resolved_by)
      .filter(Boolean) as string[];
    const resolvers: Record<string, string> = {};
    if (resolvedByIds.length > 0) {
      const users = await db.getDb()('users').whereIn('id', resolvedByIds).select('id', 'first_name', 'last_name');
      for (const u of users) resolvers[u.id] = `${u.first_name} ${u.last_name}`;
    }
    const authorizationsWithResolver = authorizations.map((a: Record<string, unknown>) => ({
      ...a,
      resolved_by_name: a.resolved_by ? (resolvers[a.resolved_by as string] ?? null) : null,
    }));

    const activeActivity = await shiftActivityService.getActiveActivity(id, shift.user_id);

    const completedBreaks = await tenantDb('shift_activities')
      .where({ shift_id: id, activity_type: 'break' })
      .whereNotNull('end_time')
      .select('duration_minutes');
    const totalBreakMinutes = completedBreaks.reduce((sum: number, a: any) => sum + (Number(a.duration_minutes) || 0), 0);
    const totalBreakHours = totalBreakMinutes / 60;

    res.json({
      success: true,
      data: {
        ...shift,
        total_break_hours: totalBreakHours,
        logs,
        authorizations: authorizationsWithResolver,
        active_activity: activeActivity || null,
      },
    });
  } catch (err) {
    console.error('employeeShift.get() error:', err);
    next(err);
  }
}

export async function endShift(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const managerId = req.user!.sub;
    const requestedCheckOutTime = req.body?.checkOutTime;
    const userPermissions = new Set(req.user!.permissions);
    const canEndAnyShift = userPermissions.has(PERMISSIONS.SCHEDULE_MANAGE_SHIFT)
      || userPermissions.has(PERMISSIONS.SCHEDULE_END_SHIFT)
      || userPermissions.has(PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC);
    const canEndOwnShift = req.user!.permissions.includes(PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE);
    if (!canEndAnyShift && !canEndOwnShift) throw new AppError(403, 'Forbidden');
    const id = req.params.id as string;

    const shift = await tenantDb('employee_shifts').where({ id }).first();
    if (!shift) throw new AppError(404, 'Shift not found');
    if (shift.status === 'ended') throw new AppError(400, 'Shift is already ended');
    if (shift.status === 'open') throw new AppError(400, 'Cannot end a shift that has not started');
    if (!canEndAnyShift && shift.user_id !== managerId) {
      throw new AppError(403, 'You can only end your own shift');
    }

    // 1. Find the latest attendance ID to check out
    const lastCheckIn = await tenantDb('shift_logs')
      .where({ shift_id: id, log_type: 'check_in' })
      .whereNotNull('odoo_attendance_id')
      .orderBy('event_time', 'desc')
      .first();

    if (!lastCheckIn?.odoo_attendance_id) {
      throw new AppError(400, 'No active Odoo attendance found for this shift. Check out failed.');
    }

    // 2. Identify the user for "Ended by" attribution
    const managerUser = await tenantDb('users').where({ id: managerId }).first('first_name', 'last_name');
    const managerName = managerUser 
      ? `${managerUser.first_name} ${managerUser.last_name}`.trim() 
      : 'User';
    const checkOutTime = requestedCheckOutTime ? new Date(requestedCheckOutTime) : new Date();
    if (Number.isNaN(checkOutTime.getTime())) {
      throw new AppError(400, 'Invalid checkOutTime');
    }

    // 3. Create the shift_ended log immediately. 
    // The Odoo webhook that follows will see this existing log and update it with Odoo metadata.
    const resolvedCompanyId = (shift.company_id as string | null | undefined) ?? companyId;
    if (!resolvedCompanyId) throw new AppError(400, 'Company context is required');
    await tenantDb('shift_logs')
      .insert({
        company_id: resolvedCompanyId,
        shift_id: id,
        branch_id: shift.branch_id,
        log_type: 'shift_ended',
        changes: JSON.stringify({ ended_by: managerName }),
        event_time: new Date(),
        odoo_payload: JSON.stringify({}),
      });

    // 4. Trigger Odoo checkout
    // This will trigger the Omnilert checkout webhook which calculates and deducts breaks from the work entry.
    await batchCheckOutAttendances([Number(lastCheckIn.odoo_attendance_id)], checkOutTime);

    res.json({ success: true, message: 'Check out triggered in Odoo.' });
  } catch (err) {
    next(err);
  }
}

export async function startActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const shiftId = req.params.id as string;
    const userId = req.user!.sub;
    const { activityType, details } = req.body;

    if (!activityType || !['break', 'field_task'].includes(activityType)) {
      throw new AppError(400, 'Invalid activity type');
    }

    const result = await shiftActivityService.startActivity({
      userId,
      shiftId,
      activityType,
      details,
    });

    res.json({ success: true, data: result.activity });
  } catch (err) {
    next(err);
  }
}

export async function endActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const shiftId = req.params.id as string;
    const userId = req.user!.sub;
    const { activityId } = req.body;

    const result = await shiftActivityService.endActivity({
      userId,
      shiftId,
      activityId,
    });

    res.json({ success: true, data: result.activity });
  } catch (err) {
    next(err);
  }
}

export async function getActiveActivity(req: Request, res: Response, next: NextFunction) {
  try {
    const shiftId = req.params.id as string;
    const userId = req.user!.sub;

    const activity = await shiftActivityService.getActiveActivity(shiftId, userId);

    res.json({ success: true, data: activity || null });
  } catch (err) {
    next(err);
  }
}
