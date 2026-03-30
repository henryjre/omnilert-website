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

const { db } = await import('../config/database.js');
const {
  createGlobalStoreAuditService,
} = await import('./globalStoreAudit.service.js');

function createAuditRow(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    company_id: 'company-a',
    company_name: 'Alpha Foods',
    company_slug: 'alpha-foods',
    type: 'customer_service',
    status: 'pending',
    branch_id: '00000000-0000-0000-0000-000000000001',
    auditor_user_id: null,
    monetary_reward: '150.00',
    completed_at: null,
    rejected_at: null,
    rejection_reason: null,
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
    audited_user_id: null,
    audited_user_key: 'user-key-1',
    css_date_order: '2026-03-22T01:10:00.000Z',
    css_amount_total: '399.00',
    css_order_lines: null,
    css_payments: null,
    css_star_rating: null,
    css_criteria_scores: null,
    css_audit_log: null,
    css_ai_report: null,
    audited_user_avatar_url: null,
    scc_odoo_employee_id: null,
    scc_employee_name: null,
    scc_productivity_rate: null,
    scc_uniform_compliance: null,
    scc_hygiene_compliance: null,
    scc_sop_compliance: null,
    scc_customer_interaction: null,
    scc_cashiering: null,
    scc_suggestive_selling_and_upselling: null,
    scc_service_efficiency: null,
    scc_ai_report: null,
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
          company_slug: 'alpha-foods',
          branch_id: '',
        }),
        createAuditRow({
          id: 'audit-scc',
          type: 'service_crew_cctv',
          company_id: 'company-b',
          company_name: 'Beta Retail',
          company_slug: 'beta-retail',
          branch_id: '',
          css_odoo_order_id: null,
          css_cashier_name: null,
          scc_odoo_employee_id: 55,
          scc_employee_name: 'Employee Two',
        }),
      ],
    }),
    getProcessingAuditIdByUser: async () => 'audit-scc',
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
    rejectStoreAudit: async () => {
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
  assert.equal(result.processingAuditId, 'audit-scc');
  assert.equal(result.items[0]?.company?.id, 'company-a');
  assert.equal(result.items[1]?.scc_employee_name, 'Employee Two');
  assert.equal(result.items[1]?.type, 'service_crew_cctv');
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
    rejectStoreAudit: async () => {
      throw new Error('not used');
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
    rejectStoreAudit: async () => {
      throw new Error('not used');
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

test('rejectAudit resolves company context and delegates to rejectStoreAudit dep', async () => {
  const calls: string[] = [];
  const rejectedRow = createAuditRow({
    id: 'audit-rejected',
    status: 'rejected',
    auditor_user_id: 'auditor-1',
    processing_started_at: '2026-03-22T03:00:00.000Z',
    rejected_at: '2026-03-22T03:10:00.000Z',
    rejection_reason: 'Evidence was insufficient.',
  });

  const service = createGlobalStoreAuditService({
    listStoreAuditRows: async () => ({ total: 0, rows: [] }),
    getProcessingAuditIdByUser: async () => null,
    getAuditById: async (auditId) => (auditId === 'audit-rejected' ? rejectedRow : null),
    resolveAuditCompanyContext: async (auditId) => (
      auditId === 'audit-rejected'
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
    processStoreAudit: async () => {
      throw new Error('not used');
    },
    rejectStoreAudit: async ({ auditId, userId, companyId, reason }) => {
      calls.push(`reject:${auditId}:${userId}:${companyId}:${reason}`);
      return rejectedRow as any;
    },
    completeStoreAudit: async () => {
      throw new Error('not used');
    },
  });

  const audit = await service.rejectAudit({
    auditId: 'audit-rejected',
    userId: 'auditor-1',
    reason: 'Evidence was insufficient.',
  });

  assert.deepEqual(calls, ['reject:audit-rejected:auditor-1:company-a:Evidence was insufficient.']);
  assert.equal(audit.status, 'rejected');
  assert.equal(audit.rejection_reason, 'Evidence was insufficient.');
});

test('rejectAudit throws 404 if audit company context cannot be resolved', async () => {
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
      throw new Error('not used');
    },
    rejectStoreAudit: async () => {
      throw new Error('should not be called');
    },
    completeStoreAudit: async () => {
      throw new Error('not used');
    },
  });

  await assert.rejects(
    () => service.rejectAudit({
      auditId: 'nonexistent',
      userId: 'auditor-1',
      reason: 'Evidence was insufficient.',
    }),
    /store audit not found/i,
  );
});

test.after(async () => {
  await db.getDb().destroy();
});
