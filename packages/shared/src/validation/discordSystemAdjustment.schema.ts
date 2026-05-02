import { z } from 'zod';

export const discordSystemAdjustmentTypeSchema = z.enum([
  'token_pay',
  'payroll',
  'epi_adjustment',
]);

export const discordSystemAdjustmentDirectionSchema = z.enum([
  'addition',
  'deduction',
]);

export const createDiscordSystemAdjustmentSchema = z.object({
  discord_id: z.string().regex(/^\d{17,20}$/, 'discord_id must be a valid Discord snowflake'),
  adjustment_type: discordSystemAdjustmentTypeSchema,
  adjustment_direction: discordSystemAdjustmentDirectionSchema,
  amount: z.coerce
    .number()
    .positive()
    .finite()
    .refine((value) => Math.round(value * 100) === value * 100, {
      message: 'Max 2 decimal places',
    }),
  reason: z.string().trim().min(1, 'Reason is required').max(1000),
});

export type DiscordSystemAdjustmentTypeInput = z.infer<
  typeof discordSystemAdjustmentTypeSchema
>;
export type DiscordSystemAdjustmentDirectionInput = z.infer<
  typeof discordSystemAdjustmentDirectionSchema
>;
export type CreateDiscordSystemAdjustmentInput = z.infer<
  typeof createDiscordSystemAdjustmentSchema
>;
