import assert from "node:assert/strict";
import test from "node:test";
import type { AnalyticsRangeSelection } from "../src/features/employee-analytics/utils/analyticsRangeBuckets.ts";
import {
  buildEmployeeInsights,
  buildGlobalInsights,
  buildMetricInsights,
  classifyEpiBand,
  classifyMetricBand,
  formatInsightsPeriodSubtitle,
  formatMetricDelta,
  formatMetricValue,
  getComparisonReferenceLabel,
  getSignificantChangeThreshold,
  isSignificantChange,
} from "../src/features/employee-analytics/utils/analyticsRuleEngine.ts";

const DAY_SELECTION: AnalyticsRangeSelection = {
  granularity: "day",
  rangeStartYmd: "2026-03-28",
  rangeEndYmd: "2026-03-28",
};

const WEEK_SELECTION: AnalyticsRangeSelection = {
  granularity: "week",
  rangeStartYmd: "2026-03-23",
  rangeEndYmd: "2026-03-29",
};

test("EPI band thresholds follow +50% / 0% / -25% boundaries", () => {
  const globalAverage = 80;
  assert.equal(classifyEpiBand(120, globalAverage), "high");
  assert.equal(classifyEpiBand(81, globalAverage), "good");
  assert.equal(classifyEpiBand(80, globalAverage), "good");
  assert.equal(classifyEpiBand(79.9, globalAverage), "mid");
  assert.equal(classifyEpiBand(60, globalAverage), "mid");
  assert.equal(classifyEpiBand(59.9, globalAverage), "low");
});

test("metric thresholds honor locked high/mid/low boundaries", () => {
  assert.equal(classifyMetricBand("customer-service", 4.2), "high");
  assert.equal(classifyMetricBand("customer-service", 4.19), "mid");
  assert.equal(classifyMetricBand("customer-service", 3.8), "mid");
  assert.equal(classifyMetricBand("customer-service", 3.79), "low");

  assert.equal(classifyMetricBand("workplace-relations", 4.0), "high");
  assert.equal(classifyMetricBand("workplace-relations", 3.99), "mid");
  assert.equal(classifyMetricBand("workplace-relations", 3.6), "mid");
  assert.equal(classifyMetricBand("workplace-relations", 3.59), "low");

  assert.equal(classifyMetricBand("professional-conduct", 4.2), "high");
  assert.equal(classifyMetricBand("professional-conduct", 3.95), "mid");
  assert.equal(classifyMetricBand("professional-conduct", 3.79), "low");

  assert.equal(classifyMetricBand("attendance-rate", 95), "high");
  assert.equal(classifyMetricBand("attendance-rate", 94.9), "mid");
  assert.equal(classifyMetricBand("attendance-rate", 92), "mid");
  assert.equal(classifyMetricBand("attendance-rate", 91.9), "low");

  assert.equal(classifyMetricBand("punctuality-rate", 95), "high");
  assert.equal(classifyMetricBand("punctuality-rate", 93), "mid");
  assert.equal(classifyMetricBand("punctuality-rate", 91.9), "low");

  assert.equal(classifyMetricBand("productivity-rate", 90), "high");
  assert.equal(classifyMetricBand("productivity-rate", 89.9), "mid");
  assert.equal(classifyMetricBand("productivity-rate", 85), "mid");
  assert.equal(classifyMetricBand("productivity-rate", 84.9), "low");

  assert.equal(classifyMetricBand("uniform-compliance", 95), "high");
  assert.equal(classifyMetricBand("uniform-compliance", 93), "mid");
  assert.equal(classifyMetricBand("uniform-compliance", 91.9), "low");

  assert.equal(classifyMetricBand("hygiene-compliance", 95), "high");
  assert.equal(classifyMetricBand("hygiene-compliance", 93), "mid");
  assert.equal(classifyMetricBand("hygiene-compliance", 91.9), "low");

  assert.equal(classifyMetricBand("sop-compliance", 95), "high");
  assert.equal(classifyMetricBand("sop-compliance", 93), "mid");
  assert.equal(classifyMetricBand("sop-compliance", 91.9), "low");

  assert.equal(classifyMetricBand("average-order-value", 400, 400), "high");
  assert.equal(classifyMetricBand("average-order-value", 399.9, 400), "mid");
  assert.equal(classifyMetricBand("average-order-value", 360, 400), "mid");
  assert.equal(classifyMetricBand("average-order-value", 359.9, 400), "low");
});

