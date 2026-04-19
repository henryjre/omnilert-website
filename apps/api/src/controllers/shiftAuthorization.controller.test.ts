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
const { getShiftAuthorizationById } = await import('./account.controller.js');
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

// ---------------------------------------------------------------------------
// GET /account/shift-authorizations/:id  (getShiftAuthorizationById)
// ---------------------------------------------------------------------------

const ownAuthId = 'auth-own-1';
const otherUserAuthId = 'auth-other-1';
const employeeUserId = 'user-employee-1';
const shiftId = 'shift-test-1';

const shiftAuthRows: Array<Record<string, unknown>> = [
  {
    id: ownAuthId,
    shift_id: shiftId,
    user_id: employeeUserId,
    auth_type: 'overtime',
    diff_minutes: 30,
    status: 'pending',
    employee_reason: null,
    needs_employee_reason: true,
    rejection_reason: null,
    created_at: '2026-01-01T08:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
  },
  {
    id: otherUserAuthId,
    shift_id: 'shift-other',
    user_id: 'user-other-99',
    auth_type: 'underbreak',
    diff_minutes: 10,
    status: 'approved',
    employee_reason: null,
    needs_employee_reason: false,
    rejection_reason: null,
    created_at: '2026-01-01T08:00:00.000Z',
    resolved_at: null,
    resolved_by: null,
  },
];

const shiftRows: Array<Record<string, unknown>> = [
  {
    id: shiftId,
    shift_start: '2026-01-01T06:00:00.000Z',
    shift_end: '2026-01-01T14:00:00.000Z',
    status: 'closed',
    duty_type: 'regular',
    duty_color: '#000000',
    employee_name: 'John Doe',
    employee_avatar_url: null,
    pending_approvals: 1,
    total_worked_hours: 8,
    branch_name: 'Main Branch',
  },
];

function createMultiTableDbStub(
  authRows: Array<Record<string, unknown>>,
  shiftRowsData: Array<Record<string, unknown>>,
) {
  return ((tableName: string) => {
    const isShiftTable = tableName === 'employee_shifts as es' || tableName === 'employee_shifts';
    const isAuthTable = tableName === 'shift_authorizations';
    const isUsersTable = tableName === 'users';

    let matchedRows = isAuthTable
      ? authRows.map((r) => ({ ...r }))
      : isShiftTable || isUsersTable
        ? shiftRowsData.map((r) => ({ ...r }))
        : [];

    let selectedFields: string[] | null = null;

    const applySelection = () => {
      if (!selectedFields) return matchedRows;
      return matchedRows.map((row) => {
        const selected: Record<string, unknown> = {};
        for (const field of selectedFields ?? []) {
          const key = field.includes(' as ') ? field.split(' as ')[1].trim() : field.replace(/^.*\./, '');
          const rawKey = field.includes(' as ') ? field.split(' as ')[0].trim().replace(/^.*\./, '') : field.replace(/^.*\./, '');
          selected[key] = row[key] ?? row[rawKey] ?? null;
        }
        return selected;
      });
    };

    const rawFn = (_sql: string) => ({ first: () => Promise.resolve(null) });

    const query: Record<string, any> = {
      leftJoin(_table: string, _left: string, _right: string) {
        return query;
      },
      where(condition: Record<string, unknown> | string, _val?: unknown) {
        if (typeof condition === 'object') {
          matchedRows = matchedRows.filter((row) =>
            Object.entries(condition).every(([key, value]) => {
              const k = key.includes('.') ? key.split('.')[1] : key;
              return row[k] === value || row[key] === value;
            }),
          );
        }
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
      raw: rawFn,
    };

    return query;
  }) as any;
}

function createResponseStubForAccount() {
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

test('getShiftAuthorizationById returns 404 when auth does not exist', async () => {
  const originalGetDb = db.getDb;
  db.getDb = () => createMultiTableDbStub([], shiftRows);

  const res = createResponseStubForAccount();
  let nextError: unknown = null;

  try {
    await getShiftAuthorizationById(
      {
        user: { sub: employeeUserId },
        params: { id: '00000000-0000-0000-0000-000000000000' },
      } as any,
      res as any,
      (err?: unknown) => { nextError = err ?? null; },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.ok(nextError instanceof Error);
  assert.equal((nextError as any).statusCode, 404);
});

test('getShiftAuthorizationById returns 403 when auth belongs to another user', async () => {
  const originalGetDb = db.getDb;
  db.getDb = () => createMultiTableDbStub(shiftAuthRows, shiftRows);

  const res = createResponseStubForAccount();
  let nextError: unknown = null;

  try {
    await getShiftAuthorizationById(
      {
        user: { sub: employeeUserId },
        params: { id: otherUserAuthId },
      } as any,
      res as any,
      (err?: unknown) => { nextError = err ?? null; },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.ok(nextError instanceof Error);
  assert.equal((nextError as any).statusCode, 403);
});

test('getShiftAuthorizationById returns auth + shift for the owning employee', async () => {
  const originalGetDb = db.getDb;
  db.getDb = () => createMultiTableDbStub(shiftAuthRows, shiftRows);

  const res = createResponseStubForAccount();
  let nextError: unknown = null;

  try {
    await getShiftAuthorizationById(
      {
        user: { sub: employeeUserId },
        params: { id: ownAuthId },
      } as any,
      res as any,
      (err?: unknown) => { nextError = err ?? null; },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.equal((res.body as any)?.success, true);
  assert.equal((res.body as any)?.data?.id, ownAuthId);
  assert.equal(typeof (res.body as any)?.data?.auth_type, 'string');
});
