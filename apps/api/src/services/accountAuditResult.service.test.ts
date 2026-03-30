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
    company_id: string;
    company_name: string;
    company_slug: string;
    id: string;
    type: 'customer_service' | 'service_crew_cctv';
    status: 'completed' | 'pending';
    branch_id: string;
    branch_name: string | null;
    completed_at: string | null;
    created_at: string;
    audited_user_id: string | null;
    audited_user_key: string | null;
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
    scc_ai_report: string | null;
    auditor_user_id: string | null;
    auditor_name: string | null;
    monetary_reward: string;
    vn_requested: boolean;
    linked_vn_id: string | null;
  }> = {},
) {
  return {
    company_id: overrides.company_id ?? 'company-1',
    company_name: overrides.company_name ?? 'Alpha Foods',
    company_slug: overrides.company_slug ?? 'alpha-foods',
    id: overrides.id ?? 'audit-1',
    type: overrides.type ?? 'service_crew_cctv',
    status: overrides.status ?? 'completed',
    branch_id: overrides.branch_id ?? 'branch-1',
    branch_name: overrides.branch_name ?? 'Main Branch',
    completed_at: overrides.completed_at ?? '2026-03-21T10:00:00.000Z',
    created_at: overrides.created_at ?? '2026-03-21T09:00:00.000Z',
    audited_user_id: overrides.audited_user_id ?? null,
    audited_user_key: overrides.audited_user_key ?? null,
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
    scc_odoo_employee_id: overrides.scc_odoo_employee_id ?? 88,
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
    scc_ai_report: overrides.scc_ai_report ?? 'Needs tighter SOP coaching.',
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
    content: overrides.content ?? 'Crew member greeted the customer and kept the line moving.',
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

test('listAccountAuditResults returns only owned completed SCC audits with text summaries', async () => {
  const rows = [
    createAuditRow({
      id: 'scc-owned',
      type: 'service_crew_cctv',
      scc_odoo_employee_id: 88,
      completed_at: '2026-03-21T11:00:00.000Z',
    }),
    createAuditRow({
      id: 'css-owned',
      type: 'customer_service',
      css_cashier_user_key: 'user-key-1',
      completed_at: '2026-03-21T12:00:00.000Z',
    }),
    createAuditRow({
      id: 'scc-other-user',
      type: 'service_crew_cctv',
      scc_odoo_employee_id: 99,
      completed_at: '2026-03-21T13:00:00.000Z',
    }),
    createAuditRow({
      id: 'pending-owned',
      type: 'service_crew_cctv',
      status: 'pending',
      scc_odoo_employee_id: 88,
      completed_at: null,
    }),
  ];

  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userId: 'viewer-1',
      userKey: 'user-key-1',
      employeeIds: [88],
    }),
    listCompletedAuditRows: async ({ type }) =>
      rows.filter((row) => row.status === 'completed' && (!type || row.type === type)),
    getAuditRowById: async () => null,
    listAuditMessages: async () => [],
  });

  const result = await service.listAccountAuditResults({
    userId: 'viewer-1',
    type: 'all',
    page: 1,
    pageSize: 10,
  });

  assert.equal(result.total, 1);
  assert.deepEqual(result.items.map((item) => item.id), ['scc-owned']);
  assert.equal(result.items[0]?.type, 'service_crew_cctv');
  assert.equal(
    result.items[0]?.summary.result_line,
    'Status: Completed. Includes compliance checks and customer service ratings.',
  );
  assert.equal(result.items[0]?.summary.overall_value, null);
  assert.equal(result.items[0]?.summary.overall_max, null);
  assert.equal(result.items[0]?.summary.overall_unit, 'text');
  assert.deepEqual(result.items[0]?.company, {
    id: 'company-1',
    name: 'Alpha Foods',
    slug: 'alpha-foods',
  });
});

