import type { Request, Response, NextFunction } from 'express';
import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getEmployeeByWebsiteUserKey, getEmployeePayslipData, createViewOnlyPayslip, getEmployeeEPIData, getEmployeeAuditRatings, getAllEmployeesWithEPI, getAllPayslipsForUser, calculatePendingPayslipStubs, getPayslipDetailById, getOrCreatePendingPayslipDetail, getEmployeesForWebsiteUserKey } from '../services/odoo.service.js';
import type { PayslipListItem, PayslipDetailResponse, PayslipStatus } from '@omnilert/shared';
import { SYSTEM_ROLES } from '@omnilert/shared';
import { getEpiDashboard, getEpiLeaderboard, getEpiLeaderboardDetail } from '../services/epiDashboard.service.js';
import { getEmployeeMetricDailySnapshots } from '../services/employeeAnalyticsSnapshot.service.js';
import {
  getEmployeeMetricEventRows,
  type RollingMetricId,
} from '../services/employeeAnalyticsMetrics.service.js';

function parseMonthKey(monthKeyParam: string | undefined): string {
  if (!monthKeyParam) {
    throw new AppError(400, 'monthKey is required');
  }

  if (!/^\d{4}-\d{2}$/.test(monthKeyParam)) {
    throw new AppError(400, 'monthKey must be in YYYY-MM format');
  }

  const [, month] = monthKeyParam.split('-');
  const monthNumber = Number(month);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new AppError(400, 'monthKey month must be between 01 and 12');
  }

  return monthKeyParam;
}

function parseRangeYmd(value: string | undefined, fieldName: 'rangeStartYmd' | 'rangeEndYmd'): string {
  if (!value) {
    throw new AppError(400, `${fieldName} is required`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `${fieldName} must be in YYYY-MM-DD format`);
  }
  return value;
}

