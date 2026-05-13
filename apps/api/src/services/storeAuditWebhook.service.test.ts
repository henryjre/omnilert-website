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
  buildAuditResultsWebhookPayload,
  createStoreAuditResultsWebhookNotifier,
} = await import('./storeAuditWebhook.service.js');

function createCompletedAudit(
  overrides: Partial<{
    id: string;
    type: 'customer_service' | 'service_crew_cctv';
    status: 'completed';
    branch_id: string;
    branch_name: string | null;
    completed_at: string;
    created_at: string;
    css_date_order: string | null;
    css_pos_reference: string | null;
    css_odoo_order_id: number | null;
    css_company_name: string | null;
    css_cashier_name: string | null;
    audited_user_id: string | null;
    audited_user_key: string | null;
    css_cashier_user_key: string | null;
    css_star_rating: number | null;
    scc_odoo_employee_id: number | null;
    scc_employee_name: string | null;
    scc_productivity_rate: boolean | null;
    scc_uniform_compliance: boolean | null;
    scc_hygiene_compliance: boolean | null;
    scc_sop_compliance: boolean | null;
    scc_customer_interaction: number | null;
    scc_cashiering: number | null;
    scc_suggestive_selling_and_upselling: number | null;
    scc_service_efficiency: number | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'audit-1',
    type: overrides.type ?? 'customer_service',
    status: overrides.status ?? 'completed',
    branch_id: overrides.branch_id ?? 'branch-1',
    branch_name: overrides.branch_name ?? 'Main Branch',
    completed_at: overrides.completed_at ?? '2026-03-21T10:00:00.000Z',
    created_at: overrides.created_at ?? '2026-03-21T08:30:00.000Z',
    css_date_order: overrides.css_date_order ?? '2026-03-21T09:15:00.000Z',
    css_pos_reference: overrides.css_pos_reference ?? 'POS/000123',
    css_odoo_order_id: overrides.css_odoo_order_id ?? 123,
    css_company_name: overrides.css_company_name ?? 'CSS Company',
    css_cashier_name: overrides.css_cashier_name ?? 'Cashier Crew',
    audited_user_id: overrides.audited_user_id ?? null,
    audited_user_key: overrides.audited_user_key ?? null,
    css_cashier_user_key: overrides.css_cashier_user_key ?? 'user-key-css',
    css_star_rating: overrides.css_star_rating ?? 4.2,
    scc_odoo_employee_id: overrides.scc_odoo_employee_id ?? 77,
    scc_employee_name: overrides.scc_employee_name ?? 'Service Crew',
    scc_productivity_rate: overrides.scc_productivity_rate ?? true,
    scc_uniform_compliance: overrides.scc_uniform_compliance ?? true,
    scc_hygiene_compliance: overrides.scc_hygiene_compliance ?? null,
    scc_sop_compliance: overrides.scc_sop_compliance ?? false,
    scc_customer_interaction: overrides.scc_customer_interaction ?? 4,
    scc_cashiering: overrides.scc_cashiering ?? 5,
    scc_suggestive_selling_and_upselling:
      overrides.scc_suggestive_selling_and_upselling ?? 3,
    scc_service_efficiency: overrides.scc_service_efficiency ?? 4,
  };
}

test('buildAuditResultsWebhookPayload creates the shared CSS payload shape', () => {
  const payload = buildAuditResultsWebhookPayload({
    audit: createCompletedAudit({
      type: 'customer_service',
      css_star_rating: 4.2,
      css_pos_reference: 'POS/000123',
      css_date_order: '2026-03-21T09:15:00.000Z',
    }),
    recipient: {
      user_id: 'user-1',
      user_key: 'user-key-css',
      email: 'cashier@example.com',
      full_name: 'Jane Doe',
    },
    company: {
      id: 'company-1',
      name: 'Omnilert Company',
    },
  });

  assert.deepEqual(payload, {
    event: 'store_audit.completed',
    version: 1,
    recipient: {
      user_id: 'user-1',
      user_key: 'user-key-css',
      email: 'cashier@example.com',
      full_name: 'Jane Doe',
    },
    company: {
      id: 'company-1',
      name: 'Omnilert Company',
    },
    branch: {
      id: 'branch-1',
      name: 'Main Branch',
    },
    audit: {
      id: 'audit-1',
      type: 'customer_service',
      type_label: 'Customer Service Audit',
      completed_at: '2026-03-21T10:00:00.000Z',
      observed_at: '2026-03-21T09:15:00.000Z',
      source_type: 'pos_order',
      source_reference: 'POS/000123',
    },
    summary: {
      result_line: 'Overall score: 4.2 / 5',
      overall_value: 4.2,
      overall_max: 5,
      overall_unit: 'rating',
    },
  });
});

test('buildAuditResultsWebhookPayload creates the shared SCC payload shape with text summary', () => {
  const payload = buildAuditResultsWebhookPayload({
    audit: createCompletedAudit({
      type: 'service_crew_cctv',
      created_at: '2026-03-21T08:30:00.000Z',
      scc_odoo_employee_id: 88,
      scc_productivity_rate: true,
      scc_uniform_compliance: true,
      scc_hygiene_compliance: null,
      scc_sop_compliance: false,
      scc_customer_interaction: 4,
      scc_cashiering: 5,
      scc_suggestive_selling_and_upselling: 3,
      scc_service_efficiency: 4,
    }),
    recipient: {
      user_id: 'user-2',
      user_key: 'user-key-scc',
      email: 'crew@example.com',
      full_name: 'John Doe',
    },
    company: {
      id: 'company-2',
      name: 'Omnilert Company',
    },
  });

  assert.deepEqual(payload, {
    event: 'store_audit.completed',
    version: 1,
    recipient: {
      user_id: 'user-2',
      user_key: 'user-key-scc',
      email: 'crew@example.com',
      full_name: 'John Doe',
    },
    company: {
      id: 'company-2',
      name: 'Omnilert Company',
    },
    branch: {
      id: 'branch-1',
      name: 'Main Branch',
    },
    audit: {
      id: 'audit-1',
      type: 'service_crew_cctv',
      type_label: 'Service Crew CCTV Audit',
      completed_at: '2026-03-21T10:00:00.000Z',
      observed_at: '2026-03-21T08:30:00.000Z',
      source_type: 'attendance',
      source_reference: 'CCTV Observation',
    },
    summary: {
      result_line: 'Status: Completed. Includes compliance checks and customer service ratings.',
      overall_value: null,
      overall_max: null,
      overall_unit: 'text',
    },
  });
});

