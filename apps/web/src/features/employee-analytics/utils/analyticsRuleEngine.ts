import type { AnalyticsRangeSelection } from "./analyticsRangeBuckets";

export type MetricKind = "epi" | "likert" | "percentage" | "monetary";
export type MetricBand = "high" | "good" | "mid" | "low";

export interface MetricDefinition {
  id: string;
  label: string;
  kind: Exclude<MetricKind, "epi">;
  highMin: number;
  midMin: number;
}

export interface RuleInsight {
  id: string;
  category: string;
  severity: "success" | "warning" | "info";
  subject: string;
  message: string;
  supportingData?: Record<string, number | string>;
}

export interface GeneralKeyInsightAlert {
  id: number;
  employee: string;
  message: string;
  type: "warning" | "success";
  metric: string;
}

export interface PersonalKeyInsightRow {
  type: "strength" | "improving" | "attention";
  metric: string;
  message: string;
}

export interface MetricInsightItem {
  type: "success" | "warning" | "info";
  title: string;
  message: string;
}

export interface EmployeeValuePoint {
  name: string;
  value: number;
  previousValue: number;
}

export interface GlobalInsightsInput {
  selection: AnalyticsRangeSelection;
  globalEpiCurrent: number;
  globalEpiPrevious: number;
  employeeEpi: Array<{ name: string; epi: number }>;
  metricRowsByMetric: Record<string, EmployeeValuePoint[]>;
  metricBenchmarksByMetric?: Record<string, number>;
}

export interface EmployeeInsightsInput {
  selection: AnalyticsRangeSelection;
  employeeName: string;
  metricRowsByMetric: Record<string, EmployeeValuePoint[]>;
  metricBenchmarksByMetric?: Record<string, number>;
}

export interface MetricInsightsInput {
  selection: AnalyticsRangeSelection;
  metricId: string;
  metricLabel: string;
  benchmarkValue: number;
  employeeRows: EmployeeValuePoint[];
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  "workplace-relations": {
    id: "workplace-relations",
    label: "Workplace Relations Score",
    kind: "likert",
    highMin: 4.0,
    midMin: 3.6,
  },
  "professional-conduct": {
    id: "professional-conduct",
    label: "Professional Conduct Score",
    kind: "likert",
    highMin: 4.2,
    midMin: 3.8,
  },
  "attendance-rate": {
    id: "attendance-rate",
    label: "Attendance Rate",
    kind: "percentage",
    highMin: 95,
    midMin: 92,
  },
  "punctuality-rate": {
    id: "punctuality-rate",
    label: "Punctuality Rate",
    kind: "percentage",
    highMin: 95,
    midMin: 92,
  },
  "productivity-rate": {
    id: "productivity-rate",
    label: "Productivity Rate",
    kind: "percentage",
    highMin: 90,
    midMin: 85,
  },
  "uniform-compliance": {
    id: "uniform-compliance",
    label: "Uniform Compliance",
    kind: "percentage",
    highMin: 95,
    midMin: 92,
  },
  "hygiene-compliance": {
    id: "hygiene-compliance",
    label: "Hygiene Compliance",
    kind: "percentage",
    highMin: 95,
    midMin: 92,
  },
  "sop-compliance": {
    id: "sop-compliance",
    label: "SOP Compliance",
    kind: "percentage",
    highMin: 95,
    midMin: 92,
  },
  "average-order-value": {
    id: "average-order-value",
    label: "Average Order Value",
    kind: "monetary",
    highMin: 100,
    midMin: 90,
  },
  "customer-interaction": {
    id: "customer-interaction",
    label: "Customer Interaction",
    kind: "likert",
    highMin: 4.0,
    midMin: 3.6,
  },
  "cashiering": {
    id: "cashiering",
    label: "Cashiering",
    kind: "likert",
    highMin: 4.0,
    midMin: 3.6,
  },
  "suggestive-selling-and-upselling": {
    id: "suggestive-selling-and-upselling",
    label: "Suggestive Selling & Upselling",
    kind: "likert",
    highMin: 4.0,
    midMin: 3.6,
  },
  "service-efficiency": {
    id: "service-efficiency",
    label: "Service Efficiency",
    kind: "likert",
    highMin: 4.0,
    midMin: 3.6,
  },
};

