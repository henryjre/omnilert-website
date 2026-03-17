import { api } from '@/shared/services/api.client';
import type { EpiDashboardData, EpiMonthEntry, EpiCriteria, LeaderboardEntry } from '../components/epi/types';

// ─── Backend Response Types ───────────────────────────────────────────────────

interface KpiBreakdown {
  css: { score: number | null; impact: number };
  wrs: { score: number | null; impact: number };
  pcs: { score: number | null; impact: number };
  attendance: { rate: number | null; impact: number };
  punctuality: { rate: number | null; impact: number };
  productivity: { rate: number | null; impact: number };
  aov: { value: number | null; branch_avg: number | null; impact: number };
  uniform: { rate: number | null; impact: number };
  hygiene: { rate: number | null; impact: number };
  sop: { rate: number | null; impact: number };
  awards: { count: number; impact: number };
  violations: { count: number; total_decrease: number; impact: number };
}

interface BackendEpiHistoryEntry {
  type: 'weekly' | 'monthly';
  date: string; // YYYY-MM-DD
  epi_before: number;
  epi_after: number;
  delta: number;
  kpi_breakdown: KpiBreakdown;
  capped: boolean;
  raw_delta: number;
}

interface BackendEpiDashboardResponse {
  epiScore: number;
  epiHistory: BackendEpiHistoryEntry[];
}

interface BackendLeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  epiScore: number;
  rank: number;
}

// ─── Transformers ─────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function kpiBreakdownToCriteria(kpi: KpiBreakdown): EpiCriteria {
  return {
    sqaaScore: kpi.css.score,
    scsaScore: kpi.wrs.score,
    workplaceRelationsScore: kpi.wrs.score, // WRS maps to workplace relations
    productivityRate: kpi.productivity.rate,
    cashierAccuracyRate: null, // Not in new KPI system
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

function historyEntriesToMonthEntries(entries: BackendEpiHistoryEntry[]): EpiMonthEntry[] {
  // Use monthly snapshots for the month selector; fall back to weekly if no monthly exists
  const monthlyEntries = entries.filter((e) => e.type === 'monthly');
  const useEntries = monthlyEntries.length > 0 ? monthlyEntries : entries;

  // Deduplicate by month+year (keep last entry per month)
  const byMonth = new Map<string, BackendEpiHistoryEntry>();
  for (const entry of useEntries) {
    const d = new Date(entry.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    byMonth.set(key, entry);
  }

  return Array.from(byMonth.values())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((entry) => {
      const d = new Date(entry.date);
      return {
        month: MONTH_NAMES[d.getMonth()],
        year: d.getFullYear(),
        score: entry.epi_after,
        criteria: kpiBreakdownToCriteria(entry.kpi_breakdown),
      };
    });
}

function buildEmptyDashboard(epiScore: number): EpiDashboardData {
  const now = new Date();
  const emptyCriteria: EpiCriteria = {
    sqaaScore: null,
    scsaScore: null,
    workplaceRelationsScore: null,
    productivityRate: null,
    cashierAccuracyRate: null,
    attendanceRate: null,
    aov: null,
    branchAov: null,
    violationCount: 0,
    awardCount: 0,
    uniformComplianceRate: null,
    hygieneComplianceRate: null,
    sopComplianceRate: null,
  };

  return {
    epiScore,
    epiDelta: 0,
    currentMonth: MONTH_NAMES[now.getMonth()],
    goalTarget: 105,
    history: [
      {
        month: MONTH_NAMES[now.getMonth()],
        year: now.getFullYear(),
        score: epiScore,
        criteria: emptyCriteria,
      },
    ],
    criteria: emptyCriteria,
  };
}

// ─── API Functions ─────────────────────────────────────────────────────────────

export async function fetchEpiDashboard(): Promise<EpiDashboardData> {
  const res = await api.get<{ success: boolean; data: BackendEpiDashboardResponse }>('/dashboard/epi');
  const backend = res.data.data;

  if (!backend || backend.epiHistory.length === 0) {
    return buildEmptyDashboard(backend?.epiScore ?? 100);
  }

  const history = historyEntriesToMonthEntries(backend.epiHistory);
  const latestEntry = backend.epiHistory[backend.epiHistory.length - 1];
  const criteria = kpiBreakdownToCriteria(latestEntry.kpi_breakdown);
  const now = new Date();

  // Calculate current week's delta (last weekly entry)
  const lastWeekly = [...backend.epiHistory].reverse().find((e) => e.type === 'weekly');
  const epiDelta = lastWeekly?.delta ?? 0;

  return {
    epiScore: backend.epiScore,
    epiDelta,
    currentMonth: MONTH_NAMES[now.getMonth()],
    goalTarget: 105,
    history,
    criteria,
  };
}

export async function fetchEpiLeaderboard(currentUserId?: string): Promise<LeaderboardEntry[]> {
  const res = await api.get<{ success: boolean; data: BackendLeaderboardEntry[] }>('/dashboard/epi/leaderboard');
  const list = res.data.data ?? [];

  const emptyCriteria: EpiCriteria = {
    sqaaScore: null,
    scsaScore: null,
    workplaceRelationsScore: null,
    productivityRate: null,
    cashierAccuracyRate: null,
    attendanceRate: null,
    aov: null,
    branchAov: null,
    violationCount: 0,
    awardCount: 0,
    uniformComplianceRate: null,
    hygieneComplianceRate: null,
    sopComplianceRate: null,
  };

  return list.map((entry: BackendLeaderboardEntry) => ({
    id: entry.userId,
    rank: entry.rank,
    firstName: entry.fullName.split(' ')[0] ?? '',
    lastName: entry.fullName.split(' ').slice(1).join(' '),
    avatarUrl: entry.avatarUrl,
    epiScore: entry.epiScore,
    isCurrentUser: entry.userId === currentUserId,
    criteria: emptyCriteria,
    history: [],
  }));
}