test('buildAuditResultsWebhookPayload excludes auditor and raw-trail data', () => {
  const payload = buildAuditResultsWebhookPayload({
    audit: createCompletedAudit(),
    recipient: {
      user_id: 'user-1',
      user_key: 'user-key-css',
      email: 'cashier@example.com',
      full_name: 'Jane Doe',
    },
    company: {
      id: 'company-1',
      name: 'Omnilert Company',
    },
  });

  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /auditor/i);
  assert.doesNotMatch(serialized, /css_audit_log/i);
  assert.doesNotMatch(serialized, /scc_ai_report/i);
  assert.doesNotMatch(serialized, /attachment/i);
  assert.doesNotMatch(serialized, /message/i);
});

test('createStoreAuditResultsWebhookNotifier skips delivery when recipient cannot be resolved', async () => {
  const warnLogs: Array<Record<string, unknown>> = [];
  let sendCalls = 0;
  const notifyCompletedStoreAudit = createStoreAuditResultsWebhookNotifier({
    resolveServiceCrewCctvWebsiteUserKey: async () => null,
    findUserById: async () => null,
    findUserByUserKey: async () => null,
    findCompanyById: async () => ({ id: 'company-1', name: 'Omnilert Company' }),
    sendEmail: async () => {
      sendCalls += 1;
    },
    log: {
      warn: (...args: unknown[]) => {
        const [entry] = args;
        warnLogs.push((entry ?? {}) as Record<string, unknown>);
      },
      error: () => undefined,
    },
  });

  const result = await notifyCompletedStoreAudit({
    companyId: 'company-1',
    audit: createCompletedAudit({
      type: 'customer_service',
      audited_user_id: null,
      audited_user_key: null,
      css_cashier_user_key: 'missing-user',
    }),
  });

  assert.deepEqual(result, {
    status: 'skipped',
    reason: 'recipient_not_found',
  });
  assert.equal(sendCalls, 0);
  assert.equal(warnLogs.length, 1);
});

test('createStoreAuditResultsWebhookNotifier logs email failures without blocking completion', async () => {
  const errorLogs: Array<Record<string, unknown>> = [];
  let sendCalls = 0;
  const notifyCompletedStoreAudit = createStoreAuditResultsWebhookNotifier({
    resolveServiceCrewCctvWebsiteUserKey: async () => 'user-key-scc',
    findUserById: async () => null,
    findUserByUserKey: async () => ({
      user_id: 'user-2',
      user_key: 'user-key-scc',
      email: 'crew@example.com',
      full_name: 'John Doe',
    }),
    findCompanyById: async () => ({ id: 'company-1', name: 'Omnilert Company' }),
    sendEmail: async () => {
      sendCalls += 1;
      throw new Error('Resend unavailable');
    },
    log: {
      warn: () => undefined,
      error: (...args: unknown[]) => {
        const [entry] = args;
        errorLogs.push((entry ?? {}) as Record<string, unknown>);
      },
    },
  });

  const result = await notifyCompletedStoreAudit({
    companyId: 'company-1',
    audit: createCompletedAudit({
      type: 'service_crew_cctv',
      audited_user_id: null,
      audited_user_key: null,
      scc_odoo_employee_id: 88,
    }),
  });

  assert.deepEqual(result, {
    status: 'skipped',
    reason: 'email_failed',
  });
  assert.equal(sendCalls, 1);
  assert.equal(errorLogs.length, 1);
});

test('createStoreAuditResultsWebhookNotifier prefers canonical audited_user_id when available', async () => {
  let sendCalls = 0;
  let keyLookupCalls = 0;
  let idLookupCalls = 0;
  const notifyCompletedStoreAudit = createStoreAuditResultsWebhookNotifier({
    resolveServiceCrewCctvWebsiteUserKey: async () => {
      throw new Error('legacy resolver should not be used');
    },
    findUserById: async (userId) => {
      idLookupCalls += 1;
      assert.equal(userId, 'user-42');
      return {
        user_id: 'user-42',
        user_key: 'user-key-42',
        email: 'crew42@example.com',
        full_name: 'Crew Forty Two',
      };
    },
    findUserByUserKey: async () => {
      keyLookupCalls += 1;
      return null;
    },
    findCompanyById: async () => ({ id: 'company-1', name: 'Omnilert Company' }),
    sendEmail: async () => {
      sendCalls += 1;
    },
    log: {
      warn: () => undefined,
      error: () => undefined,
    },
  });

  const result = await notifyCompletedStoreAudit({
    companyId: 'company-1',
    audit: createCompletedAudit({
      type: 'service_crew_cctv',
      audited_user_id: 'user-42',
      audited_user_key: 'user-key-42',
    }),
  });

  assert.deepEqual(result, { status: 'sent' });
  assert.equal(sendCalls, 1);
  assert.equal(idLookupCalls, 1);
  assert.equal(keyLookupCalls, 0);
});
