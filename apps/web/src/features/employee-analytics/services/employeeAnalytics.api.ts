import { api } from '@/shared/services/api.client';

export type RollingMetricId =
  | 'workplace-relations'
  | 'attendance-rate'
  | 'punctuality-rate'
  | 'productivity-rate'
  | 'average-order-value'
  | 'uniform-compliance'
  | 'hygiene-compliance'
  | 'sop-compliance'
  | 'customer-interaction'
  | 'cashiering'
  | 'suggestive-selling-and-upselling'
  | 'service-efficiency';

export type EmployeeAnalyticsMetricId = RollingMetricId | 'professional-conduct';

export interface EmployeeMetricDailySnapshot {
  userId: string;
  fullName: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
  snapshotDate: string;
  windowStartDate: string;
  windowEndDate: string;
  workplaceRelationsScore: number | null;
  attendanceRate: number | null;
  punctualityRate: number | null;
  productivityRate: number | null;
  averageOrderValue: number | null;
  branchAov: number | null;
  uniformComplianceRate: number | null;
  hygieneComplianceRate: number | null;
  sopComplianceRate: number | null;
  customerInteractionScore: number | null;
  cashieringScore: number | null;
  suggestiveSellingAndUpsellingScore: number | null;
  serviceEfficiencyScore: number | null;
  epiScore: number | null;
  awardsCount: number;
  awardsTotalIncrease: number;
  violationsCount: number;
  generatedAt: string;
  calculationVersion: string;
}

export interface MetricEventResponse {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

export async function fetchEmployeeMetricSnapshots(input: {
  rangeStartYmd: string;
  rangeEndYmd: string;
  userId?: string | null;
}): Promise<EmployeeMetricDailySnapshot[]> {
  const res = await api.get<{ success: boolean; data: EmployeeMetricDailySnapshot[] }>(
    '/dashboard/employee-analytics/metric-snapshots',
    {
      params: {
        rangeStartYmd: input.rangeStartYmd,
        rangeEndYmd: input.rangeEndYmd,
        ...(input.userId ? { userId: input.userId } : {}),
      },
    },
  );
  return res.data.data ?? [];
}

export async function fetchEmployeeMetricEvents(input: {
  userId: string;
  metricId: RollingMetricId;
  rangeStartYmd: string;
  rangeEndYmd: string;
  page?: number;
  pageSize?: number;
}): Promise<MetricEventResponse> {
  const res = await api.get<{ success: boolean; data: MetricEventResponse }>(
    '/dashboard/employee-analytics/metric-events',
    {
      params: {
        userId: input.userId,
        metricId: input.metricId,
        rangeStartYmd: input.rangeStartYmd,
        rangeEndYmd: input.rangeEndYmd,
        page: input.page ?? 1,
        pageSize: input.pageSize ?? 25,
      },
    },
  );
  return res.data.data ?? { rows: [], total: 0, page: 1, pageSize: input.pageSize ?? 25 };
}
