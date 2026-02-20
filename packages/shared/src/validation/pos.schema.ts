import { z } from 'zod';

export const odooPosVerificationPayloadSchema = z.object({
  branchId: z.string().min(1),
  transactionId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  amount: z.number().optional(),
  data: z.record(z.unknown()).optional(),
});

export const odooPosSessionPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  name: z.string().min(1),
  display_name: z.string().optional(),
  company_id: z.number(),
  cash_register_balance_start: z.number().optional(),
  cash_register_balance_end: z.number().optional(),
  opening_notes: z.string().optional(),
  x_closing_pcf: z.number().optional(),
  x_company_name: z.string().optional(),
});

export const confirmRejectSchema = z.object({
  notes: z.string().max(1000).optional(),
  // Optional breakdown items when confirming CF/PCF verifications
  breakdownItems: z.array(
    z.object({
      denomination: z.number().positive(),
      quantity: z.number().int().min(0),
    }),
  ).optional(),
});

export const breakdownItemSchema = z.object({
  denomination: z.number().positive(),
  quantity: z.number().int().min(0),
});

export const submitBreakdownSchema = z.object({
  items: z.array(breakdownItemSchema).min(1),
  notes: z.string().max(1000).optional(),
});

export const odooDiscountOrderPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  pos_reference: z.string(),
  date_order: z.string(),
  cashier: z.string(),
  amount_total: z.number(),
  x_session_name: z.string().optional(),
  x_company_name: z.string().optional(),
  x_website_key: z.string().uuid().optional(),
  x_order_lines: z.array(z.object({
    product_id: z.number().optional(),
    product_name: z.string(),
    qty: z.number(),
    uom_name: z.string(),
    price_unit: z.number(),
    discount: z.number().optional(),
  })),
});

export const odooRefundOrderPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  pos_reference: z.string(),
  date_order: z.string(),
  cashier: z.string(),
  amount_total: z.number(),
  x_session_name: z.string().optional(),
  x_company_name: z.string().optional(),
  x_website_key: z.string().uuid().optional(),
  x_order_lines: z.array(z.object({
    product_id: z.number().optional(),
    product_name: z.string(),
    qty: z.number(),
    uom_name: z.string(),
    price_unit: z.number(),
    discount: z.number().optional(),
  })),
});

export const odooNonCashOrderPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  pos_reference: z.string(),
  date_order: z.string(),
  cashier: z.string(),
  amount_total: z.number(),
  x_session_name: z.string().optional(),
  x_company_name: z.string().optional(),
  x_website_key: z.string().uuid().optional(),
  x_order_lines: z.array(z.object({
    product_id: z.number().optional(),
    product_name: z.string(),
    qty: z.number(),
    uom_name: z.string(),
    price_unit: z.number(),
    discount: z.number().optional(),
  })),
  x_payments: z.array(z.object({
    id: z.number().optional(),
    name: z.string(),
    amount: z.number(),
  })).optional(),
});

export const odooTokenPayOrderPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  pos_reference: z.string(),
  date_order: z.string(),
  cashier: z.string(),
  amount_total: z.number(),
  x_session_name: z.string().optional(),
  x_company_name: z.string().optional(),
  x_website_key: z.string().uuid().optional(),
  x_customer_website_key: z.string().uuid().optional(),
  x_discord_id: z.unknown().optional(),
  x_order_lines: z.array(z.object({
    product_id: z.number().optional(),
    product_name: z.string(),
    qty: z.number(),
    uom_name: z.string(),
    price_unit: z.number(),
    discount: z.number().optional(),
  })),
});

export const odooISPEPurchaseOrderPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  name: z.string(),
  date_approve: z.string().optional(),
  partner_ref: z.string().optional(),
  amount_total: z.number(),
  x_pos_session: z.string().optional(),
  x_order_line_details: z.array(z.object({
    product_id: z.number().optional(),
    product_name: z.string(),
    quantity: z.number(),
    uom_name: z.string(),
    price_unit: z.number(),
  })).optional(),
});

export const odooRegisterCashPayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  company_id: z.number(),
  amount_total: z.number(),
  create_date: z.string().optional(),
  payment_ref: z.string(),
});

const odooOrderLineSchema = z.object({
  order_id: z.number().optional(),
  product_id: z.number().optional(),
  product_name: z.string(),
  qty: z.number(),
  uom_name: z.string().optional(),
  price_unit: z.number(),
  discount: z.number().optional(),
});

export const odooPosSessionClosePayloadSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().optional(),
  _model: z.string().optional(),
  id: z.number().optional(),
  name: z.string().min(1),
  display_name: z.string().optional(),
  company_id: z.number(),
  cash_register_balance_start: z.number().optional(),
  cash_register_balance_end: z.number().optional(),
  cash_register_balance_end_real: z.number().optional(),
  cash_register_difference: z.number().optional(),
  closing_notes: z.string().optional(),
  x_company_name: z.string().optional(),
  x_opening_pcf: z.number().optional(),
  x_ispe_total: z.number().optional(),
  x_pos_name: z.string().optional(),
  x_discount_orders: z.array(odooOrderLineSchema).optional(),
  x_refund_orders: z.array(odooOrderLineSchema).optional(),
  x_payment_methods: z.array(z.object({
    amount: z.number(),
    payment_method_id: z.number(),
    payment_method_name: z.string(),
  })).optional(),
  x_statement_lines: z.array(z.object({
    amount: z.number(),
    payment_ref: z.string(),
  })).optional(),
});

export type OdooPosSessionClosePayloadInput = z.infer<typeof odooPosSessionClosePayloadSchema>;
export type OdooPosVerificationPayloadInput = z.infer<typeof odooPosVerificationPayloadSchema>;
export type OdooPosSessionPayloadInput = z.infer<typeof odooPosSessionPayloadSchema>;
export type OdooDiscountOrderPayloadInput = z.infer<typeof odooDiscountOrderPayloadSchema>;
export type OdooRefundOrderPayloadInput = z.infer<typeof odooRefundOrderPayloadSchema>;
export type OdooNonCashOrderPayloadInput = z.infer<typeof odooNonCashOrderPayloadSchema>;
export type OdooTokenPayOrderPayloadInput = z.infer<typeof odooTokenPayOrderPayloadSchema>;
export type OdooISPEPurchaseOrderPayloadInput = z.infer<typeof odooISPEPurchaseOrderPayloadSchema>;
export type OdooRegisterCashPayloadInput = z.infer<typeof odooRegisterCashPayloadSchema>;
export type ConfirmRejectInput = z.infer<typeof confirmRejectSchema>;
export type BreakdownItemInput = z.infer<typeof breakdownItemSchema>;
export type SubmitBreakdownInput = z.infer<typeof submitBreakdownSchema>;
