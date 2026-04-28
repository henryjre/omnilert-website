import {
  getOdooEmployeeIdsByWebsiteKey,
  getOdooEmployeeIdsByWebsiteKeys,
  getScheduledSlots,
  getAttendanceRecords,
  getPosOrders,
  getPosOrdersBatch,
  getBranchPosOrders,
  type OdooPosOrder,
  type OdooAttendanceRecord,
  type OdooPlanningSlot,
} from './odooQuery.service.js';
import { toOdooDatetime, parseUtcTimestamp } from './odoo.service.js';

// ─── KPI Breakdown Types ──────────────────────────────────────────────────────

export interface KpiBreakdown {
  wrs: { score: number | null; impact: number };
  pcs: { score: number | null; impact: number };
  attendance: { rate: number | null; impact: number };
  punctuality: { rate: number | null; impact: number };
  productivity: { rate: number | null; impact: number };
  aov: { value: number | null; branch_avg: number | null; impact: number };
  uniform: { rate: number | null; impact: number };
  hygiene: { rate: number | null; impact: number };
  sop: { rate: number | null; impact: number };
  customer_interaction: { score: number | null; impact: number };
  cashiering: { score: number | null; impact: number };
  suggestive_selling_and_upselling: { score: number | null; impact: number };
  service_efficiency: { score: number | null; impact: number };
  awards: { count: number; total_increase: number; impact: number };
  violations: { count: number; total_decrease: number; impact: number };
}

export interface EpiDeltaResult {
  breakdown: KpiBreakdown;
  delta: number;
  raw_delta: number;
  capped: boolean;
}

export interface KpiComputationWindow {
  from: Date;
  to: Date;
}

export interface WrsStatusSummary {
  effectiveCount: number;
  delayedCount: number;
}

type WrsEvaluationRow = {
  average_score: number;
  submitted_at?: string | null;
  wrs_effective_at?: string | null;
  status?: string | null;
  expires_at?: string | null;
};

export interface KpiQueryDeps {
  getOdooEmployeeIdsByWebsiteKey: typeof getOdooEmployeeIdsByWebsiteKey;
  getScheduledSlots: typeof getScheduledSlots;
  getAttendanceRecords: typeof getAttendanceRecords;
  getPosOrders: typeof getPosOrders;
  getBranchPosOrders: typeof getBranchPosOrders;
}

const defaultKpiQueryDeps: KpiQueryDeps = {
  getOdooEmployeeIdsByWebsiteKey,
  getScheduledSlots,
  getAttendanceRecords,
  getPosOrders,
  getBranchPosOrders,
};

// ─── Impact Tables ────────────────────────────────────────────────────────────

function wrsImpact(score: number): number {
  if (score >= 4.70) return 0.25;
  if (score >= 4.45) return 0.20;
  if (score >= 4.20) return 0.15;
  if (score >= 3.95) return 0.10;
  if (score >= 3.70) return 0.05;
  if (score >= 3.40) return 0.00;
  if (score >= 3.10) return -0.05;
  if (score >= 2.80) return -0.10;
  if (score >= 2.50) return -0.15;
  return -0.25;
}

function pcsImpact(score: number): number {
  if (score >= 4.75) return 0.35;
  if (score >= 4.50) return 0.28;
  if (score >= 4.25) return 0.21;
  if (score >= 4.00) return 0.14;
  if (score >= 3.75) return 0.07;
  if (score >= 3.45) return 0.00;
  if (score >= 3.15) return -0.07;
  if (score >= 2.85) return -0.14;
  if (score >= 2.55) return -0.21;
  return -0.35;
}

function attendanceImpact(rate: number): number {
  if (rate >= 99.50) return 0.40;
  if (rate >= 98.50) return 0.32;
  if (rate >= 97.50) return 0.24;
  if (rate >= 96.50) return 0.16;
  if (rate >= 95.50) return 0.08;
  if (rate >= 94.00) return 0.00;
  if (rate >= 92.00) return -0.08;
  if (rate >= 89.00) return -0.16;
  if (rate >= 85.00) return -0.24;
  return -0.40;
}

function punctualityImpact(rate: number): number {
  if (rate >= 99.50) return 0.30;
  if (rate >= 98.50) return 0.24;
  if (rate >= 97.50) return 0.18;
  if (rate >= 96.50) return 0.12;
  if (rate >= 95.50) return 0.06;
  if (rate >= 94.00) return 0.00;
  if (rate >= 92.00) return -0.06;
  if (rate >= 89.00) return -0.12;
  if (rate >= 85.00) return -0.18;
  return -0.30;
}

