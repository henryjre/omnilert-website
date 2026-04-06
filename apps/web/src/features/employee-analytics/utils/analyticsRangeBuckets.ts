/**
 * Analytics range selection: inclusive local calendar ranges. Week boundaries use Monday as the
 * first day (workforce reporting); keep in sync with backend aggregation when APIs land.
 */

export type AnalyticsGranularity = "day" | "week" | "month" | "year";

export interface AnalyticsRangeSelection {
  granularity: AnalyticsGranularity;
  /** Inclusive start (local calendar YYYY-MM-DD). */
  rangeStartYmd: string;
  /** Inclusive end (local calendar YYYY-MM-DD). */
  rangeEndYmd: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM-DD in local calendar. */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parse local YYYY-MM-DD to a Date at local midnight. */
export function fromLocalYmd(ymd: string): Date {
  const parts = ymd.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (
    y === undefined ||
    m === undefined ||
    day === undefined ||
    Number.isNaN(y) ||
    Number.isNaN(m) ||
    Number.isNaN(day)
  ) {
    return new Date(0);
  }
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}

export function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

/** First day of month YYYY-MM from YYYY-MM-DD. */
export function ymdToMonthKey(ymd: string): string {
  return ymd.slice(0, 7);
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addLocalDays(d: Date, delta: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + delta);
  return x;
}

/**
 * Monday 00:00:00 local of the week containing `d`.
 */
export function startOfWeekMonday(d: Date): Date {
  const day = d.getDay();
  const offsetFromMonday = day === 0 ? -6 : 1 - day;
  return startOfLocalDay(addLocalDays(d, offsetFromMonday));
}

export function endOfWeekFromMonday(monday: Date): Date {
  const sunday = addLocalDays(monday, 6);
  return endOfLocalDay(sunday);
}

const MONTH_NAMES_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function formatShortMonthDay(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatMediumDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Default span per granularity (align with future API "points" / windows).
 * day: 30 days, week: 12 weeks, month: 12 months, year: 5 years.
 */
export function createDefaultRangeForGranularity(
  granularity: AnalyticsGranularity,
  now: Date = new Date(),
): AnalyticsRangeSelection {
  const endDay = startOfLocalDay(now);
  switch (granularity) {
    case "day": {
      const start = addLocalDays(endDay, -29);
      return {
        granularity: "day",
        rangeStartYmd: toLocalYmd(start),
        rangeEndYmd: toLocalYmd(endDay),
      };
    }
    case "week": {
      const thisMonday = startOfWeekMonday(now);
      const startMonday = addLocalDays(thisMonday, -11 * 7);
      const endSunday = endOfWeekFromMonday(thisMonday);
      return {
        granularity: "week",
        rangeStartYmd: toLocalYmd(startOfLocalDay(startMonday)),
        rangeEndYmd: toLocalYmd(endSunday),
      };
    }
    case "month": {
      const y = endDay.getFullYear();
      const m = endDay.getMonth();
      let startY = y;
      let startM = m - 11;
      while (startM < 0) {
        startM += 12;
        startY -= 1;
      }
      const rangeStart = new Date(startY, startM, 1, 0, 0, 0, 0);
      const rangeEnd = new Date(y, m + 1, 0, 23, 59, 59, 999);
      return {
        granularity: "month",
        rangeStartYmd: toLocalYmd(rangeStart),
        rangeEndYmd: toLocalYmd(rangeEnd),
      };
    }
    case "year": {
      const cy = endDay.getFullYear();
      const startY = cy - 4;
      return {
        granularity: "year",
        rangeStartYmd: toLocalYmd(new Date(startY, 0, 1, 0, 0, 0, 0)),
        rangeEndYmd: toLocalYmd(endOfLocalDay(new Date(cy, 11, 31))),
      };
    }
    default: {
      const _e: never = granularity;
      return _e;
    }
  }
}

export function createTrailingDayRangeSelection(
  daysBack: number,
  now: Date = new Date(),
): AnalyticsRangeSelection {
  const endDay = startOfLocalDay(now);
  const startDay = addLocalDays(endDay, -Math.max(0, daysBack));
  return {
    granularity: "day",
    rangeStartYmd: toLocalYmd(startDay),
    rangeEndYmd: toLocalYmd(endDay),
  };
}

export function createCurrentMonthToDateRangeSelection(
  now: Date = new Date(),
): AnalyticsRangeSelection {
  const endDay = startOfLocalDay(now);
  return {
    granularity: "month",
    rangeStartYmd: toLocalYmd(new Date(endDay.getFullYear(), endDay.getMonth(), 1, 0, 0, 0, 0)),
    rangeEndYmd: toLocalYmd(endDay),
  };
}

/** Ensure start <= end by swapping if needed. */
export function normalizeRangeYmd(startYmd: string, endYmd: string): { rangeStartYmd: string; rangeEndYmd: string } {
  if (compareYmd(startYmd, endYmd) <= 0) {
    return { rangeStartYmd: startYmd, rangeEndYmd: endYmd };
  }
  return { rangeStartYmd: endYmd, rangeEndYmd: startYmd };
}

/** Human-readable trigger / Period line. */
export function formatAnalyticsRangeSummary(selection: AnalyticsRangeSelection): string {
  const { granularity, rangeStartYmd, rangeEndYmd } = selection;
  const a = fromLocalYmd(rangeStartYmd);
  const b = fromLocalYmd(rangeEndYmd);
  const prefix =
    granularity === "day"
      ? "Day"
      : granularity === "week"
        ? "Week"
        : granularity === "month"
          ? "Month"
          : "Year";
  if (rangeStartYmd === rangeEndYmd) {
    return `${prefix} · ${formatMediumDate(a)}`;
  }
  return `${prefix} · ${formatMediumDate(a)} – ${formatMediumDate(b)}`;
}

/** Week rows for grid: Monday starts, newest first. */
export function buildWeekRows(count: number, now: Date = new Date()): { mondayYmd: string; label: string }[] {
  const out: { mondayYmd: string; label: string }[] = [];
  let mon = startOfWeekMonday(now);
  for (let i = 0; i < count; i++) {
    const sun = endOfWeekFromMonday(mon);
    out.push({
      mondayYmd: toLocalYmd(mon),
      label: `${formatShortMonthDay(mon)} – ${formatShortMonthDay(sun)}`,
    });
    mon = addLocalDays(mon, -7);
    mon = startOfLocalDay(mon);
  }
  return out;
}

/** Month key YYYY-MM for grid. */
export function monthKey(year: number, monthIndex: number): string {
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function parseMonthKey(key: string): { year: number; monthIndex: number } | null {
  const [ys, ms] = key.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (Number.isNaN(y) || Number.isNaN(m) || m < 1 || m > 12) {
    return null;
  }
  return { year: y, monthIndex: m - 1 };
}

export function monthKeyBounds(key: string): { rangeStartYmd: string; rangeEndYmd: string } | null {
  const p = parseMonthKey(key);
  if (!p) {
    return null;
  }
  const start = new Date(p.year, p.monthIndex, 1, 0, 0, 0, 0);
  const end = new Date(p.year, p.monthIndex + 1, 0, 23, 59, 59, 999);
  return { rangeStartYmd: toLocalYmd(start), rangeEndYmd: toLocalYmd(end) };
}

/** One chart row / aggregation bucket inside an inclusive analytics range. */
export interface AnalyticsBucket {
  /** Stable id (e.g. YYYY-MM-DD for a day, Monday YMD for a week). */
  key: string;
  /** Short label for chart axes / tooltips. */
  label: string;
}

/** Normalize selection so `rangeStartYmd` <= `rangeEndYmd`. */
export function normalizeRange(selection: AnalyticsRangeSelection): AnalyticsRangeSelection {
  const { rangeStartYmd, rangeEndYmd } = normalizeRangeYmd(selection.rangeStartYmd, selection.rangeEndYmd);
  return { ...selection, rangeStartYmd, rangeEndYmd };
}

/** Monday-based week index (1-based) within the calendar month of `monday`. Matches picker week rows. */
function weekNumberInMonth(monday: Date): number {
  const year = monday.getFullYear();
  const month = monday.getMonth();
  const first = new Date(year, month, 1);
  const dow = first.getDay();
  const offsetToMonday = dow === 0 ? -6 : dow === 1 ? 0 : -(dow - 1);
  let m = new Date(year, month, 1 + offsetToMonday);
  if (m.getMonth() < month || m.getFullYear() < year) {
    m.setDate(m.getDate() + 7);
  }
  const targetYmd = toLocalYmd(monday);
  let weekNum = 1;
  while (m.getMonth() === month && m.getFullYear() === year) {
    if (toLocalYmd(startOfLocalDay(m)) === targetYmd) {
      return weekNum;
    }
    m.setDate(m.getDate() + 7);
    weekNum += 1;
  }
  return 1;
}

function formatWeekBucketLabel(monday: Date): string {
  const sun = addLocalDays(monday, 6);
  return `${formatShortMonthDay(monday)} – ${formatShortMonthDay(sun)}`;
}

/**
 * Ordered buckets covering the inclusive range, aligned to `granularity`.
 */
export function eachBucketInRange(selection: AnalyticsRangeSelection): AnalyticsBucket[] {
  const { granularity, rangeStartYmd, rangeEndYmd } = normalizeRange(selection);
  const startDay = startOfLocalDay(fromLocalYmd(rangeStartYmd));
  const endDay = startOfLocalDay(fromLocalYmd(rangeEndYmd));

  if (compareYmd(rangeStartYmd, rangeEndYmd) > 0) {
    return [];
  }

  switch (granularity) {
    case "day": {
      const out: AnalyticsBucket[] = [];
      for (let d = new Date(startDay); d.getTime() <= endDay.getTime(); d = addLocalDays(d, 1)) {
        const ymd = toLocalYmd(d);
        out.push({ key: ymd, label: formatShortMonthDay(d) });
      }
      return out;
    }
    case "week": {
      const out: AnalyticsBucket[] = [];
      const firstMonday = startOfWeekMonday(startDay);
      const lastMonday = startOfWeekMonday(endDay);
      for (let m = new Date(firstMonday); m.getTime() <= lastMonday.getTime(); m = addLocalDays(m, 7)) {
        const mon = startOfLocalDay(m);
        out.push({
          key: toLocalYmd(mon),
          label: formatWeekBucketLabel(mon),
        });
      }
      return out;
    }
    case "month": {
      const out: AnalyticsBucket[] = [];
      let y = startDay.getFullYear();
      let mi = startDay.getMonth();
      const endY = endDay.getFullYear();
      const endM = endDay.getMonth();
      while (y < endY || (y === endY && mi <= endM)) {
        const key = `${y}-${pad2(mi + 1)}`;
        out.push({ key, label: `${MONTH_NAMES_SHORT[mi]} ${y}` });
        mi += 1;
        if (mi > 11) {
          mi = 0;
          y += 1;
        }
      }
      return out;
    }
    case "year": {
      const out: AnalyticsBucket[] = [];
      const y0 = startDay.getFullYear();
      const y1 = endDay.getFullYear();
      for (let y = y0; y <= y1; y += 1) {
        out.push({ key: String(y), label: String(y) });
      }
      return out;
    }
    default: {
      const _exhaustive: never = granularity;
      return _exhaustive;
    }
  }
}

/** Number of aggregation buckets in the inclusive range. */
export function countBuckets(selection: AnalyticsRangeSelection): number {
  return eachBucketInRange(selection).length;
}

/** Every calendar day YYYY-MM-DD from range start through end (inclusive). For event logs / daily sampling. */
export function eachCalendarDayYmdInRange(selection: AnalyticsRangeSelection): string[] {
  const { rangeStartYmd, rangeEndYmd } = normalizeRange(selection);
  const startDay = startOfLocalDay(fromLocalYmd(rangeStartYmd));
  const endDay = startOfLocalDay(fromLocalYmd(rangeEndYmd));
  const out: string[] = [];
  for (let d = new Date(startDay); d.getTime() <= endDay.getTime(); d = addLocalDays(d, 1)) {
    out.push(toLocalYmd(d));
  }
  return out;
}

/** Locale date string for tables (matches prior `generateDates` style). */
export function formatYmdForEventLog(ymd: string): string {
  return fromLocalYmd(ymd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Caps row count for mock event logs when the selected range spans many days.
 * Preserves first and last days when downsampling.
 */
export function sampleCalendarDaysForEventLog(selection: AnalyticsRangeSelection, maxRows: number): string[] {
  const days = eachCalendarDayYmdInRange(selection);
  if (days.length <= maxRows) {
    return days;
  }
  const step = Math.ceil(days.length / maxRows);
  const sampled: string[] = [];
  for (let i = 0; i < days.length; i += step) {
    const y = days[i];
    if (y !== undefined) {
      sampled.push(y);
    }
  }
  const last = days[days.length - 1];
  if (last !== undefined && sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled.slice(0, maxRows);
}

/**
 * Caption beside the delta badge (replaces “from last week”): range boundaries in human form.
 */
export function formatComparisonPeriodCaption(selection: AnalyticsRangeSelection): string {
  const { granularity, rangeStartYmd, rangeEndYmd } = normalizeRange(selection);
  const a = startOfLocalDay(fromLocalYmd(rangeStartYmd));
  const b = startOfLocalDay(fromLocalYmd(rangeEndYmd));

  if (granularity === "day") {
    if (rangeStartYmd === rangeEndYmd) {
      return `from ${formatShortMonthDay(a)}`;
    }
    return `from ${formatShortMonthDay(a)} to ${formatShortMonthDay(b)}`;
  }

  if (granularity === "week") {
    const monA = startOfWeekMonday(a);
    const monB = startOfWeekMonday(b);
    const wA = weekNumberInMonth(monA);
    const wB = weekNumberInMonth(monB);
    const mA = MONTH_NAMES_SHORT[monA.getMonth()];
    const mB = MONTH_NAMES_SHORT[monB.getMonth()];
    if (toLocalYmd(monA) === toLocalYmd(monB)) {
      return `from W${wA} ${mA}`;
    }
    return `from W${wA} ${mA} to W${wB} ${mB}`;
  }

  if (granularity === "month") {
    const sameYear = a.getFullYear() === b.getFullYear();
    const sameMonth = a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
    if (sameMonth) {
      return `from ${MONTH_NAMES_SHORT[a.getMonth()]} ${a.getFullYear()}`;
    }
    if (sameYear) {
      return `from ${MONTH_NAMES_SHORT[a.getMonth()]} to ${MONTH_NAMES_SHORT[b.getMonth()]}`;
    }
    return `from ${MONTH_NAMES_SHORT[a.getMonth()]} ${a.getFullYear()} to ${MONTH_NAMES_SHORT[b.getMonth()]} ${b.getFullYear()}`;
  }

  if (granularity === "year") {
    const yA = a.getFullYear();
    const yB = b.getFullYear();
    if (yA === yB) {
      return `from ${yA}`;
    }
    return `from ${yA} to ${yB}`;
  }

  const _never: never = granularity;
  return _never;
}

export { MONTH_NAMES, MONTH_NAMES_SHORT };
