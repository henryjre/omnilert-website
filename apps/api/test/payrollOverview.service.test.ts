import assert from 'node:assert/strict';
import test from 'node:test';
import type { PayslipListItem } from '@omnilert/shared';
import {
  applyPayrollReviewStatusOverrides,
  resolvePayrollOverviewPeriodRange,
  validatePayrollOverview,
  type PayrollOverviewScopeData,
  type PayrollReviewStatusRow,
  type PayrollReviewStatusUpsertRow,
  type ValidatePayrollOverviewDeps,
} from '../src/services/payrollOverview.service.ts';

function buildPayslip(overrides: Partial<PayslipListItem>): PayslipListItem {
  return {
    id: 'sample-id',
    name: 'Sample Payslip',
    date_from: '2026-04-01',
    date_to: '2026-04-15',
    odoo_state: 'draft',
    status: 'draft',
    company_id: 7,
    company_name: 'Sample Branch',
    employee_id: 99,
    employee_name: '1001 - Sample Employee',
    cutoff: 1,
    is_pending: false,
    net_pay: 1250,
    avatar_url: null,
    ...overrides,
  };
}

test('resolvePayrollOverviewPeriodRange returns the active semi-month for current periods', () => {
  const result = resolvePayrollOverviewPeriodRange('current', new Date(2026, 3, 22));

  assert.deepEqual(result, {
    dateFrom: '2026-04-16',
    dateTo: '2026-04-30',
    cutoff: 2,
  });
});

test('resolvePayrollOverviewPeriodRange returns the immediate prior cutoff for previous periods in the second half', () => {
  const result = resolvePayrollOverviewPeriodRange('previous', new Date(2026, 3, 22));

  assert.deepEqual(result, {
    dateFrom: '2026-04-01',
    dateTo: '2026-04-15',
    cutoff: 1,
  });
});

test('resolvePayrollOverviewPeriodRange crosses the month boundary for previous periods in the first half', () => {
  const result = resolvePayrollOverviewPeriodRange('previous', new Date(2026, 3, 10));

  assert.deepEqual(result, {
    dateFrom: '2026-03-16',
    dateTo: '2026-03-31',
    cutoff: 2,
  });
});

test('applyPayrollReviewStatusOverrides marks only matching payroll items as on_hold', () => {
  const items = [
    buildPayslip({
      id: 'draft-slip',
      company_id: 7,
      employee_id: 99,
      date_from: '2026-04-01',
      date_to: '2026-04-15',
      status: 'draft',
    }),
    buildPayslip({
      id: 'completed-slip',
      company_id: 7,
      employee_id: 42,
      date_from: '2026-04-01',
      date_to: '2026-04-15',
      status: 'completed',
      odoo_state: 'done',
    }),
  ];

  const result = applyPayrollReviewStatusOverrides(items, [
    {
      id: 'review-1',
      company_id: 'company-1',
      odoo_company_id: 7,
      employee_odoo_id: 99,
      date_from: '2026-04-01',
      date_to: '2026-04-15',
      status: 'on_hold',
      reason: 'Attendance mismatch',
      flagged_by_user_id: null,
      resolved_by_user_id: null,
      created_at: new Date('2026-04-20T08:00:00Z'),
      updated_at: new Date('2026-04-20T08:00:00Z'),
    },
  ]);

  assert.equal(result[0].status, 'on_hold');
  assert.equal(result[1].status, 'completed');
});

