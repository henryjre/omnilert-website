import type { CssCriteriaScores, StoreAuditType } from './storeAudit.types.js';

export type AccountAuditResultUnit = 'rating' | 'checks';
export type AccountAuditResultTypeLabel = 'Customer Service Audit' | 'Compliance Audit';

export interface AccountAuditResultBranch {
  id: string;
  name: string;
}

export interface AccountAuditResultSummary {
  result_line: string;
  overall_value: number;
  overall_max: number;
  overall_unit: AccountAuditResultUnit;
}

export interface AccountAuditResultAttachment {
  id: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: string;
}

export interface AccountAuditTrailEntry {
  id: string;
  content: string;
  created_at: string;
  attachments: AccountAuditResultAttachment[];
}

export interface AccountCssAuditResult {
  criteria_scores: CssCriteriaScores | null;
  overall_rating: number | null;
}

export interface AccountComplianceAuditResult {
  checks: {
    productivity_rate: boolean | null;
    uniform: boolean | null;
    hygiene: boolean | null;
    sop: boolean | null;
  };
  passed_count: number;
  total_checks: 4;
}

export interface AccountAuditResultListItem {
  id: string;
  type: StoreAuditType;
  type_label: AccountAuditResultTypeLabel;
  branch: AccountAuditResultBranch;
  completed_at: string;
  observed_at: string | null;
  summary: AccountAuditResultSummary;
}

export interface AccountAuditResultDetail extends AccountAuditResultListItem {
  ai_report: string | null;
  audit_trail: AccountAuditTrailEntry[];
  css_result: AccountCssAuditResult | null;
  compliance_result: AccountComplianceAuditResult | null;
}

export interface ListAccountAuditResultsResponse {
  items: AccountAuditResultListItem[];
  page: number;
  pageSize: number;
  total: number;
}