function productivityImpact(rate: number): number {
  if (rate >= 98.00) return 0.40;
  if (rate >= 96.00) return 0.32;
  if (rate >= 94.00) return 0.24;
  if (rate >= 92.00) return 0.16;
  if (rate >= 90.00) return 0.08;
  if (rate >= 88.00) return 0.00;
  if (rate >= 85.00) return -0.08;
  if (rate >= 81.00) return -0.16;
  if (rate >= 76.00) return -0.24;
  return -0.40;
}

function aovImpact(pct: number): number {
  if (pct >= 20.00) return 0.30;
  if (pct >= 15.00) return 0.24;
  if (pct >= 10.00) return 0.18;
  if (pct >= 6.00) return 0.12;
  if (pct >= 2.00) return 0.06;
  if (pct > -2.00) return 0.00;
  if (pct >= -6.00) return -0.06;
  if (pct >= -10.00) return -0.12;
  if (pct >= -15.00) return -0.18;
  return -0.30;
}

function uniformImpact(rate: number): number {
  if (rate >= 99.50) return 0.20;
  if (rate >= 98.50) return 0.16;
  if (rate >= 97.50) return 0.12;
  if (rate >= 96.50) return 0.08;
  if (rate >= 95.50) return 0.04;
  if (rate >= 94.00) return 0.00;
  if (rate >= 91.00) return -0.04;
  if (rate >= 87.00) return -0.08;
  if (rate >= 82.00) return -0.12;
  return -0.20;
}

function hygieneImpact(rate: number): number {
  if (rate >= 99.50) return 0.40;
  if (rate >= 98.50) return 0.32;
  if (rate >= 97.50) return 0.24;
  if (rate >= 96.50) return 0.16;
  if (rate >= 95.50) return 0.08;
  if (rate >= 94.00) return 0.00;
  if (rate >= 92.00) return -0.08;
  if (rate >= 89.00) return -0.16;
  if (rate >= 85.00) return -0.24;
  return -0.40;
}

function sopImpact(rate: number): number {
  return uniformImpact(rate); // Same table (±0.20)
}

function customerInteractionImpact(score: number): number {
  if (score >= 4.70) return 0.70;
  if (score >= 4.45) return 0.56;
  if (score >= 4.20) return 0.42;
  if (score >= 3.95) return 0.28;
  if (score >= 3.70) return 0.14;
  if (score >= 3.40) return 0.00;
  if (score >= 3.10) return -0.14;
  if (score >= 2.80) return -0.28;
  if (score >= 2.50) return -0.42;
  return -0.70;
}

function cashieringImpact(score: number): number {
  if (score >= 4.75) return 0.60;
  if (score >= 4.50) return 0.48;
  if (score >= 4.25) return 0.36;
  if (score >= 4.00) return 0.24;
  if (score >= 3.75) return 0.12;
  if (score >= 3.45) return 0.00;
  if (score >= 3.15) return -0.12;
  if (score >= 2.85) return -0.24;
  if (score >= 2.55) return -0.36;
  return -0.60;
}

function suggestiveSellingImpact(score: number): number {
  if (score >= 4.70) return 0.40;
  if (score >= 4.45) return 0.32;
  if (score >= 4.20) return 0.24;
  if (score >= 3.95) return 0.16;
  if (score >= 3.70) return 0.08;
  if (score >= 3.40) return 0.00;
  if (score >= 3.10) return -0.08;
  if (score >= 2.80) return -0.16;
  if (score >= 2.50) return -0.24;
  return -0.40;
}

function serviceEfficiencyImpact(score: number): number {
  if (score >= 4.75) return 0.50;
  if (score >= 4.50) return 0.40;
  if (score >= 4.25) return 0.30;
  if (score >= 4.00) return 0.20;
  if (score >= 3.75) return 0.10;
  if (score >= 3.45) return 0.00;
  if (score >= 3.15) return -0.10;
  if (score >= 2.85) return -0.20;
  if (score >= 2.55) return -0.30;
  return -0.50;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateRangeFilter(dateStr: string, from: Date, to: Date): boolean {
  const d = parseUtcTimestamp(dateStr);
  return d >= from && d <= to;
}

function formatDateTime(date: Date): string {
  return toOdooDatetime(date);
}

function getPast30DayRange(): { from: Date; to: Date; fromStr: string; toStr: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to, fromStr: formatDateTime(from), toStr: formatDateTime(to) };
}

