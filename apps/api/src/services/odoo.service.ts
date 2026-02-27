import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";

/**
 * Gets the current semi-month range (for Philippines timezone)
 * First half: 1st-15th, Second half: 16th-last day
 * @param cutoff - Optional: 1 for 1st cutoff (1st-15th), 2 for 2nd cutoff (16th-last day). If not provided, uses current date to determine.
 * @returns date_from and date_to in YYYY-MM-DD format
 */
export function getCurrentSemiMonthRange(cutoff?: number): { date_from: string; date_to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

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
    dateFrom = `${year}-${String(month).padStart(2, "0")}-01`;
    dateTo = `${year}-${String(month).padStart(2, "0")}-15`;
  } else {
    // Second half of the month (16th-last day)
    dateFrom = `${year}-${String(month).padStart(2, "0")}-16`;
    // Last day of the month
    const lastDay = new Date(year, month, 0).getDate();
    dateTo = `${year}-${String(month).padStart(2, "0")}-${lastDay}`;
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
  bank_account_id?: [number, string] | false;
  work_contact_id?: [number, string] | false;
  x_website_key?: string | null;
};

async function resolveCanonicalPartnerByIdentity(input: {
  websiteUserKey?: string | null;
  email?: string | null;
}): Promise<OdooPartnerRow | null> {
  if (input.websiteUserKey) {
    const byKey = (await callOdooKw(
      "res.partner",
      "search_read",
      [],
      {
        domain: [["x_website_key", "=", input.websiteUserKey], ["active", "=", true]],
        fields: ["id"],
        order: "id asc",
        limit: 1,
      }
    )) as OdooPartnerRow[];
    if (byKey.length > 0) {
      return byKey[0];
    }
  }

  if (input.email) {
    const byEmail = (await callOdooKw(
      "res.partner",
      "search_read",
      [],
      {
        domain: [["email", "=", input.email], ["active", "=", true]],
        fields: ["id"],
        order: "id asc",
        limit: 1,
      }
    )) as OdooPartnerRow[];
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
  const domain: unknown[] = [["work_contact_id", "=", partnerId]];
  if (Number.isInteger(companyId)) {
    domain.push(["company_id", "=", companyId]);
  }

  return (await callOdooKw(
    "hr.employee",
    "search_read",
    [],
    {
      domain,
      fields: ["id", "name", "pin", "company_id", "bank_account_id", "work_contact_id", "x_website_key"],
      order: "id asc",
      limit: 1000,
    },
  )) as OdooEmployeeIdentityRow[];
}

async function listLegacyEmployeesByWebsiteKey(
  websiteUserKey: string,
  companyId?: number,
): Promise<OdooEmployeeIdentityRow[]> {
  const domain: unknown[] = [["x_website_key", "=", websiteUserKey]];
  if (Number.isInteger(companyId)) {
    domain.push(["company_id", "=", companyId]);
  }

  return (await callOdooKw(
    "hr.employee",
    "search_read",
    [],
    {
      domain,
      fields: ["id", "name", "pin", "company_id", "bank_account_id", "work_contact_id", "x_website_key"],
      order: "id asc",
      limit: 1000,
    },
  )) as OdooEmployeeIdentityRow[];
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
  const legacyEmployees = await listLegacyEmployeesByWebsiteKey(input.websiteUserKey, input.companyId);

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

  const existingPin = employees
    .map((employee) => String(employee.pin ?? "").trim())
    .find((pin) => /^\d{4}$/.test(pin)) ?? null;

  return {
    employeeCount: employees.length,
    existingPin,
  };
}

export async function getEmployeeByWebsiteUserKey(
  websiteUserKey: string,
  companyId: number
): Promise<{ id: number; name: string } | null> {
  try {
    const { employees } = await listEmployeesForIdentity({
      websiteUserKey,
      companyId,
    });
    const result = employees.slice(0, 1);

    if (!result || result.length === 0) {
      logger.warn(`No employee found for website user ID: ${websiteUserKey}, company: ${companyId}`);
      return null;
    }

    return { id: result[0].id, name: result[0].name ?? "" };
  } catch (err) {
    logger.error(`Failed to get employee by website user ID ${websiteUserKey}: ${err}`);
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
  cutoff?: number
): Promise<{
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
} | null> {
  try {
    const { date_from, date_to } = getCurrentSemiMonthRange(cutoff);

    // Search for existing payslip
    const slips = (await callOdooKw(
      "hr.payslip",
      "search_read",
      [],
      {
        domain: [
          ["x_view_only", "=", true],
          ["date_from", "=", date_from],
          ["date_to", "=", date_to],
          ["employee_id", "=", employeeId],
          ["company_id", "=", companyId],
        ],
        fields: [
          "id",
          "name",
          "state",
          "employee_id",
          "date_from",
          "date_to",
          "x_view_only",
          "line_ids",
          "worked_days_line_ids",
        ],
        limit: 1,
      }
    )) as Array<{
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
    await callOdooKw("hr.payslip", "action_refresh_from_work_entries", [[slipId]]);

    // Compute the salary rule lines
    await callOdooKw("hr.payslip", "compute_sheet", [[slipId]]);

    // Get payslip lines
    const lines = (await callOdooKw(
      "hr.payslip.line",
      "search_read",
      [],
      {
        domain: [["slip_id", "=", slipId]],
        fields: [
          "id",
          "name",
          "code",
          "category_id",
          "total",
          "amount",
          "quantity",
          "rate",
          "sequence",
        ],
        order: "sequence asc, id asc",
        limit: 1000,
      }
    )) as Array<{
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
    const workedDays = (await callOdooKw(
      "hr.payslip.worked_days",
      "search_read",
      [],
      {
        domain: [["payslip_id", "=", slipId]],
        fields: ["id", "name", "code", "number_of_days", "number_of_hours", "amount"],
        order: "id asc",
        limit: 1000,
      }
    )) as Array<{
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
  cutoff?: number
): Promise<{
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
    const { date_from, date_to } = getCurrentSemiMonthRange(cutoff);

    // Create the payslip as off-cycle (no payslip_run_id)
    const slipId = (await callOdooKw("hr.payslip", "create", [
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
    const [slip] = (await callOdooKw(
      "hr.payslip",
      "read",
      [[slipId]],
      {
        fields: [
          "id",
          "name",
          "state",
          "employee_id",
          "date_from",
          "date_to",
          "x_view_only",
          "line_ids",
          "worked_days_line_ids",
        ],
      }
    )) as Array<{
      id: number;
      name: string;
      state: string;
      employee_id: [number, string];
      date_from: string;
      date_to: string;
    }>;

    // Compute the sheet
    await callOdooKw("hr.payslip", "compute_sheet", [[slipId]]);

    // Get payslip lines
    const lines = (await callOdooKw(
      "hr.payslip.line",
      "search_read",
      [],
      {
        domain: [["slip_id", "=", slipId]],
        fields: [
          "id",
          "name",
          "code",
          "category_id",
          "total",
          "amount",
          "quantity",
          "rate",
          "sequence",
        ],
        order: "sequence asc, id asc",
        limit: 1000,
      }
    )) as Array<{
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
    const workedDays = (await callOdooKw(
      "hr.payslip.worked_days",
      "search_read",
      [],
      {
        domain: [["payslip_id", "=", slipId]],
        fields: ["id", "name", "code", "number_of_days", "number_of_hours", "amount"],
        order: "id asc",
        limit: 1000,
      }
    )) as Array<{
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
export async function getEmployeeEPIData(
  websiteUserKey: string
): Promise<{
  id: number;
  employee_id: [number, string];
  x_epi: number;
  x_average_scsa: number;
  x_average_sqaa: number;
  x_audit_ratings: Array<{ id: number; rating: number }>;
} | null> {
  try {
    const result = (await callOdooKw(
      "hr.employee",
      "search_read",
      [],
      {
        domain: [
          ["x_website_key", "=", websiteUserKey],
          ["company_id", "=", 1], // Famous Belgian Waffle
        ],
        fields: [
          "id",
          "employee_id",
          "x_epi",
          "x_average_scsa",
          "x_average_sqaa",
          "x_audit_ratings",
        ],
        limit: 1,
      }
    )) as Array<{
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
export async function getAllEmployeesWithEPI(
  companyId: number = 1
): Promise<Array<{
  id: number;
  employee_id: [number, string];
  x_epi: number;
  x_average_scsa: number;
  x_average_sqaa: number;
}>> {
  try {
    const result = (await callOdooKw(
      "hr.employee",
      "search_read",
      [],
      {
        domain: [
          ["company_id", "=", companyId],
          ["x_epi", "!=", 0],
        ],
        fields: [
          "id",
          "employee_id",
          "x_epi",
          "x_average_scsa",
          "x_average_sqaa",
        ],
        order: "x_epi desc",
        limit: 5,
      }
    )) as Array<{
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
  limit: number = 5
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
    const result = (await callOdooKw(
      "x_audit_ratings",
      "search_read",
      [],
      {
        domain: [["x_website_key", "=", websiteUserKey]],
        fields: ["id", "x_audit_date", "x_audit_code", "x_name", "x_rating", "x_employee_id"],
        order: "x_audit_date desc",
        offset,
        limit,
      }
    )) as Array<{
      id: number;
      x_audit_date: string;
      x_audit_code: string;
      x_name: string;
      x_rating: number;
      x_employee_id: [number, string];
    }>;

    // Get total count
    const countResult = (await callOdooKw(
      "x_audit_ratings",
      "search_count",
      [],
      { domain: [["x_website_key", "=", websiteUserKey]] }
    )) as number;

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
function toOdooDatetime(date: Date): string {
  // Use UTC timezone as Odoo uses UTC
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Format: 2026-02-17 11:00:00
  const parts = formatter.formatToParts(date);
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  const hour = parts.find((p) => p.type === "hour")?.value;
  const minute = parts.find((p) => p.type === "minute")?.value;
  const second = parts.find((p) => p.type === "second")?.value;

  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Parses a timestamp string as UTC
 * @param timestamp - The timestamp string (e.g., "2026-02-17 11:30:00" or ISO string)
 * @returns Date object
 */
function parseUtcTimestamp(timestamp: string | Date): Date {
  if (timestamp instanceof Date) {
    return timestamp;
  }
  // If it's already in format "YYYY-MM-DD HH:MM:SS", append UTC indicator
  // This ensures it's parsed as UTC
  const trimmed = timestamp.trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed + "Z");
  }
  return new Date(timestamp);
}

/**
 * Makes a JSON RPC call to Odoo
 * @param method - The RPC method to call (e.g., 'call')
 * @param payload - The payload for the RPC call
 * @returns The result from Odoo
 */
async function jsonRpc(method: string, payload: Record<string, unknown>): Promise<unknown> {
  // Use ODOO_URL for the RPC endpoint
  let odooUrl = env.ODOO_URL;
  if (!odooUrl.startsWith("http://") && !odooUrl.startsWith("https://")) {
    odooUrl = `https://${odooUrl}`;
  }
  const url = `${odooUrl}/jsonrpc`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: method,
        params: payload,
        id: Math.floor(Math.random() * 1000000),
      }),
    });

    if (!response.ok) {
      throw new Error(`Odoo JSON RPC HTTP error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as {
      error?: { message: string; data?: { message: string; debug?: string } };
      result?: unknown;
    };

    if (data.error) {
      const odooError = data.error;
      const detailedMessage = odooError.data?.message || odooError.message;
      throw new Error(`Odoo JSON RPC error: ${detailedMessage}`);
    }

    return data;
  } catch (err) {
    logger.error(`JSON RPC call failed: ${err}`);
    throw err;
  }
}

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
  kwargs: Record<string, unknown> = {}
): Promise<unknown> {
  try {
    const payload = {
      service: "object",
      method: "execute_kw",
      args: [
        env.ODOO_DB,
        2, // user ID - TODO: make this configurable if needed
        env.ODOO_PASSWORD,
        model,
        method,
        args,
        kwargs,
      ],
    };

    const response = await jsonRpc("call", payload);
    return (response as { result?: unknown }).result ?? null;
  } catch (err) {
    logger.error(
      `Error calling Odoo execute_kw for model "${model}", method "${method}": ${err}`
    );
    throw err;
  }
}

/**
 * Updates the check_in time for an Odoo attendance record
 * @param attendanceId - The Odoo attendance ID
 * @param checkInTime - The new check_in time (Date object or timestamp string)
 * @returns True if successful
 */
export async function updateAttendanceCheckIn(
  attendanceId: number,
  checkInTime: string | Date
): Promise<boolean> {
  try {
    const parsedDate = parseUtcTimestamp(checkInTime);
    const odooDatetime = toOdooDatetime(parsedDate);

    // Odoo 18 expects vals as part of args, not kwargs
    const result = await callOdooKw(
      "hr.attendance",
      "write",
      [[attendanceId], { check_in: odooDatetime }]  // Pass vals in args
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
  checkOutTime: string | Date
): Promise<boolean> {
  try {
    const parsedDate = parseUtcTimestamp(checkOutTime);
    const odooDatetime = toOdooDatetime(parsedDate);

    // Odoo 18 expects vals as part of args, not kwargs
    const result = await callOdooKw(
      "hr.attendance",
      "write",
      [[attendanceId], { check_out: odooDatetime }]  // Pass vals in args
    );
    logger.info(`Updated Odoo attendance ${attendanceId} check_out to ${odooDatetime}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update check_out for attendance ${attendanceId}: ${err}`);
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
  openingPcf: number
): Promise<boolean> {
  try {
    // First, search for the POS session by x_pos_name
    const searchResult = (await callOdooKw(
      "pos.session",
      "search_read",
      [],
      {
        domain: [["x_pos_name", "=", posSessionName]],
        fields: ["id", "x_pos_name", "x_opening_pcf"],
        limit: 1,
      }
    )) as Array<{ id: number; x_pos_name: string; x_opening_pcf: number }>;

    if (!searchResult || searchResult.length === 0) {
      logger.warn(`POS session not found: ${posSessionName}`);
      return false;
    }

    const sessionId = searchResult[0].id;

    // Update the opening_pcf field
    const result = await callOdooKw(
      "pos.session",
      "write",
      [[sessionId], { x_opening_pcf: openingPcf }]
    );

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
  closingPcf: number
): Promise<boolean> {
  try {
    // Search for the POS session with state='opening_control' and company_id
    const searchResult = (await callOdooKw(
      "pos.session",
      "search_read",
      [],
      {
        domain: [
          ["state", "=", "opening_control"],
          ["company_id", "=", companyId],
        ],
        fields: ["id", "name", "state", "company_id", "x_closing_pcf"],
        limit: 1,
      }
    )) as Array<{ id: number; name: string; state: string; company_id: number; x_closing_pcf: number }>;

    if (!searchResult || searchResult.length === 0) {
      logger.warn(`POS session not found for company ${companyId} with state opening_control`);
      return false;
    }

    const sessionId = searchResult[0].id;
    const sessionName = searchResult[0].name;

    // Update the closing_pcf field
    const result = await callOdooKw(
      "pos.session",
      "write",
      [[sessionId], { x_closing_pcf: closingPcf }]
    );

    logger.info(`Updated POS session ${sessionName} (ID: ${sessionId}) closing_pcf to ${closingPcf}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update closing_pcf for company ${companyId}: ${err}`);
    throw err;
  }
}

/**
 * Search for work entries by employee and date
 * @param employeeId - The Odoo employee ID
 * @param date - The date to search for (YYYY-MM-DD format)
 */
export async function searchWorkEntriesByEmployeeAndDate(
  employeeId: number,
  date: string
): Promise<unknown> {
  return await callOdooKw(
    "hr.work.entry",
    "search_read",
    [],
    {
      domain: [
        ["employee_id", "=", employeeId],
        ["date_start", ">=", `${date} 00:00:00`],
        ["date_start", "<=", `${date} 23:59:59`],
      ],
      fields: ["id", "employee_id", "date_start", "date_stop", "state"],
      order: "date_start desc",
      limit: 5,
    }
  );
}

/**
 * Search for work entries by attendance_id
 * @param attendanceId - The Odoo attendance ID
 */
export async function searchWorkEntriesByAttendanceId(
  attendanceId: number
): Promise<unknown> {
  return await callOdooKw(
    "hr.work.entry",
    "search_read",
    [],
    {
      domain: [
        ["attendance_id", "=", attendanceId],
      ],
      fields: ["id", "employee_id", "attendance_id", "date_start", "date_stop", "state"],
      limit: 5,
    }
  );
}

/**
 * Updates the date_start for an hr.work.entry record
 * @param workEntryId - The Odoo work entry ID
 * @param dateStart - The new date_start datetime
 * @returns True if successful
 */
export async function updateWorkEntryDateStart(
  workEntryId: number,
  dateStart: string | Date
): Promise<boolean> {
  try {
    const parsedDate = parseUtcTimestamp(dateStart);
    const odooDatetime = toOdooDatetime(parsedDate);

    const result = await callOdooKw(
      "hr.work.entry",
      "write",
      [[workEntryId], { date_start: odooDatetime }]
    );

    logger.info(`Updated hr.work.entry ${workEntryId} date_start to ${odooDatetime}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update date_start for work entry ${workEntryId}: ${err}`);
    throw err;
  }
}

/**
 * Updates the date_stop for an hr.work.entry record
 * @param workEntryId - The Odoo work entry ID
 * @param dateStop - The new date_stop datetime
 * @returns True if successful
 */
export async function updateWorkEntryDateStop(
  workEntryId: number,
  dateStop: string | Date
): Promise<boolean> {
  try {
    const parsedDate = parseUtcTimestamp(dateStop);
    const odooDatetime = toOdooDatetime(parsedDate);

    const result = await callOdooKw(
      "hr.work.entry",
      "write",
      [[workEntryId], { date_stop: odooDatetime }]
    );

    logger.info(`Updated hr.work.entry ${workEntryId} date_stop to ${odooDatetime}`);
    return result === true;
  } catch (err) {
    logger.error(`Failed to update date_stop for work entry ${workEntryId}: ${err}`);
    throw err;
  }
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
  const segment = String(employeeNumber).padStart(3, "0");
  return `${odooBranchId - 1}${segment}`;
}

export function formatEmployeeDisplayName(
  odooBranchId: number,
  employeeNumber: number,
  firstName: string,
  lastName: string
): string {
  const fullName = `${firstName} ${lastName}`.trim();
  return `${formatBranchEmployeeCode(odooBranchId, employeeNumber)} - ${fullName}`;
}

export async function createOrUpdateEmployeeForRegistration(input: {
  companyId: number;
  name: string;
  workEmail: string;
  pin: string;
  barcode: string;
  websiteKey: string;
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

  let existing = partner
    ? await listEmployeesLinkedToPartner(partner.id, input.companyId)
    : [];
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
    await withRetry(() => callOdooKw('hr.employee', 'write', [[existing[0].id], payload]).then(() => undefined));
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
  const employeeId = (await withRetry(() =>
    callOdooKw('hr.employee', 'create', [payload]) as Promise<number>,
  )) as number;
  return employeeId;
}

async function mergePartnerChunk(chunkIds: number[], destinationPartnerId: number): Promise<void> {
  try {
    const wizardId = (await callOdooKw('base.partner.merge.automatic.wizard', 'create', [{
      partner_ids: [[6, 0, chunkIds]],
      dst_partner_id: destinationPartnerId,
    }])) as number;
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
  const contacts = (await callOdooKw(
    'res.partner',
    'search_read',
    [],
    {
      domain: [['email', '=', input.email], ['active', '=', true]],
      fields: ['id', 'company_id', 'active'],
      order: 'id asc',
      limit: 200,
    },
  )) as Array<{ id: number; company_id?: [number, string] | false; active?: boolean }>;

  if (!contacts.length) {
    return null;
  }

  const mainCompanyContact = contacts.find((contact) => Array.isArray(contact.company_id) && contact.company_id[0] === input.mainCompanyId);
  let canonicalId = mainCompanyContact?.id ?? contacts[0].id;
  const otherIds = contacts.filter((contact) => contact.id !== canonicalId).map((contact) => contact.id);

  while (otherIds.length > 0) {
    const chunk = otherIds.splice(0, 2);
    await withRetry(() => mergePartnerChunk([canonicalId, ...chunk], canonicalId));
  }

  const canonicalLookup = (await callOdooKw(
    'res.partner',
    'search_read',
    [],
    {
      domain: [['id', '=', canonicalId]],
      fields: ['id'],
      limit: 1,
    },
  )) as Array<{ id: number }>;
  if (canonicalLookup.length === 0) {
    const refreshed = (await callOdooKw(
      'res.partner',
      'search_read',
      [],
      {
        domain: [['email', '=', input.email], ['active', '=', true]],
        fields: ['id', 'company_id'],
        order: 'id asc',
        limit: 1,
      },
    )) as Array<{ id: number }>;
    if (refreshed.length > 0) {
      canonicalId = refreshed[0].id;
    }
  }

  await callOdooKw('res.partner', 'write', [[canonicalId], {
    company_id: false,
    x_website_key: input.websiteKey,
    name: formatEmployeeDisplayName(
      input.mainCompanyId,
      input.employeeNumber,
      input.firstName,
      input.lastName,
    ),
    category_id: [[4, 3]],
  }]);
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

export async function syncAvatarToOdoo(input: {
  websiteUserKey: string | null;
  email: string | null;
  avatarUrl: string;
}): Promise<boolean> {
  try {
    const avatarBase64 = await fetchImageAsBase64(input.avatarUrl);
    let partnerSearchResult: Array<{ id: number }> = [];

    if (input.websiteUserKey) {
      partnerSearchResult = (await callOdooKw(
        'res.partner',
        'search_read',
        [],
        {
          domain: [['x_website_key', '=', input.websiteUserKey]],
          fields: ['id'],
          limit: 1,
        },
      )) as Array<{ id: number }>;
    }

    if (partnerSearchResult.length === 0 && input.email) {
      partnerSearchResult = (await callOdooKw(
        'res.partner',
        'search_read',
        [],
        {
          domain: [['email', '=', input.email]],
          fields: ['id'],
          limit: 1,
        },
      )) as Array<{ id: number }>;
    }

    if (partnerSearchResult.length === 0) {
      logger.warn(`No res.partner found for avatar sync (key=${input.websiteUserKey}, email=${input.email})`);
      return false;
    }

    const partnerId = partnerSearchResult[0].id;
    await callOdooKw('res.partner', 'write', [[partnerId], { image_1920: avatarBase64 }]);

    const employeeRows = (await callOdooKw(
      'hr.employee',
      'search_read',
      [],
      {
        domain: [['work_contact_id', '=', partnerId]],
        fields: ['id'],
        limit: 1000,
      },
    )) as Array<{ id: number }>;

    if (employeeRows.length > 0) {
      await callOdooKw(
        'hr.employee',
        'write',
        [employeeRows.map((row) => row.id), { image_1920: avatarBase64 }],
      );
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
 * 4. Updates each employee's work_email, private_email, private_phone, legal_name, birthday, sex
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
    address?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    firstName?: string;
    lastName?: string;
    employeeNumber?: number | null;
    mainCompanyId?: number | null;
  }
): Promise<boolean> {
  try {
    let partnerSearchResult:
      | Array<{ id: number; x_website_key?: string; email?: string }>
      | null = null;

    // 1. Search for res.partner by x_website_key or by email
    if (websiteUserKey) {
      partnerSearchResult = (await callOdooKw(
        "res.partner",
        "search_read",
        [],
        { domain: [["x_website_key", "=", websiteUserKey]], fields: ["id", "x_website_key", "email"] }
      )) as Array<{ id: number; x_website_key?: string; email?: string }>;
    }

    // Fallback: search by email if x_website_key not found
    if (!partnerSearchResult || partnerSearchResult.length === 0) {
      partnerSearchResult = (await callOdooKw(
        "res.partner",
        "search_read",
        [],
        { domain: [["email", "=", profileData.email]], fields: ["id", "x_website_key", "email"] }
      )) as Array<{ id: number; x_website_key?: string; email?: string }>;
    }

    if (!partnerSearchResult || partnerSearchResult.length === 0) {
      logger.warn(`No res.partner found for x_website_key: ${websiteUserKey} or email: ${profileData.email}`);
      return false;
    }

    const partnerId = partnerSearchResult[0].id;

    // 2. Update partner data
    const partnerUpdateData: Record<string, unknown> = { email: profileData.email };
    const shouldSyncName = typeof profileData.firstName === "string"
      || typeof profileData.lastName === "string";
    const canFormatPrefixedName = Number.isInteger(profileData.employeeNumber)
      && Number.isInteger(profileData.mainCompanyId);

    if (shouldSyncName && canFormatPrefixedName) {
      partnerUpdateData.name = formatEmployeeDisplayName(
        Number(profileData.mainCompanyId),
        Number(profileData.employeeNumber),
        profileData.firstName || "",
        profileData.lastName || "",
      );
    } else if (shouldSyncName) {
      logger.warn(
        {
          websiteUserKey,
          email: profileData.email,
          employeeNumber: profileData.employeeNumber,
          mainCompanyId: profileData.mainCompanyId,
        },
        "Skipping partner name update because prefixed-name context is missing",
      );
    }
    await callOdooKw(
      "res.partner",
      "write",
      [[partnerId], partnerUpdateData]
    );

    logger.info(`Updated res.partner ${partnerId} for profile sync`);

    // 3. Search for all hr.employee records linked to this partner
    const employeeSearchResult = (await callOdooKw(
      "hr.employee",
      "search_read",
      [],
      { domain: [["work_contact_id", "=", partnerId]], fields: ["id", "name", "company_id"] }
    )) as Array<{ id: number; name: string; company_id?: [number, string] | false }>;

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
      employeeUpdateData.private_phone = profileData.mobileNumber.replace(/^\+?63/, "");
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
    await callOdooKw("hr.employee", "write", [employeeIds, employeeUpdateData]);

    if (shouldSyncName) {
      if (!canFormatPrefixedName) {
        logger.warn(
          {
            websiteUserKey,
            email: profileData.email,
            employeeNumber: profileData.employeeNumber,
            mainCompanyId: profileData.mainCompanyId,
          },
          "Skipping employee name update because prefixed-name context is missing",
        );
      } else {
        const employeeNumber = Number(profileData.employeeNumber);
        const firstName = profileData.firstName || "";
        const lastName = profileData.lastName || "";

        for (const employee of employeeSearchResult) {
          const branchCompanyId = Array.isArray(employee.company_id)
            ? Number(employee.company_id[0])
            : Number(profileData.mainCompanyId);
          if (!Number.isInteger(branchCompanyId)) {
            logger.warn(
              { employeeId: employee.id, companyId: employee.company_id },
              "Skipping employee name update due to missing company_id",
            );
            continue;
          }

          await callOdooKw(
            "hr.employee",
            "write",
            [[employee.id], {
              name: formatEmployeeDisplayName(branchCompanyId, employeeNumber, firstName, lastName),
            }]
          );
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
  const partnerBankId = (await callOdooKw('res.partner.bank', 'create', [{
    bank_id: input.bankId,
    acc_number: input.accountNumber,
    partner_id: partnerId,
    allow_out_payment: true,
  }])) as number;

  const partnerEmployees = await listEmployeesLinkedToPartner(partnerId);
  const legacyEmployees = input.websiteUserKey
    ? await listLegacyEmployeesByWebsiteKey(input.websiteUserKey)
    : [];
  const employeeRows = dedupeEmployeeRows([...partnerEmployees, ...legacyEmployees]);

  const employeeIds = employeeRows.map((row) => row.id);
  if (employeeIds.length > 0) {
    await callOdooKw('hr.employee', 'write', [employeeIds, { bank_account_id: partnerBankId }]);
  }

  return { partnerId, partnerBankId, employeeIds };
}

async function readPartnerBankRecord(partnerBankId: number): Promise<{
  id: number;
  bankId: number;
  accountNumber: string;
} | null> {
  const partnerBankRows = (await callOdooKw(
    'res.partner.bank',
    'read',
    [[partnerBankId]],
    {
      fields: ['id', 'bank_id', 'acc_number'],
    },
  )) as Array<{ id: number; bank_id?: [number, string] | false; acc_number?: string | null }>;

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
    if (!Array.isArray(employee.bank_account_id) || Number(employee.bank_account_id[0]) <= 0) {
      continue;
    }
    const resolved = await readPartnerBankRecord(Number(employee.bank_account_id[0]));
    if (resolved) {
      selectedBank = resolved;
      break;
    }
  }

  if (!selectedBank && partnerId) {
    const partnerBanks = (await callOdooKw(
      'res.partner.bank',
      'search_read',
      [],
      {
        domain: [['partner_id', '=', partnerId]],
        fields: ['id', 'bank_id', 'acc_number', 'write_date'],
        order: 'write_date desc, id desc',
        limit: 1,
      },
    )) as Array<{ id: number; bank_id?: [number, string] | false; acc_number?: string | null }>;

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
    .filter((employee) =>
      !Array.isArray(employee.bank_account_id) || Number(employee.bank_account_id[0]) <= 0,
    )
    .map((employee) => employee.id);

  if (employeesMissingBank.length > 0) {
    try {
      await callOdooKw('hr.employee', 'write', [employeesMissingBank, { bank_account_id: selectedBank.id }]);
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
        'Resolved bank record but failed to attach bank_account_id to some linked employees',
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

/**
 * Gets the PIN code from Odoo hr.employee
 * @param websiteUserKey - The Omnilert user ID (UUID)
 * @param companyId - The Odoo company ID (branch ID)
 * @returns The PIN code string or null
 */
export async function getCompanyPin(websiteUserKey: string, companyId: number): Promise<string | null> {
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

/**
 * Updates planning.slot state (draft/published).
 */
export async function updatePlanningSlotState(
  planningSlotId: number,
  state: 'draft' | 'published',
): Promise<boolean> {
  try {
    const result = await callOdooKw(
      'planning.slot',
      'write',
      [[planningSlotId], { state }],
    );
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
    const result = await callOdooKw(
      'planning.slot',
      'write',
      [[planningSlotId], { resource_id: resourceId }],
    );
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
    const identityEmployees = (await listEmployeesForIdentity({
      websiteUserKey,
      companyId,
    })).employees;
    if (identityEmployees.length === 0) {
      logger.warn(`No hr.employee found for website key ${websiteUserKey} in company ${companyId}`);
      return null;
    }

    const employees = (await callOdooKw(
      'hr.employee',
      'search_read',
      [],
      {
        domain: [
          ['id', 'in', identityEmployees.map((employee) => employee.id)],
        ],
        fields: ['id', 'resource_id'],
        order: 'id asc',
        limit: 1,
      },
    )) as Array<{ id: number; resource_id?: [number, string] | false }>;

    if (!employees || employees.length === 0) return null;

    const resourceField = employees[0].resource_id;
    if (!Array.isArray(resourceField) || !resourceField[0]) {
      logger.warn(`No resource_id on hr.employee ${employees[0].id} for website key ${websiteUserKey}`);
      return null;
    }

    return Number(resourceField[0]);
  } catch (err) {
    logger.error(`Failed to resolve resource by website key ${websiteUserKey} and company ${companyId}: ${err}`);
    throw err;
  }
}

