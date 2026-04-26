import { z } from 'zod';

const discordRoleIdSchema = z
  .string()
  .regex(/^\d{17,20}$/, 'discord_id must be a valid Discord snowflake')
  .nullable()
  .optional();

export const createRoleSchema = z.object({
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(100, 'Role name must not exceed 100 characters'),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a valid hex color')
    .optional(),
  priority: z.number().int().min(0).max(99),
  discord_id: discordRoleIdSchema,
  permissionIds: z.array(z.string().uuid()).min(1, 'At least one permission is required'),
});

export const updateRoleSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  priority: z.number().int().min(0).max(99).optional(),
  discord_id: discordRoleIdSchema,
});

export const assignPermissionsSchema = z.object({
  permissionIds: z.array(z.string().uuid()),
});

export const assignRolesSchema = z.object({
  roleIds: z.array(z.string().uuid()),
});

export type CreateRoleInput = z.infer<typeof createRoleSchema>;
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>;
export type AssignPermissionsInput = z.infer<typeof assignPermissionsSchema>;
export type AssignRolesInput = z.infer<typeof assignRolesSchema>;
