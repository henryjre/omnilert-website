/**
 * Payslip status values.
 * - "pending"   : payslip period exists but no Odoo record has been generated yet
 * - "draft"     : Odoo payslip exists with state "draft"
 * - "completed" : Odoo payslip exists in any state other than draft or cancel
 */
export type PayslipStatus = "pending" | "draft" | "completed";

/**
 * Lightweight metadata item used in the payslip list.
 * Pending entries use a synthetic id of the form "pending-{companyId}-{cutoff}".
 */
export interface PayslipListItem {
  /** Odoo payslip ID as string, or "pending-{companyId}-{cutoff}" for ungenerated periods */
  id: string;
  /** Display name of the payslip */
  name: string;
  /** Period start date in YYYY-MM-DD format */
  date_from: string;
  /** Period end date in YYYY-MM-DD format */
  date_to: string;
  /** Raw Odoo state string (e.g. "draft", "done", "verify"); empty for pending stubs */
  odoo_state: string;
  /** Derived status for UI filtering */
  status: PayslipStatus;
  /** Odoo company ID (maps to odoo_branch_id on the Branch record) */
  company_id: number;
  /** Human-readable company/branch name */
  company_name: string;
  /** Odoo employee ID */
  employee_id: number;
  /** Employee display name */
  employee_name: string;
  /** 1 = 1st cutoff (1st–15th), 2 = 2nd cutoff (16th–last day) */
  cutoff: 1 | 2;
  /** True when this item represents a payslip that has not been generated in Odoo yet */
  is_pending: boolean;
  /** Computed net pay from Odoo. Present for real Odoo payslips; absent for pending stubs. */
  net_pay?: number;
}

/** Response shape for GET /dashboard/payslips */
export interface PayslipListResponse {
  items: PayslipListItem[];
}

/** Single salary line entry */
export interface PayslipSalaryLine {
  description: string;
  amount: number;
}

/** Single attendance row */
export interface PayslipAttendanceItem {
  name: string;
  days: number;
  hours: number;
  amount: number;
}

/**
 * Full payslip detail returned when a card is clicked.
 * Mirrors the transformation currently done in dashboard.controller.ts.
 */
export interface PayslipDetailResponse {
  /** Formatted period string, e.g. "Mar 01, 2026 to Mar 15, 2026" */
  period: string;
  employee: {
    name: string;
  };
  attendance: {
    items: PayslipAttendanceItem[];
    totalDays: number;
    totalHours: number;
    totalAmount: number;
  };
  salary: {
    taxable: PayslipSalaryLine[];
    nonTaxable: PayslipSalaryLine[];
    deductions: PayslipSalaryLine[];
  };
  netPay: number;
  status: PayslipStatus;
  is_pending: boolean;
}