const NORMALIZATION_MAX: Record<MetricKind, number> = {
  epi: 100,
  likert: 5,
  percentage: 100,
  monetary: 1,
};

export function getMetricDefinition(metricId: string): MetricDefinition {
  return (
    METRIC_DEFINITIONS[metricId] ?? {
      id: metricId,
      label: metricId,
      kind: "percentage",
      highMin: 95,
      midMin: 92,
    }
  );
}

export function getMetricKind(metricId: string): MetricKind {
  if (metricId === "epi") {
    return "epi";
  }
  return getMetricDefinition(metricId).kind;
}

export function isLikertMetric(metricId: string): boolean {
  return getMetricKind(metricId) === "likert";
}

export function getMetricScaleMax(metricId: string): number {
  const kind = getMetricKind(metricId);
  return NORMALIZATION_MAX[kind] ?? 100;
}

function bucketUnitLabel(selection: AnalyticsRangeSelection, count: number): string {
  const { granularity } = selection;
  if (granularity === "day") return count === 1 ? "day" : "days";
  if (granularity === "week") return count === 1 ? "week" : "weeks";
  if (granularity === "month") return count === 1 ? "month" : "months";
  return count === 1 ? "year" : "years";
}

function parseYmd(ymd: string): Date {
  const [year, month, day] = ymd.split("-").map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    year === undefined ||
    month === undefined ||
    day === undefined
  ) {
    return new Date(0);
  }
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function toStartOfDay(input: Date): Date {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfWeekMonday(input: Date): Date {
  const d = toStartOfDay(input);
  const day = d.getDay();
  const offsetFromMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offsetFromMonday);
  return d;
}

function getSelectionBucketCount(selection: AnalyticsRangeSelection): number {
  const a = toStartOfDay(parseYmd(selection.rangeStartYmd));
  const b = toStartOfDay(parseYmd(selection.rangeEndYmd));
  const start = a.getTime() <= b.getTime() ? a : b;
  const end = a.getTime() <= b.getTime() ? b : a;
  const msPerDay = 24 * 60 * 60 * 1000;

  if (selection.granularity === "day") {
    return Math.max(1, Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1);
  }

  if (selection.granularity === "week") {
    const startMonday = startOfWeekMonday(start);
    const endMonday = startOfWeekMonday(end);
    return Math.max(1, Math.floor((endMonday.getTime() - startMonday.getTime()) / (7 * msPerDay)) + 1);
  }

  if (selection.granularity === "month") {
    const startMonth = start.getFullYear() * 12 + start.getMonth();
    const endMonth = end.getFullYear() * 12 + end.getMonth();
    return Math.max(1, endMonth - startMonth + 1);
  }

  return Math.max(1, end.getFullYear() - start.getFullYear() + 1);
}

export function getComparisonReferenceLabel(selection: AnalyticsRangeSelection): string {
  const bucketCount = getSelectionBucketCount(selection);
  const unit = bucketUnitLabel(selection, bucketCount);
  return `the selected ${bucketCount} ${unit} range`;
}

export function formatInsightsPeriodSubtitle(selection: AnalyticsRangeSelection): string {
  return `Within ${getComparisonReferenceLabel(selection)}`;
}

export function classifyEpiBand(userEpiScore: number, globalAverageEpi: number): MetricBand {
  const baseline =
    Number.isFinite(globalAverageEpi) && globalAverageEpi > 0 ? globalAverageEpi : 100;
  const percentChange = ((userEpiScore - baseline) / baseline) * 100;
  if (percentChange >= 50) return "high";
  if (percentChange >= 0) return "good";
  if (percentChange >= -25) return "mid";
  return "low";
}

export function classifyMetricBand(
  metricId: string,
  value: number,
  benchmarkForAov?: number,
): MetricBand {
  const def = getMetricDefinition(metricId);
  if (def.kind === "monetary") {
    const benchmark =
      Number.isFinite(benchmarkForAov) && (benchmarkForAov ?? 0) > 0 ? benchmarkForAov! : 1;
    const ratioPct = (value / benchmark) * 100;
    if (ratioPct >= def.highMin) return "high";
    if (ratioPct >= def.midMin) return "mid";
    return "low";
  }
  if (value >= def.highMin) return "high";
  if (value >= def.midMin) return "mid";
  return "low";
}

