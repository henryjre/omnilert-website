export interface EpiCriteria {
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
  customerInteractionScore: number | null;
  cashieringScore: number | null;
  suggestiveSellingUpsellingScore: number | null;
  serviceEfficiencyScore: number | null;
}

export interface WrsStatusSummary {
  effectiveCount: number;
  delayedCount: number;
}

export interface EpiMonthEntry {
  monthKey: string;
  month: string;
  year: number;
  score: number;
  criteria: EpiCriteria;
  source: 'live' | 'historical';
  wrsStatus?: WrsStatusSummary | null;
}

export interface EpiDashboardData {
  officialEpiScore: number;
  goalTarget: number;
  currentMonthKey: string;
  history: EpiMonthEntry[];
  globalAverageByMonth: Record<string, number>;
}

export interface LeaderboardSummaryEntry {
  id: string;
  rank: number;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  monthKey: string;
  displayEpiScore: number | null;
  hasData: boolean;
  isCurrentUser: boolean;
}

export interface LeaderboardDetailEntry {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  monthKey: string;
  epiScore: number | null;
  projectedEpiScore: number | null;
  hasData: boolean;
  criteria: EpiCriteria;
  wrsStatus?: WrsStatusSummary | null;
  asOfDateTime: string | null;
  scoreSource: 'official' | 'historical';
  criteriaSource: 'live' | 'historical';
}

export type EpiZone = 'green' | 'amber' | 'red';
