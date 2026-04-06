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
  buildPosAlertPayload,
  evaluatePosAlerts,
} = await import('./posAnalyticsAlerts.service.js');

const BRANCH = {
  id: 'branch-1',
  name: 'Main Branch',
  companyId: 'company-1',
  companyName: 'Company One',
  odooCompanyId: 5,
};

const BASE_SESSION = {
  sessionName: 'POS/0001',
  branchId: BRANCH.id,
  branchName: BRANCH.name,
  companyId: BRANCH.odooCompanyId,
  startAt: '2026-04-06 00:30:00',
  stopAt: '2026-04-06 08:30:00',
  state: 'closed' as const,
  openingCash: 100,
  expectedClosingCash: 200,
  actualClosingCash: 200,
  cashVariance: 0,
  netSales: 120,
  grossSales: 135,
  discounts: 10,
  refunds: 5,
  transactionCount: 14,
  durationMinutes: 480,
  paymentBreakdown: [{ method: 'Cash', amount: 120 }],
  topRefundedProducts: [],
};

test('buildPosAlertPayload creates a uniform webhook payload shape', () => {
  const payload = buildPosAlertPayload({
    alertCode: 'high_cash_variance',
    branch: BRANCH,
    session: {
      ...BASE_SESSION,
      cashVariance: 650,
      expectedClosingCash: 300,
      actualClosingCash: 950,
    },
    triggeredAt: new Date('2026-04-07T04:30:00.000Z'),
    sentAt: new Date('2026-04-07T04:31:00.000Z'),
    threshold: {
      metric: 'cash_variance',
      comparator: 'gt',
      value: 500,
      unit: 'php',
    },
    context: {
      baseline_window_days: 30,
      direction: 'high',
    },
    monitorRange: {
      rangeStartYmd: '2026-04-06',
      rangeEndYmd: '2026-04-07',
    },
    environment: 'production',
  });

  assert.equal(payload.event, 'pos_alert.triggered');
  assert.equal(payload.version, 1);
  assert.equal(payload.environment, 'production');
  assert.equal(payload.alert.code, 'high_cash_variance');
  assert.equal(payload.alert.title, '🔴 High Cash Variance Alert');
  assert.equal(payload.branch.id, BRANCH.id);
  assert.equal(payload.session.name, BASE_SESSION.sessionName);
  assert.equal(payload.threshold.metric, 'cash_variance');
  assert.equal(payload.meta.monitor_window_start_ymd, '2026-04-06');
  assert.equal(payload.meta.monitor_window_end_ymd, '2026-04-07');
});

test('evaluatePosAlerts uses a rolling baseline and ignores incomplete open-session cash variance', () => {
  const baselineSessions = Array.from({ length: 30 }, (_, index) => ({
    ...BASE_SESSION,
    sessionName: `BASE/${index + 1}`,
    startAt: `2026-03-${String(index + 1).padStart(2, '0')} 01:00:00`,
    stopAt: `2026-03-${String(index + 1).padStart(2, '0')} 09:00:00`,
    netSales: 100,
    grossSales: 110,
  }));

  const alerts = evaluatePosAlerts({
    branches: [BRANCH],
    currentSessions: [
      {
        ...BASE_SESSION,
        sessionName: 'POS/HIGH',
        startAt: '2026-04-07 01:00:00',
        stopAt: '2026-04-07 09:00:00',
        netSales: 350,
        grossSales: 365,
        cashVariance: 650,
        expectedClosingCash: 200,
        actualClosingCash: 850,
      },
      {
        ...BASE_SESSION,
        sessionName: 'POS/OPEN',
        startAt: '2026-04-06 00:00:00',
        stopAt: null,
        state: 'opened',
        actualClosingCash: 0,
        cashVariance: -900,
      },
    ],
    rollingBaselineSessions: baselineSessions,
    monitorRange: {
      rangeStartYmd: '2026-04-06',
      rangeEndYmd: '2026-04-07',
    },
    now: new Date('2026-04-07T13:30:00+08:00'),
    environment: 'production',
  });

  const alertCodes = alerts.map((alert: any) => alert.alert.code);

  assert.ok(alertCodes.includes('high_cash_variance'));
  assert.ok(alertCodes.includes('abnormal_sales_session'));
  assert.ok(alertCodes.includes('unclosed_session'));
  assert.equal(
    alerts.some((alert: any) => (
      alert.alert.code === 'high_cash_variance' && alert.session.name === 'POS/OPEN'
    )),
    false,
    'open sessions should not raise high cash variance alerts before closing cash is final',
  );
});
