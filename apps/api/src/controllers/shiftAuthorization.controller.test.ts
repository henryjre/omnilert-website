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
  approve,
  cleanupInterimDutyOdooArtifacts,
  reject,
  resolveInterimDutyCleanupTargets,
} = await import('./shiftAuthorization.controller.js');
const { db } = await import('../config/database.js');

function createShiftAuthorizationDbStub(
  rows: Array<Record<string, unknown>>,
) {
  return ((tableName: string) => {
    if (tableName !== 'shift_authorizations') {
      throw new Error(`Unexpected table lookup: ${tableName}`);
    }

    let matchedRows = rows.map((row) => ({ ...row }));
    let selectedFields: string[] | null = null;

    const applySelection = () => {
      if (!selectedFields) return matchedRows;
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
        matchedRows = matchedRows.filter((row) =>
          Object.entries(condition).every(([key, value]) => row[key] === value),
        );
        return query;
      },
      whereNot(condition: Record<string, unknown>) {
        matchedRows = matchedRows.filter((row) =>
          Object.entries(condition).every(([key, value]) => row[key] !== value),
        );
        return query;
      },
      select(...fields: string[]) {
        selectedFields = fields;
        return query;
      },
      first() {
        return Promise.resolve(applySelection()[0] ?? null);
      },
      then(resolve: (value: unknown) => unknown, rejectNext?: (reason: unknown) => unknown) {
        return Promise.resolve(applySelection()).then(resolve, rejectNext);
      },
    };

    return query;
  }) as any;
}

function createResponseStub() {
  return {
    statusCode: 200,
    body: null as Record<string, unknown> | null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: Record<string, unknown>) {
      this.body = payload;
      return this;
    },
  };
}

test('resolveInterimDutyCleanupTargets returns attendance and real planning slot ids', () => {
  const targets = resolveInterimDutyCleanupTargets({
    shiftLog: { odoo_attendance_id: 1201 },
    shift: { odoo_shift_id: 2201 },
  });

  assert.deepEqual(targets, { attendanceId: 1201, planningSlotId: 2201 });
});

test('resolveInterimDutyCleanupTargets ignores non-real planning slot ids', () => {
  const targets = resolveInterimDutyCleanupTargets({
    shiftLog: { odoo_attendance_id: 1202 },
    shift: { odoo_shift_id: -1202 },
  });

  assert.deepEqual(targets, { attendanceId: 1202, planningSlotId: null });
});

test('cleanupInterimDutyOdooArtifacts deletes planning slot then attendance when slot id is real', async () => {
  const calls: string[] = [];

  await cleanupInterimDutyOdooArtifacts(
    { shift_log_id: 'log-1', shift_id: 'shift-1' },
    {
      loadShiftLog: async () => ({ odoo_attendance_id: 3001 }),
      loadShift: async () => ({ odoo_shift_id: 4001 }),
      deletePlanningSlot: async (planningSlotId: number) => {
        calls.push(`slot:${planningSlotId}`);
        return true;
      },
      deleteAttendance: async (attendanceId: number) => {
        calls.push(`attendance:${attendanceId}`);
        return true;
      },
    },
  );

  assert.deepEqual(calls, ['slot:4001', 'attendance:3001']);
});

test('cleanupInterimDutyOdooArtifacts deletes only attendance when planning slot id is synthetic', async () => {
  const calls: string[] = [];

  await cleanupInterimDutyOdooArtifacts(
    { shift_log_id: 'log-2', shift_id: 'shift-2' },
    {
      loadShiftLog: async () => ({ odoo_attendance_id: 3002 }),
      loadShift: async () => ({ odoo_shift_id: -3002 }),
      deletePlanningSlot: async () => {
        calls.push('slot');
        return true;
      },
      deleteAttendance: async (attendanceId: number) => {
        calls.push(`attendance:${attendanceId}`);
        return true;
      },
    },
  );

  assert.deepEqual(calls, ['attendance:3002']);
});

test('cleanupInterimDutyOdooArtifacts throws and keeps attendance deletion from running when slot deletion fails', async () => {
  const calls: string[] = [];

  await assert.rejects(
    cleanupInterimDutyOdooArtifacts(
      { shift_log_id: 'log-3', shift_id: 'shift-3' },
      {
        loadShiftLog: async () => ({ odoo_attendance_id: 3003 }),
        loadShift: async () => ({ odoo_shift_id: 4003 }),
        deletePlanningSlot: async () => {
          calls.push('slot');
          return false;
        },
        deleteAttendance: async () => {
          calls.push('attendance');
          return true;
        },
      },
    ),
    /Failed to delete Odoo planning.slot/,
  );

  assert.deepEqual(calls, ['slot']);
});

test('approve returns overtime-blocked response for locked overtime rows', async () => {
  const originalGetDb = db.getDb;
  db.getDb = () =>
    createShiftAuthorizationDbStub([
      {
        id: 'auth-overtime',
        shift_id: 'shift-1',
        user_id: 'user-1',
        auth_type: 'overtime',
        status: 'locked',
      },
      {
        id: 'auth-underbreak',
        shift_id: 'shift-1',
        user_id: 'user-1',
        auth_type: 'underbreak',
        status: 'approved',
      },
    ]);

  const res = createResponseStub();
  let nextError: unknown = null;

  try {
    await approve(
      {
        companyContext: { companyId: 'company-1' },
        user: { sub: 'manager-1' },
        params: { id: 'auth-overtime' },
        body: {},
      } as any,
      res as any,
      (err?: unknown) => {
        nextError = err ?? null;
      },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    success: false,
    error: 'overtime_blocked',
    message: 'Resolve the remaining shift authorizations before reviewing overtime.',
    data: {
      overtime_blocked: true,
      overtime_blocker_auth_types: [],
    },
  });
});

test('reject returns overtime-blocked response for pending overtime rows with pending blocker auths', async () => {
  const originalGetDb = db.getDb;
  db.getDb = () =>
    createShiftAuthorizationDbStub([
      {
        id: 'auth-overtime',
        shift_id: 'shift-2',
        user_id: 'user-2',
        auth_type: 'overtime',
        status: 'pending',
      },
      {
        id: 'auth-underbreak',
        shift_id: 'shift-2',
        user_id: 'user-2',
        auth_type: 'underbreak',
        status: 'pending',
      },
    ]);

  const res = createResponseStub();
  let nextError: unknown = null;

  try {
    await reject(
      {
        companyContext: { companyId: 'company-1' },
        user: { sub: 'manager-2' },
        params: { id: 'auth-overtime' },
        body: { reason: 'Not payable' },
      } as any,
      res as any,
      (err?: unknown) => {
        nextError = err ?? null;
      },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, {
    success: false,
    error: 'overtime_blocked',
    message: 'Resolve underbreak before reviewing overtime.',
    data: {
      overtime_blocked: true,
      overtime_blocker_auth_types: ['underbreak'],
    },
  });
});