function toNormalizedScore(metricId: string, value: number, benchmarkForAov?: number): number {
  const kind = getMetricKind(metricId);
  if (kind === "monetary") {
    const benchmark =
      Number.isFinite(benchmarkForAov) && (benchmarkForAov ?? 0) > 0 ? benchmarkForAov! : 1;
    return value / benchmark;
  }
  return value / getMetricScaleMax(metricId);
}

export function getSignificantChangeThreshold(
  metricId: string,
  previousValue: number,
): number {
  const kind = getMetricKind(metricId);
  if (kind === "epi") return 2.0;
  if (kind === "likert") return 0.2;
  if (kind === "percentage") return 2.0;
  const pctBased = Math.abs(previousValue) * 0.05;
  return Math.max(20, Number.isFinite(pctBased) ? pctBased : 20);
}

export function isSignificantChange(
  metricId: string,
  currentValue: number,
  previousValue: number,
): boolean {
  const delta = currentValue - previousValue;
  return Math.abs(delta) >= getSignificantChangeThreshold(metricId, previousValue);
}

export function formatMetricValue(metricId: string, value: number): string {
  const kind = getMetricKind(metricId);
  if (kind === "likert") {
    return `${value.toFixed(2)}/5`;
  }
  if (kind === "monetary") {
    return `₱${value.toFixed(1)}`;
  }
  return `${value.toFixed(1)}%`;
}

export function formatMetricDelta(metricId: string, delta: number): string {
  const kind = getMetricKind(metricId);
  if (kind === "likert") {
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toFixed(2)}`;
  }
  if (kind === "monetary") {
    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
    return `${sign}₱${Math.abs(delta).toFixed(1)}`;
  }
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} pts`;
}

function getMetricBenchmark(
  metricId: string,
  metricBenchmarksByMetric?: Record<string, number>,
): number | undefined {
  const benchmark = metricBenchmarksByMetric?.[metricId];
  if (!Number.isFinite(benchmark) || (benchmark ?? 0) <= 0) {
    return undefined;
  }
  return benchmark;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
  return Math.sqrt(variance);
}

function dominantBand(counts: Record<MetricBand, number>): MetricBand {
  const order: MetricBand[] = ["high", "good", "mid", "low"];
  let bestBand: MetricBand = "mid";
  let bestCount = -1;
  for (const band of order) {
    const count = counts[band] ?? 0;
    if (count > bestCount) {
      bestBand = band;
      bestCount = count;
    }
  }
  return bestBand;
}

function bandToLabel(band: MetricBand): string {
  if (band === "high") return "high";
  if (band === "good") return "good";
  if (band === "mid") return "mid";
  return "low";
}

function severityFromTrend(delta: number, significant: boolean): "success" | "warning" | "info" {
  if (!significant || delta === 0) return "info";
  return delta > 0 ? "success" : "warning";
}

function sortByDeltaMagnitudeThenName<T extends { name: string; delta: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const absDelta = Math.abs(b.delta) - Math.abs(a.delta);
    if (absDelta !== 0) return absDelta;
    const signOrder = b.delta - a.delta;
    if (signOrder !== 0) return signOrder;
    return a.name.localeCompare(b.name);
  });
}

