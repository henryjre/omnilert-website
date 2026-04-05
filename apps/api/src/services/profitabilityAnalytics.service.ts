import { callOdooKw, parseUtcTimestamp, toOdooDatetime } from './odoo.service.js';

type OdooKwCallFn = (
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
) => Promise<unknown>;

export type ProfitabilityGranularity = 'day' | 'week' | 'month' | 'year';

export interface ProfitabilityRangeSelection {
  granularity: ProfitabilityGranularity;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface ProfitabilityAnalyticsBranchInput {
  id: string;
  name: string;
  companyId: string;
  companyName: string;
  odooCompanyId: number;
  variableExpenseVendorIds: number[];
  overheadAccountIds: number[];
}

export interface ProfitabilitySnapshot {
  grossSales: number;
  discounts: number;
  refunds: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
  variableExpenses: number;
  grossSalary: number;
  operatingProfit: number;
  overheadExpenses: number;
  netProfit: number;
  grossMarginPct: number;
  netMarginPct: number;
  expenseRatio: number;
  overheadSource: 'actual' | 'estimated';
  netProfitSource: 'actual' | 'estimated';
}

export interface ProfitabilityBucketDefinition {
  key: string;
  label: string;
  rangeStartYmd: string;
  rangeEndYmd: string;
}

export interface ProfitabilityBucketSnapshot extends ProfitabilityBucketDefinition, ProfitabilitySnapshot {}

export interface ProfitabilityAnalyticsResult {
  selection: {
    currentRange: ProfitabilityRangeSelection;
    previousRange: ProfitabilityRangeSelection;
  };
  selectedBranches: ProfitabilityAnalyticsBranchInput[];
  current: ProfitabilitySnapshot;
  previousPeriod: ProfitabilitySnapshot;
  currentBuckets: ProfitabilityBucketSnapshot[];
  branchComparison: Array<{
    branch: ProfitabilityAnalyticsBranchInput;
    current: ProfitabilitySnapshot;
    previousPeriod: ProfitabilitySnapshot;
  }>;
}

interface OdooPosSessionRow {
  name?: string | null;
  company_id?: [number, string] | false;
  start_at?: string | null;
  x_discount_orders?: Array<{
    price_unit?: number | string | null;
  }> | null;
  x_refund_orders?: Array<{
    price_unit?: number | string | null;
    qty?: number | string | null;
  }> | null;
  x_payment_methods?: Array<{
    amount?: number | string | null;
  }> | null;
}

interface OdooAccountMoveLineRow {
  ref?: string | null;
  company_id?: [number, string] | false;
  date?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
}

interface OdooPurchaseOrderRow {
  company_id?: [number, string] | false;
  date_approve?: string | null;
  amount_total?: number | string | null;
}

interface OdooWorkEntryRow {
  company_id?: [number, string] | false;
  date?: string | null;
  x_total_wage?: number | string | null;
}

interface BranchSessionMetric {
  ref: string;
  ymd: string;
  discounts: number;
  refunds: number;
  netSales: number;
  cogs: number;
}

interface BranchAmountMetric {
  ymd: string;
  amount: number;
}

interface BranchMonthlyOverheadMetric {
  monthKey: string;
  amount: number;
  hasActual: boolean;
}

interface BranchPeriodData {
  sessions: BranchSessionMetric[];
  variableExpenses: BranchAmountMetric[];
  grossSalary: BranchAmountMetric[];
  overheadExpenses: BranchMonthlyOverheadMetric[];
}

const MANILA_TIME_ZONE = 'Asia/Manila';
const COGS_ACCOUNT_IDS = [100, 2497] as const;
const VARIABLE_EXPENSE_EXCLUDED_PRODUCT_IDS = [1053, 1052, 1054] as const;
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

function normalizeRange(selection: ProfitabilityRangeSelection): ProfitabilityRangeSelection {
  if (compareYmd(selection.rangeStartYmd, selection.rangeEndYmd) <= 0) {
    return selection;
  }

  return {
    ...selection,
    rangeStartYmd: selection.rangeEndYmd,
    rangeEndYmd: selection.rangeStartYmd,
  };
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

function startOfYearYmd(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  return formatUtcDateToYmd(new Date(Date.UTC(date.getUTCFullYear(), 0, 1)));
}

function endOfYearYmd(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  return formatUtcDateToYmd(new Date(Date.UTC(date.getUTCFullYear(), 11, 31)));
}

function formatMonthLabel(ymd: string): string {
  const date = parseYmdToUtcDate(ymd);
  return date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  });
}

