export type StoreAuditType = 'customer_service' | 'service_crew_cctv';

export interface CssCriteriaScores {
  greeting: number;           // 1-5
  order_accuracy: number;     // 1-5
  suggestive_selling: number; // 1-5
  service_efficiency: number; // 1-5
  professionalism: number;    // 1-5
}
export type StoreAuditStatus = 'pending' | 'processing' | 'completed' | 'rejected';

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

export interface StoreAuditAttachment {
  id: string;
  store_audit_id: string;
  message_id: string | null;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

export interface StoreAuditMessage {
  id: string;
  store_audit_id: string;
  user_id: string;
  user_name?: string;
  user_avatar?: string;
  content: string;
  is_deleted: boolean;
  deleted_by: string | null;
  attachments: StoreAuditAttachment[];
  created_at: string;
  updated_at: string;
  is_edited: boolean;
}

export interface StoreAuditCompany {
  id: string;
  name: string;
  slug: string;
}

export interface StoreAudit {
  id: string;
  type: StoreAuditType;
  status: StoreAuditStatus;
  company?: StoreAuditCompany | null;
  branch_id: string;
  branch_name?: string | null;
  auditor_user_id: string | null;
  auditor_name?: string | null;
  monetary_reward: string;
  completed_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  processing_started_at: string | null;
  vn_requested: boolean;
  linked_vn_id: string | null;
  created_at: string;
  updated_at: string;

  css_odoo_order_id: number | null;
  css_pos_reference: string | null;
  css_session_name: string | null;
  css_company_name: string | null;
  css_cashier_name: string | null;
  css_cashier_user_key: string | null;
  audited_user_id: string | null;
  audited_user_key: string | null;
  audited_user_avatar_url?: string | null;
  css_date_order: string | null;
  css_amount_total: string | null;
  css_order_lines: StoreAuditOrderLine[] | null;
  css_payments: StoreAuditPayment[] | null;
  css_star_rating: number | null;
  css_criteria_scores: CssCriteriaScores | null;
  css_audit_log: string | null;
  css_ai_report: string | null;

  scc_odoo_employee_id: number | null;
  scc_employee_name: string | null;
  scc_productivity_rate: boolean | null;
  scc_uniform_compliance: boolean | null;
  scc_hygiene_compliance: boolean | null;
  scc_sop_compliance: boolean | null;
  scc_customer_interaction: number | null;
  scc_cashiering: number | null;
  scc_suggestive_selling_and_upselling: number | null;
  scc_service_efficiency: number | null;
  scc_ai_report?: string | null;
}

export interface ListStoreAuditsResponse {
  items: StoreAudit[];
  page: number;
  pageSize: number;
  total: number;
  processingAuditId: string | null;
}
