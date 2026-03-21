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
  createGlobalStoreAuditService,
} = await import('./globalStoreAudit.service.js');

function createProjectionRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    company_id: 'company-a',
    company_name: 'Alpha Foods',
    company_slug: 'alpha-foods',
    company_db_name: 'tenant_alpha',
    audit_id: 'audit-1',
    type: 'customer_service',
    status: 'pending',
    branch_id: 'branch-1',
    branch_name: 'Main Branch',
    auditor_user_id: null,
    auditor_name: null,
    monetary_reward: '150.00',
    completed_at: null,
    processing_started_at: null,
    vn_requested: false,
    linked_vn_id: null,
    created_at: '2026-03-22T01:00:00.000Z',
    updated_at: '2026-03-22T01:00:00.000Z',
    css_odoo_order_id: 101,
    css_pos_reference: 'POS-101',
    css_session_name: 'SESSION-1',
    css_company_name: 'Alpha Foods',
    css_cashier_name: 'Cashier One',
    css_cashier_user_key: 'user-key-1',
    css_date_order: '2026-03-22T01:10:00.000Z',
    css_amount_total: '399.00',
    css_order_lines: [{ product_name: 'Waffle', qty: 1, price_unit: 399 }],
    css_payments: [{ name: 'Cash', amount: 399 }],
    css_star_rating: null,
    css_criteria_scores: null,
    css_audit_log: null,
    css_ai_report: null,
    comp_odoo_employee_id: null,
    comp_employee_name: null,
    comp_employee_avatar: null,
    comp_check_in_time: null,
    comp_extra_fields: null,
    comp_productivity_rate: null,
    comp_uniform: null,
    comp_hygiene: null,
    comp_sop: null,
    comp_ai_report: null,
    ...overrides,
  };
}

test('listStoreAudits returns projection-backed items with company metadata and global processing audit id', async () => {
  const service = createGlobalStoreAuditService({
    listProjectionRows: async () => ({
      total: 2,
      rows: [
        createProjectionRow({
          audit_id: 'audit-css',
          company_id: 'company-a',
          company_name: 'Alpha Foods',
          company_slug: 'alpha-foods',
        }),
        createProjectionRow({
          audit_id: 'audit-comp',
          type: 'compliance',
          company_id: 'company-b',
          company_name: 'Beta Retail',
          company_slug: 'beta-retail',
          css_odoo_order_id: null,
          css_cashier_name: null,
          comp_odoo_employee_id: 55,
          comp_employee_name: 'Employee Two',
          comp_check_in_time: '2026-03-22T02:00:00.000Z',
        }),
      ],
    }),
    getProcessingAuditIdByUser: async () => 'audit-comp',
    getProjectionByAuditId: async () => null,
    resolveAuditContext: async () => null,
    reserveProcessingAudit: async () => 'ok',
    syncProjectionByAuditId: async () => undefined,
    listStoreAuditMessages: async () => [],
    sendStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    editStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    deleteStoreAuditMessage: async () => undefined,
    processStoreAuditTenant: async () => {
      throw new Error('not used');
    },
    completeStoreAuditTenant: async () => {
      throw new Error('not used');
    },
  });

  const result = await service.listStoreAudits({
    userId: 'viewer-1',
    type: 'all',
    status: 'pending',
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.total, 2);
  assert.equal(result.processingAuditId, 'audit-comp');
  assert.equal(result.items[0]?.company?.name, 'Alpha Foods');
  assert.equal(result.items[1]?.company?.name, 'Beta Retail');
  assert.equal(result.items[1]?.type, 'compliance');
  assert.equal(result.items[1]?.comp_employee_name, 'Employee Two');
});

test('processAudit reserves the global lock, executes the tenant claim, syncs the projection, and returns the synced audit', async () => {
  const calls: string[] = [];
  const syncedProjection = createProjectionRow({
    audit_id: 'audit-locked',
    status: 'processing',
    auditor_user_id: 'auditor-1',
    auditor_name: 'Auditor One',
    processing_started_at: '2026-03-22T03:00:00.000Z',
  });

  const service = createGlobalStoreAuditService({
    listProjectionRows: async () => ({ total: 0, rows: [] }),
    getProcessingAuditIdByUser: async () => null,
    getProjectionByAuditId: async (auditId) => (
      auditId === 'audit-locked' ? syncedProjection as any : null
    ),
    resolveAuditContext: async (auditId) => (
      auditId === 'audit-locked'
        ? {
            projection: createProjectionRow({ audit_id: 'audit-locked' }) as any,
            company: {
              id: 'company-a',
              name: 'Alpha Foods',
              slug: 'alpha-foods',
              dbName: 'tenant_alpha',
            },
            companyStorageRoot: 'alpha-foods-dev',
            tenantDb: {} as never,
          }
        : null
    ),
    reserveProcessingAudit: async () => {
      calls.push('reserve');
      return 'ok';
    },
    syncProjectionByAuditId: async () => {
      calls.push('sync');
    },
    listStoreAuditMessages: async () => [],
    sendStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    editStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    deleteStoreAuditMessage: async () => undefined,
    processStoreAuditTenant: async () => {
      calls.push('tenant');
      return {} as never;
    },
    completeStoreAuditTenant: async () => {
      throw new Error('not used');
    },
  });

  const audit = await service.processAudit({
    auditId: 'audit-locked',
    userId: 'auditor-1',
  });

  assert.deepEqual(calls, ['reserve', 'tenant', 'sync']);
  assert.equal(audit.status, 'processing');
  assert.equal(audit.company?.name, 'Alpha Foods');
  assert.equal(audit.auditor_user_id, 'auditor-1');
});

test('processAudit rejects users who already have a global active audit before touching the tenant', async () => {
  let tenantCalled = false;

  const service = createGlobalStoreAuditService({
    listProjectionRows: async () => ({ total: 0, rows: [] }),
    getProcessingAuditIdByUser: async () => null,
    getProjectionByAuditId: async () => null,
    resolveAuditContext: async () => ({
      projection: createProjectionRow() as any,
      company: {
        id: 'company-a',
        name: 'Alpha Foods',
        slug: 'alpha-foods',
        dbName: 'tenant_alpha',
      },
      companyStorageRoot: 'alpha-foods-dev',
      tenantDb: {} as never,
    }),
    reserveProcessingAudit: async () => 'user_has_active',
    syncProjectionByAuditId: async () => undefined,
    listStoreAuditMessages: async () => [],
    sendStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    editStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    deleteStoreAuditMessage: async () => undefined,
    processStoreAuditTenant: async () => {
      tenantCalled = true;
      return {} as never;
    },
    completeStoreAuditTenant: async () => {
      throw new Error('not used');
    },
  });

  await assert.rejects(
    () => service.processAudit({ auditId: 'audit-1', userId: 'auditor-1' }),
    /already have an active audit in progress/i,
  );

  assert.equal(tenantCalled, false);
});
