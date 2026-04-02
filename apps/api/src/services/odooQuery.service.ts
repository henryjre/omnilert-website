import { callOdooKw } from './odoo.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OdooPlanningSlot {
  employee_id: [number, string];
  company_id?: [number, string] | false;
  start_datetime: string;
  end_datetime: string;
  allocated_hours: number;
}

export interface OdooAttendanceRecord {
  employee_id: [number, string];
  x_company_id: [number, string] | false;
  check_in: string;
  check_out: string | false;
}

export interface OdooPosOrder {
  amount_total: number;
  company_id: [number, string];
  date_order: string;
}

// ─── Odoo Employee ID resolution ─────────────────────────────────────────────

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
      fields: ['employee_id', 'company_id', 'start_datetime', 'end_datetime', 'allocated_hours'],
      limit: 10000,
    },
  )) as OdooPlanningSlot[];
}

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
      fields: ['employee_id', 'x_company_id', 'check_in', 'check_out'],
      limit: 10000,
    },
  )) as OdooAttendanceRecord[];
}

/**
 * Returns pos.order records for specific employees (by x_website_keys) within a date range.
 */
export async function getPosOrdersBatch(
  websiteKeys: string[],
  dateFrom: string,
  dateTo: string,
): Promise<OdooPosOrder[]> {
  if (websiteKeys.length === 0) return [];

  return (await callOdooKw(
    'pos.order',
    'search_read',
    [],
    {
      domain: [
        ['x_website_key', 'in', websiteKeys],
        ['date_order', '>=', dateFrom],
        ['date_order', '<=', dateTo],
        ['state', 'in', ['done', 'invoiced']],
      ],
      fields: ['amount_total', 'company_id', 'date_order', 'x_website_key' as any],
      limit: 50000,
    },
  )) as (OdooPosOrder & { x_website_key: string })[];
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

/**
 * Resolves Odoo hr.employee IDs for multiple website keys in one call.
 */
export async function getOdooEmployeeIdsByWebsiteKeys(websiteKeys: string[]): Promise<Array<{ id: number; website_key: string }>> {
  if (websiteKeys.length === 0) return [];

  const rows = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['x_website_key', 'in', websiteKeys]],
      fields: ['id', 'x_website_key'],
      limit: 10000,
    },
  )) as Array<{ id: number; x_website_key: string }>;

  return rows.map((r) => ({ id: r.id, website_key: r.x_website_key }));
}

/**
 * Legacy single-key version (for backward compatibility)
 */
export async function getOdooEmployeeIdsByWebsiteKey(websiteKey: string): Promise<number[]> {
  const res = await getOdooEmployeeIdsByWebsiteKeys([websiteKey]);
  return res.map((r) => r.id);
}

/**
 * Legacy single-key version (for backward compatibility)
 */
export async function getPosOrders(
  websiteKey: string,
  dateFrom: string,
  dateTo: string,
): Promise<OdooPosOrder[]> {
  return getPosOrdersBatch([websiteKey], dateFrom, dateTo);
}
