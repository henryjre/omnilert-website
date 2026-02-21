import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  companySlug: z.string().min(1, 'Company is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const registerRequestSchema = z.object({
  companySlug: z.string().min(1, 'Company is required'),
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const approveRegistrationRequestSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role is required'),
  branchIds: z.array(z.string().uuid()).optional(),
});

export const rejectRegistrationRequestSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

const personalInformationChangesShape = {
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  email: z.string().email('Invalid email address').optional(),
  mobileNumber: z.string().max(50).optional(),
  legalName: z.string().max(255).optional(),
  birthday: z.string().nullable().optional(),
  gender: z.string().max(20).nullable().optional(),
};

export const submitPersonalInformationVerificationSchema = z
  .object(personalInformationChangesShape)
  .refine(
    (payload) =>
      payload.firstName !== undefined
      || payload.lastName !== undefined
      || payload.email !== undefined
      || payload.mobileNumber !== undefined
      || payload.legalName !== undefined
      || payload.birthday !== undefined
      || payload.gender !== undefined,
    'At least one field is required',
  );

export const approvePersonalInformationVerificationSchema = z.object(
  personalInformationChangesShape,
);

export const rejectVerificationSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;
export type ApproveRegistrationRequestInput = z.infer<typeof approveRegistrationRequestSchema>;
export type RejectRegistrationRequestInput = z.infer<typeof rejectRegistrationRequestSchema>;
export type SubmitPersonalInformationVerificationInput = z.infer<typeof submitPersonalInformationVerificationSchema>;
export type ApprovePersonalInformationVerificationInput = z.infer<typeof approvePersonalInformationVerificationSchema>;
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>;
