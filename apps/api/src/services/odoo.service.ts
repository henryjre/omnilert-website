import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { PayslipListItem } from '@omnilert/shared';

/**
 * Gets the current semi-month range (for Philippines timezone)
 * First half: 1st-15th, Second half: 16th-last day
 * @param cutoff - Optional: 1 for 1st cutoff (1st-15th), 2 for 2nd cutoff (16th-last day). If not provided, uses current date to determine.
 * @returns date_from and date_to in YYYY-MM-DD format
 */
export function getCurrentSemiMonthRange(
  cutoff?: number,
  baseDate: Date = new Date(),
): { date_from: string; date_to: string } {
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth() + 1;
  const day = baseDate.getDate();

  // Determine which cutoff to use
  let cutoffValue: number;
  if (cutoff === 1 || cutoff === 2) {
    cutoffValue = cutoff;
  } else {
    // Default: use current date to determine
    cutoffValue = day <= 15 ? 1 : 2;
  }

  let dateFrom: string;
  let dateTo: string;

  if (cutoffValue === 1) {
    // First half of the month (1st-15th)
    dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    dateTo = `${year}-${String(month).padStart(2, '0')}-15`;
  } else {
    // Second half of the month (16th-last day)
    dateFrom = `${year}-${String(month).padStart(2, '0')}-16`;
    // Last day of the month
    const lastDay = new Date(year, month, 0).getDate();
    dateTo = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;
  }

  return { date_from: dateFrom, date_to: dateTo };
}

/**
 * Search for employee by website user ID (x_website_key) and company_id
 * @param websiteUserKey - The website user ID
 * @param companyId - The Odoo company ID
 * @returns Employee record or null
 */
type OdooPartnerRow = { id: number };
type OdooEmployeeIdentityRow = {
  id: number;
  name?: string;
  pin?: string | null;
  company_id?: [number, string] | false;
  /** Many2many to res.partner.bank (replaces legacy single `bank_account_id` on some Odoo builds). */
  bank_account_ids?: number[] | Array<[number, string]> | false;
  work_contact_id?: [number, string] | false;
  x_website_key?: string | null;
};
type OdooKwCallFn = (
  model: string,
  method: string,
  args: unknown[],
  kwargs?: Record<string, unknown>,
) => Promise<unknown>;

/** First linked res.partner.bank id from hr.employee.bank_account_ids, if any. */
function firstPartnerBankIdFromEmployee(employee: OdooEmployeeIdentityRow): number | null {
  const raw = employee.bank_account_ids;
  if (raw === false || raw === undefined || !Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const first = raw[0];
  if (typeof first === 'number' && Number.isFinite(first) && first > 0) {
    return first;
  }
  if (Array.isArray(first)) {
    const id = Number(first[0]);
    if (Number.isFinite(id) && id > 0) {
      return id;
    }
  }
  return null;
}

type OdooM2MReplaceCommand = [6, 0, number[]];

/** Odoo m2m write: replace employee bank links with exactly this partner bank record. */
function hrEmployeeBankAccountIdsWritePayload(partnerBankId: number): {
  bank_account_ids: OdooM2MReplaceCommand[];
} {
  return { bank_account_ids: [[6, 0, [partnerBankId]]] };
}

async function resolveCanonicalPartnerByIdentity(input: {
  websiteUserKey?: string | null;
  email?: string | null;
}): Promise<OdooPartnerRow | null> {
  if (input.websiteUserKey) {
    const byKey = (await callOdooKw('res.partner', 'search_read', [], {
      domain: [
        ['x_website_key', '=', input.websiteUserKey],
        ['active', '=', true],
      ],
      fields: ['id'],
      order: 'id asc',
      limit: 1,
    })) as OdooPartnerRow[];
    if (byKey.length > 0) {
      return byKey[0];
    }
  }

  if (input.email) {
    const byEmail = (await callOdooKw('res.partner', 'search_read', [], {
      domain: [
        ['email', '=', input.email],
        ['active', '=', true],
      ],
      fields: ['id'],
      order: 'id asc',
      limit: 1,
    })) as OdooPartnerRow[];
    if (byEmail.length > 0) {
      return byEmail[0];
    }
  }

  return null;
}

async function listEmployeesLinkedToPartner(
  partnerId: number,
  companyId?: number,
): Promise<OdooEmployeeIdentityRow[]> {
  const domain: unknown[] = [['work_contact_id', '=', partnerId]];
  if (Number.isInteger(companyId)) {
    domain.push(['company_id', '=', companyId]);
  }

  return (await callOdooKw('hr.employee', 'search_read', [], {
    domain,
    fields: [
      'id',
      'name',
      'pin',
      'company_id',
      'bank_account_ids',
      'work_contact_id',
      'x_website_key',
    ],
    order: 'id asc',
    limit: 1000,
  })) as OdooEmployeeIdentityRow[];
}

async function listLegacyEmployeesByWebsiteKey(
  websiteUserKey: string,
  companyId?: number,
): Promise<OdooEmployeeIdentityRow[]> {
  const domain: unknown[] = [['x_website_key', '=', websiteUserKey]];
  if (Number.isInteger(companyId)) {
    domain.push(['company_id', '=', companyId]);
  }

  return (await callOdooKw('hr.employee', 'search_read', [], {
    domain,
    fields: [
      'id',
      'name',
      'pin',
      'company_id',
      'bank_account_ids',
      'work_contact_id',
      'x_website_key',
    ],
    order: 'id asc',
    limit: 1000,
  })) as OdooEmployeeIdentityRow[];
}

function dedupeEmployeeRows(rows: OdooEmployeeIdentityRow[]): OdooEmployeeIdentityRow[] {
  const seen = new Set<number>();
  const deduped: OdooEmployeeIdentityRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    deduped.push(row);
  }
  return deduped;
}

async function listEmployeesForIdentity(input: {
  websiteUserKey: string;
  email?: string | null;
  companyId?: number;
}): Promise<{ partnerId: number | null; employees: OdooEmployeeIdentityRow[] }> {
  const partner = await resolveCanonicalPartnerByIdentity({
    websiteUserKey: input.websiteUserKey,
    email: input.email ?? null,
  });

  const partnerEmployees = partner
    ? await listEmployeesLinkedToPartner(partner.id, input.companyId)
    : [];
  const legacyEmployees = await listLegacyEmployeesByWebsiteKey(
    input.websiteUserKey,
    input.companyId,
  );

  return {
    partnerId: partner?.id ?? null,
    employees: dedupeEmployeeRows([...partnerEmployees, ...legacyEmployees]),
  };
}

export async function getEmployeeIdentitySnapshot(input: {
  websiteUserKey: string;
  email?: string | null;
}): Promise<{ employeeCount: number; existingPin: string | null }> {
  const { employees } = await listEmployeesForIdentity({
    websiteUserKey: input.websiteUserKey,
    email: input.email ?? null,
  });

  const existingPin =
    employees
      .map((employee) => String(employee.pin ?? '').trim())
      .find((pin) => /^\d{4}$/.test(pin)) ?? null;

  return {
    employeeCount: employees.length,
    existingPin,
  };
}

export async function archiveEmployeesByWebsiteUserKey(
  input: { websiteUserKey: string },
  deps?: { callOdooKwFn?: OdooKwCallFn },
): Promise<{ matchedCount: number; archivedCount: number }> {
  const websiteUserKey = String(input.websiteUserKey ?? '').trim();
  if (!websiteUserKey) {
    return { matchedCount: 0, archivedCount: 0 };
  }

  const callFn = deps?.callOdooKwFn ?? callOdooKw;
  const rows = (await callFn('hr.employee', 'search_read', [], {
    domain: [['x_website_key', '=', websiteUserKey]],
    fields: ['id', 'active'],
    limit: 10000,
    context: { active_test: false },
  })) as Array<{ id?: number; active?: boolean | null }>;

  const activeById = new Map<number, boolean>();
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const isActive = row.active !== false;
    activeById.set(id, (activeById.get(id) ?? false) || isActive);
  }

  const matchedEmployeeIds = Array.from(activeById.keys());
  const employeeIdsToArchive = Array.from(activeById.entries())
    .filter(([, isActive]) => isActive)
    .map(([id]) => id);

  if (employeeIdsToArchive.length > 0) {
    await callFn('hr.employee', 'write', [employeeIdsToArchive, { active: false }]);
  }

  return {
    matchedCount: matchedEmployeeIds.length,
    archivedCount: employeeIdsToArchive.length,
  };
}