function resolveKpiComputationWindow(window?: KpiComputationWindow): { from: Date; to: Date; fromStr: string; toStr: string } {
  if (!window) {
    return getPast30DayRange();
  }

  const from = new Date(window.from);
  const to = new Date(window.to);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
    return getPast30DayRange();
  }

  return { from, to, fromStr: formatDateTime(from), toStr: formatDateTime(to) };
}

function splitWrsEvaluations(
  peerEvaluations: WrsEvaluationRow[] | null,
  from: Date,
  to: Date,
): {
  effective: Array<{ average_score: number }>;
  delayed: Array<{ average_score: number }>;
} {
  if (!Array.isArray(peerEvaluations) || peerEvaluations.length === 0) {
    return { effective: [], delayed: [] };
  }

  const effective: Array<{ average_score: number }> = [];
  const delayed: Array<{ average_score: number }> = [];

  for (const evaluation of peerEvaluations) {
    const submittedAt = evaluation.submitted_at ? parseUtcTimestamp(evaluation.submitted_at) : null;
    const isExpiredWithoutSubmission = evaluation.status === 'expired' && !evaluation.submitted_at;
    const effectiveAtRaw = isExpiredWithoutSubmission
      ? evaluation.expires_at ?? evaluation.wrs_effective_at ?? evaluation.submitted_at
      : evaluation.wrs_effective_at ?? evaluation.submitted_at;
    const effectiveAt = effectiveAtRaw ? parseUtcTimestamp(effectiveAtRaw) : null;
    const averageScore = isExpiredWithoutSubmission ? 5 : evaluation.average_score;
    if (!effectiveAt || Number.isNaN(effectiveAt.getTime())) continue;

    if (effectiveAt >= from && effectiveAt <= to) {
      effective.push({ average_score: averageScore });
      continue;
    }

    if (submittedAt && !Number.isNaN(submittedAt.getTime()) && submittedAt >= from && submittedAt <= to && effectiveAt > to) {
      delayed.push({ average_score: averageScore });
    }
  }

  return { effective, delayed };
}

export function getWrsStatusSummary(
  peerEvaluations: WrsEvaluationRow[] | null,
  from: Date,
  to: Date,
): WrsStatusSummary {
  const { effective, delayed } = splitWrsEvaluations(peerEvaluations, from, to);
  return {
    effectiveCount: effective.length,
    delayedCount: delayed.length,
  };
}

// ─── Individual KPI Calculators ───────────────────────────────────────────────

function calcWrs(
  peerEvaluations: WrsEvaluationRow[] | null,
  from: Date,
  to: Date,
  minRecords: number = 10,
): { score: number | null; impact: number; count: number } {
  const { effective } = splitWrsEvaluations(peerEvaluations, from, to);
  const count = effective.length;
  if (count < minRecords) return { score: null, impact: 0, count };
  const avg = effective.reduce((s, e) => s + Number(e.average_score), 0) / count;
  const score = Math.round(avg * 100) / 100;
  return { score, impact: wrsImpact(score), count };
}

function calcComplianceRate(
  complianceAudit: Array<{ answers: Record<string, any>; audited_at: string }> | null,
  field: string,
  from: Date,
  to: Date,
  minRecords: number = 10,
): { rate: number | null; count: number } {
  if (!Array.isArray(complianceAudit) || complianceAudit.length === 0) return { rate: null, count: 0 };
  const recent = complianceAudit.filter(
    (a) => dateRangeFilter(a.audited_at, from, to) && typeof a.answers?.[field] === 'boolean'
  );
  const count = recent.length;
  if (count < minRecords) return { rate: null, count };
  const trueCount = recent.filter((a) => a.answers[field] === true).length;
  const rate = Math.round((trueCount / count) * 10000) / 100;
  return { rate, count };
}

function calcAverageScore(
  complianceAudit: Array<{ answers: Record<string, any>; audited_at: string }> | null,
  field: string,
  from: Date,
  to: Date,
  minRecords: number = 10,
): { score: number | null; count: number } {
  if (!Array.isArray(complianceAudit) || complianceAudit.length === 0) return { score: null, count: 0 };
  const recent = complianceAudit.filter(
    (a) => dateRangeFilter(a.audited_at, from, to) && typeof a.answers?.[field] === 'number'
  );
  const count = recent.length;
  if (count < minRecords) return { score: null, count };
  const sum = recent.reduce((s, a) => s + a.answers[field], 0);
  const score = Math.round((sum / count) * 100) / 100;
  return { score, count };
}

