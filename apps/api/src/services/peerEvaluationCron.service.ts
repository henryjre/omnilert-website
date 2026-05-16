import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import {
  buildCronFailureErrorMessage,
  notifyCronJobRun,
  type CronJobFailureDetailInput,
} from './cronNotification.service.js';

let cronHandle: NodeJS.Timeout | null = null;
const PEER_EVALUATION_EXPIRY_JOB_NAME = 'peer-evaluation-expiry';

type ExpiredPeerEvaluationRow = {
  id: string;
  shift_id: string;
  evaluator_user_id: string;
};

export async function runPeerEvaluationExpiryRun(
  input: { source?: 'scheduled' | 'startup' } = {},
): Promise<void> {
  const source: 'scheduled' | 'startup' = input.source ?? 'scheduled';
  const startedAt = new Date();
  let companiesProcessed = 0;
  let companyFailures = 0;
  const failures: CronJobFailureDetailInput[] = [];

  const companies = await db.getDb()('companies')
    .where({ is_active: true })
    .select('id');

  for (const company of companies) {
    companiesProcessed += 1;
    try {
      const now = new Date();
      const expiredRows = await db.getDb()('peer_evaluations')
        .where('company_id', company.id)
        .where('status', 'pending')
        .where('expires_at', '<', now)
        .update({ status: 'expired', updated_at: now })
        .returning(['id', 'shift_id', 'evaluator_user_id']) as ExpiredPeerEvaluationRow[];

      const count = expiredRows.length;

      if (count > 0) {
        const shiftIds = [...new Set(expiredRows.map((row) => row.shift_id).filter(Boolean))];
        const shifts = shiftIds.length > 0
          ? await db.getDb()('employee_shifts')
            .whereIn('id', shiftIds)
            .select('id', 'branch_id')
          : [];
        const branchIdByShiftId = new Map<string, string>();
        for (const shift of shifts as Array<{ id: string; branch_id: string }>) {
          branchIdByShiftId.set(shift.id, shift.branch_id);
        }

        const grouped = new Map<string, { shiftId: string; evaluatorUserId: string; peerEvaluationIds: string[] }>();
        for (const row of expiredRows) {
          const key = `${row.shift_id}:${row.evaluator_user_id}`;
          const existing = grouped.get(key);
          if (existing) {
            existing.peerEvaluationIds.push(row.id);
            continue;
          }
          grouped.set(key, {
            shiftId: row.shift_id,
            evaluatorUserId: row.evaluator_user_id,
            peerEvaluationIds: [row.id],
          });
        }

        const logsToInsert: Array<Record<string, unknown>> = [];
        for (const group of grouped.values()) {
          const branchId = branchIdByShiftId.get(group.shiftId);
          if (!branchId) continue;
          logsToInsert.push({
            company_id: company.id,
            shift_id: group.shiftId,
            branch_id: branchId,
            log_type: 'peer_evaluation_expired',
            changes: JSON.stringify({
              evaluator_user_id: group.evaluatorUserId,
              peer_evaluation_ids: group.peerEvaluationIds,
              peer_evaluation_count: group.peerEvaluationIds.length,
              note: group.peerEvaluationIds.length === 1
                ? 'Peer evaluation expired before submission.'
                : `${group.peerEvaluationIds.length} peer evaluations expired before submission.`,
            }),
            event_time: now,
            odoo_payload: JSON.stringify({}),
          });
        }

        if (logsToInsert.length > 0) {
          const insertedLogs = await db.getDb()('shift_logs')
            .insert(logsToInsert)
            .returning('*');
          try {
            const io = getIO();
            for (const log of insertedLogs as Array<{ branch_id?: string }>) {
              if (!log.branch_id) continue;
              io.of('/employee-shifts').to(`branch:${log.branch_id}`).emit('shift:log-new', log);
            }
          } catch {
            logger.warn(
              { companyId: company.id },
              'Socket.IO not available for peer evaluation shift-log expiry emits',
            );
          }
        }

        try {
          getIO()
            .of('/peer-evaluations')
            .to(`company:${company.id}`)
            .emit('peer-evaluation:expired', { count });
        } catch {
          logger.warn(
            { companyId: company.id },
            'Socket.IO not available for peer evaluation expiry emit',
          );
        }

        logger.info(
          { companyId: company.id, expiredCount: count },
          'Peer evaluations expired',
        );
      }
    } catch (error) {
      companyFailures += 1;
      failures.push({
        entityType: 'company',
        entityId: String(company.id),
        error,
      });
      logger.error(
        { err: error, companyId: company.id },
        'Peer evaluation expiry cron failed for company',
      );
    }
  }

  logger.info('Peer evaluation expiry cron run completed');

  const finishedAt = new Date();
  const failedCompanyCount = companyFailures;
  const succeededCompanyCount = Math.max(0, companiesProcessed - failedCompanyCount);
  const status: 'success' | 'failed' = failedCompanyCount > 0 ? 'failed' : 'success';
  const errorMessage = failedCompanyCount > 0
    ? buildCronFailureErrorMessage({ failed: failedCompanyCount, failures })
    : null;

  await notifyCronJobRun({
    jobName: PEER_EVALUATION_EXPIRY_JOB_NAME,
    jobFamily: 'peer_evaluation_expiry',
    schedule: '*/30 * * * *',
    source,
    scheduledForKey: null,
    scheduledForManila: null,
    startedAt,
    finishedAt,
    attempt: null,
    status,
    message: status === 'failed'
      ? 'Peer evaluation expiry cron run failed'
      : 'Peer evaluation expiry cron run completed',
    errorMessage,
    stats: {
      processed: companiesProcessed,
      succeeded: succeededCompanyCount,
      failed: failedCompanyCount,
      skipped: 0,
    },
  });
}

export function initPeerEvaluationCron(): void {
  if (cronHandle) return;
  // Run once immediately on startup to catch any expired records from before last restart
  void runPeerEvaluationExpiryRun({ source: 'startup' });
  cronHandle = setInterval(() => {
    void runPeerEvaluationExpiryRun({ source: 'scheduled' });
  }, 30 * 60 * 1000); // 30 minutes
  logger.info('Peer evaluation expiry cron initialized (every 30 minutes)');
}

export function stopPeerEvaluationCron(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
