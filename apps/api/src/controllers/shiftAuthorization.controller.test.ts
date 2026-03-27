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
  cleanupInterimDutyOdooArtifacts,
  resolveInterimDutyCleanupTargets,
} = await import('./shiftAuthorization.controller.js');

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

