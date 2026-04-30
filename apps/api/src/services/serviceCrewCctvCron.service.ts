import { env } from '../config/env.js';
import { db } from '../config/database.js';
import type { Knex } from 'knex';
import { logger } from '../utils/logger.js';
import { getActiveAttendances, getEmployeeWebsiteKeyByEmployeeId } from './odoo.service.js';
import { emitStoreAuditEvent } from './storeAuditRealtime.service.js';
import { resolveCompanyByOdooBranchId, resolveUserIdByUserKey } from './webhook.service.js';
import {
  SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  getServiceCrewCctvSchedulingDecision,
} from './serviceCrewCctvCronScheduler.js';
import {
  createServiceCrewCctvOccurrenceExecutor,
  type ServiceCrewCctvRunOutcome,
} from './serviceCrewCctvCronRuntime.js';
import { notifyCronJobRun } from './cronNotification.service.js';

let scheduledHandle: NodeJS.Timeout | null = null;
let initialized = false;

const MAX_TIMEOUT_MS = 2_147_483_647;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const STALE_RUN_THRESHOLD_MS = 6 * 60 * 60 * 1000;
const DISABLED_AUDIT_ODOO_COMPANY_IDS = new Set<number>(env.SERVICE_CREW_CCTV_CRON_DISABLED_COMPANY_IDS);

interface ScheduledJobRunRow {
  id: string;
  status: string;
  attempt_count: number | string | null;
  started_at: Date | string | null;
}

interface ManilaDateParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function randomReward(): number {
  return Math.round((15 + Math.random() * 15) * 100) / 100;
}

export async function hasOpenBreakOrFieldTaskActivity(
  userId: string,
  dbConn: Knex = db.getDb(),
): Promise<boolean> {
  const activity = await dbConn('shift_activities')
    .where({ user_id: userId })
    .whereIn('activity_type', ['break', 'field_task'])
    .whereNull('end_time')
    .first('id');

  return Boolean(activity);
}

function getManilaDateParts(date: Date = new Date()): ManilaDateParts {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
  };
}

