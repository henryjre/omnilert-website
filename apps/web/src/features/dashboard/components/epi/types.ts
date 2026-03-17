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
  uniformComplianceRate: number | null;
  hygieneComplianceRate: number | null;
  sopComplianceRate: number | null;
}

export interface EpiMonthEntry {
  month: string;       // Short label: "Jan", "Feb", etc.
  year: number;        // e.g. 2025, 2026
  score: number;
  criteria: EpiCriteria;
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
  /** Full 12-month history, same order as EpiDashboardData.history */
  history: EpiMonthEntry[];
}

export type EpiZone = 'green' | 'amber' | 'red';
