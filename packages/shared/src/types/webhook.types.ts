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
