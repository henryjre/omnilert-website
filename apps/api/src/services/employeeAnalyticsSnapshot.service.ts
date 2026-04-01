import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import type { CronJobNotificationStats } from '@omnilert/shared';
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
  customerInteractionScore: number | null;
  cashieringScore: number | null;
  suggestiveSellingAndUpsellingScore: number | null;
  serviceEfficiencyScore: number | null;
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
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.substring(0, 10));
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

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
    customerInteractionScore: breakdown.customer_interaction.score,
    cashieringScore: breakdown.cashiering.score,
    suggestiveSellingAndUpsellingScore: breakdown.suggestive_selling_and_upselling.score,
    serviceEfficiencyScore: breakdown.service_efficiency.score,
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
        'scc_customer_interaction',
        'scc_cashiering',
        'scc_suggestive_selling_and_upselling',
        'scc_service_efficiency',
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
          scc_productivity_rate: row.scc_productivity_rate ?? false,
          scc_uniform_compliance: row.scc_uniform_compliance ?? false,
          scc_hygiene_compliance: row.scc_hygiene_compliance ?? false,
          scc_sop_compliance: row.scc_sop_compliance ?? false,
          scc_customer_interaction: row.scc_customer_interaction,
          scc_cashiering: row.scc_cashiering,
          scc_suggestive_selling_and_upselling: row.scc_suggestive_selling_and_upselling,
          scc_service_efficiency: row.scc_service_efficiency,
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

export async function runDailyEmployeeRollingMetricSnapshot(input?: { scheduledFor?: Date }): Promise<Partial<CronJobNotificationStats>> {
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
  let succeeded = 0;
  let failed = 0;

  for (const user of users) {
    try {
      const kpiData = await fetchUserKpiData(user.id, user.user_key);
      const { breakdown } = await calculateKpiScores(kpiData, { window: { from, to }, minRecords: 1 });
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
          customer_interaction: values.customerInteractionScore,
          cashiering: values.cashieringScore,
          suggestive_selling_and_upselling: values.suggestiveSellingAndUpsellingScore,
          service_efficiency: values.serviceEfficiencyScore,
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
          customer_interaction: values.customerInteractionScore,
          cashiering: values.cashieringScore,
          suggestive_selling_and_upselling: values.suggestiveSellingAndUpsellingScore,
          service_efficiency: values.serviceEfficiencyScore,
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
      succeeded += 1;
    } catch (error) {
      failed += 1;
      logger.error({ err: error, userId: user.id, snapshotDate }, 'Failed to persist employee analytics metric snapshot');
    }
  }

  logger.info({ snapshotDate, processedUsers: users.length }, 'Employee analytics rolling snapshot completed');

  return {
    processed: users.length,
    succeeded,
    failed,
    skipped: 0,
  };
}