test('validatePayrollOverview combines blocker types, upserts matching holds, and clears stale scoped rows', async () => {
  const scope: PayrollOverviewScopeData = {
    items: [
      buildPayslip({
        id: 'draft-slip',
        company_id: 7,
        company_name: 'North Branch',
        employee_id: 99,
        employee_name: '1001 - Alice Employee',
        avatar_url: 'https://cdn.example.com/alice.png',
      }),
      buildPayslip({
        id: 'pending-slip',
        company_id: 8,
        company_name: 'South Branch',
        employee_id: 42,
        employee_name: '1002 - Bob Employee',
        status: 'pending',
        odoo_state: '',
        is_pending: true,
        net_pay: undefined,
      }),
    ],
    period: {
      dateFrom: '2026-04-01',
      dateTo: '2026-04-15',
      cutoff: 1,
    },
    branches: [
      { branchId: 'branch-1', odooCompanyId: 7, name: 'North Branch' },
      { branchId: 'branch-2', odooCompanyId: 8, name: 'South Branch' },
    ],
    odooCompanyIds: [7, 8],
    userByOdooEmployeeId: new Map([
      [
        99,
        {
          userId: 'user-1',
          userKey: 'key-1',
          avatarUrl: 'https://cdn.example.com/alice.png',
        },
      ],
      [
        42,
        {
          userId: 'user-2',
          userKey: 'key-2',
          avatarUrl: null,
        },
      ],
    ]),
  };

  const existingRows: PayrollReviewStatusRow[] = [
    {
      id: 'review-match',
      company_id: 'company-1',
      odoo_company_id: 7,
      employee_odoo_id: 99,
      date_from: '2026-04-01',
      date_to: '2026-04-15',
      status: 'on_hold',
      reason: 'Old reason',
      flagged_by_user_id: 'manager-0',
      resolved_by_user_id: null,
      created_at: new Date('2026-04-20T08:00:00Z'),
      updated_at: new Date('2026-04-20T08:00:00Z'),
    },
    {
      id: 'review-stale',
      company_id: 'company-1',
      odoo_company_id: 8,
      employee_odoo_id: 42,
      date_from: '2026-04-01',
      date_to: '2026-04-15',
      status: 'on_hold',
      reason: 'Stale reason',
      flagged_by_user_id: 'manager-0',
      resolved_by_user_id: null,
      created_at: new Date('2026-04-20T08:00:00Z'),
      updated_at: new Date('2026-04-20T08:00:00Z'),
    },
  ];

  const deletedCalls: string[][] = [];
  const upsertCalls: PayrollReviewStatusUpsertRow[][] = [];

  const deps: ValidatePayrollOverviewDeps = {
    loadScope: async () => scope,
    listReviewStatuses: async () => existingRows,
    listShiftAuthorizationBlockers: async () => [
      { userId: 'user-1', odooCompanyId: 7 },
      { userId: 'user-1', odooCompanyId: 7 },
    ],
    listPayrollAdjustmentBlockers: async () => [
      { userId: 'user-1', odooCompanyId: 7 },
      { userId: 'user-9', odooCompanyId: 8 },
    ],
    deleteReviewStatusesByIds: async (ids) => {
      deletedCalls.push(ids);
      return ids.length;
    },
    upsertReviewStatuses: async (rows) => {
      upsertCalls.push(rows);
    },
  };

  const result = await validatePayrollOverview(
    {
      companyId: 'company-1',
      actingUserId: 'manager-1',
      branchIds: ['branch-1', 'branch-2'],
      period: 'current',
    },
    deps,
  );

  assert.deepEqual(result.period, scope.period);
  assert.deepEqual(result.summary, {
    scannedPayslips: 2,
    blockedPayslips: 1,
    clearedPayslips: 1,
    shiftAuthorizationBlocks: 1,
    payrollAdjustmentBlocks: 1,
  });
  assert.deepEqual(deletedCalls, [['review-stale']]);
  assert.equal(upsertCalls.length, 1);
  assert.deepEqual(upsertCalls[0], [
    {
      companyId: 'company-1',
      odooCompanyId: 7,
      employeeOdooId: 99,
      dateFrom: '2026-04-01',
      dateTo: '2026-04-15',
      reason: 'Pending shift authorization; Pending payroll adjustment authorization',
      flaggedByUserId: 'manager-1',
    },
  ]);
  assert.deepEqual(result.items, [
    {
      odooCompanyId: 7,
      employeeOdooId: 99,
      employeeName: '1001 - Alice Employee',
      avatarUrl: 'https://cdn.example.com/alice.png',
      companyName: 'North Branch',
      blockerTypes: ['shift_authorization', 'payroll_adjustment_authorization'],
      messages: [
        '1001 - Alice Employee still has a pending shift authorization.',
        '1001 - Alice Employee still has a pending adjustment for authorization.',
      ],
    },
  ]);
});

test('validatePayrollOverview ignores blocker rows that do not match the scoped payslip branch and employee', async () => {
  const scope: PayrollOverviewScopeData = {
    items: [
      buildPayslip({
        company_id: 7,
        company_name: 'North Branch',
        employee_id: 99,
        employee_name: '1001 - Alice Employee',
      }),
    ],
    period: {
      dateFrom: '2026-04-16',
      dateTo: '2026-04-30',
      cutoff: 2,
    },
    branches: [{ branchId: 'branch-1', odooCompanyId: 7, name: 'North Branch' }],
    odooCompanyIds: [7],
    userByOdooEmployeeId: new Map([
      [
        99,
        {
          userId: 'user-1',
          userKey: 'key-1',
          avatarUrl: null,
        },
      ],
    ]),
  };

  const upsertCalls: PayrollReviewStatusUpsertRow[][] = [];

  const result = await validatePayrollOverview(
    {
      companyId: 'company-1',
      actingUserId: 'manager-1',
      branchIds: ['branch-1'],
      period: 'previous',
    },
    {
      loadScope: async (input) => {
        assert.equal(input.period, 'previous');
        return scope;
      },
      listReviewStatuses: async () => [],
      listShiftAuthorizationBlockers: async () => [{ userId: 'user-1', odooCompanyId: 8 }],
      listPayrollAdjustmentBlockers: async () => [{ userId: 'user-2', odooCompanyId: 7 }],
      deleteReviewStatusesByIds: async () => 0,
      upsertReviewStatuses: async (rows) => {
        upsertCalls.push(rows);
      },
    } satisfies ValidatePayrollOverviewDeps,
  );

  assert.deepEqual(result.summary, {
    scannedPayslips: 1,
    blockedPayslips: 0,
    clearedPayslips: 0,
    shiftAuthorizationBlocks: 0,
    payrollAdjustmentBlocks: 0,
  });
  assert.deepEqual(result.items, []);
  assert.deepEqual(upsertCalls, [[]]);
});
