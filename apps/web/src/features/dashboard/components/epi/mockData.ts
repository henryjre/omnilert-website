import type { EpiCriteria, EpiDashboardData, EpiMonthEntry, LeaderboardEntry } from './types';

export const VIOLATION_DEDUCTION = 5;
export const AWARD_BONUS = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockCriteria(epiScore: number, overrides: Partial<EpiCriteria> = {}): EpiCriteria {
  return {
    sqaaScore: Math.min(5, epiScore / 25),
    scsaScore: Math.min(5, epiScore / 28),
    workplaceRelationsScore: Math.min(5, epiScore / 24),
    productivityRate: Math.min(100, epiScore * 0.78),
    cashierAccuracyRate: Math.min(100, epiScore * 0.85),
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

// Month metadata shared by all history arrays (same period for every employee)
const MONTH_META = [
  { month: 'Apr', year: 2025 },
  { month: 'May', year: 2025 },
  { month: 'Jun', year: 2025 },
  { month: 'Jul', year: 2025 },
  { month: 'Aug', year: 2025 },
  { month: 'Sep', year: 2025 },
  { month: 'Oct', year: 2025 },
  { month: 'Nov', year: 2025 },
  { month: 'Dec', year: 2025 },
  { month: 'Jan', year: 2026 },
  { month: 'Feb', year: 2026 },
  { month: 'Mar', year: 2026 },
] as const;

/**
 * Build a 12-month history for a leaderboard entry.
 * Scores ramp up from ~75% of the final score toward the final score,
 * with slight month-to-month variance per employee (seeded by id offset).
 */
function mockLeaderboardHistory(
  currentScore: number,
  seed: number,
  currentCriteria: EpiCriteria,
): EpiMonthEntry[] {
  return MONTH_META.map(({ month, year }, i) => {
    const isLast = i === MONTH_META.length - 1;
    if (isLast) {
      return { month, year, score: currentScore, criteria: currentCriteria };
    }
    // Ramp from ~78% to ~97% of final score, with ±seed jitter
    const progress = i / (MONTH_META.length - 1); // 0 → ~0.917 for second-to-last
    const base = currentScore * (0.78 + progress * 0.19);
    const jitter = ((seed * (i + 1)) % 7) - 3; // deterministic ±3 jitter
    const score = Math.max(60, Math.round((base + jitter) * 10) / 10);
    const violations = i < 4 ? (seed % 2 === 0 ? 1 : 0) : 0;
    const awards = score >= 100 ? 1 : 0;
    return {
      month, year, score,
      criteria: mockCriteria(score, { violationCount: violations, awardCount: awards }),
    };
  });
}

// ---------------------------------------------------------------------------
// Main user's 12-month history (Apr 2025 → Mar 2026)
// ---------------------------------------------------------------------------

const HISTORY: EpiMonthEntry[] = [
  {
    month: 'Apr', year: 2025, score: 88.4,
    criteria: mockCriteria(88.4, { violationCount: 2, awardCount: 0, workplaceRelationsScore: null }),
  },
  {
    month: 'May', year: 2025, score: 91.7,
    criteria: mockCriteria(91.7, { violationCount: 1, awardCount: 0 }),
  },
  {
    month: 'Jun', year: 2025, score: 89.2,
    criteria: mockCriteria(89.2, { violationCount: 2, awardCount: 1, sopComplianceRate: null }),
  },
  {
    month: 'Jul', year: 2025, score: 93.5,
    criteria: mockCriteria(93.5, { violationCount: 0, awardCount: 1 }),
  },
  {
    month: 'Aug', year: 2025, score: 95.1,
    criteria: mockCriteria(95.1, { violationCount: 1, awardCount: 1 }),
  },
  {
    month: 'Sep', year: 2025, score: 94.8,
    criteria: mockCriteria(94.8, { violationCount: 1, awardCount: 0 }),
  },
  {
    month: 'Oct', year: 2025, score: 97.1,
    criteria: mockCriteria(97.1, { violationCount: 0, awardCount: 1 }),
  },
  {
    month: 'Nov', year: 2025, score: 100.3,
    criteria: mockCriteria(100.3, { violationCount: 0, awardCount: 1 }),
  },
  {
    month: 'Dec', year: 2025, score: 103.8,
    criteria: mockCriteria(103.8, { violationCount: 0, awardCount: 2 }),
  },
  {
    month: 'Jan', year: 2026, score: 105.2,
    criteria: mockCriteria(105.2, { violationCount: 0, awardCount: 2 }),
  },
  {
    month: 'Feb', year: 2026, score: 105.2,
    criteria: mockCriteria(105.2, { violationCount: 1, awardCount: 1 }),
  },
  {
    month: 'Mar', year: 2026, score: 108.4,
    criteria: {
      sqaaScore: 4.2,
      scsaScore: 3.8,
      workplaceRelationsScore: null,
      productivityRate: null,
      cashierAccuracyRate: 92.3,
      attendanceRate: 88.5,
      aov: 245,
      branchAov: 230,
      violationCount: 1,
      awardCount: 2,
      uniformComplianceRate: 91.0,
      hygieneComplianceRate: 78.5,
      sopComplianceRate: null,
    },
  },
];

const CURRENT_MONTH = HISTORY[HISTORY.length - 1];

export const MOCK_EPI_DATA: EpiDashboardData = {
  epiScore: CURRENT_MONTH.score,
  epiDelta: CURRENT_MONTH.score - HISTORY[HISTORY.length - 2].score,
  currentMonth: `${CURRENT_MONTH.month} ${CURRENT_MONTH.year}`,
  goalTarget: 120,
  history: HISTORY,
  criteria: CURRENT_MONTH.criteria,
};

// ---------------------------------------------------------------------------
// Leaderboard — each entry has full 12-month history
// ---------------------------------------------------------------------------

function makeEntry(
  id: string, rank: number,
  firstName: string, lastName: string,
  epiScore: number,
  isCurrentUser = false,
  customHistory?: EpiMonthEntry[],
): LeaderboardEntry {
  const criteria = mockCriteria(epiScore);
  const history = customHistory ?? mockLeaderboardHistory(epiScore, rank, criteria);
  return { id, rank, firstName, lastName, avatarUrl: null, epiScore, isCurrentUser, criteria, history };
}

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  makeEntry('1',  1,  'Maria',  'Santos',    124.1),
  makeEntry('2',  2,  'Juan',   'Dela Cruz', 119.7),
  makeEntry('3',  3,  'Ana',    'Reyes',     116.3),
  makeEntry('4',  4,  'Pedro',  'Garcia',    114.8),
  makeEntry('5',  5,  'Rosa',   'Flores',    113.2),
  makeEntry('6',  6,  'Carlos', 'Lopez',     110.9),
  // Current user uses the main user's history
  {
    id: '7', rank: 7, firstName: 'You', lastName: '', avatarUrl: null,
    epiScore: 108.4, isCurrentUser: true,
    criteria: CURRENT_MONTH.criteria,
    history: HISTORY,
  },
  makeEntry('8',  8,  'Liza',   'Cruz',    106.1),
  makeEntry('9',  9,  'Ramon',  'Torres',  104.5),
  makeEntry('10', 10, 'Elena',  'Ramos',   102.8),
  makeEntry('11', 11, 'Jose',   'Morales',  99.4),
  makeEntry('12', 12, 'Grace',  'Rivera',   97.3),
];
