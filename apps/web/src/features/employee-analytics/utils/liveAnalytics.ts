import type { EmployeeMetricDailySnapshot, EmployeeAnalyticsMetricId, RollingMetricId } from '../services/employeeAnalytics.api';
import {
  type AnalyticsRangeSelection,
  eachBucketInRange,
  formatComparisonPeriodCaption,
  fromLocalYmd,
  normalizeRange,
  toLocalYmd,
} from './analyticsRangeBuckets';

export const SUPPORTED_ROLLING_METRIC_IDS: readonly RollingMetricId[] = [
  'customer-service',
  'workplace-relations',
  'attendance-rate',
  'punctuality-rate',
  'productivity-rate',
  'average-order-value',
  'uniform-compliance',
  'hygiene-compliance',
  'sop-compliance',
] as const;

type SnapshotMetricField =
  | 'customerServiceScore'
  | 'workplaceRelationsScore'
  | 'attendanceRate'
  | 'punctualityRate'
  | 'productivityRate'
  | 'averageOrderValue'
  | 'uniformComplianceRate'
  | 'hygieneComplianceRate'
  | 'sopComplianceRate'
  | 'epiScore';

const SNAPSHOT_METRIC_FIELD_BY_ID: Record<Exclude<EmployeeAnalyticsMetricId, 'professional-conduct'> | 'epi-score', SnapshotMetricField> = {
  'customer-service': 'customerServiceScore',
  'workplace-relations': 'workplaceRelationsScore',
  'attendance-rate': 'attendanceRate',
  'punctuality-rate': 'punctualityRate',
  'productivity-rate': 'productivityRate',
  'average-order-value': 'averageOrderValue',
  'uniform-compliance': 'uniformComplianceRate',
  'hygiene-compliance': 'hygieneComplianceRate',
  'sop-compliance': 'sopComplianceRate',
  'epi-score': 'epiScore',
};

export interface NormalizedEmployeeMetricDailySnapshot extends Omit<EmployeeMetricDailySnapshot,
  | 'customerServiceScore'
  | 'workplaceRelationsScore'
  | 'attendanceRate'
  | 'punctualityRate'
  | 'productivityRate'
  | 'averageOrderValue'
  | 'branchAov'
  | 'uniformComplianceRate'
  | 'hygieneComplianceRate'
  | 'sopComplianceRate'
  | 'epiScore'
  | 'awardsCount'
  | 'violationsCount'
> {
  customerServiceScore: number | null;
  workplaceRelationsScore: number | null;
  attendanceRate: number | null;
  punctualityRate: number | null;
  productivityRate: number | null;
  averageOrderValue: number | null;
  branchAov: number | null;
  uniformComplianceRate: number | null;
  hygieneComplianceRate: number | null;
  sopComplianceRate: number | null;
  epiScore: number | null;
  awardsCount: number;
  violationsCount: number;
}

export interface AnalyticsBucketWindow {
  key: string;
  label: string;
  startYmd: string;
  endYmd: string;
  pointYmd: string;
}

export interface LiveAnalyticsUser {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  roleName: string;
}

export interface MetricEmployeeRow {
  userId: string;
  name: string;
  role: string;
  value: number;
  startValue: number;
  endValue: number;
  periodChange: number;
}

export interface LiveAnalyticsDataset {
  range: AnalyticsRangeSelection;
  bucketWindows: AnalyticsBucketWindow[];
  users: LiveAnalyticsUser[];
  userIdByName: Map<string, string>;
  rowsByUserId: Map<string, NormalizedEmployeeMetricDailySnapshot[]>;
  endpointRowByUserAndBucket: Map<string, Map<string, NormalizedEmployeeMetricDailySnapshot | null>>;
  rangeTotalsByUserId: Map<string, { awards: number; violations: number }>;
  latestRowByUserId: Map<string, NormalizedEmployeeMetricDailySnapshot | null>;
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function normalizeYmd(value: unknown): string {
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return toLocalYmd(parsed);
    }
    const maybeYmd = value.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(maybeYmd)) {
      return maybeYmd;
    }
    return '';
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : toLocalYmd(value);
  }

  return '';
}

