// Types
export type * from './types/api.types';
export type * from './types/branch.types';
export type * from './types/company.types';
export type * from './types/pos.types';
export type * from './types/role.types';
export type * from './types/socket.types';
export type * from './types/user.types';
export type * from './types/webhook.types';

// Constants
export { PERMISSIONS, ALL_PERMISSIONS, PERMISSION_CATEGORIES } from './constants/permissions';
export type { PermissionKey } from './constants/permissions';
export {
  SYSTEM_ROLES,
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_ROLE_COLORS,
  DEFAULT_ROLE_PRIORITIES,
} from './constants/roles';
export type { SystemRoleName } from './constants/roles';

// Validation schemas
export {
  loginSchema,
  refreshTokenSchema,
} from './validation/auth.schema';
export type { LoginInput, RefreshTokenInput } from './validation/auth.schema';
export { superAdminBootstrapSchema, superAdminLoginSchema } from './validation/superAdmin.schema';
export type { SuperAdminBootstrapInput, SuperAdminLoginInput } from './validation/superAdmin.schema';

export {
  createCompanySchema,
  createCompanyBySuperAdminSchema,
  updateCompanySchema,
} from './validation/company.schema';
export type {
  CreateCompanyInput,
  CreateCompanyBySuperAdminInput,
  UpdateCompanyInput,
} from './validation/company.schema';

export {
  createRoleSchema,
  updateRoleSchema,
  assignPermissionsSchema,
  assignRolesSchema,
} from './validation/role.schema';
export type {
  CreateRoleInput,
  UpdateRoleInput,
  AssignPermissionsInput,
  AssignRolesInput,
} from './validation/role.schema';

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
} from './validation/pos.schema';
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
} from './validation/pos.schema';

export { odooShiftPayloadSchema } from './validation/shift.schema';
export type { OdooShiftPayloadInput } from './validation/shift.schema';

export { odooAttendancePayloadSchema } from './validation/attendance.schema';
export type { OdooAttendancePayloadInput } from './validation/attendance.schema';
