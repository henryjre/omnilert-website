/**
 * Deterministic mock analytics for General View, keyed by the selected date range.
 */

import {
  resolveHeroEpiComparison,
  type HeroEpiZone,
} from "../../dashboard/components/epi/heroEpiComparison";
import {
  type AnalyticsGranularity,
  type AnalyticsRangeSelection,
  countBuckets,
  eachBucketInRange,
  formatComparisonPeriodCaption,
} from "./analyticsRangeBuckets";

/** Integer hash for stable mock perturbation (no Math.random). */
export function hashRangeSeed(selection: AnalyticsRangeSelection): number {
  const s = `${selection.granularity}|${selection.rangeStartYmd}|${selection.rangeEndYmd}`;
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Card subtitle aligned to granularity: "Based on Daily Data", "Based on Weekly Data", etc.
 */
export function formatInsightsPeriodSubtitle(selection: AnalyticsRangeSelection): string {
  const label =
    selection.granularity === "day"
      ? "Daily"
      : selection.granularity === "week"
        ? "Weekly"
        : selection.granularity === "month"
          ? "Monthly"
          : "Yearly";
  return `Based on ${label} Data`;
}

function bucketUnitLabel(selection: AnalyticsRangeSelection, count: number): string {
  const g = selection.granularity;
  if (g === "day") {
    return count === 1 ? "day" : "days";
  }
  if (g === "week") {
    return count === 1 ? "week" : "weeks";
  }
  if (g === "month") {
    return count === 1 ? "month" : "months";
  }
  return count === 1 ? "year" : "years";
}

export interface GeneralKeyInsightAlert {
  id: number;
  employee: string;
  message: string;
  type: "warning" | "success";
  metric: string;
}

/** General View — Key Insights list; copy shifts with selected range (deterministic). */
export function buildGeneralKeyInsights(selection: AnalyticsRangeSelection): GeneralKeyInsightAlert[] {
  const rs = hashRangeSeed(selection);
  const n = countBuckets(selection);
  const unit = bucketUnitLabel(selection, n);
  const employees = ["Sarah Jenkins", "Marcus Chen", "Elena Rodriguez"];
  const pick = (i: number) => employees[((rs >> (i * 5)) + i) % 3];
  const productivityPct = 8 + (rs % 8);
  const sopGapPct = 3 + (rs % 6);

  return [
    {
      id: 1,
      employee: pick(0),
      message: `Uniform compliance trending down over the last ${n} ${unit} in this window.`,
      type: "warning",
      metric: "Uniform Compliance",
    },
    {
      id: 2,
      employee: pick(1),
      message: `Productivity rate up ${productivityPct}% vs prior period across the selected ${n} ${unit}.`,
      type: "success",
      metric: "Productivity Rate",
    },
    {
      id: 3,
      employee: pick(2),
      message: `SOP compliance is ${sopGapPct}% below the global target for the selected range.`,
      type: "warning",
      metric: "SOP Compliance",
    },
  ];
}

export interface PersonalKeyInsightRow {
  type: "strength" | "improving" | "attention";
  metric: string;
  message: string;
}

/** Employee View — Key Insights rows; messages reference bucket count and period. */
export function buildPersonalKeyInsights(selection: AnalyticsRangeSelection): PersonalKeyInsightRow[] {
  const rs = hashRangeSeed(selection);
  const n = countBuckets(selection);
  const unit = bucketUnitLabel(selection, n);
  const improvingPct = (2 + (rs % 50) / 10).toFixed(1);
  const attentionPct = (3 + (rs % 40) / 10).toFixed(1);

  return [
    {
      type: "strength",
      metric: "Customer Service",
      message: `Consistently in the top 15% of the branch for this metric over the last ${n} ${unit}.`,
    },
    {
      type: "improving",
      metric: "Punctuality",
      message: `Rate improved by ${improvingPct}% vs the prior period over the last ${n} ${unit}.`,
    },
    {
      type: "attention",
      metric: "SOP Compliance",
      message: `Trending ${attentionPct}% below the branch target for the selected range.`,
    },
  ];
}

export interface LeaderboardRow {
  name: string;
  epi: number;
}

export interface GlobalEpiTrendPoint {
  label: string;
  epi: number;
}

export interface DistributionBin {
  range: string;
  count: number;
  fill: string;
}

export interface RadarDatum {
  subject: string;
  A: number;
  fullMark: number;
}

const RADAR_METRICS: { id: string; label: string }[] = [
  { id: "customer-service", label: "Customer Service Score" },
  { id: "workplace-relations", label: "Workplace Relations Score" },
  { id: "professional-conduct", label: "Professional Conduct Score" },
  { id: "attendance-rate", label: "Attendance Rate" },
  { id: "punctuality-rate", label: "Punctuality Rate" },
  { id: "productivity-rate", label: "Productivity Rate" },
  { id: "average-order-value", label: "Average Order Value" },
  { id: "uniform-compliance", label: "Uniform Compliance" },
  { id: "hygiene-compliance", label: "Hygiene Compliance" },
  { id: "sop-compliance", label: "SOP Compliance" },
];

function shortenRadarSubject(label: string): string {
  return label
    .replace(" Score", "")
    .replace(" Rate", "")
    .replace(" Compliance", "")
    .replace("Professional Conduct", "Prof. Conduct")
    .replace("Workplace Relations", "Workplace Rel.");
}

/**
 * Radar rows for a user; values shift with the selected analytics range.
 */
export function buildRadarDataset(user: string, selection: AnalyticsRangeSelection): RadarDatum[] {
  const rangeKey = hashRangeSeed(selection);
  return RADAR_METRICS.map((m) => {
    const seed = `${user}${m.id}${rangeKey}`
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    return {
      subject: shortenRadarSubject(m.label),
      A: 60 + (seed % 40),
      fullMark: 100,
    };
  });
}

/** Hero EPI zones vs global average — same thresholds as `heroEpiComparison.getHeroZoneByPercentChange`. */
export const EPI_DISTRIBUTION_ZONE_SEQUENCE: readonly HeroEpiZone[] = [
  "red",
  "amber",
  "green",
  "blue",
];

const EPI_VS_GLOBAL_ZONE_ORDER: readonly HeroEpiZone[] = EPI_DISTRIBUTION_ZONE_SEQUENCE;

const EPI_VS_GLOBAL_ZONE_STYLE: Record<HeroEpiZone, { fill: string; shortLabel: string }> = {
  red: { shortLabel: "Critical Deficit", fill: "#ef4444" },
  amber: { shortLabel: "Underperforming", fill: "#f59e0b" },
  green: { shortLabel: "On Target", fill: "#10b981" },
  blue: { shortLabel: "Exceptional", fill: "#3b82f6" },
};

/**
 * Axis labels for hero vs global bands (same % thresholds as `resolveHeroEpiComparison`).
 * @param labelMetricId `null` = EPI headline (green upper capped at 100). Otherwise metric id (AOV uses ₱ labels).
 */
function heroVsGlobalDistributionBinLabels(
  globalAvg: number,
  labelMetricId: string | null,
): Record<HeroEpiZone, string> {
  if (!Number.isFinite(globalAvg) || globalAvg <= 0) {
    return {
      red: "≤−25%",
      amber: "−25%–0%",
      green: "0–+50%",
      blue: ">+50%",
    };
  }
  const fmt = (v: number): string => (Math.round(v * 10) / 10).toFixed(1);
  const atMinus25Pct = globalAvg * 0.75;
  const atPlus50Pct = globalAvg * 1.5;
  const isAov = labelMetricId === "average-order-value";
  const greenHigh =
    labelMetricId === null
      ? Math.min(100, atPlus50Pct)
      : isAov
        ? atPlus50Pct
        : Math.min(100, atPlus50Pct);
  if (isAov) {
    return {
      red: `≤₱${fmt(atMinus25Pct)}`,
      amber: `₱${fmt(atMinus25Pct)}–₱${fmt(globalAvg)}`,
      green: `₱${fmt(globalAvg)}–₱${fmt(greenHigh)}`,
      blue: `>₱${fmt(atPlus50Pct)}`,
    };
  }
  return {
    red: `≤${fmt(atMinus25Pct)}`,
    amber: `${fmt(atMinus25Pct)}–${fmt(globalAvg)}`,
    green: `${fmt(globalAvg)}–${fmt(greenHigh)}`,
    blue: `>${fmt(atPlus50Pct)}`,
  };
}

/**
 * Buckets each employee's EPI vs the global EPI average using `resolveHeroEpiComparison`
 * (percent change = ((user − global) / global) × 100).
 */
function buildEpiVsGlobalDistribution(
  globalEpi: number,
  roster: LeaderboardRow[],
  rangeSeed: number,
): {
  bins: DistributionBin[];
  totalEmployees: number;
  dominantZone: HeroEpiZone;
  dominantEmployeeCount: number;
  dominantSharePct: number;
  dominantBandLabel: string;
} {
  const counts: Record<HeroEpiZone, number> = {
    red: 0,
    amber: 0,
    green: 0,
    blue: 0,
  };

  for (const row of roster) {
    const userEpi = perturbEpi(row.epi, row.name, rangeSeed);
    const { zone } = resolveHeroEpiComparison({
      userEpiScore: userEpi,
      globalAverageEpi: globalEpi,
    });
    counts[zone] += 1;
  }

  const rangeLabels = heroVsGlobalDistributionBinLabels(globalEpi, null);
  const bins: DistributionBin[] = EPI_VS_GLOBAL_ZONE_ORDER.map((z) => ({
    range: rangeLabels[z],
    count: counts[z],
    fill: EPI_VS_GLOBAL_ZONE_STYLE[z].fill,
  }));

  const totalEmployees = bins.reduce((s, d) => s + d.count, 0);
  let bestZone: HeroEpiZone = "green";
  let bestCount = -1;
  for (const z of EPI_VS_GLOBAL_ZONE_ORDER) {
    if (counts[z] > bestCount) {
      bestCount = counts[z];
      bestZone = z;
    }
  }
  const pct =
    totalEmployees > 0 ? Math.round((bestCount / totalEmployees) * 100) : 0;
  const dominantEmployeeCount = Math.max(0, bestCount);

  return {
    bins,
    totalEmployees,
    dominantZone: bestZone,
    dominantEmployeeCount,
    dominantSharePct: pct,
    dominantBandLabel: EPI_VS_GLOBAL_ZONE_STYLE[bestZone].shortLabel,
  };
}

function perturbEpi(base: number, name: string, rangeSeed: number): number {
  const h = `${name}${rangeSeed}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const delta = (h % 9) - 4;
  return Math.min(100, Math.max(0, Math.round((base + delta * 0.35) * 10) / 10));
}

function trendFooterLabel(granularity: AnalyticsGranularity, n: number): string {
  const u =
    granularity === "day"
      ? "day"
      : granularity === "week"
        ? "week"
        : granularity === "month"
          ? "month"
          : "year";
  /** Footer matches prior UI: `12-week trend` (hyphenated unit). */
  return `${n}-${u} trend`;
}

function recognitionLabel(granularity: AnalyticsGranularity, n: number): string {
  const unit =
    granularity === "day"
      ? n === 1
        ? "day"
        : "days"
      : granularity === "week"
        ? n === 1
          ? "week"
          : "weeks"
        : granularity === "month"
          ? n === 1
            ? "month"
            : "months"
          : n === 1
            ? "year"
            : "years";
  return `Last ${n} ${unit}`;
}

function trendComparisonSubtitle(granularity: AnalyticsGranularity, n: number): string {
  const u =
    granularity === "day"
      ? "day"
      : granularity === "week"
        ? "week"
        : granularity === "month"
          ? "month"
          : "year";
  return `${n}-${u} metric comparison`;
}

export interface GeneralViewMockData {
  globalEpi: number;
  globalEpiDelta: number;
  globalEpiTrend: GlobalEpiTrendPoint[];
  comparisonCaption: string;
  trendFooter: string;
  recognitionSubtitle: string;
  trendComparisonSubtitle: string;
  leaderboardTop: LeaderboardRow[];
  leaderboardBottom: LeaderboardRow[];
  awards: number;
  violations: number;
  distribution: DistributionBin[];
  distributionDominantEmployeeCount: number;
  distributionDominantSharePct: number;
  distributionDominantBandLabel: string;
  distributionSummaryDominantZone: HeroEpiZone;
  distributionTotal: number;
  rangeSeed: number;
}

/**
 * Builds all mock slices for General View cards from the current range.
 * Global headline EPI is the average of the per-bucket series (global average over the window).
 */
export function buildGeneralViewMockData(
  selection: AnalyticsRangeSelection,
  args: {
    topPerformers: LeaderboardRow[];
    priorityReview: LeaderboardRow[];
  },
): GeneralViewMockData {
  const rangeSeed = hashRangeSeed(selection);
  const buckets = eachBucketInRange(selection);
  const n = buckets.length;

  const globalEpiTrend: GlobalEpiTrendPoint[] = buckets.map((b, i) => {
    const wobble = Math.sin((rangeSeed + i) * 0.47) * 5.5 + (i / Math.max(n, 1)) * 1.8;
    const v = 80 + (rangeSeed % 7) + wobble;
    const epi = Math.min(100, Math.max(40, Math.round(v * 10) / 10));
    return { label: b.label, epi };
  });

  const sumEpi = globalEpiTrend.reduce((s, p) => s + p.epi, 0);
  const globalEpi = n > 0 ? Math.round((sumEpi / n) * 10) / 10 : 0;
  const first = globalEpiTrend[0]?.epi ?? globalEpi;
  const last = globalEpiTrend[n - 1]?.epi ?? globalEpi;
  const globalEpiDelta = Math.round((last - first) * 10) / 10;

  const { granularity } = selection;

  const roster: LeaderboardRow[] = [...args.topPerformers, ...args.priorityReview];
  const {
    bins,
    totalEmployees,
    dominantZone,
    dominantEmployeeCount,
    dominantSharePct,
    dominantBandLabel,
  } = buildEpiVsGlobalDistribution(globalEpi, roster, rangeSeed);

  const top = args.topPerformers
    .map((r) => ({ name: r.name, epi: perturbEpi(r.epi, r.name, rangeSeed) }))
    .sort((a, b) => b.epi - a.epi);
  const bottom = args.priorityReview
    .map((r) => ({ name: r.name, epi: perturbEpi(r.epi, r.name, rangeSeed) }))
    .sort((a, b) => a.epi - b.epi);

  const awardBase = 12 + (rangeSeed % 9);
  const violBase = Math.max(0, 3 + ((rangeSeed >> 2) % 5) - 2);

  return {
    globalEpi,
    globalEpiDelta,
    globalEpiTrend,
    comparisonCaption: formatComparisonPeriodCaption(selection),
    trendFooter: trendFooterLabel(granularity, n),
    recognitionSubtitle: recognitionLabel(granularity, n),
    trendComparisonSubtitle: trendComparisonSubtitle(granularity, n),
    leaderboardTop: top,
    leaderboardBottom: bottom,
    awards: awardBase,
    violations: violBase,
    distribution: bins,
    distributionDominantEmployeeCount: dominantEmployeeCount,
    distributionDominantSharePct: dominantSharePct,
    distributionDominantBandLabel: dominantBandLabel,
    distributionSummaryDominantZone: dominantZone,
    distributionTotal: totalEmployees,
    rangeSeed,
  };
}

/** One row per time bucket for Performance Trends area chart (`date` key holds the axis label). */
export type TrendComparisonRow = Record<string, string | number>;

/**
 * Mock metric series over the selected range (same length as buckets).
 */
export function buildTrendComparisonRows(
  selection: AnalyticsRangeSelection,
  users: string[],
  metricId: string,
): TrendComparisonRow[] {
  const buckets = eachBucketInRange(selection);
  const rangeKey = `${selection.granularity}|${selection.rangeStartYmd}|${selection.rangeEndYmd}`;
  return buckets.map((b, i) => {
    const row: TrendComparisonRow = { date: b.label };
    users.forEach((user) => {
      const seed = `${user}${metricId}${rangeKey}`
        .split("")
        .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
      const base = seed % 20 + 75;
      const variance = Math.sin(seed + i) * 10;
      row[user] = Math.min(100, Math.max(0, Math.round((base + variance) * 10) / 10));
    });
    return row;
  });
}

/** Subtitle for the employee Performance Trends card. */
export function buildPersonalTrendSubtitle(selection: AnalyticsRangeSelection): string {
  const n = countBuckets(selection);
  const { granularity } = selection;
  const u =
    granularity === "day"
      ? "day"
      : granularity === "week"
        ? "week"
        : granularity === "month"
          ? "month"
          : "year";
  return `${n}-${u} personal metric comparison`;
}

export interface PersonalEpiChartPoint {
  label: string;
  epi: number;
  globalAvg: number;
}

/**
 * Personal EPI headline (average of buckets), delta first→last, sparkline vs global trend for the same window.
 */
export function buildPersonalEpiSeries(
  userName: string,
  selection: AnalyticsRangeSelection,
  baseEpi: number,
  globalTrend: GlobalEpiTrendPoint[],
): {
  displayEpi: number;
  epiDelta: number;
  comparisonCaption: string;
  trendFooter: string;
  globalAvgDisplay: number;
  chartData: PersonalEpiChartPoint[];
} {
  const rangeSeed = hashRangeSeed(selection);
  const n = globalTrend.length;
  const chartData: PersonalEpiChartPoint[] = globalTrend.map((g, i) => {
    const h = `${userName}${selection.rangeStartYmd}${i}${rangeSeed}`
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const wobble = Math.sin((h + i) * 0.31) * 4.2 + ((h >> 2) % 5) * 0.15;
    const epi = Math.min(
      100,
      Math.max(35, Math.round((baseEpi + wobble + (i / Math.max(n, 1)) * 0.6) * 10) / 10),
    );
    return { label: g.label, epi, globalAvg: g.epi };
  });

  const sumP = chartData.reduce((s, p) => s + p.epi, 0);
  const sumG = chartData.reduce((s, p) => s + p.globalAvg, 0);
  const displayEpi = n > 0 ? Math.round((sumP / n) * 10) / 10 : baseEpi;
  const globalAvgDisplay = n > 0 ? Math.round((sumG / n) * 10) / 10 : 0;
  const first = chartData[0]?.epi ?? displayEpi;
  const last = chartData[n - 1]?.epi ?? displayEpi;
  const epiDelta = Math.round((last - first) * 10) / 10;

  return {
    displayEpi,
    epiDelta,
    comparisonCaption: formatComparisonPeriodCaption(selection),
    trendFooter: trendFooterLabel(selection.granularity, n),
    globalAvgDisplay,
    chartData,
  };
}

/** Awards / violations counts shifted by range (deterministic). */
export function buildPersonalRecognitionValues(
  userName: string,
  selection: AnalyticsRangeSelection,
  baseAwards: number,
  baseViolations: number,
): { awards: number; violations: number } {
  const rs = hashRangeSeed(selection);
  const h = `${userName}${rs}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    awards: Math.max(0, baseAwards + (h % 7) - 3),
    violations: Math.max(0, baseViolations + ((h >> 3) % 5) - 2),
  };
}

