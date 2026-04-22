import type {
  PayslipListItem,
  PayrollOverviewPeriod,
  PayrollOverviewPeriodOption,
  PayrollOverviewValidationBlockerType,
  PayrollOverviewValidationItem,
  PayrollOverviewValidationResponse,
} from '@omnilert/shared';
import { db } from '../config/database.js';
import {
  getAllPayslipsForBranchPeriod,
  getCurrentSemiMonthRange,
  getEmployeesForOdooCompanies,
} from './odoo.service.js';

export type PayrollOverviewResolvedPeriod = PayrollOverviewPeriod;

export interface PayrollReviewStatusRow {
  id: string;
  company_id: string;
  odoo_company_id: number;
  employee_odoo_id: number;
  date_from: string;
  date_to: string;
  status: 'on_hold';
  reason: string | null;
  flagged_by_user_id: string | null;
  resolved_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface PayrollOverviewScopedBranch {
  branchId: string;
  odooCompanyId: number;
  name: string;
}

interface PayrollOverviewScopedUser {
  userId: string;
  userKey: string;
  avatarUrl: string | null;
}

export interface PayrollOverviewScopeData {
  items: PayslipListItem[];
  period: PayrollOverviewResolvedPeriod;
  branches: PayrollOverviewScopedBranch[];
  odooCompanyIds: number[];
  userByOdooEmployeeId: Map<number, PayrollOverviewScopedUser>;
}

interface PayrollValidationCandidate extends PayslipListItem {
  userId: string;
  avatarUrl: string | null;
}

interface PayrollValidationBlockedEntry {
  candidate: PayrollValidationCandidate;
  blockerTypes: Set<PayrollOverviewValidationBlockerType>;
}

interface PayrollOverviewShiftBlockerRow {
  userId: string;
  odooCompanyId: number;
}

interface PayrollOverviewAdjustmentBlockerRow {
  userId: string;
  odooCompanyId: number;
}

export interface PayrollReviewStatusUpsertRow {
  companyId: string;
  odooCompanyId: number;
  employeeOdooId: number;
  dateFrom: string;
  dateTo: string;
  reason: string;
  flaggedByUserId: string;
}

export interface ValidatePayrollOverviewInput {
  companyId: string;
  actingUserId: string;
  branchIds?: string[];
  period: PayrollOverviewPeriodOption;
}

export interface ValidatePayrollOverviewDeps {
  loadScope?: (input: {
    companyId: string;
    branchIds?: string[];
    period: PayrollOverviewPeriodOption;
  }) => Promise<PayrollOverviewScopeData>;
  listReviewStatuses?: typeof listPayrollReviewStatuses;
  listShiftAuthorizationBlockers?: (input: {
    companyId: string;
    branchIds: string[];
    dateFrom: string;
    dateTo: string;
  }) => Promise<PayrollOverviewShiftBlockerRow[]>;
  listPayrollAdjustmentBlockers?: (input: {
    companyId: string;
    branchIds: string[];
  }) => Promise<PayrollOverviewAdjustmentBlockerRow[]>;
  deleteReviewStatusesByIds?: (ids: string[]) => Promise<number>;
  upsertReviewStatuses?: (rows: PayrollReviewStatusUpsertRow[]) => Promise<void>;
}

export function resolvePayrollOverviewPeriodRange(
  period: PayrollOverviewPeriodOption,
  baseDate: Date = new Date(),
): PayrollOverviewResolvedPeriod {
  if (period === 'previous') {
    const day = baseDate.getDate();

    if (day <= 15) {
      const previousMonthBase = new Date(baseDate.getFullYear(), baseDate.getMonth() - 1, 1);
      const previousRange = getCurrentSemiMonthRange(2, previousMonthBase);
      return {
        dateFrom: previousRange.date_from,
        dateTo: previousRange.date_to,
        cutoff: 2,
      };
    }

    const previousRange = getCurrentSemiMonthRange(1, baseDate);
    return {
      dateFrom: previousRange.date_from,
      dateTo: previousRange.date_to,
      cutoff: 1,
    };
  }

  const currentRange = getCurrentSemiMonthRange(undefined, baseDate);
  return {
    dateFrom: currentRange.date_from,
    dateTo: currentRange.date_to,
    cutoff: Number(currentRange.date_from.split('-')[2]) <= 15 ? 1 : 2,
  };
}

export function createPayrollReviewStatusKey(input: {
  odooCompanyId: number;
  employeeOdooId: number;
  dateFrom: string;
  dateTo: string;
}): string {
  return `${input.odooCompanyId}:${input.employeeOdooId}:${input.dateFrom}:${input.dateTo}`;
}

function createScopedCandidateKey(odooCompanyId: number, userId: string): string {
  return `${odooCompanyId}:${userId}`;
}

function addDaysYmd(value: string, days: number): string {
  const [year, month, day] = value.split('-').map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + days);
  const nextYear = next.getUTCFullYear();
  const nextMonth = String(next.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(next.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

function getManilaPeriodBounds(dateFrom: string, dateTo: string): { startIso: string; endExclusiveIso: string } {
  const startIso = new Date(`${dateFrom}T00:00:00+08:00`).toISOString();
  const endExclusiveIso = new Date(`${addDaysYmd(dateTo, 1)}T00:00:00+08:00`).toISOString();
  return { startIso, endExclusiveIso };
}

function orderBlockerTypes(
  types: Set<PayrollOverviewValidationBlockerType>,
): PayrollOverviewValidationBlockerType[] {
  const ordered: PayrollOverviewValidationBlockerType[] = [];
  if (types.has('shift_authorization')) ordered.push('shift_authorization');
  if (types.has('payroll_adjustment_authorization')) {
    ordered.push('payroll_adjustment_authorization');
  }
  return ordered;
}

function buildPayrollReviewReason(
  blockerTypes: Set<PayrollOverviewValidationBlockerType>,
): string {
  const parts: string[] = [];
  if (blockerTypes.has('shift_authorization')) {
    parts.push('Pending shift authorization');
  }
  if (blockerTypes.has('payroll_adjustment_authorization')) {
    parts.push('Pending payroll adjustment authorization');
  }
  return parts.join('; ');
}

function buildPayrollValidationMessages(employeeName: string): Record<PayrollOverviewValidationBlockerType, string> {
  return {
    shift_authorization: `${employeeName} still has a pending shift authorization.`,
    payroll_adjustment_authorization: `${employeeName} still has a pending adjustment for authorization.`,
  };
}

function buildPayrollValidationCandidates(scope: PayrollOverviewScopeData): {
  byReviewKey: Map<string, PayrollValidationCandidate>;
  byScopedUserKey: Map<string, PayrollValidationCandidate>;
} {
  const byReviewKey = new Map<string, PayrollValidationCandidate>();
  const byScopedUserKey = new Map<string, PayrollValidationCandidate>();

  for (const item of scope.items) {
    const userInfo = scope.userByOdooEmployeeId.get(item.employee_id);
    if (!userInfo) continue;

    const reviewKey = createPayrollReviewStatusKey({
      odooCompanyId: item.company_id,
      employeeOdooId: item.employee_id,
      dateFrom: item.date_from,
      dateTo: item.date_to,
    });
    const candidate: PayrollValidationCandidate = {
      ...item,
      userId: userInfo.userId,
      avatarUrl: item.avatar_url ?? userInfo.avatarUrl,
    };

    byReviewKey.set(reviewKey, candidate);
    byScopedUserKey.set(createScopedCandidateKey(item.company_id, userInfo.userId), candidate);
  }

  return { byReviewKey, byScopedUserKey };
}

function toPayrollValidationItems(
  blockedEntries: PayrollValidationBlockedEntry[],
): PayrollOverviewValidationItem[] {
  return blockedEntries
    .map((entry) => {
      const blockerTypes = orderBlockerTypes(entry.blockerTypes);
      const messagesByType = buildPayrollValidationMessages(entry.candidate.employee_name);

      return {
        odooCompanyId: entry.candidate.company_id,
        employeeOdooId: entry.candidate.employee_id,
        employeeName: entry.candidate.employee_name,
        avatarUrl: entry.candidate.avatarUrl,
        companyName: entry.candidate.company_name,
        blockerTypes,
        messages: blockerTypes.map((type) => messagesByType[type]),
      };
    })
    .sort(
      (left, right) =>
        left.employeeName.localeCompare(right.employeeName) ||
        left.companyName.localeCompare(right.companyName),
    );
}

export function applyPayrollReviewStatusOverrides(
  items: PayslipListItem[],
  reviewRows: PayrollReviewStatusRow[],
): PayslipListItem[] {
  if (items.length === 0 || reviewRows.length === 0) return items;

  const reviewKeySet = new Set(
    reviewRows
      .filter((row) => row.status === 'on_hold')
      .map((row) =>
        createPayrollReviewStatusKey({
          odooCompanyId: row.odoo_company_id,
          employeeOdooId: row.employee_odoo_id,
          dateFrom: row.date_from,
          dateTo: row.date_to,
        }),
      ),
  );

  return items.map((item) => {
    const reviewKey = createPayrollReviewStatusKey({
      odooCompanyId: item.company_id,
      employeeOdooId: item.employee_id,
      dateFrom: item.date_from,
      dateTo: item.date_to,
    });

    if (!reviewKeySet.has(reviewKey)) {
      return item;
    }

    return {
      ...item,
      status: 'on_hold',
    };
  });
}

export async function loadPayrollOverviewScope(input: {
  companyId: string;
  branchIds?: string[];
  period: PayrollOverviewPeriodOption;
}): Promise<PayrollOverviewScopeData> {
  const masterDb = db.getDb();
  const selectedBranchIds = Array.from(new Set(input.branchIds ?? []));
  const period = resolvePayrollOverviewPeriodRange(input.period);

  let branchQuery = masterDb('branches')
    .whereNotNull('odoo_branch_id')
    .select('id', 'odoo_branch_id', 'name');

  if (selectedBranchIds.length > 0) {
    branchQuery = branchQuery.whereIn('id', selectedBranchIds);
  } else {
    branchQuery = branchQuery.where('company_id', input.companyId);
  }

  const rawBranchRows = (await branchQuery) as Array<{
    id: string;
    odoo_branch_id: string;
    name: string;
  }>;

  const branches = rawBranchRows
    .map((row) => ({
      branchId: String(row.id),
      odooCompanyId: Number.parseInt(row.odoo_branch_id, 10),
      name: String(row.name),
    }))
    .filter((row) => Number.isFinite(row.odooCompanyId));

  const odooCompanyIds = [...new Set(branches.map((branch) => branch.odooCompanyId))];
  const branchNameMap = new Map(branches.map((branch) => [branch.odooCompanyId, branch.name]));

  const [rawItems, odooEmployees] = await Promise.all([
    getAllPayslipsForBranchPeriod(odooCompanyIds, period.dateFrom, period.dateTo),
    getEmployeesForOdooCompanies(odooCompanyIds),
  ]);

  const employeeKeyMap = new Map<number, string>();
  for (const employee of odooEmployees) {
    if (employee.x_website_key) {
      employeeKeyMap.set(employee.id, employee.x_website_key);
    }
  }

  const userKeys = [...new Set(employeeKeyMap.values())];
  const userRows = userKeys.length > 0
    ? (await masterDb('users')
        .whereIn('user_key', userKeys)
        .select('id', 'user_key', 'avatar_url')) as Array<{
          id: string;
          user_key: string;
          avatar_url: string | null;
        }>
    : [];

  const userByKey = new Map(
    userRows.map((row) => [
      row.user_key,
      {
        userId: String(row.id),
        userKey: String(row.user_key),
        avatarUrl: row.avatar_url ?? null,
      },
    ]),
  );

  const userByOdooEmployeeId = new Map<number, PayrollOverviewScopedUser>();
  for (const [employeeId, userKey] of employeeKeyMap.entries()) {
    const user = userByKey.get(userKey);
    if (!user) continue;
    userByOdooEmployeeId.set(employeeId, user);
  }

  const items = rawItems.map((item) => {
    const user = userByOdooEmployeeId.get(item.employee_id);
    return {
      ...item,
      company_name: branchNameMap.get(item.company_id) ?? item.company_name,
      avatar_url: user?.avatarUrl ?? null,
    };
  });

  return {
    items,
    period,
    branches,
    odooCompanyIds,
    userByOdooEmployeeId,
  };
}

export async function listPayrollReviewStatuses(input: {
  companyId: string;
  odooCompanyIds: number[];
  dateFrom: string;
  dateTo: string;
}): Promise<PayrollReviewStatusRow[]> {
  if (input.odooCompanyIds.length === 0) return [];

  const rows = await db
    .getDb()('payroll_review_statuses')
    .where({
      company_id: input.companyId,
      status: 'on_hold',
      date_from: input.dateFrom,
      date_to: input.dateTo,
    })
    .whereIn('odoo_company_id', input.odooCompanyIds)
    .select<PayrollReviewStatusRow[]>(
      'id',
      'company_id',
      'odoo_company_id',
      'employee_odoo_id',
      'date_from',
      'date_to',
      'status',
      'reason',
      'flagged_by_user_id',
      'resolved_by_user_id',
      'created_at',
      'updated_at',
    );

  return rows;
}

export async function findPayrollReviewStatus(input: {
  companyId: string;
  odooCompanyId: number;
  employeeOdooId: number;
  dateFrom: string;
  dateTo: string;
}): Promise<PayrollReviewStatusRow | null> {
  const row = await db
    .getDb()('payroll_review_statuses')
    .where({
      company_id: input.companyId,
      odoo_company_id: input.odooCompanyId,
      employee_odoo_id: input.employeeOdooId,
      date_from: input.dateFrom,
      date_to: input.dateTo,
      status: 'on_hold',
    })
    .first<PayrollReviewStatusRow | undefined>(
      'id',
      'company_id',
      'odoo_company_id',
      'employee_odoo_id',
      'date_from',
      'date_to',
      'status',
      'reason',
      'flagged_by_user_id',
      'resolved_by_user_id',
      'created_at',
      'updated_at',
    );

  return row ?? null;
}

export async function listPendingShiftAuthorizationBlockers(input: {
  companyId: string;
  branchIds: string[];
  dateFrom: string;
  dateTo: string;
}): Promise<PayrollOverviewShiftBlockerRow[]> {
  if (input.branchIds.length === 0) return [];

  const { startIso, endExclusiveIso } = getManilaPeriodBounds(input.dateFrom, input.dateTo);
  const rows = (await db
    .getDb()('shift_authorizations as auth')
    .join('employee_shifts as shift', 'auth.shift_id', 'shift.id')
    .join('branches as branch', 'auth.branch_id', 'branch.id')
    .where('auth.company_id', input.companyId)
    .whereIn('auth.branch_id', input.branchIds)
    .whereIn('auth.status', ['pending', 'locked'])
    .whereNotNull('shift.user_id')
    .whereNotNull('branch.odoo_branch_id')
    .where('shift.shift_start', '>=', startIso)
    .andWhere('shift.shift_start', '<', endExclusiveIso)
    .select<Array<{
      user_id: string;
      odoo_branch_id: string;
    }>>('shift.user_id', 'branch.odoo_branch_id')) ?? [];

  return rows
    .map((row) => ({
      userId: String(row.user_id),
      odooCompanyId: Number.parseInt(row.odoo_branch_id, 10),
    }))
    .filter((row) => row.userId.length > 0 && Number.isFinite(row.odooCompanyId));
}

export async function listPendingPayrollAdjustmentBlockers(input: {
  companyId: string;
  branchIds: string[];
}): Promise<PayrollOverviewAdjustmentBlockerRow[]> {
  if (input.branchIds.length === 0) return [];

  const rows = (await db
    .getDb()('payroll_adjustment_request_targets as target')
    .join('payroll_adjustment_requests as request', 'target.request_id', 'request.id')
    .join('branches as branch', 'request.branch_id', 'branch.id')
    .where('request.company_id', input.companyId)
    .where('request.status', 'employee_approval')
    .where('target.status', 'pending')
    .whereIn('request.branch_id', input.branchIds)
    .whereNotNull('branch.odoo_branch_id')
    .select<Array<{
      user_id: string;
      odoo_branch_id: string;
    }>>('target.user_id', 'branch.odoo_branch_id')) ?? [];

  return rows
    .map((row) => ({
      userId: String(row.user_id),
      odooCompanyId: Number.parseInt(row.odoo_branch_id, 10),
    }))
    .filter((row) => row.userId.length > 0 && Number.isFinite(row.odooCompanyId));
}

export async function deletePayrollReviewStatusesByIds(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const deleted = await db.getDb()('payroll_review_statuses').whereIn('id', ids).delete();
  return Number(deleted ?? 0);
}

export async function upsertPayrollReviewStatuses(rows: PayrollReviewStatusUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;

  const knex = db.getDb();
  await knex('payroll_review_statuses')
    .insert(
      rows.map((row) => ({
        company_id: row.companyId,
        odoo_company_id: row.odooCompanyId,
        employee_odoo_id: row.employeeOdooId,
        date_from: row.dateFrom,
        date_to: row.dateTo,
        status: 'on_hold' as const,
        reason: row.reason,
        flagged_by_user_id: row.flaggedByUserId,
        resolved_by_user_id: null,
      })),
    )
    .onConflict(['company_id', 'odoo_company_id', 'employee_odoo_id', 'date_from', 'date_to'])
    .merge({
      status: 'on_hold',
      reason: knex.raw('EXCLUDED.reason'),
      flagged_by_user_id: knex.raw('EXCLUDED.flagged_by_user_id'),
      resolved_by_user_id: null,
      updated_at: knex.fn.now(),
    });
}

export async function validatePayrollOverview(
  input: ValidatePayrollOverviewInput,
  deps: ValidatePayrollOverviewDeps = {},
): Promise<PayrollOverviewValidationResponse> {
  const loadScope = deps.loadScope ?? loadPayrollOverviewScope;
  const listReviewStatuses = deps.listReviewStatuses ?? listPayrollReviewStatuses;
  const listShiftAuthorizationBlockers =
    deps.listShiftAuthorizationBlockers ?? listPendingShiftAuthorizationBlockers;
  const listPayrollAdjustmentBlockers =
    deps.listPayrollAdjustmentBlockers ?? listPendingPayrollAdjustmentBlockers;
  const deleteReviewStatusesByIds = deps.deleteReviewStatusesByIds ?? deletePayrollReviewStatusesByIds;
  const upsertReviewStatuses = deps.upsertReviewStatuses ?? upsertPayrollReviewStatuses;

  const scope = await loadScope({
    companyId: input.companyId,
    branchIds: input.branchIds,
    period: input.period,
  });
  const { byReviewKey, byScopedUserKey } = buildPayrollValidationCandidates(scope);
  const candidateKeySet = new Set(byReviewKey.keys());

  const [existingReviewRows, shiftBlockers, adjustmentBlockers] = await Promise.all([
    listReviewStatuses({
      companyId: input.companyId,
      odooCompanyIds: scope.odooCompanyIds,
      dateFrom: scope.period.dateFrom,
      dateTo: scope.period.dateTo,
    }),
    listShiftAuthorizationBlockers({
      companyId: input.companyId,
      branchIds: scope.branches.map((branch) => branch.branchId),
      dateFrom: scope.period.dateFrom,
      dateTo: scope.period.dateTo,
    }),
    listPayrollAdjustmentBlockers({
      companyId: input.companyId,
      branchIds: scope.branches.map((branch) => branch.branchId),
    }),
  ]);

  const blockedByKey = new Map<string, PayrollValidationBlockedEntry>();

  for (const blocker of shiftBlockers) {
    const candidate = byScopedUserKey.get(
      createScopedCandidateKey(blocker.odooCompanyId, blocker.userId),
    );
    if (!candidate) continue;

    const reviewKey = createPayrollReviewStatusKey({
      odooCompanyId: candidate.company_id,
      employeeOdooId: candidate.employee_id,
      dateFrom: candidate.date_from,
      dateTo: candidate.date_to,
    });
    const existing = blockedByKey.get(reviewKey);
    if (existing) {
      existing.blockerTypes.add('shift_authorization');
      continue;
    }

    blockedByKey.set(reviewKey, {
      candidate,
      blockerTypes: new Set<PayrollOverviewValidationBlockerType>(['shift_authorization']),
    });
  }

  for (const blocker of adjustmentBlockers) {
    const candidate = byScopedUserKey.get(
      createScopedCandidateKey(blocker.odooCompanyId, blocker.userId),
    );
    if (!candidate) continue;

    const reviewKey = createPayrollReviewStatusKey({
      odooCompanyId: candidate.company_id,
      employeeOdooId: candidate.employee_id,
      dateFrom: candidate.date_from,
      dateTo: candidate.date_to,
    });
    const existing = blockedByKey.get(reviewKey);
    if (existing) {
      existing.blockerTypes.add('payroll_adjustment_authorization');
      continue;
    }

    blockedByKey.set(reviewKey, {
      candidate,
      blockerTypes: new Set<PayrollOverviewValidationBlockerType>([
        'payroll_adjustment_authorization',
      ]),
    });
  }

  const blockedEntries = Array.from(blockedByKey.values());
  const validationItems = toPayrollValidationItems(blockedEntries);
  const keepKeySet = new Set(
    validationItems.map((item) =>
      createPayrollReviewStatusKey({
        odooCompanyId: item.odooCompanyId,
        employeeOdooId: item.employeeOdooId,
        dateFrom: scope.period.dateFrom,
        dateTo: scope.period.dateTo,
      }),
    ),
  );

  const staleIds = existingReviewRows
    .filter((row) => {
      const reviewKey = createPayrollReviewStatusKey({
        odooCompanyId: row.odoo_company_id,
        employeeOdooId: row.employee_odoo_id,
        dateFrom: row.date_from,
        dateTo: row.date_to,
      });
      return candidateKeySet.has(reviewKey) && !keepKeySet.has(reviewKey);
    })
    .map((row) => row.id);

  const upsertRows: PayrollReviewStatusUpsertRow[] = blockedEntries.map((entry) => ({
    companyId: input.companyId,
    odooCompanyId: entry.candidate.company_id,
    employeeOdooId: entry.candidate.employee_id,
    dateFrom: entry.candidate.date_from,
    dateTo: entry.candidate.date_to,
    reason: buildPayrollReviewReason(entry.blockerTypes),
    flaggedByUserId: input.actingUserId,
  }));

  const clearedPayslips = await deleteReviewStatusesByIds(staleIds);
  await upsertReviewStatuses(upsertRows);

  const summary = {
    scannedPayslips: scope.items.length,
    blockedPayslips: validationItems.length,
    clearedPayslips,
    shiftAuthorizationBlocks: validationItems.filter((item) =>
      item.blockerTypes.includes('shift_authorization'),
    ).length,
    payrollAdjustmentBlocks: validationItems.filter((item) =>
      item.blockerTypes.includes('payroll_adjustment_authorization'),
    ).length,
  };

  return {
    period: scope.period,
    summary,
    items: validationItems,
  };
}