function formatDayLabel(ymd: string): string {
  return shortMonthFormatter.format(parseYmdToUtcDate(ymd));
}

function formatWeekLabel(rangeStartYmd: string, rangeEndYmd: string): string {
  return `${formatDayLabel(rangeStartYmd)} - ${formatDayLabel(rangeEndYmd)}`;
}

function formatDateInTimeZoneYmd(date: Date, timeZone: string): string {
  const formatter = timeZone === MANILA_TIME_ZONE
    ? manilaYmdFormatter
    : new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });

  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '1970';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function toManilaRangeDatetimes(range: Pick<ProfitabilityRangeSelection, 'rangeStartYmd' | 'rangeEndYmd'>): {
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

function sumBy<T>(rows: T[], getter: (row: T) => number): number {
  return rows.reduce((total, row) => total + getter(row), 0);
}

function isYmdInRange(ymd: string, rangeStartYmd: string, rangeEndYmd: string): boolean {
  return compareYmd(ymd, rangeStartYmd) >= 0 && compareYmd(ymd, rangeEndYmd) <= 0;
}

function monthKeyFromYmd(ymd: string): string {
  return ymd.slice(0, 7);
}

function previousMonthStartYmd(ymd: string): string {
  const monthStart = parseYmdToUtcDate(startOfMonthYmd(ymd));
  return formatUtcDateToYmd(new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1)));
}

function daysBetweenInclusive(rangeStartYmd: string, rangeEndYmd: string): number {
  return (
    Math.floor(
      (parseYmdToUtcDate(rangeEndYmd).getTime() - parseYmdToUtcDate(rangeStartYmd).getTime()) /
        (1000 * 60 * 60 * 24),
    ) + 1
  );
}

function getAccruedOverheadForRange(
  monthlyOverhead: BranchMonthlyOverheadMetric[],
  range: Pick<ProfitabilityRangeSelection, 'rangeStartYmd' | 'rangeEndYmd'>,
): {
  amount: number;
  source: 'actual' | 'estimated';
} {
  const actualByMonth = new Map<string, BranchMonthlyOverheadMetric>();
  for (const month of monthlyOverhead) {
    actualByMonth.set(month.monthKey, month);
  }

  let total = 0;
  let usedEstimate = false;

  for (
    let cursor = startOfMonthYmd(range.rangeStartYmd);
    compareYmd(cursor, range.rangeEndYmd) <= 0;
    cursor = startOfMonthYmd(addYmdDays(endOfMonthYmd(cursor), 1))
  ) {
    const monthStartYmd = cursor;
    const monthEndYmd = endOfMonthYmd(cursor);
    const monthKey = monthKeyFromYmd(cursor);
    const coveredStartYmd = compareYmd(range.rangeStartYmd, monthStartYmd) > 0
      ? range.rangeStartYmd
      : monthStartYmd;
    const coveredEndYmd = compareYmd(range.rangeEndYmd, monthEndYmd) < 0
      ? range.rangeEndYmd
      : monthEndYmd;
    const coveredDays = daysBetweenInclusive(coveredStartYmd, coveredEndYmd);
    const totalDaysInMonth = daysBetweenInclusive(monthStartYmd, monthEndYmd);

    let monthlyAmount = 0;
    const currentMonthActual = actualByMonth.get(monthKey);
    if (currentMonthActual?.hasActual) {
      monthlyAmount = currentMonthActual.amount;
    } else {
      const previousMonthActual = actualByMonth.get(monthKeyFromYmd(previousMonthStartYmd(monthStartYmd)));
      if (previousMonthActual?.hasActual) {
        monthlyAmount = previousMonthActual.amount;
        usedEstimate = true;
      }
    }

    total += (monthlyAmount * coveredDays) / totalDaysInMonth;
  }

  return {
    amount: round2(total),
    source: usedEstimate ? 'estimated' : 'actual',
  };
}