test("significant change thresholds are applied by metric kind", () => {
  assert.equal(getSignificantChangeThreshold("epi", 80), 2);
  assert.equal(getSignificantChangeThreshold("customer-service", 4), 0.2);
  assert.equal(getSignificantChangeThreshold("attendance-rate", 95), 2);
  assert.equal(getSignificantChangeThreshold("average-order-value", 100), 20);
  assert.equal(getSignificantChangeThreshold("average-order-value", 1000), 50);

  assert.equal(isSignificantChange("epi", 83.9, 82), false);
  assert.equal(isSignificantChange("epi", 84.1, 82), true);
  assert.equal(isSignificantChange("customer-service", 4.3, 4.1), true);
  assert.equal(isSignificantChange("attendance-rate", 96.9, 95), false);
  assert.equal(isSignificantChange("attendance-rate", 97.1, 95), true);
  assert.equal(isSignificantChange("average-order-value", 419, 400), false);
  assert.equal(isSignificantChange("average-order-value", 420, 400), true);
});

test("comparison reference labels are explicit per selected range", () => {
  assert.equal(getComparisonReferenceLabel(DAY_SELECTION), "the selected 1 day range");
  assert.equal(getComparisonReferenceLabel(WEEK_SELECTION), "the selected 1 week range");
  assert.equal(
    getComparisonReferenceLabel({
      ...DAY_SELECTION,
      rangeStartYmd: "2026-03-22",
      rangeEndYmd: "2026-03-28",
    }),
    "the selected 7 days range",
  );
  assert.equal(
    getComparisonReferenceLabel({
      ...DAY_SELECTION,
      rangeStartYmd: "2026-01-01",
      rangeEndYmd: "2026-03-31",
      granularity: "month",
    }),
    "the selected 3 months range",
  );
  assert.equal(
    getComparisonReferenceLabel({
      ...DAY_SELECTION,
      rangeStartYmd: "2024-01-01",
      rangeEndYmd: "2026-12-31",
      granularity: "year",
    }),
    "the selected 3 years range",
  );
});

test("insights subtitle is range-scoped", () => {
  assert.equal(formatInsightsPeriodSubtitle(DAY_SELECTION), "Within the selected 1 day range");
  assert.equal(
    formatInsightsPeriodSubtitle({
      ...DAY_SELECTION,
      rangeStartYmd: "2026-03-22",
      rangeEndYmd: "2026-03-28",
    }),
    "Within the selected 7 days range",
  );
});

test("global, employee, and metric insight builders always emit required categories", () => {
  const metricRowsByMetric = {
    "attendance-rate": [
      { name: "Alice", value: 96, previousValue: 95 },
      { name: "Bob", value: 93, previousValue: 94 },
    ],
    "customer-service": [
      { name: "Alice", value: 4.3, previousValue: 4.1 },
      { name: "Bob", value: 3.9, previousValue: 4.0 },
    ],
    "average-order-value": [
      { name: "Alice", value: 360, previousValue: 370 },
      { name: "Bob", value: 410, previousValue: 405 },
    ],
  };

  const globalInsights = buildGlobalInsights({
    selection: WEEK_SELECTION,
    globalEpiCurrent: 86,
    globalEpiPrevious: 84,
    employeeEpi: [
      { name: "Alice", epi: 90 },
      { name: "Bob", epi: 78 },
    ],
    metricRowsByMetric,
    metricBenchmarksByMetric: { "average-order-value": 400 },
  });
  assert.deepEqual(globalInsights.map((insight) => insight.category), [
    "performance-level",
    "trend",
    "strength",
    "risk",
    "consistency",
  ]);

  const employeeInsights = buildEmployeeInsights({
    selection: WEEK_SELECTION,
    employeeName: "Alice",
    metricRowsByMetric,
    metricBenchmarksByMetric: { "average-order-value": 400 },
  });
  assert.deepEqual(employeeInsights.map((insight) => insight.category), [
    "strength",
    "weakness",
    "trend",
    "consistency",
  ]);

  const metricInsights = buildMetricInsights({
    selection: WEEK_SELECTION,
    metricId: "attendance-rate",
    metricLabel: "Attendance Rate",
    benchmarkValue: 95,
    employeeRows: [
      { name: "Alice", value: 96, previousValue: 95 },
      { name: "Bob", value: 93, previousValue: 94 },
    ],
  });
  assert.deepEqual(metricInsights.map((insight) => insight.category), [
    "overall-level",
    "top-performer",
    "bottom-performer",
    "consistency",
    "distribution",
    "gap-analysis",
  ]);
});