export async function unarchiveEmployeesByWebsiteUserKey(
  input: { websiteUserKey: string },
  deps?: { callOdooKwFn?: OdooKwCallFn },
): Promise<{ matchedCount: number; unarchivedCount: number }> {
  const websiteUserKey = String(input.websiteUserKey ?? '').trim();
  if (!websiteUserKey) {
    return { matchedCount: 0, unarchivedCount: 0 };
  }

  const callFn = deps?.callOdooKwFn ?? callOdooKw;
  const rows = (await callFn('hr.employee', 'search_read', [], {
    domain: [['x_website_key', '=', websiteUserKey]],
    fields: ['id', 'active'],
    limit: 10000,
    context: { active_test: false },
  })) as Array<{ id?: number; active?: boolean | null }>;

  const activeById = new Map<number, boolean>();
  for (const row of rows) {
    const id = Number(row.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    const isActive = row.active !== false;
    activeById.set(id, (activeById.get(id) ?? false) || isActive);
  }

  const matchedEmployeeIds = Array.from(activeById.keys());
  const employeeIdsToUnarchive = Array.from(activeById.entries())
    .filter(([, isActive]) => !isActive)
    .map(([id]) => id);

  if (employeeIdsToUnarchive.length > 0) {
    await callFn('hr.employee', 'write', [employeeIdsToUnarchive, { active: true }]);
  }

  return {
    matchedCount: matchedEmployeeIds.length,
    unarchivedCount: employeeIdsToUnarchive.length,
  };
}

export async function getEmployeeByWebsiteUserKey(
  websiteUserKey: string,
  companyId: number,
): Promise<{ id: number; name: string } | null> {
  try {
    const { employees } = await listEmployeesForIdentity({
      websiteUserKey,
      companyId,
    });
    const result = employees.slice(0, 1);

    if (!result || result.length === 0) {
      logger.warn(
        `No employee found for website user ID: ${websiteUserKey}, company: ${companyId}`,
      );
      return null;
    }

    return { id: result[0].id, name: result[0].name ?? '' };
  } catch (err) {
    logger.error(`Failed to get employee by website user ID ${websiteUserKey}: ${err}`);
    throw err;
  }
}

export async function listEmployeeIdsByWebsiteUserKey(
  websiteUserKey: string,
  companyId?: number,
): Promise<number[]> {
  try {
    const { employees } = await listEmployeesForIdentity({
      websiteUserKey,
      companyId,
    });

    return employees
      .map((employee) => Number(employee.id))
      .filter((employeeId) => Number.isFinite(employeeId) && employeeId > 0);
  } catch (err) {
    logger.error(`Failed to list employee IDs for website user ID ${websiteUserKey}: ${err}`);
    throw err;
  }
}

/**
 * Get employee payslip data for a specific semi-month period
 * @param employeeId - The Odoo employee ID
 * @param companyId - The Odoo company ID
 * @param cutoff - Optional: 1 for 1st cutoff, 2 for 2nd cutoff. Uses current date if not provided.
 * @returns Payslip with lines and worked_days, or null if not found
 */
export async function getEmployeePayslipData(
  employeeId: number,
  companyId: number,
  cutoff?: number,
  dateFrom?: string,
): Promise<any> {
  try {
    const { date_from, date_to } = getCurrentSemiMonthRange(
      cutoff,
      dateFrom ? new Date(dateFrom) : new Date(),
    );

    // Search for existing payslip
    const slips = (await callOdooKw('hr.payslip', 'search_read', [], {
      domain: [
        ['x_view_only', '=', true],
        ['date_from', '=', date_from],
        ['date_to', '=', date_to],
        ['employee_id', '=', employeeId],
        ['company_id', '=', companyId],
      ],
      fields: [
        'id',
        'name',
        'state',
        'employee_id',
        'date_from',
        'date_to',
        'x_view_only',
        'line_ids',
        'worked_days_line_ids',
      ],
      limit: 1,
    })) as Array<{
      id: number;
      name: string;
      state: string;
      employee_id: [number, string];
      date_from: string;
      date_to: string;
    }>;

    if (!slips || slips.length === 0) {
      return null;
    }

    // Sort by id descending and get the first one
    const slip = slips.sort((a, b) => b.id - a.id)[0];
    const slipId = slip.id;

    // Refresh from work entries
    await callOdooKw('hr.payslip', 'action_refresh_from_work_entries', [[slipId]]);

    // Compute the salary rule lines
    await callOdooKw('hr.payslip', 'compute_sheet', [[slipId]]);

    // Get payslip lines
    const lines = (await callOdooKw('hr.payslip.line', 'search_read', [], {
      domain: [['slip_id', '=', slipId]],
      fields: [
        'id',
        'name',
        'code',
        'category_id',
        'total',
        'amount',
        'quantity',
        'rate',
        'sequence',
      ],
      order: 'sequence asc, id asc',
      limit: 1000,
    })) as Array<{
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

    // Get worked days
    const workedDays = (await callOdooKw('hr.payslip.worked_days', 'search_read', [], {
      domain: [['payslip_id', '=', slipId]],
      fields: ['id', 'name', 'code', 'number_of_days', 'number_of_hours', 'amount'],
      order: 'id asc',
      limit: 1000,
    })) as Array<{
      id: number;
      name: string;
      code: string;
      number_of_days: number;
      number_of_hours: number;
      amount: number;
    }>;

    return {
      ...slip,
      lines,
      worked_days: workedDays,
    };
  } catch (err) {
    logger.error(`Failed to get employee payslip data: ${err}`);
    throw err;
  }
}

/**
 * Create a view-only payslip for an employee
 * @param employeeId - The Odoo employee ID
 * @param companyId - The Odoo company ID
 * @param employeeName - The employee name
 * @param cutoff - Optional: 1 for 1st cutoff, 2 for 2nd cutoff. Uses current date if not provided.
 * @returns Created payslip with lines and worked_days
 */
export async function createViewOnlyPayslip(
  employeeId: number,
  companyId: number,
  employeeName: string,
  cutoff?: number,
  dateFrom?: string,
): Promise<any> {
  try {
    const { date_from, date_to } = getCurrentSemiMonthRange(
      cutoff,
      dateFrom ? new Date(dateFrom) : new Date(),
    );

    // Create the payslip as off-cycle (no payslip_run_id)
    const slipId = (await callOdooKw('hr.payslip', 'create', [
      {
        employee_id: employeeId,
        date_from,
        date_to,
        x_view_only: true,
        name: `${employeeName} | View-Only Payslip`,
        company_id: companyId,
        payslip_run_id: false, // Off-cycle payslip
      },
    ])) as number;

    // Read the created slip
    const [slip] = (await callOdooKw('hr.payslip', 'read', [[slipId]], {
      fields: [
        'id',
        'name',
        'state',
        'employee_id',
        'date_from',
        'date_to',
        'x_view_only',
        'line_ids',
        'worked_days_line_ids',
      ],
    })) as Array<{
      id: number;
      name: string;
      state: string;
      employee_id: [number, string];
      date_from: string;
      date_to: string;
    }>;

    // Compute the sheet
    await callOdooKw('hr.payslip', 'compute_sheet', [[slipId]]);

    // Get payslip lines
    const lines = (await callOdooKw('hr.payslip.line', 'search_read', [], {
      domain: [['slip_id', '=', slipId]],
      fields: [
        'id',
        'name',
        'code',
        'category_id',
        'total',
        'amount',
        'quantity',
        'rate',
        'sequence',
      ],
      order: 'sequence asc, id asc',
      limit: 1000,
    })) as Array<{
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

    // Get worked days
    const workedDays = (await callOdooKw('hr.payslip.worked_days', 'search_read', [], {
      domain: [['payslip_id', '=', slipId]],
      fields: ['id', 'name', 'code', 'number_of_days', 'number_of_hours', 'amount'],
      order: 'id asc',
      limit: 1000,
    })) as Array<{
      id: number;
      name: string;
      code: string;
      number_of_days: number;
      number_of_hours: number;
      amount: number;
    }>;

    return {
      ...slip,
      lines,
      worked_days: workedDays,
    };
  } catch (err) {
    logger.error(`Failed to create view-only payslip: ${err}`);
    throw err;
  }
}

/**
 * Get Employee Performance Index (EPI) data
 * @param websiteUserKey - The website user ID (x_website_key)
 * @returns Employee EPI data or null if not found
 */
export async function getEmployeeEPIData(websiteUserKey: string): Promise<{
  id: number;
  employee_id: [number, string];
  x_epi: number;
  x_average_scsa: number;
  x_average_sqaa: number;
  x_audit_ratings: Array<{ id: number; rating: number }>;
} | null> {
  try {
    const result = (await callOdooKw('hr.employee', 'search_read', [], {
      domain: [
        ['x_website_key', '=', websiteUserKey],
        ['company_id', '=', 1], // Famous Belgian Waffle
      ],
      fields: ['id', 'employee_id', 'x_epi', 'x_average_scsa', 'x_average_sqaa', 'x_audit_ratings'],
      limit: 1,
    })) as Array<{
      id: number;
      employee_id: [number, string];
      x_epi: number;
      x_average_scsa: number;
      x_average_sqaa: number;
      x_audit_ratings: Array<{ id: number; rating: number }>;
    }>;

    if (!result || result.length === 0) {
      logger.warn(`No employee found for website user ID: ${websiteUserKey}`);
      return null;
    }

    return result[0];
  } catch (err) {
    logger.error(`Failed to get employee EPI data for website user ID ${websiteUserKey}: ${err}`);
    throw err;
  }
}

/**
 * Get all employees with EPI > 0 (for leaderboard)
 * @param companyId - The Odoo company ID (default 1 for Famous Belgian Waffle)
 * @returns Array of employees with their EPI data, sorted by x_epi descending
 */
export async function getAllEmployeesWithEPI(companyId: number = 1): Promise<
  Array<{
    id: number;
    employee_id: [number, string];
    x_epi: number;
    x_average_scsa: number;
    x_average_sqaa: number;
  }>
> {
  try {
    const result = (await callOdooKw('hr.employee', 'search_read', [], {
      domain: [
        ['company_id', '=', companyId],
        ['x_epi', '!=', 0],
      ],
      fields: ['id', 'employee_id', 'x_epi', 'x_average_scsa', 'x_average_sqaa'],
      order: 'x_epi desc',
      limit: 5,
    })) as Array<{
      id: number;
      employee_id: [number, string];
      x_epi: number;
      x_average_scsa: number;
      x_average_sqaa: number;
    }>;

    return result || [];
  } catch (err) {
    logger.error(`Failed to get all employees with EPI: ${err}`);
    throw err;
  }
}

/**
 * Get Employee Audit Ratings with pagination
 * @param websiteUserKey - The website user ID (x_website_key as UUID string)
 * @param page - Page number (default 1)
 * @param limit - Items per page (default 5)
 * @returns Paginated audit ratings with metadata
 */
export async function getEmployeeAuditRatings(
  websiteUserKey: string,
  page: number = 1,
  limit: number = 5,
): Promise<{
  items: Array<{
    id: number;
    x_audit_date: string;
    x_audit_code: string;
    x_name: string;
    x_rating: number;
    x_employee_id: [number, string];
  }>;
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}> {
  try {
    const offset = (page - 1) * limit;

    // Search for audit ratings by x_website_key
    const result = (await callOdooKw('x_audit_ratings', 'search_read', [], {
      domain: [['x_website_key', '=', websiteUserKey]],
      fields: ['id', 'x_audit_date', 'x_audit_code', 'x_name', 'x_rating', 'x_employee_id'],
      order: 'x_audit_date desc',
      offset,
      limit,
    })) as Array<{
      id: number;
      x_audit_date: string;
      x_audit_code: string;
      x_name: string;
      x_rating: number;
      x_employee_id: [number, string];
    }>;

    // Get total count
    const countResult = (await callOdooKw('x_audit_ratings', 'search_count', [], {
      domain: [['x_website_key', '=', websiteUserKey]],
    })) as number;

    const total = countResult;
    const totalPages = Math.ceil(total / limit);

    return {
      items: result || [],
      pagination: { total, page, limit, totalPages },
    };
  } catch (err) {
    logger.error(`Failed to get employee audit ratings: ${err}`);
    throw err;
  }
}

/**
 * Converts a Date to Odoo datetime format (YYYY-MM-DD HH:MM:SS)
 * @param date - The date to convert
 * @returns Odoo formatted datetime string in UTC timezone
 */
export function toOdooDatetime(date: Date): string {
  // Use UTC timezone as Odoo uses UTC
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  // Format: 2026-02-17 11:00:00
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;
  const second = parts.find((p) => p.type === 'second')?.value;

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Parses a timestamp string as UTC
 * @param timestamp - The timestamp string (e.g., "2026-02-17 11:30:00" or ISO string)
 * @returns Date object
 */
export function parseUtcTimestamp(timestamp: string | Date): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  // If it's already in format "YYYY-MM-DD HH:MM:SS", append UTC indicator
  // This ensures it's parsed as UTC
  const trimmed = timestamp.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed + 'Z');
  }
  return new Date(timestamp);
}

type JsonRpcPayload = Record<string, unknown>;
type JsonRpcSuccess = {
  error?: { message: string; data?: { message: string; debug?: string } };
  result?: unknown;
};
type OdooFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<JsonRpcSuccess>;
};
type OdooFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
) => Promise<OdooFetchResponse>;
type OdooRpcLogger = Pick<typeof logger, 'warn' | 'error'>;
type OdooRpcClientOptions = {
  fetchImpl?: OdooFetch;
  sleep?: (ms: number) => Promise<void>;
  logger?: OdooRpcLogger;
  odooUrl?: string;
  maxConcurrentRequests?: number;
  max429Retries?: number;
  baseRetryDelayMs?: number;
};

const DEFAULT_ODOO_RPC_MAX_CONCURRENT_REQUESTS = 2;
const DEFAULT_ODOO_RPC_MAX_429_RETRIES = 2;
const DEFAULT_ODOO_RPC_BASE_RETRY_DELAY_MS = 1000;

class OdooHttpError extends Error {
  status: number;
  statusText: string;
  retryAfterMs: number | null;

  constructor(status: number, statusText: string, retryAfterMs: number | null = null) {
    super(`Odoo JSON RPC HTTP error: ${status} ${statusText}`);
    this.name = 'OdooHttpError';
    this.status = status;
    this.statusText = statusText;
    this.retryAfterMs = retryAfterMs;
  }
}

function normalizeOdooUrl(odooUrl: string): string {
  if (odooUrl.startsWith('http://') || odooUrl.startsWith('https://')) {
    return odooUrl;
  }

  return `https://${odooUrl}`;
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const numericSeconds = Number(value);
  if (Number.isFinite(numericSeconds) && numericSeconds >= 0) {
    return numericSeconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isNaN(dateMs)) {
    return null;
  }

  return Math.max(0, dateMs - Date.now());
}