function calcAttendanceFromRecords(
  slots: OdooPlanningSlot[],
  attendances: OdooAttendanceRecord[],
  minRecords: number = 10,
): { rate: number | null; impact: number; count: number } {
  const count = slots.length;
  if (count < minRecords) return { rate: null, impact: 0, count };

  const scheduledHours = slots.reduce((s, slot) => s + (slot.allocated_hours || 0), 0);
  if (scheduledHours === 0) return { rate: null, impact: 0, count };

  // Build set of days with actual check-ins
  const checkedInDays = new Set(
    attendances.map((a) => parseUtcTimestamp(a.check_in).toDateString()),
  );

  // For each slot, check if there's a check-in on that day
  let absentHours = 0;
  for (const slot of slots) {
    const slotDay = parseUtcTimestamp(slot.start_datetime).toDateString();
    if (!checkedInDays.has(slotDay)) {
      absentHours += slot.allocated_hours || 0;
    }
  }

  const rate = Math.round(((scheduledHours - absentHours) / scheduledHours) * 10000) / 100;
  return { rate, impact: attendanceImpact(rate), count };
}

function calcPunctualityFromRecords(
  slots: OdooPlanningSlot[],
  attendances: OdooAttendanceRecord[],
  minRecords: number = 10,
): { rate: number | null; impact: number; count: number } {
  const count = slots.length;
  if (count < minRecords) return { rate: null, impact: 0, count };

  // Group attendances by employee+day for lookup
  const checkInMap = new Map<string, Date>();
  for (const att of attendances) {
    const empId = Array.isArray(att.employee_id) ? att.employee_id[0] : att.employee_id;
    const checkIn = parseUtcTimestamp(att.check_in);
    const day = checkIn.toDateString();
    const key = `${empId}:${day}`;
    if (!checkInMap.has(key)) {
      checkInMap.set(key, checkIn);
    }
  }

  let scheduledMinutes = 0;
  let totalLateMinutes = 0;

  for (const slot of slots) {
    const slotStart = parseUtcTimestamp(slot.start_datetime);
    const slotEnd = parseUtcTimestamp(slot.end_datetime);
    const durationMinutes = (slotEnd.getTime() - slotStart.getTime()) / 60000;
    scheduledMinutes += durationMinutes;

    const empId = Array.isArray(slot.employee_id) ? slot.employee_id[0] : slot.employee_id;
    const day = slotStart.toDateString();
    const key = `${empId}:${day}`;
    const checkIn = checkInMap.get(key);
    if (checkIn) {
      const lateMs = checkIn.getTime() - slotStart.getTime();
      if (lateMs > 0) {
        totalLateMinutes += lateMs / 60000;
      }
    }
  }

  if (scheduledMinutes === 0) return { rate: null, impact: 0, count };

  const rate = Math.round(((scheduledMinutes - totalLateMinutes) / scheduledMinutes) * 10000) / 100;
  return { rate, impact: punctualityImpact(rate), count };
}

async function fetchOperationalOdooData(
  employeeOdooIds: number[],
  dateFrom: string,
  dateTo: string,
  queryDeps: KpiQueryDeps,
): Promise<{ slots: OdooPlanningSlot[]; attendances: OdooAttendanceRecord[] }> {
  if (employeeOdooIds.length === 0) {
    return {
      slots: [],
      attendances: [],
    };
  }

  const [slots, attendances] = await Promise.all([
    queryDeps.getScheduledSlots(employeeOdooIds, dateFrom, dateTo),
    queryDeps.getAttendanceRecords(employeeOdooIds, dateFrom, dateTo),
  ]);

  return { slots, attendances };
}

