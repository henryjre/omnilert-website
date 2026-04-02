import { api } from '@/shared/services/api.client';
import type {
  EpiCriteria,
  EpiDashboardData,
  EpiMonthEntry,
  LeaderboardDetailEntry,
  LeaderboardSummaryEntry,
  WrsStatusSummary,
} from '../components/epi/types';

interface BackendHistoricalMonthEntry {
  monthKey: string;
  monthLabel: string;
  year: number;
  /**
   * Backend may return null when a month has no computed score yet.
   * We normalize this to a safe numeric fallback on the client.
   */
  epiScore: number | null;
  criteria: EpiCriteria;
}

interface BackendCurrentLiveSnapshot {
  monthKey: string;
  monthLabel: string;
  year: number;
  asOfDateTime: string;
  /**
   * Backend may return null when projection is unavailable.
   * We normalize this to a safe numeric fallback on the client.
   */
  projectedEpiScore: number | null;
  delta: number;
  rawDelta: number;
  capped: boolean;
  criteria: EpiCriteria;
  wrsStatus: WrsStatusSummary;
}

interface BackendEpiDashboardResponse {
  /**
   * Backend may return null during initial setup or when data is missing.
   * We normalize this to a safe numeric fallback on the client.
   */
  officialEpiScore: number | null;
  currentMonthKey: string;
  currentLive: BackendCurrentLiveSnapshot | null;
  monthlyHistory: BackendHistoricalMonthEntry[];
  globalAverageByMonth: Record<string, number> | null;
}

interface BackendLeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  monthKey: string;
  displayEpiScore: number | null;
  projectedEpiScore: number | null;
  hasData: boolean;
  isCurrentUser: boolean;
  rank: number;
}

interface BackendLeaderboardDetailResponse {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  monthKey: string;
  epiScore: number | null;
  projectedEpiScore: number | null;
  hasData: boolean;
  criteria: EpiCriteria;
  wrsStatus: WrsStatusSummary | null;
  asOfDateTime: string | null;
  scoreSource: 'official' | 'historical';
  criteriaSource: 'live' | 'historical';
}

export interface DashboardCheckInStatus {
  checkedIn: boolean;
  roleType: 'Management' | 'Service Crew' | null;
  companyName: string | null;
  branchName: string | null;
  checkInTimeUtc: string | null;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Coerces an API-provided score into a finite number.
 *
 * This prevents UI hard-crashes (e.g. `.toFixed()` on null) when the backend
 * returns `null` for months without a computed score yet.
 */
function coerceEpiScore(value: number | null | undefined, fallback: number): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return fallback;
  return value;
}

function coerceGlobalAverageByMonth(value: Record<string, number> | null | undefined): Record<string, number> {
  if (!value || typeof value !== 'object') return {};

  const normalized: Record<string, number> = {};
  for (const [monthKey, average] of Object.entries(value)) {
    if (typeof average !== 'number') continue;
    if (!Number.isFinite(average)) continue;
    normalized[monthKey] = average;
  }

  return normalized;
}

function getEmptyCriteria(): EpiCriteria {
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

function getCurrentMonthMeta(): { monthKey: string; month: string; year: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  });

  const parts = formatter.formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value ?? new Date().getFullYear());
  const monthNumber = Number(parts.find((part) => part.type === 'month')?.value ?? new Date().getMonth() + 1);

  return {
    monthKey: `${year}-${String(monthNumber).padStart(2, '0')}`,
    month: MONTH_NAMES[monthNumber - 1],
    year,
  };
}

export function getCurrentManilaMonthKey(): string {
  return getCurrentMonthMeta().monthKey;
}

function toHistoricalMonthEntry(entry: BackendHistoricalMonthEntry, scoreFallback: number): EpiMonthEntry {
  return {
    monthKey: entry.monthKey,
    month: entry.monthLabel,
    year: entry.year,
    score: coerceEpiScore(entry.epiScore, scoreFallback),
    criteria: entry.criteria ?? getEmptyCriteria(),
    source: 'historical',
    wrsStatus: null,
  };
}

function toLiveMonthEntry(entry: BackendCurrentLiveSnapshot, scoreFallback: number): EpiMonthEntry {
  return {
    monthKey: entry.monthKey,
    month: entry.monthLabel,
    year: entry.year,
    score: coerceEpiScore(entry.projectedEpiScore, scoreFallback),
    criteria: entry.criteria ?? getEmptyCriteria(),
    source: 'live',
    wrsStatus: entry.wrsStatus ?? null,
  };
}