test('listAccountAuditResults keeps canonical ownership and drops CSS fallback branches', async () => {
  const rows = [
    createAuditRow({
      id: 'owned-by-audited-id',
      type: 'service_crew_cctv',
      audited_user_id: 'viewer-1',
      audited_user_key: 'user-key-1',
      scc_odoo_employee_id: 999,
    }),
    createAuditRow({
      id: 'owned-by-employee-id',
      type: 'service_crew_cctv',
      audited_user_id: null,
      audited_user_key: null,
      scc_odoo_employee_id: 88,
    }),
    createAuditRow({
      id: 'css-legacy-owned',
      type: 'customer_service',
      audited_user_id: 'viewer-1',
      audited_user_key: 'user-key-1',
      css_cashier_user_key: 'user-key-1',
    }),
  ];

  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userId: 'viewer-1',
      userKey: 'user-key-1',
      employeeIds: [88],
    }),
    listCompletedAuditRows: async () => rows,
    getAuditRowById: async () => null,
    listAuditMessages: async () => [],
  });

  const result = await service.listAccountAuditResults({
    userId: 'viewer-1',
    page: 1,
    pageSize: 10,
  });

  assert.deepEqual(result.items.map((item) => item.id), ['owned-by-audited-id', 'owned-by-employee-id']);
});

test('getAccountAuditResultById returns a sanitized SCC-only detail payload', async () => {
  const audit = createAuditRow({
    id: 'audit-safe',
    type: 'service_crew_cctv',
    scc_odoo_employee_id: 88,
  });
  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userId: 'viewer-1',
      userKey: 'user-key-1',
      employeeIds: [88],
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
    userId: 'viewer-1',
    auditId: 'audit-safe',
  });

  assert.equal(result.id, 'audit-safe');
  assert.equal(result.type, 'service_crew_cctv');
  assert.equal(result.audit_trail.length, 1);
  assert.equal(result.audit_trail[0]?.content, 'Crew member greeted the customer and kept the line moving.');
  assert.equal(result.audit_trail[0]?.attachments[0]?.file_name, 'audit-photo.jpg');
  assert.equal(result.ai_report, 'Needs tighter SOP coaching.');
  assert.deepEqual(result.company, {
    id: 'company-1',
    name: 'Alpha Foods',
    slug: 'alpha-foods',
  });
  assert.deepEqual(result.scc_result, {
    compliance_criteria: {
      productivity_rate: true,
      uniform_compliance: true,
      hygiene_compliance: null,
      sop_compliance: false,
    },
    customer_service_criteria: {
      customer_interaction: 4,
      cashiering: 5,
      suggestive_selling_and_upselling: 3,
      service_efficiency: 4,
    },
  });

  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /Secret Auditor/);
  assert.doesNotMatch(serialized, /auditor_user_id/);
  assert.doesNotMatch(serialized, /monetary_reward/);
  assert.doesNotMatch(serialized, /uploaded_by/);
  assert.doesNotMatch(serialized, /linked_vn_id/);
  assert.doesNotMatch(serialized, /css_result/);
});

test('getAccountAuditResultById rejects CSS audits and audits not owned by the viewer', async () => {
  const service = createAccountAuditResultService({
    resolveViewerIdentity: async () => ({
      userId: 'viewer-1',
      userKey: 'user-key-1',
      employeeIds: [88],
    }),
    listCompletedAuditRows: async () => [],
    getAuditRowById: async ({ auditId }) => {
      if (auditId === 'css-audit') {
        return createAuditRow({
          id: 'css-audit',
          type: 'customer_service',
          css_cashier_user_key: 'user-key-1',
        });
      }

      return createAuditRow({
        id: 'audit-other',
        type: 'service_crew_cctv',
        scc_odoo_employee_id: 99,
      });
    },
    listAuditMessages: async () => [],
  });

  await assert.rejects(
    () =>
      service.getAccountAuditResultById({
        userId: 'viewer-1',
        auditId: 'css-audit',
      }),
    /Audit result not found/,
  );

  await assert.rejects(
    () =>
      service.getAccountAuditResultById({
        userId: 'viewer-1',
        auditId: 'audit-other',
      }),
    /Audit result not found/,
  );
});