async function calcAov(
  orders: OdooPosOrder[],
  attendances: OdooAttendanceRecord[],
  dateFrom: string,
  dateTo: string,
  queryDeps: Pick<KpiQueryDeps, 'getBranchPosOrders'>,
  minRecords: number = 10,
): Promise<{ value: number | null; branch_avg: number | null; impact: number; count: number }> {
  const count = orders.length;
  if (count < minRecords) return { value: null, branch_avg: null, impact: 0, count };

  const employeeTotal = orders.reduce((s, o) => s + o.amount_total, 0);
  const employeeAov = employeeTotal / count;
  const roundedEmployeeAov = Math.round(employeeAov * 100) / 100;

  const workedBranchIds = Array.from(new Set(
    attendances
      .map((attendance) => Array.isArray(attendance.x_company_id) ? Number(attendance.x_company_id[0]) : null)
      .filter((branchId): branchId is number => branchId !== null && Number.isFinite(branchId)),
  ));

  if (workedBranchIds.length === 0) {
    return { value: roundedEmployeeAov, branch_avg: null, impact: 0, count };
  }

  const branchOrderWeights = new Map<number, number>();
  for (const order of orders) {
    const branchId = Array.isArray(order.company_id) ? Number(order.company_id[0]) : null;
    if (branchId === null || !Number.isFinite(branchId)) continue;
    branchOrderWeights.set(branchId, (branchOrderWeights.get(branchId) ?? 0) + 1);
  }

  const branchOrdersAll = await Promise.all(
    workedBranchIds.map((branchId) => queryDeps.getBranchPosOrders(branchId, dateFrom, dateTo)),
  );

  let weightedTotal = 0;
  let weightedCount = 0;
  for (const [index, branchOrders] of branchOrdersAll.entries()) {
    const branchId = workedBranchIds[index];
    if (branchId === undefined) continue;

    const employeeOrderCount = branchOrderWeights.get(branchId) ?? 0;
    if (employeeOrderCount === 0 || branchOrders.length === 0) continue;

    const branchTotal = branchOrders.reduce((sum, order) => sum + order.amount_total, 0);
    const branchAov = branchTotal / branchOrders.length;

    weightedTotal += branchAov * employeeOrderCount;
    weightedCount += employeeOrderCount;
  }

  if (weightedCount === 0) {
    return { value: roundedEmployeeAov, branch_avg: null, impact: 0, count };
  }

  const branchBenchmark = weightedTotal / weightedCount;

  const pct = branchBenchmark > 0
    ? ((employeeAov - branchBenchmark) / branchBenchmark) * 100
    : 0;

  return {
    value: roundedEmployeeAov,
    branch_avg: Math.round(branchBenchmark * 100) / 100,
    impact: aovImpact(pct),
    count,
  };
}

function calcViolations(
  violationNotices: Array<{ epi_decrease?: number | null; completed_at?: string | null }> | null,
  from: Date,
  to: Date,
): { count: number; total_decrease: number; impact: number } {
  if (!Array.isArray(violationNotices) || violationNotices.length === 0) {
    return { count: 0, total_decrease: 0, impact: 0 };
  }
  const recent = violationNotices.filter(
    (vn) => vn.completed_at && dateRangeFilter(vn.completed_at, from, to),
  );
  const totalDecrease = recent.reduce((s, vn) => s + Number(vn.epi_decrease ?? 0), 0);
  return {
    count: recent.length,
    total_decrease: totalDecrease,
    impact: 0, // Impact is zero because EPI points are now deducted immediately on completion
  };
}

function calcAwards(
  rewardRequests: Array<{ epi_delta?: number | null; applied_at?: string | null }> | null | undefined,
  from: Date,
  to: Date,
): { count: number; total_increase: number; impact: number } {
  if (!Array.isArray(rewardRequests) || rewardRequests.length === 0) {
    return { count: 0, total_increase: 0, impact: 0 };
  }

  const recent = rewardRequests.filter(
    (reward) => reward.applied_at && dateRangeFilter(reward.applied_at, from, to),
  );
  const totalIncrease = recent.reduce((sum, reward) => sum + Number(reward.epi_delta ?? 0), 0);
  return {
    count: recent.length,
    total_increase: Math.round(totalIncrease * 100) / 100,
    impact: 0, // Impact is zero because EPI points are applied immediately on approval
  };
}

// ─── Main KPI Calculation ─────────────────────────────────────────────────────

export interface UserKpiData {
  userId: string;
  userKey: string;
  cssAudits: Array<{ star_rating: number; audited_at: string }> | null;
  peerEvaluations: WrsEvaluationRow[] | null;
  complianceAudit: Array<{ answers: Record<string, any>; audited_at: string }> | null;
  rewardRequests?: Array<{ epi_delta?: number | null; applied_at?: string | null }> | null;
  violationNotices: Array<{ epi_decrease?: number | null; completed_at?: string | null }> | null;
}

/**
 * Calculates all 12 KPI scores and the EPI delta for a single user.
 * Odoo live queries are made for attendance, punctuality, and AOV.
 */