/**
 * Personal metric trend vs global average (replaces fixed 7-day mock).
 */
export function buildPersonalMetricTrendRows(
  userName: string,
  metricId: string,
  selection: AnalyticsRangeSelection,
): TrendComparisonRow[] {
  const buckets = eachBucketInRange(selection);
  const rangeKey = `${selection.granularity}|${selection.rangeStartYmd}|${selection.rangeEndYmd}`;
  const rs = hashRangeSeed(selection);
  return buckets.map((b, i) => {
    const userSeed = `${userName}${metricId}${rangeKey}`
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    const base = userSeed % 20 + 75;
    const variance = Math.sin(userSeed + i) * 10;
    const userVal = Math.min(100, Math.max(0, Math.round((base + variance) * 10) / 10));
    const gBase = 76 + (rs % 12);
    const globalVal = Math.min(
      100,
      Math.max(45, Math.round((gBase + Math.sin(rs * 0.02 + i * 0.45) * 6) * 10) / 10),
    );
    const row: TrendComparisonRow = { date: b.label, [userName]: userVal, "Global Avg": globalVal };
    return row;
  });
}

/** Perturb a metric value for the selected window (mock). */
export function perturbPersonalMetricValue(
  baseVal: number,
  metricKey: string,
  userName: string,
  selection: AnalyticsRangeSelection,
): number {
  const rs = hashRangeSeed(selection);
  const h = `${userName}${metricKey}${rs}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const delta = (h % 13) / 10 - 0.6;
  return Math.min(100, Math.max(0, Math.round((baseVal + delta) * 10) / 10));
}

/** Perturb global benchmark for a named metric (mock). */
export function perturbGlobalMetricAverage(
  baseGlobal: number,
  selection: AnalyticsRangeSelection,
): number {
  const rs = hashRangeSeed(selection);
  const delta = ((rs >> 4) % 9) / 10 - 0.4;
  return Math.min(100, Math.max(0, Math.round((baseGlobal + delta) * 10) / 10));
}

/**
 * Global / org target for Individual Metrics mocks; AOV uses peso scale (not 0–100).
 */
export function perturbMetricGlobalTarget(
  metricId: string,
  baseGlobal: number,
  selection: AnalyticsRangeSelection,
): number {
  if (metricId === "average-order-value") {
    const rs = hashRangeSeed(selection);
    const delta = ((rs >> 4) % 50) - 25;
    return Math.max(0, Math.round((baseGlobal + delta) * 10) / 10);
  }
  return perturbGlobalMetricAverage(baseGlobal, selection);
}

/** One employee row for Individual Metrics ranking / distribution mocks. */
export interface MetricEmployeeRow {
  name: string;
  value: number;
  /** Mock delta over the selected analytics range (deterministic; not a calendar week). */
  periodChange: number;
  role: string;
}

export interface IndividualMetricsRosterEntry {
  name: string;
  role: string;
}

/**
 * Perturbs a per-employee metric for Individual Metrics mocks; AOV stays on peso scale.
 */
function perturbIndividualMetricEmployeeValue(
  baseVal: number,
  metricId: string,
  userName: string,
  selection: AnalyticsRangeSelection,
): number {
  const rs = hashRangeSeed(selection);
  const h = `${userName}${metricId}${rs}`.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  if (metricId === "average-order-value") {
    const delta = (h % 80) - 40;
    return Math.max(0, Math.round((baseVal + delta) * 10) / 10);
  }
  return perturbPersonalMetricValue(baseVal, metricId, userName, selection);
}

/**
 * Per-employee metric values and period change, perturbed by `analyticsRange` (mock).
 */
export function getMetricAllEmployeeData(
  metricId: string,
  selection: AnalyticsRangeSelection,
  roster: IndividualMetricsRosterEntry[],
  getBaseMetricValue: (employeeName: string, metricId: string) => number,
): MetricEmployeeRow[] {
  const rs = hashRangeSeed(selection);
  return roster
    .map((emp) => {
      const base = getBaseMetricValue(emp.name, metricId);
      const value = perturbIndividualMetricEmployeeValue(base, metricId, emp.name, selection);
      const h = `${emp.name}${metricId}${rs}`.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
      const periodChange = parseFloat((((h % 80) - 40) / 10).toFixed(1));
      return {
        name: emp.name,
        value,
        periodChange,
        role: emp.role,
      };
    })
    .sort((a, b) => b.value - a.value);
}

export interface MetricTrendPoint {
  week: string;
  value: number;
  target: number;
}

/**
 * Global-average trend + target line over `eachBucketInRange(selection)` (mock).
 */
export function getMetricTrendForRange(
  metricId: string,
  selection: AnalyticsRangeSelection,
  globalTargetBase: number,
): MetricTrendPoint[] {
  const rangeSeed = hashRangeSeed(selection);
  const buckets = eachBucketInRange(selection);
  const n = buckets.length;
  const target = perturbMetricGlobalTarget(metricId, globalTargetBase, selection);

  if (n === 0) {
    return [{ week: "—", value: target, target }];
  }

  return buckets.map((b, i) => {
    if (metricId === "average-order-value") {
      const wobble = Math.sin((rangeSeed + i) * 0.47) * 28 + (i / Math.max(n, 1)) * 12;
      const value = Math.max(0, Math.round((target + wobble) * 10) / 10);
      return { week: b.label, value, target };
    }
    const wobble = Math.sin((rangeSeed + i) * 0.47) * 5.5 + (i / Math.max(n, 1)) * 1.8;
    const value = Math.min(100, Math.max(0, Math.round((target + wobble) * 10) / 10));
    return { week: b.label, value, target };
  });
}

/** Individual Metrics histogram: same hero zones as EPI distribution, vs global metric average. */
export interface MetricHeroVsGlobalDistribution {
  bins: DistributionBin[];
  totalEmployees: number;
  dominantZone: HeroEpiZone;
  dominantEmployeeCount: number;
  dominantSharePct: number;
  dominantBandLabel: string;
}

/**
 * Buckets each employee's metric value vs the global average for that metric (mock), using
 * `resolveHeroEpiComparison` percent bands on ((user − global) / global) × 100.
 */
export function getMetricHeroVsGlobalDistribution(
  metricId: string,
  selection: AnalyticsRangeSelection,
  roster: IndividualMetricsRosterEntry[],
  getBaseMetricValue: (employeeName: string, metricId: string) => number,
  branchAverageBase: number,
): MetricHeroVsGlobalDistribution {
  const globalMetricAvg = perturbMetricGlobalTarget(metricId, branchAverageBase, selection);
  const employees = getMetricAllEmployeeData(metricId, selection, roster, getBaseMetricValue);

  const counts: Record<HeroEpiZone, number> = {
    red: 0,
    amber: 0,
    green: 0,
    blue: 0,
  };
  for (const row of employees) {
    const { zone } = resolveHeroEpiComparison({
      userEpiScore: row.value,
      globalAverageEpi: globalMetricAvg,
    });
    counts[zone] += 1;
  }

  const rangeLabels = heroVsGlobalDistributionBinLabels(globalMetricAvg, metricId);
  const bins: DistributionBin[] = EPI_VS_GLOBAL_ZONE_ORDER.map((z) => ({
    range: rangeLabels[z],
    count: counts[z],
    fill: EPI_VS_GLOBAL_ZONE_STYLE[z].fill,
  }));

  const totalEmployees = bins.reduce((s, d) => s + d.count, 0);
  let bestZone: HeroEpiZone = "green";
  let bestCount = -1;
  for (const z of EPI_VS_GLOBAL_ZONE_ORDER) {
    if (counts[z] > bestCount) {
      bestCount = counts[z];
      bestZone = z;
    }
  }
  const pct =
    totalEmployees > 0 ? Math.round((bestCount / totalEmployees) * 100) : 0;

  return {
    bins,
    totalEmployees,
    dominantZone: bestZone,
    dominantEmployeeCount: Math.max(0, bestCount),
    dominantSharePct: pct,
    dominantBandLabel: EPI_VS_GLOBAL_ZONE_STYLE[bestZone].shortLabel,
  };
}

export interface MetricInsightItem {
  type: "success" | "warning" | "info";
  title: string;
  message: string;
}

/**
 * Automated insight bullets for the metric (mock); `periodChange` is range-scoped.
 */
export function getMetricInsights(
  metricId: string,
  selection: AnalyticsRangeSelection,
  roster: IndividualMetricsRosterEntry[],
  getBaseMetricValue: (employeeName: string, metricId: string) => number,
): MetricInsightItem[] {
  const employees = getMetricAllEmployeeData(metricId, selection, roster, getBaseMetricValue);
  const avg = employees.reduce((s, e) => s + e.value, 0) / employees.length;
  const insights: MetricInsightItem[] = [];

  const topImprovers = employees
    .filter((e) => e.periodChange > 2)
    .sort((a, b) => b.periodChange - a.periodChange);
  if (topImprovers.length > 0) {
    const t = topImprovers[0];
    const deltaLabel =
      metricId === "average-order-value"
        ? `${t.periodChange >= 0 ? "+" : ""}${t.periodChange.toFixed(1)}`
        : `${t.periodChange >= 0 ? "+" : ""}${t.periodChange.toFixed(1)}%`;
    insights.push({
      type: "success",
      title: "Top Improver",
      message: `${t.name} improved by ${deltaLabel} over the selected period — highest gain across the team.`,
    });
  }

  const declining = employees
    .filter((e) => e.periodChange < -2)
    .sort((a, b) => a.periodChange - b.periodChange);
  if (declining.length > 0) {
    const d = declining[0];
    const deltaLabel =
      metricId === "average-order-value"
        ? `${Math.abs(d.periodChange).toFixed(1)}`
        : `${d.periodChange.toFixed(1)}%`;
    insights.push({
      type: "warning",
      title: "Declining Trend",
      message: `${d.name} dropped ${deltaLabel} — consider a check-in or coaching session.`,
    });
  }

  const belowAvg = employees.filter((e) => e.value < avg - 10);
  if (belowAvg.length > 0) {
    insights.push({
      type: "warning",
      title: "Below Threshold",
      message: `${belowAvg.length} employee${belowAvg.length > 1 ? "s" : ""} score${belowAvg.length === 1 ? "s" : ""} 10+ points below the global average.`,
    });
  }

  const excellenceThreshold = metricId === "average-order-value" ? 500 : 95;
  const aboveTarget = employees.filter((e) => e.value >= excellenceThreshold);
  if (metricId === "average-order-value") {
    insights.push({
      type: "info",
      title: "Excellence Rate",
      message: `${aboveTarget.length} of ${employees.length} employees (${Math.round((aboveTarget.length / employees.length) * 100)}%) are at ₱500+ average order value.`,
    });
  } else {
    insights.push({
      type: "info",
      title: "Excellence Rate",
      message: `${aboveTarget.length} of ${employees.length} employees (${Math.round((aboveTarget.length / employees.length) * 100)}%) are scoring 95%+ on this metric.`,
    });
  }

  const spread = employees[0].value - employees[employees.length - 1].value;
  const spreadHigh = metricId === "average-order-value" ? spread > 150 : spread > 30;
  insights.push({
    type: spreadHigh ? "warning" : "info",
    title: "Score Spread",
    message:
      metricId === "average-order-value"
        ? `${spread.toFixed(0)} peso gap between top and bottom performer${spreadHigh ? " — high variance may indicate inconsistent training." : "."}`
        : `${spread.toFixed(1)} point gap between top and bottom performer${spreadHigh ? " — high variance may indicate inconsistent training." : "."}`,
  });

  return insights;
}

/** Footer label for the metric summary sparkline (e.g. `7-day trend`). */
export function buildMetricSummaryTrendFooter(selection: AnalyticsRangeSelection): string {
  const n = countBuckets(selection);
  const { granularity } = selection;
  const u =
    granularity === "day"
      ? "day"
      : granularity === "week"
        ? "week"
        : granularity === "month"
          ? "month"
          : "year";
  return `${n}-${u} trend`;
}

/** Title line for the metric area chart (period-aware), e.g. `7-Day Trend`. */
export function buildMetricTrendCardTitle(selection: AnalyticsRangeSelection): string {
  const n = countBuckets(selection);
  const { granularity } = selection;
  const u =
    granularity === "day"
      ? "day"
      : granularity === "week"
        ? "week"
        : granularity === "month"
          ? "month"
          : "year";
  const unitTitle = `${u.charAt(0).toUpperCase()}${u.slice(1)}`;
  return `${n}-${unitTitle} Trend`;
}

/** Subtitle under the metric trend card title. */
export function buildMetricTrendCardSubtitle(): string {
  return "Organization-wide metric performance over the selected period";
}
