import { db } from '../config/database.js';
import {
  getAttendanceRecords,
  getOdooEmployeeIdsByWebsiteKey,
  getPosOrders,
  getScheduledSlots,
  type OdooAttendanceRecord,
  type OdooPlanningSlot,
} from './odooQuery.service.js';

export type RollingMetricId =
  | 'customer-service'
  | 'workplace-relations'
  | 'attendance-rate'
  | 'punctuality-rate'
  | 'productivity-rate'
  | 'average-order-value'
  | 'uniform-compliance'
  | 'hygiene-compliance'
  | 'sop-compliance';

export interface MetricEventQueryInput {
  userId: string;
  metricId: RollingMetricId;
  rangeStartYmd: string;
  rangeEndYmd: string;
  page: number;
  pageSize: number;
}

export interface MetricEventQueryResult {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
}

function parseYmd(ymd: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    throw new Error(`Invalid YMD format: ${ymd}`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function toLocalStartDate(ymd: string): Date {
  const { year, month, day } = parseYmd(ymd);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function toLocalEndDate(ymd: string): Date {
  const { year, month, day } = parseYmd(ymd);
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function paginateRows<T extends Record<string, unknown>>(rows: T[], page: number, pageSize: number): MetricEventQueryResult & { rows: T[] } {
  const safePage = Math.max(1, page);
  const safePageSize = Math.max(1, Math.min(pageSize, 200));
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;
  return {
    rows: rows.slice(start, end),
    total: rows.length,
    page: safePage,
    pageSize: safePageSize,
  };
}

function normalizeRangeYmd(rangeStartYmd: string, rangeEndYmd: string): { startYmd: string; endYmd: string } {
  if (rangeStartYmd <= rangeEndYmd) {
    return { startYmd: rangeStartYmd, endYmd: rangeEndYmd };
  }
  return { startYmd: rangeEndYmd, endYmd: rangeStartYmd };
}

interface AttendanceLookupValue {
  checkIn: Date;
  branchOdooId: number | null;
  branchName: string | null;
}

function buildAttendanceLookup(attendances: OdooAttendanceRecord[]): Map<string, AttendanceLookupValue> {
  const lookup = new Map<string, AttendanceLookupValue>();
  for (const attendance of attendances) {
    const employeeId = Array.isArray(attendance.employee_id) ? attendance.employee_id[0] : attendance.employee_id;
    const checkIn = new Date(attendance.check_in);
    if (Number.isNaN(checkIn.getTime())) {
      continue;
    }
    const key = `${employeeId}:${checkIn.toDateString()}`;
    const branchOdooId = Array.isArray(attendance.x_company_id) ? attendance.x_company_id[0] : null;
    const branchName = Array.isArray(attendance.x_company_id) ? attendance.x_company_id[1] : null;
    const existing = lookup.get(key);
    if (!existing || checkIn.getTime() < existing.checkIn.getTime()) {
      lookup.set(key, {
        checkIn,
        branchOdooId: typeof branchOdooId === 'number' ? branchOdooId : null,
        branchName: typeof branchName === 'string' ? branchName : null,
      });
    }
  }
  return lookup;
}

async function getWebsiteUserKey(userId: string): Promise<string | null> {
  const row = await db.getDb()('users').where({ id: userId }).first('user_key as userKey');
  if (!row || typeof row.userKey !== 'string' || row.userKey.trim().length === 0) {
    return null;
  }
  return row.userKey.trim();
}

async function resolveAuditedUserIdentity(userId: string): Promise<{ userKey: string | null; odooEmployeeIds: number[] }> {
  const userKey = await getWebsiteUserKey(userId);
  if (!userKey) {
    return { userKey: null, odooEmployeeIds: [] };
  }

  const odooEmployeeIds = await getOdooEmployeeIdsByWebsiteKey(userKey);
  return { userKey, odooEmployeeIds };
}

async function getAttendanceBasedRows(input: {
  userId: string;
  rangeStartYmd: string;
  rangeEndYmd: string;
}): Promise<Array<{
  slot: OdooPlanningSlot;
  checkIn: Date | null;
  checkInBranchOdooId: number | null;
  checkInBranchName: string | null;
  scheduledBranchOdooId: number | null;
  scheduledBranchName: string | null;
}>> {
  const { odooEmployeeIds: employeeIds } = await resolveAuditedUserIdentity(input.userId);
  if (employeeIds.length === 0) {
    return [];
  }

  const from = formatDateTime(toLocalStartDate(input.rangeStartYmd));
  const to = formatDateTime(toLocalEndDate(input.rangeEndYmd));
  const [slots, attendances] = await Promise.all([
    getScheduledSlots(employeeIds, from, to),
    getAttendanceRecords(employeeIds, from, to),
  ]);
  const attendanceLookup = buildAttendanceLookup(attendances);

  const rows = slots.map((slot) => {
    const employeeId = Array.isArray(slot.employee_id) ? slot.employee_id[0] : slot.employee_id;
    const slotStart = new Date(slot.start_datetime);
    const key = `${employeeId}:${slotStart.toDateString()}`;
    const attendance = attendanceLookup.get(key);
    const scheduledBranchOdooId = Array.isArray(slot.company_id) ? slot.company_id[0] : null;
    const scheduledBranchName = Array.isArray(slot.company_id) ? slot.company_id[1] : null;
    return {
      slot,
      checkIn: attendance?.checkIn ?? null,
      checkInBranchOdooId: attendance?.branchOdooId ?? null,
      checkInBranchName: attendance?.branchName ?? null,
      scheduledBranchOdooId: typeof scheduledBranchOdooId === 'number' ? scheduledBranchOdooId : null,
      scheduledBranchName: typeof scheduledBranchName === 'string' ? scheduledBranchName : null,
    };
  });

  rows.sort((a, b) => new Date(b.slot.start_datetime).getTime() - new Date(a.slot.start_datetime).getTime());
  return rows;
}

async function queryCustomerServiceEvents(input: MetricEventQueryInput): Promise<MetricEventQueryResult> {
  const { startYmd, endYmd } = normalizeRangeYmd(input.rangeStartYmd, input.rangeEndYmd);
  const start = toLocalStartDate(startYmd);
  const end = toLocalEndDate(endYmd);
  const userKey = await getWebsiteUserKey(input.userId);

  const rows = await db.getDb()('store_audits as audits')
    .leftJoin('branches as b', 'b.id', 'audits.branch_id')
    .leftJoin('users as auditor', 'auditor.id', 'audits.auditor_user_id')
    .where({
      'audits.type': 'customer_service',
      'audits.status': 'completed',
    })
    .andWhere((ownedQuery) => {
      ownedQuery.where('audits.audited_user_id', input.userId);

      if (userKey) {
        ownedQuery.orWhere((canonicalKeyQuery) => {
          canonicalKeyQuery
            .whereNull('audits.audited_user_id')
            .where('audits.audited_user_key', userKey);
        });
      }
    })
    .whereBetween('audits.completed_at', [start, end])
    .select(
      'audits.completed_at as completedAt',
      'audits.css_star_rating as score',
      'b.name as branchName',
      db.getDb().raw(`NULLIF(TRIM(CONCAT_WS(' ', auditor.first_name, auditor.last_name)), '') as "auditorName"`),
    )
    .orderBy('audits.completed_at', 'desc');

  return paginateRows(rows, input.page, input.pageSize);
}

async function queryWorkplaceRelationsEvents(input: MetricEventQueryInput): Promise<MetricEventQueryResult> {
  const { startYmd, endYmd } = normalizeRangeYmd(input.rangeStartYmd, input.rangeEndYmd);
  const start = toLocalStartDate(startYmd);
  const end = toLocalEndDate(endYmd);

  const rows = await db.getDb()('peer_evaluations as pe')
    .join('users as evaluator', 'evaluator.id', 'pe.evaluator_user_id')
    .leftJoin('employee_shifts as shifts', 'shifts.id', 'pe.shift_id')
    .leftJoin('branches as b', 'b.id', 'shifts.branch_id')
    .where({ 'pe.evaluated_user_id': input.userId })
    .whereNotNull('pe.wrs_effective_at')
    .whereBetween('pe.wrs_effective_at', [start, end])
    .select(
      'pe.submitted_at as submittedAt',
      'pe.wrs_effective_at as effectiveAt',
      db.getDb().raw(`NULLIF(TRIM(CONCAT_WS(' ', evaluator.first_name, evaluator.last_name)), '') as "evaluatorName"`),
      'b.name as branchName',
      db.getDb().raw('(q1_score + q2_score + q3_score) / 3.0 as score'),
    )
    .orderBy('pe.wrs_effective_at', 'desc');

  return paginateRows(rows, input.page, input.pageSize);
}

async function queryComplianceEvents(
  input: MetricEventQueryInput,
  field: 'comp_productivity_rate' | 'comp_uniform' | 'comp_hygiene' | 'comp_sop',
): Promise<MetricEventQueryResult> {
  const { startYmd, endYmd } = normalizeRangeYmd(input.rangeStartYmd, input.rangeEndYmd);
  const start = toLocalStartDate(startYmd);
  const end = toLocalEndDate(endYmd);
  const userKey = await getWebsiteUserKey(input.userId);

  const rows = await db.getDb()('store_audits as audits')
    .leftJoin('branches as b', 'b.id', 'audits.branch_id')
    .leftJoin('users as auditor', 'auditor.id', 'audits.auditor_user_id')
    .where({
      'audits.type': 'compliance',
      'audits.status': 'completed',
    })
    .andWhere((ownedQuery) => {
      ownedQuery.where('audits.audited_user_id', input.userId);

      if (userKey) {
        ownedQuery.orWhere((canonicalKeyQuery) => {
          canonicalKeyQuery
            .whereNull('audits.audited_user_id')
            .where('audits.audited_user_key', userKey);
        });
      }
    })
    .whereBetween('audits.completed_at', [start, end])
    .select(
      'audits.completed_at as completedAt',
      db.getDb().raw(`${field} as passed`),
      'b.name as branchName',
      db.getDb().raw(`NULLIF(TRIM(CONCAT_WS(' ', auditor.first_name, auditor.last_name)), '') as "auditorName"`),
    )
    .orderBy('audits.completed_at', 'desc');

  const mapped = rows.map((row) => ({
    completedAt: row.completedAt,
    branchName: row.branchName ?? null,
    auditorName: row.auditorName ?? null,
    result: row.passed === true ? 'Pass' : row.passed === false ? 'Fail' : null,
  }));
  return paginateRows(mapped, input.page, input.pageSize);
}

async function queryAttendanceEvents(input: MetricEventQueryInput): Promise<MetricEventQueryResult> {
  const attendanceRows = await getAttendanceBasedRows({
    userId: input.userId,
    rangeStartYmd: input.rangeStartYmd,
    rangeEndYmd: input.rangeEndYmd,
  });

  const rows = attendanceRows.map(({ slot, checkIn, checkInBranchName, checkInBranchOdooId, scheduledBranchName, scheduledBranchOdooId }) => ({
    date: new Date(slot.start_datetime).toISOString(),
    scheduledStart: slot.start_datetime,
    scheduledEnd: slot.end_datetime,
    scheduledHours: slot.allocated_hours ?? 0,
    checkIn: checkIn ? checkIn.toISOString() : null,
    branchName: checkInBranchName ?? scheduledBranchName,
    branchOdooId: checkInBranchOdooId ?? scheduledBranchOdooId,
    status: checkIn ? 'Present' : 'Absent',
  }));

  return paginateRows(rows, input.page, input.pageSize);
}

async function queryPunctualityEvents(input: MetricEventQueryInput): Promise<MetricEventQueryResult> {
  const attendanceRows = await getAttendanceBasedRows({
    userId: input.userId,
    rangeStartYmd: input.rangeStartYmd,
    rangeEndYmd: input.rangeEndYmd,
  });

  const rows = attendanceRows.map(({ slot, checkIn, checkInBranchName, checkInBranchOdooId, scheduledBranchName, scheduledBranchOdooId }) => {
    const slotStart = new Date(slot.start_datetime);
    const varianceMinutes = checkIn ? Math.round((checkIn.getTime() - slotStart.getTime()) / 60000) : null;
    return {
      date: slotStart.toISOString(),
      scheduledStart: slot.start_datetime,
      checkIn: checkIn ? checkIn.toISOString() : null,
      branchName: checkInBranchName ?? scheduledBranchName,
      branchOdooId: checkInBranchOdooId ?? scheduledBranchOdooId,
      varianceMinutes,
      status: varianceMinutes === null ? 'No Check-in' : varianceMinutes <= 0 ? 'On-time' : 'Late',
    };
  });

  return paginateRows(rows, input.page, input.pageSize);
}

async function queryAovEvents(input: MetricEventQueryInput): Promise<MetricEventQueryResult> {
  const userKey = await getWebsiteUserKey(input.userId);
  if (!userKey) {
    return { rows: [], total: 0, page: input.page, pageSize: input.pageSize };
  }

  const { startYmd, endYmd } = normalizeRangeYmd(input.rangeStartYmd, input.rangeEndYmd);
  const from = formatDateTime(toLocalStartDate(startYmd));
  const to = formatDateTime(toLocalEndDate(endYmd));
  const orders = await getPosOrders(userKey, from, to);

  const rows = orders
    .map((order) => ({
      dateOrder: order.date_order,
      amountTotal: Number(order.amount_total ?? 0),
      branchOdooId: Array.isArray(order.company_id) ? order.company_id[0] : null,
      branchName: Array.isArray(order.company_id) ? order.company_id[1] : null,
    }))
    .sort((a, b) => String(b.dateOrder).localeCompare(String(a.dateOrder)));

  return paginateRows(rows, input.page, input.pageSize);
}

export async function getEmployeeMetricEventRows(input: MetricEventQueryInput): Promise<MetricEventQueryResult> {
  switch (input.metricId) {
    case 'customer-service':
      return queryCustomerServiceEvents(input);
    case 'workplace-relations':
      return queryWorkplaceRelationsEvents(input);
    case 'attendance-rate':
      return queryAttendanceEvents(input);
    case 'punctuality-rate':
      return queryPunctualityEvents(input);
    case 'productivity-rate':
      return queryComplianceEvents(input, 'comp_productivity_rate');
    case 'average-order-value':
      return queryAovEvents(input);
    case 'uniform-compliance':
      return queryComplianceEvents(input, 'comp_uniform');
    case 'hygiene-compliance':
      return queryComplianceEvents(input, 'comp_hygiene');
    case 'sop-compliance':
      return queryComplianceEvents(input, 'comp_sop');
    default: {
      const _never: never = input.metricId;
      return _never;
    }
  }
}
