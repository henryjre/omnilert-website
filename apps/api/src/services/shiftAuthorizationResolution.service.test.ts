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
  assertEmployeeReasonSubmittedForManualReject,
  createShiftAuthorizationRejectResolver,
  reconcileOvertimeForShift,
  syncShiftAuthorizationWithOdoo,
} = await import('./shiftAuthorizationResolution.service.js');
const { db } = await import('../config/database.js');

function createSelectQueryStub(rows: Array<Record<string, unknown>>) {
  let matchedRows = rows;

  const query: Record<string, any> = {
    where(condition: Record<string, unknown>) {
      matchedRows = matchedRows.filter((row) =>
        Object.entries(condition).every(([key, value]) => row[key] === value),
      );
      return query;
    },
    select(...fields: string[]) {
      const pickedRows = matchedRows.map((row) => {
        const selected: Record<string, unknown> = {};
        for (const field of fields) {
          selected[field] = row[field];
        }
        return selected;
      });

      return {
        first: async () => pickedRows[0] ?? null,
      };
    },
    first: async () => matchedRows[0] ?? null,
  };

  return query;
}

function createUnderbreakDbStub(input: {
  shift: { id: string; shift_start: Date; user_id: string; branch_id: string };
  user: { id: string; user_key: string };
  branch: { id: string; odoo_branch_id: string };
}) {
  return ((tableName: string) => {
    switch (tableName) {
      case 'employee_shifts':
        return createSelectQueryStub([input.shift as Record<string, unknown>]);
      case 'users':
        return createSelectQueryStub([input.user as Record<string, unknown>]);
      case 'branches':
        return createSelectQueryStub([input.branch as Record<string, unknown>]);
      default:
        return createSelectQueryStub([]);
    }
  }) as any;
}

function createReconcileDbHarness(input: {
  shifts: Array<Record<string, unknown>>;
  activities?: Array<Record<string, unknown>>;
  auths?: Array<Record<string, unknown>>;
}) {
  const shifts = input.shifts.map((row) => ({ ...row }));
  const activities = (input.activities ?? []).map((row) => ({ ...row }));
  const auths = (input.auths ?? []).map((row) => ({ ...row }));
  const socketEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];

  const getTableRows = (tableName: string): Array<Record<string, unknown>> => {
    switch (tableName) {
      case 'employee_shifts':
        return shifts;
      case 'shift_activities':
        return activities;
      case 'shift_authorizations':
        return auths;
      default:
        return [];
    }
  };

  const tenantDb = ((tableName: string) => {
    const rows = getTableRows(tableName);
    const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
    let selectedFields: string[] | null = null;

    const getMatchedRows = () => rows.filter((row) => predicates.every((predicate) => predicate(row)));
    const applySelection = (matchedRows: Array<Record<string, unknown>>) => {
      if (!selectedFields || selectedFields.includes('*')) return matchedRows;
      return matchedRows.map((row) => {
        const selected: Record<string, unknown> = {};
        for (const field of selectedFields ?? []) {
          selected[field] = row[field];
        }
        return selected;
      });
    };

    const query: Record<string, any> = {
      where(condition: Record<string, unknown>) {
        predicates.push((row) =>
          Object.entries(condition).every(([key, value]) => row[key] === value),
        );
        return query;
      },
      whereNot(condition: Record<string, unknown>) {
        predicates.push((row) =>
          Object.entries(condition).every(([key, value]) => row[key] !== value),
        );
        return query;
      },
      whereNotNull(field: string) {
        predicates.push((row) => row[field] != null);
        return query;
      },
      select(...fields: string[]) {
        selectedFields = fields.flat();
        return query;
      },
      first() {
        const selectedRows = applySelection(getMatchedRows());
        return Promise.resolve(selectedRows[0] ?? null);
      },
      insert(inputRows: Record<string, unknown> | Array<Record<string, unknown>>) {
        const inserted = (Array.isArray(inputRows) ? inputRows : [inputRows]).map((row) => ({ ...row }));
        rows.push(...inserted);
        return {
          returning: async () => inserted,
        };
      },
      update(updates: Record<string, unknown>) {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          Object.assign(row, updates);
        }
        return {
          returning: async () => matchedRows,
        };
      },
      increment(column: string, amount = 1) {
        for (const row of getMatchedRows()) {
          row[column] = Number(row[column] ?? 0) + amount;
        }
        return Promise.resolve();
      },
      decrement(column: string, amount = 1) {
        for (const row of getMatchedRows()) {
          row[column] = Number(row[column] ?? 0) - amount;
        }
        return Promise.resolve();
      },
      delete() {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          const index = rows.indexOf(row);
          if (index >= 0) rows.splice(index, 1);
        }
        return Promise.resolve(matchedRows.length);
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(applySelection(getMatchedRows())).then(resolve, reject);
      },
    };

    return query;
  }) as any;

  return {
    shifts,
    activities,
    auths,
    socketEvents,
    tenantDb,
  };
}

