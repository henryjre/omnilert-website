import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  applyGlobalAverageEpiBand,
  calculateKpiScores,
  type KpiBreakdown,
  type UserKpiData,
} from './epiCalculation.service.js';
import { generateEpiReportPdf, generateManagerSummaryPdf, type EpiReportData } from './epiReport.service.js';
import { sendWeeklyEpiEmail, sendManagerEpiSummaryEmail } from './mail.service.js';
import { runDailyEmployeeRollingMetricSnapshot } from './employeeAnalyticsSnapshot.service.js';
import { getOdooEmployeeIdsByWebsiteKey } from './odooQuery.service.js';
import { buildCronFailureErrorMessage, notifyCronJobRun } from './cronNotification.service.js';
import type { CronJobNotificationStats } from '@omnilert/shared';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const THIRTY_DAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const STALE_RUN_THRESHOLD_MS = 6 * 60 * 60 * 1000;

const WEEKLY_EPI_JOB_NAME = 'epi-weekly-snapshot';
const EMPLOYEE_METRIC_DAILY_JOB_NAME = 'employee-metric-daily-snapshot';
const WEEKLY_EPI_CRON = '0 5 * * 0';
const EMPLOYEE_METRIC_DAILY_CRON = '30 3 * * *';

interface EpiHistoryEntry {
  type: 'weekly' | 'monthly';
  date: string;
  epi_before: number;
  epi_after: number;
  delta: number;
  kpi_breakdown: KpiBreakdown;
  capped: boolean;
  raw_delta: number;
}

interface MasterUserRow {
  id: string;
  user_key: string;
  epi_score: number | string | null;
}

function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calculateWeeklyEligibleGlobalAverageEpi(users: Array<Pick<MasterUserRow, 'epi_score'>>): number {
  if (users.length === 0) return 100;
  const total = users.reduce((sum, user) => sum + toNumber(user.epi_score, 100), 0);
  return roundToTwo(total / users.length);
}

function getWeeklyEligibilityCutoffDate(referenceDate: Date = new Date()): Date {
  return new Date(referenceDate.getTime() - THIRTY_DAY_WINDOW_MS);
}

function isEligibleForWeeklyEpiByAccountAge(createdAt: Date, referenceDate: Date = new Date()): boolean {
  return createdAt.getTime() <= getWeeklyEligibilityCutoffDate(referenceDate).getTime();
}

