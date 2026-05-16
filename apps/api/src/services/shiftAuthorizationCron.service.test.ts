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

const { createShiftAuthorizationExpiryRunner } = await import('./shiftAuthorizationCron.service.js');

test('createShiftAuthorizationExpiryRunner auto-rejects expired missing-reason authorizations for both existing and newly gated auth types', async () => {
  const now = new Date('2026-04-11T12:00:00.000Z');
  const rejections: Array<{
    auth: Record<string, unknown>;
    reason: string;
    resolvedAt: Date;
    resolvedBy: string | null;
    resolvedByName: string;
    companyId?: string | null;
  }> = [];
  const reconciliations: Array<{ shiftId: string; triggeringAuthId: string }> = [];
  const cronRuns: Array<Record<string, unknown>> = [];

  const runExpiry = createShiftAuthorizationExpiryRunner({
    now: () => now,
    listPendingReasonRequiredAuthorizations: async () => [
      {
        id: 'auth-early',
        auth_type: 'early_check_in',
        needs_employee_reason: true,
        employee_reason: '',
        status: 'pending',
        shift_id: 'shift-early',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: 'auth-ot',
        auth_type: 'overtime',
        needs_employee_reason: true,
        employee_reason: '   ',
        status: 'pending',
        shift_id: 'shift-ot',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: 'auth-interim',
        auth_type: 'interim_duty',
        needs_employee_reason: true,
        employee_reason: null,
        status: 'pending',
        shift_id: 'shift-interim',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: 'auth-late',
        auth_type: 'late_check_out',
        needs_employee_reason: true,
        employee_reason: null,
        status: 'pending',
        shift_id: 'shift-late',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: 'auth-tardy',
        auth_type: 'tardiness',
        needs_employee_reason: true,
        employee_reason: '',
        status: 'pending',
        shift_id: 'shift-tardy',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: 'auth-has-reason',
        auth_type: 'overtime',
        needs_employee_reason: true,
        employee_reason: 'Traffic and approval note',
        status: 'pending',
        shift_id: 'shift-ot-reason',
        created_at: '2026-04-10T10:00:00.000Z',
      },
      {
        id: 'auth-fresh',
        auth_type: 'early_check_in',
        needs_employee_reason: true,
        employee_reason: '',
        status: 'pending',
        shift_id: 'shift-fresh',
        created_at: '2026-04-11T11:30:00.000Z',
      },
      {
        id: 'auth-ignored',
        auth_type: 'early_check_out',
        needs_employee_reason: true,
        employee_reason: '',
        status: 'pending',
        shift_id: 'shift-ignored',
        created_at: '2026-04-10T10:00:00.000Z',
      },
    ],
    rejectAuthorization: async (input: {
      auth: Record<string, unknown>;
      reason: string;
      resolvedAt: Date;
      resolvedBy: string | null;
      resolvedByName: string;
      companyId?: string | null;
    }) => {
      rejections.push(input);
    },
    notifyCronJobRun: async (input: Record<string, unknown>) => {
      cronRuns.push(input);
    },
    reconcileManagedOvertime: async (input: { shiftId: string; triggeringAuth?: Record<string, unknown> | null }) => {
      reconciliations.push({
        shiftId: input.shiftId,
        triggeringAuthId: String(input.triggeringAuth?.id ?? ''),
      });
    },
    logInfo: () => undefined,
    logError: () => undefined,
  } as any);

  await runExpiry({ source: 'scheduled' });

  assert.deepEqual(
    rejections.map((entry) => String(entry.auth.id)),
    ['auth-early', 'auth-interim', 'auth-late', 'auth-tardy', 'auth-ignored'],
  );
  for (const entry of rejections) {
    assert.equal(
      entry.reason,
      'System generated rejection: No employee reason provided within 24 hours.',
    );
    assert.equal(entry.resolvedBy, null);
    assert.equal(entry.resolvedByName, 'System');
  }
  assert.deepEqual(reconciliations, [
    { shiftId: 'shift-early', triggeringAuthId: 'auth-early' },
    { shiftId: 'shift-interim', triggeringAuthId: 'auth-interim' },
    { shiftId: 'shift-late', triggeringAuthId: 'auth-late' },
    { shiftId: 'shift-tardy', triggeringAuthId: 'auth-tardy' },
    { shiftId: 'shift-ignored', triggeringAuthId: 'auth-ignored' },
  ]);

  assert.equal(cronRuns.length, 1);
  assert.equal(cronRuns[0]?.status, 'success');
  assert.deepEqual(cronRuns[0]?.stats, {
    processed: 5,
    succeeded: 5,
    failed: 0,
    skipped: 0,
  });
});

test('createShiftAuthorizationExpiryRunner includes underlying failure details in cron notification', async () => {
  const now = new Date('2026-04-11T12:00:00.000Z');
  const cronRuns: Array<Record<string, unknown>> = [];

  const runExpiry = createShiftAuthorizationExpiryRunner({
    now: () => now,
    listPendingReasonRequiredAuthorizations: async () => [
      {
        id: 'auth-failing',
        auth_type: 'early_check_in',
        needs_employee_reason: true,
        employee_reason: '',
        status: 'pending',
        shift_id: 'shift-failing',
        created_at: '2026-04-10T10:00:00.000Z',
      },
    ],
    rejectAuthorization: async () => {
      throw new Error('Odoo request failed with 500');
    },
    notifyCronJobRun: async (input: Record<string, unknown>) => {
      cronRuns.push(input);
    },
    reconcileManagedOvertime: async () => undefined,
    logInfo: () => undefined,
    logError: () => undefined,
  } as any);

  await runExpiry({ source: 'scheduled' });

  assert.equal(cronRuns.length, 1);
  assert.equal(cronRuns[0]?.status, 'failed');
  assert.deepEqual(JSON.parse(String(cronRuns[0]?.errorMessage)), {
    failed: 1,
    failures: [
      {
        authId: 'auth-failing',
        error: 'Odoo request failed with 500',
      },
    ],
  });
  assert.deepEqual(cronRuns[0]?.stats, {
    processed: 1,
    succeeded: 0,
    failed: 1,
    skipped: 0,
  });
});
