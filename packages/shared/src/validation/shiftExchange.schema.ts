import { z } from 'zod';

const uuid = z.string().uuid();

export const listShiftExchangeOptionsSchema = z.object({
  fromShiftId: uuid,
});

export const createShiftExchangeSchema = z.object({
  fromShiftId: uuid,
  toShiftId: uuid,
  toCompanyId: uuid,
});

export const respondShiftExchangeSchema = z.object({
  action: z.enum(['accept', 'reject']),
  reason: z.string().trim().max(1000).optional(),
});

export const rejectShiftExchangeSchema = z.object({
  reason: z.string().trim().min(1, 'Rejection reason is required').max(1000),
});

export type ListShiftExchangeOptionsInput = z.infer<typeof listShiftExchangeOptionsSchema>;
export type CreateShiftExchangeInput = z.infer<typeof createShiftExchangeSchema>;
export type RespondShiftExchangeInput = z.infer<typeof respondShiftExchangeSchema>;
export type RejectShiftExchangeInput = z.infer<typeof rejectShiftExchangeSchema>;
