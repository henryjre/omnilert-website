import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import {
  calculateKpiScores,
  getWrsStatusSummary,
  type KpiBreakdown,
  type UserKpiData,
  type WrsStatusSummary,
} from './epiCalculation.service.js';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const THIRTY_DAY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

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

interface DashboardUserRow {
  userId: string;
  userKey: string;
  epi_score: number | string | null;
  epi_history: unknown;
}

async function fetchUserKpiData(userId: string, userKey: string): Promise<UserKpiData> {
  const dbConn = db.getDb();
  const [cssAudits, peerEvaluations, complianceAuditRows, violationNotices] = await Promise.all([
    // CSS audits: the user was the cashier being audited (identified by user_key UUID)
    dbConn('store_audits')
      .where({ css_cashier_user_key: userId, type: 'customer_service', status: 'completed' })
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
      .where({ auditor_user_id: userId, type: 'compliance', status: 'completed' })
      .select(
        'comp_productivity_rate',
        'comp_uniform',
        'comp_hygiene',
        'comp_sop',
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
          productivity_rate: r.comp_productivity_rate ?? false,
          uniform: r.comp_uniform ?? false,
          hygiene: r.comp_hygiene ?? false,
          sop: r.comp_sop ?? false,
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
  epi_history: unknown;
}

interface GlobalAverageDbRow {
  epi_score: number | string | null;
  epi_history: unknown;
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
  awardCount: number;
  uniformComplianceRate: number | null;
  hygieneComplianceRate: number | null;
  sopComplianceRate: number | null;
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
    awardCount: 0,
    uniformComplianceRate: null,
    hygieneComplianceRate: null,
    sopComplianceRate: null,
  };
}

function breakdownToCriteria(kpi: KpiBreakdown | null | undefined): DashboardCriteria {
  if (!kpi) return createEmptyCriteria();

  return {
    sqaaScore: kpi.css.score,
    workplaceRelationsScore: kpi.wrs.score,
    professionalConductScore: kpi.pcs.score,
    productivityRate: kpi.productivity.rate,
    punctualityRate: kpi.punctuality.rate,
    attendanceRate: kpi.attendance.rate,
    aov: kpi.aov.value,
    branchAov: kpi.aov.branch_avg,
    violationCount: kpi.violations.count,
    awardCount: kpi.awards.count,
    uniformComplianceRate: kpi.uniform.rate,
    hygieneComplianceRate: kpi.hygiene.rate,
    sopComplianceRate: kpi.sop.rate,
  };
}

function normalizeHistoryEntries(rawHistory: unknown): EpiHistoryEntry[] {
  if (!Array.isArray(rawHistory)) return [];
  return rawHistory.filter((entry): entry is EpiHistoryEntry => {
    return Boolean(
      entry &&
      typeof entry === 'object' &&
      'type' in entry &&
      'date' in entry &&
      'epi_after' in entry &&
      'kpi_breakdown' in entry,
    );
  });
}

function sortHistoryEntries(entries: EpiHistoryEntry[]): EpiHistoryEntry[] {
  return [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}

function historyEntriesToMonthlyHistory(entries: EpiHistoryEntry[]): HistoricalMonthEntry[] {
  const deduped = new Map<string, HistoricalMonthEntry>();

  for (const entry of sortHistoryEntries(entries)) {
    if (entry.type !== 'monthly') continue;

    const monthKey = getMonthKeyFromDateString(entry.date);
    if (!monthKey) continue;

    const parsedDate = new Date(entry.date);
    if (Number.isNaN(parsedDate.getTime())) continue;

    deduped.set(monthKey, {
      monthKey,
      monthLabel: getMonthLabel(parsedDate),
      year: getYear(parsedDate),
      epiScore: roundToTenth(toNumber(entry.epi_after, 100)),
      criteria: breakdownToCriteria(entry.kpi_breakdown),
    });
  }

  return Array.from(deduped.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

async function buildCurrentLiveSnapshot(user: UserKpiData, officialEpiScore: number): Promise<CurrentLiveSnapshot | null> {
  if (!user.userKey) return null;

  const now = new Date();
  const from = new Date(now.getTime() - THIRTY_DAY_WINDOW_MS);
  const parts = getManilaDateParts(now);

  const { breakdown, delta, raw_delta, capped } = await calculateKpiScores({
    userId: user.userId,
    userKey: user.userKey,
    cssAudits: user.cssAudits,
    peerEvaluations: user.peerEvaluations,
    complianceAudit: user.complianceAudit,
    violationNotices: user.violationNotices,
  });

  return {
    monthKey: `${parts.year}-${String(parts.month).padStart(2, '0')}`,
    monthLabel: MONTH_NAMES[parts.month - 1],
    year: parts.year,
    asOfDateTime: now.toISOString(),
    projectedEpiScore: roundToTenth(officialEpiScore + delta),
    delta,
    rawDelta: raw_delta,
    capped,
    criteria: breakdownToCriteria(breakdown),
    wrsStatus: getWrsStatusSummary(user.peerEvaluations, from, now),
  };
}

function isCurrentMonthSelection(monthKey: string, currentMonthKey: string): boolean {
  return monthKey === currentMonthKey;
}

function getHistoricalMonth(monthlyHistory: HistoricalMonthEntry[], monthKey: string): HistoricalMonthEntry | null {
  return monthlyHistory.find((entry) => entry.monthKey === monthKey) ?? null;
}

function formatFullName(firstName: string | null, lastName: string | null): string {
  const combined = `${firstName ?? ''} ${lastName ?? ''}`.trim();
  return combined || 'Unknown User';
}

function toLeaderboardSummaryRow(row: LeaderboardSummaryDbRow): LeaderboardSummaryUserRow {
  return {
    userId: row.userId,
    fullName: formatFullName(row.first_name, row.last_name),
    avatarUrl: row.avatar_url ?? null,
    officialEpiScore: toNumber(row.epi_score, 100),
    monthlyHistory: historyEntriesToMonthlyHistory(normalizeHistoryEntries(row.epi_history)),
  };
}

function toGlobalAverageUserRow(row: GlobalAverageDbRow): GlobalAverageUserRow {
  return {
    officialEpiScore: toNumber(row.epi_score, 100),
    monthlyHistory: historyEntriesToMonthlyHistory(normalizeHistoryEntries(row.epi_history)),
  };
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
    accumulateMonthScore(sumsByMonth, currentMonthKey, row.officialEpiScore);

    for (const month of row.monthlyHistory) {
      if (month.monthKey === currentMonthKey) continue;
      accumulateMonthScore(sumsByMonth, month.monthKey, month.epiScore);
    }
  }

  const sortedEntries = Array.from(sumsByMonth.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const averages: Record<string, number> = {};

  for (const [monthKey, aggregate] of sortedEntries) {
    if (aggregate.count === 0) continue;
    averages[monthKey] = roundToTenth(aggregate.sum / aggregate.count);
  }

  return averages;
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
  const [row, globalAverageRows] = await Promise.all([
    masterDb('users')
      .where({ id: userId })
      .first('id as userId', 'user_key as userKey', 'epi_score', 'epi_history') as Promise<DashboardUserRow | undefined>,
    applyGlobalLeaderboardFilters(masterDb('users as u'), masterDb)
      .select('u.epi_score', 'u.epi_history') as Promise<GlobalAverageDbRow[]>,
  ]);
  const globalAverageByMonth = createGlobalAverageByMonth(globalAverageRows.map(toGlobalAverageUserRow), currentMonthKey);

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
  const monthlyHistory = historyEntriesToMonthlyHistory(normalizeHistoryEntries(row.epi_history));

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
      'u.epi_history',
    )
    .orderBy('u.last_name', 'asc')
    .orderBy('u.first_name', 'asc')
    .orderBy('u.id', 'asc') as LeaderboardSummaryDbRow[];

  const summaryRows = rows.map(toLeaderboardSummaryRow);
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
      'u.epi_history',
    ) as LeaderboardIdentityRow | undefined;

  if (!row) {
    return null;
  }

  const detailRow: LeaderboardDetailUserRow = {
    userId: row.userId,
    fullName: formatFullName(row.first_name, row.last_name),
    avatarUrl: row.avatar_url ?? null,
    officialEpiScore: toNumber(row.epi_score, 100),
    monthlyHistory: historyEntriesToMonthlyHistory(normalizeHistoryEntries(row.epi_history)),
  };

  let currentLive: CurrentLiveSnapshot | null = null;
  if (isCurrentMonth) {
    try {
      const kpiData = await fetchUserKpiData(row.userId, row.userKey);
      currentLive = await buildCurrentLiveSnapshot(kpiData, detailRow.officialEpiScore);
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
