import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const { filterDisabledRoles } = await import('./globalUser.service.js');

test('filterDisabledRoles excludes temporarily disabled role ids', () => {
  const roles = [
    { id: 'role-admin', name: 'Administrator', color: '#f00', priority: 100 },
    { id: 'role-management', name: 'Management', color: '#0f0', priority: 50 },
    { id: 'role-service', name: 'Service Crew', color: '#00f', priority: 10 },
  ];

  const filtered = filterDisabledRoles(roles, new Set(['role-service']));

  assert.equal(filtered.length, 2);
  assert.deepEqual(
    filtered.map((role) => role.id),
    ['role-admin', 'role-management'],
  );
});

test('filterDisabledRoles returns same role list when no role is disabled', () => {
  const roles = [
    { id: 'role-management', name: 'Management', color: null, priority: 50 },
    { id: 'role-service', name: 'Service Crew', color: null, priority: 10 },
  ];

  const filtered = filterDisabledRoles(roles, new Set());

  assert.equal(filtered, roles);
});

