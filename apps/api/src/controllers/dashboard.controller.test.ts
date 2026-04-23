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

const { db } = await import('../config/database.js');
const { getCheckInStatus } = await import('./dashboard.controller.js');

type Row = Record<string, unknown>;

function normalizeField(field: string): string {
  return field.split('.').pop()?.trim() ?? field.trim();
}

function pickFields(row: Row, fields: string[]): Row {
  if (fields.length === 0) return { ...row };

  const selected: Row = {};
  for (const field of fields) {
    const [sourceField, aliasField] = field.split(/\s+as\s+/i);
    const sourceKey = normalizeField(sourceField ?? field);
    const aliasKey = aliasField?.trim() ?? sourceKey;
    selected[aliasKey] = row[aliasKey] ?? row[sourceKey] ?? null;
  }
  return selected;
}

function createQueryStub(rows: Row[]) {
  let matchedRows = rows.map((row) => ({ ...row }));

  const query: Record<string, any> = {
    leftJoin() {
      return query;
    },
    where(condition: Record<string, unknown>) {
      matchedRows = matchedRows.filter((row) =>
        Object.entries(condition).every(([key, value]) => row[key] === value),
      );
      return query;
    },
    whereIn(field: string, values: unknown[]) {
      const key = normalizeField(field);
      matchedRows = matchedRows.filter((row) => values.includes(row[key]));
      return query;
    },
    whereRaw(sql: string, values: unknown[]) {
      if (/x_website_key/.test(sql)) {
        const expectedUserKey = String(values[0] ?? '').trim();
        matchedRows = matchedRows.filter((row) => {
          const payload = row.odoo_payload;
          if (!payload) return false;

          let parsed: Record<string, unknown> | null = null;
          if (typeof payload === 'string') {
            try {
              parsed = JSON.parse(payload) as Record<string, unknown>;
            } catch {
              parsed = null;
            }
          } else if (typeof payload === 'object' && !Array.isArray(payload)) {
            parsed = payload as Record<string, unknown>;
          }

          return String(parsed?.x_website_key ?? '').trim() === expectedUserKey;
        });
      }
      return query;
    },
    orderBy() {
      return query;
    },
    first(...fields: string[]) {
      const row = matchedRows[0];
      return Promise.resolve(row ? pickFields(row, fields) : null);
    },
    then(resolve: (value: unknown) => unknown, rejectNext?: (reason: unknown) => unknown) {
      return Promise.resolve(matchedRows.map((row) => ({ ...row }))).then(resolve, rejectNext);
    },
  };

  return query;
}

function createDashboardDbStub(input: {
  users: Row[];
  shiftLogs: Row[];
  activeShifts?: Row[];
}) {
  const accessedTables: string[] = [];

  const tableRows = new Map<string, Row[]>([
    ['users', input.users],
    ['shift_logs as sl', input.shiftLogs],
    ['employee_shifts', input.activeShifts ?? []],
    ['shift_activities', []],
  ]);

  const stub = ((tableName: string) => {
    accessedTables.push(tableName);
    if (tableName === 'user_role_disables' || tableName === 'user_roles as ur') {
      throw new Error(`Unexpected table lookup: ${tableName}`);
    }

    const rows = tableRows.get(tableName);
    if (!rows) {
      throw new Error(`Unexpected table lookup: ${tableName}`);
    }

    return createQueryStub(rows);
  }) as any;

  return { stub, accessedTables };
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

test('getCheckInStatus returns checked-out data without mutating disabled-role state', async () => {
  const originalGetDb = db.getDb;
  const { stub, accessedTables } = createDashboardDbStub({
    users: [{ id: 'user-1', user_key: 'wk-1' }],
    shiftLogs: [
      {
        log_type: 'check_out',
        company_id: 'company-1',
        odoo_payload: JSON.stringify({
          x_website_key: 'wk-1',
          x_company_id: 2,
          check_in: '2026-03-20 01:00:00',
        }),
        branch_id: 'branch-service',
        branch_odoo_id: '2',
        branch_name: 'Service Crew Hub',
        company_name: 'Omnilert Service Crew',
      },
    ],
  });
  db.getDb = () => stub;

  const res = createResponseStub();
  let nextError: unknown = null;

  try {
    await getCheckInStatus(
      { user: { sub: 'user-1' } } as any,
      res as any,
      (err?: unknown) => {
        nextError = err ?? null;
      },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      checkedIn: false,
      roleType: null,
      companyName: null,
      branchName: null,
      branchId: null,
      branchOdooId: null,
      checkInTimeUtc: null,
    },
  });
  assert.equal(accessedTables.includes('user_role_disables'), false);
  assert.equal(accessedTables.includes('user_roles as ur'), false);
});

test('getCheckInStatus reports checked-in data without reconciling disabled-role state', async () => {
  const originalGetDb = db.getDb;
  const { stub, accessedTables } = createDashboardDbStub({
    users: [{ id: 'user-2', user_key: 'wk-2' }],
    shiftLogs: [
      {
        log_type: 'check_in',
        company_id: 'company-1',
        odoo_payload: JSON.stringify({
          x_website_key: 'wk-2',
          x_company_id: 1,
          check_in: '2026-03-20 09:00:00',
        }),
        branch_id: 'branch-management',
        branch_odoo_id: '1',
        branch_name: 'Management HQ',
        company_name: 'Omnilert Management',
      },
    ],
    activeShifts: [],
  });
  db.getDb = () => stub;

  const res = createResponseStub();
  let nextError: unknown = null;

  try {
    await getCheckInStatus(
      { user: { sub: 'user-2' } } as any,
      res as any,
      (err?: unknown) => {
        nextError = err ?? null;
      },
    );
  } finally {
    db.getDb = originalGetDb;
  }

  assert.equal(nextError, null);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    data: {
      checkedIn: true,
      roleType: 'Management',
      companyName: 'Omnilert Management',
      branchName: 'Management HQ',
      branchId: 'branch-management',
      branchOdooId: '1',
      checkInTimeUtc: '2026-03-20 09:00:00',
      shiftId: null,
      activeActivity: null,
    },
  });
  assert.equal(accessedTables.includes('user_role_disables'), false);
  assert.equal(accessedTables.includes('user_roles as ur'), false);
});
