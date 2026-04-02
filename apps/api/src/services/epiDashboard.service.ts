import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  calculateKpiScores,
  getWrsStatusSummary,
  type KpiBreakdown,
  type UserKpiData,
  type WrsStatusSummary,
} from './epiCalculation.service.js';
import { getOdooEmployeeIdsByWebsiteKey } from './odooQuery.service.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const THIRTY_DAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

interface DashboardUserRow {
  userId: string;
  userKey: string;
  epi_score: number | string | null;
}

async function fetchUserKpiData(userId: string, userKey: string): Promise<UserKpiData> {
  const dbConn = db.getDb();
  const odooEmployeeIds = await getOdooEmployeeIdsByWebsiteKey(userKey);
  const [cssAudits, peerEvaluations, complianceAuditRows, violationNotices] = await Promise.all([
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
      .whereNotNull('submitted_at')
      .select(
        dbConn.raw(`(q1_score + q2_score + q3_score) / 3.0 as average_score`),
        dbConn.raw(`submitted_at::text`),
        dbConn.raw(`wrs_effective_at::text`),
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
  ]);

  // Shape compliance rows into { answers, audited_at } format expected by epiCalculation
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
    violationNotices: violationNotices.length ? violationNotices : null,
  };
}

interface LeaderboardIdentityRow extends DashboardUserRow {
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface LeaderboardSummaryDbRow {
  userId: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  epi_score: number | string | null;
}

interface GlobalAverageDbRow {
  epi_score: number | string | null;
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

export interface DashboardCriteria {
  sqaaScore: number | null;
  workplaceRelationsScore: number | null;
  professionalConductScore: number | null;
  productivityRate: number | null;
  punctualityRate: number | null;
  attendanceRate: number | null;
  aov: number | null;
  branchAov: number | null;
  violationCount: number;
  violationTotalDecrease: number;
  awardCount: number;
  uniformComplianceRate: number | null;
  hygieneComplianceRate: number | null;
  sopComplianceRate: number | null;
  customerInteractionScore: number | null;
  cashieringScore: number | null;
  suggestiveSellingUpsellingScore: number | null;
  serviceEfficiencyScore: number | null;
}

export interface HistoricalMonthEntry {
  monthKey: string;
  monthLabel: string;
  year: number;
  epiScore: number;
  criteria: DashboardCriteria;
}

export interface CurrentLiveSnapshot {
  monthKey: string;
  monthLabel: string;
  year: number;
  asOfDateTime: string;
  projectedEpiScore: number;
  delta: number;
  rawDelta: number;
  capped: boolean;
  criteria: DashboardCriteria;
  wrsStatus: WrsStatusSummary;
}

export interface EpiDashboardResponse {
  officialEpiScore: number;
  currentMonthKey: string;
  currentLive: CurrentLiveSnapshot | null;
  monthlyHistory: HistoricalMonthEntry[];
  globalAverageByMonth: Record<string, number>;
}

export interface LeaderboardSummaryUserRow {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  officialEpiScore: number;
  monthlyHistory: HistoricalMonthEntry[];
}

export interface LeaderboardDetailUserRow extends LeaderboardSummaryUserRow {}

export interface GlobalAverageUserRow {
  officialEpiScore: number;
  monthlyHistory: HistoricalMonthEntry[];
}

export interface EpiLeaderboardSummaryEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  monthKey: string;
  displayEpiScore: number | null;
  hasData: boolean;
  isCurrentUser: boolean;
  rank: number;
}

export interface EpiLeaderboardDetailResponse {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  monthKey: string;
  epiScore: number | null;
  projectedEpiScore: number | null;
  hasData: boolean;
  criteria: DashboardCriteria;
  wrsStatus: WrsStatusSummary | null;
  asOfDateTime: string | null;
  scoreSource: 'official' | 'historical';
  criteriaSource: 'live' | 'historical';
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
    dayOfWeek: shifted.getUTCDay(),
  };
}

function getCurrentMonthKey(): string {
  return getMonthKey(new Date());
}