function emptySnapshot(): ProfitabilitySnapshot {
  return {
    grossSales: 0,
    discounts: 0,
    refunds: 0,
    netSales: 0,
    cogs: 0,
    grossProfit: 0,
    variableExpenses: 0,
    grossSalary: 0,
    operatingProfit: 0,
    overheadExpenses: 0,
    netProfit: 0,
    grossMarginPct: 0,
    netMarginPct: 0,
    expenseRatio: 0,
    overheadSource: 'actual',
    netProfitSource: 'actual',
  };
}

function sumDiscounts(rows: OdooPosSessionRow['x_discount_orders']): number {
  if (!Array.isArray(rows)) return 0;
  return sumBy(rows, (row) => Math.abs(toNumber(row?.price_unit)));
}

function sumRefunds(rows: OdooPosSessionRow['x_refund_orders']): number {
  if (!Array.isArray(rows)) return 0;
  return sumBy(rows, (row) => Math.abs(toNumber(row?.price_unit) * toNumber(row?.qty)));
}

function sumPayments(rows: OdooPosSessionRow['x_payment_methods']): number {
  if (!Array.isArray(rows)) return 0;
  return sumBy(rows, (row) => Math.abs(toNumber(row?.amount)));
}

function toNetAccountingAmount(debit: unknown, credit: unknown): number {
  return toNumber(debit) - toNumber(credit);
}

function aggregateBranchPeriodSnapshot(
  data: BranchPeriodData,
  range: Pick<ProfitabilityRangeSelection, 'rangeStartYmd' | 'rangeEndYmd'>,
): ProfitabilitySnapshot {
  const sessions = data.sessions.filter((row) =>
    isYmdInRange(row.ymd, range.rangeStartYmd, range.rangeEndYmd),
  );
  const variableExpenses = data.variableExpenses.filter((row) =>
    isYmdInRange(row.ymd, range.rangeStartYmd, range.rangeEndYmd),
  );
  const grossSalary = data.grossSalary.filter((row) =>
    isYmdInRange(row.ymd, range.rangeStartYmd, range.rangeEndYmd),
  );

  const discounts = round2(sumBy(sessions, (row) => row.discounts));
  const refunds = round2(sumBy(sessions, (row) => row.refunds));
  const netSales = round2(sumBy(sessions, (row) => row.netSales));
  const cogs = round2(sumBy(sessions, (row) => row.cogs));
  const variableExpenseAmount = round2(sumBy(variableExpenses, (row) => row.amount));
  const grossSalaryAmount = round2(sumBy(grossSalary, (row) => row.amount));
  const overhead = getAccruedOverheadForRange(data.overheadExpenses, range);
  const overheadExpenses = overhead.amount;
  const overheadSource = overhead.source;
  const grossSales = round2(netSales + discounts + refunds);
  const grossProfit = round2(netSales - cogs);
  const operatingProfit = round2(grossProfit - variableExpenseAmount - grossSalaryAmount);
  const netProfit = round2(operatingProfit - overheadExpenses);

  return {
    grossSales,
    discounts,
    refunds,
    netSales,
    cogs,
    grossProfit,
    variableExpenses: variableExpenseAmount,
    grossSalary: grossSalaryAmount,
    operatingProfit,
    overheadExpenses,
    netProfit,
    grossMarginPct: netSales === 0 ? 0 : round2((grossProfit / netSales) * 100),
    netMarginPct: netSales === 0 ? 0 : round2((netProfit / netSales) * 100),
    expenseRatio:
      netSales === 0
        ? 0
        : round2(((variableExpenseAmount + grossSalaryAmount + overheadExpenses) / netSales) * 100),
    overheadSource,
    netProfitSource: overheadSource,
  };
}

