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
  createAccountAuditResultService,
} = await import('./accountAuditResult.service.js');

function createAuditRow(
  overrides: Partial<{
    id: string;
    type: 'customer_service' | 'compliance';
    status: 'completed' | 'pending';
    branch_id: string;
    branch_name: string | null;
    completed_at: string | null;
    created_at: string;
    css_cashier_user_key: string | null;
    css_date_order: string | null;
    css_star_rating: number | null;
    css_criteria_scores: {
      greeting: number;
      order_accuracy: number;
      suggestive_selling: number;
      service_efficiency: number;
      professionalism: number;
    } | null;
    css_ai_report: string | null;
    css_audit_log: string | null;
    comp_odoo_employee_id: number | null;
    comp_check_in_time: string | null;
    comp_productivity_rate: boolean | null;
    comp_uniform: boolean | null;
    comp_hygiene: boolean | null;
    comp_sop: boolean | null;
    comp_ai_report: string | null;
    auditor_user_id: string | null;
    auditor_name: string | null;
    monetary_reward: string;
    vn_requested: boolean;
    linked_vn_id: string | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 'audit-1',
    type: overrides.type ?? 'customer_service',
    status: overrides.status ?? 'completed',
    branch_id: overrides.branch_id ?? 'branch-1',
    branch_name: overrides.branch_name ?? 'Main Branch',
    completed_at: overrides.completed_at ?? '2026-03-21T10:00:00.000Z',
    created_at: overrides.created_at ?? '2026-03-21T09:00:00.000Z',
    css_cashier_user_key: overrides.css_cashier_user_key ?? 'user-key-1',
    css_date_order: overrides.css_date_order ?? '2026-03-21T09:15:00.000Z',
    css_star_rating: overrides.css_star_rating ?? 4.2,
    css_criteria_scores: overrides.css_criteria_scores ?? {
      greeting: 4,
      order_accuracy: 5,
      suggestive_selling: 4,
      service_efficiency: 4,
      professionalism: 4,
    },
    css_ai_report: overrides.css_ai_report ?? 'Strong service recovery.',
    css_audit_log: overrides.css_audit_log ?? 'Observer note',
    comp_odoo_employee_id: overrides.comp_odoo_employee_id ?? 88,
    comp_check_in_time: overrides.comp_check_in_time ?? '2026-03-21T08:30:00.000Z',
    comp_productivity_rate: overrides.comp_productivity_rate ?? true,
    comp_uniform: overrides.comp_uniform ?? true,
    comp_hygiene: overrides.comp_hygiene ?? false,
    comp_sop: overrides.comp_sop ?? true,
    comp_ai_report: overrides.comp_ai_report ?? 'Follow SOP reminders.',
    auditor_user_id: overrides.auditor_user_id ?? 'auditor-1',
    auditor_name: overrides.auditor_name ?? 'Secret Auditor',
    monetary_reward: overrides.monetary_reward ?? '250.00',
    vn_requested: overrides.vn_requested ?? false,
    linked_vn_id: overrides.linked_vn_id ?? null,
  };
}

function createMessage(
  overrides: Partial<{
    id: string;
    store_audit_id: string;
    user_id: string;
    user_name: string | undefined;
    user_avatar: string | undefined;
    content: string;
    is_deleted: boolean;
    deleted_by: string | null;
    created_at: string;
    updated_at: string;
    is_edited: boolean;
    attachments: Array<{
      id: string;
      store_audit_id: string;
      message_id: string | null;
      uploaded_by: string;
      file_url: string;
      file_name: string;
      file_size: number;
      content_type: string;
      created_at: string;
    }>;
  }> = {},
) {
  return {
    id: overrides.id ?? 'message-1',
    store_audit_id: overrides.store_audit_id ?? 'audit-1',
    user_id: overrides.user_id ?? 'auditor-1',
    user_name: overrides.user_name ?? 'Secret Auditor',
    user_avatar: overrides.user_avatar ?? 'https://example.com/avatar.jpg',
    content: overrides.content ?? 'Cashier greeted within 5 seconds.',
    is_deleted: overrides.is_deleted ?? false,
    deleted_by: overrides.deleted_by ?? null,
    created_at: overrides.created_at ?? '2026-03-21T09:20:00.000Z',
    updated_at: overrides.updated_at ?? '2026-03-21T09:20:00.000Z',
    is_edited: overrides.is_edited ?? false,
    attachments: overrides.attachments ?? [
      {
        id: 'attachment-1',
        store_audit_id: overrides.store_audit_id ?? 'audit-1',
        message_id: overrides.id ?? 'message-1',
        uploaded_by: 'auditor-1',
        file_url: 'https://example.com/photo.jpg',
        file_name: 'audit-photo.jpg',
        file_size: 1024,
        content_type: 'image/jpeg',
        created_at: '2026-03-21T09:21:00.000Z',
      },
    ],
  };
}

