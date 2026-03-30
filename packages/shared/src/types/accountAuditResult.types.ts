export type AccountAuditResultUnit = 'text';
export type AccountAuditResultTypeLabel = 'Service Crew CCTV Audit';

export interface AccountAuditResultBranch {
  id: string;
  name: string;
}

export interface AccountAuditResultCompany {
  id: string;
  name: string;
  slug: string;
}

export interface AccountAuditResultSummary {
  result_line: string;
  overall_value: number | null;
  overall_max: number | null;
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

export interface AccountServiceCrewCctvAuditResult {
  compliance_criteria: {
    productivity_rate: boolean | null;
    uniform_compliance: boolean | null;
    hygiene_compliance: boolean | null;
    sop_compliance: boolean | null;
  };
  customer_service_criteria: {
    customer_interaction: number | null;
    cashiering: number | null;
    suggestive_selling_and_upselling: number | null;
    service_efficiency: number | null;
  };
}

export interface AccountAuditResultListItem {
  id: string;
  type: 'service_crew_cctv';
  type_label: AccountAuditResultTypeLabel;
  company: AccountAuditResultCompany;
  branch: AccountAuditResultBranch;
  completed_at: string;
  observed_at: string | null;
  summary: AccountAuditResultSummary;
}

export interface AccountAuditResultDetail extends AccountAuditResultListItem {
  ai_report: string | null;
  audit_trail: AccountAuditTrailEntry[];
  scc_result: AccountServiceCrewCctvAuditResult;
}

export interface ListAccountAuditResultsResponse {
  items: AccountAuditResultListItem[];
  page: number;
  pageSize: number;
  total: number;
}