async function fetchUserKpiData(userId: string, userKey: string): Promise<UserKpiData> {
  const dbConn = db.getDb();
  const odooEmployeeIds = await getOdooEmployeeIdsByWebsiteKey(userKey);
  const [cssAudits, peerEvaluations, complianceAuditRows, violationNotices, rewardRequests] = await Promise.all([
    // CSS audits: the user was the cashier being audited (identified by user_key UUID)
    dbConn('store_audits')
      .where({ type: 'customer_service', status: 'completed' })
      .andWhere((ownedQuery) => {
        ownedQuery.where('audited_user_id', userId)
          .orWhere((canonicalKeyQuery) => {
            canonicalKeyQuery
              .whereNull('audited_user_id')
              .where('audited_user_key', userKey);
          })
          .orWhere((legacyQuery) => {
            legacyQuery
              .whereNull('audited_user_id')
              .whereNull('audited_user_key')
              .where('css_cashier_user_key', userKey);
          });
      })
      .select(dbConn.raw(`css_star_rating as star_rating`), dbConn.raw(`completed_at::text as audited_at`)),
    dbConn('peer_evaluations')
      .where({ evaluated_user_id: userId })
      .andWhere((peerEvalQuery) => {
        peerEvalQuery.whereNotNull('submitted_at').orWhere('status', 'expired');
      })
      .select(
        dbConn.raw(`(q1_score + q2_score + q3_score) / 3.0 as average_score`),
        dbConn.raw(`submitted_at::text`),
        dbConn.raw(`wrs_effective_at::text`),
        'status',
        dbConn.raw(`expires_at::text`),
      ),
    // Compliance audits: the user was the auditor
    dbConn('store_audits')
      .where({ type: 'service_crew_cctv', status: 'completed' })
      .andWhere((ownedQuery) => {
        ownedQuery.where('audited_user_id', userId)
          .orWhere((canonicalKeyQuery) => {
            canonicalKeyQuery
              .whereNull('audited_user_id')
              .where('audited_user_key', userKey);
          });

        if (odooEmployeeIds.length > 0) {
          ownedQuery.orWhere((legacyQuery) => {
            legacyQuery
              .whereNull('audited_user_id')
              .whereNull('audited_user_key')
              .whereIn('scc_odoo_employee_id', odooEmployeeIds);
          });
        }
      })
      .select(
        'scc_productivity_rate',
        'scc_uniform_compliance',
        'scc_hygiene_compliance',
        'scc_sop_compliance',
        'scc_customer_interaction',
        'scc_cashiering',
        'scc_suggestive_selling_and_upselling',
        'scc_service_efficiency',
        dbConn.raw(`completed_at::text as audited_at`),
      ),
    dbConn('violation_notices')
      .whereExists(
        dbConn('violation_notice_targets').whereRaw('violation_notice_id = violation_notices.id').where({ user_id: userId }),
      )
      .where({ status: 'completed' })
      .select('epi_decrease', dbConn.raw(`updated_at::text as completed_at`)),
    dbConn('reward_request_targets as rrt')
      .join('reward_requests as rr', 'rr.id', 'rrt.reward_request_id')
      .where({ 'rr.status': 'approved', 'rrt.user_id': userId })
      .select(
        dbConn.raw('COALESCE(rrt.epi_delta, rr.epi_delta) as epi_delta'),
        'rr.source_violation_notice_id',
        dbConn.raw(`COALESCE(rrt.applied_at, rr.reviewed_at, rr.updated_at)::text as applied_at`),
      ),
  ]);

  const complianceAudit = complianceAuditRows.length
    ? complianceAuditRows.map((r: any) => ({
        answers: {
          scc_productivity_rate: r.scc_productivity_rate ?? false,
          scc_uniform_compliance: r.scc_uniform_compliance ?? false,
          scc_hygiene_compliance: r.scc_hygiene_compliance ?? false,
          scc_sop_compliance: r.scc_sop_compliance ?? false,
          scc_customer_interaction: r.scc_customer_interaction,
          scc_cashiering: r.scc_cashiering,
          scc_suggestive_selling_and_upselling: r.scc_suggestive_selling_and_upselling,
          scc_service_efficiency: r.scc_service_efficiency,
        },
        audited_at: r.audited_at,
      }))
    : null;

  return {
    userId,
    userKey,
    cssAudits: cssAudits.length ? cssAudits : null,
    peerEvaluations: peerEvaluations.length ? peerEvaluations : null,
    complianceAudit,
    rewardRequests: rewardRequests.length ? rewardRequests : null,
    violationNotices: violationNotices.length ? violationNotices : null,
  };
}

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
  dayOfWeek: number;
}

interface ParsedCronExpression {
  expression: string;
  minute: number | null;
  hour: number | null;
  dayOfMonth: number | null;
  month: number | null;
  dayOfWeek: number | null;
}

interface ScheduledSnapshotJob {
  name: string;
  expression: string;
  schedule: ParsedCronExpression;
  handle: NodeJS.Timeout | null;
  runner: (input: { scheduledFor: Date }) => Promise<Partial<CronJobNotificationStats> | null>;
}

const scheduledJobs: ScheduledSnapshotJob[] = [
  {
    name: WEEKLY_EPI_JOB_NAME,
    expression: WEEKLY_EPI_CRON,
    schedule: parseCronExpression(WEEKLY_EPI_CRON),
    handle: null,
    runner: ({ scheduledFor }) => runWeeklyEpiSnapshot({ scheduledFor }),
  },
  {
    name: EMPLOYEE_METRIC_DAILY_JOB_NAME,
    expression: EMPLOYEE_METRIC_DAILY_CRON,
    schedule: parseCronExpression(EMPLOYEE_METRIC_DAILY_CRON),
    handle: null,
    runner: ({ scheduledFor }) => runDailyEmployeeRollingMetricSnapshot({ scheduledFor }),
  },
];

let initialized = false;

function getManilaDateParts(date: Date = new Date()): ManilaDateParts {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    dayOfWeek: shifted.getUTCDay(),
  };
}

