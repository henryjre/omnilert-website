import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { AnalyticsRangeSelection } from "../src/features/employee-analytics/utils/analyticsRangeBuckets.ts";
import {
  restorePersistedAnalyticsRange,
  persistAnalyticsRange,
} from "../src/features/employee-analytics/utils/analyticsRangePersistence.ts";

class MemorySessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const FALLBACK_RANGE: AnalyticsRangeSelection = {
  granularity: "day",
  rangeStartYmd: "2026-03-23",
  rangeEndYmd: "2026-04-06",
};

test("restorePersistedAnalyticsRange returns a normalized stored selection when valid", () => {
  const storage = new MemorySessionStorage();
  storage.setItem("employee-analytics.range", JSON.stringify({
    granularity: "month",
    rangeStartYmd: "2026-04-30",
    rangeEndYmd: "2026-04-01",
  }));

  const restored = restorePersistedAnalyticsRange(
    "employee-analytics.range",
    FALLBACK_RANGE,
    storage,
  );

  assert.deepEqual(restored, {
    granularity: "month",
    rangeStartYmd: "2026-04-01",
    rangeEndYmd: "2026-04-30",
  });
});

test("restorePersistedAnalyticsRange falls back when stored JSON is invalid", () => {
  const storage = new MemorySessionStorage();
  storage.setItem("employee-analytics.range", "{bad json");

  const restored = restorePersistedAnalyticsRange(
    "employee-analytics.range",
    FALLBACK_RANGE,
    storage,
  );

  assert.deepEqual(restored, FALLBACK_RANGE);
});

test("restorePersistedAnalyticsRange falls back when stored shape is malformed", () => {
  const storage = new MemorySessionStorage();
  storage.setItem("employee-analytics.range", JSON.stringify({
    granularity: "quarter",
    rangeStartYmd: 123,
    rangeEndYmd: null,
  }));

  const restored = restorePersistedAnalyticsRange(
    "employee-analytics.range",
    FALLBACK_RANGE,
    storage,
  );

  assert.deepEqual(restored, FALLBACK_RANGE);
});

test("persistAnalyticsRange stores a normalized selection", () => {
  const storage = new MemorySessionStorage();

  persistAnalyticsRange(
    "employee-analytics.range",
    {
      granularity: "week",
      rangeStartYmd: "2026-04-06",
      rangeEndYmd: "2026-03-31",
    },
    storage,
  );

  assert.equal(
    storage.getItem("employee-analytics.range"),
    JSON.stringify({
      granularity: "week",
      rangeStartYmd: "2026-03-31",
      rangeEndYmd: "2026-04-06",
    }),
  );
});

test("analytics pages use persisted range state with page-specific defaults", () => {
  const employeePageSource = readFileSync(
    new URL("../src/features/employee-analytics/pages/EmployeeAnalyticsPage.tsx", import.meta.url),
    "utf8",
  );
  const profitabilityPageSource = readFileSync(
    new URL("../src/features/profitability-analytics/pages/ProfitabilityAnalyticsPage.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    employeePageSource,
    /usePersistedAnalyticsRange\(\s*'employee-analytics\.range',\s*createTrailingDayRangeSelection\(14\)\s*\)/,
    "EmployeeAnalyticsPage should restore its range from session storage with a trailing 14-day fallback",
  );
  assert.match(
    profitabilityPageSource,
    /usePersistedAnalyticsRange\(\s*'profitability-analytics\.range',\s*createCurrentMonthToDateRangeSelection\(\)\s*\)/,
    "ProfitabilityAnalyticsPage should restore its range from session storage with a month-to-date fallback",
  );
});
