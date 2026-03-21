export interface OdooPosVerificationPayload {
  branchId: string;
  transactionId: string;
  title: string;
  description?: string;
  amount?: number;
  data?: Record<string, unknown>;
}

export interface OdooPosSessionPayload {
  _action?: string;
  _id?: number;
  _model?: string;
  id?: number;
  name: string;
  display_name?: string;
  company_id: number;
  cash_register_balance_start?: number;
  cash_register_balance_end?: number;
  opening_notes?: string;
  x_closing_pcf?: number;
  x_company_name?: string;
}

export interface OdooPosOrderPayload {
  id?: number;
  company_id: number;
  pos_reference: string;
  date_order: string;
  cashier: string;
  amount_total: number;
  x_session_name?: string;
  x_company_name?: string;
  x_website_key?: string;
  x_order_lines: Array<{
    product_name: string;
    qty: number;
    price_unit: number;
  }>;
  x_payments?: Array<{
    id?: number;
    name: string;
    amount: number;
  }>;
}

export type AuditResultsWebhookEvent = 'store_audit.completed';
export type AuditResultsWebhookSourceType = 'pos_order' | 'attendance';
export type AuditResultsWebhookOverallUnit = 'rating' | 'checks';

export interface AuditResultsWebhookRecipient {
  user_id: string;
  user_key: string;
  email: string;
  full_name: string;
}

export interface AuditResultsWebhookCompany {
  id: string;
  name: string;
}

export interface AuditResultsWebhookBranch {
  id: string;
  name: string;
}

export interface AuditResultsWebhookAudit {
  id: string;
  type: 'customer_service' | 'compliance';
  type_label: 'Customer Service Audit' | 'Compliance Audit';
  completed_at: string;
  observed_at: string | null;
  source_type: AuditResultsWebhookSourceType;
  source_reference: string;
}

export interface AuditResultsWebhookSummary {
  result_line: string;
  overall_value: number;
  overall_max: number;
  overall_unit: AuditResultsWebhookOverallUnit;
}

export interface AuditResultsWebhookPayload {
  event: AuditResultsWebhookEvent;
  version: 1;
  recipient: AuditResultsWebhookRecipient;
  company: AuditResultsWebhookCompany;
  branch: AuditResultsWebhookBranch;
  audit: AuditResultsWebhookAudit;
  summary: AuditResultsWebhookSummary;
}
