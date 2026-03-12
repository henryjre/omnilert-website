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