export function normalizeSnapshotRows(rows: EmployeeMetricDailySnapshot[]): NormalizedEmployeeMetricDailySnapshot[] {
  return rows.map((row) => ({
    ...row,
    snapshotDate: normalizeYmd(row.snapshotDate),
    windowStartDate: normalizeYmd(row.windowStartDate),
    windowEndDate: normalizeYmd(row.windowEndDate),
    customerServiceScore: toNumber(row.customerServiceScore),
    workplaceRelationsScore: toNumber(row.workplaceRelationsScore),
    attendanceRate: toNumber(row.attendanceRate),
    punctualityRate: toNumber(row.punctualityRate),
    productivityRate: toNumber(row.productivityRate),
    averageOrderValue: toNumber(row.averageOrderValue),
    branchAov: toNumber(row.branchAov),
    uniformComplianceRate: toNumber(row.uniformComplianceRate),
    hygieneComplianceRate: toNumber(row.hygieneComplianceRate),
    sopComplianceRate: toNumber(row.sopComplianceRate),
    epiScore: toNumber(row.epiScore),
    awardsCount: toInteger(row.awardsCount),
    violationsCount: toInteger(row.violationsCount),
  }));
}

function formatYmd(date: Date): string {
  return toLocalYmd(date);
}

function addDays(ymd: string, days: number): string {
  const base = fromLocalYmd(ymd);
  base.setDate(base.getDate() + days);
  return formatYmd(base);
}

function monthBounds(monthKey: string): { startYmd: string; endYmd: string } {
  const [yearPart, monthPart] = monthKey.split('-');
  const year = Number(yearPart);
  const month = Number(monthPart);
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { startYmd: formatYmd(start), endYmd: formatYmd(end) };
}

function yearBounds(yearKey: string): { startYmd: string; endYmd: string } {
  const year = Number(yearKey);
  const start = new Date(year, 0, 1, 0, 0, 0, 0);
  const end = new Date(year, 11, 31, 23, 59, 59, 999);
  return { startYmd: formatYmd(start), endYmd: formatYmd(end) };
}

export function buildBucketWindows(selection: AnalyticsRangeSelection): AnalyticsBucketWindow[] {
  const normalized = normalizeRange(selection);
  const buckets = eachBucketInRange(normalized);

  return buckets.map((bucket) => {
    if (normalized.granularity === 'day') {
      return {
        key: bucket.key,
        label: bucket.label,
        startYmd: bucket.key,
        endYmd: bucket.key,
        pointYmd: bucket.key,
      };
    }

    if (normalized.granularity === 'week') {
      const startYmd = bucket.key;
      const endYmd = addDays(startYmd, 6);
      return {
        key: bucket.key,
        label: bucket.label,
        startYmd,
        endYmd,
        pointYmd: endYmd,
      };
    }

    if (normalized.granularity === 'month') {
      const { startYmd, endYmd } = monthBounds(bucket.key);
      return {
        key: bucket.key,
        label: bucket.label,
        startYmd,
        endYmd,
        pointYmd: endYmd,
      };
    }

    const { startYmd, endYmd } = yearBounds(bucket.key);
    return {
      key: bucket.key,
      label: bucket.label,
      startYmd,
      endYmd,
      pointYmd: endYmd,
    };
  });
}

function pickBucketEndpointRow(
  rows: NormalizedEmployeeMetricDailySnapshot[],
  bucket: AnalyticsBucketWindow,
): NormalizedEmployeeMetricDailySnapshot | null {
  if (rows.length === 0) return null;
  const candidates = rows.filter((row) => row.snapshotDate >= bucket.startYmd && row.snapshotDate <= bucket.endYmd);
  if (candidates.length === 0) {
    return null;
  }

  const exact = candidates.find((row) => row.snapshotDate === bucket.pointYmd);
  if (exact) return exact;

  return candidates[candidates.length - 1] ?? null;
}

