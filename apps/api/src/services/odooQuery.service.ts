import { callOdooKw } from './odoo.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OdooPlanningSlot {
  employee_id: [number, string];
  start_datetime: string;
  end_datetime: string;
  allocated_hours: number;
}

export interface OdooAttendanceRecord {
  employee_id: [number, string];
  check_in: string;
  check_out: string | false;
}

export interface OdooPosOrder {
  amount_total: number;
  company_id: [number, string];
  date_order: string;
}

// ─── Odoo Employee ID resolution ─────────────────────────────────────────────

/**
 * Returns all Odoo hr.employee IDs linked to a user's website key.
 * Covers both partner-linked and legacy x_website_key employees across all branches.
 */
export async function getOdooEmployeeIdsByWebsiteKey(websiteKey: string): Promise<number[]> {
  const rows = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['x_website_key', '=', websiteKey]],
      fields: ['id'],
      limit: 1000,
    },
  )) as Array<{ id: number }>;

  return rows.map((r) => r.id);
}

// ─── Planning Slots ───────────────────────────────────────────────────────────

/**
 * Returns planning.slot records for the given employee IDs within a date range.
 */
export async function getScheduledSlots(
  employeeOdooIds: number[],
  dateFrom: string,
  dateTo: string,
): Promise<OdooPlanningSlot[]> {
  if (employeeOdooIds.length === 0) return [];

  return (await callOdooKw(
    'planning.slot',
    'search_read',
    [],
    {
      domain: [
        ['employee_id', 'in', employeeOdooIds],
        ['start_datetime', '>=', dateFrom],
        ['end_datetime', '<=', dateTo],
      ],
      fields: ['employee_id', 'start_datetime', 'end_datetime', 'allocated_hours'],
      limit: 10000,
    },
  )) as OdooPlanningSlot[];
}

// ─── Attendance Records ───────────────────────────────────────────────────────

/**
 * Returns hr.attendance records for the given employee IDs within a date range.
 */
export async function getAttendanceRecords(
  employeeOdooIds: number[],
  dateFrom: string,
  dateTo: string,
): Promise<OdooAttendanceRecord[]> {
  if (employeeOdooIds.length === 0) return [];

  return (await callOdooKw(
    'hr.attendance',
    'search_read',
    [],
    {
      domain: [
        ['employee_id', 'in', employeeOdooIds],
        ['check_in', '>=', dateFrom],
        ['check_in', '<=', dateTo],
      ],
      fields: ['employee_id', 'check_in', 'check_out'],
      limit: 10000,
    },
  )) as OdooAttendanceRecord[];
}

// ─── POS Orders ───────────────────────────────────────────────────────────────

/**
 * Returns pos.order records for a specific employee (by x_website_key) within a date range.
 */
export async function getPosOrders(
  websiteKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<OdooPosOrder[]> {
  return (await callOdooKw(
    'pos.order',
    'search_read',
    [],
    {
      domain: [
        ['x_website_key', '=', websiteKey],
        ['date_order', '>=', dateFrom],
        ['date_order', '<=', dateTo],
        ['state', 'in', ['done', 'invoiced']],
      ],
      fields: ['amount_total', 'company_id', 'date_order'],
      limit: 50000,
    },
  )) as OdooPosOrder[];
}

/**
 * Returns all pos.order records for a branch (Odoo company ID) within a date range.
 * Used to calculate branch-level AOV benchmark.
 */
export async function getBranchPosOrders(
  odooBranchId: number,
  dateFrom: string,
  dateTo: string,
): Promise<{ amount_total: number }[]> {
  return (await callOdooKw(
    'pos.order',
    'search_read',
    [],
    {
      domain: [
        ['company_id', '=', odooBranchId],
        ['date_order', '>=', dateFrom],
        ['date_order', '<=', dateTo],
        ['state', 'in', ['done', 'invoiced']],
      ],
      fields: ['amount_total'],
      limit: 50000,
    },
  )) as { amount_total: number }[];
}
