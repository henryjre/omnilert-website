import type { EpiCriteria, EpiDashboardData, EpiMonthEntry } from './types';

export const VIOLATION_DEDUCTION = 5;
export const AWARD_BONUS = 5;

function mockCriteria(epiScore: number, overrides: Partial<EpiCriteria> = {}): EpiCriteria {
  return {
    sqaaScore: Math.min(5, epiScore / 25),
    workplaceRelationsScore: Math.min(5, epiScore / 28),
    professionalConductScore: null,
    productivityRate: Math.min(100, epiScore * 0.78),
    punctualityRate: Math.min(100, epiScore * 0.85),
    attendanceRate: Math.min(100, epiScore * 0.82),
    aov: Math.round(epiScore * 2.2),
    branchAov: 230,
    violationCount: 0,
    awardCount: 0,
    uniformComplianceRate: Math.min(100, epiScore * 0.88),
    hygieneComplianceRate: Math.min(100, epiScore * 0.76),
    sopComplianceRate: Math.min(100, epiScore * 0.81),
    ...overrides,
  };
}

const MONTH_META = [
  { monthKey: '2025-04', month: 'Apr', year: 2025 },
  { monthKey: '2025-05', month: 'May', year: 2025 },
  { monthKey: '2025-06', month: 'Jun', year: 2025 },
  { monthKey: '2025-07', month: 'Jul', year: 2025 },
  { monthKey: '2025-08', month: 'Aug', year: 2025 },
  { monthKey: '2025-09', month: 'Sep', year: 2025 },
  { monthKey: '2025-10', month: 'Oct', year: 2025 },
  { monthKey: '2025-11', month: 'Nov', year: 2025 },
  { monthKey: '2025-12', month: 'Dec', year: 2025 },
  { monthKey: '2026-01', month: 'Jan', year: 2026 },
  { monthKey: '2026-02', month: 'Feb', year: 2026 },
  { monthKey: '2026-03', month: 'Mar', year: 2026 },
] as const;

function mockLeaderboardHistory(
  currentScore: number,
  seed: number,
  currentCriteria: EpiCriteria,
): EpiMonthEntry[] {
  return MONTH_META.map(({ monthKey, month, year }, index) => {
    const isLast = index === MONTH_META.length - 1;
    if (isLast) {
      return {
        monthKey,
        month,
        year,
        score: currentScore,
        criteria: currentCriteria,
        source: 'live',
        wrsStatus: { effectiveCount: 3, delayedCount: seed % 2 },
      };
    }

    const progress = index / (MONTH_META.length - 1);
    const base = currentScore * (0.78 + progress * 0.19);
    const jitter = ((seed * (index + 1)) % 7) - 3;
    const score = Math.max(60, Math.round((base + jitter) * 10) / 10);
    const violations = index < 4 ? (seed % 2 === 0 ? 1 : 0) : 0;
    const awards = score >= 100 ? 1 : 0;

    return {
      monthKey,
      month,
      year,
      score,
      criteria: mockCriteria(score, { violationCount: violations, awardCount: awards }),
      source: 'historical',
      wrsStatus: null,
    };
  });
}

const HISTORY: EpiMonthEntry[] = [
  {
    monthKey: '2025-04',
    month: 'Apr',
    year: 2025,
    score: 88.4,
    criteria: mockCriteria(88.4, { violationCount: 2, awardCount: 0, workplaceRelationsScore: null }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-05',
    month: 'May',
    year: 2025,
    score: 91.7,
    criteria: mockCriteria(91.7, { violationCount: 1, awardCount: 0 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-06',
    month: 'Jun',
    year: 2025,
    score: 89.2,
    criteria: mockCriteria(89.2, { violationCount: 2, awardCount: 1, sopComplianceRate: null }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-07',
    month: 'Jul',
    year: 2025,
    score: 93.5,
    criteria: mockCriteria(93.5, { violationCount: 0, awardCount: 1 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-08',
    month: 'Aug',
    year: 2025,
    score: 95.1,
    criteria: mockCriteria(95.1, { violationCount: 1, awardCount: 1 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-09',
    month: 'Sep',
    year: 2025,
    score: 94.8,
    criteria: mockCriteria(94.8, { violationCount: 1, awardCount: 0 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-10',
    month: 'Oct',
    year: 2025,
    score: 97.1,
    criteria: mockCriteria(97.1, { violationCount: 0, awardCount: 1 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-11',
    month: 'Nov',
    year: 2025,
    score: 100.3,
    criteria: mockCriteria(100.3, { violationCount: 0, awardCount: 1 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2025-12',
    month: 'Dec',
    year: 2025,
    score: 103.8,
    criteria: mockCriteria(103.8, { violationCount: 0, awardCount: 2 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2026-01',
    month: 'Jan',
    year: 2026,
    score: 105.2,
    criteria: mockCriteria(105.2, { violationCount: 0, awardCount: 2 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2026-02',
    month: 'Feb',
    year: 2026,
    score: 105.2,
    criteria: mockCriteria(105.2, { violationCount: 1, awardCount: 1 }),
    source: 'historical',
    wrsStatus: null,
  },
  {
    monthKey: '2026-03',
    month: 'Mar',
    year: 2026,
    score: 108.4,
    criteria: {
      sqaaScore: 4.2,
      workplaceRelationsScore: 3.8,
      professionalConductScore: null,
      productivityRate: null,
      punctualityRate: 92.3,
      attendanceRate: 88.5,
      aov: 245,
      branchAov: 230,
      violationCount: 1,
      awardCount: 2,
      uniformComplianceRate: 91.0,
      hygieneComplianceRate: 78.5,
      sopComplianceRate: null,
    },
    source: 'live',
    wrsStatus: { effectiveCount: 4, delayedCount: 1 },
  },
];

const CURRENT_MONTH = HISTORY[HISTORY.length - 1];
const MOCK_GLOBAL_AVERAGE_BY_MONTH = HISTORY.reduce<Record<string, number>>((acc, entry) => {
  // Keep mock averages slightly below each month score so UI demos positive deltas.
  acc[entry.monthKey] = Math.max(75, Math.round((entry.score - 3) * 10) / 10);
  return acc;
}, {});

export const MOCK_EPI_DATA: EpiDashboardData = {
  officialEpiScore: 105.2,
  goalTarget: 120,
  currentMonthKey: CURRENT_MONTH.monthKey,
  history: HISTORY,
  globalAverageByMonth: MOCK_GLOBAL_AVERAGE_BY_MONTH,
};
