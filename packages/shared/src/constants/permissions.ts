export const PERMISSIONS = {
  // Administration (5)
  ADMIN_MANAGE_ROLES: 'admin.manage_roles',
  ADMIN_MANAGE_USERS: 'admin.manage_users',
  ADMIN_VIEW_ALL_BRANCHES: 'admin.view_all_branches',
  ADMIN_MANAGE_COMPANIES: 'admin.manage_companies',
  ADMIN_MANAGE_DEPARTMENTS: 'admin.manage_departments',

  // Point of Sale (3)
  POS_VIEW: 'pos.view',
  POS_MANAGE_VERIFICATIONS: 'pos.manage_verifications',
  POS_MANAGE_AUDITS: 'pos.manage_audits',

  // Account (8)
  ACCOUNT_VIEW_SCHEDULE: 'account.view_schedule',
  ACCOUNT_MANAGE_SCHEDULE: 'account.manage_schedule',
  ACCOUNT_MANAGE_AUTH_REQUEST: 'account.manage_auth_request',
  ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST: 'account.submit_private_auth_request',
  ACCOUNT_MANAGE_CASH_REQUEST: 'account.manage_cash_request',
  ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS: 'account.manage_employee_requirements',
  ACCOUNT_VIEW_AUDIT_RESULTS: 'account.view_audit_results',
  ACCOUNT_VIEW_TOKEN_PAY: 'account.view_token_pay',

  // Authorization Requests (5)
  AUTH_REQUEST_VIEW_PAGE: 'auth_request.view_page',
  AUTH_REQUEST_VIEW_PRIVATE: 'auth_request.view_private',
  AUTH_REQUEST_VIEW_PUBLIC: 'auth_request.view_public',
  AUTH_REQUEST_MANAGE_PRIVATE: 'auth_request.manage_private',
  AUTH_REQUEST_MANAGE_PUBLIC: 'auth_request.manage_public',

  // Employee Verifications (5)
  EMPLOYEE_VERIFICATION_VIEW_PAGE: 'employee_verification.view_page',
  EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION: 'employee_verification.manage_registration',
  EMPLOYEE_VERIFICATION_MANAGE_PERSONAL: 'employee_verification.manage_personal',
  EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS: 'employee_verification.manage_requirements',
  EMPLOYEE_VERIFICATION_MANAGE_BANK: 'employee_verification.manage_bank',

  // Case Reports (2)
  CASE_REPORT_VIEW: 'case_report.view',
  CASE_REPORT_MANAGE: 'case_report.manage',

  // Store Audits (2)
  STORE_AUDIT_VIEW: 'store_audit.view',
  STORE_AUDIT_MANAGE: 'store_audit.manage',

  // Employee Profiles (2)
  EMPLOYEE_PROFILES_VIEW: 'employee_profiles.view',
  EMPLOYEE_PROFILES_MANAGE_WORK: 'employee_profiles.manage_work',

  // Employee Schedule (3)
  SCHEDULE_VIEW: 'schedule.view',
  SCHEDULE_MANAGE_SHIFT: 'schedule.manage_shift',
  // Legacy compatibility key while roles migrate to schedule.manage_shift
  SCHEDULE_END_SHIFT: 'schedule.end_shift',

  // Violation Notices (2)
  VIOLATION_NOTICE_VIEW: 'violation_notice.view',
  VIOLATION_NOTICE_MANAGE: 'violation_notice.manage',

  // Workplace Relations (1)
  WORKPLACE_RELATIONS_VIEW: 'workplace_relations.view',

  // Cash Requests (2)
  CASH_REQUESTS_VIEW: 'cash_requests.view',
  CASH_REQUESTS_MANAGE: 'cash_requests.manage',

  // Analytics (4)
  ANALYTICS_VIEW_EMPLOYEE_ANALYTICS: 'analytics.view_employee_analytics',
  ANALYTICS_VIEW_PROFITABILITY_ANALYTICS: 'analytics.view_profitability_analytics',
  ANALYTICS_VIEW_POS_ANALYTICS: 'analytics.view_pos_analytics',
  ANALYTICS_VIEW_PRODUCT_ANALYTICS: 'analytics.view_product_analytics',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const PERMISSION_CATEGORIES: Record<string, { label: string; permissions: PermissionKey[] }> = {
  admin: {
    label: 'Administration',
    permissions: [
      PERMISSIONS.ADMIN_MANAGE_ROLES,
      PERMISSIONS.ADMIN_MANAGE_USERS,
      PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES,
      PERMISSIONS.ADMIN_MANAGE_COMPANIES,
      PERMISSIONS.ADMIN_MANAGE_DEPARTMENTS,
    ],
  },
  pos: {
    label: 'Point of Sale',
    permissions: [
      PERMISSIONS.POS_VIEW,
      PERMISSIONS.POS_MANAGE_VERIFICATIONS,
      PERMISSIONS.POS_MANAGE_AUDITS,
    ],
  },
  account: {
    label: 'Account',
    permissions: [
      PERMISSIONS.ACCOUNT_VIEW_SCHEDULE,
      PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE,
      PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST,
      PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST,
      PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST,
      PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS,
      PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS,
      PERMISSIONS.ACCOUNT_VIEW_TOKEN_PAY,
    ],
  },
  auth_request: {
    label: 'Authorization Requests',
    permissions: [
      PERMISSIONS.AUTH_REQUEST_VIEW_PAGE,
      PERMISSIONS.AUTH_REQUEST_VIEW_PRIVATE,
      PERMISSIONS.AUTH_REQUEST_VIEW_PUBLIC,
      PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE,
      PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC,
    ],
  },
  employee_verifications: {
    label: 'Employee Verifications',
    permissions: [
      PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE,
      PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION,
      PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_PERSONAL,
      PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS,
      PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_BANK,
    ],
  },
  case_report: {
    label: 'Case Reports',
    permissions: [
      PERMISSIONS.CASE_REPORT_VIEW,
      PERMISSIONS.CASE_REPORT_MANAGE,
    ],
  },
  store_audit: {
    label: 'Store Audits',
    permissions: [
      PERMISSIONS.STORE_AUDIT_VIEW,
      PERMISSIONS.STORE_AUDIT_MANAGE,
    ],
  },
  employee_profiles: {
    label: 'Employee Profiles',
    permissions: [
      PERMISSIONS.EMPLOYEE_PROFILES_VIEW,
      PERMISSIONS.EMPLOYEE_PROFILES_MANAGE_WORK,
    ],
  },
  schedule: {
    label: 'Employee Schedule',
    permissions: [
      PERMISSIONS.SCHEDULE_VIEW,
      PERMISSIONS.SCHEDULE_MANAGE_SHIFT,
      PERMISSIONS.SCHEDULE_END_SHIFT,
    ],
  },
  violation_notice: {
    label: 'Violation Notices',
    permissions: [
      PERMISSIONS.VIOLATION_NOTICE_VIEW,
      PERMISSIONS.VIOLATION_NOTICE_MANAGE,
    ],
  },
  workplace_relations: {
    label: 'Workplace Relations',
    permissions: [
      PERMISSIONS.WORKPLACE_RELATIONS_VIEW,
    ],
  },
  cash_requests: {
    label: 'Cash Requests',
    permissions: [
      PERMISSIONS.CASH_REQUESTS_VIEW,
      PERMISSIONS.CASH_REQUESTS_MANAGE,
    ],
  },
  analytics: {
    label: 'Analytics',
    permissions: [
      PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS,
      PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS,
      PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS,
      PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS,
    ],
  },
};

// Prerequisites are single-hop (direct parent only).
// The role editor UI walks the chain transitively when enabling permissions.
export const PERMISSION_PREREQUISITES: Partial<Record<PermissionKey, PermissionKey>> = {
  [PERMISSIONS.POS_MANAGE_VERIFICATIONS]: PERMISSIONS.POS_VIEW,
  [PERMISSIONS.POS_MANAGE_AUDITS]: PERMISSIONS.POS_VIEW,
  [PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST]: PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST,
  [PERMISSIONS.AUTH_REQUEST_VIEW_PRIVATE]: PERMISSIONS.AUTH_REQUEST_VIEW_PAGE,
  [PERMISSIONS.AUTH_REQUEST_VIEW_PUBLIC]: PERMISSIONS.AUTH_REQUEST_VIEW_PAGE,
  [PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE]: PERMISSIONS.AUTH_REQUEST_VIEW_PAGE,
  [PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC]: PERMISSIONS.AUTH_REQUEST_VIEW_PAGE,
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION]: PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE,
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_PERSONAL]: PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE,
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS]: PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE,
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_BANK]: PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE,
  [PERMISSIONS.CASE_REPORT_MANAGE]: PERMISSIONS.CASE_REPORT_VIEW,
  [PERMISSIONS.STORE_AUDIT_MANAGE]: PERMISSIONS.STORE_AUDIT_VIEW,
  [PERMISSIONS.EMPLOYEE_PROFILES_MANAGE_WORK]: PERMISSIONS.EMPLOYEE_PROFILES_VIEW,
  [PERMISSIONS.SCHEDULE_MANAGE_SHIFT]: PERMISSIONS.SCHEDULE_VIEW,
  [PERMISSIONS.SCHEDULE_END_SHIFT]: PERMISSIONS.SCHEDULE_VIEW,
  [PERMISSIONS.VIOLATION_NOTICE_MANAGE]: PERMISSIONS.VIOLATION_NOTICE_VIEW,
  [PERMISSIONS.CASH_REQUESTS_MANAGE]: PERMISSIONS.CASH_REQUESTS_VIEW,
  [PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE]: PERMISSIONS.ACCOUNT_VIEW_SCHEDULE,
};