function parseMetricId(value: string | undefined): RollingMetricId {
  if (!value) {
    throw new AppError(400, 'metricId is required');
  }

  const allowed: RollingMetricId[] = [
    'customer-service',
    'workplace-relations',
    'attendance-rate',
    'punctuality-rate',
    'productivity-rate',
    'average-order-value',
    'uniform-compliance',
    'hygiene-compliance',
    'sop-compliance',
  ];

  if (!allowed.includes(value as RollingMetricId)) {
    throw new AppError(400, 'metricId is invalid');
  }
  return value as RollingMetricId;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export async function getPerformanceIndex(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getDb();
    const userId = req.user!.sub;
    const currentUser = await masterDb('users').where({ id: userId }).select('user_key').first();
    const userKey = currentUser?.user_key as string | undefined;

    if (!userKey) {
      res.json({ success: true, data: null });
      return;
    }

    // Get page from query params (default 1)
    const pageParam = req.query.page as string | undefined;
    const page = pageParam ? parseInt(pageParam, 10) : 1;

    // Get employee EPI data using website user ID
    const epiData = await getEmployeeEPIData(userKey);

    if (!epiData) {
      res.json({ success: true, data: null });
      return;
    }

    // Get audit ratings with pagination using x_website_key
    const auditRatings = await getEmployeeAuditRatings(userKey, page);

    // Return the EPI data with audit ratings
    res.json({ 
      success: true, 
      data: {
        id: epiData.id,
        employee_id: epiData.employee_id,
        x_epi: epiData.x_epi,
        x_average_sqaa: epiData.x_average_sqaa,
        x_average_scsa: epiData.x_average_scsa,
        auditRatings: auditRatings.items,
        pagination: auditRatings.pagination,
        currentUserEmployeeId: epiData.id,
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getPayslip(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getDb();
    // Get companyId (Odoo company ID) from query params
    const companyIdParam = req.query.companyId as string | undefined;
    
    if (!companyIdParam) {
      throw new AppError(400, "companyId is required");
    }
    
    const odooCompanyId = parseInt(companyIdParam, 10);
    
    if (isNaN(odooCompanyId)) {
      throw new AppError(400, "Invalid companyId");
    }

    // Get cutoff from query params (1 or 2)
    const cutoffParam = req.query.cutoff as string | undefined;
    const cutoff = cutoffParam ? parseInt(cutoffParam, 10) : undefined;
    if (cutoff && cutoff !== 1 && cutoff !== 2) {
      throw new AppError(400, "Invalid cutoff. Must be 1 or 2.");
    }

    // Get the user key from tenant user record
    const userId = req.user!.sub;
    const currentUser = await masterDb('users').where({ id: userId }).select('user_key').first();
    const userKey = currentUser?.user_key as string | undefined;

    if (!userKey) {
      logger.warn(`No user_key set for user ID: ${userId}`);
      res.json({ success: true, data: null });
      return;
    }

    // Search for employee by x_website_key and company_id
    const employee = await getEmployeeByWebsiteUserKey(userKey, odooCompanyId);

    if (!employee) {
      logger.warn(`No employee found for user ID: ${userId}`);
      res.json({ success: true, data: null });
      return;
    }

    // Try to get existing payslip, if not found, create a new one
    logger.info(`Getting payslip for employee ${employee.id}, company ${odooCompanyId}, cutoff ${cutoff || 'auto'}`);
    let payslip = await getEmployeePayslipData(employee.id, odooCompanyId, cutoff);

    if (!payslip) {
      logger.info(`No payslip found, attempting to create view-only payslip for employee ${employee.id}`);
      try {
        payslip = await createViewOnlyPayslip(employee.id, odooCompanyId, employee.name, cutoff);
        logger.info(`Successfully created view-only payslip ${payslip.id} for employee ${employee.id}`);
      } catch (createError) {
        logger.error(`Failed to create view-only payslip: ${createError}`);
        res.json({ 
          success: false, 
          error: "Unable to create payslip. Employee may not have an active contract." 
        });
        return;
      }
    }

    // Transform payslip data for frontend

    // Format period: "Feb 01, 2026 to Feb 15, 2026"
    const formatDate = (dateStr: string) => {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    };
    const period = `${formatDate(payslip.date_from)} to ${formatDate(payslip.date_to)}`;

    // Transform attendance (worked_days)
    const attendanceItems: Array<{ name: string; days: number; hours: number; amount: number }> = [];
    let totalDays = 0;
    let totalHours = 0;
    let totalAmount = 0;

    if (payslip.worked_days) {
      for (const wd of payslip.worked_days) {
        attendanceItems.push({
          name: wd.name,
          days: wd.number_of_days || 0,
          hours: wd.number_of_hours || 0,
          amount: wd.amount || 0,
        });
        totalDays += wd.number_of_days || 0;
        totalHours += wd.number_of_hours || 0;
        totalAmount += wd.amount || 0;
      }
    }

    // Transform salary lines into 3 categories
    const taxable: Array<{ description: string; amount: number }> = [];
    const nonTaxable: Array<{ description: string; amount: number }> = [];
    const deductions: Array<{ description: string; amount: number }> = [];

    let inTaxableSection = false;
    let inNonTaxableSection = false;
    let inDeductionsSection = false;

    // Track OTHERINC to combine them
    let otherIncomeTotal = 0;

    // Track net pay
    let netPay = 0;

    if (payslip.lines) {
      for (const line of payslip.lines) {
        const name = line.name?.trim() || '';
        const amount = line.total || 0;
        const code = line.code;

        // Get net pay
        if (code === 'NET') {
          netPay = amount;
          continue;
        }

        // Skip empty names
        if (!name) continue;

        // Track section boundaries
        if (name.startsWith('TAXABLE SALARY')) {
          inTaxableSection = true;
          inNonTaxableSection = false;
          inDeductionsSection = false;
          continue;
        }
        if (name.startsWith('NON-TAXABLE SALARY')) {
          inTaxableSection = false;
          inNonTaxableSection = true;
          inDeductionsSection = false;
          continue;
        }
        if (name.startsWith('DEDUCTIONS')) {
          inTaxableSection = false;
          inNonTaxableSection = false;
          inDeductionsSection = true;
          continue;
        }
        if (name.startsWith('Total ')) {
          inTaxableSection = false;
          inNonTaxableSection = false;
          inDeductionsSection = false;
          continue;
        }

        // Skip title rows
        if (code?.startsWith('TITLE')) continue;

        // Combine OTHERINC into "Other Income"
        if (code === 'OTHERINC') {
          otherIncomeTotal += amount;
          continue;
        }

        // Add to appropriate section
        if (inTaxableSection && amount !== 0) {
          taxable.push({ description: name, amount });
        } else if (inNonTaxableSection && amount !== 0) {
          nonTaxable.push({ description: name, amount });
        } else if (inDeductionsSection && amount !== 0) {
          deductions.push({ description: name, amount });
        }
      }
    }

    // Add combined Other Income to non-taxable
    if (otherIncomeTotal !== 0) {
      nonTaxable.push({ description: 'Other Income', amount: otherIncomeTotal });
    }

    const formattedData = {
      period,
      employee: {
        name: payslip.employee_id[1],
      },
      attendance: {
        items: attendanceItems,
        totalDays,
        totalHours,
        totalAmount,
      },
      salary: {
        taxable,
        nonTaxable,
        deductions,
      },
      netPay,
    };

    res.json({ success: true, data: formattedData });
  } catch (err) {
    next(err);
  }
}

export async function getEPILeaderboard(req: Request, res: Response, next: NextFunction) {
  try {
    // Get companyId from query params (optional, default 1)
    const companyIdParam = req.query.companyId as string | undefined;
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : 1;

    // Get all employees with EPI > 0
    const topEmployees = await getAllEmployeesWithEPI(companyId);

    res.json({ success: true, data: topEmployees });
  } catch (err) {
    next(err);
  }
}

function buildCheckedOutStatus() {
  return {
    checkedIn: false,
    roleType: null,
    companyName: null,
    branchName: null,
    checkInTimeUtc: null,
  };
}

interface LatestAttendanceWebhookEventRow {
  log_type: 'check_in' | 'check_out' | string;
  company_id: string;
  odoo_payload: unknown;
  branch_name: string | null;
  company_name: string | null;
}

interface ParsedAttendanceWebhookEvent {
  checkedIn: boolean;
  checkInTimeUtc: string | null;
  activeCompanyId: number | null;
  branchName: string | null;
  companyName: string | null;
}

function parseAttendancePayloadValue(
  value: unknown,
): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string') return null;

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function parseNumericCompanyId(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseLatestAttendanceWebhookEvent(
  row: LatestAttendanceWebhookEventRow,
): ParsedAttendanceWebhookEvent {
  const payload = parseAttendancePayloadValue(row.odoo_payload);
  const checkInRaw = typeof payload?.check_in === 'string' ? payload.check_in.trim() : '';
  const checkInTimeUtc = checkInRaw || null;
  const activeCompanyId = parseNumericCompanyId(payload?.x_company_id);

  return {
    checkedIn: row.log_type === 'check_in',
    checkInTimeUtc,
    activeCompanyId,
    branchName: row.branch_name,
    companyName: row.company_name,
  };
}

async function getLatestAttendanceWebhookEventForWebsiteUserKey(
  websiteUserKey: string,
): Promise<ParsedAttendanceWebhookEvent | null> {
  const row = await db.getDb()('shift_logs as sl')
    .leftJoin('branches as b', 'sl.branch_id', 'b.id')
    .leftJoin('companies as c', 'sl.company_id', 'c.id')
    .whereIn('sl.log_type', ['check_in', 'check_out'])
    .whereRaw(`sl.odoo_payload->>'x_website_key' = ?`, [websiteUserKey])
    .orderBy('sl.event_time', 'desc')
    .orderBy('sl.created_at', 'desc')
    .first('sl.log_type', 'sl.company_id', 'sl.odoo_payload', 'b.name as branch_name', 'c.name as company_name');

  if (!row) return null;
  return parseLatestAttendanceWebhookEvent(row as LatestAttendanceWebhookEventRow);
}

async function reconcileRoleDisableScopeFromActiveAttendance(input: {
  userId: string;
  activeCompanyId: number;
}): Promise<boolean> {
  const roleRows = await db.getDb()('user_roles as ur')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('ur.user_id', input.userId)
    .select('r.id as roleId', 'r.name as roleName') as Array<{ roleId: string; roleName: string }>;

  const roleByName = new Map<string, { roleId: string; roleName: string }>(
    roleRows.map((role) => [role.roleName, role]),
  );

  if (roleByName.has(SYSTEM_ROLES.ADMINISTRATOR)) {
    return false;
  }

  const activeRoleName = input.activeCompanyId === 1
    ? SYSTEM_ROLES.MANAGEMENT
    : SYSTEM_ROLES.SERVICE_CREW;
  const oppositeRoleName = activeRoleName === SYSTEM_ROLES.MANAGEMENT
    ? SYSTEM_ROLES.SERVICE_CREW
    : SYSTEM_ROLES.MANAGEMENT;

  const activeRole = roleByName.get(activeRoleName);
  const oppositeRole = roleByName.get(oppositeRoleName);
  if (!activeRole) {
    return false;
  }

  // Keep the active role enabled and disable the opposite role immediately.
  const enableCount = Number(await db.getDb()('user_role_disables')
    .where({ user_id: input.userId, role_id: activeRole.roleId })
    .delete());

  let disableChanged = 0;
  if (oppositeRole) {
    const insertResult = await db.getDb()('user_role_disables')
      .insert({
        user_id: input.userId,
        role_id: oppositeRole.roleId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict(['user_id', 'role_id'])
      .ignore();
    disableChanged = Array.isArray(insertResult) ? insertResult.length : Number(insertResult ?? 0);
  }

  return enableCount > 0 || disableChanged > 0;
}

export async function getCheckInStatus(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const user = await db.getDb()('users')
      .where({ id: userId })
      .first('user_key');

    const userKey = String(user?.user_key ?? '').trim();
    if (!userKey) {
      res.json({ success: true, data: buildCheckedOutStatus() });
      return;
    }

    const latestAttendanceEvent = await getLatestAttendanceWebhookEventForWebsiteUserKey(userKey);
    if (!latestAttendanceEvent || !latestAttendanceEvent.checkedIn) {
      const clearedCount = Number(await db.getDb()('user_role_disables')
        .where({ user_id: userId })
        .delete());
      if (clearedCount > 0) {
        try {
          getIO()
            .of('/user-events')
            .to(`user:${userId}`)
            .emit('user:auth-scope-updated', { userId });
        } catch {
          // Socket server may be unavailable during startup/tests.
        }
      }
      res.json({ success: true, data: buildCheckedOutStatus() });
      return;
    }

    if (latestAttendanceEvent.activeCompanyId !== null) {
      const roleScopeChanged = await reconcileRoleDisableScopeFromActiveAttendance({
        userId,
        activeCompanyId: latestAttendanceEvent.activeCompanyId,
      });
      if (roleScopeChanged) {
        try {
          getIO()
            .of('/user-events')
            .to(`user:${userId}`)
            .emit('user:auth-scope-updated', { userId });
        } catch {
          // Socket server may be unavailable during startup/tests.
        }
      }
    }

    res.json({
      success: true,
      data: {
        checkedIn: true,
        roleType: latestAttendanceEvent.activeCompanyId === null
          ? null
          : latestAttendanceEvent.activeCompanyId === 1
            ? 'Management'
            : 'Service Crew',
        companyName: latestAttendanceEvent.companyName ?? null,
        branchName: latestAttendanceEvent.branchName ?? null,
        checkInTimeUtc: latestAttendanceEvent.checkInTimeUtc,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getPayslipBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const branches = await db.getDb()('branches')
      .select('id', 'name', 'odoo_branch_id', 'is_active')
      .orderBy('name');

    res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
}

export async function getEpiDashboardData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const data = await getEpiDashboard(userId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getEpiLeaderboardData(req: Request, res: Response, next: NextFunction) {
  try {
    const currentUserId = req.user!.sub;
    const monthKey = parseMonthKey(req.query.monthKey as string | undefined);
    const data = await getEpiLeaderboard(currentUserId, monthKey);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getEpiLeaderboardDetailData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = String(req.params.userId);
    const monthKey = parseMonthKey(req.query.monthKey as string | undefined);
    const data = await getEpiLeaderboardDetail(userId, monthKey);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function getEmployeeMetricSnapshotsData(req: Request, res: Response, next: NextFunction) {
  try {
    const rangeStartYmd = parseRangeYmd(req.query.rangeStartYmd as string | undefined, 'rangeStartYmd');
    const rangeEndYmd = parseRangeYmd(req.query.rangeEndYmd as string | undefined, 'rangeEndYmd');
    const userId = (req.query.userId as string | undefined)?.trim() || null;

    const rows = await getEmployeeMetricDailySnapshots({
      rangeStartYmd,
      rangeEndYmd,
      userId,
    });

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
}

export async function getEmployeeMetricEventsData(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req.query.userId as string | undefined)?.trim();
    if (!userId) {
      throw new AppError(400, 'userId is required');
    }

    const metricId = parseMetricId(req.query.metricId as string | undefined);
    const rangeStartYmd = parseRangeYmd(req.query.rangeStartYmd as string | undefined, 'rangeStartYmd');
    const rangeEndYmd = parseRangeYmd(req.query.rangeEndYmd as string | undefined, 'rangeEndYmd');
    const page = parsePositiveInt(req.query.page as string | undefined, 1);
    const pageSize = parsePositiveInt(req.query.pageSize as string | undefined, 25);

    const result = await getEmployeeMetricEventRows({
      userId,
      metricId,
      rangeStartYmd,
      rangeEndYmd,
      page,
      pageSize,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// Payslip list + detail handlers (redesigned PayslipPage)
// ---------------------------------------------------------------------------

/**
 * Shared helper that transforms a raw Odoo payslip (with lines and worked_days)
 * into the PayslipDetailResponse shape consumed by the frontend.
 */
function transformPayslipToDetailResponse(
  payslip: {
    id: number;
    name: string;
    state: string;
    employee_id: [number, string];
    date_from: string;
    date_to: string;
    lines: Array<{
      id: number;
      name: string;
      code: string;
      category_id: [number, string];
      total: number;
      amount: number;
      quantity: number;
      rate: number;
      sequence: number;
    }>;
    worked_days: Array<{
      id: number;
      name: string;
      code: string;
      number_of_days: number;
      number_of_hours: number;
      amount: number;
    }>;
  },
  overrideStatus?: PayslipStatus,
): PayslipDetailResponse {
  /** Format a date string to "Mar 01, 2026" */
  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
  };

  const period = `${formatDate(payslip.date_from)} to ${formatDate(payslip.date_to)}`;

  // Attendance (worked_days)
  const attendanceItems: PayslipDetailResponse["attendance"]["items"] = [];
  let totalDays = 0;
  let totalHours = 0;
  let totalAmount = 0;

  for (const wd of payslip.worked_days) {
    const days = wd.number_of_days || 0;
    const hours = wd.number_of_hours || 0;
    const amount = wd.amount || 0;
    attendanceItems.push({ name: wd.name, days, hours, amount });
    totalDays += days;
    totalHours += hours;
    totalAmount += amount;
  }

  // Salary lines
  const taxable: PayslipDetailResponse["salary"]["taxable"] = [];
  const nonTaxable: PayslipDetailResponse["salary"]["nonTaxable"] = [];
  const deductions: PayslipDetailResponse["salary"]["deductions"] = [];

  let inTaxableSection = false;
  let inNonTaxableSection = false;
  let inDeductionsSection = false;
  let otherIncomeTotal = 0;
  let netPay = 0;

  for (const line of payslip.lines) {
    const name = line.name?.trim() || "";
    const amount = line.total || 0;
    const code = line.code;

    if (code === "NET") { netPay = amount; continue; }
    if (!name) continue;
    if (name.startsWith("TAXABLE SALARY")) { inTaxableSection = true; inNonTaxableSection = false; inDeductionsSection = false; continue; }
    if (name.startsWith("NON-TAXABLE SALARY")) { inTaxableSection = false; inNonTaxableSection = true; inDeductionsSection = false; continue; }
    if (name.startsWith("DEDUCTIONS")) { inTaxableSection = false; inNonTaxableSection = false; inDeductionsSection = true; continue; }
    if (name.startsWith("Total ")) { inTaxableSection = false; inNonTaxableSection = false; inDeductionsSection = false; continue; }
    if (code?.startsWith("TITLE")) continue;
    if (code === "OTHERINC") { otherIncomeTotal += amount; continue; }

    if (inTaxableSection && amount !== 0) { taxable.push({ description: name, amount }); }
    else if (inNonTaxableSection && amount !== 0) { nonTaxable.push({ description: name, amount }); }
    else if (inDeductionsSection && amount !== 0) { deductions.push({ description: name, amount }); }
  }

  if (otherIncomeTotal !== 0) {
    nonTaxable.push({ description: "Other Income", amount: otherIncomeTotal });
  }

  const resolvedStatus: PayslipStatus = overrideStatus ?? (
    payslip.state === "draft" ? "draft" : "completed"
  );

  return {
    period,
    employee: { name: payslip.employee_id[1] },
    attendance: { items: attendanceItems, totalDays, totalHours, totalAmount },
    salary: { taxable, nonTaxable, deductions },
    netPay,
    status: resolvedStatus,
    is_pending: resolvedStatus === "pending",
  };
}

/**
 * GET /dashboard/payslips
 * Returns all payslips for the authenticated user including pending stubs for
 * the current month's cutoff periods that have not yet been generated.
 */
export async function getPayslipList(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getDb();
    const userId = req.user!.sub;
    const currentUser = await masterDb("users").where({ id: userId }).select("user_key").first();
    const userKey = currentUser?.user_key as string | undefined;

    if (!userKey) {
      res.json({ success: true, data: { items: [] } });
      return;
    }

    const [realPayslips, employees] = await Promise.all([
      getAllPayslipsForUser(userKey, userId),
      getEmployeesForWebsiteUserKey(userKey, userId),
    ]);

    // Only include real Odoo payslips that have computed salary data.
    // Payslips that exist in Odoo but have net_pay = 0 are uncomputed shells
    // with nothing useful to show. Pending stubs are kept regardless — they
    // represent ungenerated periods and are expected to have no data yet.
    const payslipsWithData = realPayslips.filter((p) => p.net_pay > 0);

    // Pass the full realPayslips list to the stub calculator so it knows which
    // periods are already covered (including zero-pay ones), preventing
    // duplicate pending stubs for those periods.
    const pendingStubs = calculatePendingPayslipStubs(
      employees,
      realPayslips.map((p) => ({
        employee_id: p.employee_id,
        company_id: p.company_id,
        date_from: p.date_from,
        date_to: p.date_to,
      })),
    );

    // Pending stubs first (latest ungenerated period), then real payslips newest-first
    const items: PayslipListItem[] = [
      ...pendingStubs,
      ...payslipsWithData,
    ];

    res.json({ success: true, data: { items } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /dashboard/payslips/:id
 * Returns the full payslip detail for a given ID.
 * If the id begins with "pending-", resolves and generates a view-only slip.
 */
export async function getPayslipDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const masterDb = db.getDb();
    const userId = req.user!.sub;
    const payslipId = req.params.id as string;

    if (!payslipId) {
      throw new AppError(400, "id is required");
    }

    if (payslipId.startsWith("pending-")) {
      // Format: "pending-{companyId}-{cutoff}"
      const parts = payslipId.split("-");
      if (parts.length !== 3) {
        throw new AppError(400, "Invalid pending payslip id format");
      }

      const companyId = parseInt(parts[1], 10);
      const cutoff = parseInt(parts[2], 10) as 1 | 2;

      if (isNaN(companyId) || (cutoff !== 1 && cutoff !== 2)) {
        throw new AppError(400, "Invalid pending payslip id");
      }

      const currentUser = await masterDb("users").where({ id: userId }).select("user_key").first();
      const userKey = currentUser?.user_key as string | undefined;

      if (!userKey) {
        res.json({ success: true, data: null });
        return;
      }

      const employee = await getEmployeeByWebsiteUserKey(userKey, companyId);

      if (!employee) {
        res.json({ success: false, error: "Employee not found for this branch" });
        return;
      }

      let payslip;
      try {
        payslip = await getOrCreatePendingPayslipDetail(employee.id, companyId, employee.name, cutoff);
      } catch (createErr) {
        logger.error(`Failed to get/create pending payslip: ${createErr}`);
        res.json({ success: false, error: "Unable to generate payslip preview. The employee may not have an active contract." });
        return;
      }

      const detail = transformPayslipToDetailResponse(payslip, "pending");
      res.json({ success: true, data: detail });
      return;
    }

    // Real Odoo payslip
    const odooId = parseInt(payslipId, 10);
    if (isNaN(odooId)) {
      throw new AppError(400, "Invalid payslip id");
    }

    const payslip = await getPayslipDetailById(odooId);
    const detail = transformPayslipToDetailResponse(payslip);
    res.json({ success: true, data: detail });
  } catch (err) {
    next(err);
  }
}
