import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { calculateKpiScores, type KpiBreakdown, type UserKpiData } from './epiCalculation.service.js';
import { getOdooEmployeeIdsByWebsiteKey } from './odooQuery.service.js';

const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 30;
const SNAPSHOT_CALCULATION_VERSION = 'rolling-v1';

interface ManilaDateParts {
  year: number;
  month: number;
  day: number;
}

interface ActiveServiceCrewRow {
  id: string;
  user_key: string | null;
  epi_score: number | string | null;
}

interface SnapshotUserRow {
  id: string;
  user_key: string;
  epi_score: number;
}

export interface RollingMetricSnapshotValues {
  customerServiceScore: number | null;
  workplaceRelationsScore: number | null;
  attendanceRate: number | null;
  punctualityRate: number | null;
  productivityRate: number | null;
  averageOrderValue: number | null;
  branchAov: number | null;
  uniformComplianceRate: number | null;
  hygieneComplianceRate: number | null;
  sopComplianceRate: number | null;
}

export interface RollingMetricWindow {
  windowStartDate: string;
  windowEndDate: string;
}

export interface NonRollingSnapshotValues {
  epiScore: number | null;
  awardsCount: number;
  violationsCount: number;
}

export interface EmployeeMetricDailySnapshotRow extends RollingMetricSnapshotValues, NonRollingSnapshotValues {
  userId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
  snapshotDate: string;
  windowStartDate: string;
  windowEndDate: string;
  generatedAt: string;
  calculationVersion: string;
}

