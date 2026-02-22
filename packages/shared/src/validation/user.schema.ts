import { z } from 'zod';

const uuid = z.string().uuid();
const companyAssignmentSchema = z.object({
  companyId: uuid,
  branchIds: z.array(uuid).min(1, 'At least one branch is required per company'),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  userKey: uuid,
  employeeNumber: z.number().int().positive().optional(),
  roleIds: z.array(uuid).min(1, 'At least one role is required'),
  companyAssignments: z.array(companyAssignmentSchema).min(1, 'At least one company assignment is required'),
});

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  userKey: uuid.optional(),
  employeeNumber: z.number().int().positive().optional(),
  isActive: z.boolean().optional(),
});

export const changeMyPasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6),
  currentRefreshToken: z.string().min(1),
});

export const assignUserCompanyAssignmentsSchema = z.object({
  companyAssignments: z.array(companyAssignmentSchema).min(1, 'At least one company assignment is required'),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangeMyPasswordInput = z.infer<typeof changeMyPasswordSchema>;
export type AssignUserCompanyAssignmentsInput = z.infer<typeof assignUserCompanyAssignmentsSchema>;
