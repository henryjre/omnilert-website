export interface EpiCriteria {
  sqaaScore: number | null;
  scsaScore: number | null;
  workplaceRelationsScore: number | null;
  productivityRate: number | null;
  cashierAccuracyRate: number | null;
  attendanceRate: number | null;
  aov: number | null;
  branchAov: number | null;
  violationCount: number;
  awardCount: number;
}

export interface EpiMonthEntry {
  month: string;
  score: number;
}

export interface EpiDashboardData {
  epiScore: number;
  epiDelta: number;
  currentMonth: string;
  goalTarget: number;
  history: EpiMonthEntry[];
  criteria: EpiCriteria;
}

export interface LeaderboardEntry {
  id: string;
  rank: number;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  epiScore: number;
  isCurrentUser: boolean;
  criteria: EpiCriteria;
}

export type EpiZone = 'green' | 'amber' | 'red';
