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
  syncShiftAuthorizationWithOdoo,
} = await import('./shiftAuthorizationResolution.service.js');
const { db } = await import('../config/database.js');

test('assertEmployeeReasonSubmittedForManualReject blocks early check in, early check out, overtime, and interim duty without an employee reason', () => {
  for (const authType of ['early_check_in', 'early_check_out', 'overtime', 'interim_duty']) {
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

  for (const authType of ['tardiness', 'late_check_out']) {
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