function sumRangeTotals(
  rows: NormalizedEmployeeMetricDailySnapshot[],
  rangeStartYmd: string,
  rangeEndYmd: string,
): { awards: number; violations: number } {
  const relevant = rows.filter((row) => row.snapshotDate >= rangeStartYmd && row.snapshotDate <= rangeEndYmd);
  return {
    awards: relevant.reduce((sum, row) => sum + row.awardsCount, 0),
    violations: relevant.reduce((sum, row) => sum + row.violationsCount, 0),
  };
}

export function buildLiveAnalyticsDataset(
  selection: AnalyticsRangeSelection,
  rows: EmployeeMetricDailySnapshot[],
): LiveAnalyticsDataset {
  const normalizedRange = normalizeRange(selection);
  const normalizedRows = normalizeSnapshotRows(rows).sort((a, b) => {
    if (a.userId !== b.userId) {
      return a.userId.localeCompare(b.userId);
    }
    return a.snapshotDate.localeCompare(b.snapshotDate);
  });
  const bucketWindows = buildBucketWindows(normalizedRange);

  const userMap = new Map<string, LiveAnalyticsUser>();
  const rowsByUserId = new Map<string, NormalizedEmployeeMetricDailySnapshot[]>();

  for (const row of normalizedRows) {
    if (!userMap.has(row.userId)) {
      userMap.set(row.userId, {
        id: row.userId,
        name: row.fullName?.trim() || `${row.firstName} ${row.lastName}`.trim() || row.userId,
        firstName: row.firstName?.trim() || '',
        lastName: row.lastName?.trim() || '',
        avatarUrl: row.avatarUrl ?? null,
        roleName: row.roleName?.trim() || 'Service Crew',
      });
    }

    const existing = rowsByUserId.get(row.userId) ?? [];
    existing.push(row);
    rowsByUserId.set(row.userId, existing);
  }

  const users = Array.from(userMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  const userIdByName = new Map(users.map((user) => [user.name, user.id]));

  const endpointRowByUserAndBucket = new Map<string, Map<string, NormalizedEmployeeMetricDailySnapshot | null>>();
  const rangeTotalsByUserId = new Map<string, { awards: number; violations: number }>();
  const latestRowByUserId = new Map<string, NormalizedEmployeeMetricDailySnapshot | null>();

  for (const user of users) {
    const userRows = rowsByUserId.get(user.id) ?? [];
    const endpointByBucket = new Map<string, NormalizedEmployeeMetricDailySnapshot | null>();

    for (const bucket of bucketWindows) {
      endpointByBucket.set(bucket.key, pickBucketEndpointRow(userRows, bucket));
    }

    endpointRowByUserAndBucket.set(user.id, endpointByBucket);
    rangeTotalsByUserId.set(
      user.id,
      sumRangeTotals(userRows, normalizedRange.rangeStartYmd, normalizedRange.rangeEndYmd),
    );
    latestRowByUserId.set(user.id, userRows[userRows.length - 1] ?? null);
  }

  return {
    range: normalizedRange,
    bucketWindows,
    users,
    userIdByName,
    rowsByUserId,
    endpointRowByUserAndBucket,
    rangeTotalsByUserId,
    latestRowByUserId,
  };
}

export function isMetricSupported(metricId: EmployeeAnalyticsMetricId): metricId is RollingMetricId {
  return (SUPPORTED_ROLLING_METRIC_IDS as readonly string[]).includes(metricId);
}

function readMetricValue(
  row: NormalizedEmployeeMetricDailySnapshot | null | undefined,
  metricId: Exclude<EmployeeAnalyticsMetricId, 'professional-conduct'> | 'epi-score',
): number | null {
  if (!row) return null;
  const field = SNAPSHOT_METRIC_FIELD_BY_ID[metricId];
  const value = row[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getSeriesForUser(
  dataset: LiveAnalyticsDataset,
  userId: string,
  metricId: Exclude<EmployeeAnalyticsMetricId, 'professional-conduct'> | 'epi-score',
): Array<{ key: string; label: string; value: number | null }> {
  const endpointByBucket = dataset.endpointRowByUserAndBucket.get(userId);
  return dataset.bucketWindows.map((bucket) => {
    const endpoint = endpointByBucket?.get(bucket.key) ?? null;
    return {
      key: bucket.key,
      label: bucket.label,
      value: readMetricValue(endpoint, metricId),
    };
  });
}

export function getGlobalSeries(
  dataset: LiveAnalyticsDataset,
  metricId: Exclude<EmployeeAnalyticsMetricId, 'professional-conduct'> | 'epi-score',
): Array<{ key: string; label: string; value: number | null }> {
  return dataset.bucketWindows.map((bucket) => {
    const values = dataset.users
      .map((user) => readMetricValue(dataset.endpointRowByUserAndBucket.get(user.id)?.get(bucket.key), metricId))
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const mean = values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    return {
      key: bucket.key,
      label: bucket.label,
      value: mean === null ? null : Math.round(mean * 100) / 100,
    };
  });
}

function firstAndLastFinite(values: Array<number | null>): { first: number | null; last: number | null } {
  const finite = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (finite.length === 0) {
    return { first: null, last: null };
  }
  return {
    first: finite[0] ?? null,
    last: finite[finite.length - 1] ?? null,
  };
}

export function getMetricEmployeeRows(
  dataset: LiveAnalyticsDataset,
  metricId: EmployeeAnalyticsMetricId,
): MetricEmployeeRow[] {
  if (metricId === 'professional-conduct') {
    return dataset.users.map((user) => ({
      userId: user.id,
      name: user.name,
      role: user.roleName,
      value: 0,
      startValue: 0,
      endValue: 0,
      periodChange: 0,
    }));
  }

  return dataset.users
    .map((user) => {
      const series = getSeriesForUser(dataset, user.id, metricId).map((point) => point.value);
      const { first, last } = firstAndLastFinite(series);
      const startValue = first ?? 0;
      const endValue = last ?? 0;
      const periodChange = endValue - startValue;

      return {
        userId: user.id,
        name: user.name,
        role: user.roleName,
        value: endValue,
        startValue,
        endValue,
        periodChange,
      };
    })
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
}

export function getLeaderboardByLatestEpi(
  dataset: LiveAnalyticsDataset,
): Array<{ userId: string; name: string; epi: number }> {
  return dataset.users
    .map((user) => ({
      userId: user.id,
      name: user.name,
      epi: readMetricValue(dataset.latestRowByUserId.get(user.id), 'epi-score') ?? 0,
    }))
    .sort((a, b) => b.epi - a.epi || a.name.localeCompare(b.name));
}

export function buildMetricComparisonRows(
  dataset: LiveAnalyticsDataset,
  userNames: string[],
  metricId: EmployeeAnalyticsMetricId,
): Array<Record<string, string | number | null>> {
  const validUsers = userNames
    .map((name) => ({ name, userId: dataset.userIdByName.get(name) }))
    .filter((entry): entry is { name: string; userId: string } => Boolean(entry.userId));

  if (metricId === 'professional-conduct') {
    return dataset.bucketWindows.map((bucket) => ({ date: bucket.label }));
  }

  return dataset.bucketWindows.map((bucket) => {
    const row: Record<string, string | number | null> = { date: bucket.label };
    for (const user of validUsers) {
      const endpoint = dataset.endpointRowByUserAndBucket.get(user.userId)?.get(bucket.key) ?? null;
      row[user.name] = readMetricValue(endpoint, metricId);
    }
    return row;
  });
}

export function buildPersonalMetricRows(
  dataset: LiveAnalyticsDataset,
  userId: string,
  metricId: EmployeeAnalyticsMetricId,
): Array<Record<string, string | number | null>> {
  if (metricId === 'professional-conduct') {
    return dataset.bucketWindows.map((bucket) => ({ date: bucket.label, 'Global Avg': null }));
  }

  const user = dataset.users.find((entry) => entry.id === userId);
  if (!user) {
    return [];
  }

  const userSeries = getSeriesForUser(dataset, userId, metricId);
  const globalSeries = getGlobalSeries(dataset, metricId);

  return dataset.bucketWindows.map((bucket, index) => ({
    date: bucket.label,
    [user.name]: userSeries[index]?.value ?? null,
    'Global Avg': globalSeries[index]?.value ?? null,
  }));
}

export function buildPersonalEpiSeries(
  dataset: LiveAnalyticsDataset,
  userId: string,
): {
  displayEpi: number;
  epiDelta: number;
  comparisonCaption: string;
  trendFooter: string;
  globalAvgDisplay: number;
  chartData: Array<{ label: string; epi: number; globalAvg: number }>;
} | null {
  const user = dataset.users.find((entry) => entry.id === userId);
  if (!user) return null;

  const userSeries = getSeriesForUser(dataset, userId, 'epi-score');
  const globalSeries = getGlobalSeries(dataset, 'epi-score');
  const rawUserValues = userSeries.map((point) => point.value);
  const rawGlobalValues = globalSeries.map((point) => point.value);

  const chartData = dataset.bucketWindows.map((bucket, index) => ({
    label: bucket.label,
    epi: rawUserValues[index] ?? 0,
    globalAvg: rawGlobalValues[index] ?? 0,
  }));

  const { first, last } = firstAndLastFinite(rawUserValues);
  const globalValues = rawGlobalValues.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  const firstValue = first ?? 0;
  const lastValue = last ?? firstValue;
  const globalAvgDisplay = globalValues[globalValues.length - 1] ?? 0;
  const displayEpi = lastValue;
  const epiDelta = lastValue - firstValue;
  const bucketCount = Math.max(1, dataset.bucketWindows.length);
  const unit = dataset.range.granularity === 'day'
    ? 'day'
    : dataset.range.granularity === 'week'
      ? 'week'
      : dataset.range.granularity === 'month'
        ? 'month'
        : 'year';

  return {
    displayEpi: Math.round(displayEpi * 10) / 10,
    epiDelta: Math.round(epiDelta * 10) / 10,
    comparisonCaption: formatComparisonPeriodCaption(dataset.range),
    trendFooter: `${bucketCount}-${unit} trend`,
    globalAvgDisplay: Math.round(globalAvgDisplay * 10) / 10,
    chartData,
  };
}

export function getGlobalRangeTotals(dataset: LiveAnalyticsDataset): { awards: number; violations: number } {
  let awards = 0;
  let violations = 0;
  for (const totals of dataset.rangeTotalsByUserId.values()) {
    awards += totals.awards;
    violations += totals.violations;
  }
  return { awards, violations };
}

export function getUserRangeTotals(
  dataset: LiveAnalyticsDataset,
  userId: string,
): { awards: number; violations: number } {
  return dataset.rangeTotalsByUserId.get(userId) ?? { awards: 0, violations: 0 };
}

export function getLatestSnapshotDateForUser(
  dataset: LiveAnalyticsDataset,
  userId: string,
): string | null {
  return dataset.latestRowByUserId.get(userId)?.snapshotDate ?? null;
}

export function getLatestSnapshotDate(dataset: LiveAnalyticsDataset): string | null {
  let latest: string | null = null;
  for (const row of dataset.latestRowByUserId.values()) {
    if (!row) continue;
    if (!latest || row.snapshotDate > latest) {
      latest = row.snapshotDate;
    }
  }
  return latest;
}

export function getLatestUserBranchAov(
  dataset: LiveAnalyticsDataset,
  userId: string,
): number | null {
  const value = dataset.latestRowByUserId.get(userId)?.branchAov;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getLatestGlobalMetricAverage(
  dataset: LiveAnalyticsDataset,
  metricId: Exclude<EmployeeAnalyticsMetricId, 'professional-conduct'> | 'epi-score',
): number | null {
  const series = getGlobalSeries(dataset, metricId);
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const value = series[i]?.value;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}