async function fetchLiveSnapshotRows(
  targetYmd: string,
  existingDateUserIds: Set<string>,
  filterUserId: string | null,
): Promise<EmployeeMetricDailySnapshotRow[]> {
  const dbConn = db.getDb();
  const todayStart = toUtcBoundaryFromManilaYmd(targetYmd, false);
  const todayEnd = toUtcBoundaryFromManilaYmd(targetYmd, true);
  const thirtyDaysAgoYmd = addDaysToYmd(targetYmd, -30);

  const windowStartDate = addDaysToYmd(targetYmd, -29);
  const rollingStart = toUtcBoundaryFromManilaYmd(windowStartDate, false);

  // Get user_key for identity resolution if filtering by user
  let userKey: string | null = null;
  if (filterUserId) {
    const userRow = await dbConn('users').where({ id: filterUserId }).first('user_key');
    userKey = userRow?.user_key ?? null;
  }

  // Run bulk queries in parallel
  const [sccAuditRows, wrsRows, violationRows, recentSnapshotRows, userBaseRows] = await Promise.all([
    // Query 1 — SCC audits (30-day rolling average)
    // Matches by both audited_user_id and audited_user_key to ensure no data is missed
    (() => {
      const q = dbConn('store_audits as a')
        .leftJoin('users as u', 'u.user_key', 'a.audited_user_key')
        .where({ 'a.type': 'service_crew_cctv', 'a.status': 'completed' })
        .whereBetween('a.completed_at', [rollingStart, todayEnd])
        .groupBy(dbConn.raw('COALESCE(a.audited_user_id, u.id)'))
        .select(
          dbConn.raw('COALESCE(a.audited_user_id, u.id) as user_id'),
          dbConn.raw('AVG(a.scc_service_efficiency) as avg_service_efficiency'),
          dbConn.raw('AVG(a.scc_customer_interaction) as avg_customer_interaction'),
          dbConn.raw('AVG(a.scc_cashiering) as avg_cashiering'),
          dbConn.raw('AVG(a.scc_suggestive_selling_and_upselling) as avg_suggestive_selling'),
          dbConn.raw('AVG(a.scc_productivity_rate::int) * 100 as avg_productivity_rate'),
          dbConn.raw('AVG(a.scc_uniform_compliance::int) * 100 as avg_uniform_compliance'),
          dbConn.raw('AVG(a.scc_hygiene_compliance::int) * 100 as avg_hygiene_compliance'),
          dbConn.raw('AVG(a.scc_sop_compliance::int) * 100 as avg_sop_compliance'),
        );

      if (filterUserId && userKey) {
        q.where((idQ) => {
          idQ.where('a.audited_user_id', filterUserId).orWhere('a.audited_user_key', userKey);
        });
      } else if (filterUserId) {
        q.where('a.audited_user_id', filterUserId);
      } else {
        // Just ensure there is SOME identity
        q.where((idQ) => {
          idQ.whereNotNull('a.audited_user_id').orWhereNotNull('a.audited_user_key');
        });
      }
      return q;
    })() as Promise<Array<Record<string, any>>>,

    // Query 2 — Peer evaluations (30-day rolling average)
    (() => {
      const q = dbConn('peer_evaluations as pe')
        .whereNotNull('pe.submitted_at')
        .whereRaw('COALESCE(pe.wrs_effective_at, pe.submitted_at) >= ?', [rollingStart])
        .whereRaw('COALESCE(pe.wrs_effective_at, pe.submitted_at) <= ?', [todayEnd])
        .groupBy('pe.evaluated_user_id')
        .select(
          'pe.evaluated_user_id as user_id',
          dbConn.raw('AVG((pe.q1_score + pe.q2_score + pe.q3_score) / 3.0) as avg_wrs'),
        );
      if (filterUserId) q.where('pe.evaluated_user_id', filterUserId);
      return q;
    })() as Promise<Array<Record<string, any>>>,

    // Query 3 — Violations count (Daily window, matches snapshot behavior)
    (() => {
      const q = dbConn('violation_notice_targets as vnt')
        .join('violation_notices as vn', 'vn.id', 'vnt.violation_notice_id')
        .where('vn.status', 'completed')
        .whereBetween('vn.created_at', [todayStart, todayEnd])
        .groupBy('vnt.user_id')
        .select('vnt.user_id', dbConn.raw('COUNT(*)::int as violations_count'));
      if (filterUserId) q.where('vnt.user_id', filterUserId);
      return q;
    })() as Promise<Array<Record<string, any>>>,

    // Query 4 — Most recent snapshot per user (past 30 days) for all metrics fallback
    (() => {
      const q = dbConn.raw(`
        SELECT DISTINCT ON (user_id) *
        FROM employee_metric_daily_snapshots
        WHERE snapshot_date >= ?
        ${filterUserId ? 'AND user_id = ?' : ''}
        ORDER BY user_id, snapshot_date DESC
      `, filterUserId ? [thirtyDaysAgoYmd, filterUserId] : [thirtyDaysAgoYmd]);
      return q;
    })().then((result: any) => result.rows ?? result) as Promise<Array<Record<string, any>>>,

    // Query 5 — Users to include in live rows (everyone active in last 30 days)
    (() => {
      const q = dbConn('users as u')
        .whereExists(function() {
          this.select('*')
            .from('employee_metric_daily_snapshots as s')
            .whereRaw('s.user_id = u.id')
            .where('s.snapshot_date', '>=', thirtyDaysAgoYmd);
        })
        .select('u.id', 'u.first_name', 'u.last_name', 'u.avatar_url', 'u.epi_score');
      if (filterUserId) q.where('u.id', filterUserId);
      return q;
    })() as Promise<Array<Record<string, any>>>,
  ]);

  // Index query results by user_id
  const sccByUser = new Map(sccAuditRows.map((r) => [r.user_id, r]));
  const wrsByUser = new Map(wrsRows.map((r) => [r.user_id, r]));
  const violationsByUser = new Map(violationRows.map((r) => [r.user_id, r]));
  const snapshotByUser = new Map(recentSnapshotRows.map((r) => [r.user_id, r]));

  // Filters out IDs that already have this date's snapshot
  const finalUserRows = userBaseRows.filter(u => !existingDateUserIds.has(u.id));
  if (finalUserRows.length === 0) return [];

  const now = new Date();

  // Build synthetic rows
  const liveRows: EmployeeMetricDailySnapshotRow[] = [];
  for (const userInfo of finalUserRows) {
    const userId = userInfo.id;
    const scc = sccByUser.get(userId);
    const wrs = wrsByUser.get(userId);
    const viol = violationsByUser.get(userId);
    const snap = snapshotByUser.get(userId);

    const firstName = userInfo.first_name || '';
    const lastName = userInfo.last_name || '';

    liveRows.push({
      userId,
      fullName: `${firstName} ${lastName}`.trim(),
      firstName,
      lastName,
      avatarUrl: userInfo.avatar_url ?? null,
      roleName: 'Service Crew',
      snapshotDate: targetYmd,
      windowStartDate,
      windowEndDate: targetYmd,
      // Metrics with live aggregation + snapshot fallback
      serviceEfficiencyScore: toNumberOrNull(scc?.avg_service_efficiency ?? snap?.service_efficiency),
      customerInteractionScore: toNumberOrNull(scc?.avg_customer_interaction ?? snap?.customer_interaction),
      cashieringScore: toNumberOrNull(scc?.avg_cashiering ?? snap?.cashiering),
      suggestiveSellingAndUpsellingScore: toNumberOrNull(scc?.avg_suggestive_selling ?? snap?.suggestive_selling_and_upselling),
      productivityRate: toNumberOrNull(scc?.avg_productivity_rate ?? snap?.productivity_rate),
      uniformComplianceRate: toNumberOrNull(scc?.avg_uniform_compliance ?? snap?.uniform_compliance_rate),
      hygieneComplianceRate: toNumberOrNull(scc?.avg_hygiene_compliance ?? snap?.hygiene_compliance_rate),
      sopComplianceRate: toNumberOrNull(scc?.avg_sop_compliance ?? snap?.sop_compliance_rate),
      workplaceRelationsScore: toNumberOrNull(wrs?.avg_wrs ?? snap?.workplace_relations_score),
      // Pure fallback metrics (Attendance & Punctuality per user request)
      attendanceRate: toNumberOrNull(snap?.attendance_rate),
      punctualityRate: toNumberOrNull(snap?.punctuality_rate),
      // Live EPI from users table
      epiScore: toNumberOrNull(userInfo.epi_score ?? snap?.epi_score),
      averageOrderValue: toNumberOrNull(snap?.average_order_value),
      branchAov: toNumberOrNull(snap?.branch_aov),
      awardsCount: 0, // Stay 0 for live, per user request
      violationsCount: viol?.violations_count ?? 0,
      generatedAt: now.toISOString(),
      calculationVersion: 'live-v2',
    });
  }

  return liveRows;
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
      db.getDb().raw('s.snapshot_date::text as "snapshotDate"'),
      's.window_start_date as windowStartDate',
      's.window_end_date as windowEndDate',
      's.customer_interaction as customerInteractionScore',
      's.cashiering as cashieringScore',
      's.suggestive_selling_and_upselling as suggestiveSellingAndUpsellingScore',
      's.service_efficiency as serviceEfficiencyScore',
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

  const rows = (await query) as EmployeeMetricDailySnapshotRow[];

  // Supplement with live data for 'Live' window (Today and Yesterday)
  // This handles the gap between midnight and the 3:30 AM cron job.
  const todayYmd = formatYmd(getManilaDateParts());
  const yesterdayYmd = addDaysToYmd(todayYmd, -1);
  const liveTargetDates = [yesterdayYmd, todayYmd].filter(d => d >= startYmd && d <= endYmd);

  for (const targetYmd of liveTargetDates) {
    const existingDateUserIds = new Set(
      rows.filter((r) => r.snapshotDate === targetYmd).map((r) => r.userId),
    );
    try {
      const liveRows = await fetchLiveSnapshotRows(targetYmd, existingDateUserIds, input.userId ?? null);
      rows.push(...liveRows);
    } catch (err) {
      logger.error({ err, targetYmd }, 'Failed to fetch live snapshot rows for gap filler');
    }
  }

  // Ensure rows are sorted by date after appending live data
  rows.sort((a, b) => String(a.snapshotDate).localeCompare(String(b.snapshotDate)));
  
  return rows;
}
