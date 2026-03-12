export type StoreAuditType = 'customer_service' | 'compliance';
export type StoreAuditStatus = 'pending' | 'processing' | 'completed';

export interface StoreAuditOrderLine {
  product_name: string;
  qty: number;
  price_unit: number;
}

export interface StoreAuditPayment {
  id?: number;
  name: string;
  amount: number;
}

export interface StoreAudit {
  id: string;
  type: StoreAuditType;
  status: StoreAuditStatus;
  branch_id: string;
  branch_name?: string | null;
  auditor_user_id: string | null;
  auditor_name?: string | null;
  monetary_reward: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;

  css_odoo_order_id: number | null;
  css_pos_reference: string | null;
  css_session_name: string | null;
  css_company_name: string | null;
  css_cashier_name: string | null;
  css_cashier_user_key: string | null;
  css_date_order: string | null;
  css_amount_total: string | null;
  css_order_lines: StoreAuditOrderLine[] | null;
  css_payments: StoreAuditPayment[] | null;
  css_star_rating: number | null;
  css_audit_log: string | null;
  css_ai_report: string | null;

  comp_odoo_employee_id: number | null;
  comp_employee_name: string | null;
  comp_employee_avatar: string | null;
  comp_check_in_time: string | null;
  comp_extra_fields: Record<string, unknown> | null;
  comp_non_idle: boolean | null;
  comp_cellphone: boolean | null;
  comp_uniform: boolean | null;
  comp_hygiene: boolean | null;
  comp_sop: boolean | null;
}

export interface ListStoreAuditsResponse {
  items: StoreAudit[];
  page: number;
  pageSize: number;
  total: number;
  processingAuditId: string | null;
}