function getManilaDateParts(date: Date = new Date()): ManilaDateParts {
  const shifted = new Date(date.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

function formatYmd(parts: ManilaDateParts): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Invalid YMD format: ${ymd}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function addDaysToYmd(ymd: string, deltaDays: number): string {
  const { year, month, day } = parseYmd(ymd);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return formatYmd({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

function toUtcBoundaryFromManilaYmd(ymd: string, isEnd: boolean): Date {
  const { year, month, day } = parseYmd(ymd);
  return isEnd
    ? new Date(Date.UTC(year, month - 1, day, 15, 59, 59, 999))
    : new Date(Date.UTC(year, month - 1, day, -8, 0, 0, 0));
}

function normalizeRangeYmd(startYmd: string, endYmd: string): { startYmd: string; endYmd: string } {
  if (startYmd <= endYmd) {
    return { startYmd, endYmd };
  }
  return { startYmd: endYmd, endYmd: startYmd };
}

function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

function countDailyViolations(
  violationNotices: Array<{ completed_at?: string | null }> | null,
  fromInclusive: Date,
  toInclusive: Date,
): number {
  if (!Array.isArray(violationNotices) || violationNotices.length === 0) {
    return 0;
  }

  return violationNotices.filter((notice) => {
    if (!notice.completed_at) return false;
    const completedAt = new Date(notice.completed_at);
    if (Number.isNaN(completedAt.getTime())) return false;
    return completedAt >= fromInclusive && completedAt <= toInclusive;
  }).length;
}

export function getSnapshotDateForScheduledRun(scheduledFor: Date = new Date()): string {
  const shifted = new Date(scheduledFor.getTime() + MANILA_OFFSET_MS);
  shifted.setUTCDate(shifted.getUTCDate() - 1);
  return formatYmd({
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  });
}

export function getRollingWindowForSnapshotDate(snapshotDateYmd: string): RollingMetricWindow {
  const windowEndDate = snapshotDateYmd;
  const windowStartDate = addDaysToYmd(windowEndDate, -(ROLLING_WINDOW_DAYS - 1));
  return { windowStartDate, windowEndDate };
}

export function mapBreakdownToRollingMetricSnapshot(breakdown: KpiBreakdown): RollingMetricSnapshotValues {
  return {
    customerServiceScore: breakdown.css.score,
    workplaceRelationsScore: breakdown.wrs.score,
    attendanceRate: breakdown.attendance.rate,
    punctualityRate: breakdown.punctuality.rate,
    productivityRate: breakdown.productivity.rate,
    averageOrderValue: breakdown.aov.value,
    branchAov: breakdown.aov.branch_avg,
    uniformComplianceRate: breakdown.uniform.rate,
    hygieneComplianceRate: breakdown.hygiene.rate,
    sopComplianceRate: breakdown.sop.rate,
  };
}

async function fetchSnapshotUsers(): Promise<SnapshotUserRow[]> {
  const rows = await db.getDb()('users as u')
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .where('r.name', 'Service Crew')
    .select('u.id', 'u.user_key', 'u.epi_score')
    .distinct('u.id')
    .orderBy('u.id') as ActiveServiceCrewRow[];

  return rows
    .filter((row): row is SnapshotUserRow => typeof row.user_key === 'string' && row.user_key.trim().length > 0)
    .map((row) => ({
      id: row.id,
      user_key: row.user_key.trim(),
      epi_score: toNumber(row.epi_score, 100),
    }));
}

async function fetchUserKpiData(userId: string, userKey: string): Promise<UserKpiData> {
  const dbConn = db.getDb();
  const odooEmployeeIds = await getOdooEmployeeIdsByWebsiteKey(userKey);
  const [cssAudits, peerEvaluations, complianceAuditRows, violationNotices] = await Promise.all([
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
      .select(dbConn.raw('css_star_rating as star_rating'), dbConn.raw('completed_at::text as audited_at')),
    dbConn('peer_evaluations')
      .where({ evaluated_user_id: userId })
      .whereNotNull('submitted_at')
      .select(
        dbConn.raw('(q1_score + q2_score + q3_score) / 3.0 as average_score'),
        dbConn.raw('submitted_at::text'),
        dbConn.raw('wrs_effective_at::text'),
      ),
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
        dbConn.raw('completed_at::text as audited_at'),
      ),
    dbConn('violation_notices')
      .whereExists(
        dbConn('violation_notice_targets').whereRaw('violation_notice_id = violation_notices.id').where({ user_id: userId }),
      )
      .where({ status: 'completed' })
      .select('epi_decrease', dbConn.raw('updated_at::text as completed_at')),
  ]);

  const complianceAudit = complianceAuditRows.length
    ? complianceAuditRows.map((row: any) => ({
        answers: {
          productivity_rate: row.scc_productivity_rate ?? false,
          uniform: row.scc_uniform_compliance ?? false,
          hygiene: row.scc_hygiene_compliance ?? false,
          sop: row.scc_sop_compliance ?? false,
        },
        audited_at: row.audited_at,
      }))
    : null;

  return {
    userId,
    userKey,
    cssAudits: cssAudits.length ? cssAudits : null,
    peerEvaluations: peerEvaluations.length ? peerEvaluations : null,
    complianceAudit,
    violationNotices: violationNotices.length ? violationNotices : null,
  };
}

export async function runDailyEmployeeRollingMetricSnapshot(input?: { scheduledFor?: Date }): Promise<void> {
  const scheduledFor = input?.scheduledFor ?? new Date();
  const snapshotDate = getSnapshotDateForScheduledRun(scheduledFor);
  const { windowStartDate, windowEndDate } = getRollingWindowForSnapshotDate(snapshotDate);
  const from = toUtcBoundaryFromManilaYmd(windowStartDate, false);
  const to = toUtcBoundaryFromManilaYmd(windowEndDate, true);
  const dailyFrom = toUtcBoundaryFromManilaYmd(snapshotDate, false);
  const dailyTo = toUtcBoundaryFromManilaYmd(snapshotDate, true);
  const generatedAt = new Date();

  logger.info(
    {
      snapshotDate,
      windowStartDate,
      windowEndDate,
      scheduledFor: scheduledFor.toISOString(),
    },
    'Employee analytics rolling snapshot started',
  );

  const users = await fetchSnapshotUsers();
  for (const user of users) {
    try {
      const kpiData = await fetchUserKpiData(user.id, user.user_key);
      const { breakdown } = await calculateKpiScores(kpiData, { from, to });
      const values = mapBreakdownToRollingMetricSnapshot(breakdown);
      const nonRolling: NonRollingSnapshotValues = {
        epiScore: user.epi_score,
        awardsCount: 0,
        violationsCount: countDailyViolations(kpiData.violationNotices, dailyFrom, dailyTo),
      };

      await db.getDb()('employee_metric_daily_snapshots')
        .insert({
          user_id: user.id,
          snapshot_date: snapshotDate,
          window_start_date: windowStartDate,
          window_end_date: windowEndDate,
          customer_service_score: values.customerServiceScore,
          workplace_relations_score: values.workplaceRelationsScore,
          attendance_rate: values.attendanceRate,
          punctuality_rate: values.punctualityRate,
          productivity_rate: values.productivityRate,
          average_order_value: values.averageOrderValue,
          branch_aov: values.branchAov,
          uniform_compliance_rate: values.uniformComplianceRate,
          hygiene_compliance_rate: values.hygieneComplianceRate,
          sop_compliance_rate: values.sopComplianceRate,
          epi_score: nonRolling.epiScore,
          awards_count: nonRolling.awardsCount,
          violations_count: nonRolling.violationsCount,
          generated_at: generatedAt,
          calculation_version: SNAPSHOT_CALCULATION_VERSION,
          created_at: generatedAt,
          updated_at: generatedAt,
        })
        .onConflict(['user_id', 'snapshot_date'])
        .merge({
          window_start_date: windowStartDate,
          window_end_date: windowEndDate,
          customer_service_score: values.customerServiceScore,
          workplace_relations_score: values.workplaceRelationsScore,
          attendance_rate: values.attendanceRate,
          punctuality_rate: values.punctualityRate,
          productivity_rate: values.productivityRate,
          average_order_value: values.averageOrderValue,
          branch_aov: values.branchAov,
          uniform_compliance_rate: values.uniformComplianceRate,
          hygiene_compliance_rate: values.hygieneComplianceRate,
          sop_compliance_rate: values.sopComplianceRate,
          epi_score: nonRolling.epiScore,
          awards_count: nonRolling.awardsCount,
          violations_count: nonRolling.violationsCount,
          generated_at: generatedAt,
          calculation_version: SNAPSHOT_CALCULATION_VERSION,
          updated_at: generatedAt,
        });
    } catch (error) {
      logger.error({ err: error, userId: user.id, snapshotDate }, 'Failed to persist employee analytics metric snapshot');
    }
  }

  logger.info({ snapshotDate, processedUsers: users.length }, 'Employee analytics rolling snapshot completed');
}

export async function getEmployeeMetricDailySnapshots(input: {
  rangeStartYmd: string;
  rangeEndYmd: string;
  userId?: string | null;
}): Promise<EmployeeMetricDailySnapshotRow[]> {
  const { startYmd, endYmd } = normalizeRangeYmd(input.rangeStartYmd, input.rangeEndYmd);
  const query = db.getDb()('employee_metric_daily_snapshots as s')
    .join('users as u', 'u.id', 's.user_id')
    .select(
      's.user_id as userId',
      db.getDb().raw(`CONCAT_WS(' ', u.first_name, u.last_name) as "fullName"`),
      db.getDb().raw(`COALESCE(u.first_name, '') as "firstName"`),
      db.getDb().raw(`COALESCE(u.last_name, '') as "lastName"`),
      'u.avatar_url as avatarUrl',
      db.getDb().raw(`'Service Crew'::text as "roleName"`),
      's.snapshot_date as snapshotDate',
      's.window_start_date as windowStartDate',
      's.window_end_date as windowEndDate',
      's.customer_service_score as customerServiceScore',
      's.workplace_relations_score as workplaceRelationsScore',
      's.attendance_rate as attendanceRate',
      's.punctuality_rate as punctualityRate',
      's.productivity_rate as productivityRate',
      's.average_order_value as averageOrderValue',
      's.branch_aov as branchAov',
      's.uniform_compliance_rate as uniformComplianceRate',
      's.hygiene_compliance_rate as hygieneComplianceRate',
      's.sop_compliance_rate as sopComplianceRate',
      's.epi_score as epiScore',
      's.awards_count as awardsCount',
      's.violations_count as violationsCount',
      's.generated_at as generatedAt',
      's.calculation_version as calculationVersion',
    )
    .whereBetween('s.snapshot_date', [startYmd, endYmd])
    .orderBy('s.snapshot_date', 'asc')
    .orderBy('s.user_id', 'asc');

  if (input.userId) {
    query.andWhere('s.user_id', input.userId);
  }

  return query as Promise<EmployeeMetricDailySnapshotRow[]>;
}