function compute429RetryDelayMs(
  attemptIndex: number,
  error: OdooHttpError,
  baseRetryDelayMs: number,
): number {
  if (error.retryAfterMs !== null) {
    return error.retryAfterMs;
  }

  return baseRetryDelayMs * 2 ** attemptIndex;
}

function isRateLimitError(error: unknown): error is OdooHttpError {
  return error instanceof OdooHttpError && error.status === 429;
}

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function createOdooRpcClient(options: OdooRpcClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as OdooFetch);
  const sleep = options.sleep ?? defaultSleep;
  const odooUrl = normalizeOdooUrl(options.odooUrl ?? env.ODOO_URL);
  const rpcLogger = options.logger ?? logger;
  const maxConcurrentRequests = Math.max(
    1,
    Number(options.maxConcurrentRequests ?? DEFAULT_ODOO_RPC_MAX_CONCURRENT_REQUESTS),
  );
  const max429Retries = Math.max(
    0,
    Number(options.max429Retries ?? DEFAULT_ODOO_RPC_MAX_429_RETRIES),
  );
  const baseRetryDelayMs = Math.max(
    1,
    Number(options.baseRetryDelayMs ?? DEFAULT_ODOO_RPC_BASE_RETRY_DELAY_MS),
  );

  let activeRequests = 0;
  const queuedResolvers: Array<() => void> = [];

  async function acquireRequestSlot(): Promise<void> {
    if (activeRequests < maxConcurrentRequests) {
      activeRequests += 1;
      return;
    }

    await new Promise<void>((resolve) => {
      queuedResolvers.push(resolve);
    });
    activeRequests += 1;
  }

  function releaseRequestSlot(): void {
    activeRequests = Math.max(0, activeRequests - 1);
    const next = queuedResolvers.shift();
    if (next) {
      next();
    }
  }

  async function jsonRpc(method: string, payload: JsonRpcPayload): Promise<unknown> {
    const url = `${odooUrl}/jsonrpc`;
    await acquireRequestSlot();

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method,
          params: payload,
          id: Math.floor(Math.random() * 1000000),
        }),
      });

      if (!response.ok) {
        throw new OdooHttpError(
          response.status,
          response.statusText,
          parseRetryAfterMs(response.headers.get('retry-after')),
        );
      }

      const data = await response.json();
      if (data.error) {
        const odooError = data.error;
        const detailedMessage = odooError.data?.message || odooError.message;
        throw new Error(`Odoo JSON RPC error: ${detailedMessage}`);
      }

      return data;
    } catch (err) {
      if (isRateLimitError(err)) {
        rpcLogger.warn(`JSON RPC call hit Odoo rate limit: ${err.message}`);
      } else {
        rpcLogger.error(`JSON RPC call failed: ${err}`);
      }
      throw err;
    } finally {
      releaseRequestSlot();
    }
  }

  return {
    jsonRpc,
    async callOdooKw(
      model: string,
      method: string,
      args: unknown[] = [],
      kwargs: Record<string, unknown> = {},
    ): Promise<unknown> {
      const payload = {
        service: 'object',
        method: 'execute_kw',
        args: [env.ODOO_DB, 2, env.ODOO_PASSWORD, model, method, args, kwargs],
      };

      for (let attempt = 0; attempt <= max429Retries; attempt += 1) {
        try {
          const response = await jsonRpc('call', payload);
          return (response as { result?: unknown }).result ?? null;
        } catch (err) {
          if (isRateLimitError(err) && attempt < max429Retries) {
            const delayMs = compute429RetryDelayMs(attempt, err, baseRetryDelayMs);
            rpcLogger.warn(
              `Retrying Odoo execute_kw for model "${model}", method "${method}" after 429 in ${delayMs}ms`,
            );
            await sleep(delayMs);
            continue;
          }

          rpcLogger.error(
            `Error calling Odoo execute_kw for model "${model}", method "${method}": ${err}`,
          );
          throw err;
        }
      }

      return null;
    },
  };
}

/**
 * Makes a JSON RPC call to Odoo
 * @param method - The RPC method to call (e.g., 'call')
 * @param payload - The payload for the RPC call
 * @returns The result from Odoo
 */
async function jsonRpc(method: string, payload: Record<string, unknown>): Promise<unknown> {
  return defaultOdooRpcClient.jsonRpc(method, payload);
}

const defaultOdooRpcClient = createOdooRpcClient();

/**
 * Calls an Odoo model method using execute_kw
 * @param model - The Odoo model name (e.g., 'hr.attendance')
 * @param method - The method to call on the model (e.g., 'search_read', 'write')
 * @param args - Positional arguments for the method
 * @param kwargs - Keyword arguments for the method
 * @returns The result from Odoo
 */
export async function callOdooKw(
  model: string,
  method: string,
  args: unknown[] = [],
  kwargs: Record<string, unknown> = {},
): Promise<unknown> {
  return defaultOdooRpcClient.callOdooKw(model, method, args, kwargs);
}

/**
 * Updates the check_in time for an Odoo attendance record
 * @param attendanceId - The Odoo attendance ID
 * @param checkInTime - The new check_in time (Date object or timestamp string)
 * @returns True if successful
 */
export async function updateAttendanceCheckIn(
  attendanceId: number,
  checkInTime: string | Date,
): Promise<boolean> {
  try {
    const parsedDate = parseUtcTimestamp(checkInTime);
    const odooDatetime = toOdooDatetime(parsedDate);

    // Odoo 18 expects vals as part of args, not kwargs
    const result = await callOdooKw(
      'hr.attendance',
      'write',
      [[attendanceId], { check_in: odooDatetime }], // Pass vals in args
    );
    logger.info(`Updated Odoo attendance ${attendanceId} check_in to ${odooDatetime}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update check_in for attendance ${attendanceId}: ${err}`);
    throw err;
  }
}

/**
 * Updates the check_out time for an Odoo attendance record
 * @param attendanceId - The Odoo attendance ID
 * @param checkOutTime - The new check_out time (Date object or timestamp string)
 * @returns True if successful
 */
export async function updateAttendanceCheckOut(
  attendanceId: number,
  checkOutTime: string | Date,
): Promise<boolean> {
  try {
    const parsedDate = parseUtcTimestamp(checkOutTime);
    const odooDatetime = toOdooDatetime(parsedDate);

    // Odoo 18 expects vals as part of args, not kwargs
    const result = await callOdooKw(
      'hr.attendance',
      'write',
      [[attendanceId], { check_out: odooDatetime }], // Pass vals in args
    );
    logger.info(`Updated Odoo attendance ${attendanceId} check_out to ${odooDatetime}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update check_out for attendance ${attendanceId}: ${err}`);
    throw err;
  }
}

/**
 * Deletes an Odoo attendance record.
 * @param attendanceId - The Odoo attendance ID
 * @returns True if successful
 */
export async function deleteAttendanceById(attendanceId: number): Promise<boolean> {
  try {
    const result = await callOdooKw('hr.attendance', 'unlink', [[attendanceId]]);
    logger.info(`Deleted Odoo attendance ${attendanceId}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to delete Odoo attendance ${attendanceId}: ${err}`);
    throw err;
  }
}

/**
 * Deletes an Odoo planning slot.
 * @param planningSlotId - The Odoo planning.slot ID
 * @returns True if successful
 */
export async function deletePlanningSlotById(planningSlotId: number): Promise<boolean> {
  try {
    const result = await callOdooKw('planning.slot', 'unlink', [[planningSlotId]]);
    logger.info(`Deleted Odoo planning.slot ${planningSlotId}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to delete Odoo planning.slot ${planningSlotId}: ${err}`);
    throw err;
  }
}

/**
 * Updates the opening PCF for a POS session
 * @param posSessionName - The POS session name (e.g., "POS/01858")
 * @param openingPcf - The opening PCF amount
 * @returns True if successful
 */
export async function updatePosSessionOpeningPcf(
  posSessionName: string,
  openingPcf: number,
): Promise<boolean> {
  try {
    // First, search for the POS session by x_pos_name
    const searchResult = (await callOdooKw('pos.session', 'search_read', [], {
      domain: [['x_pos_name', '=', posSessionName]],
      fields: ['id', 'x_pos_name', 'x_opening_pcf'],
      limit: 1,
    })) as Array<{ id: number; x_pos_name: string; x_opening_pcf: number }>;

    if (!searchResult || searchResult.length === 0) {
      logger.warn(`POS session not found: ${posSessionName}`);
      return false;
    }

    const sessionId = searchResult[0].id;

    // Update the opening_pcf field
    const result = await callOdooKw('pos.session', 'write', [
      [sessionId],
      { x_opening_pcf: openingPcf },
    ]);

    logger.info(`Updated POS session ${posSessionName} opening_pcf to ${openingPcf}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update opening_pcf for POS session ${posSessionName}: ${err}`);
    throw err;
  }
}

/**
 * Updates the closing PCF for a POS session
 * @param companyId - The Odoo company ID
 * @param closingPcf - The closing PCF amount
 * @returns True if successful
 */
export async function updatePosSessionClosingPcf(
  companyId: number,
  closingPcf: number,
): Promise<boolean> {
  try {
    // Search for the POS session with state='opening_control' and company_id
    const searchResult = (await callOdooKw('pos.session', 'search_read', [], {
      domain: [
        ['state', '=', 'opening_control'],
        ['company_id', '=', companyId],
      ],
      fields: ['id', 'name', 'state', 'company_id', 'x_closing_pcf'],
      limit: 1,
    })) as Array<{
      id: number;
      name: string;
      state: string;
      company_id: number;
      x_closing_pcf: number;
    }>;

    if (!searchResult || searchResult.length === 0) {
      logger.warn(`POS session not found for company ${companyId} with state opening_control`);
      return false;
    }

    const sessionId = searchResult[0].id;
    const sessionName = searchResult[0].name;

    // Update the closing_pcf field
    const result = await callOdooKw('pos.session', 'write', [
      [sessionId],
      { x_closing_pcf: closingPcf },
    ]);

    logger.info(
      `Updated POS session ${sessionName} (ID: ${sessionId}) closing_pcf to ${closingPcf}`,
    );
    return result === true;
  } catch (err) {
    logger.error(`Failed to update closing_pcf for company ${companyId}: ${err}`);
    throw err;
  }
}

/**
 * Finds the first hr.work.entry for an employee on a given date with a specific work_entry_type_id.
 */
export async function findWorkEntryByEmployeeAndDate(
  employeeId: number,
  date: string,
  workEntryTypeId: number,
): Promise<{ id: number; duration: number } | null> {
  const results = (await callOdooKw('hr.work.entry', 'search_read', [], {
    domain: [
      ['employee_id', '=', employeeId],
      ['date', '=', date],
      ['work_entry_type_id', '=', workEntryTypeId],
    ],
    fields: ['id', 'duration'],
    order: 'id asc',
    limit: 1,
  })) as Array<{ id: number; duration: number }>;

  return results.length > 0 ? results[0] : null;
}

/**
 * Deducts a given number of minutes from an hr.work.entry duration field.
 * Duration in Odoo is stored in hours (float).
 */
export async function deductWorkEntryDuration(
  workEntryId: number,
  currentDurationHours: number,
  deductMinutes: number,
): Promise<boolean> {
  const deductHours = deductMinutes / 60;
  const newDuration = Math.max(0, currentDurationHours - deductHours);

  const result = await callOdooKw('hr.work.entry', 'write', [
    [workEntryId],
    { duration: newDuration },
  ]);
  logger.info(
    `Deducted ${deductMinutes}min (${deductHours}h) from work entry ${workEntryId}. New duration: ${newDuration}h`,
  );
  return result === true;
}

/**
 * Creates an hr.work.entry for overtime approval.
 */