function formatManilaDate(date: Date): string {
  const parts = getManilaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function formatManilaDateTime(date: Date): string {
  const parts = getManilaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}:${String(parts.second).padStart(2, '0')}`;
}

function formatScheduledForKey(date: Date): string {
  const parts = getManilaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
}

function getPreviousMonthDateString(date: Date): string {
  const parts = getManilaDateParts(date);
  const previousMonth = parts.month === 1 ? 12 : parts.month - 1;
  const previousYear = parts.month === 1 ? parts.year - 1 : parts.year;
  const previousMonthLastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  return `${previousYear}-${String(previousMonth).padStart(2, '0')}-${String(previousMonthLastDay).padStart(2, '0')}`;
}

function getPreviousManilaDateString(date: Date): string {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  shifted.setUTCDate(shifted.getUTCDate() - 1);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`;
}

function parseCronField(field: string, label: string, min: number, max: number): number | null {
  if (field === '*') return null;
  const parsed = Number(field);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Unsupported cron ${label} field: ${field}`);
  }
  return parsed;
}

function parseCronExpression(expression: string): ParsedCronExpression {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Unsupported cron expression: ${expression}`);
  }

  return {
    expression,
    minute: parseCronField(parts[0], 'minute', 0, 59),
    hour: parseCronField(parts[1], 'hour', 0, 23),
    dayOfMonth: parseCronField(parts[2], 'dayOfMonth', 1, 31),
    month: parseCronField(parts[3], 'month', 1, 12),
    dayOfWeek: parseCronField(parts[4], 'dayOfWeek', 0, 6),
  };
}

function matchesCronField(value: number, field: number | null): boolean {
  return field === null || field === value;
}

function matchesCronExpression(date: Date, schedule: ParsedCronExpression): boolean {
  const parts = getManilaDateParts(date);
  return (
    matchesCronField(parts.minute, schedule.minute) &&
    matchesCronField(parts.hour, schedule.hour) &&
    matchesCronField(parts.day, schedule.dayOfMonth) &&
    matchesCronField(parts.month, schedule.month) &&
    matchesCronField(parts.dayOfWeek, schedule.dayOfWeek)
  );
}

function ceilToNextMinute(date: Date): Date {
  const next = new Date(date.getTime());
  next.setUTCSeconds(0, 0);
  next.setTime(next.getTime() + 60 * 1000);
  return next;
}

function floorToMinute(date: Date): Date {
  const floored = new Date(date.getTime());
  floored.setUTCSeconds(0, 0);
  return floored;
}

function findNextOccurrence(schedule: ParsedCronExpression, after: Date): Date {
  const candidate = ceilToNextMinute(after);

  for (let offset = 0; offset <= 366 * 24 * 60; offset += 1) {
    const current = new Date(candidate.getTime() + offset * 60 * 1000);
    if (matchesCronExpression(current, schedule)) return current;
  }

  throw new Error(`Could not find next occurrence for cron ${schedule.expression}`);
}

function findLatestOccurrence(schedule: ParsedCronExpression, at: Date): Date {
  const candidate = floorToMinute(at);

  for (let offset = 0; offset <= 366 * 24 * 60; offset += 1) {
    const current = new Date(candidate.getTime() - offset * 60 * 1000);
    if (matchesCronExpression(current, schedule)) return current;
  }

  throw new Error(`Could not find latest occurrence for cron ${schedule.expression}`);
}

function clearScheduledHandle(job: ScheduledSnapshotJob): void {
  if (!job.handle) return;
  clearTimeout(job.handle);
  job.handle = null;
}

function scheduleTimeoutUntil(job: ScheduledSnapshotJob, target: Date, callback: () => void): void {
  clearScheduledHandle(job);

  const remainingMs = target.getTime() - Date.now();
  const delayMs = Math.min(Math.max(remainingMs, 0), MAX_TIMEOUT_MS);

  job.handle = setTimeout(() => {
    if (!initialized) return;

    if (Date.now() < target.getTime()) {
      scheduleTimeoutUntil(job, target, callback);
      return;
    }

    callback();
  }, delayMs);
}

