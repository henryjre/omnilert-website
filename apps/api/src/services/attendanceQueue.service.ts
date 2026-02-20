import { PgBoss, type Job } from 'pg-boss';
import { getIO } from '../config/socket.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface EarlyCheckInAuthJobPayload {
  companyDbName: string;
  branchId: string;
  shiftId: string;
  shiftLogId: string;
  userId: string | null;
  checkInEventTime: string;
}

let boss: PgBoss | null = null;
let workerId: string | null = null;

function getSingletonKey(payload: EarlyCheckInAuthJobPayload): string {
  return `${payload.companyDbName}:${payload.shiftLogId}:early_check_in`;
}

function getRetryLimit(): number {
  const retryLimit = Number(env.EARLY_CHECKIN_RETRY_LIMIT);
  return Number.isFinite(retryLimit) && retryLimit >= 0 ? retryLimit : 3;
}

async function processEarlyCheckInJob(job: Job<EarlyCheckInAuthJobPayload>): Promise<void> {
  const payload = job.data;
  const tenantDb = await db.getTenantDb(payload.companyDbName);

  const shift = await tenantDb('employee_shifts')
    .where({ id: payload.shiftId, branch_id: payload.branchId })
    .first();
  if (!shift) {
    logger.info(
      {
        queue: env.EARLY_CHECKIN_QUEUE_NAME,
        jobId: job.id,
        payload,
      },
      'Early check-in auth job skipped: shift not found',
    );
    return;
  }

  const shiftLog = await tenantDb('shift_logs')
    .where({ id: payload.shiftLogId, branch_id: payload.branchId })
    .first();
  if (!shiftLog || shiftLog.log_type !== 'check_in') {
    logger.info(
      {
        queue: env.EARLY_CHECKIN_QUEUE_NAME,
        jobId: job.id,
        shiftLogId: payload.shiftLogId,
      },
      'Early check-in auth job skipped: check-in log not found',
    );
    return;
  }

  const existingAuth = await tenantDb('shift_authorizations')
    .where({
      shift_log_id: payload.shiftLogId,
      auth_type: 'early_check_in',
    })
    .first();
  if (existingAuth) {
    logger.info(
      {
        queue: env.EARLY_CHECKIN_QUEUE_NAME,
        jobId: job.id,
        shiftLogId: payload.shiftLogId,
        authId: existingAuth.id,
      },
      'Early check-in auth job skipped: authorization already exists',
    );
    return;
  }

  const eventTime = Number.isNaN(new Date(payload.checkInEventTime).getTime())
    ? new Date(shiftLog.event_time as string)
    : new Date(payload.checkInEventTime);
  const shiftStart = new Date(shift.shift_start as string);
  const diffMinutes = Math.round((shiftStart.getTime() - eventTime.getTime()) / 60000);
  if (diffMinutes <= 0) {
    logger.info(
      {
        queue: env.EARLY_CHECKIN_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
        diffMinutes,
      },
      'Early check-in auth job skipped: shift no longer early',
    );
    return;
  }

  const [auth] = await tenantDb('shift_authorizations')
    .insert({
      shift_id: shift.id as string,
      shift_log_id: payload.shiftLogId,
      branch_id: payload.branchId,
      user_id: payload.userId ?? (shift.user_id as string) ?? null,
      auth_type: 'early_check_in',
      diff_minutes: diffMinutes,
      needs_employee_reason: false,
      status: 'pending',
    })
    .returning('*');

  await tenantDb('employee_shifts')
    .where({ id: shift.id as string })
    .increment('pending_approvals', 1);

  try {
    getIO().of('/employee-shifts').to(`branch:${payload.branchId}`).emit('shift:authorization-new', auth);
  } catch {
    logger.warn('Socket.IO not available for delayed early check-in authorization emit');
  }

  logger.info(
    {
      queue: env.EARLY_CHECKIN_QUEUE_NAME,
      jobId: job.id,
      authId: auth.id,
      shiftId: shift.id,
    },
    'Early check-in authorization created from queued job',
  );
}

export async function initAttendanceQueue(): Promise<void> {
  if (boss) return;

  boss = new PgBoss({
    host: env.MASTER_DB_HOST,
    port: env.MASTER_DB_PORT,
    database: env.MASTER_DB_NAME,
    user: env.MASTER_DB_USER,
    password: env.MASTER_DB_PASSWORD,
    schema: env.QUEUE_SCHEMA,
  });

  boss.on('error', (error) => {
    logger.error({ err: error }, 'Attendance queue error');
  });

  await boss.start();

  const queueName = env.EARLY_CHECKIN_QUEUE_NAME;
  const existingQueue = await boss.getQueue(queueName);
  if (!existingQueue) {
    await boss.createQueue(queueName);
  }

  workerId = await boss.work<EarlyCheckInAuthJobPayload>(
    queueName,
    {
      pollingIntervalSeconds: 1,
      batchSize: 1,
    },
    async (jobs) => {
      for (const job of jobs) {
        await processEarlyCheckInJob(job);
      }
    },
  );

  logger.info(
    {
      queue: queueName,
      workerId,
      schema: env.QUEUE_SCHEMA,
    },
    'Attendance queue initialized',
  );
}

export async function stopAttendanceQueue(): Promise<void> {
  if (!boss) return;

  if (workerId) {
    await boss.offWork(env.EARLY_CHECKIN_QUEUE_NAME, { id: workerId, wait: true });
    workerId = null;
  }

  await boss.stop({ graceful: true });
  boss = null;
  logger.info({ queue: env.EARLY_CHECKIN_QUEUE_NAME }, 'Attendance queue stopped');
}

export async function enqueueEarlyCheckInAuthJob(
  payload: EarlyCheckInAuthJobPayload,
  runAt: Date,
): Promise<void> {
  if (!boss) {
    throw new Error('Attendance queue not initialized');
  }

  const singletonKey = getSingletonKey(payload);
  const jobId = await boss.send(env.EARLY_CHECKIN_QUEUE_NAME, payload, {
    startAfter: runAt,
    singletonKey,
    retryLimit: getRetryLimit(),
    retryDelay: 30,
    retryBackoff: true,
  });

  logger.info(
    {
      queue: env.EARLY_CHECKIN_QUEUE_NAME,
      jobId,
      singletonKey,
      runAt: runAt.toISOString(),
      payload,
    },
    jobId
      ? 'Scheduled delayed early check-in authorization job'
      : 'Skipped scheduling delayed early check-in authorization job (deduped)',
  );
}
