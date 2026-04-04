import assert from 'node:assert/strict';
import test from 'node:test';

const {
  DEFAULT_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
} = await import('../../../packages/shared/src/constants/roles.ts');
const {
  PERMISSION_CATEGORIES,
  PERMISSIONS,
} = await import('../../../packages/shared/src/constants/permissions.ts');

test('defines the account.view_audit_results permission in the account category', () => {
  assert.equal(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS, 'account.view_audit_results');
  assert.ok(PERMISSION_CATEGORIES.account.permissions.includes(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS));
});

test('grants account.view_audit_results to Service Crew by default only', () => {
  assert.ok(
    DEFAULT_ROLE_PERMISSIONS[SYSTEM_ROLES.SERVICE_CREW].includes(
      PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS,
    ),
  );
  assert.ok(
    !DEFAULT_ROLE_PERMISSIONS[SYSTEM_ROLES.MANAGEMENT].includes(
      PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS,
    ),
  );
});

test('does not grant account.manage_employee_requirements to Administrator by default', () => {
  assert.ok(
    DEFAULT_ROLE_PERMISSIONS[SYSTEM_ROLES.SERVICE_CREW].includes(
      PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS,
    ),
  );
  assert.ok(
    !DEFAULT_ROLE_PERMISSIONS[SYSTEM_ROLES.ADMINISTRATOR].includes(
      PERMISSIONS.ACCOUNT_MANAGE_EMPLOYEE_REQUIREMENTS,
    ),
  );
});