export async function createOvertimeWorkEntry(params: {
  employeeId: number;
  date: string;
  workEntryTypeId: number;
  durationMinutes: number;
  description: string;
}): Promise<number> {
  const durationHours = params.durationMinutes / 60;

  const newId = (await callOdooKw('hr.work.entry', 'create', [
    {
      employee_id: params.employeeId,
      date: params.date,
      work_entry_type_id: params.workEntryTypeId,
      duration: durationHours,
      name: params.description,
    },
  ])) as number;

  logger.info(
    `Created overtime work entry ${newId} for employee ${params.employeeId} on ${params.date}. Type: ${params.workEntryTypeId}, Duration: ${durationHours}h`,
  );
  return newId;
}

const BREAK_WORK_ENTRY_TYPE_ID = 129;
const BREAK_WORK_ENTRY_DESCRIPTION = 'Break - Synced from Omnilert';

export async function upsertBreakWorkEntry(
  params: {
    employeeId: number;
    date: string;
    durationMinutes: number;
  },
  deps?: { callOdooKwFn?: OdooKwCallFn },
): Promise<{ id: number; action: 'created' | 'updated'; durationHours: number } | null> {
  if (!Number.isFinite(params.durationMinutes) || params.durationMinutes <= 0) {
    return null;
  }

  const callFn = deps?.callOdooKwFn ?? callOdooKw;
  const durationHours = params.durationMinutes / 60;
  const existingEntries = (await callFn('hr.work.entry', 'search_read', [], {
    domain: [
      ['employee_id', '=', params.employeeId],
      ['date', '=', params.date],
      ['work_entry_type_id', '=', BREAK_WORK_ENTRY_TYPE_ID],
    ],
    fields: ['id', 'duration'],
    order: 'id asc',
    limit: 1,
  })) as Array<{ id: number; duration: number }>;

  if (existingEntries.length > 0) {
    const existingEntry = existingEntries[0];
    const newDurationHours = Number(existingEntry.duration || 0) + durationHours;

    await callFn('hr.work.entry', 'write', [
      [existingEntry.id],
      { duration: newDurationHours, name: BREAK_WORK_ENTRY_DESCRIPTION },
    ]);

    logger.info(
      {
        entryId: existingEntry.id,
        employeeId: params.employeeId,
        date: params.date,
        addedDurationHours: durationHours,
        totalDurationHours: newDurationHours,
        workEntryTypeId: BREAK_WORK_ENTRY_TYPE_ID,
      },
      'Updated Odoo break work entry from Omnilert break duration',
    );

    return { id: existingEntry.id, action: 'updated', durationHours: newDurationHours };
  }

  const createdEntryId = (await callFn('hr.work.entry', 'create', [
    {
      employee_id: params.employeeId,
      date: params.date,
      work_entry_type_id: BREAK_WORK_ENTRY_TYPE_ID,
      duration: durationHours,
      name: BREAK_WORK_ENTRY_DESCRIPTION,
    },
  ])) as number;

  logger.info(
    {
      entryId: createdEntryId,
      employeeId: params.employeeId,
      date: params.date,
      durationHours,
      workEntryTypeId: BREAK_WORK_ENTRY_TYPE_ID,
    },
    'Created Odoo break work entry from Omnilert break duration',
  );

  return { id: createdEntryId, action: 'created', durationHours };
}

export async function searchWorkEntriesByEmployeeAndDate(
  employeeId: number,
  date: string,
): Promise<unknown> {
  return await callOdooKw('hr.work.entry', 'search_read', [], {
    domain: [
      ['employee_id', '=', employeeId],
      ['date_start', '>=', `${date} 00:00:00`],
      ['date_start', '<=', `${date} 23:59:59`],
    ],
    fields: ['id', 'employee_id', 'date_start', 'date_stop', 'state'],
    order: 'date_start desc',
    limit: 5,
  });
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, 300 * (i + 1)));
      }
    }
  }
  throw lastError;
}

export function formatBranchEmployeeCode(odooBranchId: number, employeeNumber: number): string {
  const segment = String(employeeNumber).padStart(3, '0');
  return `${odooBranchId - 1}${segment}`;
}

export function formatEmployeeDisplayName(
  odooBranchId: number,
  employeeNumber: number,
  firstName: string,
  lastName: string,
): string {
  const fullName = `${firstName} ${lastName}`.trim();
  return `${formatBranchEmployeeCode(odooBranchId, employeeNumber)} - ${fullName}`;
}

function isResPartnerReadAccessError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();
  return (
    normalized.includes('res.partner') &&
    normalized.includes('read') &&
    normalized.includes('access')
  );
}

