import { callOdooKw, toOdooDatetime, parseUtcTimestamp } from './odoo.service.js';

export type PosAnalyticsGranularity = 'day' | 'week' | 'month';

export interface PosAnalyticsRangeSelection {
  granularity: PosAnalyticsGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface PosAnalyticsBranchInput {
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

export interface PosAnalyticsBucketDefinition {
  key: string;
  label: string;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface PosAnalyticsBucket extends PosAnalyticsBucketDefinition, PosAnalyticsSnapshot {}

export interface PosAnalyticsResult {
  selection: {
    currentRange: PosAnalyticsRangeSelection;
    previousRange: PosAnalyticsRangeSelection;
  };
  selectedBranches: PosAnalyticsBranchInput[];
  current: PosAnalyticsSnapshot;
  previousPeriod: PosAnalyticsSnapshot;
  currentBuckets: PosAnalyticsBucket[];
  sessions: PosSessionDetail[];
  branchComparison: Array<{
    branch: PosAnalyticsBranchInput;
    current: PosAnalyticsSnapshot;
    previousPeriod: PosAnalyticsSnapshot;
  }>;
}

type OdooKwCallFn = (
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
) => Promise<unknown>;

interface PosSessionAggregate extends PosSessionDetail {
  refundProductBreakdown: Array<{ product: string; total: number; count: number }>;
}

// ─── Odoo Row Types ───────────────────────────────────────────────────────────

interface OdooPosSessionRow {
  name?: string | null;
  company_id?: [number, string] | false;
  start_at?: string | null;
  stop_at?: string | null;
  state?: string | null;
  cash_register_balance_start?: number | string | null;
  cash_register_balance_end?: number | string | null;
  cash_register_balance_end_real?: number | string | null;
  order_ids?: number[] | null;
  x_payment_methods?: Array<{
    amount?: number | string | null;
    payment_method_id?: number;
    payment_method_name?: string;
  }> | null;
  x_discount_orders?: Array<{
    price_unit?: number | string | null;
    product_id?: number;
    product_name?: string;
    qty?: number | string | null;
  }> | null;
  x_refund_orders?: Array<{
    price_unit?: number | string | null;
    product_id?: number;
    product_name?: string;
    qty?: number | string | null;
  }> | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MANILA_TIME_ZONE = 'Asia/Manila';

const shortMonthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  month: 'short',
  day: 'numeric',
});

const manilaYmdFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// ─── Date Utilities ───────────────────────────────────────────────────────────

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseYmdToUtcDate(ymd: string): Date {
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function formatUtcDateToYmd(date: Date): string {
  return [
    String(date.getUTCFullYear()),
    pad2(date.getUTCMonth() + 1),
    pad2(date.getUTCDate()),
  ].join('-');
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addYmdDays(ymd: string, days: number): string {
  return formatUtcDateToYmd(addUtcDays(parseYmdToUtcDate(ymd), days));
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

function startOfWeekMondayYmd(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  const day = date.getUTCDay();
  const offsetFromMonday = day === 0 ? -6 : 1 - day;
  return formatUtcDateToYmd(addUtcDays(date, offsetFromMonday));
}

function endOfWeekSundayYmd(ymd: string): string {
  return addYmdDays(startOfWeekMondayYmd(ymd), 6);
}

function startOfMonthYmd(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  return formatUtcDateToYmd(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
}

function endOfMonthYmd(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  return formatUtcDateToYmd(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

function formatDayLabel(ymd: string): string {
  return shortMonthFormatter.format(parseYmdToUtcDate(ymd));
}

function formatWeekLabel(rangeStartYmd: string, rangeEndYmd: string): string {
  return `${formatDayLabel(rangeStartYmd)} – ${formatDayLabel(rangeEndYmd)}`;
}

function formatMonthLabel(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', year: 'numeric' });
}

function formatDateInManilaYmd(date: Date): string {
  const parts = manilaYmdFormatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function toManilaRangeDatetimes(range: Pick<PosAnalyticsRangeSelection, 'rangeStartYmd' | 'rangeEndYmd'>): {
  startAtUtc: string;
  endAtUtc: string;
} {
  const startAtUtc = toOdooDatetime(new Date(`${range.rangeStartYmd}T00:00:00+08:00`));
  const endAtUtc = toOdooDatetime(new Date(`${range.rangeEndYmd}T23:59:59+08:00`));
  return { startAtUtc, endAtUtc };
}

function toNumber(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetweenInclusive(rangeStartYmd: string, rangeEndYmd: string): number {
  return (
    Math.floor(
      (parseYmdToUtcDate(rangeEndYmd).getTime() - parseYmdToUtcDate(rangeStartYmd).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1
  );
}

// ─── Previous Range ────────────────────────────────────────────────────────────

export function getPosAnalyticsPreviousRange(
  selection: PosAnalyticsRangeSelection,
): PosAnalyticsRangeSelection {
  const { granularity, rangeStartYmd, rangeEndYmd } = selection;
  const days = daysBetweenInclusive(rangeStartYmd, rangeEndYmd);

  if (granularity === 'day' || granularity === 'week') {
    return {
      granularity,
      rangeStartYmd: addYmdDays(rangeStartYmd, -days),
      rangeEndYmd: addYmdDays(rangeStartYmd, -1),
    };
  }

  const startMonth = parseYmdToUtcDate(startOfMonthYmd(rangeStartYmd));
  const endMonth = parseYmdToUtcDate(startOfMonthYmd(rangeEndYmd));
  const monthCount =
    (endMonth.getUTCFullYear() - startMonth.getUTCFullYear()) * 12
    + (endMonth.getUTCMonth() - startMonth.getUTCMonth())
    + 1;
  const previousPeriodEnd = new Date(Date.UTC(startMonth.getUTCFullYear(), startMonth.getUTCMonth(), 0));
  const previousPeriodStart = new Date(
    Date.UTC(previousPeriodEnd.getUTCFullYear(), previousPeriodEnd.getUTCMonth() - monthCount + 1, 1),
  );

  return {
    granularity,
    rangeStartYmd: formatUtcDateToYmd(previousPeriodStart),
    rangeEndYmd: formatUtcDateToYmd(previousPeriodEnd),
  };
}

// ─── Bucket Building ──────────────────────────────────────────────────────────

export function buildPosBuckets(
  selection: PosAnalyticsRangeSelection,
): PosAnalyticsBucketDefinition[] {
  const { granularity, rangeStartYmd, rangeEndYmd } = selection;
  const buckets: PosAnalyticsBucketDefinition[] = [];

  if (granularity === 'day') {
    let cursor = rangeStartYmd;
    while (compareYmd(cursor, rangeEndYmd) <= 0) {
      buckets.push({
        key: cursor,
        label: formatDayLabel(cursor),
        rangeStartYmd: cursor,
        rangeEndYmd: cursor,
      });
      cursor = addYmdDays(cursor, 1);
    }
    return buckets;
  }

  if (granularity === 'week') {
    let weekStart = startOfWeekMondayYmd(rangeStartYmd);
    while (compareYmd(weekStart, rangeEndYmd) <= 0) {
      const weekEnd = endOfWeekSundayYmd(weekStart);
      buckets.push({
        key: weekStart,
        label: formatWeekLabel(weekStart, weekEnd),
        rangeStartYmd: weekStart,
        rangeEndYmd: weekEnd,
      });
      weekStart = addYmdDays(weekStart, 7);
    }
    return buckets;
  }

  // month
  let monthStart = startOfMonthYmd(rangeStartYmd);
  while (compareYmd(monthStart, rangeEndYmd) <= 0) {
    const monthEnd = endOfMonthYmd(monthStart);
    buckets.push({
      key: monthStart,
      label: formatMonthLabel(monthStart),
      rangeStartYmd: monthStart,
      rangeEndYmd: monthEnd,
    });
    monthStart = addYmdDays(endOfMonthYmd(monthStart), 1);
  }
  return buckets;
}

// ─── Session Computation ──────────────────────────────────────────────────────

function computeNetSales(row: OdooPosSessionRow): number {
  if (!Array.isArray(row.x_payment_methods)) return 0;
  return row.x_payment_methods.reduce((sum, pm) => sum + Math.abs(toNumber(pm.amount)), 0);
}

function computeDiscounts(row: OdooPosSessionRow): number {
  if (!Array.isArray(row.x_discount_orders)) return 0;
  return row.x_discount_orders.reduce((sum, d) => sum + Math.abs(toNumber(d.price_unit)), 0);
}

function computeRefunds(row: OdooPosSessionRow): number {
  if (!Array.isArray(row.x_refund_orders)) return 0;
  return row.x_refund_orders.reduce(
    (sum, r) => sum + Math.abs(toNumber(r.price_unit) * toNumber(r.qty)),
    0,
  );
}

function computePaymentBreakdown(row: OdooPosSessionRow): Array<{ method: string; amount: number }> {
  if (!Array.isArray(row.x_payment_methods)) return [];
  const map = new Map<string, number>();
  for (const pm of row.x_payment_methods) {
    const method = pm.payment_method_name ?? 'Unknown';
    map.set(method, (map.get(method) ?? 0) + Math.abs(toNumber(pm.amount)));
  }
  return Array.from(map.entries())
    .map(([method, amount]) => ({ method, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);
}

function computeRefundProductBreakdown(
  row: OdooPosSessionRow,
): Array<{ product: string; total: number; count: number }> {
  if (!Array.isArray(row.x_refund_orders)) return [];
  const map = new Map<string, { total: number; count: number }>();
  for (const r of row.x_refund_orders) {
    const product = r.product_name ?? 'Unknown';
    const value = Math.abs(toNumber(r.price_unit) * toNumber(r.qty));
    const count = Math.abs(toNumber(r.qty)) || 1;
    const current = map.get(product) ?? { total: 0, count: 0 };
    map.set(product, {
      total: current.total + value,
      count: current.count + count,
    });
  }
  return Array.from(map.entries())
    .map(([product, totals]) => ({ product, total: round2(totals.total), count: round2(totals.count) }))
    .sort((a, b) => b.count - a.count || b.total - a.total);
}

function computeDurationMinutes(row: OdooPosSessionRow): number | null {
  if (!row.start_at || !row.stop_at) return null;
  const start = parseUtcTimestamp(row.start_at);
  const stop = parseUtcTimestamp(row.stop_at);
  const diffMs = stop.getTime() - start.getTime();
  if (diffMs < 0) return null;
  return round2(diffMs / (1000 * 60));
}

function rowToSessionDetail(
  row: OdooPosSessionRow,
  branch: PosAnalyticsBranchInput,
): PosSessionAggregate {
  const netSales = round2(computeNetSales(row));
  const discounts = round2(computeDiscounts(row));
  const refunds = round2(computeRefunds(row));
  const grossSales = round2(netSales + discounts + refunds);
  const expectedClosingCash = round2(toNumber(row.cash_register_balance_end));
  const actualClosingCash = round2(toNumber(row.cash_register_balance_end_real));
  const cashVariance = round2(actualClosingCash - expectedClosingCash);
  const refundProductBreakdown = computeRefundProductBreakdown(row);

  return {
    sessionName: row.name ?? '',
    branchId: branch.id,
    branchName: branch.name,
    companyId: branch.odooCompanyId,
    startAt: row.start_at ?? '',
    stopAt: row.stop_at ?? null,
    state: (row.state === 'opened' ? 'opened' : 'closed') as 'opened' | 'closed',
    openingCash: round2(toNumber(row.cash_register_balance_start)),
    expectedClosingCash,
    actualClosingCash,
    cashVariance,
    netSales,
    grossSales,
    discounts,
    refunds,
    transactionCount: Array.isArray(row.order_ids) ? row.order_ids.length : 0,
    durationMinutes: computeDurationMinutes(row),
    paymentBreakdown: computePaymentBreakdown(row),
    topRefundedProducts: refundProductBreakdown.slice(0, 3),
    refundProductBreakdown,
  };
}

// ─── Snapshot Aggregation ─────────────────────────────────────────────────────

const EMPTY_SNAPSHOT: PosAnalyticsSnapshot = {
  totalSessions: 0,
  netSales: 0,
  grossSales: 0,
  discounts: 0,
  refunds: 0,
  avgSalesPerSession: 0,
  openingCash: 0,
  expectedClosingCash: 0,
  actualClosingCash: 0,
  cashVariance: 0,
  totalTransactions: 0,
  avgTransactionsPerSession: 0,
  avgDurationMinutes: 0,
  paymentBreakdown: [],
  topRefundedProducts: [],
};

function aggregateSessionsToSnapshot(sessions: PosSessionAggregate[]): PosAnalyticsSnapshot {
  if (sessions.length === 0) return { ...EMPTY_SNAPSHOT };

  const totalSessions = sessions.length;
  const netSales = round2(sessions.reduce((s, d) => s + d.netSales, 0));
  const grossSales = round2(sessions.reduce((s, d) => s + d.grossSales, 0));
  const discounts = round2(sessions.reduce((s, d) => s + d.discounts, 0));
  const refunds = round2(sessions.reduce((s, d) => s + d.refunds, 0));
  const avgSalesPerSession = round2(netSales / totalSessions);
  const openingCash = round2(sessions.reduce((s, d) => s + d.openingCash, 0));
  const expectedClosingCash = round2(sessions.reduce((s, d) => s + d.expectedClosingCash, 0));
  const actualClosingCash = round2(sessions.reduce((s, d) => s + d.actualClosingCash, 0));
  const cashVariance = round2(actualClosingCash - expectedClosingCash);
  const totalTransactions = sessions.reduce((s, d) => s + d.transactionCount, 0);
  const avgTransactionsPerSession = round2(totalTransactions / totalSessions);

  const durationsWithValue = sessions.map((d) => d.durationMinutes).filter((d): d is number => d !== null);
  const avgDurationMinutes = durationsWithValue.length > 0
    ? round2(durationsWithValue.reduce((s, d) => s + d, 0) / durationsWithValue.length)
    : 0;

  // Aggregate payment breakdown
  const pmMap = new Map<string, number>();
  for (const session of sessions) {
    for (const pm of session.paymentBreakdown) {
      pmMap.set(pm.method, (pmMap.get(pm.method) ?? 0) + pm.amount);
    }
  }
  const paymentBreakdown = Array.from(pmMap.entries())
    .map(([method, amount]) => ({ method, amount: round2(amount) }))
    .sort((a, b) => b.amount - a.amount);

  // Aggregate top refunded products
  const rpMap = new Map<string, { total: number; count: number }>();
  for (const session of sessions) {
    for (const rp of session.refundProductBreakdown) {
      const current = rpMap.get(rp.product) ?? { total: 0, count: 0 };
      rpMap.set(rp.product, {
        total: current.total + rp.total,
        count: current.count + rp.count,
      });
    }
  }
  const topRefundedProducts = Array.from(rpMap.entries())
    .map(([product, totals]) => ({ product, total: round2(totals.total), count: round2(totals.count) }))
    .sort((a, b) => b.count - a.count || b.total - a.total)
    .slice(0, 3);

  return {
    totalSessions,
    netSales,
    grossSales,
    discounts,
    refunds,
    avgSalesPerSession,
    openingCash,
    expectedClosingCash,
    actualClosingCash,
    cashVariance,
    totalTransactions,
    avgTransactionsPerSession,
    avgDurationMinutes,
    paymentBreakdown,
    topRefundedProducts,
  };
}

// ─── Odoo Fetch ───────────────────────────────────────────────────────────────

const POS_SESSION_FIELDS = [
  'name',
  'company_id',
  'start_at',
  'stop_at',
  'state',
  'cash_register_balance_start',
  'cash_register_balance_end',
  'cash_register_balance_end_real',
  'order_ids',
  'x_payment_methods',
  'x_discount_orders',
  'x_refund_orders',
];

async function fetchOdooPosSessionsForRange(
  odooCompanyIds: number[],
  rangeStartYmd: string,
  rangeEndYmd: string,
  deps?: {
    callOdooKwFn?: OdooKwCallFn;
  },
): Promise<OdooPosSessionRow[]> {
  const callOdooKwFn = deps?.callOdooKwFn ?? callOdooKw;
  const { startAtUtc, endAtUtc } = toManilaRangeDatetimes({ rangeStartYmd, rangeEndYmd });

  const domain = [
    '&',
    '&',
    ['company_id', 'in', odooCompanyIds],
    ['state', 'in', ['opened', 'closed']],
    ['start_at', '>=', startAtUtc],
    ['start_at', '<=', endAtUtc],
  ];

  const rows = await callOdooKwFn('pos.session', 'search_read', [domain], {
    fields: POS_SESSION_FIELDS,
    limit: 0,
  });

  return (rows as OdooPosSessionRow[]) ?? [];
}

function toPublicSessionDetail(session: PosSessionAggregate): PosSessionDetail {
  const { refundProductBreakdown: _refundProductBreakdown, ...publicSession } = session;
  return publicSession;
}

export async function listPosSessionsForRange(
  input: {
    rangeStartYmd: string;
    rangeEndYmd: string;
    branches: PosAnalyticsBranchInput[];
  },
  deps?: {
    callOdooKwFn?: OdooKwCallFn;
  },
): Promise<PosSessionDetail[]> {
  const branchByCompanyId = new Map(input.branches.map((branch) => [branch.odooCompanyId, branch]));
  const rawRows = await fetchOdooPosSessionsForRange(
    input.branches.map((branch) => branch.odooCompanyId),
    input.rangeStartYmd,
    input.rangeEndYmd,
    deps,
  );

  return rawRows.map((row) => {
    const companyId = Array.isArray(row.company_id) ? row.company_id[0] : 0;
    const branch = branchByCompanyId.get(companyId) ?? input.branches[0]!;
    return toPublicSessionDetail(rowToSessionDetail(row, branch));
  });
}

// ─── YMD Range Membership ─────────────────────────────────────────────────────

function isSessionInYmdRange(
  session: PosSessionDetail,
  rangeStartYmd: string,
  rangeEndYmd: string,
): boolean {
  if (!session.startAt) return false;
  const startDate = parseUtcTimestamp(session.startAt);
  const sessionYmd = formatDateInManilaYmd(startDate);
  return compareYmd(sessionYmd, rangeStartYmd) >= 0 && compareYmd(sessionYmd, rangeEndYmd) <= 0;
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export async function getPosAnalytics(input: {
  granularity: PosAnalyticsGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
  branches: PosAnalyticsBranchInput[];
}, deps?: {
  callOdooKwFn?: OdooKwCallFn;
}): Promise<PosAnalyticsResult> {
  const { granularity, rangeStartYmd, rangeEndYmd, branches } = input;

  const currentRange: PosAnalyticsRangeSelection = { granularity, rangeStartYmd, rangeEndYmd };
  const previousRange = getPosAnalyticsPreviousRange(currentRange);

  const odooCompanyIds = branches.map((b) => b.odooCompanyId);
  const branchByCompanyId = new Map(branches.map((b) => [b.odooCompanyId, b]));

  // Determine the combined fetch window (min start, max end of current + previous)
  const fetchStart = compareYmd(previousRange.rangeStartYmd, rangeStartYmd) < 0
    ? previousRange.rangeStartYmd
    : rangeStartYmd;
  const fetchEnd = compareYmd(previousRange.rangeEndYmd, rangeEndYmd) > 0
    ? previousRange.rangeEndYmd
    : rangeEndYmd;

  const rawRows = await fetchOdooPosSessionsForRange(odooCompanyIds, fetchStart, fetchEnd, deps);

  // Map rows to session details
  const allSessions: PosSessionAggregate[] = rawRows.map((row) => {
    const companyId = Array.isArray(row.company_id) ? row.company_id[0] : 0;
    const branch = branchByCompanyId.get(companyId) ?? branches[0]!;
    return rowToSessionDetail(row, branch);
  });

  // Partition into current / previous
  const currentSessions = allSessions.filter((s) =>
    isSessionInYmdRange(s, rangeStartYmd, rangeEndYmd),
  );
  const previousSessions = allSessions.filter((s) =>
    isSessionInYmdRange(s, previousRange.rangeStartYmd, previousRange.rangeEndYmd),
  );

  const current = aggregateSessionsToSnapshot(currentSessions);
  const previousPeriod = aggregateSessionsToSnapshot(previousSessions);

  // Build time buckets for current period
  const bucketDefs = buildPosBuckets(currentRange);
  const currentBuckets: PosAnalyticsBucket[] = bucketDefs.map((def) => {
    const bucketSessions = currentSessions.filter((s) =>
      isSessionInYmdRange(s, def.rangeStartYmd, def.rangeEndYmd),
    );
    return {
      ...def,
      ...aggregateSessionsToSnapshot(bucketSessions),
    };
  });

  // Branch comparison
  const branchComparison = branches.map((branch) => {
    const branchCurrentSessions = currentSessions.filter((s) => s.branchId === branch.id);
    const branchPreviousSessions = previousSessions.filter((s) => s.branchId === branch.id);
    return {
      branch,
      current: aggregateSessionsToSnapshot(branchCurrentSessions),
      previousPeriod: aggregateSessionsToSnapshot(branchPreviousSessions),
    };
  });

  return {
    selection: { currentRange, previousRange },
    selectedBranches: branches,
    current,
    previousPeriod,
    currentBuckets,
    sessions: currentSessions.map(toPublicSessionDetail),
    branchComparison,
  };
}
