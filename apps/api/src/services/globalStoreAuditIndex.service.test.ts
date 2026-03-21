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

const { buildProjectionRow } = await import('./globalStoreAuditIndex.service.js');

test('buildProjectionRow sanitizes legacy JSON strings before projection upsert', () => {
  assert.equal(typeof buildProjectionRow, 'function');

  const projected = buildProjectionRow!(
    {
      id: 'company-1',
      name: 'Alpha Foods',
      slug: 'alpha-foods',
      dbName: 'tenant_alpha',
    },
    {
      id: 'audit-1',
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
      css_order_lines: '{"broken"}',
      css_payments: '[{"name":"Cash","amount":399}]',
      css_star_rating: null,
      css_criteria_scores: '{"greeting":4,"order_accuracy":5,"suggestive_selling":4,"service_efficiency":4,"professionalism":4}',
      css_audit_log: null,
      css_ai_report: null,
      comp_odoo_employee_id: null,
      comp_employee_name: null,
      comp_employee_avatar: null,
      comp_check_in_time: null,
      comp_extra_fields: '{"also-broken"}',
      comp_productivity_rate: null,
      comp_uniform: null,
      comp_hygiene: null,
      comp_sop: null,
      comp_ai_report: null,
    },
  );

  assert.equal(projected.css_order_lines, null);
  assert.deepEqual(projected.css_payments, [{ name: 'Cash', amount: 399 }]);
  assert.deepEqual(projected.css_criteria_scores, {
    greeting: 4,
    order_accuracy: 5,
    suggestive_selling: 4,
    service_efficiency: 4,
    professionalism: 4,
  });
  assert.equal(projected.comp_extra_fields, null);
});