function formatScheduledForKey(date: Date): string {
  const parts = getManilaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function formatManilaDateTime(date: Date): string {
  const parts = getManilaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}

function clearScheduledHandle(): void {
  if (!scheduledHandle) return;
  clearTimeout(scheduledHandle);
  scheduledHandle = null;
}

function scheduleTimeoutUntil(target: Date, callback: () => void): void {
  clearScheduledHandle();

  const remainingMs = target.getTime() - Date.now();
  const delayMs = Math.min(Math.max(remainingMs, 0), MAX_TIMEOUT_MS);

  scheduledHandle = setTimeout(() => {
    if (!initialized) return;

    if (Date.now() < target.getTime()) {
      scheduleTimeoutUntil(target, callback);
      return;
    }

    callback();
  }, delayMs);
}

async function getScheduledRunRow(scheduledFor: Date): Promise<ScheduledJobRunRow | null> {
  const masterDb = db.getDb();
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const row = await masterDb('scheduled_job_runs')
    .where({
      job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
      scheduled_for_key: scheduledForKey,
    })
    .first('id', 'status', 'attempt_count', 'started_at');

  return (row as ScheduledJobRunRow | undefined) ?? null;
}

async function claimServiceCrewCctvOccurrence(scheduledFor: Date): Promise<boolean> {
  const masterDb = db.getDb();
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const scheduledForManila = formatManilaDateTime(scheduledFor);
  const now = new Date();

  return masterDb.transaction(async (trx) => {
    let existing = await trx('scheduled_job_runs')
      .where({ job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME, scheduled_for_key: scheduledForKey })
      .forUpdate()
      .first() as ScheduledJobRunRow | undefined;

    if (!existing) {
      const inserted = await trx('scheduled_job_runs')
        .insert({
          job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
          scheduled_for_key: scheduledForKey,
          scheduled_for_manila: scheduledForManila,
          status: 'running',
          attempt_count: 1,
          started_at: now,
          finished_at: null,
          error_message: null,
          created_at: now,
          updated_at: now,
        })
        .onConflict(['job_name', 'scheduled_for_key'])
        .ignore()
        .returning('id');

      if (inserted.length > 0) {
        return true;
      }

      existing = await trx('scheduled_job_runs')
        .where({ job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME, scheduled_for_key: scheduledForKey })
        .forUpdate()
        .first() as ScheduledJobRunRow | undefined;
    }

    if (!existing) return false;

    const startedAt = existing.started_at ? new Date(existing.started_at) : null;
    const isStaleRunning =
      existing.status === 'running'
      && (!startedAt || now.getTime() - startedAt.getTime() > STALE_RUN_THRESHOLD_MS);

    if (!isStaleRunning) {
      return false;
    }

    await trx('scheduled_job_runs')
      .where({ id: existing.id })
      .update({
        status: 'running',
        attempt_count: Number(existing.attempt_count ?? 0) + 1,
        started_at: now,
        finished_at: null,
        error_message: null,
        updated_at: now,
      });

    return true;
  });
}

async function markServiceCrewCctvOccurrenceSuccess(scheduledFor: Date): Promise<void> {
  const masterDb = db.getDb();
  const now = new Date();

  await masterDb('scheduled_job_runs')
    .where({
      job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
      scheduled_for_key: formatScheduledForKey(scheduledFor),
    })
    .update({
      status: 'success',
      finished_at: now,
      error_message: null,
      updated_at: now,
    });
}

async function markServiceCrewCctvOccurrenceSkipped(
  scheduledFor: Date,
  reason?: string | null,
): Promise<void> {
  const masterDb = db.getDb();
  const now = new Date();
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const updated = await masterDb('scheduled_job_runs')
    .where({
      job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
      scheduled_for_key: scheduledForKey,
    })
    .update({
      status: 'skipped',
      finished_at: now,
      error_message: reason?.slice(0, 4000) ?? null,
      updated_at: now,
    });

  if (updated > 0) return;

  await masterDb('scheduled_job_runs')
    .insert({
      job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
      scheduled_for_key: scheduledForKey,
      scheduled_for_manila: formatManilaDateTime(scheduledFor),
      status: 'skipped',
      attempt_count: 1,
      started_at: now,
      finished_at: now,
      error_message: reason?.slice(0, 4000) ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflict(['job_name', 'scheduled_for_key'])
    .merge({
      status: 'skipped',
      finished_at: now,
      error_message: reason?.slice(0, 4000) ?? null,
      updated_at: now,
    });
}

async function ensureMissedOccurrenceSkipped(
  scheduledFor: Date,
  reason: string,
): Promise<void> {
  const existing = await getScheduledRunRow(scheduledFor);
  if (existing) return;
  await markServiceCrewCctvOccurrenceSkipped(scheduledFor, reason);
}

async function markServiceCrewCctvOccurrenceFailure(
  scheduledFor: Date,
  error: unknown,
): Promise<void> {
  const masterDb = db.getDb();
  const now = new Date();
  const errorMessage = error instanceof Error ? error.message : String(error);

  await masterDb('scheduled_job_runs')
    .where({
      job_name: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
      scheduled_for_key: formatScheduledForKey(scheduledFor),
    })
    .update({
      status: 'failed',
      finished_at: now,
      error_message: errorMessage.slice(0, 4000),
      updated_at: now,
    });
}

export async function runServiceCrewCctvCron(): Promise<ServiceCrewCctvRunOutcome> {
  const MAX_AUDITS_PER_RUN = 1;
  const stats = { processed: 0, succeeded: 0, failed: 0, skipped: 0 };

  try {
    const attendances = await getActiveAttendances();
    const eligibleAttendances = attendances.filter(
      (attendance) => !DISABLED_AUDIT_ODOO_COMPANY_IDS.has(Number(attendance.company_id)),
    );

    if (eligibleAttendances.length === 0) {
      return {
        status: 'skipped',
        reason: 'No eligible active attendances found',
        stats,
      };
    }

    // Shuffle candidates to ensure randomness across the whole list
    const candidates = [...eligibleAttendances].sort(() => Math.random() - 0.5);
    const pickedEmployeeIds = new Set<string>();

    for (const chosen of candidates) {
      if (stats.succeeded >= MAX_AUDITS_PER_RUN) break;
      if (pickedEmployeeIds.has(String(chosen.employee_id))) continue;

      stats.processed += 1;

      try {
        const company = await resolveCompanyByOdooBranchId(chosen.company_id);
        const mappedBranch = await db.getDb()('branches')
          .where({
            odoo_branch_id: String(chosen.company_id),
            is_active: true,
          })
          .first('id');

        const branch = mappedBranch ?? await db.getDb()('branches')
          .where({ is_active: true })
          .orderBy([{ column: 'is_main_branch', order: 'desc' }, { column: 'created_at', order: 'asc' }])
          .first('id');

        if (!branch) {
          logger.warn(
            { employeeId: chosen.employee_id, odooBranchId: chosen.company_id },
            'Skipping SCC candidate: no active tenant branch available',
          );
          stats.skipped += 1;
          continue;
        }

        if (!mappedBranch) {
          logger.warn(
            { companyId: company.id, odooBranchId: chosen.company_id },
            'Service crew cctv cron could not map Odoo branch to tenant branch; using fallback branch',
          );
        }

        const auditedUserKey = await getEmployeeWebsiteKeyByEmployeeId(Number(chosen.employee_id));
        const auditedUserId = auditedUserKey
          ? await resolveUserIdByUserKey(auditedUserKey)
          : null;

        if (!auditedUserId) {
          logger.info(
            { employeeId: chosen.employee_id, employeeName: chosen.employee_name },
            'Skipping SCC candidate: not a website user',
          );
          stats.skipped += 1;
          continue;
        }

        const isOnBreakOrFieldTask = await hasOpenBreakOrFieldTaskActivity(auditedUserId);
        if (isOnBreakOrFieldTask) {
          logger.info(
            { employeeId: chosen.employee_id, employeeName: chosen.employee_name, auditedUserId },
            'Skipping SCC candidate: user is currently on break or field task',
          );
          stats.skipped += 1;
          continue;
        }

        const now = new Date();
        const [audit] = await db.getDb()('store_audits')
          .insert({
            company_id: company.id,
            type: 'service_crew_cctv',
            status: 'pending',
            branch_id: branch.id,
            monetary_reward: randomReward(),
            scc_odoo_employee_id: chosen.employee_id,
            scc_employee_name: chosen.employee_name,
            audited_user_id: auditedUserId,
            audited_user_key: auditedUserKey,
            created_at: now,
            updated_at: now,
          })
          .returning('*');

        pickedEmployeeIds.add(String(chosen.employee_id));
        stats.succeeded += 1;
        emitStoreAuditEvent(String(company.id), 'store-audit:new', audit);
      } catch (innerError) {
        logger.error(
          { err: innerError, employeeId: chosen.employee_id },
          'Failed to process individual SCC audit candidate',
        );
        stats.failed += 1;
      }
    }

    if (stats.succeeded === 0) {
      return {
        status: 'skipped',
        reason: stats.failed > 0 ? 'All attempts failed' : 'No eligible registered users found among candidates',
        stats,
      };
    }

    return {
      status: 'success',
      stats,
    };
  } catch (error) {
    logger.error({ err: error }, 'Service crew cctv cron failed');
    throw error;
  }
}

const executeServiceCrewCctvOccurrence = createServiceCrewCctvOccurrenceExecutor({
  jobName: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  claimOccurrence: claimServiceCrewCctvOccurrence,
  runServiceCrewCctvJob: runServiceCrewCctvCron,
  markSuccess: markServiceCrewCctvOccurrenceSuccess,
  markSkipped: markServiceCrewCctvOccurrenceSkipped,
  markFailure: markServiceCrewCctvOccurrenceFailure,
  notifyResult: async (result) => {
    await notifyCronJobRun({
      jobName: SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
      jobFamily: 'service_crew_cctv',
      schedule: 'hourly@deterministic-minute',
      source: result.source,
      scheduledForKey: result.scheduledForKey,
      scheduledForManila: result.scheduledForManila,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      attempt: null,
      status: result.status,
      message: result.message,
      errorMessage: result.errorMessage ?? null,
      stats: result.stats ?? null,
    });
  },
  logger,
  formatScheduledForKey,
  formatScheduledForManila: formatManilaDateTime,
});

async function scheduleNextServiceCrewCctvOccurrence(now: Date = new Date()): Promise<void> {
  if (!initialized) return;

  const decision = getServiceCrewCctvSchedulingDecision(now, SERVICE_CREW_CCTV_HOURLY_JOB_NAME);

  if (decision.skipCurrentHour) {
    await ensureMissedOccurrenceSkipped(
      decision.currentOccurrence.scheduledFor,
      'Service crew cctv cron missed its selected minute while the scheduler was offline',
    );
  }

  const nextOccurrence = decision.nextOccurrenceToSchedule;
  scheduleTimeoutUntil(nextOccurrence.scheduledFor, () => {
    void executeServiceCrewCctvOccurrence({
      scheduledFor: nextOccurrence.scheduledFor,
      source: 'scheduled',
    }).finally(() => {
      if (initialized) {
        void scheduleNextServiceCrewCctvOccurrence();
      }
    });
  });

  logger.info(
    {
      hourKey: nextOccurrence.hourKey,
      scheduledMinute: nextOccurrence.scheduledMinute,
      nextRunManila: formatManilaDateTime(nextOccurrence.scheduledFor),
    },
    'Scheduled service crew cctv cron occurrence',
  );
}

export async function initServiceCrewCctvCron(): Promise<void> {
  if (!env.SERVICE_CREW_CCTV_CRON_ENABLED) {
    initialized = false;
    clearScheduledHandle();
    logger.info('Service crew cctv cron disabled by SERVICE_CREW_CCTV_CRON_ENABLED=false');
    return;
  }

  if (initialized) return;
  initialized = true;

  try {
    await scheduleNextServiceCrewCctvOccurrence();
  } catch (error) {
    initialized = false;
    clearScheduledHandle();
    throw error;
  }
}

export async function stopServiceCrewCctvCron(): Promise<void> {
  initialized = false;
  clearScheduledHandle();
}
