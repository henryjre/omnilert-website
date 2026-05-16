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

const { createNotificationRetentionRunner } = await import('./notificationRetentionCron.service.js');

test('createNotificationRetentionRunner purges stale notifications and reports startup stats', async () => {
  const now = new Date('2026-04-24T12:00:00.000Z');
  const deleteCalls: Date[] = [];
  const emittedNotifications: Array<{ userId: string; id: string; wasUnread: boolean }> = [];
  const cronRuns: Array<Record<string, unknown>> = [];
  const infoLogs: Array<Record<string, unknown>> = [];

  const runRetention = createNotificationRetentionRunner({
    now: () => now,
    deleteStaleNotifications: async ({ cutoff }: { cutoff: Date }) => {
      deleteCalls.push(cutoff);
      return [
        { userId: 'user-1', id: 'notif-1', wasUnread: true },
        { userId: 'user-2', id: 'notif-2', wasUnread: false },
      ];
    },
    emitDeletedNotifications: (notifications: Array<{ userId: string; id: string; wasUnread: boolean }>) => {
      emittedNotifications.push(...notifications);
    },
    notifyCronJobRun: async (input: Record<string, unknown>) => {
      cronRuns.push(input);
      return { status: 'skipped', reason: 'non_production' } as const;
    },
    logInfo: (context: Record<string, unknown>) => {
      infoLogs.push(context);
    },
    logError: () => undefined,
  } as any);

  await runRetention({ source: 'startup' });

  assert.equal(deleteCalls.length, 1);
  assert.equal(deleteCalls[0]?.toISOString(), '2026-03-25T12:00:00.000Z');
  assert.deepEqual(emittedNotifications, [
    { userId: 'user-1', id: 'notif-1', wasUnread: true },
    { userId: 'user-2', id: 'notif-2', wasUnread: false },
  ]);
  assert.equal(infoLogs.length, 1);
  assert.equal(infoLogs[0]?.deletedCount, 2);

  assert.equal(cronRuns.length, 1);
  assert.equal(cronRuns[0]?.jobFamily, 'notification_retention');
  assert.equal(cronRuns[0]?.source, 'startup');
  assert.equal(cronRuns[0]?.status, 'success');
  assert.deepEqual(cronRuns[0]?.stats, {
    processed: 2,
    succeeded: 2,
    failed: 0,
    skipped: 0,
  });
});

test('createNotificationRetentionRunner reports scheduled failures when stale deletion throws', async () => {
  const now = new Date('2026-04-24T12:00:00.000Z');
  const cronRuns: Array<Record<string, unknown>> = [];
  const errorLogs: Array<Record<string, unknown>> = [];

  const runRetention = createNotificationRetentionRunner({
    now: () => now,
    deleteStaleNotifications: async () => {
      throw new Error('database unavailable');
    },
    emitDeletedNotifications: () => undefined,
    notifyCronJobRun: async (input: Record<string, unknown>) => {
      cronRuns.push(input);
      return { status: 'skipped', reason: 'non_production' } as const;
    },
    logInfo: () => undefined,
    logError: (context: Record<string, unknown>) => {
      errorLogs.push(context);
    },
  } as any);

  await runRetention({ source: 'scheduled' });

  assert.equal(errorLogs.length, 1);
  assert.equal(cronRuns.length, 1);
  assert.equal(cronRuns[0]?.source, 'scheduled');
  assert.equal(cronRuns[0]?.status, 'failed');
  assert.deepEqual(JSON.parse(String(cronRuns[0]?.errorMessage)), {
    failed: 1,
    failures: [
      {
        entityType: 'cron_run',
        entityId: null,
        error: 'database unavailable',
      },
    ],
  });
  assert.deepEqual(cronRuns[0]?.stats, {
    processed: 0,
    succeeded: 0,
    failed: 1,
    skipped: 0,
  });
});
