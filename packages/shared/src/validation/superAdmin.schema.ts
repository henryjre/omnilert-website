import { z } from 'zod';

export const superAdminBootstrapSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name must not exceed 255 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const superAdminLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type SuperAdminBootstrapInput = z.infer<typeof superAdminBootstrapSchema>;
export type SuperAdminLoginInput = z.infer<typeof superAdminLoginSchema>;
