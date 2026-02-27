import { z } from 'zod';

const uuid = z.string().uuid();
const employmentStatusSchema = z.enum(['active', 'resigned', 'inactive', 'suspended']);

export const employeeProfilesListQuerySchema = z.object({
  status: z.enum(['all', 'active', 'resigned', 'inactive', 'suspended']).optional().default('all'),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(12),
  search: z.string().trim().optional(),
  departmentId: uuid.optional(),
  roleIdsCsv: z.string().trim().optional(),
  sortBy: z.enum(['date_started', 'days_of_employment']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const updateEmployeeWorkInformationSchema = z.object({
  departmentId: uuid.nullable(),
  positionTitle: z.string().trim().max(255).nullable(),
  employmentStatus: employmentStatusSchema.optional(),
  isActive: z.boolean().optional(),
  companyAssignments: z.array(z.object({
    companyId: uuid,
    branchIds: z.array(uuid).min(1),
  })).optional(),
  residentBranch: z.object({
    companyId: uuid,
    branchId: uuid,
  }).nullable().optional(),
  dateStarted: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'dateStarted must be YYYY-MM-DD')
    .nullable(),
}).refine((value) => value.employmentStatus !== undefined || value.isActive !== undefined, {
  message: 'employmentStatus or isActive is required',
  path: ['employmentStatus'],
});

export type EmployeeProfilesListQueryInput = z.infer<typeof employeeProfilesListQuerySchema>;
export type UpdateEmployeeWorkInformationInput = z.infer<typeof updateEmployeeWorkInformationSchema>;