export async function createOrUpdateEmployeeForRegistration(input: {
  companyId: number;
  name: string;
  workEmail: string;
  pin: string;
  barcode: string;
  websiteKey: string;
  isResident: boolean;
}): Promise<number> {
  logger.info(
    {
      phase: 'registration-approve',
      companyId: input.companyId,
      barcode: input.barcode,
      websiteKey: input.websiteKey,
      email: input.workEmail,
      name: input.name,
    },
    'Preparing Odoo employee upsert',
  );
  const partner = await resolveCanonicalPartnerByIdentity({
    websiteUserKey: input.websiteKey,
    email: input.workEmail,
  });

  let existing = partner ? await listEmployeesLinkedToPartner(partner.id, input.companyId) : [];
  if (existing.length === 0) {
    existing = await listLegacyEmployeesByWebsiteKey(input.websiteKey, input.companyId);
  }

  const payload: Record<string, unknown> = {
    name: input.name,
    work_email: input.workEmail,
    pin: input.pin,
    barcode: input.barcode,
    x_website_key: input.websiteKey,
    company_id: input.companyId,
    category_ids: [[4, input.isResident ? 2 : 1]],
  };
  if (partner) {
    payload.work_contact_id = partner.id;
  }

  if (existing.length > 0) {
    logger.info(
      {
        phase: 'registration-approve',
        employeeId: existing[0].id,
        companyId: input.companyId,
        barcode: input.barcode,
        partnerId: partner?.id ?? null,
      },
      'Updating existing Odoo employee',
    );
    try {
      await withRetry(() =>
        callOdooKw('hr.employee', 'write', [[existing[0].id], payload]).then(() => undefined),
      );
    } catch (error) {
      if (!partner || !isResPartnerReadAccessError(error)) {
        throw error;
      }

      const fallbackPayload = { ...payload };
      delete fallbackPayload.work_contact_id;
      logger.warn(
        {
          phase: 'registration-approve',
          employeeId: existing[0].id,
          companyId: input.companyId,
          barcode: input.barcode,
          websiteKey: input.websiteKey,
          partnerId: partner.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Retrying employee update without work_contact_id due res.partner access restriction',
      );
      await withRetry(() =>
        callOdooKw('hr.employee', 'write', [[existing[0].id], fallbackPayload]).then(
          () => undefined,
        ),
      );
    }
    return existing[0].id;
  }

  logger.info(
    {
      phase: 'registration-approve',
      companyId: input.companyId,
      barcode: input.barcode,
      partnerId: partner?.id ?? null,
    },
    'Creating new Odoo employee',
  );
  let employeeId: number;
  try {
    employeeId = (await withRetry(
      () => callOdooKw('hr.employee', 'create', [payload]) as Promise<number>,
    )) as number;
  } catch (error) {
    if (!partner || !isResPartnerReadAccessError(error)) {
      throw error;
    }

    const fallbackPayload = { ...payload };
    delete fallbackPayload.work_contact_id;
    logger.warn(
      {
        phase: 'registration-approve',
        companyId: input.companyId,
        barcode: input.barcode,
        websiteKey: input.websiteKey,
        partnerId: partner.id,
        error: error instanceof Error ? error.message : String(error),
      },
      'Retrying employee create without work_contact_id due res.partner access restriction',
    );
    employeeId = (await withRetry(
      () => callOdooKw('hr.employee', 'create', [fallbackPayload]) as Promise<number>,
    )) as number;
  }
  return employeeId;
}

async function mergePartnerChunk(chunkIds: number[], destinationPartnerId: number): Promise<void> {
  try {
    const wizardId = (await callOdooKw('base.partner.merge.automatic.wizard', 'create', [
      {
        partner_ids: [[6, 0, chunkIds]],
        dst_partner_id: destinationPartnerId,
      },
    ])) as number;
    await callOdooKw('base.partner.merge.automatic.wizard', 'action_merge', [[wizardId]]);
  } catch (error) {
    logger.error(`Failed to merge partner chunk (${chunkIds.join(',')}): ${error}`);
    throw error;
  }
}

export async function unifyPartnerContactsByEmail(input: {
  email: string;
  mainCompanyId: number;
  websiteKey: string;
  employeeNumber: number;
  firstName: string;
  lastName: string;
}): Promise<number | null> {
  const contacts = (await callOdooKw('res.partner', 'search_read', [], {
    domain: [
      ['email', '=', input.email],
      ['active', '=', true],
    ],
    fields: ['id', 'company_id', 'active'],
    order: 'id asc',
    limit: 200,
  })) as Array<{ id: number; company_id?: [number, string] | false; active?: boolean }>;

  if (!contacts.length) {
    return null;
  }

  const mainCompanyContact = contacts.find(
    (contact) => Array.isArray(contact.company_id) && contact.company_id[0] === input.mainCompanyId,
  );
  let canonicalId = mainCompanyContact?.id ?? contacts[0].id;
  const otherIds = contacts
    .filter((contact) => contact.id !== canonicalId)
    .map((contact) => contact.id);

  while (otherIds.length > 0) {
    const chunk = otherIds.splice(0, 2);
    await withRetry(() => mergePartnerChunk([canonicalId, ...chunk], canonicalId));
  }

  const canonicalLookup = (await callOdooKw('res.partner', 'search_read', [], {
    domain: [['id', '=', canonicalId]],
    fields: ['id'],
    limit: 1,
  })) as Array<{ id: number }>;
  if (canonicalLookup.length === 0) {
    const refreshed = (await callOdooKw('res.partner', 'search_read', [], {
      domain: [
        ['email', '=', input.email],
        ['active', '=', true],
      ],
      fields: ['id', 'company_id'],
      order: 'id asc',
      limit: 1,
    })) as Array<{ id: number }>;
    if (refreshed.length > 0) {
      canonicalId = refreshed[0].id;
    }
  }

  await callOdooKw('res.partner', 'write', [
    [canonicalId],
    {
      company_id: false,
      x_website_key: input.websiteKey,
      name: formatEmployeeDisplayName(
        input.mainCompanyId,
        input.employeeNumber,
        input.firstName,
        input.lastName,
      ),
      category_id: [[4, 3]],
    },
  ]);
  return canonicalId;
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  return buffer.toString('base64');
}

export async function getPartnerAvatarBase64ByIdentity(input: {
  websiteUserKey: string | null;
  email: string | null;
}): Promise<string | null> {
  try {
    const partner = await resolveCanonicalPartnerByIdentity({
      websiteUserKey: input.websiteUserKey,
      email: input.email,
    });

    if (!partner) {
      return null;
    }

    const rows = (await callOdooKw('res.partner', 'read', [[partner.id]], {
      fields: ['id', 'image_1920'],
    })) as Array<{ id: number; image_1920?: string | false | null }>;

    if (!rows || rows.length === 0) {
      return null;
    }

    const imageBase64 = String(rows[0].image_1920 ?? '').trim();
    return imageBase64 || null;
  } catch (err) {
    logger.warn(
      {
        step: 'avatar_import_from_partner',
        websiteUserKey: input.websiteUserKey,
        email: input.email,
        error: err instanceof Error ? err.message : String(err),
      },
      'Failed to read partner avatar from Odoo; continuing',
    );
    return null;
  }
}

export async function syncAvatarToOdoo(input: {
  websiteUserKey: string | null;
  email: string | null;
  avatarUrl: string;
}): Promise<boolean> {
  try {
    const avatarBase64 = await fetchImageAsBase64(input.avatarUrl);
    let partnerSearchResult: Array<{ id: number }> = [];

    if (input.websiteUserKey) {
      partnerSearchResult = (await callOdooKw('res.partner', 'search_read', [], {
        domain: [['x_website_key', '=', input.websiteUserKey]],
        fields: ['id'],
        limit: 1,
      })) as Array<{ id: number }>;
    }

    if (partnerSearchResult.length === 0 && input.email) {
      partnerSearchResult = (await callOdooKw('res.partner', 'search_read', [], {
        domain: [['email', '=', input.email]],
        fields: ['id'],
        limit: 1,
      })) as Array<{ id: number }>;
    }

    if (partnerSearchResult.length === 0) {
      logger.warn(
        `No res.partner found for avatar sync (key=${input.websiteUserKey}, email=${input.email})`,
      );
      return false;
    }

    const partnerId = partnerSearchResult[0].id;
    await callOdooKw('res.partner', 'write', [[partnerId], { image_1920: avatarBase64 }]);

    const employeeRows = (await callOdooKw('hr.employee', 'search_read', [], {
      domain: [['work_contact_id', '=', partnerId]],
      fields: ['id'],
      limit: 1000,
    })) as Array<{ id: number }>;

    if (employeeRows.length > 0) {
      await callOdooKw('hr.employee', 'write', [
        employeeRows.map((row) => row.id),
        { image_1920: avatarBase64 },
      ]);
    }

    return true;
  } catch (err) {
    logger.error(`Failed to sync avatar to Odoo: ${err}`);
    throw err;
  }
}

/**
 * Syncs user profile details to Odoo
 * 1. Finds res.partner by x_website_key (or by email as fallback)
 * 2. Updates partner's email
 * 3. Finds all hr.employee records linked to that partner
 * 4. Updates each employee's work_email, private_email, private_phone, legal_name, birthday, sex, marital
 * @param websiteUserKey - The website user ID (UUID string) - optional if email is provided
 * @param profileData - User profile data to sync
 */
export async function syncUserProfileToOdoo(
  websiteUserKey: string | null,
  profileData: {
    email: string;
    mobileNumber: string;
    legalName: string;
    birthday: string | null;
    gender: string | null;
    maritalStatus?: string | null;
    address?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    firstName?: string;
    lastName?: string;
    employeeNumber?: number | null;
    mainCompanyId?: number | null;
  },
): Promise<boolean> {
  try {
    let partnerSearchResult: Array<{ id: number; x_website_key?: string; email?: string }> | null =
      null;

    // 1. Search for res.partner by x_website_key or by email
    if (websiteUserKey) {
      partnerSearchResult = (await callOdooKw('res.partner', 'search_read', [], {
        domain: [['x_website_key', '=', websiteUserKey]],
        fields: ['id', 'x_website_key', 'email'],
      })) as Array<{ id: number; x_website_key?: string; email?: string }>;
    }

    // Fallback: search by email if x_website_key not found
    if (!partnerSearchResult || partnerSearchResult.length === 0) {
      partnerSearchResult = (await callOdooKw('res.partner', 'search_read', [], {
        domain: [['email', '=', profileData.email]],
        fields: ['id', 'x_website_key', 'email'],
      })) as Array<{ id: number; x_website_key?: string; email?: string }>;
    }

    if (!partnerSearchResult || partnerSearchResult.length === 0) {
      logger.warn(
        `No res.partner found for x_website_key: ${websiteUserKey} or email: ${profileData.email}`,
      );
      return false;
    }

    const partnerId = partnerSearchResult[0].id;

    // 2. Update partner data
    const partnerUpdateData: Record<string, unknown> = { email: profileData.email };
    const shouldSyncName =
      typeof profileData.firstName === 'string' || typeof profileData.lastName === 'string';
    const canFormatPrefixedName =
      Number.isInteger(profileData.employeeNumber) && Number.isInteger(profileData.mainCompanyId);

    if (shouldSyncName && canFormatPrefixedName) {
      partnerUpdateData.name = formatEmployeeDisplayName(
        Number(profileData.mainCompanyId),
        Number(profileData.employeeNumber),
        profileData.firstName || '',
        profileData.lastName || '',
      );
    } else if (shouldSyncName) {
      logger.warn(
        {
          websiteUserKey,
          email: profileData.email,
          employeeNumber: profileData.employeeNumber,
          mainCompanyId: profileData.mainCompanyId,
        },
        'Skipping partner name update because prefixed-name context is missing',
      );
    }
    await callOdooKw('res.partner', 'write', [[partnerId], partnerUpdateData]);

    logger.info(`Updated res.partner ${partnerId} for profile sync`);

    // 3. Search for all hr.employee records linked to this partner
    const employeeSearchResult = (await callOdooKw('hr.employee', 'search_read', [], {
      domain: [['work_contact_id', '=', partnerId]],
      fields: ['id', 'name', 'company_id'],
    })) as Array<{ id: number; name: string; company_id?: [number, string] | false }>;

    if (!employeeSearchResult || employeeSearchResult.length === 0) {
      logger.warn(`No hr.employee found for work_contact_id: ${partnerId}`);
      return false;
    }

    // 4. Prepare employee update data
    const employeeUpdateData: Record<string, unknown> = {
      work_email: profileData.email,
      private_email: profileData.email,
    };

    // Mobile number - remove +63 prefix if present
    if (profileData.mobileNumber) {
      employeeUpdateData.private_phone = profileData.mobileNumber.replace(/^\+?63/, '');
    }

    // Legal name
    if (profileData.legalName) {
      employeeUpdateData.legal_name = profileData.legalName;
    }

    // Birthday - ensure yyyy-mm-dd format
    if (profileData.birthday) {
      employeeUpdateData.birthday = profileData.birthday;
    }

    // Gender - convert to lowercase for Odoo
    if (profileData.gender) {
      employeeUpdateData.sex = profileData.gender.toLowerCase();
    }
    if (profileData.maritalStatus) {
      const normalizedMaritalStatus = profileData.maritalStatus.trim().toLowerCase();
      const odooMaritalStatus =
        normalizedMaritalStatus === 'legal cohabitant'
          ? 'cohabitant'
          : normalizedMaritalStatus === 'widowed'
            ? 'widower'
            : normalizedMaritalStatus;
      employeeUpdateData.marital = odooMaritalStatus;
    }
    if (profileData.address !== undefined) {
      employeeUpdateData.private_street = profileData.address;
    }

    if (profileData.emergencyContact !== undefined) {
      employeeUpdateData.emergency_contact = profileData.emergencyContact;
    }
    if (profileData.emergencyPhone !== undefined) {
      employeeUpdateData.emergency_phone = profileData.emergencyPhone;
    }

    // 5. Update all employees linked to this partner
    const employeeIds = employeeSearchResult.map((emp: { id: number }) => emp.id);
    await callOdooKw('hr.employee', 'write', [employeeIds, employeeUpdateData]);

    if (shouldSyncName) {
      if (!canFormatPrefixedName) {
        logger.warn(
          {
            websiteUserKey,
            email: profileData.email,
            employeeNumber: profileData.employeeNumber,
            mainCompanyId: profileData.mainCompanyId,
          },
          'Skipping employee name update because prefixed-name context is missing',
        );
      } else {
        const employeeNumber = Number(profileData.employeeNumber);
        const firstName = profileData.firstName || '';
        const lastName = profileData.lastName || '';

        for (const employee of employeeSearchResult) {
          const branchCompanyId = Array.isArray(employee.company_id)
            ? Number(employee.company_id[0])
            : Number(profileData.mainCompanyId);
          if (!Number.isInteger(branchCompanyId)) {
            logger.warn(
              { employeeId: employee.id, companyId: employee.company_id },
              'Skipping employee name update due to missing company_id',
            );
            continue;
          }

          await callOdooKw('hr.employee', 'write', [
            [employee.id],
            {
              name: formatEmployeeDisplayName(branchCompanyId, employeeNumber, firstName, lastName),
            },
          ]);
        }
      }
    }

    logger.info(`Updated ${employeeIds.length} hr.employee records for partner ${partnerId}`);
    return true;
  } catch (err) {
    logger.error(`Failed to sync user profile to Odoo: ${err}`);
    throw err;
  }
}

export async function createPartnerBankAndAssignEmployees(input: {
  websiteUserKey: string | null;
  email: string | null;
  bankId: number;
  accountNumber: string;
}): Promise<{ partnerId: number; partnerBankId: number; employeeIds: number[] }> {
  const partner = await resolveCanonicalPartnerByIdentity({
    websiteUserKey: input.websiteUserKey,
    email: input.email,
  });
  if (!partner) {
    throw new Error('No res.partner found for bank information sync');
  }

  const partnerId = partner.id;
  const accNumber = String(input.accountNumber).trim();

  /** Odoo enforces unique (partner, account number); reuse and update when already present. */
  const existingPartnerBanks = (await callOdooKw('res.partner.bank', 'search_read', [], {
    domain: [
      ['partner_id', '=', partnerId],
      ['acc_number', '=', accNumber],
    ],
    fields: ['id'],
    limit: 1,
  })) as Array<{ id: number }>;

  let partnerBankId: number;
  if (existingPartnerBanks.length > 0 && Number.isFinite(Number(existingPartnerBanks[0].id))) {
    partnerBankId = Number(existingPartnerBanks[0].id);
    await callOdooKw('res.partner.bank', 'write', [
      [partnerBankId],
      {
        bank_id: input.bankId,
        allow_out_payment: true,
      },
    ]);
    logger.info(
      { partnerId, partnerBankId, bankId: input.bankId },
      'Updated existing res.partner.bank for same partner and account number',
    );
  } else {
    partnerBankId = (await callOdooKw('res.partner.bank', 'create', [
      {
        bank_id: input.bankId,
        acc_number: accNumber,
        partner_id: partnerId,
        allow_out_payment: true,
      },
    ])) as number;
  }

  const partnerEmployees = await listEmployeesLinkedToPartner(partnerId);
  const legacyEmployees = input.websiteUserKey
    ? await listLegacyEmployeesByWebsiteKey(input.websiteUserKey)
    : [];
  const employeeRows = dedupeEmployeeRows([...partnerEmployees, ...legacyEmployees]);

  const employeeIds = employeeRows.map((row) => row.id);
  if (employeeIds.length > 0) {
    await callOdooKw('hr.employee', 'write', [
      employeeIds,
      hrEmployeeBankAccountIdsWritePayload(partnerBankId),
    ]);
  }

  return { partnerId, partnerBankId, employeeIds };
}

async function readPartnerBankRecord(partnerBankId: number): Promise<{
  id: number;
  bankId: number;
  accountNumber: string;
} | null> {
  const partnerBankRows = (await callOdooKw('res.partner.bank', 'read', [[partnerBankId]], {
    fields: ['id', 'bank_id', 'acc_number'],
  })) as Array<{ id: number; bank_id?: [number, string] | false; acc_number?: string | null }>;

  if (!partnerBankRows || partnerBankRows.length === 0) {
    return null;
  }

  const bankRow = partnerBankRows[0];
  const bankId = Array.isArray(bankRow.bank_id) ? Number(bankRow.bank_id[0]) : NaN;
  const accountNumber = String(bankRow.acc_number ?? '').trim();
  if (!Number.isFinite(bankId) || bankId <= 0 || !accountNumber) {
    return null;
  }

  return {
    id: bankRow.id,
    bankId,
    accountNumber,
  };
}

export async function getEmployeeLinkedBankInfoByWebsiteUserKey(
  websiteUserKey: string,
  email: string | null = null,
): Promise<{ bankId: number; accountNumber: string } | null> {
  const { partnerId, employees } = await listEmployeesForIdentity({
    websiteUserKey,
    email,
  });

  let selectedBank: { id: number; bankId: number; accountNumber: string } | null = null;
  for (const employee of employees) {
    const linkedBankId = firstPartnerBankIdFromEmployee(employee);
    if (linkedBankId === null) {
      continue;
    }
    const resolved = await readPartnerBankRecord(linkedBankId);
    if (resolved) {
      selectedBank = resolved;
      break;
    }
  }

  if (!selectedBank && partnerId) {
    const partnerBanks = (await callOdooKw('res.partner.bank', 'search_read', [], {
      domain: [['partner_id', '=', partnerId]],
      fields: ['id', 'bank_id', 'acc_number', 'write_date'],
      order: 'write_date desc, id desc',
      limit: 1,
    })) as Array<{ id: number; bank_id?: [number, string] | false; acc_number?: string | null }>;

    if (partnerBanks.length > 0) {
      const candidate = partnerBanks[0];
      const bankId = Array.isArray(candidate.bank_id) ? Number(candidate.bank_id[0]) : NaN;
      const accountNumber = String(candidate.acc_number ?? '').trim();
      if (Number.isFinite(bankId) && bankId > 0 && accountNumber) {
        selectedBank = {
          id: candidate.id,
          bankId,
          accountNumber,
        };
      }
    }
  }

  if (!selectedBank) {
    logger.warn(
      { websiteUserKey, email, partnerId, employeeCount: employees.length },
      'Resolved partner/employee identity but no bank record was found for auto-fill',
    );
    return null;
  }

  const employeesMissingBank = employees
    .filter((employee) => firstPartnerBankIdFromEmployee(employee) === null)
    .map((employee) => employee.id);

  if (employeesMissingBank.length > 0) {
    try {
      await callOdooKw('hr.employee', 'write', [
        employeesMissingBank,
        hrEmployeeBankAccountIdsWritePayload(selectedBank.id),
      ]);
    } catch (error) {
      logger.warn(
        {
          websiteUserKey,
          email,
          partnerId,
          partnerBankId: selectedBank.id,
          employeeIds: employeesMissingBank,
          error: error instanceof Error ? error.message : String(error),
        },
        'Resolved bank record but failed to attach bank_account_ids to some linked employees',
      );
    }
  }

  logger.info(
    {
      websiteUserKey,
      email,
      partnerId,
      partnerBankId: selectedBank.id,
      bankId: selectedBank.bankId,
    },
    'Resolved employee-linked bank info from Odoo',
  );

  return { bankId: selectedBank.bankId, accountNumber: selectedBank.accountNumber };
}

export interface ActiveAttendanceRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  employee_avatar: string | null;
  company_id: number;
  check_in: string;
  raw: Record<string, unknown>;
}