export function buildGlobalInsights(input: GlobalInsightsInput): RuleInsight[] {
  const comparisonRef = getComparisonReferenceLabel(input.selection);
  const epiBands: Record<MetricBand, number> = { high: 0, good: 0, mid: 0, low: 0 };
  for (const row of input.employeeEpi) {
    const band = classifyEpiBand(row.epi, input.globalEpiCurrent);
    epiBands[band] += 1;
  }
  const totalEmployees = input.employeeEpi.length || 1;
  const highOrGoodCount = epiBands.high + epiBands.good;
  const highOrGoodPct = Math.round((highOrGoodCount / totalEmployees) * 100);
  const lowPct = Math.round((epiBands.low / totalEmployees) * 100);

  const globalDelta = input.globalEpiCurrent - input.globalEpiPrevious;
  const globalTrendSignificant = Math.abs(globalDelta) >= 2.0;
  const globalTrendSeverity = severityFromTrend(globalDelta, globalTrendSignificant);

  const metricRows = Object.entries(input.metricRowsByMetric);
  const metricStrength = metricRows
    .map(([metricId, rows]) => {
      const def = getMetricDefinition(metricId);
      const benchmark = getMetricBenchmark(metricId, input.metricBenchmarksByMetric);
      const highCount = rows.filter((row) => classifyMetricBand(metricId, row.value, benchmark) === "high").length;
      const highShare = rows.length > 0 ? highCount / rows.length : 0;
      const avgScore = mean(rows.map((row) => toNormalizedScore(metricId, row.value, benchmark)));
      return { metricId, label: def.label, highShare, avgScore };
    })
    .sort((a, b) => {
      if (b.highShare !== a.highShare) return b.highShare - a.highShare;
      if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
      return a.metricId.localeCompare(b.metricId);
    });

  const metricRisk = metricRows
    .map(([metricId, rows]) => {
      const def = getMetricDefinition(metricId);
      const benchmark = getMetricBenchmark(metricId, input.metricBenchmarksByMetric);
      const lowCount = rows.filter((row) => classifyMetricBand(metricId, row.value, benchmark) === "low").length;
      const lowShare = rows.length > 0 ? lowCount / rows.length : 0;
      const avgDelta = mean(rows.map((row) => row.value - row.previousValue));
      return { metricId, label: def.label, lowShare, avgDelta };
    })
    .sort((a, b) => {
      if (b.lowShare !== a.lowShare) return b.lowShare - a.lowShare;
      if (a.avgDelta !== b.avgDelta) return a.avgDelta - b.avgDelta;
      return a.metricId.localeCompare(b.metricId);
    });

  const epiValues = input.employeeEpi.map((row) => row.epi);
  const topEpi = epiValues.length > 0 ? Math.max(...epiValues) : input.globalEpiCurrent;
  const lowEpi = epiValues.length > 0 ? Math.min(...epiValues) : input.globalEpiCurrent;
  const epiGap = topEpi - lowEpi;

  const dominant = dominantBand(epiBands);
  const dominantPct = Math.round(((epiBands[dominant] ?? 0) / totalEmployees) * 100);

  return [
    {
      id: "global-performance-level",
      category: "performance-level",
      severity: lowPct >= 30 ? "warning" : "success",
      subject: "Workforce performance level",
      message: `${highOrGoodPct}% of employees are in the ${highOrGoodPct >= 60 ? "high/good" : "mid/low"} EPI bands, with ${lowPct}% currently in low performance.`,
      supportingData: { highOrGoodPct, lowPct },
    },
    {
      id: "global-trend",
      category: "trend",
      severity: globalTrendSeverity,
      subject: "Overall trend",
      message: globalTrendSignificant
        ? `Workforce EPI ${globalDelta > 0 ? "improved" : "declined"} by ${Math.abs(globalDelta).toFixed(
            1,
          )} points from start to end of ${comparisonRef}.`
        : `Workforce EPI is stable within ${comparisonRef} (change below 2.0 points).`,
      supportingData: { globalDelta },
    },
    {
      id: "global-strength",
      category: "strength",
      severity: "success",
      subject: "Top workforce strength",
      message: `${metricStrength[0]?.label ?? "No metric"} is currently the strongest metric across employees.`,
    },
    {
      id: "global-risk",
      category: "risk",
      severity:
        (metricRisk[0]?.lowShare ?? 0) >= 0.3 ||
        (metricRisk[0]?.avgDelta ?? 0) < 0
          ? "warning"
          : "info",
      subject: "Primary risk area",
      message: `${metricRisk[0]?.label ?? "No metric"} needs attention due to the weakest workforce pattern in the current period.`,
    },
    {
      id: "global-consistency",
      category: "consistency",
      severity: epiGap > 20 ? "warning" : "success",
      subject: "Performance consistency",
      message:
        epiGap > 20
          ? `A ${epiGap.toFixed(1)} point EPI gap indicates uneven performance consistency across the team.`
          : `Performance is consistent overall, with only a ${epiGap.toFixed(1)} point EPI gap between top and lowest employees.`,
      supportingData: { epiGap, dominantBand: bandToLabel(dominant), dominantPct },
    },
  ];
}

