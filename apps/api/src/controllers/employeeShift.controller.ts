import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const user = req.user!;
    const branchIdsParam = req.query.branchIds as string | undefined;
    const branchId = req.query.branchId as string | undefined;

    let requestedIds: string[] | undefined;
    if (branchIdsParam) {
      requestedIds = branchIdsParam.split(',').filter(Boolean);
    } else if (branchId) {
      requestedIds = [branchId];
    }

    let query = tenantDb('employee_shifts');

    if (requestedIds && requestedIds.length > 0) {
      const allowed = user.permissions.includes('admin.view_all_branches')
        ? requestedIds
        : requestedIds.filter((id) => user.branchIds.includes(id));
      query = query.whereIn('branch_id', allowed);
    } else if (!user.permissions.includes('admin.view_all_branches')) {
      query = query.whereIn('branch_id', user.branchIds);
    }

    // Filtering
    const status = req.query.status as string | undefined;
    if (status) query = query.where('status', status);

    const employeeName = req.query.employeeName as string | undefined;
    if (employeeName) query = query.where('employee_name', 'ilike', `%${employeeName}%`);

    const shiftStartFrom = req.query.shiftStartFrom as string | undefined;
    if (shiftStartFrom) query = query.where('shift_start', '>=', new Date(shiftStartFrom));

    const shiftStartTo = req.query.shiftStartTo as string | undefined;
    if (shiftStartTo) query = query.where('shift_start', '<=', new Date(shiftStartTo));

    const shiftEndFrom = req.query.shiftEndFrom as string | undefined;
    if (shiftEndFrom) query = query.where('shift_end', '>=', new Date(shiftEndFrom));

    const shiftEndTo = req.query.shiftEndTo as string | undefined;
    if (shiftEndTo) query = query.where('shift_end', '<=', new Date(shiftEndTo));

    const hasPendingApprovals = req.query.hasPendingApprovals as string | undefined;
    if (hasPendingApprovals === 'true') query = query.where('pending_approvals', '>', 0);

    // Sorting
    const allowedSortFields = ['shift_start', 'allocated_hours', 'pending_approvals'];
    const sortBy = allowedSortFields.includes(req.query.sortBy as string)
      ? (req.query.sortBy as string)
      : 'shift_start';
    const sortOrder = req.query.sortOrder === 'asc' ? 'asc' : 'desc';
    query = query.orderBy(sortBy, sortOrder);

    const shifts = await query;
    res.json({ success: true, data: shifts });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const id = req.params.id as string;

    const shift = await tenantDb('employee_shifts').where({ id }).first();
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
      const users = await tenantDb('users').whereIn('id', resolvedByIds).select('id', 'first_name', 'last_name');
      for (const u of users) resolvers[u.id] = `${u.first_name} ${u.last_name}`;
    }
    const authorizationsWithResolver = authorizations.map((a: Record<string, unknown>) => ({
      ...a,
      resolved_by_name: a.resolved_by ? (resolvers[a.resolved_by as string] ?? null) : null,
    }));

    res.json({ success: true, data: { ...shift, logs, authorizations: authorizationsWithResolver } });
  } catch (err) {
    console.error('employeeShift.get() error:', err);
    next(err);
  }
}

export async function endShift(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;

    const shift = await tenantDb('employee_shifts').where({ id }).first();
    if (!shift) throw new AppError(404, 'Shift not found');
    if (shift.status === 'ended') throw new AppError(400, 'Shift is already ended');
    if (shift.status === 'open') throw new AppError(400, 'Cannot end a shift that has not started');

    // Update shift status to ended
    const [updated] = await tenantDb('employee_shifts')
      .where({ id })
      .update({ status: 'ended', updated_at: new Date() })
      .returning('*');

    // Insert shift_ended log
    const [endLog] = await tenantDb('shift_logs')
      .insert({
        shift_id: id,
        branch_id: shift.branch_id,
        log_type: 'shift_ended',
        changes: JSON.stringify({ ended_by: managerId }),
        event_time: new Date(),
        odoo_payload: JSON.stringify({}),
      })
      .returning('*');

    // Check for overtime: total_worked_hours > allocated_hours
    const totalWorked = Number(shift.total_worked_hours ?? 0);
    const allocated = Number(shift.allocated_hours);

    if (totalWorked > allocated) {
      const overtimeMinutes = Math.round((totalWorked - allocated) * 60);

      const [auth] = await tenantDb('shift_authorizations')
        .insert({
          shift_id: id,
          shift_log_id: endLog.id,
          branch_id: shift.branch_id,
          user_id: shift.user_id ?? null,
          auth_type: 'overtime',
          diff_minutes: overtimeMinutes,
          needs_employee_reason: false,
          status: 'pending',
        })
        .returning('*');

      await tenantDb('employee_shifts')
        .where({ id })
        .increment('pending_approvals', 1);

      const refreshed = await tenantDb('employee_shifts').where({ id }).first();

      try {
        const io = getIO();
        io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:updated', refreshed);
        io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:log-new', endLog);
        io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:authorization-new', auth);
      } catch { /* socket unavailable */ }

      res.json({ success: true, data: refreshed });
    } else {
      try {
        const io = getIO();
        io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:updated', updated);
        io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:log-new', endLog);
      } catch { /* socket unavailable */ }

      res.json({ success: true, data: updated });
    }
  } catch (err) {
    next(err);
  }
}
