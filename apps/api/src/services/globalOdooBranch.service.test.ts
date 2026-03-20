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

const {
  createGlobalActiveOdooBranchIdResolver,
} = await import('./globalOdooBranch.service.js');

test('createGlobalActiveOdooBranchIdResolver returns deduped active numeric branch ids across active tenant databases', async () => {
  let companyLookups = 0;
  const tenantLookups: string[] = [];

  const resolveBranchIds = createGlobalActiveOdooBranchIdResolver({
    ttlMs: 60_000,
    now: () => 1_000,
    listActiveCompanies: async () => {
      companyLookups += 1;
      return [
        { id: 'company-a', dbName: 'tenant_a' },
        { id: 'company-b', dbName: 'tenant_b' },
      ];
    },
    listTenantBranches: async (companyDbName) => {
      tenantLookups.push(companyDbName);
      if (companyDbName === 'tenant_a') {
        return [
          { isActive: true, odooBranchId: '5' },
          { isActive: false, odooBranchId: '8' },
          { isActive: true, odooBranchId: '10' },
        ];
      }

      return [
        { isActive: true, odooBranchId: '10' },
        { isActive: true, odooBranchId: 'abc' },
        { isActive: true, odooBranchId: null },
        { isActive: true, odooBranchId: '12' },
      ];
    },
    logger: {
      warn: () => undefined,
    },
  });

  const branchIds = await resolveBranchIds();

  assert.equal(companyLookups, 1);
  assert.deepEqual(tenantLookups, ['tenant_a', 'tenant_b']);
  assert.deepEqual(branchIds, [5, 10, 12]);
});

test('createGlobalActiveOdooBranchIdResolver caches successful lookups inside the ttl window', async () => {
  let now = 1_000;
  let companyLookups = 0;
  let tenantLookups = 0;

  const resolveBranchIds = createGlobalActiveOdooBranchIdResolver({
    ttlMs: 60_000,
    now: () => now,
    listActiveCompanies: async () => {
      companyLookups += 1;
      return [{ id: 'company-a', dbName: 'tenant_a' }];
    },
    listTenantBranches: async () => {
      tenantLookups += 1;
      return [{ isActive: true, odooBranchId: '9' }];
    },
    logger: {
      warn: () => undefined,
    },
  });

  assert.deepEqual(await resolveBranchIds(), [9]);
  now += 30_000;
  assert.deepEqual(await resolveBranchIds(), [9]);

  assert.equal(companyLookups, 1);
  assert.equal(tenantLookups, 1);
});

test('createGlobalActiveOdooBranchIdResolver logs tenant failures and continues with healthy tenants', async () => {
  const warnings: Array<{ context: Record<string, unknown>; message: string }> = [];

  const resolveBranchIds = createGlobalActiveOdooBranchIdResolver({
    ttlMs: 60_000,
    now: () => 1_000,
    listActiveCompanies: async () => [
      { id: 'company-a', dbName: 'tenant_a' },
      { id: 'company-b', dbName: 'tenant_b' },
    ],
    listTenantBranches: async (companyDbName) => {
      if (companyDbName === 'tenant_a') {
        throw new Error('tenant read failed');
      }

      return [{ isActive: true, odooBranchId: '14' }];
    },
    logger: {
      warn: (context: Record<string, unknown>, message: string) => {
        warnings.push({ context, message });
      },
    },
  });

  const branchIds = await resolveBranchIds();

  assert.deepEqual(branchIds, [14]);
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0]?.message, 'Failed to load tenant Odoo branch ids for global EPI benchmark');
  assert.equal(warnings[0]?.context.companyDbName, 'tenant_a');
});