export const PERMISSION_DESCRIPTIONS: Record<PermissionKey, string> = {
  [PERMISSIONS.ADMIN_MANAGE_ROLES]: 'Create, edit, and delete roles and their permissions',
  [PERMISSIONS.ADMIN_MANAGE_USERS]: 'Assign roles and manage user accounts',
  [PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES]: 'View data across all branches regardless of assignment',
  [PERMISSIONS.ADMIN_MANAGE_COMPANIES]: 'Manage companies and branches across the platform',
  [PERMISSIONS.ADMIN_MANAGE_DEPARTMENTS]: 'Create, edit, and delete departments',
  [PERMISSIONS.POS_VIEW]: 'Access POS Verification and POS Session pages',
  [PERMISSIONS.POS_MANAGE_VERIFICATIONS]: 'Confirm, reject, and upload images for POS verifications',
  [PERMISSIONS.POS_MANAGE_AUDITS]: 'Audit POS session entries and mark audits complete',
  [PERMISSIONS.ACCOUNT_VIEW_SCHEDULE]: 'View own schedule under My Account',
  [PERMISSIONS.ACCOUNT_MANAGE_SCHEDULE]: 'Submit reasons for auth requests, end own shift, and request shift exchanges',
  [PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST]: 'View and submit public authorization requests',
  [PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST]: 'Submit private (management-level) authorization requests',
  [PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST]: 'View and submit personal cash requests',
  [PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS]: 'View and submit employee requirement documents',
  [PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS]: 'View own audit results',
  [PERMISSIONS.ACCOUNT_VIEW_TOKEN_PAY]: 'View own token pay wallet balance and transaction history',
  [PERMISSIONS.AUTH_REQUEST_VIEW_PAGE]: 'Access the Authorization Requests page in the sidebar',
  [PERMISSIONS.AUTH_REQUEST_VIEW_PRIVATE]: 'View the management (private) section of Authorization Requests',
  [PERMISSIONS.AUTH_REQUEST_VIEW_PUBLIC]: 'View the service crew (public) section of Authorization Requests',
  [PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE]: 'Approve and edit management authorization requests',
  [PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC]: 'Approve and reject service crew authorization requests',
  [PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE]: 'Access the Employee Verifications page',
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REGISTRATION]: 'Review and approve/reject registration submissions',
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_PERSONAL]: 'Review and approve/reject personal information submissions',
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_REQUIREMENTS]: 'Review and approve/reject employee requirement submissions',
  [PERMISSIONS.EMPLOYEE_VERIFICATION_MANAGE_BANK]: 'Review and approve/reject bank information submissions',
  [PERMISSIONS.CASE_REPORT_VIEW]: 'Access the Case Reports page and view case data',
  [PERMISSIONS.CASE_REPORT_MANAGE]: 'Create, close, and manage case reports, and request violation notices',
  [PERMISSIONS.STORE_AUDIT_VIEW]: 'Access the Store Audits page and view audit data',
  [PERMISSIONS.STORE_AUDIT_MANAGE]: 'Process store audits and request violation notices',
  [PERMISSIONS.EMPLOYEE_PROFILES_VIEW]: 'Access the Employee Profiles page and view profile data',
  [PERMISSIONS.EMPLOYEE_PROFILES_MANAGE_WORK]: 'Edit work information on employee profiles',
  [PERMISSIONS.SCHEDULE_VIEW]: 'Access the Employee Schedule page and view schedule data',
  [PERMISSIONS.SCHEDULE_MANAGE_SHIFT]: 'Approve/reject public shift authorizations and end shifts for all employees on the schedule',
  [PERMISSIONS.SCHEDULE_END_SHIFT]: 'Approve/reject public shift authorizations and end shifts for all employees on the schedule',
  [PERMISSIONS.VIOLATION_NOTICE_VIEW]: 'Access the Violation Notices page and view notice data',
  [PERMISSIONS.VIOLATION_NOTICE_MANAGE]: 'Create, confirm, reject, issue, and complete violation notices',
  [PERMISSIONS.WORKPLACE_RELATIONS_VIEW]: 'Access the Workplace Relations page and view peer evaluations',
  [PERMISSIONS.CASH_REQUESTS_VIEW]: 'Access the Cash Requests management page',
  [PERMISSIONS.CASH_REQUESTS_MANAGE]: 'Approve, reject, and disburse cash requests',
  [PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS]: 'Access the Employee Analytics page and view performance metrics',
  [PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS]: 'Access the Profitability Analytics page and view P&L metrics',
  [PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS]: 'Access the POS Analytics page and view session metrics',
  [PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS]: 'Access the Product Analytics page and view product-level sales and costing metrics',
};