test('listAccountAuditResults returns only owned completed audits with normalized summaries', async () => {
  const rows = [
    createAuditRow({
      id: 'css-owned',
      type: 'customer_service',
      css_cashier_user_key: 'user-key-1',
      completed_at: '2026-03-21T12:00:00.000Z',
    }),
    createAuditRow({
      id: 'comp-owned',
      type: 'compliance',
      comp_odoo_employee_id: 88,
      completed_at: '2026-03-21T11:00:00.000Z',
    }),
    createAuditRow({
      id: 'css-other-user',
      type: 'customer_service',
      css_cashier_user_key: 'user-key-2',
      completed_at: '2026-03-21T13:00:00.000Z',
    }),
    createAuditRow({
      id: 'comp-other-user',
      type: 'compliance',
      comp_odoo_employee_id: 99,
      completed_at: '2026-03-21T14:00:00.000Z',
    }),
    createAuditRow({
      id: 'pending-owned',
      type: 'customer_service',
      status: 'pending',
      css_cashier_user_key: 'user-key-1',
      completed_at: null,
    }),
  ];

  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userKey: 'user-key-1',
      employeeIds: [88],
    }),
    listCompletedAuditRows: async ({ type }) =>
      rows.filter((row) => row.status === 'completed' && (!type || row.type === type)),
    getAuditRowById: async () => null,
    listAuditMessages: async () => [],
  });

  const result = await service.listAccountAuditResults({
    tenantDb: {} as never,
    userId: 'viewer-1',
    type: 'all',
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.total, 2);
  assert.deepEqual(result.items.map((item) => item.id), ['css-owned', 'comp-owned']);
  assert.equal(result.items[0]?.summary.result_line, 'Overall score: 4.2 / 5');
  assert.equal(result.items[1]?.summary.result_line, 'Passed checks: 3 / 4');
});

test('getAccountAuditResultById returns a sanitized read-only detail payload', async () => {
  const audit = createAuditRow({
    id: 'audit-safe',
    type: 'customer_service',
    css_cashier_user_key: 'user-key-1',
  });
  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userKey: 'user-key-1',
      employeeIds: [],
    }),
    listCompletedAuditRows: async () => [],
    getAuditRowById: async ({ auditId }) => (auditId === 'audit-safe' ? audit : null),
    listAuditMessages: async () => [
      createMessage(),
      createMessage({
        id: 'message-deleted',
        content: 'Deleted text',
        is_deleted: true,
      }),
    ],
  });

  const result = await service.getAccountAuditResultById({
    tenantDb: {} as never,
    userId: 'viewer-1',
    auditId: 'audit-safe',
  });

  assert.equal(result.id, 'audit-safe');
  assert.equal(result.audit_trail.length, 1);
  assert.equal(result.audit_trail[0]?.content, 'Cashier greeted within 5 seconds.');
  assert.equal(result.audit_trail[0]?.attachments[0]?.file_name, 'audit-photo.jpg');
  assert.equal(result.ai_report, 'Strong service recovery.');
  assert.deepEqual(result.css_result, {
    criteria_scores: {
      greeting: 4,
      order_accuracy: 5,
      suggestive_selling: 4,
      service_efficiency: 4,
      professionalism: 4,
    },
    overall_rating: 4.2,
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Secret Auditor/);
  assert.doesNotMatch(serialized, /auditor_user_id/);
  assert.doesNotMatch(serialized, /monetary_reward/);
  assert.doesNotMatch(serialized, /uploaded_by/);
  assert.doesNotMatch(serialized, /linked_vn_id/);
});

test('getAccountAuditResultById rejects audits not owned by the viewer', async () => {
  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userKey: 'user-key-1',
      employeeIds: [88],
    }),
    listCompletedAuditRows: async () => [],
    getAuditRowById: async () =>
      createAuditRow({
        id: 'audit-other',
        type: 'customer_service',
        css_cashier_user_key: 'user-key-2',
      }),
    listAuditMessages: async () => [],
  });

  await assert.rejects(
    () =>
      service.getAccountAuditResultById({
        tenantDb: {} as never,
        userId: 'viewer-1',
        auditId: 'audit-other',
      }),
    /Audit result not found/,
  );
});
