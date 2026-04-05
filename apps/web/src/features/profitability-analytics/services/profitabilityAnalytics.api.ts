import { api } from '@/shared/services/api.client';
import type { AnalyticsGranularity } from '@/features/employee-analytics/utils/analyticsRangeBuckets';

export interface ProfitabilitySelectionRange {
  granularity: AnalyticsGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface ProfitabilitySelectedBranch {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  odooCompanyId: number;
}

export interface ProfitabilitySnapshot {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  variableExpenses: number;
  grossSalary: number;
  operatingProfit: number;
  overheadExpenses: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  expenseRatio: number;
  overheadSource: 'actual' | 'estimated';
  netProfitSource: 'actual' | 'estimated';
}

export interface ProfitabilityBucketSnapshot extends ProfitabilitySnapshot {
  key: string;
  label: string;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface ProfitabilityAnalyticsResult {
  selection: {
    currentRange: ProfitabilitySelectionRange;
    previousRange: ProfitabilitySelectionRange;
  };
  selectedBranches: ProfitabilitySelectedBranch[];
  current: ProfitabilitySnapshot;
  previousPeriod: ProfitabilitySnapshot;
  currentBuckets: ProfitabilityBucketSnapshot[];
  branchComparison: Array<{
    branch: ProfitabilitySelectedBranch;
    current: ProfitabilitySnapshot;
    previousPeriod: ProfitabilitySnapshot;
  }>;
}

export async function fetchProfitabilityAnalytics(input: {
  granularity: AnalyticsGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
  branchIds: string[];
}): Promise<ProfitabilityAnalyticsResult> {
  const res = await api.get<{ success: boolean; data: ProfitabilityAnalyticsResult }>(
    '/profitability-analytics',
    {
      params: {
        granularity: input.granularity,
        rangeStartYmd: input.rangeStartYmd,
        rangeEndYmd: input.rangeEndYmd,
        branchIds: input.branchIds.join(','),
      },
    },
  );

  return res.data.data;
}

