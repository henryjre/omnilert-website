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

const { createShiftAbsenceRunner } = await import('./shiftAbsenceCron.service.js');

type ShiftRow = {
  id: string;
  company_id: string;
  branch_id: string;
  user_id: string | null;
  status: string;
  shift_end: Date;
  check_in_status: string | null;
  total_worked_hours: number | null;
  updated_at?: Date;
};

function createHarness(now: Date) {
  const shifts: ShiftRow[] = [
    {
      id: 'shift-overdue',
      company_id: 'company-1',
      branch_id: 'branch-1',
      user_id: 'user-1',
      status: 'open',
      shift_end: new Date('2026-05-01T11:00:00.000Z'),
      check_in_status: null,
      total_worked_hours: null,
    },
    {
      id: 'shift-future',
      company_id: 'company-1',
      branch_id: 'branch-1',
      user_id: 'user-2',
      status: 'open',
      shift_end: new Date('2026-05-01T13:00:00.000Z'),
      check_in_status: null,
      total_worked_hours: null,
    },
    {
      id: 'shift-with-checkin',
      company_id: 'company-1',
      branch_id: 'branch-1',
      user_id: 'user-3',
      status: 'open',
      shift_end: new Date('2026-05-01T10:00:00.000Z'),
      check_in_status: null,
      total_worked_hours: null,
    },
    {
      id: 'shift-already-absent',
      company_id: 'company-1',
      branch_id: 'branch-1',
      user_id: 'user-4',
      status: 'absent',
      shift_end: new Date('2026-05-01T09:00:00.000Z'),
      check_in_status: null,
      total_worked_hours: 0,
    },
  ];
  const shiftLogs: Array<Record<string, unknown>> = [
    { id: 'log-checkin', shift_id: 'shift-with-checkin', log_type: 'check_in' },
  ];
  const socketEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const cronRuns: Array<Record<string, unknown>> = [];

  const runAbsence = createShiftAbsenceRunner({
    now: () => now,
    listAbsentCandidates: async (currentNow: Date) =>
      shifts.filter(
        (shift) =>
          shift.status === 'open' &&
          shift.shift_end.getTime() <= currentNow.getTime() &&
          !shiftLogs.some(
            (log) => log.shift_id === shift.id && log.log_type === 'check_in',
          ),
      ),
    markShiftAbsent: async ({ shiftId, now: updatedAt }: { shiftId: string; now: Date }) => {
      const shift = shifts.find((row) => row.id === shiftId && row.status === 'open');
      if (!shift) return null;
      shift.status = 'absent';
      shift.check_in_status = null;
      shift.total_worked_hours = 0;
      shift.updated_at = updatedAt;
      return { ...shift, total_worked_hours: 0 };
    },
    createAbsenceLog: async ({ shift, eventTime }: { shift: ShiftRow; eventTime: Date }) => {
      const log = {
        id: `absence-log-${shiftLogs.length + 1}`,
        company_id: shift.company_id,
        shift_id: shift.id,
        branch_id: shift.branch_id,
        log_type: 'shift_updated',
        changes: JSON.stringify({
          status: { from: 'open', to: 'absent' },
          reason: 'no_check_in_by_shift_end',
        }),
        event_time: eventTime,
      };
      shiftLogs.push(log);
      return log;
    },
    emitSocketEvent: (event: string, payload: Record<string, unknown>) => {
      socketEvents.push({ event, payload });
    },
    notifyCronJobRun: async (input: Record<string, unknown>) => {
      cronRuns.push(input);
      return { status: 'skipped', reason: 'non_production' } as const;
    },
    logInfo: () => undefined,
    logError: () => undefined,
  } as any);

  return { shifts, shiftLogs, socketEvents, cronRuns, runAbsence };
}

test('createShiftAbsenceRunner marks only overdue open shifts without check-in logs absent', async () => {
  const now = new Date('2026-05-01T12:00:00.000Z');
  const harness = createHarness(now);

  await harness.runAbsence({ source: 'startup' });

  assert.equal(harness.shifts.find((shift) => shift.id === 'shift-overdue')?.status, 'absent');
  assert.equal(
    harness.shifts.find((shift) => shift.id === 'shift-overdue')?.total_worked_hours,
    0,
  );
  assert.equal(harness.shifts.find((shift) => shift.id === 'shift-future')?.status, 'open');
  assert.equal(harness.shifts.find((shift) => shift.id === 'shift-with-checkin')?.status, 'open');
  assert.equal(harness.shifts.find((shift) => shift.id === 'shift-already-absent')?.status, 'absent');

  const absenceLogs = harness.shiftLogs.filter(
    (log) => log.shift_id === 'shift-overdue' && log.log_type === 'shift_updated',
  );
  assert.equal(absenceLogs.length, 1);
  assert.deepEqual(JSON.parse(String(absenceLogs[0]?.changes)), {
    status: { from: 'open', to: 'absent' },
    reason: 'no_check_in_by_shift_end',
  });

  assert.deepEqual(
    harness.socketEvents.map((event) => event.event),
    ['shift:updated', 'shift:log-new'],
  );
  assert.equal(harness.cronRuns.length, 1);
  assert.equal(harness.cronRuns[0]?.jobFamily, 'shift_absence');
  assert.equal(harness.cronRuns[0]?.source, 'startup');
  assert.equal(harness.cronRuns[0]?.status, 'success');
  assert.deepEqual(harness.cronRuns[0]?.stats, {
    processed: 1,
    succeeded: 1,
    failed: 0,
    skipped: 0,
  });
});

test('createShiftAbsenceRunner is idempotent after a shift is marked absent', async () => {
  const now = new Date('2026-05-01T12:00:00.000Z');
  const harness = createHarness(now);

  await harness.runAbsence({ source: 'scheduled' });
  await harness.runAbsence({ source: 'scheduled' });

  const absenceLogs = harness.shiftLogs.filter(
    (log) => log.shift_id === 'shift-overdue' && log.log_type === 'shift_updated',
  );
  assert.equal(absenceLogs.length, 1);
  assert.equal(
    harness.socketEvents.filter((event) => event.event === 'shift:updated').length,
    1,
  );
  assert.equal(harness.cronRuns.length, 2);
  assert.deepEqual(harness.cronRuns[1]?.stats, {
    processed: 0,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  });
});

test('createShiftAbsenceRunner includes underlying failure details in cron notification', async () => {
  const now = new Date('2026-05-01T12:00:00.000Z');
  const cronRuns: Array<Record<string, unknown>> = [];

  const runAbsence = createShiftAbsenceRunner({
    now: () => now,
    listAbsentCandidates: async () => [
      {
        id: 'shift-failing',
        company_id: 'company-1',
        branch_id: 'branch-1',
        user_id: 'user-1',
        status: 'open',
      },
    ],
    markShiftAbsent: async () => {
      throw new Error('shift update timed out');
    },
    createAbsenceLog: async () => ({}),
    emitSocketEvent: () => undefined,
    notifyCronJobRun: async (input: Record<string, unknown>) => {
      cronRuns.push(input);
      return { status: 'skipped', reason: 'non_production' } as const;
    },
    logInfo: () => undefined,
    logError: () => undefined,
  } as any);

  await runAbsence({ source: 'scheduled' });

  assert.equal(cronRuns.length, 1);
  assert.equal(cronRuns[0]?.status, 'failed');
  assert.deepEqual(JSON.parse(String(cronRuns[0]?.errorMessage)), {
    failed: 1,
    failures: [
      {
        entityType: 'shift',
        entityId: 'shift-failing',
        error: 'shift update timed out',
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