test("insight generation is deterministic for the same input", () => {
  const globalInput = {
    selection: WEEK_SELECTION,
    globalEpiCurrent: 86,
    globalEpiPrevious: 85,
    employeeEpi: [
      { name: "Alice", epi: 89 },
      { name: "Bob", epi: 80 },
    ],
    metricRowsByMetric: {
      "attendance-rate": [
        { name: "Alice", value: 96, previousValue: 95 },
        { name: "Bob", value: 94, previousValue: 94 },
      ],
      "average-order-value": [
        { name: "Alice", value: 360, previousValue: 365 },
        { name: "Bob", value: 410, previousValue: 400 },
      ],
    },
    metricBenchmarksByMetric: { "average-order-value": 400 },
  };

  assert.deepEqual(buildGlobalInsights(globalInput), buildGlobalInsights(globalInput));

  const metricInput = {
    selection: WEEK_SELECTION,
    metricId: "average-order-value",
    metricLabel: "Average Order Value",
    benchmarkValue: 400,
    employeeRows: [
      { name: "Alice", value: 360, previousValue: 365 },
      { name: "Bob", value: 410, previousValue: 400 },
    ],
  };

  assert.deepEqual(buildMetricInsights(metricInput), buildMetricInsights(metricInput));
});

test("stable scenarios emit interpreted stable insights instead of noisy trend claims", () => {
  const globalInsights = buildGlobalInsights({
    selection: WEEK_SELECTION,
    globalEpiCurrent: 85.4,
    globalEpiPrevious: 84.7,
    employeeEpi: [
      { name: "Alice", epi: 86 },
      { name: "Bob", epi: 85 },
    ],
    metricRowsByMetric: {
      "attendance-rate": [
        { name: "Alice", value: 96, previousValue: 96 },
        { name: "Bob", value: 95, previousValue: 95 },
      ],
    },
  });
  assert.match(globalInsights[1].message, /stable within the selected 1 week range/i);

  const employeeInsights = buildEmployeeInsights({
    selection: WEEK_SELECTION,
    employeeName: "Alice",
    metricRowsByMetric: {
      "attendance-rate": [{ name: "Alice", value: 96, previousValue: 96 }],
      "customer-service": [{ name: "Alice", value: 4.1, previousValue: 4.1 }],
    },
  });
  assert.match(
    employeeInsights[2].message,
    /No metric changed significantly from start to end of the selected 1 week range/i,
  );
});

test("AOV benchmark affects employee strength/weakness interpretation", () => {
  const metricRowsByMetric = {
    "attendance-rate": [{ name: "Alice", value: 96, previousValue: 95 }],
    "average-order-value": [{ name: "Alice", value: 360, previousValue: 370 }],
  };

  const withoutBenchmark = buildEmployeeInsights({
    selection: WEEK_SELECTION,
    employeeName: "Alice",
    metricRowsByMetric,
  });
  assert.match(withoutBenchmark[0].message, /Average Order Value/i);

  const withBenchmark = buildEmployeeInsights({
    selection: WEEK_SELECTION,
    employeeName: "Alice",
    metricRowsByMetric,
    metricBenchmarksByMetric: { "average-order-value": 400 },
  });
  assert.match(withBenchmark[0].message, /Attendance Rate/i);
});

test("employee insights avoid first-person phrasing", () => {
  const employeeInsights = buildEmployeeInsights({
    selection: WEEK_SELECTION,
    employeeName: "Alice",
    metricRowsByMetric: {
      "attendance-rate": [{ name: "Alice", value: 96, previousValue: 95 }],
      "customer-service": [{ name: "Alice", value: 4.1, previousValue: 4.0 }],
    },
  });

  for (const insight of employeeInsights) {
    assert.doesNotMatch(insight.message, /\byour\b/i);
  }
});

test("metric value and delta formatting stays type-correct", () => {
  assert.equal(formatMetricValue("customer-service", 4.2), "4.20/5");
  assert.equal(formatMetricValue("attendance-rate", 95.2), "95.2%");
  assert.equal(formatMetricValue("average-order-value", 400), "₱400.0");

  assert.equal(formatMetricDelta("customer-service", 0.2), "+0.20");
  assert.equal(formatMetricDelta("customer-service", -0.2), "-0.20");
  assert.equal(formatMetricDelta("attendance-rate", 2.1), "+2.1 pts");
  assert.equal(formatMetricDelta("attendance-rate", -2.1), "-2.1 pts");
  assert.equal(formatMetricDelta("average-order-value", 20), "+₱20.0");
  assert.equal(formatMetricDelta("average-order-value", -20), "-₱20.0");
});
