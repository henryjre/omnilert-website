import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const {
  CssAuditCard,
} = await import('../src/features/store-audits/components/CssAuditCard');
const {
  ComplianceAuditCard,
} = await import('../src/features/store-audits/components/ComplianceAuditCard');
const {
  AccountAuditResultCard,
} = await import('../src/features/account/components/AccountAuditResultCard');
const {
  AccountAuditResultDetailPanel,
} = await import('../src/features/account/components/AccountAuditResultDetailPanel');

const cssAudit = {
  id: 'audit-css-1',
  type: 'customer_service' as const,
  status: 'pending' as const,
  branch_id: 'branch-1',
  branch_name: 'Main Branch',
  company: {
    id: 'company-a',
    name: 'Alpha Foods',
    slug: 'alpha-foods',
  },
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
  css_order_lines: [],
  css_payments: [],
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
};

const complianceAudit = {
  ...cssAudit,
  id: 'audit-comp-1',
  type: 'compliance' as const,
  company: {
    id: 'company-b',
    name: 'Beta Retail',
    slug: 'beta-retail',
  },
  css_odoo_order_id: null,
  css_cashier_name: null,
  css_cashier_user_key: null,
  css_date_order: null,
  css_amount_total: null,
  comp_odoo_employee_id: 99,
  comp_employee_name: 'Employee Two',
  comp_check_in_time: '2026-03-22T02:00:00.000Z',
};

const accountAudit = {
  id: 'audit-result-1',
  type: 'customer_service' as const,
  type_label: 'Customer Service Audit' as const,
  company: {
    id: 'company-a',
    name: 'Alpha Foods',
    slug: 'alpha-foods',
  },
  branch: {
    id: 'branch-1',
    name: 'Main Branch',
  },
  completed_at: '2026-03-22T03:00:00.000Z',
  observed_at: '2026-03-22T02:45:00.000Z',
  summary: {
    result_line: 'Overall score: 4.2 / 5',
    overall_value: 4.2,
    overall_max: 5,
    overall_unit: 'rating' as const,
  },
  ai_report: 'Strong service recovery.',
  audit_trail: [],
  css_result: {
    criteria_scores: {
      greeting: 4,
      order_accuracy: 5,
      suggestive_selling: 4,
      service_efficiency: 4,
      professionalism: 4,
    },
    overall_rating: 4.2,
  },
  compliance_result: null,
};

test('store audit cards render company context alongside branch context', () => {
  const cssMarkup = renderToStaticMarkup(
    <CssAuditCard audit={cssAudit as any} selected={false} onSelect={() => undefined} />,
  );
  const complianceMarkup = renderToStaticMarkup(
    <ComplianceAuditCard audit={complianceAudit as any} selected={false} onSelect={() => undefined} />,
  );

  assert.match(cssMarkup, /Alpha Foods/);
  assert.match(cssMarkup, /Main Branch/);
  assert.match(complianceMarkup, /Beta Retail/);
  assert.match(complianceMarkup, /Main Branch/);
});

test('account audit results render company context in both card and detail views', () => {
  const cardMarkup = renderToStaticMarkup(
    <AccountAuditResultCard audit={accountAudit as any} selected={false} onSelect={() => undefined} />,
  );
  const detailMarkup = renderToStaticMarkup(
    <AccountAuditResultDetailPanel audit={accountAudit as any} />,
  );

  assert.match(cardMarkup, /Alpha Foods/);
  assert.match(cardMarkup, /Main Branch/);
  assert.match(detailMarkup, /Alpha Foods/);
  assert.match(detailMarkup, /Main Branch/);
});