function aggregateSnapshots(snapshots: ProfitabilitySnapshot[]): ProfitabilitySnapshot {
  if (snapshots.length === 0) {
    return emptySnapshot();
  }

  const grossSales = round2(sumBy(snapshots, (snapshot) => snapshot.grossSales));
  const discounts = round2(sumBy(snapshots, (snapshot) => snapshot.discounts));
  const refunds = round2(sumBy(snapshots, (snapshot) => snapshot.refunds));
  const netSales = round2(sumBy(snapshots, (snapshot) => snapshot.netSales));
  const cogs = round2(sumBy(snapshots, (snapshot) => snapshot.cogs));
  const grossProfit = round2(sumBy(snapshots, (snapshot) => snapshot.grossProfit));
  const variableExpenses = round2(sumBy(snapshots, (snapshot) => snapshot.variableExpenses));
  const grossSalary = round2(sumBy(snapshots, (snapshot) => snapshot.grossSalary));
  const operatingProfit = round2(sumBy(snapshots, (snapshot) => snapshot.operatingProfit));
  const overheadExpenses = round2(sumBy(snapshots, (snapshot) => snapshot.overheadExpenses));
  const netProfit = round2(sumBy(snapshots, (snapshot) => snapshot.netProfit));
  const overheadSource: 'actual' | 'estimated' = snapshots.some(
    (snapshot) => snapshot.overheadSource === 'estimated',
  )
    ? 'estimated'
    : 'actual';

  return {
    grossSales,
    discounts,
    refunds,
    netSales,
    cogs,
    grossProfit,
    variableExpenses,
    grossSalary,
    operatingProfit,
    overheadExpenses,
    netProfit,
    grossMarginPct: netSales === 0 ? 0 : round2((grossProfit / netSales) * 100),
    netMarginPct: netSales === 0 ? 0 : round2((netProfit / netSales) * 100),
    expenseRatio:
      netSales === 0
        ? 0
        : round2(((variableExpenses + grossSalary + overheadExpenses) / netSales) * 100),
    overheadSource,
    netProfitSource: overheadSource,
  };
}