test('assertEmployeeReasonSubmittedForManualReject blocks early check in, early check out, interim duty, and underbreak without an employee reason', () => {
  for (const authType of ['early_check_in', 'early_check_out', 'interim_duty', 'underbreak']) {
    assert.throws(
      () =>
        assertEmployeeReasonSubmittedForManualReject({
          auth_type: authType,
          needs_employee_reason: true,
          employee_reason: '   ',
        }),
      /Employee has not submitted a reason yet/,
      `${authType} should require an employee reason before manual rejection`,
    );
  }

  for (const authType of ['tardiness', 'late_check_out', 'overtime']) {
    assert.doesNotThrow(() =>
      assertEmployeeReasonSubmittedForManualReject({
        auth_type: authType,
        needs_employee_reason: true,
        employee_reason: null,
      }),
    );
  }
});

test('createShiftAuthorizationRejectResolver performs shared rejection updates, side effects, and notifications', async () => {
  const notifications: Array<Record<string, unknown>> = [];
  const socketEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const sideEffects: Array<Record<string, unknown>> = [];
  const decrementedShiftIds: string[] = [];
  const updatedRows: Array<Record<string, unknown>> = [];
  const createdLogs: Array<Record<string, unknown>> = [];

  const rejectAuthorization = createShiftAuthorizationRejectResolver({
    updateAuthorization: async (_id, updates) => {
      updatedRows.push(updates);
      return {
        id: 'auth-1',
        status: 'rejected',
        rejection_reason: updates.rejection_reason,
        resolved_by: updates.resolved_by,
        resolved_at: updates.resolved_at,
      };
    },
    decrementShiftPendingApprovals: async (shiftId) => {
      decrementedShiftIds.push(shiftId);
    },
    createResolutionLog: async (input) => {
      const log = { id: 'log-1', ...input };
      createdLogs.push(log);
      return log;
    },
    dispatchNotification: async (input) => {
      notifications.push(input);
    },
    emitSocketEvent: (event, payload) => {
      socketEvents.push({ event, payload });
    },
    runRejectSideEffects: async (auth) => {
      sideEffects.push(auth);
    },
  });

  const auth = {
    id: 'auth-1',
    company_id: 'company-1',
    shift_id: 'shift-1',
    branch_id: 'branch-1',
    user_id: 'user-1',
    auth_type: 'overtime',
    diff_minutes: 45,
  };

  const resolvedAt = new Date('2026-04-11T04:00:00.000Z');
  const result = await rejectAuthorization({
    auth,
    reason: 'No supporting employee reason was submitted.',
    resolvedAt,
    resolvedBy: 'manager-1',
    resolvedByName: 'Jane Manager',
    companyId: 'company-1',
  });

  assert.equal(updatedRows.length, 1);
  assert.equal(updatedRows[0]?.status, 'rejected');
  assert.equal(updatedRows[0]?.resolved_by, 'manager-1');
  assert.equal(updatedRows[0]?.rejection_reason, 'No supporting employee reason was submitted.');
  assert.deepEqual(decrementedShiftIds, ['shift-1']);
  assert.equal(sideEffects.length, 1);
  assert.equal(sideEffects[0]?.id, 'auth-1');
  assert.equal(notifications.length, 1);
  assert.equal(notifications[0]?.userId, 'user-1');
  assert.equal(notifications[0]?.title, 'Overtime Rejected');
  assert.equal(socketEvents.length, 2);
  assert.equal(socketEvents[0]?.event, 'shift:authorization-updated');
  assert.equal(socketEvents[1]?.event, 'shift:log-new');
  assert.equal(createdLogs.length, 1);
  assert.equal(result.updated.status, 'rejected');

  const parsedChanges = JSON.parse(String(createdLogs[0]?.changes ?? '{}')) as {
    resolution?: string;
    resolved_by_name?: string;
    rejection_reason?: string;
  };
  assert.equal(parsedChanges.resolution, 'rejected');
  assert.equal(parsedChanges.resolved_by_name, 'Jane Manager');
  assert.equal(parsedChanges.rejection_reason, 'No supporting employee reason was submitted.');
});

