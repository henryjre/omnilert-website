import {
  getOdooEmployeeIdsByWebsiteKey,
  getScheduledSlots,
  getAttendanceRecords,
  getPosOrders,
  getBranchPosOrders,
  type OdooPosOrder,
  type OdooAttendanceRecord,
  type OdooPlanningSlot,
} from './odooQuery.service.js';

// ─── KPI Breakdown Types ──────────────────────────────────────────────────────

export interface KpiBreakdown {
  css: { score: number | null; impact: number };
  wrs: { score: number | null; impact: number };
  pcs: { score: number | null; impact: number };
  attendance: { rate: number | null; impact: number };
  punctuality: { rate: number | null; impact: number };
  productivity: { rate: number | null; impact: number };
  aov: { value: number | null; branch_avg: number | null; impact: number };
  uniform: { rate: number | null; impact: number };
  hygiene: { rate: number | null; impact: number };
  sop: { rate: number | null; impact: number };
  awards: { count: number; impact: number };
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

function cssImpact(score: number): number {
  if (score >= 4.5) return 2;
  if (score >= 4.2) return 1;
  if (score >= 3.8) return 0;
  if (score >= 3.5) return -1;
  return -2;
}

function wrsImpact(score: number): number {
  if (score >= 4.5) return 1;
  if (score >= 4.0) return 0.5;
  if (score >= 3.7) return 0;
  if (score >= 3.3) return -0.5;
  return -1;
}

function attendanceImpact(rate: number): number {
  if (rate >= 99) return 2;
  if (rate >= 98) return 1;
  if (rate >= 95) return 0;
  if (rate >= 90) return -1;
  if (rate >= 85) return -2;
  if (rate >= 80) return -3;
  if (rate >= 70) return -4;
  return -5;
}

function punctualityImpact(rate: number): number {
  if (rate >= 98) return 1;
  if (rate >= 95) return 0;
  if (rate >= 90) return -1;
  if (rate >= 85) return -2;
  return -3;
}

function productivityImpact(rate: number): number {
  if (rate >= 95) return 1;
  if (rate >= 90) return 0;
  if (rate >= 85) return -0.5;
  if (rate >= 80) return -1;
  return -2;
}

function aovImpact(pct: number): number {
  if (pct >= 10) return 2;
  if (pct > 0) return 1;
  if (pct >= -5) return 0;
  if (pct >= -10) return -1;
  return -2;
}

function uniformImpact(rate: number): number {
  if (rate >= 95) return 1;
  if (rate >= 90) return 0;
  if (rate >= 85) return -0.5;
  if (rate >= 80) return -1;
  return -2;
}

function hygieneImpact(rate: number): number {
  return uniformImpact(rate); // Same table
}

function sopImpact(rate: number): number {
  return uniformImpact(rate); // Same table
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dateRangeFilter(dateStr: string, from: Date, to: Date): boolean {
  const d = new Date(dateStr);
  return d >= from && d <= to;
}

function formatDateTime(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
  peerEvaluations: Array<{
    average_score: number;
    submitted_at?: string | null;
    wrs_effective_at?: string | null;
  }> | null,
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
    const submittedAt = evaluation.submitted_at ? new Date(evaluation.submitted_at) : null;
    const effectiveAtRaw = evaluation.wrs_effective_at ?? evaluation.submitted_at;
    const effectiveAt = effectiveAtRaw ? new Date(effectiveAtRaw) : null;
    if (!effectiveAt || Number.isNaN(effectiveAt.getTime())) continue;

    if (effectiveAt >= from && effectiveAt <= to) {
      effective.push({ average_score: evaluation.average_score });
      continue;
    }

    if (submittedAt && !Number.isNaN(submittedAt.getTime()) && submittedAt >= from && submittedAt <= to && effectiveAt > to) {
      delayed.push({ average_score: evaluation.average_score });
    }
  }

  return { effective, delayed };
}

export function getWrsStatusSummary(
  peerEvaluations: Array<{
    average_score: number;
    submitted_at?: string | null;
    wrs_effective_at?: string | null;
  }> | null,
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

function calcCss(cssAudits: Array<{ star_rating: number; audited_at: string }> | null, from: Date, to: Date): { score: number | null; impact: number } {
  if (!Array.isArray(cssAudits) || cssAudits.length === 0) return { score: null, impact: 0 };
  const recent = cssAudits.filter((a) => dateRangeFilter(a.audited_at, from, to));
  if (recent.length === 0) return { score: null, impact: 0 };
  const avg = recent.reduce((s, a) => s + a.star_rating, 0) / recent.length;
  const score = Math.round(avg * 100) / 100;
  return { score, impact: cssImpact(score) };
}

function calcWrs(
  peerEvaluations: Array<{
    average_score: number;
    submitted_at?: string | null;
    wrs_effective_at?: string | null;
  }> | null,
  from: Date,
  to: Date,
): { score: number | null; impact: number } {
  const { effective } = splitWrsEvaluations(peerEvaluations, from, to);
  if (effective.length === 0) return { score: null, impact: 0 };
  const avg = effective.reduce((s, e) => s + e.average_score, 0) / effective.length;
  const score = Math.round(avg * 100) / 100;
  return { score, impact: wrsImpact(score) };
}

function calcComplianceRate(
  complianceAudit: Array<{ answers: Record<string, boolean>; audited_at: string }> | null,
  field: string,
  from: Date,
  to: Date,
): number | null {
  if (!Array.isArray(complianceAudit) || complianceAudit.length === 0) return null;
  const recent = complianceAudit.filter((a) => dateRangeFilter(a.audited_at, from, to));
  if (recent.length === 0) return null;
  const trueCount = recent.filter((a) => a.answers?.[field] === true).length;
  return Math.round((trueCount / recent.length) * 1000) / 10;
}

function calcAttendanceFromRecords(
  slots: OdooPlanningSlot[],
  attendances: OdooAttendanceRecord[],
): { rate: number | null; impact: number } {
  if (slots.length === 0) return { rate: null, impact: 0 };

  const scheduledHours = slots.reduce((s, slot) => s + (slot.allocated_hours || 0), 0);
  if (scheduledHours === 0) return { rate: null, impact: 0 };

  // Build set of days with actual check-ins
  const checkedInDays = new Set(
    attendances.map((a) => new Date(a.check_in).toDateString()),
  );

  // For each slot, check if there's a check-in on that day
  let absentHours = 0;
  for (const slot of slots) {
    const slotDay = new Date(slot.start_datetime).toDateString();
    if (!checkedInDays.has(slotDay)) {
      absentHours += slot.allocated_hours || 0;
    }
  }

  const rate = Math.round(((scheduledHours - absentHours) / scheduledHours) * 1000) / 10;
  return { rate, impact: attendanceImpact(rate) };
}

function calcPunctualityFromRecords(
  slots: OdooPlanningSlot[],
  attendances: OdooAttendanceRecord[],
): { rate: number | null; impact: number } {
  if (slots.length === 0) return { rate: null, impact: 0 };

  // Group attendances by employee+day for lookup
  const checkInMap = new Map<string, Date>();
  for (const att of attendances) {
    const empId = Array.isArray(att.employee_id) ? att.employee_id[0] : att.employee_id;
    const day = new Date(att.check_in).toDateString();
    const key = `${empId}:${day}`;
    if (!checkInMap.has(key)) {
      checkInMap.set(key, new Date(att.check_in));
    }
  }

  let scheduledMinutes = 0;
  let totalLateMinutes = 0;

  for (const slot of slots) {
    const slotStart = new Date(slot.start_datetime);
    const slotEnd = new Date(slot.end_datetime);
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

  if (scheduledMinutes === 0) return { rate: null, impact: 0 };

  const rate = Math.round(((scheduledMinutes - totalLateMinutes) / scheduledMinutes) * 1000) / 10;
  return { rate, impact: punctualityImpact(rate) };
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
): Promise<{ value: number | null; branch_avg: number | null; impact: number }> {
  if (orders.length === 0) return { value: null, branch_avg: null, impact: 0 };

  const employeeTotal = orders.reduce((s, o) => s + o.amount_total, 0);
  const employeeAov = employeeTotal / orders.length;
  const roundedEmployeeAov = Math.round(employeeAov * 100) / 100;

  const workedBranchIds = Array.from(new Set(
    attendances
      .map((attendance) => Array.isArray(attendance.x_company_id) ? Number(attendance.x_company_id[0]) : null)
      .filter((branchId): branchId is number => branchId !== null && Number.isFinite(branchId)),
  ));

  if (workedBranchIds.length === 0) {
    return { value: roundedEmployeeAov, branch_avg: null, impact: 0 };
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
    return { value: roundedEmployeeAov, branch_avg: null, impact: 0 };
  }

  const branchBenchmark = weightedTotal / weightedCount;

  const pct = branchBenchmark > 0
    ? ((employeeAov - branchBenchmark) / branchBenchmark) * 100
    : 0;

  return {
    value: roundedEmployeeAov,
    branch_avg: Math.round(branchBenchmark * 100) / 100,
    impact: aovImpact(pct),
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
  const totalDecrease = recent.reduce((s, vn) => s + (vn.epi_decrease ?? 0), 0);
  return {
    count: recent.length,
    total_decrease: totalDecrease,
    impact: -totalDecrease,
  };
}

// ─── Main KPI Calculation ─────────────────────────────────────────────────────

export interface UserKpiData {
  userId: string;
  userKey: string;
  cssAudits: Array<{ star_rating: number; audited_at: string }> | null;
  peerEvaluations: Array<{
    average_score: number;
    submitted_at?: string | null;
    wrs_effective_at?: string | null;
  }> | null;
  complianceAudit: Array<{ answers: Record<string, boolean>; audited_at: string }> | null;
  violationNotices: Array<{ epi_decrease?: number | null; completed_at?: string | null }> | null;
}

/**
 * Calculates all 12 KPI scores and the EPI delta for a single user.
 * Odoo live queries are made for attendance, punctuality, and AOV.
 */
export async function calculateKpiScoresWithQueryDeps(
  userData: UserKpiData,
  queryDeps: KpiQueryDeps,
  window?: KpiComputationWindow,
): Promise<EpiDeltaResult> {
  const { from, to, fromStr, toStr } = resolveKpiComputationWindow(window);

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
  );

  const attendanceResult = calcAttendanceFromRecords(
    operationalOdooData.slots,
    operationalOdooData.attendances,
  );
  const punctualityResult = calcPunctualityFromRecords(
    operationalOdooData.slots,
    operationalOdooData.attendances,
  );

  const css = calcCss(userData.cssAudits, from, to);
  const wrs = calcWrs(userData.peerEvaluations, from, to);
  const pcs: KpiBreakdown['pcs'] = { score: null, impact: 0 }; // Not yet implemented

  const productivityRate = calcComplianceRate(userData.complianceAudit, 'productivity_rate', from, to);
  const uniformRate = calcComplianceRate(userData.complianceAudit, 'uniform', from, to);
  const hygieneRate = calcComplianceRate(userData.complianceAudit, 'hygiene', from, to);
  const sopRate = calcComplianceRate(userData.complianceAudit, 'sop', from, to);

  const productivity: KpiBreakdown['productivity'] = {
    rate: productivityRate,
    impact: productivityRate !== null ? productivityImpact(productivityRate) : 0,
  };
  const uniform: KpiBreakdown['uniform'] = {
    rate: uniformRate,
    impact: uniformRate !== null ? uniformImpact(uniformRate) : 0,
  };
  const hygiene: KpiBreakdown['hygiene'] = {
    rate: hygieneRate,
    impact: hygieneRate !== null ? hygieneImpact(hygieneRate) : 0,
  };
  const sop: KpiBreakdown['sop'] = {
    rate: sopRate,
    impact: sopRate !== null ? sopImpact(sopRate) : 0,
  };

  const awards: KpiBreakdown['awards'] = { count: 0, impact: 0 }; // Awards system not yet built

  const violations = calcViolations(userData.violationNotices, from, to);

  const breakdown: KpiBreakdown = {
    css,
    wrs,
    pcs,
    attendance: attendanceResult,
    punctuality: punctualityResult,
    productivity,
    aov: aovResult,
    uniform,
    hygiene,
    sop,
    awards,
    violations,
  };

  const raw_delta =
    css.impact +
    wrs.impact +
    pcs.impact +
    attendanceResult.impact +
    punctualityResult.impact +
    productivity.impact +
    aovResult.impact +
    uniform.impact +
    hygiene.impact +
    sop.impact +
    awards.impact +
    violations.impact;

  const capped = Math.abs(raw_delta) > 5;
  const delta = Math.max(-5, Math.min(5, raw_delta));

  return { breakdown, delta, raw_delta, capped };
}

export async function calculateKpiScores(
  userData: UserKpiData,
  window?: KpiComputationWindow,
): Promise<EpiDeltaResult> {
  return calculateKpiScoresWithQueryDeps(userData, defaultKpiQueryDeps, window);
}