export interface IdentityActiveAttendanceRecord {
  id: number;
  employee_id: number;
  employee_name: string;
  company_id: number;
  check_in: string;
  raw: Record<string, unknown>;
}

type OdooActiveAttendanceSearchRow = {
  id: number;
  employee_id?: [number, string] | false;
  x_company_id?: [number, string] | false;
  check_in?: string;
  [key: string]: unknown;
};

function normalizeActiveAttendanceRows(
  rows: OdooActiveAttendanceSearchRow[],
): IdentityActiveAttendanceRecord[] {
  const result: IdentityActiveAttendanceRecord[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.employee_id) || !Array.isArray(row.x_company_id) || !row.check_in) {
      continue;
    }

    result.push({
      id: Number(row.id),
      employee_id: Number(row.employee_id[0]),
      employee_name: String(row.employee_id[1] ?? ''),
      company_id: Number(row.x_company_id[0]),
      check_in: String(row.check_in),
      raw: row,
    });
  }
  return result;
}

export async function getActiveAttendances(): Promise<ActiveAttendanceRecord[]> {
  const rows = (await callOdooKw('hr.attendance', 'search_read', [], {
    domain: [
      ['check_out', '=', false],
      ['x_company_id', '!=', 1],
    ],
    fields: ['id', 'employee_id', 'x_company_id', 'check_in'],
    order: 'check_in desc',
    limit: 5000,
  })) as Array<{
    id: number;
    employee_id?: [number, string] | false;
    x_company_id?: [number, string] | false;
    check_in?: string;
    [key: string]: unknown;
  }>;

  const result: ActiveAttendanceRecord[] = [];
  for (const row of rows) {
    if (!Array.isArray(row.employee_id) || !Array.isArray(row.x_company_id) || !row.check_in) {
      continue;
    }
    result.push({
      id: row.id,
      employee_id: Number(row.employee_id[0]),
      employee_name: String(row.employee_id[1] ?? ''),
      employee_avatar: null,
      company_id: Number(row.x_company_id[0]),
      check_in: String(row.check_in),
      raw: row,
    });
  }

  return result;
}

export async function getActiveAttendancesForWebsiteUserKey(
  websiteUserKey: string,
): Promise<IdentityActiveAttendanceRecord[]> {
  const employeeIds = await listEmployeeIdsByWebsiteUserKey(websiteUserKey);
  if (employeeIds.length === 0) {
    return [];
  }

  const rows = (await callOdooKw('hr.attendance', 'search_read', [], {
    domain: [
      ['employee_id', 'in', employeeIds],
      ['check_out', '=', false],
    ],
    fields: ['id', 'employee_id', 'x_company_id', 'check_in'],
    order: 'check_in desc',
    limit: 5000,
  })) as OdooActiveAttendanceSearchRow[];

  return normalizeActiveAttendanceRows(rows);
}

export async function getLatestActiveAttendanceForWebsiteUserKey(
  websiteUserKey: string,
): Promise<IdentityActiveAttendanceRecord | null> {
  const activeAttendances = await getActiveAttendancesForWebsiteUserKey(websiteUserKey);
  return activeAttendances[0] ?? null;
}

export async function batchCheckOutAttendances(
  attendanceIds: number[],
  checkOutTime: Date | string,
): Promise<number> {
  const uniqueAttendanceIds = Array.from(
    new Set(
      attendanceIds
        .map((attendanceId) => Number(attendanceId))
        .filter((attendanceId) => Number.isFinite(attendanceId) && attendanceId > 0),
    ),
  );

  if (uniqueAttendanceIds.length === 0) {
    return 0;
  }

  const parsedDate = parseUtcTimestamp(checkOutTime);
  const odooDatetime = toOdooDatetime(parsedDate);

  await callOdooKw('hr.attendance', 'write', [uniqueAttendanceIds, { check_out: odooDatetime }]);

  logger.info(
    { attendanceIds: uniqueAttendanceIds, checkOut: odooDatetime },
    'Batch checked out Odoo attendance records',
  );

  return uniqueAttendanceIds.length;
}

/**
 * Deducts break hours from the "Attendance" work entry for a specific employee and date.
 * Assumes work_entry_type_id = 1 is the Attendance type.
 */
export async function deductBreakFromWorkEntry(
  websiteUserKey: string,
  odooBranchId: number,
  date: string,
  breakHours: number,
): Promise<void> {
  // Find the Attendance work entry (type_id = 1) for that date using websiteUserKey and company_id
  const entries = (await callOdooKw('hr.work.entry', 'search_read', [], {
    domain: [
      ['x_website_key', '=', websiteUserKey],
      ['date', '=', date],
      ['work_entry_type_id', '=', 1],
      ['company_id', '=', odooBranchId],
    ],
    fields: ['id', 'duration'],
    limit: 1,
  })) as Array<{ id: number; duration: number }>;

  if (entries.length === 0) {
    logger.warn(
      { websiteUserKey, odooBranchId, date },
      'No Attendance work entry found in Odoo for specifically matched websiteUserKey and company_id',
    );
    return;
  }

  const entry = entries[0];
  const newDuration = Math.max(0, entry.duration - breakHours);

  // Update the duration
  await callOdooKw('hr.work.entry', 'write', [[entry.id], { duration: newDuration }]);

  logger.info(
    {
      entryId: entry.id,
      oldDuration: entry.duration,
      newDuration,
      breakHours,
      date,
      websiteUserKey,
    },
    'Successfully deducted break hours from direct-matched Odoo work entry',
  );
}

export async function getEmployeeWebsiteKeyByEmployeeId(
  employeeId: number,
): Promise<string | null> {
  const rows = (await callOdooKw('hr.employee', 'search_read', [], {
    domain: [['id', '=', employeeId]],
    fields: ['id', 'x_website_key'],
    limit: 1,
  })) as Array<{ id: number; x_website_key?: string | null }>;

  if (!rows.length) return null;
  const key = String(rows[0].x_website_key ?? '').trim();
  return key || null;
}

export async function getAttendanceIdentityByAttendanceId(attendanceId: number): Promise<{
  employeeId: number;
  employeeName: string;
  websiteUserKey: string | null;
} | null> {
  const rows = (await callOdooKw('hr.attendance', 'search_read', [], {
    domain: [['id', '=', attendanceId]],
    fields: ['id', 'employee_id'],
    limit: 1,
  })) as Array<{ id: number; employee_id?: [number, string] | false }>;

  if (!rows.length || !Array.isArray(rows[0].employee_id)) {
    return null;
  }

  const employeeId = Number(rows[0].employee_id[0]);
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    return null;
  }

  return {
    employeeId,
    employeeName: String(rows[0].employee_id[1] ?? '').trim(),
    websiteUserKey: await getEmployeeWebsiteKeyByEmployeeId(employeeId),
  };
}

/**
 * Gets the PIN code from Odoo hr.employee
 * @param websiteUserKey - The Omnilert user ID (UUID)
 * @param companyId - The Odoo company ID (branch ID)
 * @returns The PIN code string or null
 */
export async function getCompanyPin(
  websiteUserKey: string,
  companyId: number,
): Promise<string | null> {
  try {
    const { employees } = await listEmployeesForIdentity({
      websiteUserKey,
      companyId,
    });
    const result = employees.slice(0, 1);

    if (!result || result.length === 0) {
      logger.warn(`No employee found for website user: ${websiteUserKey}, company: ${companyId}`);
      return null;
    }

    return result[0].pin || null;
  } catch (err) {
    logger.error(`Failed to get employee PIN: ${err}`);
    throw err;
  }
}

export async function setPinForEmployeeIdentity(input: {
  websiteUserKey: string;
  email?: string | null;
  pin: string;
}): Promise<{ employeeCount: number }> {
  try {
    const { employees } = await listEmployeesForIdentity({
      websiteUserKey: input.websiteUserKey,
      email: input.email ?? null,
    });

    if (employees.length === 0) {
      logger.warn(
        { websiteUserKey: input.websiteUserKey },
        'No hr.employee records found while attempting PIN reset',
      );
      return { employeeCount: 0 };
    }

    const employeeIds = employees.map((row) => row.id);

    await withRetry(() =>
      callOdooKw('hr.employee', 'write', [employeeIds, { pin: input.pin }]).then(() => undefined),
    );

    return { employeeCount: employeeIds.length };
  } catch (err) {
    logger.error(
      { err, websiteUserKey: input.websiteUserKey },
      'Failed to reset employee PIN in Odoo',
    );
    throw err;
  }
}

/**
 * Updates planning.slot state (draft/published).
 */
export async function updatePlanningSlotState(
  planningSlotId: number,
  state: 'draft' | 'published',
): Promise<boolean> {
  try {
    const result = await callOdooKw('planning.slot', 'write', [[planningSlotId], { state }]);
    logger.info(`Updated planning.slot ${planningSlotId} state to ${state}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update planning.slot ${planningSlotId} state: ${err}`);
    throw err;
  }
}

/**
 * Updates planning.slot resource_id.
 */