async function claimScheduledJobRun(jobName: string, scheduledFor: Date): Promise<boolean> {
  const masterDb = db.getDb();
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const scheduledForManila = formatManilaDateTime(scheduledFor);
  const now = new Date();

  return masterDb.transaction(async (trx) => {
    let existing = await trx('scheduled_job_runs')
      .where({ job_name: jobName, scheduled_for_key: scheduledForKey })
      .forUpdate()
      .first() as ScheduledJobRunRow | undefined;

    if (!existing) {
      const inserted = await trx('scheduled_job_runs')
        .insert({
          job_name: jobName,
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
        .where({ job_name: jobName, scheduled_for_key: scheduledForKey })
        .forUpdate()
        .first() as ScheduledJobRunRow | undefined;
    }

    if (!existing) return false;

    const startedAt = existing.started_at ? new Date(existing.started_at) : null;
    const isStaleRunning =
      existing.status === 'running' &&
      (!startedAt || now.getTime() - startedAt.getTime() > STALE_RUN_THRESHOLD_MS);

    if (existing.status !== 'failed' && !isStaleRunning) {
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

function getExpectedSnapshotDate(job: ScheduledSnapshotJob, scheduledFor: Date): string {
  if (job.name === WEEKLY_EPI_JOB_NAME) {
    return formatManilaDate(scheduledFor);
  }
  return getPreviousManilaDateString(scheduledFor);
}

async function hasExistingSnapshotHistory(job: ScheduledSnapshotJob, scheduledFor: Date): Promise<boolean> {
  const masterDb = db.getDb();
  const scheduledForKey = formatScheduledForKey(scheduledFor);

  const row = await masterDb('scheduled_job_runs')
    .where({
      job_name: job.name,
      scheduled_for_key: scheduledForKey,
      status: 'success'
    })
    .first('id');

  return Boolean(row);
}

async function recordSuccessfulScheduledJobRun(jobName: string, scheduledFor: Date): Promise<void> {
  const masterDb = db.getDb();
  const now = new Date();

  await masterDb('scheduled_job_runs')
    .insert({
      job_name: jobName,
      scheduled_for_key: formatScheduledForKey(scheduledFor),
      scheduled_for_manila: formatManilaDateTime(scheduledFor),
      status: 'success',
      attempt_count: 1,
      started_at: now,
      finished_at: now,
      error_message: null,
      created_at: now,
      updated_at: now,
    })
    .onConflict(['job_name', 'scheduled_for_key'])
    .merge({
      scheduled_for_manila: formatManilaDateTime(scheduledFor),
      status: 'success',
      finished_at: now,
      error_message: null,
      updated_at: now,
    });
}

async function markScheduledJobRunSuccess(jobName: string, scheduledFor: Date): Promise<void> {
  const masterDb = db.getDb();
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const now = new Date();

  await masterDb('scheduled_job_runs')
    .where({ job_name: jobName, scheduled_for_key: scheduledForKey })
    .update({
      status: 'success',
      finished_at: now,
      updated_at: now,
    });
}

async function markScheduledJobRunFailure(jobName: string, scheduledFor: Date, error: unknown): Promise<void> {
  const masterDb = db.getDb();
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const now = new Date();
  const errorMessage = error instanceof Error ? error.message : String(error);

  await masterDb('scheduled_job_runs')
    .where({ job_name: jobName, scheduled_for_key: scheduledForKey })
    .update({
      status: 'failed',
      finished_at: now,
      error_message: errorMessage.slice(0, 4000),
      updated_at: now,
    });
}

async function runScheduledJob(job: ScheduledSnapshotJob, scheduledFor: Date, source: 'scheduled' | 'startup'): Promise<void> {
  const scheduledForKey = formatScheduledForKey(scheduledFor);
  const claimed = await claimScheduledJobRun(job.name, scheduledFor);

  if (!claimed) {
    logger.info({ jobName: job.name, scheduledForKey, source }, 'Skipping EPI snapshot job; occurrence already claimed');
    return;
  }

  logger.info(
    {
      jobName: job.name,
      scheduledForKey,
      scheduledForManila: formatManilaDateTime(scheduledFor),
      source,
    },
    'Starting EPI snapshot job',
  );

  const startedAt = new Date();
  try {
    const stats = await job.runner({ scheduledFor });
    const finishedAt = new Date();
    await markScheduledJobRunSuccess(job.name, scheduledFor);
    logger.info({ jobName: job.name, scheduledForKey }, 'Completed EPI snapshot job');
    await notifyCronJobRun({
      jobName: job.name,
      jobFamily: 'epi_snapshot',
      schedule: job.expression,
      source,
      scheduledForKey,
      scheduledForManila: formatManilaDateTime(scheduledFor),
      startedAt,
      finishedAt,
      attempt: null,
      status: 'success',
      message: 'Completed EPI snapshot job',
      errorMessage: null,
      stats,
    });
  } catch (error) {
    const finishedAt = new Date();
    await markScheduledJobRunFailure(job.name, scheduledFor, error);
    logger.error({ err: error, jobName: job.name, scheduledForKey }, 'EPI snapshot job failed');
    await notifyCronJobRun({
      jobName: job.name,
      jobFamily: 'epi_snapshot',
      schedule: job.expression,
      source,
      scheduledForKey,
      scheduledForManila: formatManilaDateTime(scheduledFor),
      startedAt,
      finishedAt,
      attempt: null,
      status: 'failed',
      message: 'EPI snapshot job failed',
      errorMessage: buildCronFailureErrorMessage({
        failed: 1,
        failures: [
          {
            entityType: 'scheduled_job',
            entityId: job.name,
            error,
          },
        ],
      }),
      stats: null,
    });
  }
}

function scheduleJob(job: ScheduledSnapshotJob): void {
  if (!initialized) return;

  const nextOccurrence = findNextOccurrence(job.schedule, new Date());
  scheduleTimeoutUntil(job, nextOccurrence, () => {
    void runScheduledJob(job, nextOccurrence, 'scheduled').finally(() => {
      if (initialized) {
        scheduleJob(job);
      }
    });
  });

  logger.info(
    {
      jobName: job.name,
      expression: job.expression,
      nextRunManila: formatManilaDateTime(nextOccurrence),
    },
    'Scheduled EPI snapshot job',
  );
}

async function reconcileLatestOccurrence(job: ScheduledSnapshotJob): Promise<void> {
  const latestOccurrence = findLatestOccurrence(job.schedule, new Date());
  const ageMs = Date.now() - latestOccurrence.getTime();

  if (ageMs < 0) return;
  if (ageMs > 45 * 24 * 60 * 60 * 1000) return;

  if (await hasExistingSnapshotHistory(job, latestOccurrence)) {
    await recordSuccessfulScheduledJobRun(job.name, latestOccurrence);
    logger.info(
      {
        jobName: job.name,
        scheduledForKey: formatScheduledForKey(latestOccurrence),
      },
      'Recorded pre-existing EPI snapshot occurrence from history',
    );
    return;
  }

  await runScheduledJob(job, latestOccurrence, 'startup');
}

export async function reconcileJobsSequentially<T>(
  jobs: T[],
  reconcileJob: (job: T) => Promise<void>,
): Promise<void> {
  for (const job of jobs) {
    await reconcileJob(job);
  }
}

async function getActiveServiceCrewUsers(): Promise<MasterUserRow[]> {
  const masterDb = db.getDb();

  return masterDb('users as u')
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .where('r.name', 'Service Crew')
    .select('u.id', 'u.user_key', 'u.epi_score')
    .distinct('u.id')
    .orderBy('u.id') as Promise<MasterUserRow[]>;
}

async function getWeeklyEligibleServiceCrewUsers(referenceDate: Date = new Date()): Promise<MasterUserRow[]> {
  const masterDb = db.getDb();
  const cutoffDate = getWeeklyEligibilityCutoffDate(referenceDate);

  return masterDb('users as u')
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .where('r.name', 'Service Crew')
    .where('u.created_at', '<=', cutoffDate)
    .select('u.id', 'u.user_key', 'u.epi_score')
    .distinct('u.id')
    .orderBy('u.id') as Promise<MasterUserRow[]>;
}

export async function runWeeklyEpiSnapshot(input?: { scheduledFor?: Date }): Promise<Partial<CronJobNotificationStats>> {
  const scheduledFor = input?.scheduledFor ?? new Date();
  const snapshotDate = formatManilaDate(scheduledFor);

  logger.info({ snapshotDate }, 'EPI weekly snapshot started');

  const masterDb = db.getDb();
  const users = await getWeeklyEligibleServiceCrewUsers(scheduledFor);
  const globalAverageEpi = calculateWeeklyEligibleGlobalAverageEpi(users);
  const reportDataList: EpiReportData[] = [];
  let succeeded = 0;
  let failed = 0;

  logger.info({ snapshotDate, count: users.length }, 'EPI weekly snapshot: processing users');

  const userIds = users.map((user) => user.id);
  const userDetails = userIds.length > 0
    ? await masterDb('users')
      .whereIn('id', userIds)
      .select('id', 'first_name', 'last_name', 'email', 'employee_number')
    : [];
  const userDetailMap = new Map(userDetails.map((user) => [user.id as string, user]));

  for (const user of users) {
    try {
      const kpiData = await fetchUserKpiData(user.id, user.user_key);
      const { breakdown, raw_delta } = await calculateKpiScores(kpiData);

      const epiBefore = toNumber(user.epi_score, 100);
      const appliedEpi = applyGlobalAverageEpiBand({
        epiBefore,
        rawDelta: raw_delta,
        globalAverageEpi,
      });
      const { delta, capped, epiAfter } = appliedEpi;

      const entry: EpiHistoryEntry = {
        type: 'weekly',
        date: snapshotDate,
        epi_before: epiBefore,
        epi_after: epiAfter,
        delta,
        kpi_breakdown: breakdown,
        capped,
        raw_delta: appliedEpi.raw_delta,
      };

      await masterDb('users')
        .where({ id: user.id })
        .update({
          epi_score: epiAfter,
          updated_at: new Date(),
        });

      const detail = userDetailMap.get(user.id);
      if (detail) {
        reportDataList.push({
          userId: user.id,
          fullName: `${detail.first_name} ${detail.last_name}`.trim(),
          employeeNumber: detail.employee_number ?? null,
          email: detail.email as string,
          epiBefore,
          epiAfter,
          delta,
          rawDelta: appliedEpi.raw_delta,
          capped,
          kpiBreakdown: breakdown,
          reportDate: snapshotDate,
        });
      }
      succeeded += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error, userId: user.id, snapshotDate }, 'EPI weekly snapshot failed for user');
    }
  }

  for (const reportData of reportDataList) {
    try {
      const pdfBuffer = await generateEpiReportPdf(reportData);
      await sendWeeklyEpiEmail(
        reportData.email,
        reportData.fullName,
        reportData.epiBefore,
        reportData.epiAfter,
        reportData.delta,
        reportData.reportDate,
        pdfBuffer,
      );
    } catch (error) {
      logger.error({ err: error, userId: reportData.userId, snapshotDate }, 'Failed to send EPI email to employee');
    }
  }

  // ── Global Manager Summary Dispatch
  if (reportDataList.length > 0) {
    try {
      const globalAvgDelta = reportDataList.reduce((sum, report) => sum + report.delta, 0) / reportDataList.length;
      const globalSummaryPdf = await generateManagerSummaryPdf(reportDataList, 'Omnilert Global', snapshotDate);

      const managers = await masterDb('users as u')
        .join('user_roles as ur', 'u.id', 'ur.user_id')
        .join('roles as r', 'ur.role_id', 'r.id')
        .where('u.is_active', true)
        .whereIn('r.name', ['Administrator', 'Management'])
        .select('u.id', 'u.first_name', 'u.last_name', 'u.email')
        .distinct('u.id') as Array<{ id: string; first_name: string; last_name: string; email: string }>;

      for (const manager of managers) {
        try {
          await sendManagerEpiSummaryEmail(
            manager.email,
            `${manager.first_name} ${manager.last_name}`.trim(),
            'Omnilert Global',
            reportDataList.length,
            globalAvgDelta,
            snapshotDate,
            globalSummaryPdf,
          );
        } catch (error) {
          logger.error({ err: error, managerId: manager.id, snapshotDate }, 'Failed to send Global EPI summary email to manager');
        }
      }
    } catch (error) {
      logger.error({ err: error, snapshotDate }, 'Failed to generate/dispatch Global EPI summary');
    }
  }

  logger.info({ snapshotDate, processed: reportDataList.length }, 'EPI weekly snapshot completed');

  return {
    processed: users.length,
    succeeded,
    failed,
    skipped: 0,
  };
}



export async function initEpiSnapshotCrons(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    await reconcileJobsSequentially(scheduledJobs, reconcileLatestOccurrence);
  } catch (error) {
    logger.error({ err: error }, 'EPI snapshot startup reconciliation failed');
  }

  for (const job of scheduledJobs) {
    scheduleJob(job);
  }

  logger.info(
    {
      jobs: scheduledJobs.map((job) => ({ name: job.name, expression: job.expression })),
      windowDays: Math.round(THIRTY_DAY_WINDOW_MS / (24 * 60 * 60 * 1000)),
    },
    'EPI snapshot cron scheduler initialized',
  );
}

export function stopEpiSnapshotCrons(): void {
  initialized = false;

  for (const job of scheduledJobs) {
    clearScheduledHandle(job);
  }
}

export { getWeeklyEligibilityCutoffDate };
export { isEligibleForWeeklyEpiByAccountAge };