function getMonthKey(date: Date): string {
  const parts = getManilaDateParts(date);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}`;
}

function getMonthKeyFromDateString(dateStr: string): string | null {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return null;
  return getMonthKey(parsed);
}

function getMonthLabel(date: Date): string {
  const parts = getManilaDateParts(date);
  return MONTH_NAMES[parts.month - 1];
}

function getYear(date: Date): number {
  return getManilaDateParts(date).year;
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function toNumber(value: number | string | null | undefined, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function createEmptyCriteria(): DashboardCriteria {
  return {
    sqaaScore: null,
    workplaceRelationsScore: null,
    professionalConductScore: null,
    productivityRate: null,
    punctualityRate: null,
    attendanceRate: null,
    aov: null,
    branchAov: null,
    violationCount: 0,
    violationTotalDecrease: 0,
    awardCount: 0,
    uniformComplianceRate: null,
    hygieneComplianceRate: null,
    sopComplianceRate: null,
    customerInteractionScore: null,
    cashieringScore: null,
    suggestiveSellingUpsellingScore: null,
    serviceEfficiencyScore: null,
  };
}

function isCurrentMonthSelection(monthKey: string, currentMonthKey: string): boolean {
  return monthKey === currentMonthKey;
}

function isImmediatelyPrecedingMonth(monthKey: string, currentMonthKey: string): boolean {
  const [cy, cm] = currentMonthKey.split('-').map(Number);
  const [my, mm] = monthKey.split('-').map(Number);

  if (cy === my) return cm === mm + 1;
  return cy === my + 1 && cm === 1 && mm === 12;
}

function breakdownToCriteria(kpi: KpiBreakdown | null | undefined): DashboardCriteria {
  if (!kpi) return createEmptyCriteria();

  return {
    sqaaScore: null,
    workplaceRelationsScore: kpi.wrs.score,
    professionalConductScore: kpi.pcs.score,
    productivityRate: kpi.productivity.rate,
    punctualityRate: kpi.punctuality.rate,
    attendanceRate: kpi.attendance.rate,
    aov: kpi.aov.value,
    branchAov: kpi.aov.branch_avg,
    violationCount: kpi.violations.count,
    violationTotalDecrease: kpi.violations.total_decrease,
    awardCount: kpi.awards.count,
    uniformComplianceRate: kpi.uniform.rate,
    hygieneComplianceRate: kpi.hygiene.rate,
    sopComplianceRate: kpi.sop.rate,
    customerInteractionScore: kpi.customer_interaction.score,
    cashieringScore: kpi.cashiering.score,
    suggestiveSellingUpsellingScore: kpi.suggestive_selling_and_upselling.score,
    serviceEfficiencyScore: kpi.service_efficiency.score,
  };
}

function toNullableNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function snapshotToCriteria(s: any): DashboardCriteria {
  if (!s) return createEmptyCriteria();
  return {
    sqaaScore: null,
    workplaceRelationsScore: toNullableNumber(s.workplace_relations_score),
    professionalConductScore: null,
    productivityRate: toNullableNumber(s.productivity_rate),
    punctualityRate: toNullableNumber(s.punctuality_rate),
    attendanceRate: toNullableNumber(s.attendance_rate),
    aov: toNullableNumber(s.average_order_value),
    branchAov: toNullableNumber(s.branch_aov),
    violationCount: toNumber(s.violations_count, 0),
    violationTotalDecrease: toNumber(s.violations_count, 0) * 5,
    awardCount: toNumber(s.awards_count, 0),
    uniformComplianceRate: toNullableNumber(s.uniform_compliance_rate),
    hygieneComplianceRate: toNullableNumber(s.hygiene_compliance_rate),
    sopComplianceRate: toNullableNumber(s.sop_compliance_rate),
    customerInteractionScore: toNullableNumber(s.customer_interaction),
    cashieringScore: toNullableNumber(s.cashiering),
    suggestiveSellingUpsellingScore: toNullableNumber(s.suggestive_selling_and_upselling),
    serviceEfficiencyScore: toNullableNumber(s.service_efficiency),
  };
}

async function fetchMonthlyHistoryFromSnapshots(userId: string): Promise<HistoricalMonthEntry[]> {
  const masterDb = db.getDb();
  const snapshots = await masterDb('employee_metric_daily_snapshots')
    .where({ user_id: userId })
    .select(
      masterDb.raw("DISTINCT ON (date_trunc('month', snapshot_date)) snapshot_date"),
      'epi_score',
      'attendance_rate',
      'punctuality_rate',
      'productivity_rate',
      'average_order_value',
      'branch_aov',
      'uniform_compliance_rate',
      'hygiene_compliance_rate',
      'sop_compliance_rate',
      'workplace_relations_score',
      'customer_interaction',
      'cashiering',
      'suggestive_selling_and_upselling',
      'service_efficiency',
      'awards_count',
      'violations_count'
    )
    .orderByRaw("date_trunc('month', snapshot_date) DESC, snapshot_date DESC");

  return snapshots.map(s => {
    const date = new Date(s.snapshot_date);
    return {
      monthKey: getMonthKey(date),
      monthLabel: getMonthLabel(date),
      year: getYear(date),
      epiScore: roundToTenth(toNumber(s.epi_score, 100)),
      criteria: snapshotToCriteria(s),
    };
  }).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}



async function buildCurrentLiveSnapshot(user: UserKpiData, officialEpiScore: number, monthKey?: string): Promise<CurrentLiveSnapshot | null> {
  if (!user.userKey) return null;

  const now = new Date();
  const parts = getManilaDateParts(now);
  const effectiveMonthKey = monthKey || `${parts.year}-${String(parts.month).padStart(2, '0')}`;

  let from: Date;
  let to: Date;

  if (monthKey) {
    // For a historical month, use the 30-day window ending on the last day of that month
    const [y, m] = monthKey.split('-').map(Number);
    to = new Date(Date.UTC(y, m, 0, 15, 59, 59, 999)); // Last day of month
    from = new Date(to.getTime() - THIRTY_DAY_WINDOW_MS + 1);
  } else {
    to = now;
    from = new Date(now.getTime() - THIRTY_DAY_WINDOW_MS);
  }

  const { breakdown, delta, raw_delta, capped } = await calculateKpiScores({
    userId: user.userId,
    userKey: user.userKey,
    cssAudits: user.cssAudits,
    peerEvaluations: user.peerEvaluations,
    complianceAudit: user.complianceAudit,
    violationNotices: user.violationNotices,
  }, { window: { from, to }, minRecords: 1 });

  const dateForLabel = monthKey ? new Date(`${monthKey}-01`) : now;

  return {
    monthKey: effectiveMonthKey,
    monthLabel: getMonthLabel(dateForLabel),
    year: getYear(dateForLabel),
    asOfDateTime: now.toISOString(),
    projectedEpiScore: roundToTenth(officialEpiScore + delta),
    delta,
    rawDelta: raw_delta,
    capped,
    criteria: breakdownToCriteria(breakdown),
    wrsStatus: getWrsStatusSummary(user.peerEvaluations, from, to),
  };
}

function getHistoricalMonth(monthlyHistory: HistoricalMonthEntry[], monthKey: string): HistoricalMonthEntry | null {
  return monthlyHistory.find((entry) => entry.monthKey === monthKey) ?? null;
}

function formatFullName(firstName: string | null, lastName: string | null): string {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return combined || 'Unknown User';
}



function accumulateMonthScore(
  sumsByMonth: Map<string, { sum: number; count: number }>,
  monthKey: string,
  score: number,
): void {
  const existing = sumsByMonth.get(monthKey);
  if (!existing) {
    sumsByMonth.set(monthKey, { sum: score, count: 1 });
    return;
  }

  existing.sum += score;
  existing.count += 1;
}

export function createGlobalAverageByMonth(
  rows: GlobalAverageUserRow[],
  currentMonthKey: string,
): Record<string, number> {
  const sumsByMonth = new Map<string, { sum: number; count: number }>();

  for (const row of rows) {
    // 1. Accumulate current month based on official score
    accumulateMonthScore(sumsByMonth, currentMonthKey, row.officialEpiScore);

    // 2. Accumulate historical scores, making sure we don't double-count the current month
    for (const h of row.monthlyHistory) {
      if (h.monthKey !== currentMonthKey) {
        accumulateMonthScore(sumsByMonth, h.monthKey, h.epiScore);
      }
    }
  }

  const result: Record<string, number> = {};
  for (const [monthKey, { sum, count }] of sumsByMonth.entries()) {
    result[monthKey] = roundToTenth(sum / count);
  }

  return result;
}

export async function getGlobalAverageHistory(): Promise<Record<string, number>> {
  const masterDb = db.getDb();
  
  // Aggregate the EPI score average for the last day of every month
  const averages = await masterDb('employee_metric_daily_snapshots')
    .select(
      masterDb.raw("date_trunc('month', snapshot_date) as month_date"),
      masterDb.raw("AVG(epi_score) as average")
    )
    // We target snapshots that represent the month-end (last day)
    .whereRaw("snapshot_date = (date_trunc('month', snapshot_date) + interval '1 month' - interval '1 day')::date")
    .groupBy(1)
    .orderBy(1, 'asc');

  const result: Record<string, number> = {};
  for (const row of averages) {
    const d = new Date(row.month_date);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    result[key] = roundToTenth(toNumber(row.average, 100));
  }
  return result;
}

function compareLeaderboardSummaryEntries(a: EpiLeaderboardSummaryEntry, b: EpiLeaderboardSummaryEntry): number {
  if (a.hasData && b.hasData) {
    if (a.displayEpiScore !== b.displayEpiScore) {
      return (b.displayEpiScore ?? 0) - (a.displayEpiScore ?? 0);
    }
    return a.fullName.localeCompare(b.fullName);
  }

  if (a.hasData) return -1;
  if (b.hasData) return 1;
  return a.fullName.localeCompare(b.fullName);
}

export function createLeaderboardSummaryEntries(
  rows: LeaderboardSummaryUserRow[],
  options: {
    currentUserId: string;
    monthKey: string;
    currentMonthKey: string;
  },
): EpiLeaderboardSummaryEntry[] {
  const { currentUserId, monthKey, currentMonthKey } = options;
  const isCurrentMonth = isCurrentMonthSelection(monthKey, currentMonthKey);

  const unresolved = rows.map((row) => {
    const historicalMonth = isCurrentMonth ? null : getHistoricalMonth(row.monthlyHistory, monthKey);
    const displayEpiScore = isCurrentMonth ? row.officialEpiScore : historicalMonth?.epiScore ?? null;
    const hasData = isCurrentMonth ? true : historicalMonth !== null;

    return {
      userId: row.userId,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      monthKey,
      displayEpiScore,
      hasData,
      isCurrentUser: row.userId === currentUserId,
      rank: 0,
    } satisfies EpiLeaderboardSummaryEntry;
  });

  const ranked = [...unresolved].sort(compareLeaderboardSummaryEntries);
  return ranked.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export function createLeaderboardDetail(input: {
  row: LeaderboardDetailUserRow;
  monthKey: string;
  currentMonthKey: string;
  currentLive: CurrentLiveSnapshot | null;
}): EpiLeaderboardDetailResponse | null {
  const { row, monthKey, currentMonthKey, currentLive } = input;

  if (isCurrentMonthSelection(monthKey, currentMonthKey)) {
    return {
      userId: row.userId,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      monthKey,
      epiScore: row.officialEpiScore,
      projectedEpiScore: currentLive?.projectedEpiScore ?? null,
      hasData: true,
      criteria: currentLive?.criteria ?? createEmptyCriteria(),
      wrsStatus: currentLive?.wrsStatus ?? null,
      asOfDateTime: currentLive?.asOfDateTime ?? null,
      scoreSource: 'official',
      criteriaSource: 'live',
    };
  }

  const historicalMonth = getHistoricalMonth(row.monthlyHistory, monthKey);
  if (!historicalMonth) {
    if (isImmediatelyPrecedingMonth(monthKey, currentMonthKey) && currentLive) {
      return {
        userId: row.userId,
        fullName: row.fullName,
        avatarUrl: row.avatarUrl,
        monthKey,
        epiScore: row.officialEpiScore,
        projectedEpiScore: currentLive.projectedEpiScore,
        hasData: true,
        criteria: currentLive.criteria,
        wrsStatus: currentLive.wrsStatus,
        asOfDateTime: currentLive.asOfDateTime,
        scoreSource: 'official',
        criteriaSource: 'live',
      };
    }
    return {
      userId: row.userId,
      fullName: row.fullName,
      avatarUrl: row.avatarUrl,
      monthKey,
      epiScore: null,
      projectedEpiScore: null,
      hasData: false,
      criteria: createEmptyCriteria(),
      wrsStatus: null,
      asOfDateTime: null,
      scoreSource: 'historical',
      criteriaSource: 'historical',
    };
  }

  return {
    userId: row.userId,
    fullName: row.fullName,
    avatarUrl: row.avatarUrl,
    monthKey,
    epiScore: historicalMonth.epiScore,
    projectedEpiScore: null,
    hasData: true,
    criteria: historicalMonth.criteria,
    wrsStatus: null,
    asOfDateTime: null,
    scoreSource: 'historical',
    criteriaSource: 'historical',
  };
}

export function applyGlobalLeaderboardFilters(query: any, masterDb: any) {
  return query
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .whereExists((subquery: any) => {
      subquery
        .select(masterDb.raw('1'))
        .from('user_roles as ur')
        .join('roles as r', 'ur.role_id', 'r.id')
        .whereRaw('ur.user_id = u.id')
        .where('r.name', 'Service Crew');
    });
}

export async function getEpiDashboard(userId: string): Promise<EpiDashboardResponse> {
  const masterDb = db.getDb();
  const currentMonthKey = getCurrentMonthKey();
  const [row, globalAverageByMonth] = await Promise.all([
    masterDb('users')
      .where({ id: userId })
      .first('id as userId', 'user_key as userKey', 'epi_score') as Promise<DashboardUserRow | undefined>,
    getGlobalAverageHistory(),
  ]);

  if (!row) {
    return {
      officialEpiScore: 100,
      currentMonthKey,
      currentLive: null,
      monthlyHistory: [],
      globalAverageByMonth,
    };
  }

  const officialEpiScore = toNumber(row.epi_score, 100);
  const monthlyHistory = await fetchMonthlyHistoryFromSnapshots(userId);

  let currentLive: CurrentLiveSnapshot | null = null;
  try {
    const kpiData = await fetchUserKpiData(row.userId, row.userKey);
    currentLive = await buildCurrentLiveSnapshot(kpiData, officialEpiScore);
  } catch (error) {
    logger.error({ err: error, userId }, 'Failed to build live EPI dashboard snapshot');
  }

  return {
    officialEpiScore,
    currentMonthKey,
    currentLive,
    monthlyHistory,
    globalAverageByMonth,
  };
}

export async function getEpiLeaderboard(currentUserId: string, monthKey: string): Promise<EpiLeaderboardSummaryEntry[]> {
  const masterDb = db.getDb();
  const currentMonthKey = getCurrentMonthKey();

  const rows = await applyGlobalLeaderboardFilters(masterDb('users as u'), masterDb)
    .select(
      'u.id as userId',
      'u.first_name',
      'u.last_name',
      'u.avatar_url',
      'u.epi_score',
    )
    .orderBy('u.last_name', 'asc')
    .orderBy('u.first_name', 'asc')
    .orderBy('u.id', 'asc') as LeaderboardSummaryDbRow[];

  const userIds = rows.map(r => r.userId);
  const allSnapshots = await masterDb('employee_metric_daily_snapshots')
    .whereIn('user_id', userIds)
    .select(
      masterDb.raw("DISTINCT ON (user_id, date_trunc('month', snapshot_date)) user_id"),
      'snapshot_date',
      'epi_score',
      'attendance_rate',
      'punctuality_rate',
      'productivity_rate',
      'average_order_value',
      'branch_aov',
      'uniform_compliance_rate',
      'hygiene_compliance_rate',
      'sop_compliance_rate',
      'workplace_relations_score',
      'customer_interaction',
      'cashiering',
      'suggestive_selling_and_upselling',
      'service_efficiency',
      'awards_count',
      'violations_count'
    )
    .orderByRaw("user_id, date_trunc('month', snapshot_date) DESC, snapshot_date DESC");

  const snapshotsByUser = new Map<string, any[]>();
  for (const s of allSnapshots) {
    const list = snapshotsByUser.get(s.user_id) ?? [];
    list.push(s);
    snapshotsByUser.set(s.user_id, list);
  }

  const summaryRows = rows.map((row) => {
    const userSnapshots = snapshotsByUser.get(row.userId) ?? [];
    const monthlyHistory = userSnapshots.map(s => {
      const date = new Date(s.snapshot_date);
      return {
        monthKey: getMonthKey(date),
        monthLabel: getMonthLabel(date),
        year: getYear(date),
        epiScore: roundToTenth(toNumber(s.epi_score, 100)),
        criteria: snapshotToCriteria(s),
      };
    }).sort((a, b) => a.monthKey.localeCompare(b.monthKey));

    return {
      userId: row.userId,
      fullName: formatFullName(row.first_name, row.last_name),
      avatarUrl: row.avatar_url ?? null,
      officialEpiScore: toNumber(row.epi_score, 100),
      monthlyHistory,
    };
  });
  return createLeaderboardSummaryEntries(summaryRows, {
    currentUserId,
    monthKey,
    currentMonthKey,
  });
}

export async function getEpiLeaderboardDetail(
  userId: string,
  monthKey: string,
): Promise<EpiLeaderboardDetailResponse | null> {
  const masterDb = db.getDb();
  const currentMonthKey = getCurrentMonthKey();
  const isCurrentMonth = isCurrentMonthSelection(monthKey, currentMonthKey);

  const row = await applyGlobalLeaderboardFilters(masterDb('users as u'), masterDb)
    .where('u.id', userId)
    .first(
      'u.id as userId',
      'u.first_name',
      'u.last_name',
      'u.avatar_url',
      'u.user_key as userKey',
      'u.epi_score',
    ) as LeaderboardIdentityRow | undefined;

  if (!row) {
    return null;
  }

  const detailRow: LeaderboardDetailUserRow = {
    userId: row.userId,
    fullName: formatFullName(row.first_name, row.last_name),
    avatarUrl: row.avatar_url ?? null,
    officialEpiScore: toNumber(row.epi_score, 100),
    monthlyHistory: await fetchMonthlyHistoryFromSnapshots(userId),
  };

  let currentLive: CurrentLiveSnapshot | null = null;
  const isImmediatelyPreceding = isImmediatelyPrecedingMonth(monthKey, currentMonthKey);

  if (isCurrentMonth || (isImmediatelyPreceding && !getHistoricalMonth(detailRow.monthlyHistory, monthKey))) {
    try {
      const kpiData = await fetchUserKpiData(row.userId, row.userKey);
      currentLive = await buildCurrentLiveSnapshot(kpiData, detailRow.officialEpiScore, isCurrentMonth ? undefined : monthKey);
    } catch (error) {
      logger.error({ err: error, userId: row.userId }, 'Failed to build live leaderboard detail snapshot');
    }
  }

  return createLeaderboardDetail({
    row: detailRow,
    monthKey,
    currentMonthKey,
    currentLive,
  });
}
