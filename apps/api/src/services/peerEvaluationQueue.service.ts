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
  }  // Step 1: Resolve evaluator's user_key to identify their Odoo records
  const evaluatorUser = await db.getDb()('users')
    .where({ id: payload.shiftUserId })
    .first('user_key');

  if (!evaluatorUser?.user_key) {
    logger.warn(
      {
        queue: env.PEER_EVAL_QUEUE_NAME,
        jobId: job.id,
        shiftId: payload.shiftId,
        userId: payload.shiftUserId,
      },
      'Peer evaluation job skipped: evaluator has no user_key',
    );
    return;
  }

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

  // Step 3: Query Odoo hr.attendance for records at same branch
  // Search window: Scheduled start - 6h to Scheduled end + 6h to catch all relevant activity
  const searchStart = new Date(shiftStartDate.getTime() - 6 * 60 * 60 * 1000);
  const searchEnd = new Date(shiftEndDate.getTime() + 6 * 60 * 60 * 1000);
  const searchStartDomain = toOdooDateTime(searchStart);
  const searchEndDomain = toOdooDateTime(searchEnd);

  const rawAttendances = (await callOdooKw('hr.attendance', 'search_read', [], {
    domain: [
      ['x_company_id', '=', Number(payload.branchOdooId)],
      ['check_in', '<', searchEndDomain],
      ['check_in', '>=', searchStartDomain],
    ],
    fields: ['id', 'employee_id', 'check_in', 'check_out'],
    limit: 500,
  })) as Array<{
    id: number;
    employee_id: [number, string] | false;
    check_in: string;
    check_out: string | false;
  }>;

  if (rawAttendances.length === 0) {
    logger.info(
      { queue: env.PEER_EVAL_QUEUE_NAME, jobId: job.id, shiftId: payload.shiftId },
      'Peer evaluation job: no attendances found at branch',
    );
    return;
  }

  // Step 4: Resolve all employee records to get x_website_key to identify the evaluator
  const employeeIds = [...new Set(rawAttendances.map((a) => (Array.isArray(a.employee_id) ? a.employee_id[0] : null)).filter((id): id is number => id !== null))];
  const hrEmployees = (await callOdooKw('hr.employee', 'search_read', [], {
    domain: [['id', 'in', employeeIds]],
    fields: ['id', 'x_website_key'],
  })) as Array<{ id: number; x_website_key?: string | null }>;

  const websiteKeyByOdooId = new Map<number, string>();
  for (const emp of hrEmployees) {
    if (emp.x_website_key) websiteKeyByOdooId.set(emp.id, emp.x_website_key);
  }

  // Identify evaluator's windows
  const evaluatorOdooIds = new Set(hrEmployees.filter(e => e.x_website_key === evaluatorUser.user_key).map(e => e.id));
  const evaluatorWindows: Array<{ start: number; end: number }> = [];

  for (const att of rawAttendances) {
    if (!Array.isArray(att.employee_id)) continue;
    if (evaluatorOdooIds.has(att.employee_id[0])) {
      const start = parseOdooUtcDateTime(att.check_in).getTime();
      const end = att.check_out ? parseOdooUtcDateTime(att.check_out).getTime() : Date.now();
      evaluatorWindows.push({ start, end });
    }
  }

  if (evaluatorWindows.length === 0) {
    logger.info(
      { queue: env.PEER_EVAL_QUEUE_NAME, jobId: job.id, shiftId: payload.shiftId },
      'Peer evaluation job: no evaluator attendance found in Odoo',
    );
    return;
  }

  // Step 5: Calculate actual overlap per coworker based on evaluator's windows
  const overlapByEmployee = new Map<number, number>();

  for (const attendance of rawAttendances) {
    if (!Array.isArray(attendance.employee_id)) continue;
    
    const employeeOdooId = attendance.employee_id[0];
    // Skip evaluator records
    if (evaluatorOdooIds.has(employeeOdooId)) continue;

    const checkInMs = parseOdooUtcDateTime(attendance.check_in).getTime();
    const checkOutMs = attendance.check_out
      ? parseOdooUtcDateTime(attendance.check_out).getTime()
      : Date.now();

    // Calculate overlap with ANY of the evaluator's own attendance windows
    let coworkerTotalOverlapMs = 0;
    for (const win of evaluatorWindows) {
      const overlapStart = Math.max(checkInMs, win.start);
      const overlapEnd = Math.min(checkOutMs, win.end);
      const duration = overlapEnd - overlapStart;
      if (duration > 0) {
        coworkerTotalOverlapMs += duration;
      }
    }

    if (coworkerTotalOverlapMs > 0) {
      const overlapMinutes = coworkerTotalOverlapMs / 60000;
      overlapByEmployee.set(
        employeeOdooId,
        (overlapByEmployee.get(employeeOdooId) ?? 0) + overlapMinutes,
      );
    }
  }

  // Step 6: Filter by the 60-min threshold and resolve to Omnilert users
  const overlappingEmployeeEntries = Array.from(overlapByEmployee.entries())
    .filter(([_, mins]) => mins >= 60);

  if (overlappingEmployeeEntries.length === 0) {
    logger.info(
      { queue: env.PEER_EVAL_QUEUE_NAME, jobId: job.id, shiftId: payload.shiftId },
      'Peer evaluation job: no qualifying co-workers found after overlap calculation',
    );
    return;
  }

  const qualifyingCoworkerOdooIds = overlappingEmployeeEntries.map(([id]) => id);
  const relevantWebsiteKeys = qualifyingCoworkerOdooIds
    .map(id => websiteKeyByOdooId.get(id))
    .filter((k): k is string => Boolean(k));

  const masterUsers = await db.getDb()('users')
    .whereIn('user_key', relevantWebsiteKeys)
    .select('id', 'user_key');

  const userIdByWebsiteKey = new Map<string, string>();
  for (const user of masterUsers as Array<{ id: string; user_key: string | null }>) {
    if (user.user_key) userIdByWebsiteKey.set(user.user_key, user.id);
  }

  const qualifyingCoworkers: Array<{ userId: string; overlapMinutes: number }> = [];
  for (const [odooId, mins] of overlappingEmployeeEntries) {
    const key = websiteKeyByOdooId.get(odooId);
    const userId = key ? userIdByWebsiteKey.get(key) : null;
    if (userId && userId !== payload.shiftUserId) {
      qualifyingCoworkers.push({ userId, overlapMinutes: mins });
    }
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

  // Step 7: Limit to exactly ONE random qualifying co-worker per evaluator per shift
  
  // First, check if an evaluation already exists for this shift/evaluator
  const existingEval = await db.getDb()('peer_evaluations')
    .where({ shift_id: payload.shiftId, evaluator_user_id: payload.shiftUserId })
    .first();

  if (existingEval) {
    logger.info(
      { queue: env.PEER_EVAL_QUEUE_NAME, jobId: job.id, shiftId: payload.shiftId, existingId: existingEval.id },
      'Peer evaluation job: evaluator already has an evaluation for this shift, skipping',
    );
    return;
  }

  // Pick one random co-worker from the qualifying list
  const randomIndex = Math.floor(Math.random() * qualifyingCoworkers.length);
  const targetCoworker = qualifyingCoworkers[randomIndex];

  // Step 8: Insert the single peer_evaluation record
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  let insertedCount = 0;
  let firstInsertedId: string | null = null;

  const rows = await db.getDb()('peer_evaluations')
    .insert({
      company_id: payload.companyId,
      evaluator_user_id: payload.shiftUserId,
      evaluated_user_id: targetCoworker.userId,
      shift_id: payload.shiftId,
      overlap_minutes: Math.round(targetCoworker.overlapMinutes),
      status: 'pending',
      expires_at: expiresAt,
    })
    .onConflict(['evaluator_user_id', 'evaluated_user_id', 'shift_id'])
    .ignore()
    .returning('id');

  if (rows.length > 0 && rows[0]) {
    firstInsertedId = (rows[0] as unknown as { id: string }).id;
    insertedCount = 1;
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
