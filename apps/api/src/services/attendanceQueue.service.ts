import { PgBoss, type Job } from 'pg-boss';
import { getIO } from '../config/socket.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export interface EarlyCheckInAuthJobPayload {
  companyId: string;
  branchId: string;
  shiftId: string;
  shiftLogId: string;
  userId: string | null;
  checkInEventTime: string;
}

let boss: PgBoss | null = null;
let workerId: string | null = null;

function getSingletonKey(payload: EarlyCheckInAuthJobPayload): string {
  return `${payload.companyId}:${payload.shiftLogId}:early_check_in`;
}

function getRetryLimit(): number {
  const retryLimit = Number(env.EARLY_CHECKIN_RETRY_LIMIT);
  return Number.isFinite(retryLimit) && retryLimit >= 0 ? retryLimit : 3;
}

interface EarlyCheckInJobProcessorDeps {
  findShiftById: (shiftId: string, branchId: string) => Promise<Record<string, unknown> | null>;
  findShiftLogById: (shiftLogId: string, branchId: string) => Promise<Record<string, unknown> | null>;
  findExistingAuthorization: (shiftLogId: string) => Promise<Record<string, unknown> | null>;
  createShiftAuthorization: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
  incrementShiftPendingApprovals: (shiftId: string) => Promise<void>;
  emitSocketEvent: (event: string, payload: Record<string, unknown>) => void;
  logInfo: (context: Record<string, unknown>, message: string) => void;
}

const defaultEarlyCheckInJobProcessorDeps: EarlyCheckInJobProcessorDeps = {
  findShiftById: async (shiftId, branchId) =>
    (await db.getDb()('employee_shifts')
      .where({ id: shiftId, branch_id: branchId })
      .first()) as Record<string, unknown> | null,
  findShiftLogById: async (shiftLogId, branchId) =>
    (await db.getDb()('shift_logs')
      .where({ id: shiftLogId, branch_id: branchId })
      .first()) as Record<string, unknown> | null,
  findExistingAuthorization: async (shiftLogId) =>
    (await db.getDb()('shift_authorizations')
      .where({
        shift_log_id: shiftLogId,
        auth_type: 'early_check_in',
      })
      .first()) as Record<string, unknown> | null,
  createShiftAuthorization: async (input) =>
    (await db.getDb()('shift_authorizations')
      .insert(input)
      .returning('*'))[0] as Record<string, unknown>,
  incrementShiftPendingApprovals: async (shiftId) => {
    await db.getDb()('employee_shifts')
      .where({ id: shiftId })
      .increment('pending_approvals', 1);
  },
  emitSocketEvent: (event, payload) => {
    try {
      getIO().of('/employee-shifts').to(`branch:${payload.branch_id}`).emit(event as any, payload as any);
    } catch {
      logger.warn('Socket.IO not available for delayed early check-in authorization emit');
    }
  },
  logInfo: (context, message) => {
    logger.info(context, message);
  },
};

export function createEarlyCheckInJobProcessor(
  overrides: Partial<EarlyCheckInJobProcessorDeps> = {},
) {
  const deps: EarlyCheckInJobProcessorDeps = {
    ...defaultEarlyCheckInJobProcessorDeps,
    ...overrides,
  };

  return async function processEarlyCheckInJob(
    job: Pick<Job<EarlyCheckInAuthJobPayload>, 'id' | 'data'>,
  ): Promise<void> {
    const payload = job.data;

    const shift = await deps.findShiftById(payload.shiftId, payload.branchId);
    if (!shift) {
      deps.logInfo(
        {
          queue: env.EARLY_CHECKIN_QUEUE_NAME,
          jobId: job.id,
          payload,
        },
        'Early check-in auth job skipped: shift not found',
      );
      return;
    }

    const shiftLog = await deps.findShiftLogById(payload.shiftLogId, payload.branchId);
    if (!shiftLog || shiftLog.log_type !== 'check_in') {
      deps.logInfo(
        {
          queue: env.EARLY_CHECKIN_QUEUE_NAME,
          jobId: job.id,
          shiftLogId: payload.shiftLogId,
        },
        'Early check-in auth job skipped: check-in log not found',
      );
      return;
    }

    if (shiftLog.shift_id !== payload.shiftId) {
      deps.logInfo(
        {
          queue: env.EARLY_CHECKIN_QUEUE_NAME,
          jobId: job.id,
          shiftId: payload.shiftId,
          shiftLogId: payload.shiftLogId,
          currentShiftId: shiftLog.shift_id ?? null,
        },
        'Early check-in auth job skipped: check-in log was reclassified away from the scheduled shift',
      );
      return;
    }

    const existingAuth = await deps.findExistingAuthorization(payload.shiftLogId);
    if (existingAuth) {
      deps.logInfo(
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
      deps.logInfo(
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

    const auth = await deps.createShiftAuthorization({
      company_id: payload.companyId,
      shift_id: shift.id as string,
      shift_log_id: payload.shiftLogId,
      branch_id: payload.branchId,
      user_id: payload.userId ?? (shift.user_id as string) ?? null,
      auth_type: 'early_check_in',
      diff_minutes: diffMinutes,
      needs_employee_reason: true,
      status: 'pending',
    });

    await deps.incrementShiftPendingApprovals(shift.id as string);
    deps.emitSocketEvent('shift:authorization-new', auth);

    deps.logInfo(
      {
        queue: env.EARLY_CHECKIN_QUEUE_NAME,
        jobId: job.id,
        authId: auth.id,
        shiftId: shift.id,
      },
      'Early check-in authorization created from queued job',
    );
  };
}

const processEarlyCheckInJob = createEarlyCheckInJobProcessor();

export async function initAttendanceQueue(): Promise<void> {
  if (boss) return;

  boss = new PgBoss({
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
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