async function loadBranchPeriodData(
  branch: ProfitabilityAnalyticsBranchInput,
  range: ProfitabilityRangeSelection,
  deps?: {
    callOdooKwFn?: OdooKwCallFn;
  },
): Promise<BranchPeriodData> {
  const callOdooKwFn = deps?.callOdooKwFn ?? callOdooKw;
  const { startAtUtc, endAtUtc } = toManilaRangeDatetimes(range);
  const overheadQueryStartYmd = previousMonthStartYmd(range.rangeStartYmd);
  const overheadQueryEndYmd = endOfMonthYmd(range.rangeEndYmd);

  const posSessions = (await callOdooKwFn('pos.session', 'search_read', [], {
    domain: [
      ['company_id', 'in', [branch.odooCompanyId]],
      ['start_at', '>=', startAtUtc],
      ['start_at', '<=', endAtUtc],
    ],
    fields: [
      'name',
      'company_id',
      'start_at',
      'x_discount_orders',
      'x_refund_orders',
      'x_payment_methods',
    ],
    limit: 0,
  })) as OdooPosSessionRow[];

  const sessionRefs = posSessions
    .map((session) => String(session.name ?? '').trim())
    .filter((name) => name.length > 0);

  const cogsRows = sessionRefs.length === 0
    ? []
    : (await callOdooKwFn('account.move.line', 'search_read', [], {
      domain: [
        ['ref', 'in', sessionRefs],
        ['account_id', 'in', [...COGS_ACCOUNT_IDS]],
        ['company_id', 'in', [branch.odooCompanyId]],
      ],
      fields: ['ref', 'debit', 'credit'],
      limit: 0,
    })) as OdooAccountMoveLineRow[];

  const cogsByRef = new Map<string, number>();
  for (const row of cogsRows) {
    const ref = String(row.ref ?? '').trim();
    if (!ref) continue;
    cogsByRef.set(ref, round2((cogsByRef.get(ref) ?? 0) + toNetAccountingAmount(row.debit, row.credit)));
  }

  const sessions = posSessions.map((session) => {
    const ref = String(session.name ?? '').trim();
    const startAt = String(session.start_at ?? '').trim();
    const ymd = startAt
      ? formatDateInTimeZoneYmd(parseUtcTimestamp(startAt), MANILA_TIME_ZONE)
      : range.rangeStartYmd;

    return {
      ref,
      ymd,
      discounts: round2(sumDiscounts(session.x_discount_orders)),
      refunds: round2(sumRefunds(session.x_refund_orders)),
      netSales: round2(sumPayments(session.x_payment_methods)),
      cogs: round2(cogsByRef.get(ref) ?? 0),
    };
  });

  const purchaseOrders = branch.variableExpenseVendorIds.length === 0
    ? []
    : (await callOdooKwFn('purchase.order', 'search_read', [], {
      domain: [
        ['company_id', 'in', [branch.odooCompanyId]],
        ['partner_id', 'in', branch.variableExpenseVendorIds],
        ['date_approve', '>=', startAtUtc],
        ['date_approve', '<=', endAtUtc],
        ['product_id', 'not in', [...VARIABLE_EXPENSE_EXCLUDED_PRODUCT_IDS]],
      ],
      fields: ['company_id', 'date_approve', 'amount_total'],
      limit: 0,
    })) as OdooPurchaseOrderRow[];

  const variableExpenses = purchaseOrders.map((row) => ({
    ymd: row.date_approve
      ? formatDateInTimeZoneYmd(parseUtcTimestamp(row.date_approve), MANILA_TIME_ZONE)
      : range.rangeStartYmd,
    amount: round2(toNumber(row.amount_total)),
  }));

  const workEntries = (await callOdooKwFn('hr.work.entry', 'search_read', [], {
    domain: [
      ['company_id', 'in', [branch.odooCompanyId]],
      ['date', '>=', range.rangeStartYmd],
      ['date', '<=', range.rangeEndYmd],
    ],
    fields: ['company_id', 'date', 'x_total_wage'],
    limit: 0,
  })) as OdooWorkEntryRow[];

  const grossSalary = workEntries.map((row) => ({
    ymd: String(row.date ?? '').slice(0, 10) || range.rangeStartYmd,
    amount: round2(toNumber(row.x_total_wage)),
  }));

  const overheadRows = branch.overheadAccountIds.length === 0
    ? []
    : (await callOdooKwFn('account.move.line', 'search_read', [], {
      domain: [
        ['account_id', 'in', branch.overheadAccountIds],
        ['company_id', 'in', [branch.odooCompanyId]],
        ['date', '>=', overheadQueryStartYmd],
        ['date', '<=', overheadQueryEndYmd],
      ],
      fields: ['company_id', 'date', 'debit', 'credit'],
      limit: 0,
    })) as OdooAccountMoveLineRow[];

  const overheadByMonth = new Map<string, BranchMonthlyOverheadMetric>();
  for (const row of overheadRows) {
    const ymd = String(row.date ?? '').slice(0, 10) || range.rangeStartYmd;
    const monthKey = monthKeyFromYmd(ymd);
    const current = overheadByMonth.get(monthKey) ?? {
      monthKey,
      amount: 0,
      hasActual: false,
    };
    current.amount = round2(current.amount + toNetAccountingAmount(row.debit, row.credit));
    current.hasActual = true;
    overheadByMonth.set(monthKey, current);
  }

  return {
    sessions,
    variableExpenses,
    grossSalary,
    overheadExpenses: Array.from(overheadByMonth.values()),
  };
}

