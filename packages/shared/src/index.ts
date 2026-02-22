// Types
export type * from './types/api.types.js';
export type * from './types/branch.types.js';
export type * from './types/company.types.js';
export type * from './types/pos.types.js';
export type * from './types/role.types.js';
export type * from './types/socket.types.js';
export type * from './types/user.types.js';
export type * from './types/webhook.types.js';

// Constants
export { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_CATEGORIES } from './constants/permissions.js';
export type { PermissionKey } from './constants/permissions.js';
export {
  SYSTEM_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_COLORS,
  DEFAULT_ROLE_PRIORITIES,
} from './constants/roles.js';
export type { SystemRoleName } from './constants/roles.js';

// Validation schemas
export {
  loginSchema,
  switchCompanySchema,
  refreshTokenSchema,
  registerRequestSchema,
  approveRegistrationRequestSchema,
  rejectRegistrationRequestSchema,
  submitPersonalInformationVerificationSchema,
  approvePersonalInformationVerificationSchema,
  rejectVerificationSchema,
  updateAccountEmailSchema,
  submitBankInformationVerificationSchema,
} from './validation/auth.schema.js';
export type {
  LoginInput,
  SwitchCompanyInput,
  RefreshTokenInput,
  RegisterRequestInput,
  ApproveRegistrationRequestInput,
  RejectRegistrationRequestInput,
  SubmitPersonalInformationVerificationInput,
  ApprovePersonalInformationVerificationInput,
  RejectVerificationInput,
  UpdateAccountEmailInput,
  SubmitBankInformationVerificationInput,
} from './validation/auth.schema.js';
export { upsertDepartmentSchema } from './validation/department.schema.js';
export type { UpsertDepartmentInput } from './validation/department.schema.js';
export {
  employeeProfilesListQuerySchema,
  updateEmployeeWorkInformationSchema,
} from './validation/employeeProfile.schema.js';
export type {
  EmployeeProfilesListQueryInput,
  UpdateEmployeeWorkInformationInput,
} from './validation/employeeProfile.schema.js';
export {
  listShiftExchangeOptionsSchema,
  createShiftExchangeSchema,
  respondShiftExchangeSchema,
  rejectShiftExchangeSchema,
} from './validation/shiftExchange.schema.js';
export type {
  ListShiftExchangeOptionsInput,
  CreateShiftExchangeInput,
  RespondShiftExchangeInput,
  RejectShiftExchangeInput,
} from './validation/shiftExchange.schema.js';
export { superAdminBootstrapSchema, superAdminLoginSchema } from './validation/superAdmin.schema.js';
export type { SuperAdminBootstrapInput, SuperAdminLoginInput } from './validation/superAdmin.schema.js';

export {
  createCompanySchema,
  createCompanyBySuperAdminSchema,
  updateCompanySchema,
  deleteCurrentCompanySchema,
} from './validation/company.schema.js';
export type {
  CreateCompanyInput,
  CreateCompanyBySuperAdminInput,
  UpdateCompanyInput,
  DeleteCurrentCompanyInput,
} from './validation/company.schema.js';

export {
  createRoleSchema,
  updateRoleSchema,
  assignPermissionsSchema,
  assignRolesSchema,
} from './validation/role.schema.js';
export type {
  CreateRoleInput,
  UpdateRoleInput,
  AssignPermissionsInput,
  AssignRolesInput,
} from './validation/role.schema.js';

export {
  createUserSchema,
  updateUserSchema,
  changeMyPasswordSchema,
  assignUserCompanyAssignmentsSchema,
} from './validation/user.schema.js';
export type {
  CreateUserInput,
  UpdateUserInput,
  ChangeMyPasswordInput,
  AssignUserCompanyAssignmentsInput,
} from './validation/user.schema.js';

export {
  odooPosVerificationPayloadSchema,
  odooPosSessionPayloadSchema,
  odooDiscountOrderPayloadSchema,
  odooRefundOrderPayloadSchema,
  odooNonCashOrderPayloadSchema,
  odooTokenPayOrderPayloadSchema,
  odooISPEPurchaseOrderPayloadSchema,
  odooRegisterCashPayloadSchema,
  odooPosSessionClosePayloadSchema,
  confirmRejectSchema,
  breakdownItemSchema,
  submitBreakdownSchema,
} from './validation/pos.schema.js';
export type {
  OdooPosVerificationPayloadInput,
  OdooPosSessionPayloadInput,
  OdooDiscountOrderPayloadInput,
  OdooRefundOrderPayloadInput,
  OdooNonCashOrderPayloadInput,
  OdooTokenPayOrderPayloadInput,
  OdooISPEPurchaseOrderPayloadInput,
  OdooRegisterCashPayloadInput,
  OdooPosSessionClosePayloadInput,
  ConfirmRejectInput,
  BreakdownItemInput,
  SubmitBreakdownInput,
} from './validation/pos.schema.js';

export { odooShiftPayloadSchema } from './validation/shift.schema.js';
export type { OdooShiftPayloadInput } from './validation/shift.schema.js';

export { odooAttendancePayloadSchema } from './validation/attendance.schema.js';
export type { OdooAttendancePayloadInput } from './validation/attendance.schema.js';
