import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const {
  CssAuditCard,
} = await import('../src/features/store-audits/components/CssAuditCard');
const {
  ServiceCrewCctvAuditCard,
} = await import('../src/features/store-audits/components/ServiceCrewCctvAuditCard');
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
  audited_user_avatar_url: null,
  css_date_order: '2026-03-22T01:10:00.000Z',
  css_amount_total: '399.00',
  css_order_lines: [],
  css_payments: [],
  css_star_rating: null,
  css_criteria_scores: null,
  css_audit_log: null,
  css_ai_report: null,
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
};

const sccAudit = {
  ...cssAudit,
  id: 'audit-scc-1',
  type: 'service_crew_cctv' as const,
  company: {
    id: 'company-b',
    name: 'Beta Retail',
    slug: 'beta-retail',
  },
  css_odoo_order_id: null,
  css_cashier_name: null,
  css_cashier_user_key: null,
  audited_user_key: 'employee-key-99',
  scc_odoo_employee_id: 99,
  scc_employee_name: 'Employee Two',
};

const accountAudit = {
  id: 'audit-result-1',
  type: 'service_crew_cctv' as const,
  type_label: 'Service Crew CCTV Audit' as const,
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
    result_line: 'Completed with 4 compliance checks and 4 customer service ratings.',
    overall_value: null,
    overall_max: null,
    overall_unit: 'text' as const,
  },
  ai_report: 'General Audit Report\nStrong service awareness.',
  audit_trail: [],
  scc_result: {
    compliance_criteria: {
      productivity_rate: true,
      uniform_compliance: true,
      hygiene_compliance: false,
      sop_compliance: null,
    },
    customer_service_criteria: {
      customer_interaction: 4,
      cashiering: 5,
      suggestive_selling_and_upselling: 4,
      service_efficiency: 4,
    },
  },
};

test('store audit cards render company context alongside branch context', () => {
  const cssMarkup = renderToStaticMarkup(
    <CssAuditCard audit={cssAudit as any} selected={false} onSelect={() => undefined} />,
  );
  const sccMarkup = renderToStaticMarkup(
    <ServiceCrewCctvAuditCard audit={sccAudit as any} selected={false} onSelect={() => undefined} />,
  );

  assert.match(cssMarkup, /Alpha Foods/);
  assert.match(cssMarkup, /Main Branch/);
  assert.match(sccMarkup, /Beta Retail/);
  assert.match(sccMarkup, /Main Branch/);
});

test('account audit results keep company context in the card and SCC detail view', () => {
  const cardMarkup = renderToStaticMarkup(
    <AccountAuditResultCard audit={accountAudit as any} selected={false} onSelect={() => undefined} />,
  );
  const detailMarkup = renderToStaticMarkup(
    <AccountAuditResultDetailPanel audit={accountAudit as any} />,
  );

  assert.match(cardMarkup, /Alpha Foods/);
  assert.match(cardMarkup, /Main Branch/);
  assert.match(detailMarkup, /Alpha Foods/);
  assert.match(detailMarkup, /Audit Time/);
  assert.match(detailMarkup, /Completed/);
});
