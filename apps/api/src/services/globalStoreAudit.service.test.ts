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

function createAuditRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: 'audit-1',
    company_id: 'company-a',
    company_name: 'Alpha Foods',
    type: 'customer_service',
    status: 'pending',
    branch_id: 'branch-1',
    auditor_user_id: null,
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
    css_order_lines: null,
    css_payments: null,
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

test('listStoreAudits returns enriched items with company metadata and global processing audit id', async () => {
  const service = createGlobalStoreAuditService({
    listStoreAuditRows: async () => ({
      total: 2,
      rows: [
        createAuditRow({
          id: 'audit-css',
          company_id: 'company-a',
          company_name: 'Alpha Foods',
        }),
        createAuditRow({
          id: 'audit-comp',
          type: 'compliance',
          company_id: 'company-b',
          company_name: 'Beta Retail',
          css_odoo_order_id: null,
          css_cashier_name: null,
          comp_odoo_employee_id: 55,
          comp_employee_name: 'Employee Two',
          comp_check_in_time: '2026-03-22T02:00:00.000Z',
        }),
      ],
    }),
    getProcessingAuditIdByUser: async () => 'audit-comp',
    getAuditById: async () => null,
    resolveAuditCompanyContext: async () => null,
    listStoreAuditMessages: async () => [],
    sendStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    editStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    deleteStoreAuditMessage: async () => undefined,
    processStoreAudit: async () => {
      throw new Error('not used');
    },
    completeStoreAudit: async () => {
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
  assert.equal(result.items[0]?.company?.id, 'company-a');
  assert.equal(result.items[1]?.comp_employee_name, 'Employee Two');
  assert.equal(result.items[1]?.type, 'compliance');
});

test('processAudit resolves company context and delegates to processStoreAudit dep', async () => {
  const calls: string[] = [];
  const processedRow = createAuditRow({
    id: 'audit-locked',
    status: 'processing',
    auditor_user_id: 'auditor-1',
    processing_started_at: '2026-03-22T03:00:00.000Z',
  });

  const service = createGlobalStoreAuditService({
    listStoreAuditRows: async () => ({ total: 0, rows: [] }),
    getProcessingAuditIdByUser: async () => null,
    getAuditById: async (auditId) => (auditId === 'audit-locked' ? processedRow : null),
    resolveAuditCompanyContext: async (auditId) => (
      auditId === 'audit-locked'
        ? { companyId: 'company-a', companySlug: 'alpha-foods', companyStorageRoot: 'alpha-foods-dev' }
        : null
    ),
    listStoreAuditMessages: async () => [],
    sendStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    editStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    deleteStoreAuditMessage: async () => undefined,
    processStoreAudit: async ({ auditId, userId, companyId }) => {
      calls.push(`process:${auditId}:${userId}:${companyId}`);
      return processedRow as any;
    },
    completeStoreAudit: async () => {
      throw new Error('not used');
    },
  });

  const audit = await service.processAudit({
    auditId: 'audit-locked',
    userId: 'auditor-1',
  });

  assert.deepEqual(calls, ['process:audit-locked:auditor-1:company-a']);
  assert.equal(audit.status, 'processing');
  assert.equal(audit.auditor_user_id, 'auditor-1');
});

test('processAudit throws 404 if audit company context cannot be resolved', async () => {
  const service = createGlobalStoreAuditService({
    listStoreAuditRows: async () => ({ total: 0, rows: [] }),
    getProcessingAuditIdByUser: async () => null,
    getAuditById: async () => null,
    resolveAuditCompanyContext: async () => null,
    listStoreAuditMessages: async () => [],
    sendStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    editStoreAuditMessage: async () => {
      throw new Error('not used');
    },
    deleteStoreAuditMessage: async () => undefined,
    processStoreAudit: async () => {
      throw new Error('should not be called');
    },
    completeStoreAudit: async () => {
      throw new Error('not used');
    },
  });

  await assert.rejects(
    () => service.processAudit({ auditId: 'nonexistent', userId: 'auditor-1' }),
    /store audit not found/i,
  );
});
