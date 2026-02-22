import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  companySlug: z.string().min(1, 'Company is required').optional(),
});

export const switchCompanySchema = z.object({
  companySlug: z.string().min(1, 'Company is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const registerRequestSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(100),
  lastName: z.string().min(1, 'Last name is required').max(100),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const registrationCompanyAssignmentSchema = z.object({
  companyId: z.string().uuid('Invalid companyId'),
  branchIds: z.array(z.string().uuid('Invalid branchId')).min(1, 'At least one branch is required per company'),
});

export const approveRegistrationRequestSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role is required'),
  companyAssignments: z.array(registrationCompanyAssignmentSchema).min(1, 'At least one company assignment is required'),
  residentBranch: z.object({
    companyId: z.string().uuid('Invalid resident companyId'),
    branchId: z.string().uuid('Invalid resident branchId'),
  }),
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
  maritalStatus: z.string().max(50).optional(),
  address: z.string().max(500).optional(),
  sssNumber: z.string().max(100).optional(),
  tinNumber: z.string().max(100).optional(),
  pagibigNumber: z.string().max(100).optional(),
  philhealthNumber: z.string().max(100).optional(),
  emergencyContact: z.string().max(255).optional(),
  emergencyPhone: z.string().max(50).optional(),
  emergencyRelationship: z.string().max(100).optional(),
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
      || payload.gender !== undefined
      || payload.maritalStatus !== undefined
      || payload.address !== undefined
      || payload.sssNumber !== undefined
      || payload.tinNumber !== undefined
      || payload.pagibigNumber !== undefined
      || payload.philhealthNumber !== undefined
      || payload.emergencyContact !== undefined
      || payload.emergencyPhone !== undefined
      || payload.emergencyRelationship !== undefined,
    'At least one field is required',
  );

export const updateAccountEmailSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const submitBankInformationVerificationSchema = z.object({
  bankId: z.union([
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  accountNumber: z.string().min(1, 'Account number is required').max(255),
});

export const approvePersonalInformationVerificationSchema = z.object(
  personalInformationChangesShape,
);

export const rejectVerificationSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required').max(1000),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SwitchCompanyInput = z.infer<typeof switchCompanySchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type RegisterRequestInput = z.infer<typeof registerRequestSchema>;
export type ApproveRegistrationRequestInput = z.infer<typeof approveRegistrationRequestSchema>;
export type RejectRegistrationRequestInput = z.infer<typeof rejectRegistrationRequestSchema>;
export type SubmitPersonalInformationVerificationInput = z.infer<typeof submitPersonalInformationVerificationSchema>;
export type ApprovePersonalInformationVerificationInput = z.infer<typeof approvePersonalInformationVerificationSchema>;
export type RejectVerificationInput = z.infer<typeof rejectVerificationSchema>;
export type UpdateAccountEmailInput = z.infer<typeof updateAccountEmailSchema>;
export type SubmitBankInformationVerificationInput = z.infer<typeof submitBankInformationVerificationSchema>;
