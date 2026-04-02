import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { notifyCronJobRun } from './cronNotification.service.js';
import { updateAttendanceCheckOut } from './odoo.service.js';

let cronHandle: NodeJS.Timeout | null = null;
const SHIFT_AUTH_EXPIRY_JOB_NAME = 'shift-authorization-expiry';

export async function runShiftAuthorizationExpiryRun(
  input: { source?: 'scheduled' | 'startup' } = {},
): Promise<void> {
  const source: 'scheduled' | 'startup' = input.source ?? 'scheduled';
  const startedAt = new Date();
  
  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const expiredRows = await db.getDb()('shift_authorizations')
      .whereIn('auth_type', ['late_check_out', 'tardiness'])
      .where('status', 'pending')
      .where('needs_employee_reason', true)
      .where(function () {
        this.whereNull('employee_reason').orWhere('employee_reason', '');
      })
      .where('created_at', '<', twentyFourHoursAgo)
      .select('*');

    for (const auth of expiredRows) {
      processed += 1;
      try {
        const resolvedAt = new Date();
        const reason = 'System generated rejection: No employee reason provided within 24 hours.';
        
        const [updated] = await db.getDb()('shift_authorizations')
          .where({ id: auth.id })
          .update({
            status: 'rejected',
            rejection_reason: reason,
            resolved_at: resolvedAt,
          })
          .returning('*');

        await db.getDb()('employee_shifts')
          .where({ id: auth.shift_id })
          .decrement('pending_approvals', 1);

        const resolvedCompanyId = auth.company_id;
        
        if (resolvedCompanyId) {
          const [resolutionLog] = await db.getDb()('shift_logs')
            .insert({
              company_id: resolvedCompanyId,
              shift_id: auth.shift_id,
              branch_id: auth.branch_id,
              log_type: 'authorization_resolved',
              changes: JSON.stringify({
                authorization_id: auth.id,
                auth_type: auth.auth_type,
                resolution: 'rejected',
                rejection_reason: reason,
                resolved_by_name: 'System',
                diff_minutes: auth.diff_minutes,
              }),
              event_time: resolvedAt,
              odoo_payload: JSON.stringify({}),
            })
            .returning('*');

          try {
            const io = getIO();
            io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:authorization-updated', updated);
            io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:log-new', resolutionLog);
          } catch {
            logger.warn('Socket.IO unavailable for authorization reject emit');
          }
        }

        // Sync with Odoo if needed
        if (auth.auth_type === 'late_check_out') {
          const shiftLog = await db.getDb()('shift_logs').where({ id: auth.shift_log_id }).first();
          const shift = await db.getDb()('employee_shifts').where({ id: auth.shift_id }).first();
          if (shiftLog && shiftLog.odoo_attendance_id && shift) {
             await updateAttendanceCheckOut(shiftLog.odoo_attendance_id as number, shift.shift_end);
          }
        }
        
        succeeded += 1;
      } catch (err) {
        failed += 1;
        logger.error({ err, authId: auth.id }, 'Failed to process shift authorization expiry');
      }
    }

    if (processed > 0) {
      logger.info({ processed, succeeded, failed }, 'Shift authorizations expiry run completed');
    }

  } catch (error) {
    logger.error({ err: error }, 'Shift authorizations expiry cron run failed');
    failed += 1;
  }

  const finishedAt = new Date();
  const status: 'success' | 'failed' = failed > 0 ? 'failed' : 'success';
  const errorMessage = failed > 0 ? `Failed processing ${failed} authorizations` : null;

  await notifyCronJobRun({
    jobName: SHIFT_AUTH_EXPIRY_JOB_NAME,
    jobFamily: 'shift_authorization_expiry' as any,
    schedule: '*/30 * * * *',
    source,
    startedAt,
    finishedAt,
    status,
    message: status === 'failed'
      ? 'Shift authorization expiry cron run failed'
      : 'Shift authorization expiry cron run completed',
    errorMessage,
    stats: {
      processed,
      succeeded,
      failed,
      skipped: 0,
    },
  });
}

export function initShiftAuthorizationCron(): void {
  if (cronHandle) return;
  void runShiftAuthorizationExpiryRun({ source: 'startup' });
  cronHandle = setInterval(() => {
    void runShiftAuthorizationExpiryRun({ source: 'scheduled' });
  }, 30 * 60 * 1000); // 30 minutes
  logger.info('Shift authorization expiry cron initialized (every 30 minutes)');
}

export function stopShiftAuthorizationCron(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
