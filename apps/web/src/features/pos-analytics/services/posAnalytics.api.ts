import { api } from '@/shared/services/api.client';

export type PosAnalyticsGranularity = 'day' | 'week' | 'month';

export interface PosAnalyticsRangeSelection {
  granularity: PosAnalyticsGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface PosAnalyticsSelectedBranch {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  odooCompanyId: number;
}

export interface PosSessionDetail {
  sessionName: string;
  branchId: string;
  branchName: string;
  companyId: number;
  startAt: string;
  stopAt: string | null;
  state: 'opened' | 'closed';
  openingCash: number;
  expectedClosingCash: number;
  actualClosingCash: number;
  cashVariance: number;
  netSales: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  transactionCount: number;
  durationMinutes: number | null;
  paymentBreakdown: Array<{ method: string; amount: number }>;
  topRefundedProducts: Array<{ product: string; total: number; count: number }>;
}

export interface PosAnalyticsSnapshot {
  totalSessions: number;
  netSales: number;
  grossSales: number;
  discounts: number;
  refunds: number;
  avgSalesPerSession: number;
  openingCash: number;
  expectedClosingCash: number;
  actualClosingCash: number;
  cashVariance: number;
  totalTransactions: number;
  avgTransactionsPerSession: number;
  avgDurationMinutes: number;
  paymentBreakdown: Array<{ method: string; amount: number }>;
  topRefundedProducts: Array<{ product: string; total: number; count: number }>;
}

export interface PosAnalyticsBucket extends PosAnalyticsSnapshot {
  key: string;
  label: string;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface PosAnalyticsResult {
  selection: {
    currentRange: PosAnalyticsRangeSelection;
    previousRange: PosAnalyticsRangeSelection;
  };
  selectedBranches: PosAnalyticsSelectedBranch[];
  current: PosAnalyticsSnapshot;
  previousPeriod: PosAnalyticsSnapshot;
  currentBuckets: PosAnalyticsBucket[];
  sessions: PosSessionDetail[];
  branchComparison: Array<{
    branch: PosAnalyticsSelectedBranch;
    current: PosAnalyticsSnapshot;
    previousPeriod: PosAnalyticsSnapshot;
  }>;
}

export async function fetchPosAnalytics(input: {
  granularity: PosAnalyticsGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
  branchIds: string[];
}): Promise<PosAnalyticsResult> {
  const res = await api.get<{ success: boolean; data: PosAnalyticsResult }>(
    '/pos-analytics',
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
