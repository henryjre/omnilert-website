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

const { createEarlyCheckInJobProcessor } = await import('./attendanceQueue.service.js');

test('createEarlyCheckInJobProcessor skips creating an authorization when the check-in log was reattached to an interim-duty shift', async () => {
  const auths: Array<Record<string, unknown>> = [];
  const emitted: Array<Record<string, unknown>> = [];
  const processJob = createEarlyCheckInJobProcessor({
    getTenantDb: async () => ({ name: 'tenant-db' }),
    findShiftById: async () => ({
      id: 'shift-scheduled',
      user_id: 'user-1',
      shift_start: '2026-03-20T09:00:00.000Z',
    }),
    findShiftLogById: async () => ({
      id: 'log-check-in',
      branch_id: 'branch-main',
      shift_id: 'shift-interim',
      log_type: 'check_in',
      event_time: '2026-03-20T07:00:00.000Z',
    }),
    findExistingAuthorization: async () => null,
    createShiftAuthorization: async (input: Record<string, unknown>) => {
      auths.push(input);
      return { id: 'auth-1', ...input };
    },
    incrementShiftPendingApprovals: async () => undefined,
    emitSocketEvent: (_event: string, payload: Record<string, unknown>) => {
      emitted.push(payload);
    },
    logInfo: () => undefined,
    logWarn: () => undefined,
  } as any);

  await processJob({
    id: 'job-1',
    data: {
      companyDbName: 'tenant_a',
      branchId: 'branch-main',
      shiftId: 'shift-scheduled',
      shiftLogId: 'log-check-in',
      userId: 'user-1',
      checkInEventTime: '2026-03-20T07:00:00.000Z',
    },
  });

  assert.equal(auths.length, 0);
  assert.equal(emitted.length, 0);
});
