import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  getSnapshotDateForScheduledRun,
  getRollingWindowForSnapshotDate,
  mapBreakdownToRollingMetricSnapshot,
} = await import('./employeeAnalyticsSnapshot.service.js');

test('getSnapshotDateForScheduledRun returns previous Manila day', () => {
  // 2026-03-29 03:30:00 Asia/Manila
  const scheduledFor = new Date('2026-03-28T19:30:00.000Z');

  const snapshotDate = getSnapshotDateForScheduledRun(scheduledFor);

  assert.equal(snapshotDate, '2026-03-28');
});

test('getRollingWindowForSnapshotDate returns inclusive 30-day range', () => {
  const window = getRollingWindowForSnapshotDate('2026-03-28');

  assert.equal(window.windowStartDate, '2026-02-27');
  assert.equal(window.windowEndDate, '2026-03-28');
});

test('mapBreakdownToRollingMetricSnapshot returns rolling metrics plus branch AOV benchmark', () => {
  const snapshot = mapBreakdownToRollingMetricSnapshot({
    customer_interaction: { score: 4.5, impact: 0 },
    cashiering: { score: 4.5, impact: 0 },
    suggestive_selling_and_upselling: { score: 4.5, impact: 0 },
    service_efficiency: { score: 4.5, impact: 0 },
    wrs: { score: 4.1, impact: 0.5 },
    pcs: { score: 4.2, impact: 0 },
    attendance: { rate: 98.5, impact: 1 },
    punctuality: { rate: 96.2, impact: 0 },
    productivity: { rate: 91.4, impact: 0 },
    aov: { value: 420.5, branch_avg: 390.2, impact: 1 },
    uniform: { rate: 99.2, impact: 1 },
    hygiene: { rate: 97.8, impact: 1 },
    sop: { rate: 96.4, impact: 0 },
    awards: { count: 3, total_increase: 7.5, impact: 0 },
    penalties: { count: 1, total_decrease: 2.5, impact: 0 },
    violations: { count: 1, total_decrease: 1, impact: -1 },
  });

  assert.deepEqual(snapshot, {
    customerInteractionScore: 4.5,
    cashieringScore: 4.5,
    suggestiveSellingAndUpsellingScore: 4.5,
    serviceEfficiencyScore: 4.5,
    workplaceRelationsScore: 4.1,
    attendanceRate: 98.5,
    punctualityRate: 96.2,
    productivityRate: 91.4,
    averageOrderValue: 420.5,
    branchAov: 390.2,
    uniformComplianceRate: 99.2,
    hygieneComplianceRate: 97.8,
    sopComplianceRate: 96.4,
  });
});

test('employee analytics snapshot reads exclude archived and inactive employees', () => {
  const source = readFileSync(new URL('./employeeAnalyticsSnapshot.service.ts', import.meta.url), 'utf8');

  assert.match(
    source,
    /\.whereBetween\('s\.snapshot_date', \[startYmd, endYmd\]\)[\s\S]*\.where\('u\.is_active', true\)[\s\S]*\.where\('u\.employment_status', 'active'\)/,
  );
  assert.match(
    source,
    /const q = dbConn\('users as u'\)[\s\S]*\.whereExists\(function\(\)[\s\S]*\.where\('u\.is_active', true\)[\s\S]*\.where\('u\.employment_status', 'active'\)[\s\S]*\.select\('u\.id', 'u\.first_name', 'u\.last_name', 'u\.avatar_url', 'u\.epi_score'\)/,
  );
});
