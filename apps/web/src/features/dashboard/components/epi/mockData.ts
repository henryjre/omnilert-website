import type { EpiDashboardData, LeaderboardEntry } from './types';

export const VIOLATION_DEDUCTION = 5;
export const AWARD_BONUS = 5;

export const MOCK_EPI_DATA: EpiDashboardData = {
  epiScore: 108.4,
  epiDelta: 3.2,
  currentMonth: 'March 2026',
  goalTarget: 120,
  history: [
    { month: 'Oct', score: 97.1 },
    { month: 'Nov', score: 100.3 },
    { month: 'Dec', score: 103.8 },
    { month: 'Jan', score: 105.2 },
    { month: 'Feb', score: 105.2 },
    { month: 'Mar', score: 108.4 },
  ],
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
  },
};

const mockCriteria = (epiScore: number) => ({
  sqaaScore: Math.min(5, epiScore / 25),
  scsaScore: Math.min(5, epiScore / 28),
  workplaceRelationsScore: null as number | null,
  productivityRate: null as number | null,
  cashierAccuracyRate: Math.min(100, epiScore * 0.85),
  attendanceRate: Math.min(100, epiScore * 0.82),
  aov: Math.round(epiScore * 2.2),
  branchAov: 230,
  violationCount: 0,
  awardCount: 0,
});

export const MOCK_LEADERBOARD: LeaderboardEntry[] = [
  { id: '1', rank: 1, firstName: 'Maria', lastName: 'Santos', avatarUrl: null, epiScore: 124.1, isCurrentUser: false, criteria: mockCriteria(124.1) },
  { id: '2', rank: 2, firstName: 'Juan', lastName: 'Dela Cruz', avatarUrl: null, epiScore: 119.7, isCurrentUser: false, criteria: mockCriteria(119.7) },
  { id: '3', rank: 3, firstName: 'Ana', lastName: 'Reyes', avatarUrl: null, epiScore: 116.3, isCurrentUser: false, criteria: mockCriteria(116.3) },
  { id: '4', rank: 4, firstName: 'Pedro', lastName: 'Garcia', avatarUrl: null, epiScore: 114.8, isCurrentUser: false, criteria: mockCriteria(114.8) },
  { id: '5', rank: 5, firstName: 'Rosa', lastName: 'Flores', avatarUrl: null, epiScore: 113.2, isCurrentUser: false, criteria: mockCriteria(113.2) },
  { id: '6', rank: 6, firstName: 'Carlos', lastName: 'Lopez', avatarUrl: null, epiScore: 110.9, isCurrentUser: false, criteria: mockCriteria(110.9) },
  { id: '7', rank: 7, firstName: 'You', lastName: '', avatarUrl: null, epiScore: 108.4, isCurrentUser: true, criteria: MOCK_EPI_DATA.criteria },
  { id: '8', rank: 8, firstName: 'Liza', lastName: 'Cruz', avatarUrl: null, epiScore: 106.1, isCurrentUser: false, criteria: mockCriteria(106.1) },
  { id: '9', rank: 9, firstName: 'Ramon', lastName: 'Torres', avatarUrl: null, epiScore: 104.5, isCurrentUser: false, criteria: mockCriteria(104.5) },
  { id: '10', rank: 10, firstName: 'Elena', lastName: 'Ramos', avatarUrl: null, epiScore: 102.8, isCurrentUser: false, criteria: mockCriteria(102.8) },
  { id: '11', rank: 11, firstName: 'Jose', lastName: 'Morales', avatarUrl: null, epiScore: 99.4, isCurrentUser: false, criteria: mockCriteria(99.4) },
  { id: '12', rank: 12, firstName: 'Grace', lastName: 'Rivera', avatarUrl: null, epiScore: 97.3, isCurrentUser: false, criteria: mockCriteria(97.3) },
];
