import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const {
  AuditResultsPageContent,
} = await import('../src/features/account/components/AuditResultsPageContent');
const {
  AccountAuditResultCard,
} = await import('../src/features/account/components/AccountAuditResultCard');
const {
  AccountAuditResultDetailPanel,
} = await import('../src/features/account/components/AccountAuditResultDetailPanel');

const cssAudit = {
  id: 'audit-css-1',
  type: 'customer_service' as const,
  type_label: 'Customer Service Audit' as const,
  branch: {
    id: 'branch-1',
    name: 'Main Branch',
  },
  completed_at: '2026-03-21T10:00:00.000Z',
  observed_at: '2026-03-21T09:15:00.000Z',
  summary: {
    result_line: 'Overall score: 4.2 / 5',
    overall_value: 4.2,
    overall_max: 5,
    overall_unit: 'rating' as const,
  },
  ai_report: 'Strong service recovery.',
  audit_trail: [
    {
      id: 'trail-1',
      content: 'Cashier greeted within 5 seconds.',
      created_at: '2026-03-21T09:20:00.000Z',
      attachments: [
        {
          id: 'attachment-1',
          file_url: 'https://example.com/photo.jpg',
          file_name: 'audit-photo.jpg',
          file_size: 1024,
          content_type: 'image/jpeg',
          created_at: '2026-03-21T09:21:00.000Z',
        },
      ],
    },
  ],
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

const complianceAudit = {
  id: 'audit-comp-1',
  type: 'compliance' as const,
  type_label: 'Compliance Audit' as const,
  branch: {
    id: 'branch-1',
    name: 'Main Branch',
  },
  completed_at: '2026-03-21T10:00:00.000Z',
  observed_at: '2026-03-21T08:30:00.000Z',
  summary: {
    result_line: 'Passed checks: 3 / 4',
    overall_value: 3,
    overall_max: 4,
    overall_unit: 'checks' as const,
  },
  ai_report: 'Follow SOP reminders.',
  audit_trail: [],
  css_result: null,
  compliance_result: {
    checks: {
      productivity_rate: true,
      uniform: true,
      hygiene: false,
      sop: true,
    },
    passed_count: 3,
    total_checks: 4 as const,
  },
};

test('AuditResultsPageContent matches the store-audits shell without status tabs', () => {
  const markup = renderToStaticMarkup(
    <AuditResultsPageContent
      loading={false}
      items={[cssAudit, complianceAudit]}
      total={2}
      category="all"
      selectedAuditId={null}
      currentPage={1}
      totalPages={3}
      onCategoryChange={() => undefined}
      onSelectAudit={() => undefined}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );

  assert.match(markup, />Audit Results</);
  assert.match(markup, />All Categories</);
  assert.match(markup, />Customer Service Audit</);
  assert.match(markup, />Compliance Audit</);
  assert.match(markup, /Page 1 of 3/);
  assert.doesNotMatch(markup, />pending</i);
  assert.doesNotMatch(markup, />processing</i);
  assert.doesNotMatch(markup, />completed</i);
});

test('AccountAuditResultCard omits auditor and reward metadata', () => {
  const markup = renderToStaticMarkup(
    <AccountAuditResultCard
      audit={cssAudit}
      selected={false}
      onSelect={() => undefined}
    />,
  );

  assert.match(markup, /Main Branch/);
  assert.match(markup, /Overall score: 4.2 \/ 5/);
  assert.doesNotMatch(markup, /Auditor:/);
  assert.doesNotMatch(markup, /Rate:/);
});

test('AccountAuditResultDetailPanel is read-only and anonymous while keeping audit content', () => {
  const markup = renderToStaticMarkup(<AccountAuditResultDetailPanel audit={cssAudit} />);

  assert.match(markup, /Criteria Scores/);
  assert.match(markup, /Overall Average/);
  assert.match(markup, /Audit Trail/);
  assert.match(markup, /Cashier greeted within 5 seconds\./);
  assert.match(markup, /audit-photo\.jpg/);
  assert.match(markup, /AI Report/);
  assert.match(markup, /Strong service recovery\./);
  assert.doesNotMatch(markup, /Auditor/);
  assert.doesNotMatch(markup, /Rate/);
  assert.doesNotMatch(markup, /Process/);
  assert.doesNotMatch(markup, /Audit Complete/);
  assert.doesNotMatch(markup, /Send Message/);
  assert.doesNotMatch(markup, /Request Violation Notice/);
});
