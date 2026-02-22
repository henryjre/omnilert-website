import { z } from 'zod';

const uuid = z.string().uuid();

export const employeeProfilesListQuerySchema = z.object({
  status: z.enum(['all', 'active', 'inactive']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(12),
  search: z.string().trim().optional(),
});

export const updateEmployeeWorkInformationSchema = z.object({
  departmentId: uuid.nullable(),
  positionTitle: z.string().trim().max(255).nullable(),
  isActive: z.boolean(),
  dateStarted: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateStarted must be YYYY-MM-DD')
    .nullable(),
});

export type EmployeeProfilesListQueryInput = z.infer<typeof employeeProfilesListQuerySchema>;
export type UpdateEmployeeWorkInformationInput = z.infer<typeof updateEmployeeWorkInformationSchema>;
