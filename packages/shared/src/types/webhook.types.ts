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
export type AuditResultsWebhookOverallUnit = 'rating' | 'checks' | 'text';

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
  type: 'customer_service' | 'service_crew_cctv';
  type_label: 'Customer Service Audit' | 'Service Crew CCTV Audit';
  completed_at: string;
  observed_at: string | null;
  source_type: AuditResultsWebhookSourceType;
  source_reference: string;
}

export interface AuditResultsWebhookSummary {
  result_line: string;
  overall_value: number | null;
  overall_max: number | null;
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

export type CronJobNotificationEvent = 'cron_job.run';
export type CronJobNotificationStatus = 'success' | 'failed';
export type CronJobNotificationTrigger = 'scheduled' | 'startup' | 'manual';
export type CronJobNotificationFamily =
  | 'service_crew_cctv'
  | 'epi_snapshot'
  | 'peer_evaluation_expiry'
  | 'notification_retention'
  | 'shift_absence';

export interface CronJobNotificationJob {
  name: string;
  family: CronJobNotificationFamily;
  schedule: string;
  trigger: CronJobNotificationTrigger;
}

export interface CronJobNotificationRun {
  id: string;
  scheduled_for_key: string | null;
  scheduled_for_manila: string | null;
  source: CronJobNotificationTrigger;
  started_at: string;
  finished_at: string;
  duration_ms: number;
  attempt: number | null;
}

export interface CronJobNotificationResult {
  status: CronJobNotificationStatus;
  message: string;
  error_message: string | null;
}

export interface CronJobNotificationStats {
  processed: number | null;
  succeeded: number | null;
  failed: number | null;
  skipped: number | null;
}

export interface CronJobNotificationMeta {
  timezone: 'Asia/Manila';
}

export interface CronJobNotificationPayload {
  event: CronJobNotificationEvent;
  version: 1;
  environment: 'development' | 'production' | 'test';
  sent_at: string;
  job: CronJobNotificationJob;
  run: CronJobNotificationRun;
  result: CronJobNotificationResult;
  stats: CronJobNotificationStats;
  meta: CronJobNotificationMeta;
}
