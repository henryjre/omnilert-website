import assert from "node:assert/strict";
import test from "node:test";
import {
  compareYmd,
  createDefaultRangeForGranularity,
  fromLocalYmd,
  normalizeRangeYmd,
  toLocalYmd,
} from "../src/features/employee-analytics/utils/analyticsRangeBuckets.ts";

const REF = new Date(2026, 2, 15, 14, 30, 0, 0);

test("createDefaultRangeForGranularity day spans 30 calendar days", () => {
  const r = createDefaultRangeForGranularity("day", REF);
  assert.equal(r.granularity, "day");
  assert.equal(compareYmd(r.rangeStartYmd, r.rangeEndYmd) <= 0, true);
  const start = fromLocalYmd(r.rangeStartYmd);
  const end = fromLocalYmd(r.rangeEndYmd);
  const diffDays = Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  assert.equal(diffDays, 29);
});

test("createDefaultRangeForGranularity week has Monday start before Sunday end", () => {
  const r = createDefaultRangeForGranularity("week", REF);
  assert.equal(r.granularity, "week");
  const mon = fromLocalYmd(r.rangeStartYmd);
  const sun = fromLocalYmd(r.rangeEndYmd);
  assert.equal(mon.getDay(), 1);
  assert.equal(sun.getDay(), 0);
});

test("normalizeRangeYmd swaps when start is after end", () => {
  const n = normalizeRangeYmd("2026-03-10", "2026-03-01");
  assert.equal(n.rangeStartYmd, "2026-03-01");
  assert.equal(n.rangeEndYmd, "2026-03-10");
});

test("toLocalYmd round-trips with fromLocalYmd", () => {
  const d = new Date(2026, 0, 5, 12, 0, 0, 0);
  const ymd = toLocalYmd(d);
  const back = fromLocalYmd(ymd);
  assert.equal(back.getFullYear(), 2026);
  assert.equal(back.getMonth(), 0);
  assert.equal(back.getDate(), 5);
});
