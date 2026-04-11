import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export type ActivityType = 'break' | 'field_task';

export interface StartActivityInput {
  userId: string;
  shiftId: string;
  activityType: ActivityType;
  details?: any;
  occurredAt?: Date;
}

export interface EndActivityInput {
  userId: string;
  shiftId: string;
  activityId?: string; // Optional if we want to end the "current" one
  endedAt?: Date;
}

export async function startActivity(input: StartActivityInput) {
  const tenantDb = db.getDb();
  
  // Verify shift exists and is active
  const shift = await tenantDb('employee_shifts').where({ id: input.shiftId }).first();
  if (!shift) throw new AppError(404, 'Shift not found');
  if (shift.status !== 'active') throw new AppError(400, 'Activities can only be started for active shifts');

  // Check if there's already an active activity for this user/shift
  const existingActive = await tenantDb('shift_activities')
    .where({ shift_id: input.shiftId, user_id: input.userId, end_time: null })
    .first();
  if (existingActive) {
    throw new AppError(400, `An active ${existingActive.activity_type} is already in progress`);
  }

  const startTime = input.occurredAt ?? new Date();

  return await db.getDb().transaction(async (trx) => {
    // 1. Create activity record
    const [activity] = await trx('shift_activities')
      .insert({
        user_id: input.userId,
        shift_id: input.shiftId,
        activity_type: input.activityType,
        start_time: startTime,
        activity_details: input.details ? JSON.stringify(input.details) : null,
      })
      .returning('*');

    // 2. Create shift log
    const logType = input.activityType === 'break' ? 'break_start' : 'field_task_start';
    const [log] = await trx('shift_logs')
      .insert({
        company_id: shift.company_id,
        shift_id: input.shiftId,
        branch_id: shift.branch_id,
        log_type: logType,
        changes: JSON.stringify({ activity_id: activity.id, details: input.details }),
        event_time: startTime,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*');

    // Emit socket events
    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:activity-started', {
        shiftId: input.shiftId,
        activity,
      });
      io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:log-new', log);
    } catch (err) {
      logger.warn('Socket.IO not available for shift activity start emit');
    }

    return { activity, log };
  });
}

export async function endActivity(input: EndActivityInput) {
  const tenantDb = db.getDb();
  const endTime = input.endedAt ?? new Date();

  const query = tenantDb('shift_activities')
    .where({ shift_id: input.shiftId, user_id: input.userId, end_time: null });
  
  if (input.activityId) {
    query.where({ id: input.activityId });
  }

  const activity = await query.first();
  if (!activity) throw new AppError(404, 'No active activity found to end');

  const shift = await tenantDb('employee_shifts').where({ id: input.shiftId }).first();
  if (!shift) throw new AppError(404, 'Shift not found');

  const start = new Date(activity.start_time);
  const durationMs = endTime.getTime() - start.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  return await db.getDb().transaction(async (trx) => {
    // 1. Update activity record
    const [updatedActivity] = await trx('shift_activities')
      .where({ id: activity.id })
      .update({
        end_time: endTime,
        duration_minutes: durationMinutes,
      })
      .returning('*');

    // 2. Create shift log
    const logType = activity.activity_type === 'break' ? 'break_end' : 'field_task_end';
    const [log] = await trx('shift_logs')
      .insert({
        company_id: shift.company_id,
        shift_id: input.shiftId,
        branch_id: shift.branch_id,
        log_type: logType,
        changes: JSON.stringify({ activity_id: activity.id, duration_minutes: durationMinutes }),
        event_time: endTime,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*');

    // Emit socket events
    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:activity-ended', {
        shiftId: input.shiftId,
        activity: updatedActivity,
      });
      io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:log-new', log);
    } catch (err) {
      logger.warn('Socket.IO not available for shift activity end emit');
    }

    return { activity: updatedActivity, log };
  });
}

export async function getActiveActivity(shiftId: string, userId: string) {
  return await db.getDb()('shift_activities')
    .where({ shift_id: shiftId, user_id: userId, end_time: null })
    .first();
}
