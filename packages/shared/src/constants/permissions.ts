export const PERMISSIONS = {
  // Admin
  ADMIN_MANAGE_ROLES: 'admin.manage_roles',
  ADMIN_MANAGE_USERS: 'admin.manage_users',
  ADMIN_MANAGE_BRANCHES: 'admin.manage_branches',
  ADMIN_VIEW_ALL_BRANCHES: 'admin.view_all_branches',
  ADMIN_TOGGLE_BRANCH: 'admin.toggle_branch',

  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',
  DASHBOARD_VIEW_PERFORMANCE_INDEX: 'dashboard.view_performance_index',
  DASHBOARD_VIEW_PAYSLIP: 'dashboard.view_payslip',

  // POS Verification
  POS_VERIFICATION_VIEW: 'pos_verification.view',
  POS_VERIFICATION_CONFIRM_REJECT: 'pos_verification.confirm_reject',
  POS_VERIFICATION_UPLOAD_IMAGE: 'pos_verification.upload_image',

  // POS Session
  POS_SESSION_VIEW: 'pos_session.view',
  POS_SESSION_AUDIT_COMPLETE: 'pos_session.audit_complete',

  // Account
  ACCOUNT_VIEW_SCHEDULE: 'account.view_schedule',
  ACCOUNT_VIEW_AUTH_REQUESTS: 'account.view_auth_requests',
  ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST: 'account.submit_private_auth_request',
  ACCOUNT_SUBMIT_PUBLIC_AUTH_REQUEST: 'account.submit_public_auth_request',
  ACCOUNT_VIEW_CASH_REQUESTS: 'account.view_cash_requests',
  ACCOUNT_SUBMIT_CASH_REQUEST: 'account.submit_cash_request',
  ACCOUNT_VIEW_NOTIFICATIONS: 'account.view_notifications',

  // Employee
  EMPLOYEE_VIEW_OWN_PROFILE: 'employee.view_own_profile',
  EMPLOYEE_EDIT_OWN_PROFILE: 'employee.edit_own_profile',

  // Shifts
  SHIFT_VIEW_ALL: 'shift.view_all',
  SHIFT_APPROVE_AUTHORIZATIONS: 'shift.approve_authorizations',
  SHIFT_END_SHIFT: 'shift.end_shift',

  // Authorization Requests
  AUTH_REQUEST_APPROVE_MANAGEMENT: 'auth_request.approve_management',
  AUTH_REQUEST_VIEW_ALL: 'auth_request.view_all',
  AUTH_REQUEST_APPROVE_SERVICE_CREW: 'auth_request.approve_service_crew',

  // Cash Requests
  CASH_REQUEST_VIEW_ALL: 'cash_request.view_all',
  CASH_REQUEST_APPROVE: 'cash_request.approve',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

export const PERMISSION_CATEGORIES: Record<string, { label: string; permissions: PermissionKey[] }> =
  {
    admin: {
      label: 'Administration',
      permissions: [
        PERMISSIONS.ADMIN_MANAGE_ROLES,
        PERMISSIONS.ADMIN_MANAGE_USERS,
        PERMISSIONS.ADMIN_MANAGE_BRANCHES,
        PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES,
        PERMISSIONS.ADMIN_TOGGLE_BRANCH,
      ],
    },
    dashboard: {
      label: 'Dashboard',
      permissions: [
        PERMISSIONS.DASHBOARD_VIEW,
        PERMISSIONS.DASHBOARD_VIEW_PERFORMANCE_INDEX,
        PERMISSIONS.DASHBOARD_VIEW_PAYSLIP,
      ],
    },
    pos_verification: {
      label: 'POS Verification',
      permissions: [
        PERMISSIONS.POS_VERIFICATION_VIEW,
        PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT,
        PERMISSIONS.POS_VERIFICATION_UPLOAD_IMAGE,
      ],
    },
    pos_session: {
      label: 'POS Session',
      permissions: [
        PERMISSIONS.POS_SESSION_VIEW,
        PERMISSIONS.POS_SESSION_AUDIT_COMPLETE,
      ],
    },
    account: {
      label: 'Account',
      permissions: [
        PERMISSIONS.ACCOUNT_VIEW_SCHEDULE,
        PERMISSIONS.ACCOUNT_VIEW_AUTH_REQUESTS,
        PERMISSIONS.ACCOUNT_SUBMIT_PRIVATE_AUTH_REQUEST,
        PERMISSIONS.ACCOUNT_SUBMIT_PUBLIC_AUTH_REQUEST,
        PERMISSIONS.ACCOUNT_VIEW_CASH_REQUESTS,
        PERMISSIONS.ACCOUNT_SUBMIT_CASH_REQUEST,
        PERMISSIONS.ACCOUNT_VIEW_NOTIFICATIONS,
      ],
    },
    employee: {
      label: 'Employee',
      permissions: [
        PERMISSIONS.EMPLOYEE_VIEW_OWN_PROFILE,
        PERMISSIONS.EMPLOYEE_EDIT_OWN_PROFILE,
      ],
    },
    shifts: {
      label: 'Employee Schedule',
      permissions: [
        PERMISSIONS.SHIFT_VIEW_ALL,
        PERMISSIONS.SHIFT_APPROVE_AUTHORIZATIONS,
        PERMISSIONS.SHIFT_END_SHIFT,
      ],
    },
    auth_requests: {
      label: 'Authorization Requests',
      permissions: [
        PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT,
        PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
        PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
      ],
    },
    cash_requests: {
      label: 'Cash Requests',
      permissions: [
        PERMISSIONS.CASH_REQUEST_VIEW_ALL,
        PERMISSIONS.CASH_REQUEST_APPROVE,
      ],
    },
  };