function combineMonthHistory(
  monthlyHistory: BackendHistoricalMonthEntry[],
  currentLive: BackendCurrentLiveSnapshot | null,
  scoreFallback: number,
): EpiMonthEntry[] {
  const byMonth = new Map<string, EpiMonthEntry>();

  for (const entry of monthlyHistory ?? []) {
    byMonth.set(entry.monthKey, toHistoricalMonthEntry(entry, scoreFallback));
  }

  if (currentLive) {
    byMonth.set(currentLive.monthKey, toLiveMonthEntry(currentLive, scoreFallback));
  }

  return Array.from(byMonth.values()).sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function buildEmptyDashboard(officialEpiScore: number): EpiDashboardData {
  const current = getCurrentMonthMeta();

  return {
    officialEpiScore,
    goalTarget: 105,
    currentMonthKey: current.monthKey,
    globalAverageByMonth: {},
    history: [
      {
        monthKey: current.monthKey,
        month: current.month,
        year: current.year,
        score: officialEpiScore,
        criteria: getEmptyCriteria(),
        source: 'live',
        wrsStatus: null,
      },
    ],
  };
}

function ensureCurrentMonthEntry(history: EpiMonthEntry[], officialEpiScore: number, currentMonthKey: string): EpiMonthEntry[] {
  if (history.some((entry) => entry.monthKey === currentMonthKey)) {
    return history;
  }

  const [yearPart, monthPart] = currentMonthKey.split('-');
  const monthIndex = Math.max(0, Number(monthPart) - 1);
  const fallbackEntry: EpiMonthEntry = {
    monthKey: currentMonthKey,
    month: MONTH_NAMES[monthIndex] ?? MONTH_NAMES[0],
    year: Number(yearPart) || new Date().getFullYear(),
    score: officialEpiScore,
    criteria: getEmptyCriteria(),
    source: 'live',
    wrsStatus: null,
  };

  return [...history, fallbackEntry].sort((a, b) => a.monthKey.localeCompare(b.monthKey));
}

function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const [firstName = '', ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName,
    lastName: rest.join(' '),
  };
}

export async function fetchEpiDashboard(): Promise<EpiDashboardData> {
  const res = await api.get<{ success: boolean; data: BackendEpiDashboardResponse | null }>('/dashboard/epi');
  const backend = res.data.data;

  if (!backend) {
    return buildEmptyDashboard(100);
  }

  const officialEpiScore = coerceEpiScore(backend.officialEpiScore, 100);
  const combinedHistory = combineMonthHistory(backend.monthlyHistory ?? [], backend.currentLive, officialEpiScore);
  const history = ensureCurrentMonthEntry(combinedHistory, officialEpiScore, backend.currentMonthKey);

  if (history.length === 0) {
    return buildEmptyDashboard(officialEpiScore);
  }

  return {
    officialEpiScore,
    goalTarget: 105,
    currentMonthKey: backend.currentMonthKey,
    history,
    globalAverageByMonth: coerceGlobalAverageByMonth(backend.globalAverageByMonth),
  };
}

export async function fetchEpiLeaderboardSummary(monthKey: string): Promise<LeaderboardSummaryEntry[]> {
  const res = await api.get<{ success: boolean; data: BackendLeaderboardEntry[] }>('/dashboard/epi/leaderboard', {
    params: { monthKey },
  });
  const list = res.data.data ?? [];

  return list.map((entry) => {
    const { firstName, lastName } = splitFullName(entry.fullName);

    return {
      id: entry.userId,
      rank: entry.rank,
      firstName,
      lastName,
      avatarUrl: entry.avatarUrl,
      monthKey: entry.monthKey,
      displayEpiScore: entry.displayEpiScore,
      projectedEpiScore: entry.projectedEpiScore,
      hasData: entry.hasData,
      isCurrentUser: entry.isCurrentUser,
    } satisfies LeaderboardSummaryEntry;
  });
}

export async function fetchEpiLeaderboardDetail(userId: string, monthKey: string): Promise<LeaderboardDetailEntry | null> {
  const res = await api.get<{ success: boolean; data: BackendLeaderboardDetailResponse | null }>(`/dashboard/epi/leaderboard/${userId}`, {
    params: { monthKey },
  });
  const entry = res.data.data;

  if (!entry) {
    return null;
  }

  const { firstName, lastName } = splitFullName(entry.fullName);

  return {
    id: entry.userId,
    firstName,
    lastName,
    avatarUrl: entry.avatarUrl,
    monthKey: entry.monthKey,
    epiScore: entry.epiScore,
    projectedEpiScore: entry.projectedEpiScore,
    hasData: entry.hasData,
    criteria: entry.criteria ?? getEmptyCriteria(),
    wrsStatus: entry.wrsStatus ?? null,
    asOfDateTime: entry.asOfDateTime,
    scoreSource: entry.scoreSource,
    criteriaSource: entry.criteriaSource,
  } satisfies LeaderboardDetailEntry;
}

export async function fetchDashboardCheckInStatus(): Promise<DashboardCheckInStatus> {
  const res = await api.get<{ success: boolean; data: DashboardCheckInStatus | null }>('/dashboard/check-in-status');
  return res.data.data ?? {
    checkedIn: false,
    roleType: null,
    companyName: null,
    branchName: null,
    checkInTimeUtc: null,
  };
}
