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

const { calculateKpiScoresWithQueryDeps } = await import('./epiCalculation.service.js');

test('calculateKpiScoresWithQueryDeps fetches slots and attendance once for both attendance and punctuality', async () => {
  let employeeIdLookups = 0;
  let slotFetches = 0;
  let attendanceFetches = 0;
  let posOrderFetches = 0;
  let branchOrderFetches = 0;
  let globalBranchLookups = 0;

  const result = await calculateKpiScoresWithQueryDeps({
    userId: 'user-1',
    userKey: 'website-key-1',
    cssAudits: null,
    peerEvaluations: null,
    complianceAudit: null,
    violationNotices: null,
  }, {
    getOdooEmployeeIdsByWebsiteKey: async () => {
      employeeIdLookups += 1;
      return [101];
    },
    getScheduledSlots: async () => {
      slotFetches += 1;
      return [
        {
          employee_id: [101, 'Alex Crew'],
          start_datetime: '2026-03-10T01:00:00.000Z',
          end_datetime: '2026-03-10T09:00:00.000Z',
          allocated_hours: 8,
        },
      ];
    },
    getAttendanceRecords: async () => {
      attendanceFetches += 1;
      return [
        {
          employee_id: [101, 'Alex Crew'],
          check_in: '2026-03-10T01:00:00.000Z',
          check_out: '2026-03-10T09:00:00.000Z',
        },
      ];
    },
    getPosOrders: async () => {
      posOrderFetches += 1;
      return [
        {
          amount_total: 150,
          company_id: [12, 'Main Branch'],
          date_order: '2026-03-10 06:30:00',
        },
      ];
    },
    getGlobalActiveOdooBranchIds: async () => {
      globalBranchLookups += 1;
      return [12];
    },
    getBranchPosOrders: async () => {
      branchOrderFetches += 1;
      return [{ amount_total: 120 }, { amount_total: 180 }];
    },
  });

  assert.equal(employeeIdLookups, 1);
  assert.equal(slotFetches, 1);
  assert.equal(attendanceFetches, 1);
  assert.equal(posOrderFetches, 1);
  assert.equal(globalBranchLookups, 1);
  assert.equal(branchOrderFetches, 1);
  assert.equal(result.breakdown.attendance.rate, 100);
  assert.equal(result.breakdown.punctuality.rate, 100);
});

test('calculateKpiScoresWithQueryDeps benchmarks AOV against all active mapped tenant branches', async () => {
  const branchOrderLookups: number[] = [];

  const result = await calculateKpiScoresWithQueryDeps({
    userId: 'user-1',
    userKey: 'website-key-1',
    cssAudits: null,
    peerEvaluations: null,
    complianceAudit: null,
    violationNotices: null,
  }, {
    getOdooEmployeeIdsByWebsiteKey: async () => [101],
    getScheduledSlots: async () => [],
    getAttendanceRecords: async () => [],
    getPosOrders: async () => [
      {
        amount_total: 150,
        company_id: [12, 'Main Branch'],
        date_order: '2026-03-10 06:30:00',
      },
    ],
    getGlobalActiveOdooBranchIds: async () => [12, 99],
    getBranchPosOrders: async (branchId) => {
      branchOrderLookups.push(branchId);
      if (branchId === 12) {
        return [{ amount_total: 100 }, { amount_total: 100 }];
      }

      return [{ amount_total: 300 }];
    },
  });

  assert.deepEqual(branchOrderLookups, [12, 99]);
  assert.equal(result.breakdown.aov.value, 150);
  assert.equal(result.breakdown.aov.branch_avg, 166.67);
  assert.equal(result.breakdown.aov.impact, -1);
});

test('calculateKpiScoresWithQueryDeps keeps employee AOV visible when no global branch benchmark can be built', async () => {
  const result = await calculateKpiScoresWithQueryDeps({
    userId: 'user-1',
    userKey: 'website-key-1',
    cssAudits: null,
    peerEvaluations: null,
    complianceAudit: null,
    violationNotices: null,
  }, {
    getOdooEmployeeIdsByWebsiteKey: async () => [101],
    getScheduledSlots: async () => [],
    getAttendanceRecords: async () => [],
    getPosOrders: async () => [
      {
        amount_total: 180,
        company_id: [12, 'Main Branch'],
        date_order: '2026-03-10 06:30:00',
      },
      {
        amount_total: 120,
        company_id: [12, 'Main Branch'],
        date_order: '2026-03-11 06:30:00',
      },
    ],
    getGlobalActiveOdooBranchIds: async () => [],
    getBranchPosOrders: async () => {
      throw new Error('should not fetch branch orders without a global benchmark set');
    },
  });

  assert.equal(result.breakdown.aov.value, 150);
  assert.equal(result.breakdown.aov.branch_avg, null);
  assert.equal(result.breakdown.aov.impact, 0);
});