export async function updatePlanningSlotResource(
  planningSlotId: number,
  resourceId: number,
): Promise<boolean> {
  try {
    const result = await callOdooKw('planning.slot', 'write', [
      [planningSlotId],
      { resource_id: resourceId },
    ]);
    logger.info(`Updated planning.slot ${planningSlotId} resource_id to ${resourceId}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update planning.slot ${planningSlotId} resource_id: ${err}`);
    throw err;
  }
}

/**
 * Resolves resource.resource id by employee x_website_key scoped to an Odoo company.
 */
export async function getResourceIdByWebsiteUserKeyAndCompanyId(
  websiteUserKey: string,
  companyId: number,
): Promise<number | null> {
  try {
    const identityEmployees = (
      await listEmployeesForIdentity({
        websiteUserKey,
        companyId,
      })
    ).employees;
    if (identityEmployees.length === 0) {
      logger.warn(`No hr.employee found for website key ${websiteUserKey} in company ${companyId}`);
      return null;
    }

    const employees = (await callOdooKw('hr.employee', 'search_read', [], {
      domain: [['id', 'in', identityEmployees.map((employee) => employee.id)]],
      fields: ['id', 'resource_id'],
      order: 'id asc',
      limit: 1,
    })) as Array<{ id: number; resource_id?: [number, string] | false }>;

    if (!employees || employees.length === 0) return null;

    const resourceField = employees[0].resource_id;
    if (!Array.isArray(resourceField) || !resourceField[0]) {
      logger.warn(
        `No resource_id on hr.employee ${employees[0].id} for website key ${websiteUserKey}`,
      );
      return null;
    }

    return Number(resourceField[0]);
  } catch (err) {
    logger.error(
      `Failed to resolve resource by website key ${websiteUserKey} and company ${companyId}: ${err}`,
    );
    throw err;
  }
}

/**
 * Finds the hr.employee ID on Odoo company_id = 1 for a given x_website_key.
 * Returns null if not found.
 */
export async function getCompany1EmployeeIdByWebsiteKey(
  websiteUserKey: string,
): Promise<number | null> {
  const rows = (await callOdooKw('hr.employee', 'search_read', [], {
    domain: [
      ['x_website_key', '=', websiteUserKey],
      ['company_id', '=', 1],
    ],
    fields: ['id'],
    limit: 1,
  })) as Array<{ id: number }>;
  return rows.length > 0 ? rows[0].id : null;
}

/**
 * Creates an hr.salary.attachment record in Odoo for an audit monetary reward.
 * Silently logs and returns false on failure — never blocks audit completion.
 */
export async function createAuditSalaryAttachment(input: {
  websiteUserKey: string;
  description: string;
  totalAmount: number;
}): Promise<boolean> {
  try {
    const employeeId = await getCompany1EmployeeIdByWebsiteKey(input.websiteUserKey);
    if (!employeeId) {
      logger.warn(
        { websiteUserKey: input.websiteUserKey },
        'createAuditSalaryAttachment: no company_id=1 employee found, skipping',
      );
      return false;
    }

    const dateStart = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const [year, month, dayStr] = dateStart.split('-');
    const day = parseInt(dayStr, 10);

    let dateEstimatedEnd: string;
    if (day <= 15) {
      dateEstimatedEnd = `${year}-${month}-15`;
    } else {
      const lastDay = new Date(Number(year), Number(month), 0).getDate();
      dateEstimatedEnd = `${year}-${month}-${String(lastDay).padStart(2, '0')}`;
    }

    await callOdooKw('hr.salary.attachment', 'create', [
      {
        employee_ids: [[4, employeeId]],
        description: input.description,
        other_input_type_id: 22,
        total_amount: input.totalAmount,
        monthly_amount: input.totalAmount,
        date_start: dateStart,
        date_end: dateEstimatedEnd,
        duration_type: 'one',
      },
    ]);

    logger.info(
      { employeeId, description: input.description },
      'createAuditSalaryAttachment: created',
    );
    return true;
  } catch (err) {
    logger.error(
      { err, websiteUserKey: input.websiteUserKey },
      'createAuditSalaryAttachment: failed, skipping',
    );
    return false;
  }
}

// ---------------------------------------------------------------------------
// Payslip list + detail helpers (used by the redesigned PayslipPage)
// ---------------------------------------------------------------------------

/**
 * Loads the set of Odoo company IDs (hr.payslip company_id integers) that a
 * given website user is authorised to see, and maps each one to the website
 * branch name stored in our own `branches` table.
 *
 * Only branches that have a non-null `odoo_branch_id` are included.
 */
async function loadUserAllowedOdooBranchMap(userId: string): Promise<Map<number, string>> {
  const rows = (await db
    .getDb()('user_company_branches as ucb')
    .join('branches as b', 'ucb.branch_id', 'b.id')
    .where('ucb.user_id', userId)
    .whereNotNull('b.odoo_branch_id')
    .select('b.odoo_branch_id', 'b.name')) as Array<{
    odoo_branch_id: string;
    name: string;
  }>;

  const map = new Map<number, string>();
  for (const row of rows) {
    const odooId = parseInt(row.odoo_branch_id, 10);
    if (!isNaN(odooId)) {
      map.set(odooId, row.name);
    }
  }
  return map;
}

/**
 * Returns the list of Odoo employees linked to the given website user key,
 * filtered to only the branches the user is assigned to on the website.
 * The `company_id[1]` name in each employee is replaced with the website
 * branch name so downstream callers show consistent naming.
 */
export async function getEmployeesForWebsiteUserKey(
  websiteUserKey: string,
  userId: string,
): Promise<Array<{ id: number; name?: string | null; company_id?: [number, string] | false }>> {
  const [{ employees }, allowedBranchMap] = await Promise.all([
    listEmployeesForIdentity({ websiteUserKey }),
    loadUserAllowedOdooBranchMap(userId),
  ]);

  return employees
    .filter((emp) => {
      if (!emp.company_id || !Array.isArray(emp.company_id)) return false;
      return allowedBranchMap.has(emp.company_id[0]);
    })
    .map((emp) => {
      if (!emp.company_id || !Array.isArray(emp.company_id)) return emp;
      const websiteName = allowedBranchMap.get(emp.company_id[0]);
      if (!websiteName) return emp;
      return { ...emp, company_id: [emp.company_id[0], websiteName] as [number, string] };
    });
}

/**
 * Raw Odoo payslip row returned by search_read for the list view.
 */
interface OdooPayslipRow {
  id: number;
  name: string;
  state: string;
  employee_id: [number, string];
  date_from: string;
  date_to: string;
  company_id: [number, string];
  /** Computed net wage; 0 means the payslip has no data (no lines computed). */
  net_wage: number;
}

/**
 * Determines the cutoff number (1 or 2) from the date_from string.
 * 1st cutoff starts on the 1st, 2nd cutoff starts on the 16th.
 */
function resolveCutoffFromDateFrom(dateFrom: string): 1 | 2 {
  const day = Number(dateFrom.split('-')[2]);
  return day <= 15 ? 1 : 2;
}

/**
 * Derives a PayslipStatus from a raw Odoo state string.
 */
function derivePayslipStatus(state: string): 'draft' | 'completed' {
  if (state === 'draft') return 'draft';
  return 'completed';
}

/**
 * Fetches all non-cancelled, non-view-only payslips for every employee
 * linked to the given website user key across all companies, restricted to
 * the branches the user is assigned to on the website.
 *
 * `company_name` on every returned item uses the website branch name (not the
 * Odoo company name) so the UI always shows consistent branch labels.
 *
 * Returns items sorted by date_to descending (newest first).
 */
export async function getAllPayslipsForUser(
  websiteUserKey: string,
  userId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    date_from: string;
    date_to: string;
    odoo_state: string;
    status: 'draft' | 'completed';
    company_id: number;
    company_name: string;
    employee_id: number;
    employee_name: string;
    cutoff: 1 | 2;
    is_pending: false;
    /** Odoo computed net pay; 0 means the payslip has no salary data yet. */
    net_pay: number;
  }>
> {
  try {
    const [{ employees }, allowedBranchMap] = await Promise.all([
      listEmployeesForIdentity({ websiteUserKey }),
      loadUserAllowedOdooBranchMap(userId),
    ]);

    // Restrict to the branches this user is assigned to on the website
    const allowedEmployees = employees.filter((emp) => {
      if (!emp.company_id || !Array.isArray(emp.company_id)) return false;
      return allowedBranchMap.has(emp.company_id[0]);
    });

    if (allowedEmployees.length === 0) {
      return [];
    }

    const allRows: OdooPayslipRow[] = [];

    // Query payslips for each employee in parallel
    await Promise.all(
      allowedEmployees.map(async (employee) => {
        const rows = (await callOdooKw('hr.payslip', 'search_read', [], {
          domain: [
            ['employee_id', '=', employee.id],
            ['state', '!=', 'cancel'],
            ['x_view_only', '!=', true],
          ],
          fields: [
            'id',
            'name',
            'state',
            'employee_id',
            'date_from',
            'date_to',
            'company_id',
            'net_wage',
          ],
          order: 'date_to desc, id desc',
          limit: 1000,
        })) as OdooPayslipRow[];

        allRows.push(...rows);
      }),
    );

    // Deduplicate by Odoo payslip id
    const seen = new Set<number>();
    const deduped = allRows.filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    // Sort combined list: newest date_to first, then by id descending
    deduped.sort((a, b) => {
      const dateDiff = b.date_to.localeCompare(a.date_to);
      if (dateDiff !== 0) return dateDiff;
      return b.id - a.id;
    });

    return deduped.map((row) => {
      const odooCompanyId = Array.isArray(row.company_id)
        ? row.company_id[0]
        : (row.company_id as unknown as number);
      // Prefer the website branch name; fall back to the Odoo company name if
      // (for any reason) the branch is no longer in the allowed map.
      const websiteBranchName = allowedBranchMap.get(odooCompanyId);
      const companyName =
        websiteBranchName ?? (Array.isArray(row.company_id) ? row.company_id[1] : '');

      return {
        id: String(row.id),
        name: row.name,
        date_from: row.date_from,
        date_to: row.date_to,
        odoo_state: row.state,
        status: derivePayslipStatus(row.state),
        company_id: odooCompanyId,
        company_name: companyName,
        employee_id: Array.isArray(row.employee_id)
          ? row.employee_id[0]
          : (row.employee_id as unknown as number),
        employee_name: Array.isArray(row.employee_id) ? row.employee_id[1] : '',
        cutoff: resolveCutoffFromDateFrom(row.date_from),
        is_pending: false as const,
        net_pay: row.net_wage ?? 0,
      };
    });
  } catch (err) {
    logger.error(`Failed to get all payslips for user ${websiteUserKey}: ${err}`);
    throw err;
  }
}

/**
 * Calculates synthetic "pending" payslip stubs for the current month's
 * cutoff periods that do not yet exist in the provided existingPayslips list.
 *
 * visibility rules:
 * 1. If current day <= 15: only evaluate 1st cutoff (1st-15th).
 * 2. If current day > 15: evaluate 2nd cutoff (16th-End) and 1st cutoff (if missing).
 * 3. Only show a stub if the employee has at least one work entry (attendance)
 *    at that specific branch for that specific period.
 */
