import { z } from 'zod';
const hexColorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Theme color must be a valid hex color');
const companyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{2,10}$/, 'Company code must be 2-10 uppercase letters/numbers');

export const createCompanySchema = z.object({
  name: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255, 'Company name must not exceed 255 characters'),
  odooApiKey: z.string().optional(),
  companyCode: companyCodeSchema.optional(),
  adminEmail: z.string().email('Invalid admin email address'),
  adminPassword: z.string().min(6, 'Admin password must be at least 6 characters'),
  adminFirstName: z.string().min(1, 'Admin first name is required'),
  adminLastName: z.string().min(1, 'Admin last name is required'),
});

export const createCompanyBySuperAdminSchema = z.object({
  name: z
    .string()
    .min(2, 'Company name must be at least 2 characters')
    .max(255, 'Company name must not exceed 255 characters'),
  odooApiKey: z.string().optional(),
  companyCode: companyCodeSchema.optional(),
});

export const updateCompanySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  isActive: z.boolean().optional(),
  odooApiKey: z.string().optional(),
  themeColor: hexColorSchema.optional(),
  companyCode: companyCodeSchema.optional(),
});

export const deleteCurrentCompanySchema = z.object({
  companyName: z
    .string()
    .min(2, 'Company name confirmation is required')
    .max(255, 'Company name confirmation must not exceed 255 characters'),
  superAdminEmail: z.string().email('Invalid super admin email address'),
  superAdminPassword: z.string().min(1, 'Super admin password is required'),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;
export type CreateCompanyBySuperAdminInput = z.infer<typeof createCompanyBySuperAdminSchema>;
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;
export type DeleteCurrentCompanyInput = z.infer<typeof deleteCurrentCompanySchema>;