test('reconcileOvertimeForShift creates locked overtime and increments pending approvals while another auth is still pending', async () => {
  const harness = createReconcileDbHarness({
    shifts: [
      {
        id: 'shift-1',
        company_id: 'company-1',
        branch_id: 'branch-1',
        user_id: 'user-1',
        total_worked_hours: 10,
        allocated_hours: 8,
        pending_approvals: 2,
      },
    ],
    activities: [
      {
        id: 'break-1',
        shift_id: 'shift-1',
        activity_type: 'break',
        end_time: '2026-04-19T08:00:00.000Z',
        duration_minutes: 60,
      },
    ],
    auths: [
      {
        id: 'auth-underbreak',
        shift_id: 'shift-1',
        shift_log_id: 'log-underbreak',
        auth_type: 'underbreak',
        status: 'approved',
        diff_minutes: 55,
      },
      {
        id: 'auth-early',
        shift_id: 'shift-1',
        shift_log_id: 'log-early',
        auth_type: 'early_check_in',
        status: 'pending',
        diff_minutes: 15,
      },
    ],
  });

  await reconcileOvertimeForShift(
    {
      shiftId: 'shift-1',
      triggeringAuth: { shift_log_id: 'log-underbreak' },
    },
    {
      getDbFn: () => harness.tenantDb,
      emitSocketEvent: (event, payload) => {
        harness.socketEvents.push({ event, payload });
      },
    },
  );

  const overtime = harness.auths.find((auth) => auth.auth_type === 'overtime');
  assert.ok(overtime, 'managed overtime should be created');
  assert.equal(overtime?.status, 'locked');
  assert.equal(overtime?.diff_minutes, 60);
  assert.equal(overtime?.needs_employee_reason, false);
  assert.equal(overtime?.shift_log_id, 'log-underbreak');
  assert.equal(harness.shifts[0]?.pending_approvals, 3);
  assert.equal(harness.socketEvents[0]?.event, 'shift:authorization-new');
});

test('reconcileOvertimeForShift updates the existing managed overtime and unlocks it without double-counting pending approvals', async () => {
  const harness = createReconcileDbHarness({
    shifts: [
      {
        id: 'shift-2',
        company_id: 'company-1',
        branch_id: 'branch-1',
        user_id: 'user-1',
        total_worked_hours: 10,
        allocated_hours: 8,
        pending_approvals: 2,
      },
    ],
    activities: [
      {
        id: 'break-2',
        shift_id: 'shift-2',
        activity_type: 'break',
        end_time: '2026-04-19T08:00:00.000Z',
        duration_minutes: 60,
      },
    ],
    auths: [
      {
        id: 'auth-late',
        shift_id: 'shift-2',
        shift_log_id: 'log-late',
        auth_type: 'late_check_out',
        status: 'rejected',
        diff_minutes: 30,
      },
      {
        id: 'auth-ot',
        company_id: 'company-1',
        shift_id: 'shift-2',
        shift_log_id: 'log-old-overtime',
        branch_id: 'branch-1',
        user_id: 'user-1',
        auth_type: 'overtime',
        status: 'locked',
        diff_minutes: 10,
        needs_employee_reason: true,
        resolved_by: 'manager-1',
        resolved_at: '2026-04-19T09:00:00.000Z',
        rejection_reason: 'Legacy value',
        overtime_type: 'normal_overtime',
      },
    ],
  });

  await reconcileOvertimeForShift(
    {
      shiftId: 'shift-2',
      triggeringAuth: { shift_log_id: 'log-late' },
    },
    {
      getDbFn: () => harness.tenantDb,
      emitSocketEvent: (event, payload) => {
        harness.socketEvents.push({ event, payload });
      },
    },
  );

  const overtime = harness.auths.find((auth) => auth.id === 'auth-ot');
  assert.ok(overtime, 'existing managed overtime should be preserved');
  assert.equal(overtime?.status, 'pending');
  assert.equal(overtime?.diff_minutes, 30);
  assert.equal(overtime?.needs_employee_reason, false);
  assert.equal(overtime?.resolved_by, null);
  assert.equal(overtime?.resolved_at, null);
  assert.equal(overtime?.rejection_reason, null);
  assert.equal(overtime?.overtime_type, null);
  assert.equal(harness.shifts[0]?.pending_approvals, 2);
  assert.equal(harness.socketEvents[0]?.event, 'shift:authorization-updated');
});