export async function calculateKpiScoresWithQueryDeps(
  userData: UserKpiData,
  queryDeps: KpiQueryDeps,
  options?: {
    window?: KpiComputationWindow;
    minRecords?: number;
  },
): Promise<EpiDeltaResult> {
  const { from, to, fromStr, toStr } = resolveKpiComputationWindow(options?.window);
  const minRecords = options?.minRecords ?? 10;

  // Resolve Odoo employee IDs for this user
  const employeeOdooIds = await queryDeps.getOdooEmployeeIdsByWebsiteKey(userData.userKey);

  const operationalOdooDataPromise = fetchOperationalOdooData(employeeOdooIds, fromStr, toStr, queryDeps);
  const employeeOrdersPromise = queryDeps.getPosOrders(userData.userKey, fromStr, toStr);

  // Run all calculations in parallel where possible
  const [operationalOdooData, employeeOrders] = await Promise.all([
    operationalOdooDataPromise,
    employeeOrdersPromise,
  ]);
  const aovResult = await calcAov(
    employeeOrders,
    operationalOdooData.attendances,
    fromStr,
    toStr,
    queryDeps,
    minRecords,
  );

  const attendanceResult = calcAttendanceFromRecords(
    operationalOdooData.slots,
    operationalOdooData.attendances,
    minRecords,
  );
  const punctualityResult = calcPunctualityFromRecords(
    operationalOdooData.slots,
    operationalOdooData.attendances,
    minRecords,
  );

  const wrs = calcWrs(userData.peerEvaluations, from, to, minRecords);
  const pcs: KpiBreakdown['pcs'] = {
    score: null, // PCS sourcing to be implemented once management evaluation system is live
    impact: 0, // Placeholder impact for now until score is sourced
  };

  const complianceProductivity = calcComplianceRate(userData.complianceAudit, 'scc_productivity_rate', from, to, minRecords);
  const complianceUniform = calcComplianceRate(userData.complianceAudit, 'scc_uniform_compliance', from, to, minRecords);
  const complianceHygiene = calcComplianceRate(userData.complianceAudit, 'scc_hygiene_compliance', from, to, minRecords);
  const complianceSop = calcComplianceRate(userData.complianceAudit, 'scc_sop_compliance', from, to, minRecords);

  const complianceCustomerInteraction = calcAverageScore(userData.complianceAudit, 'scc_customer_interaction', from, to, minRecords);
  const complianceCashiering = calcAverageScore(userData.complianceAudit, 'scc_cashiering', from, to, minRecords);
  const complianceSuggestiveSelling = calcAverageScore(userData.complianceAudit, 'scc_suggestive_selling_and_upselling', from, to, minRecords);
  const complianceServiceEfficiency = calcAverageScore(userData.complianceAudit, 'scc_service_efficiency', from, to, minRecords);

  const productivity: KpiBreakdown['productivity'] = {
    rate: complianceProductivity.rate,
    impact: complianceProductivity.rate !== null ? productivityImpact(complianceProductivity.rate) : 0,
  };
  const uniform: KpiBreakdown['uniform'] = {
    rate: complianceUniform.rate,
    impact: complianceUniform.rate !== null ? uniformImpact(complianceUniform.rate) : 0,
  };
  const hygiene: KpiBreakdown['hygiene'] = {
    rate: complianceHygiene.rate,
    impact: complianceHygiene.rate !== null ? hygieneImpact(complianceHygiene.rate) : 0,
  };
  const sop: KpiBreakdown['sop'] = {
    rate: complianceSop.rate,
    impact: complianceSop.rate !== null ? sopImpact(complianceSop.rate) : 0,
  };
  const customer_interaction: KpiBreakdown['customer_interaction'] = {
    score: complianceCustomerInteraction.score,
    impact: complianceCustomerInteraction.score !== null ? customerInteractionImpact(complianceCustomerInteraction.score) : 0,
  };
  const cashiering: KpiBreakdown['cashiering'] = {
    score: complianceCashiering.score,
    impact: complianceCashiering.score !== null ? cashieringImpact(complianceCashiering.score) : 0,
  };
  const suggestive_selling_and_upselling: KpiBreakdown['suggestive_selling_and_upselling'] = {
    score: complianceSuggestiveSelling.score,
    impact: complianceSuggestiveSelling.score !== null ? suggestiveSellingImpact(complianceSuggestiveSelling.score) : 0,
  };
  const service_efficiency: KpiBreakdown['service_efficiency'] = {
    score: complianceServiceEfficiency.score,
    impact: complianceServiceEfficiency.score !== null ? serviceEfficiencyImpact(complianceServiceEfficiency.score) : 0,
  };

  const awards = calcAwards(userData.rewardRequests, from, to);

  const violations = calcViolations(userData.violationNotices, from, to);

  const breakdown: KpiBreakdown = {
    wrs,
    pcs,
    attendance: attendanceResult,
    punctuality: punctualityResult,
    productivity,
    aov: aovResult,
    uniform,
    hygiene,
    sop,
    customer_interaction,
    cashiering,
    suggestive_selling_and_upselling,
    service_efficiency,
    awards,
    violations,
  };

  const raw_delta =
    wrs.impact +
    pcs.impact +
    attendanceResult.impact +
    punctualityResult.impact +
    productivity.impact +
    aovResult.impact +
    uniform.impact +
    hygiene.impact +
    sop.impact +
    customer_interaction.impact +
    cashiering.impact +
    suggestive_selling_and_upselling.impact +
    service_efficiency.impact +
    awards.impact +
    violations.impact;

  const capped = false;
  const delta = Math.round(raw_delta * 100) / 100;

  return { breakdown, delta, raw_delta, capped };
}