export function buildEmployeeInsights(input: EmployeeInsightsInput): RuleInsight[] {
  const comparisonRef = getComparisonReferenceLabel(input.selection);
  const employeeLabel = input.employeeName || "This employee";
  const metricRows = Object.entries(input.metricRowsByMetric)
    .map(([metricId, rows]) => {
      const def = getMetricDefinition(metricId);
      const row = rows.find((candidate) => candidate.name === input.employeeName);
      if (!row) return null;
      const delta = row.value - row.previousValue;
      const significant = isSignificantChange(metricId, row.value, row.previousValue);
      const benchmark = getMetricBenchmark(metricId, input.metricBenchmarksByMetric);
      return {
        metricId,
        label: def.label,
        value: row.value,
        previousValue: row.previousValue,
        delta,
        significant,
        benchmark,
        band: classifyMetricBand(metricId, row.value, benchmark),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  metricRows.sort((a, b) => {
    const aNorm = toNormalizedScore(a.metricId, a.value, a.benchmark);
    const bNorm = toNormalizedScore(b.metricId, b.value, b.benchmark);
    if (bNorm !== aNorm) return bNorm - aNorm;
    return a.metricId.localeCompare(b.metricId);
  });

  const strongest = metricRows[0];
  const weakest = [...metricRows].reverse()[0];
  const rankedByDelta = sortByDeltaMagnitudeThenName(
    metricRows.map((row) => ({ name: row.label, delta: row.delta })),
  );
  const topDelta = rankedByDelta[0];
  const trendMetric = metricRows.find((row) => row.label === topDelta?.name);
  const normalizedValues = metricRows.map((row) =>
    toNormalizedScore(row.metricId, row.value, row.benchmark),
  );
  const spread =
    normalizedValues.length > 0
      ? (Math.max(...normalizedValues) - Math.min(...normalizedValues)) * 100
      : 0;

  return [
    {
      id: "employee-strength",
      category: "strength",
      severity: "success",
      subject: "Strongest metric",
      message: `${employeeLabel}'s strongest area is ${strongest?.label ?? "Top metric"} at ${formatMetricValue(
        strongest?.metricId ?? "attendance-rate",
        strongest?.value ?? 0,
      )}.`,
    },
    {
      id: "employee-weakness",
      category: "weakness",
      severity: weakest?.band === "low" ? "warning" : "info",
      subject: "Primary weakness",
      message: `${weakest?.label ?? "Lowest metric"} is currently ${employeeLabel}'s lowest area and should be prioritized for attention.`,
    },
    {
      id: "employee-trend",
      category: "trend",
      severity: trendMetric?.significant
        ? trendMetric.delta > 0
          ? "success"
          : "warning"
        : "info",
      subject: "Recent trend",
      message: trendMetric?.significant
        ? `${trendMetric.label} changed by ${formatMetricDelta(
            trendMetric.metricId,
            trendMetric.delta,
          )} from start to end of ${comparisonRef}.`
        : `No metric changed significantly from start to end of ${comparisonRef}; performance is stable.`,
    },
    {
      id: "employee-consistency",
      category: "consistency",
      severity: spread > 30 ? "warning" : "success",
      subject: "Consistency",
      message:
        spread > 30
          ? `Performance fluctuates across metrics (${spread.toFixed(1)} point normalized spread).`
          : `Performance remains consistent across metrics (${spread.toFixed(1)} point normalized spread).`,
    },
  ];
}

export function buildMetricInsights(input: MetricInsightsInput): RuleInsight[] {
  const comparisonRef = getComparisonReferenceLabel(input.selection);
  const rows = [...input.employeeRows].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const values = rows.map((row) => row.value);
  const avg = mean(values);
  const spread = (top?.value ?? 0) - (bottom?.value ?? 0);
  const deviation = stdDev(values);
  const kind = getMetricKind(input.metricId);

  const bands: Record<MetricBand, number> = { high: 0, good: 0, mid: 0, low: 0 };
  for (const row of rows) {
    const band = classifyMetricBand(input.metricId, row.value, input.benchmarkValue);
    bands[band] += 1;
  }

  const dominant = dominantBand(bands);
  const dominantPct = rows.length > 0 ? Math.round(((bands[dominant] ?? 0) / rows.length) * 100) : 0;
  const topDelta = (top?.value ?? 0) - (top?.previousValue ?? 0);
  const bottomDelta = (bottom?.value ?? 0) - (bottom?.previousValue ?? 0);

  const overallSeverity: "success" | "warning" | "info" =
    dominant === "high" || dominant === "good" ? "success" : dominant === "low" ? "warning" : "info";

  return [
    {
      id: "metric-overall-level",
      category: "overall-level",
      severity: overallSeverity,
      subject: "Overall level",
      message: `Overall ${input.metricLabel} performance is ${bandToLabel(dominant)}, with ${dominantPct}% of employees in that band.`,
    },
    {
      id: "metric-top-performer",
      category: "top-performer",
      severity: "success",
      subject: "Top performer",
      message: `${top?.name ?? "Top employee"} leads at ${formatMetricValue(input.metricId, top?.value ?? 0)} and changed by ${formatMetricDelta(
        input.metricId,
        topDelta,
      )} from start to end of ${comparisonRef}.`,
    },
    {
      id: "metric-bottom-performer",
      category: "bottom-performer",
      severity: "warning",
      subject: "Bottom performer",
      message: `${bottom?.name ?? "Lowest employee"} is lowest at ${formatMetricValue(
        input.metricId,
        bottom?.value ?? 0,
      )}, changing ${formatMetricDelta(input.metricId, bottomDelta)} from start to end of ${comparisonRef}.`,
    },
    {
      id: "metric-consistency",
      category: "consistency",
      severity: deviation > (kind === "likert" ? 0.35 : kind === "monetary" ? 35 : 6) ? "warning" : "success",
      subject: "Consistency",
      message:
        deviation > (kind === "likert" ? 0.35 : kind === "monetary" ? 35 : 6)
          ? `Performance variance is high (${deviation.toFixed(2)} spread), indicating inconsistent execution across employees.`
          : `Performance is tightly grouped (${deviation.toFixed(2)} spread), indicating strong consistency.`,
    },
    {
      id: "metric-distribution",
      category: "distribution",
      severity: "info",
      subject: "Distribution",
      message: `${bands.high} high, ${bands.mid + bands.good} mid/good, and ${bands.low} low performers for ${input.metricLabel}.`,
    },
    {
      id: "metric-gap-analysis",
      category: "gap-analysis",
      severity:
        spread > (kind === "likert" ? 0.8 : kind === "monetary" ? 90 : 12) ? "warning" : "info",
      subject: "Gap analysis",
      message:
        spread > (kind === "likert" ? 0.8 : kind === "monetary" ? 90 : 12)
          ? `A large top-to-bottom gap of ${formatMetricDelta(
              input.metricId,
              spread,
            )} suggests uneven capability and training opportunities.`
          : `The top-to-bottom gap is ${formatMetricDelta(
              input.metricId,
              spread,
            )}, indicating manageable variance.`,
    },
  ];
}

export function mapGlobalInsightsToCardRows(insights: RuleInsight[]): GeneralKeyInsightAlert[] {
  return insights.map((insight, idx) => ({
    id: idx + 1,
    employee: insight.subject,
    message: insight.message,
    type: insight.severity === "warning" ? "warning" : "success",
    metric: insight.category
      .replace(/-/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase()),
  }));
}

export function mapEmployeeInsightsToCardRows(insights: RuleInsight[]): PersonalKeyInsightRow[] {
  return insights.map((insight) => {
    if (insight.category === "strength") {
      return { type: "strength", metric: insight.subject, message: insight.message };
    }
    if (insight.category === "trend") {
      return {
        type: insight.severity === "warning" ? "attention" : "improving",
        metric: insight.subject,
        message: insight.message,
      };
    }
    return {
      type: "attention",
      metric: insight.subject,
      message: insight.message,
    };
  });
}

export function mapMetricInsightsToCardRows(insights: RuleInsight[]): MetricInsightItem[] {
  return insights.map((insight) => ({
    type: insight.severity,
    title: insight.subject,
    message: insight.message,
  }));
}