export function buildProfitabilityBuckets(
  selection: ProfitabilityRangeSelection,
): ProfitabilityBucketDefinition[] {
  const normalized = normalizeRange(selection);

  switch (normalized.granularity) {
    case 'day': {
      const buckets: ProfitabilityBucketDefinition[] = [];
      for (
        let cursor = normalized.rangeStartYmd;
        compareYmd(cursor, normalized.rangeEndYmd) <= 0;
        cursor = addYmdDays(cursor, 1)
      ) {
        buckets.push({
          key: cursor,
          label: formatDayLabel(cursor),
          rangeStartYmd: cursor,
          rangeEndYmd: cursor,
        });
      }
      return buckets;
    }
    case 'week': {
      const buckets: ProfitabilityBucketDefinition[] = [];
      for (
        let cursor = startOfWeekMondayYmd(normalized.rangeStartYmd);
        compareYmd(cursor, normalized.rangeEndYmd) <= 0;
        cursor = addYmdDays(cursor, 7)
      ) {
        const rangeStartYmd = cursor;
        const rangeEndYmd = endOfWeekSundayYmd(cursor);
        buckets.push({
          key: rangeStartYmd,
          label: formatWeekLabel(rangeStartYmd, rangeEndYmd),
          rangeStartYmd,
          rangeEndYmd,
        });
      }
      return buckets;
    }
    case 'month': {
      const buckets: ProfitabilityBucketDefinition[] = [];
      for (
        let cursor = startOfMonthYmd(normalized.rangeStartYmd);
        compareYmd(cursor, normalized.rangeEndYmd) <= 0;
        cursor = startOfMonthYmd(addYmdDays(endOfMonthYmd(cursor), 1))
      ) {
        buckets.push({
          key: cursor.slice(0, 7),
          label: formatMonthLabel(cursor),
          rangeStartYmd: cursor,
          rangeEndYmd: endOfMonthYmd(cursor),
        });
      }
      return buckets;
    }
    case 'year': {
      const buckets: ProfitabilityBucketDefinition[] = [];
      for (
        let cursor = startOfYearYmd(normalized.rangeStartYmd);
        compareYmd(cursor, normalized.rangeEndYmd) <= 0;
        cursor = startOfYearYmd(addYmdDays(endOfYearYmd(cursor), 1))
      ) {
        buckets.push({
          key: cursor.slice(0, 4),
          label: cursor.slice(0, 4),
          rangeStartYmd: cursor,
          rangeEndYmd: endOfYearYmd(cursor),
        });
      }
      return buckets;
    }
    default: {
      const exhaustive: never = normalized.granularity;
      return exhaustive;
    }
  }
}