export async function calculateKpiScores(
  userData: UserKpiData,
  options?: {
    window?: KpiComputationWindow;
    minRecords?: number;
  },
): Promise<EpiDeltaResult> {
  return calculateKpiScoresWithQueryDeps(userData, defaultKpiQueryDeps, options);
}

/**
 * Batch version of KPI calculation.
 * Fetches Odoo data for all users in one go to minimize network round-trips.
 */
export async function calculateKpiScoresBatch(
  usersData: UserKpiData[],
  options?: {
    window?: KpiComputationWindow;
    minRecords?: number;
  },
): Promise<Map<string, EpiDeltaResult>> {
  const { from, to, fromStr, toStr } = resolveKpiComputationWindow(options?.window);
  const minRecords = options?.minRecords ?? 10;
  const queryDeps = defaultKpiQueryDeps;

  if (usersData.length === 0) return new Map();

  // 1. Resolve all Odoo employee IDs in one call
  const userKeys = usersData.map((u) => u.userKey);
  const employeeIdMappings = await getOdooEmployeeIdsByWebsiteKeys(userKeys);
  
  const websiteKeyToOdooIds = new Map<string, number[]>();
  const allOdooEmployeeIds: number[] = [];
  
  for (const mapping of employeeIdMappings) {
    const ids = websiteKeyToOdooIds.get(mapping.website_key) ?? [];
    ids.push(mapping.id);
    websiteKeyToOdooIds.set(mapping.website_key, ids);
    allOdooEmployeeIds.push(mapping.id);
  }

  // 2. Fetch Odoo data in batch
  const [allSlots, allAttendances, allOrders] = await Promise.all([
    queryDeps.getScheduledSlots(allOdooEmployeeIds, fromStr, toStr),
    queryDeps.getAttendanceRecords(allOdooEmployeeIds, fromStr, toStr),
    getPosOrdersBatch(userKeys, fromStr, toStr),
  ]);

  // 3. Map batch data back to specific users
  const slotsByOdooId = new Map<number, OdooPlanningSlot[]>();
  for (const slot of allSlots) {
    const empId = Array.isArray(slot.employee_id) ? slot.employee_id[0] : slot.employee_id;
    const list = slotsByOdooId.get(empId) ?? [];
    list.push(slot);
    slotsByOdooId.set(empId, list);
  }

  const attendancesByOdooId = new Map<number, OdooAttendanceRecord[]>();
  for (const att of allAttendances) {
    const empId = Array.isArray(att.employee_id) ? att.employee_id[0] : att.employee_id;
    const list = attendancesByOdooId.get(empId) ?? [];
    list.push(att);
    attendancesByOdooId.set(empId, list);
  }

  const ordersByWebsiteKey = new Map<string, OdooPosOrder[]>();
  for (const order of allOrders as (OdooPosOrder & { x_website_key: string })[]) {
    const list = ordersByWebsiteKey.get(order.x_website_key) ?? [];
    list.push(order);
    ordersByWebsiteKey.set(order.x_website_key, list);
  }

  // 4. Calculate for each user using the local (batched) data
  const results = new Map<string, EpiDeltaResult>();
  
  for (const userData of usersData) {
    const odooIds = websiteKeyToOdooIds.get(userData.userKey) ?? [];
    const userSlots = odooIds.flatMap((id) => slotsByOdooId.get(id) ?? []);
    const userAttendances = odooIds.flatMap((id) => attendancesByOdooId.get(id) ?? []);
    const userOrders = ordersByWebsiteKey.get(userData.userKey) ?? [];

    const aovResult = await calcAov(
      userOrders,
      userAttendances,
      fromStr,
      toStr,
      queryDeps,
      minRecords,
    );

    const attendanceResult = calcAttendanceFromRecords(userSlots, userAttendances, minRecords);
    const punctualityResult = calcPunctualityFromRecords(userSlots, userAttendances, minRecords);

    const wrs = calcWrs(userData.peerEvaluations, from, to, minRecords);
    const pcs: KpiBreakdown['pcs'] = { score: null, impact: 0 };

    const complianceProductivity = calcComplianceRate(userData.complianceAudit, 'scc_productivity_rate', from, to, minRecords);
    const complianceUniform = calcComplianceRate(userData.complianceAudit, 'scc_uniform_compliance', from, to, minRecords);
    const complianceHygiene = calcComplianceRate(userData.complianceAudit, 'scc_hygiene_compliance', from, to, minRecords);
    const complianceSop = calcComplianceRate(userData.complianceAudit, 'scc_sop_compliance', from, to, minRecords);
    const complianceCustomerInteraction = calcAverageScore(userData.complianceAudit, 'scc_customer_interaction', from, to, minRecords);
    const complianceCashiering = calcAverageScore(userData.complianceAudit, 'scc_cashiering', from, to, minRecords);
    const complianceSuggestiveSelling = calcAverageScore(userData.complianceAudit, 'scc_suggestive_selling_and_upselling', from, to, minRecords);
    const complianceServiceEfficiency = calcAverageScore(userData.complianceAudit, 'scc_service_efficiency', from, to, minRecords);

    const productivity: KpiBreakdown['productivity'] = {
      rate: complianceProductivity.rate,
      impact: complianceProductivity.rate !== null ? productivityImpact(complianceProductivity.rate) : 0,
    };
    const uniform: KpiBreakdown['uniform'] = {
      rate: complianceUniform.rate,
      impact: complianceUniform.rate !== null ? uniformImpact(complianceUniform.rate) : 0,
    };
    const hygiene: KpiBreakdown['hygiene'] = {
      rate: complianceHygiene.rate,
      impact: complianceHygiene.rate !== null ? hygieneImpact(complianceHygiene.rate) : 0,
    };
    const sop: KpiBreakdown['sop'] = {
      rate: complianceSop.rate,
      impact: complianceSop.rate !== null ? sopImpact(complianceSop.rate) : 0,
    };
    const customer_interaction: KpiBreakdown['customer_interaction'] = {
      score: complianceCustomerInteraction.score,
      impact: complianceCustomerInteraction.score !== null ? customerInteractionImpact(complianceCustomerInteraction.score) : 0,
    };
    const cashiering: KpiBreakdown['cashiering'] = {
      score: complianceCashiering.score,
      impact: complianceCashiering.score !== null ? cashieringImpact(complianceCashiering.score) : 0,
    };
    const suggestive_selling_and_upselling: KpiBreakdown['suggestive_selling_and_upselling'] = {
      score: complianceSuggestiveSelling.score,
      impact: complianceSuggestiveSelling.score !== null ? suggestiveSellingImpact(complianceSuggestiveSelling.score) : 0,
    };
    const service_efficiency: KpiBreakdown['service_efficiency'] = {
      score: complianceServiceEfficiency.score,
      impact: complianceServiceEfficiency.score !== null ? serviceEfficiencyImpact(complianceServiceEfficiency.score) : 0,
    };

    const awards = calcAwards(userData.rewardRequests, from, to);
    const violations = calcViolations(userData.violationNotices, from, to);

    const breakdown: KpiBreakdown = {
      wrs,
      pcs,
      attendance: attendanceResult,
      punctuality: punctualityResult,
      productivity,
      aov: aovResult,
      uniform,
      hygiene,
      sop,
      customer_interaction,
      cashiering,
      suggestive_selling_and_upselling,
      service_efficiency,
      awards,
      violations,
    };

    const raw_delta =
      wrs.impact +
      pcs.impact +
      attendanceResult.impact +
      punctualityResult.impact +
      productivity.impact +
      aovResult.impact +
      uniform.impact +
      hygiene.impact +
      sop.impact +
      customer_interaction.impact +
      cashiering.impact +
      suggestive_selling_and_upselling.impact +
      service_efficiency.impact +
      awards.impact +
      violations.impact;

    const delta = Math.round(raw_delta * 100) / 100;
    results.set(userData.userId, { breakdown, delta, raw_delta, capped: false });
  }

  return results;
}
