import { z } from 'zod';

const uuid = z.string().uuid();
const amountSchema = z.coerce.number().positive().finite();

export const payrollAdjustmentManagerStatusSchema = z.enum([
  'pending',
  'processing',
  'employee_approval',
  'in_progress',
  'completed',
  'rejected',
]);

export const payrollAdjustmentEmployeeStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
]);

export const payrollAdjustmentTypeSchema = z.enum(['issuance', 'deduction']);

export const createPayrollAdjustmentRequestSchema = z.object({
  branchId: uuid,
  targetUserIds: z.array(uuid).min(1).max(250),
  type: payrollAdjustmentTypeSchema,
  totalAmount: amountSchema,
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
  payrollPeriods: z.coerce.number().int().min(1).max(120).default(1),
});

export const updatePayrollAdjustmentProcessingSchema = z.object({
  targetUserIds: z.array(uuid).min(1).max(250),
  totalAmount: amountSchema,
  payrollPeriods: z.coerce.number().int().min(1).max(120),
});

export const rejectPayrollAdjustmentSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(1000),
});

export const authorizePayrollAdjustmentSchema = z.object({}).strict();

export const payrollAdjustmentCompleteWebhookSchema = z.object({
  _action: z.string().optional(),
  _id: z.number().int().positive(),
  _model: z.literal('hr.salary.attachment'),
});

export type PayrollAdjustmentManagerStatusInput = z.infer<
  typeof payrollAdjustmentManagerStatusSchema
>;
export type PayrollAdjustmentEmployeeStatusInput = z.infer<
  typeof payrollAdjustmentEmployeeStatusSchema
>;
export type PayrollAdjustmentTypeInput = z.infer<typeof payrollAdjustmentTypeSchema>;
export type CreatePayrollAdjustmentRequestInput = z.infer<
  typeof createPayrollAdjustmentRequestSchema
>;
export type UpdatePayrollAdjustmentProcessingInput = z.infer<
  typeof updatePayrollAdjustmentProcessingSchema
>;
export type RejectPayrollAdjustmentInput = z.infer<
  typeof rejectPayrollAdjustmentSchema
>;
export type AuthorizePayrollAdjustmentInput = z.infer<
  typeof authorizePayrollAdjustmentSchema
>;
export type PayrollAdjustmentCompleteWebhookInput = z.infer<
  typeof payrollAdjustmentCompleteWebhookSchema
>;