test('reconcileOvertimeForShift deletes managed overtime and decrements pending approvals when the shift is no longer overtime-eligible', async () => {
  const harness = createReconcileDbHarness({
    shifts: [
      {
        id: 'shift-3',
        company_id: 'company-1',
        branch_id: 'branch-1',
        user_id: 'user-1',
        total_worked_hours: 9,
        allocated_hours: 8,
        pending_approvals: 1,
      },
    ],
    activities: [
      {
        id: 'break-3',
        shift_id: 'shift-3',
        activity_type: 'break',
        end_time: '2026-04-19T08:00:00.000Z',
        duration_minutes: 60,
      },
    ],
    auths: [
      {
        id: 'auth-ot',
        company_id: 'company-1',
        shift_id: 'shift-3',
        shift_log_id: 'log-old-overtime',
        branch_id: 'branch-1',
        user_id: 'user-1',
        auth_type: 'overtime',
        status: 'locked',
        diff_minutes: 60,
        needs_employee_reason: false,
      },
    ],
  });

  await reconcileOvertimeForShift(
    {
      shiftId: 'shift-3',
      triggeringAuth: { shift_log_id: 'log-non-overtime' },
    },
    {
      getDbFn: () => harness.tenantDb,
      emitSocketEvent: (event, payload) => {
        harness.socketEvents.push({ event, payload });
      },
    },
  );

  assert.equal(
    harness.auths.find((auth) => auth.auth_type === 'overtime'),
    undefined,
    'managed overtime should be deleted once the shift is no longer overtime-eligible',
  );
  assert.equal(harness.shifts[0]?.pending_approvals, 0);
  assert.equal(harness.socketEvents[0]?.event, 'shift:authorization-deleted');
});

test('syncShiftAuthorizationWithOdoo skips all DB and Odoo work for early check out approvals and rejections', async () => {
  const originalGetDb = db.getDb.bind(db);
  (db as any).getDb = () => {
    throw new Error('db.getDb should not be called for early_check_out sync');
  };

  try {
    await syncShiftAuthorizationWithOdoo({ auth_type: 'early_check_out' }, 'approve');
    await syncShiftAuthorizationWithOdoo({ auth_type: 'early_check_out' }, 'reject');
  } finally {
    (db as any).getDb = originalGetDb;
  }
});

test('syncShiftAuthorizationWithOdoo sets underbreak rejection to at least 60 minutes of break for the employee date', async () => {
  const breakWorkEntryCalls: Array<Record<string, unknown>> = [];

  await syncShiftAuthorizationWithOdoo(
    { id: 'auth-underbreak-1', auth_type: 'underbreak', shift_id: 'shift-1' },
    'reject',
    undefined,
    {
      getDbFn: () =>
        createUnderbreakDbStub({
          shift: {
            id: 'shift-1',
            shift_start: new Date('2026-04-18T04:00:00.000Z'),
            user_id: 'user-1',
            branch_id: 'branch-1',
          },
          user: { id: 'user-1', user_key: 'website-user-1' },
          branch: { id: 'branch-1', odoo_branch_id: '12' },
        }),
      getEmployeeByWebsiteUserKeyFn: async () => ({ id: 7001, name: '001 - Alex Crew' }),
      getTotalEndedBreakMinutesByUserAndDateFn: async () => 5,
      setBreakWorkEntryDurationFn: async (input) => {
        breakWorkEntryCalls.push(input as Record<string, unknown>);
        return { id: 12901, action: 'created', durationHours: Number(input.durationMinutes) / 60 };
      },
    },
  );

  assert.deepEqual(breakWorkEntryCalls, [
    {
      employeeId: 7001,
      date: '2026-04-18',
      durationMinutes: 60,
    },
  ]);
});

test('syncShiftAuthorizationWithOdoo preserves a higher employee-date local break total on underbreak rejection', async () => {
  const breakWorkEntryCalls: Array<Record<string, unknown>> = [];

  await syncShiftAuthorizationWithOdoo(
    { id: 'auth-underbreak-2', auth_type: 'underbreak', shift_id: 'shift-2' },
    'reject',
    undefined,
    {
      getDbFn: () =>
        createUnderbreakDbStub({
          shift: {
            id: 'shift-2',
            shift_start: new Date('2026-04-18T04:00:00.000Z'),
            user_id: 'user-2',
            branch_id: 'branch-2',
          },
          user: { id: 'user-2', user_key: 'website-user-2' },
          branch: { id: 'branch-2', odoo_branch_id: '12' },
        }),
      getEmployeeByWebsiteUserKeyFn: async () => ({ id: 7002, name: '002 - Alex Crew' }),
      getTotalEndedBreakMinutesByUserAndDateFn: async () => 95,
      setBreakWorkEntryDurationFn: async (input) => {
        breakWorkEntryCalls.push(input as Record<string, unknown>);
        return { id: 12902, action: 'updated', durationHours: Number(input.durationMinutes) / 60 };
      },
    },
  );

  assert.deepEqual(breakWorkEntryCalls, [
    {
      employeeId: 7002,
      date: '2026-04-18',
      durationMinutes: 95,
    },
  ]);
});