export function getProfitabilityPreviousRange(
  selection: ProfitabilityRangeSelection,
): ProfitabilityRangeSelection {
  const normalized = normalizeRange(selection);
  const currentBuckets = buildProfitabilityBuckets(normalized);
  const firstBucket = currentBuckets[0];
  const lastBucket = currentBuckets[currentBuckets.length - 1];

  if (!firstBucket || !lastBucket) {
    return normalized;
  }

  switch (normalized.granularity) {
    case 'day': {
      const dayCount =
        Math.floor(
          (parseYmdToUtcDate(normalized.rangeEndYmd).getTime() - parseYmdToUtcDate(normalized.rangeStartYmd).getTime()) /
            (1000 * 60 * 60 * 24),
        ) + 1;
      const rangeEndYmd = addYmdDays(normalized.rangeStartYmd, -1);
      const rangeStartYmd = addYmdDays(rangeEndYmd, -(dayCount - 1));
      return {
        granularity: 'day',
        rangeStartYmd,
        rangeEndYmd,
      };
    }
    case 'week': {
      const weekCount = currentBuckets.length;
      const rangeStartYmd = addYmdDays(firstBucket.rangeStartYmd, -(weekCount * 7));
      const rangeEndYmd = addYmdDays(firstBucket.rangeStartYmd, -1);
      return {
        granularity: 'week',
        rangeStartYmd,
        rangeEndYmd,
      };
    }
    case 'month': {
      const monthCount = currentBuckets.length;
      const start = parseYmdToUtcDate(firstBucket.rangeStartYmd);
      const rangeStartYmd = formatUtcDateToYmd(
        new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - monthCount, 1)),
      );
      const rangeEndYmd = formatUtcDateToYmd(
        new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0)),
      );
      return {
        granularity: 'month',
        rangeStartYmd,
        rangeEndYmd,
      };
    }
    case 'year': {
      const yearCount = currentBuckets.length;
      const startYear = Number(firstBucket.rangeStartYmd.slice(0, 4));
      const endYear = Number(lastBucket.rangeEndYmd.slice(0, 4));
      return {
        granularity: 'year',
        rangeStartYmd: `${startYear - yearCount}-01-01`,
        rangeEndYmd: `${endYear - yearCount}-12-31`,
      };
    }
    default: {
      const exhaustive: never = normalized.granularity;
      return exhaustive;
    }
  }
}

export async function getProfitabilityAnalytics(
  input: ProfitabilityRangeSelection & {
    branches: ProfitabilityAnalyticsBranchInput[];
  },
  deps?: {
    callOdooKwFn?: OdooKwCallFn;
    now?: () => Date;
  },
): Promise<ProfitabilityAnalyticsResult> {
  const currentRange = normalizeRange({
    granularity: input.granularity,
    rangeStartYmd: input.rangeStartYmd,
    rangeEndYmd: input.rangeEndYmd,
  });
  const previousRange = getProfitabilityPreviousRange(currentRange);
  const currentBuckets = buildProfitabilityBuckets(currentRange);
  const branchSupersetRange: ProfitabilityRangeSelection = {
    granularity: currentRange.granularity,
    rangeStartYmd:
      compareYmd(previousRange.rangeStartYmd, currentRange.rangeStartYmd) <= 0
        ? previousRange.rangeStartYmd
        : currentRange.rangeStartYmd,
    rangeEndYmd:
      compareYmd(previousRange.rangeEndYmd, currentRange.rangeEndYmd) >= 0
        ? previousRange.rangeEndYmd
        : currentRange.rangeEndYmd,
  };

  const branchData = await Promise.all(
    input.branches.map(async (branch) => {
      const branchPeriodData = await loadBranchPeriodData(branch, branchSupersetRange, deps);

      const previousPeriod = aggregateBranchPeriodSnapshot(branchPeriodData, previousRange);
      const current = aggregateBranchPeriodSnapshot(branchPeriodData, currentRange);

      const bucketSnapshots = currentBuckets.map((bucket) => {
        const snapshot = aggregateBranchPeriodSnapshot(branchPeriodData, bucket);

        return {
          ...bucket,
          ...snapshot,
        };
      });

      return {
        branch,
        current,
        previousPeriod,
        bucketSnapshots,
      };
    }),
  );

  return {
    selection: {
      currentRange,
      previousRange,
    },
    selectedBranches: input.branches,
    current: aggregateSnapshots(branchData.map((row) => row.current)),
    previousPeriod: aggregateSnapshots(branchData.map((row) => row.previousPeriod)),
    currentBuckets: currentBuckets.map((bucket, index) => ({
      ...bucket,
      ...aggregateSnapshots(
        branchData.map((row) => row.bucketSnapshots[index] ?? emptySnapshot()),
      ),
    })),
    branchComparison: branchData.map((row) => ({
      branch: row.branch,
      current: row.current,
      previousPeriod: row.previousPeriod,
    })),
  };
}
