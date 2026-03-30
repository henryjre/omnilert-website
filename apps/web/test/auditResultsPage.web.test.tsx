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

const sccAudit = {
  id: 'audit-scc-1',
  type: 'service_crew_cctv' as const,
  type_label: 'Service Crew CCTV Audit' as const,
  branch: {
    id: 'branch-1',
    name: 'Main Branch',
  },
  completed_at: '2026-03-21T10:00:00.000Z',
  observed_at: '2026-03-21T08:30:00.000Z',
  summary: {
    result_line: 'Completed with 4 compliance checks and 4 customer service ratings.',
    overall_value: null,
    overall_max: null,
    overall_unit: 'text' as const,
  },
  ai_report: 'General Audit Report\nStrong service recovery.',
  audit_trail: [
    {
      id: 'trail-1',
      content: 'Crew member stayed attentive during the rush.',
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

test('AuditResultsPageContent shows the SCC-only results shell', () => {
  const markup = renderToStaticMarkup(
    <AuditResultsPageContent
      loading={false}
      items={[sccAudit]}
      total={1}
      selectedAuditId={null}
      currentPage={1}
      totalPages={3}
      onSelectAudit={() => undefined}
      onPageChange={() => undefined}
    />,
  );

  assert.match(markup, /My Audit Results/);
  assert.match(markup, /Service Crew CCTV Audit/);
  assert.match(markup, /Go to previous page/);
  assert.match(markup, /Go to next page/);
  assert.match(markup, /aria-current="page"/);
  assert.match(markup, /Go to page 1/);
  assert.doesNotMatch(markup, />All Categories</);
  assert.doesNotMatch(markup, />pending</i);
  assert.doesNotMatch(markup, />processing</i);
  assert.doesNotMatch(markup, />completed</i);
});

test('AccountAuditResultCard keeps summary text and omits auditor and reward metadata', () => {
  const markup = renderToStaticMarkup(
    <AccountAuditResultCard
      audit={sccAudit as any}
      selected={false}
      onSelect={() => undefined}
    />,
  );

  assert.match(markup, /Main Branch/);
  assert.match(markup, /Completed with 4 compliance checks and 4 customer service ratings\./);
  assert.doesNotMatch(markup, /Auditor:/);
  assert.doesNotMatch(markup, /Audit Reward/);
  assert.doesNotMatch(markup, /Monetary Reward/);
});

test('AccountAuditResultDetailPanel is read-only and renders SCC sections', () => {
  const markup = renderToStaticMarkup(<AccountAuditResultDetailPanel audit={sccAudit as any} />);

  assert.match(markup, /Compliance Criteria/);
  assert.match(markup, /Customer Service Criteria/);
  assert.match(markup, /Audit Trail/);
  assert.match(markup, /Crew member stayed attentive during the rush\./);
  assert.match(markup, /audit-photo\.jpg/);
  assert.match(markup, /AI Report/);
  assert.match(markup, /Strong service recovery\./);
  assert.doesNotMatch(markup, /Auditor/);
  assert.doesNotMatch(markup, /Audit Reward/);
  assert.doesNotMatch(markup, /Monetary Reward/);
  assert.doesNotMatch(markup, /Process/);
  assert.doesNotMatch(markup, /Audit Complete/);
  assert.doesNotMatch(markup, /Send Message/);
  assert.doesNotMatch(markup, /Request Violation Notice/);
});
