import { PgBoss, type Job } from 'pg-boss';
import { getIO } from '../config/socket.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { callOdooKw } from './odoo.service.js';
import { createAndDispatchNotification } from './notification.service.js';

export interface PeerEvaluationJobPayload {
  companyId: string;
  shiftId: string;
  branchId: string;
  shiftUserId: string;       // evaluator — the employee whose shift ended
  shiftStart: string;        // ISO string
  shiftEnd: string;          // ISO string (time of shift end)
  branchOdooId: string;      // from branches.odoo_branch_id
}

let boss: PgBoss | null = null;
let workerId: string | null = null;

function getSingletonKey(payload: PeerEvaluationJobPayload): string {
  return `${payload.companyId}:${payload.shiftId}:peer_evaluation`;
}

function toOdooDateTime(value: string | Date): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid datetime value for Odoo domain: ${String(value)}`);
  }
  // Odoo domains are safest with "YYYY-MM-DD HH:mm:ss" format.
  return parsed.toISOString().slice(0, 19).replace('T', ' ');
}

function parseOdooUtcDateTime(value: string): Date {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed.replace(' ', 'T') + 'Z');
  }
  return new Date(trimmed);
}

async function processPeerEvaluationJob(job: Job<PeerEvaluationJobPayload>): Promise<void> {
  const payload = job.data;
  const shiftStartDate = new Date(payload.shiftStart);
  const shiftEndDate = new Date(payload.shiftEnd);
  if (Number.isNaN(shiftStartDate.getTime()) || Number.isNaN(shiftEndDate.getTime())) {
    logger.error(
      {
        queue: env.PEER_EVAL_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
        shiftStart: payload.shiftStart,
        shiftEnd: payload.shiftEnd,
      },
      'Peer evaluation job skipped: invalid shift datetime payload',
    );
    return;
  }
  const shiftStartDomain = toOdooDateTime(shiftStartDate);
  const shiftEndDomain = toOdooDateTime(shiftEndDate);
  const lookbackStartDomain = toOdooDateTime(
    new Date(shiftStartDate.getTime() - 24 * 60 * 60 * 1000),
  );

  // Step 1: Get tenant DB
  // single DB

  // Step 2: Validate shift still ended
  const shift = await db.getDb()('employee_shifts')
    .where({ id: payload.shiftId, status: 'ended' })
    .first();
  if (!shift) {
    logger.info(
      {
        queue: env.PEER_EVAL_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
      },
      'Peer evaluation job skipped: shift not found or not ended',
    );
    return;
  }

  // Step 3: Query Odoo hr.attendance for overlapping records at same branch
  const rawAttendances = (await callOdooKw('hr.attendance', 'search_read', [], {
    domain: [
      ['x_company_id', '=', Number(payload.branchOdooId)],
      ['check_in', '<', shiftEndDomain],
      ['check_in', '>=', lookbackStartDomain],
      '|',
      ['check_out', '=', false],
      ['check_out', '>', shiftStartDomain],
    ],
    fields: ['id', 'employee_id', 'check_in', 'check_out'],
    limit: 500,
  })) as Array<{
    id: number;
    employee_id: [number, string] | false;
    check_in: string;
    check_out: string | false;
  }>;

  // Step 4: Calculate overlap per attendance record and group by employee_id
  const overlapByEmployee = new Map<number, number>();

  const shiftStartMs = shiftStartDate.getTime();
  const shiftEndMs = shiftEndDate.getTime();

  for (const attendance of rawAttendances) {
    // Skip invalid records where employee_id is not an array
    if (!Array.isArray(attendance.employee_id)) continue;

    const employeeOdooId = attendance.employee_id[0];
    const checkInDate = parseOdooUtcDateTime(attendance.check_in);
    if (Number.isNaN(checkInDate.getTime())) continue;
    const checkOutDate = attendance.check_out
      ? parseOdooUtcDateTime(attendance.check_out)
      : new Date();
    if (Number.isNaN(checkOutDate.getTime())) continue;

    const checkInMs = checkInDate.getTime();
    const checkOutMs = checkOutDate.getTime();

    const overlapStart = Math.max(checkInMs, shiftStartMs);
    const overlapEnd = Math.min(checkOutMs, shiftEndMs);
    const overlapMinutes = (overlapEnd - overlapStart) / 60000;

    if (overlapMinutes > 0) {
      overlapByEmployee.set(
        employeeOdooId,
        (overlapByEmployee.get(employeeOdooId) ?? 0) + overlapMinutes,
      );
    }
  }

  // Keep only employees where total overlapMinutes >= 60
  const overlappingEmployeeIds: number[] = [];
  for (const [employeeOdooId, totalMinutes] of overlapByEmployee.entries()) {
    if (totalMinutes >= 60) {
      overlappingEmployeeIds.push(employeeOdooId);
    }
  }

  if (overlappingEmployeeIds.length === 0) {
    logger.info(
      {
        queue: env.PEER_EVAL_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
      },
      'Peer evaluation job: no qualifying co-workers found',
    );
    return;
  }

  // Step 5: Batch query hr.employee for x_website_key (ONE call, not N calls)
  const uniqueEmployeeIds = [...overlappingEmployeeIds];
  const hrEmployees = (await callOdooKw('hr.employee', 'search_read', [], {
    domain: [['id', 'in', uniqueEmployeeIds]],
    fields: ['id', 'x_website_key'],
  })) as Array<{ id: number; x_website_key?: string | null }>;

  // Step 6 & 7: Resolve master user UUIDs and filter out the shift owner

  // Collect all valid x_website_key values from hr.employee records
  const websiteKeys = hrEmployees
    .map((e) => e.x_website_key)
    .filter((k): k is string => Boolean(k));

  // ONE batch query instead of N serial queries
  const masterUsers = await db.getDb()('users')
    .whereIn('user_key', websiteKeys)
    .select('id', 'user_key');
  const userIdByWebsiteKey = new Map<string, string>();
  for (const user of masterUsers as Array<{ id: string; user_key: string | null }>) {
    if (!user.user_key) continue;
    userIdByWebsiteKey.set(String(user.user_key), String(user.id));
  }

  const qualifyingCoworkers: Array<{ userId: string; overlapMinutes: number }> = [];

  for (const hrEmployee of hrEmployees) {
    const websiteKey = hrEmployee.x_website_key;
    if (!websiteKey) {
      logger.warn(
        {
          queue: env.PEER_EVAL_QUEUE_NAME,
          jobId: job.id,
          odooEmployeeId: hrEmployee.id,
        },
        'Peer evaluation: employee has no x_website_key, skipping',
      );
      continue;
    }

    // Verify user exists in master DB (using pre-fetched set)
    const resolvedUserId = userIdByWebsiteKey.get(websiteKey);
    if (!resolvedUserId) {
      logger.warn(
        {
          queue: env.PEER_EVAL_QUEUE_NAME,
          jobId: job.id,
          odooEmployeeId: hrEmployee.id,
          websiteKey,
        },
        'Peer evaluation: x_website_key not found in master users, skipping',
      );
      continue;
    }

    // Filter out the shift owner (no self-evaluation)
    if (resolvedUserId === payload.shiftUserId) continue;

    const totalOverlap = overlapByEmployee.get(hrEmployee.id) ?? 0;
    qualifyingCoworkers.push({ userId: resolvedUserId, overlapMinutes: totalOverlap });
  }

  if (qualifyingCoworkers.length === 0) {
    logger.info(
      {
        queue: env.PEER_EVAL_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
      },
      'Peer evaluation job: no qualifying co-workers after user resolution',
    );
    return;
  }

  // Step 8: Insert peer_evaluations for each qualifying co-worker
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let insertedCount = 0;
  let firstInsertedId: string | null = null;

  for (const coworker of qualifyingCoworkers) {
    const rows = await db.getDb()('peer_evaluations')
      .insert({
        company_id: payload.companyId,
        evaluator_user_id: payload.shiftUserId,
        evaluated_user_id: coworker.userId,
        shift_id: payload.shiftId,
        status: 'pending',
        q1_score: 5,
        q2_score: 5,
        q3_score: 5,
        overlap_minutes: coworker.overlapMinutes,
        expires_at: expiresAt,
      })
      .onConflict(['evaluator_user_id', 'evaluated_user_id', 'shift_id'])
      .ignore()
      .returning('id');

    if (rows.length > 0 && rows[0]) {
      if (firstInsertedId === null) {
        firstInsertedId = rows[0].id as string;
      }
      insertedCount++;
    }
  }

  if (insertedCount === 0) {
    logger.info(
      {
        queue: env.PEER_EVAL_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
      },
      'Peer evaluation job: all evaluations were deduped (already exist)',
    );
    return;
  }

  // Step 9: Add shift activity log entry for the shift owner
  const [availabilityLog] = await db.getDb()('shift_logs')
    .insert({
      company_id: payload.companyId,
      shift_id: payload.shiftId,
      branch_id: payload.branchId,
      log_type: 'peer_evaluation_available',
      changes: JSON.stringify({
        peer_evaluation_id: firstInsertedId,
        peer_evaluation_count: insertedCount,
        evaluator_user_id: payload.shiftUserId,
        note: insertedCount === 1
          ? 'Peer evaluation is now available for this shift.'
          : `${insertedCount} peer evaluations are now available for this shift.`,
      }),
      event_time: new Date(),
      odoo_payload: JSON.stringify({}),
    })
    .returning('*');

  // Step 10: Send ONE notification to evaluator
  await createAndDispatchNotification({
    userId: payload.shiftUserId,
    title: 'Peer Evaluation Available',
    message: `You have ${insertedCount} peer evaluation(s) to complete from your last shift. They expire in 24 hours.`,
    type: 'info',
    linkUrl: `/account/notifications?peerEvaluationId=${firstInsertedId}`,
  });

  // Step 11: Emit socket events for HR page and shift activity feed
  try {
    const io = getIO();
    io.of('/peer-evaluations').to(`company:${payload.companyId}`).emit('peer-evaluation:new', { shiftId: payload.shiftId });
    if (availabilityLog) {
      io.of('/employee-shifts').to(`branch:${payload.branchId}`).emit('shift:log-new', availabilityLog);
    }
  } catch {
    logger.warn('Socket.IO not available for peer evaluation events');
  }

  // Step 12: Log success
  logger.info(
    {
      queue: env.PEER_EVAL_QUEUE_NAME,
      jobId: job.id,
      shiftId: payload.shiftId,
      insertedCount,
      firstInsertedId,
    },
    'Peer evaluation job completed successfully',
  );
}

export async function initPeerEvaluationQueue(): Promise<void> {
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
    logger.error({ err: error }, 'Peer evaluation queue error');
  });

  await boss.start();

  const queueName = env.PEER_EVAL_QUEUE_NAME;
  const existingQueue = await boss.getQueue(queueName);
  if (!existingQueue) {
    await boss.createQueue(queueName);
  }

  workerId = await boss.work<PeerEvaluationJobPayload>(
    queueName,
    {
      pollingIntervalSeconds: 1,
      batchSize: 1,
    },
    async (jobs) => {
      for (const job of jobs) {
        try {
          await processPeerEvaluationJob(job);
        } catch (error) {
          logger.error(
            {
              err: error,
              queue: queueName,
              jobId: job.id,
              shiftId: job.data?.shiftId,
            },
            'Peer evaluation job failed',
          );
          throw error;
        }
      }
    },
  );

  logger.info(
    {
      queue: queueName,
      workerId,
      schema: env.QUEUE_SCHEMA,
    },
    'Peer evaluation queue initialized',
  );
}

export async function stopPeerEvaluationQueue(): Promise<void> {
  if (!boss) return;

  if (workerId) {
    await boss.offWork(env.PEER_EVAL_QUEUE_NAME, { id: workerId, wait: true });
    workerId = null;
  }

  await boss.stop({ graceful: true });
  boss = null;
  logger.info({ queue: env.PEER_EVAL_QUEUE_NAME }, 'Peer evaluation queue stopped');
}

export async function enqueuePeerEvaluationJob(payload: PeerEvaluationJobPayload): Promise<void> {
  if (!boss) {
    throw new Error('Peer evaluation queue not initialized');
  }

  const singletonKey = getSingletonKey(payload);
  const runAt = new Date(Date.now() + 5000);

  const jobId = await boss.send(env.PEER_EVAL_QUEUE_NAME, payload, {
    startAfter: runAt,
    singletonKey,
    retryLimit: 3,
    retryDelay: 30,
    retryBackoff: true,
  });

  logger.info(
    {
      queue: env.PEER_EVAL_QUEUE_NAME,
      jobId,
      singletonKey,
      runAt: runAt.toISOString(),
      payload,
    },
    jobId ? 'Scheduled peer evaluation job' : 'Skipped peer evaluation job (deduped)',
  );
}
