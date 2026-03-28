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

export { MONTH_NAMES, MONTH_NAMES_SHORT };