export async function calculatePendingPayslipStubs(
  employees: Array<{ id: number; name?: string | null; company_id?: [number, string] | false }>,
  existingPayslips: Array<{
    employee_id: number;
    company_id: number;
    date_from: string;
    date_to: string;
    status: 'draft' | 'completed';
  }>,
): Promise<PayslipListItem[]> {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  // Helper: semi-monthly range for a given cutoff and month base (0-indexed month)
  const getSemiMonthRangeForBase = (
    cutoff: 1 | 2,
    dateBase: Date,
  ): { date_from: string; date_to: string } => {
    const year = dateBase.getFullYear();
    const month = dateBase.getMonth(); // 0-indexed
    if (cutoff === 1) {
      return {
        date_from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        date_to: `${year}-${String(month + 1).padStart(2, '0')}-15`,
      };
    } else {
      const lastDay = new Date(year, month + 1, 0).getDate();
      return {
        date_from: `${year}-${String(month + 1).padStart(2, '0')}-16`,
        date_to: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
      };
    }
  };

  // Helper: given the date_to of a completed payslip, return the start of the next period
  const getNextPeriodStart = (date_to: string): { year: number; month: number; cutoff: 1 | 2 } => {
    const parts = date_to.split('-');
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // 0-indexed
    const day = parseInt(parts[2], 10);
    if (day <= 15) {
      // date_to falls within the 1st cutoff window; next is 2nd cutoff of same month
      return { year, month, cutoff: 2 };
    }
    // date_to falls within 2nd cutoff window; next is 1st cutoff of next month
    const next = new Date(year, month + 1, 1);
    return { year: next.getFullYear(), month: next.getMonth(), cutoff: 1 };
  };

  const employeeIds = employees.map((e) => e.id);
  if (employeeIds.length === 0) return [];

  // Determine the earliest date_from we'll need so the work-entry query covers
  // the full window. Start with today as the upper bound and walk back.
  let searchStart = todayStr;
  for (const employee of employees) {
    const companyField = employee.company_id;
    if (!companyField || !Array.isArray(companyField)) continue;
    const companyId = companyField[0];

    const lastCompleted = existingPayslips
      .filter(
        (p) =>
          p.employee_id === employee.id && p.company_id === companyId && p.status === 'completed',
      )
      .sort((a, b) => b.date_to.localeCompare(a.date_to))[0];

    let startDate: string;
    if (lastCompleted) {
      const next = getNextPeriodStart(lastCompleted.date_to);
      startDate = getSemiMonthRangeForBase(
        next.cutoff,
        new Date(next.year, next.month, 1),
      ).date_from;
    } else {
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDate = getSemiMonthRangeForBase(1, prevMonth).date_from;
    }

    if (startDate < searchStart) searchStart = startDate;
  }

  // limit: 0 fetches all records — Odoo's default limit of 80 would silently
  // drop entries for later periods, causing stubs to be skipped incorrectly.
  const workEntries = (await callOdooKw('hr.work.entry', 'search_read', [], {
    domain: [
      ['employee_id', 'in', employeeIds],
      ['date', '>=', searchStart],
    ],
    fields: ['employee_id', 'company_id', 'date'],
    limit: 0,
  })) as Array<{
    employee_id: [number, string];
    company_id: [number, string];
    date: string;
  }>;

  const stubs: PayslipListItem[] = [];

  for (const employee of employees) {
    const companyField = employee.company_id;
    if (!companyField || !Array.isArray(companyField)) continue;

    const companyId = companyField[0];
    const companyName = companyField[1];
    const employeeName = employee.name ?? '';

    // Find the most recent completed payslip for this employee+company
    const lastCompleted = existingPayslips
      .filter(
        (p) =>
          p.employee_id === employee.id && p.company_id === companyId && p.status === 'completed',
      )
      .sort((a, b) => b.date_to.localeCompare(a.date_to))[0];

    let year: number;
    let month: number;
    let cutoff: 1 | 2;

    if (lastCompleted) {
      ({ year, month, cutoff } = getNextPeriodStart(lastCompleted.date_to));
    } else {
      // No completed payslip — fall back to cutoff 1 of the previous month
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      year = prevMonth.getFullYear();
      month = prevMonth.getMonth();
      cutoff = 1;
    }

    // Walk forward through every semi-monthly period until date_from exceeds today
    for (;;) {
      const range = getSemiMonthRangeForBase(cutoff, new Date(year, month, 1));

      // Stop once the period hasn't started yet
      if (range.date_from > todayStr) break;

      // Skip if a real payslip (any status) already covers this period
      const hasReal = existingPayslips.some(
        (p) =>
          p.employee_id === employee.id &&
          p.company_id === companyId &&
          p.date_from === range.date_from &&
          p.date_to === range.date_to,
      );

      if (!hasReal) {
        // For the current ongoing period (today falls within it), always show the
        // stub — today's work entries may not exist in Odoo yet. For past periods,
        // require at least one work entry as a proxy for non-zero net pay.
        const isCurrentPeriod = todayStr >= range.date_from && todayStr <= range.date_to;
        const hasAttendance =
          isCurrentPeriod ||
          workEntries.some((we) => {
            const weEmployeeId = Array.isArray(we.employee_id) ? we.employee_id[0] : we.employee_id;
            const weCompanyId = Array.isArray(we.company_id) ? we.company_id[0] : we.company_id;
            const weDate = we.date.slice(0, 10); // truncate to YYYY-MM-DD if datetime
            return (
              weEmployeeId === employee.id &&
              weCompanyId === companyId &&
              weDate >= range.date_from &&
              weDate <= range.date_to
            );
          });

        if (hasAttendance) {
          stubs.push({
            id: `pending-${companyId}:${range.date_from}:${cutoff}`,
            name: `${employeeName} | ${cutoff === 1 ? '1st' : '2nd'} Cutoff Payslip`,
            date_from: range.date_from,
            date_to: range.date_to,
            odoo_state: '',
            status: 'pending',
            company_id: companyId,
            company_name: companyName,
            employee_id: employee.id,
            employee_name: employeeName,
            cutoff,
            is_pending: true,
          });
        }
      }

      // Advance to the next semi-monthly period
      if (cutoff === 1) {
        cutoff = 2;
      } else {
        cutoff = 1;
        month++;
        if (month > 11) {
          month = 0;
          year++;
        }
      }
    }
  }

  // Sort: newest (latest date_from) first
  return stubs.sort((a, b) => b.date_from.localeCompare(a.date_from));
}

/**
 * Fetches a single Odoo payslip by its ID, refreshes it from work entries,
 * recomputes, and returns the full data including lines and worked_days.
 */
export async function getPayslipDetailById(payslipId: number): Promise<{
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
}> {
  try {
    // Read the payslip header first so we know its current state before
    // attempting any mutation.
    const slips = (await callOdooKw('hr.payslip', 'read', [[payslipId]], {
      fields: ['id', 'name', 'state', 'employee_id', 'date_from', 'date_to'],
    })) as Array<{
      id: number;
      name: string;
      state: string;
      employee_id: [number, string];
      date_from: string;
      date_to: string;
    }>;

    if (!slips || slips.length === 0) {
      throw new Error(`Payslip ${payslipId} not found in Odoo`);
    }

    const slip = slips[0];

    // Odoo only allows refresh + recompute on Draft ("draft") or Waiting
    // ("verify") payslips. Calling these methods on a Done/Paid ("done")
    // payslip throws "The payslips should be in Draft or Waiting state."
    if (slip.state === 'draft' || slip.state === 'verify') {
      await callOdooKw('hr.payslip', 'action_refresh_from_work_entries', [[payslipId]]);
      await callOdooKw('hr.payslip', 'compute_sheet', [[payslipId]]);
    }

    const lines = (await callOdooKw('hr.payslip.line', 'search_read', [], {
      domain: [['slip_id', '=', payslipId]],
      fields: [
        'id',
        'name',
        'code',
        'category_id',
        'total',
        'amount',
        'quantity',
        'rate',
        'sequence',
      ],
      order: 'sequence asc, id asc',
      limit: 1000,
    })) as Array<{
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

    const workedDays = (await callOdooKw('hr.payslip.worked_days', 'search_read', [], {
      domain: [['payslip_id', '=', payslipId]],
      fields: ['id', 'name', 'code', 'number_of_days', 'number_of_hours', 'amount'],
      order: 'id asc',
      limit: 1000,
    })) as Array<{
      id: number;
      name: string;
      code: string;
      number_of_days: number;
      number_of_hours: number;
      amount: number;
    }>;

    return { ...slip, lines, worked_days: workedDays };
  } catch (err) {
    logger.error(`Failed to get payslip detail for id ${payslipId}: ${err}`);
    throw err;
  }
}

/**
 * Gets or creates a view-only payslip for a pending period,
 * reusing the existing getEmployeePayslipData / createViewOnlyPayslip logic.
 * Used when the user clicks a "pending" payslip card.
 */
export async function getOrCreatePendingPayslipDetail(
  employeeId: number,
  companyId: number,
  employeeName: string,
  cutoff: 1 | 2,
  dateFrom?: string,
): Promise<any> {
  const existing = await getEmployeePayslipData(employeeId, companyId, cutoff, dateFrom);
  if (existing) {
    return existing;
  }
  return createViewOnlyPayslip(employeeId, companyId, employeeName, cutoff, dateFrom);
}

export interface OdooLoyaltyCard {
  id: number;
  points: number;
  partnerId: number;
}

/**
 * Odoo loyalty program ID for the Token Pay wallet.
 * This is hardcoded per a product decision — program 13 is the only Token Pay program.
 */
const TOKEN_PAY_PROGRAM_ID = 13;

/**
 * Get the Token Pay loyalty card for a user.
 * Returns null if no card is found.
 */
export async function getTokenPayCard(userKey: string): Promise<OdooLoyaltyCard | null> {
  const results = (await callOdooKw('loyalty.card', 'search_read', [], {
    domain: ['&', ['partner_id.x_website_key', '=', userKey], ['program_id', 'in', [TOKEN_PAY_PROGRAM_ID]]],
    fields: ['id', 'points', 'partner_id'],
    limit: 1,
  })) as Array<{ id: number; points: number; partner_id: [number, string] }>;
  if (results.length === 0) return null;
  const r = results[0];
  return { id: r.id, points: r.points, partnerId: r.partner_id[0] };
}

/**
 * Create a new Token Pay loyalty card for an Odoo partner.
 * Called when a user has no existing card.
 */
export async function createTokenPayCard(partnerId: number, code: string): Promise<OdooLoyaltyCard> {
  const cardId = (await callOdooKw('loyalty.card', 'create', [
    [{ program_id: TOKEN_PAY_PROGRAM_ID, partner_id: partnerId, points: 0, code }],
  ])) as number;
  return { id: cardId, points: 0, partnerId };
}

export interface OdooLoyaltyHistory {
  id: number;
  order_id: [number, string] | false;
  create_date: string;
  x_order_type: string;
  issued: number;
  used: number;
  x_order_reference: string | false;
  x_issuer: string | false;
}

/**
 * Get paginated transaction history for a loyalty card, newest first.
 */
export async function getTokenPayHistory(
  cardId: number,
  offset: number,
  limit: number,
): Promise<OdooLoyaltyHistory[]> {
  return (await callOdooKw('loyalty.history', 'search_read', [], {
    domain: [['card_id', '=', cardId]],
    fields: ['id', 'order_id', 'create_date', 'x_order_type', 'issued', 'used', 'x_order_reference', 'x_issuer'],
    order: 'create_date desc',
    offset,
    limit,
  })) as OdooLoyaltyHistory[];
}

/**
 * Count total transaction history entries for a loyalty card.
 */
export async function getTokenPayHistoryCount(cardId: number): Promise<number> {
  return (await callOdooKw('loyalty.history', 'search_count', [[['card_id', '=', cardId]]])) as number;
}

/**
 * Get lifetime totals (sum of all issued and used) for a loyalty card.
 */
export async function getTokenPayTotals(cardId: number): Promise<{ totalEarned: number; totalSpent: number }> {
  const rows = (await callOdooKw('loyalty.history', 'read_group', [
    [['card_id', '=', cardId]],
    ['issued', 'used'],
    [],
  ])) as Array<{ issued: number; used: number }>;
  const row = rows[0];
  return {
    totalEarned: row?.issued || 0,
    totalSpent: row?.used || 0,
  };
}
