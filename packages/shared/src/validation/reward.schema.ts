import { z } from 'zod';

const uuid = z.string().uuid();

export const rewardRequestStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const createRewardRequestSchema = z.object({
  targetUserIds: z.array(uuid).min(1).max(250),
  epiDelta: z.coerce
    .number()
    .finite()
    .refine((v) => v !== 0, { message: 'EPI delta must be non-zero' })
    .refine((v) => Math.round(v * 100) === v * 100, { message: 'Max 2 decimal places' }),
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
});

export const rejectRewardRequestSchema = z.object({
  rejectionReason: z.string().trim().min(1, 'Rejection reason is required').max(1000),
});

export type RewardRequestStatusInput = z.infer<typeof rewardRequestStatusSchema>;
export type CreateRewardRequestInput = z.infer<typeof createRewardRequestSchema>;
export type RejectRewardRequestInput = z.infer<typeof rejectRewardRequestSchema>;
