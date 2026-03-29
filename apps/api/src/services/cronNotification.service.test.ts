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
  buildCronJobNotificationPayload,
  createCronJobNotifier,
  shouldSendCronJobNotification,
} = await import('./cronNotification.service.js');

function createSilentLogger() {
  const warns: Array<Record<string, unknown>> = [];
  const errors: Array<Record<string, unknown>> = [];
  return {
    warns,
    errors,
    log: {
      warn: (context: Record<string, unknown>) => {
        warns.push(context);
      },
      error: (context: Record<string, unknown>) => {
        errors.push(context);
      },
    },
  };
}

test('buildCronJobNotificationPayload produces the universal success payload shape', () => {
  const payload = buildCronJobNotificationPayload({
    environment: 'production',
    sentAt: new Date('2026-03-30T00:27:01.300Z'),
    run: {
      jobName: 'compliance_hourly_audit',
      jobFamily: 'compliance',
      schedule: 'hourly@deterministic-minute',
      source: 'scheduled',
      scheduledForKey: '2026-03-30T08:27',
      scheduledForManila: '2026-03-30 08:27:00',
      startedAt: new Date('2026-03-30T00:27:00.100Z'),
      finishedAt: new Date('2026-03-30T00:27:01.241Z'),
      attempt: 1,
      status: 'success',
      message: 'Completed compliance cron occurrence',
      errorMessage: null,
      stats: null,
    },
  });

  assert.deepEqual(payload, {
    event: 'cron_job.run',
    version: 1,
    environment: 'production',
    sent_at: '2026-03-30T00:27:01.300Z',
    job: {
      name: 'compliance_hourly_audit',
      family: 'compliance',
      schedule: 'hourly@deterministic-minute',
      trigger: 'scheduled',
    },
    run: {
      id: 'compliance_hourly_audit:scheduled:2026-03-30T08:27',
      scheduled_for_key: '2026-03-30T08:27',
      scheduled_for_manila: '2026-03-30 08:27:00',
      source: 'scheduled',
      started_at: '2026-03-30T00:27:00.100Z',
      finished_at: '2026-03-30T00:27:01.241Z',
      duration_ms: 1141,
      attempt: 1,
    },
    result: {
      status: 'success',
      message: 'Completed compliance cron occurrence',
      error_message: null,
    },
    stats: {
      processed: null,
      succeeded: null,
      failed: null,
      skipped: null,
    },
    meta: {
      timezone: 'Asia/Manila',
    },
  });
});

test('shouldSendCronJobNotification enforces production-only and status/source policy', () => {
  assert.deepEqual(
    shouldSendCronJobNotification({
      environment: 'development',
      jobName: 'compliance_hourly_audit',
      source: 'scheduled',
      status: 'success',
    }),
    { send: false, reason: 'non_production' },
  );

  assert.deepEqual(
    shouldSendCronJobNotification({
      environment: 'production',
      jobName: 'epi-weekly-snapshot',
      source: 'startup',
      status: 'success',
    }),
    { send: false, reason: 'policy_filtered' },
  );

  assert.deepEqual(
    shouldSendCronJobNotification({
      environment: 'production',
      jobName: 'peer-evaluation-expiry',
      source: 'scheduled',
      status: 'success',
    }),
    { send: false, reason: 'policy_filtered' },
  );

  assert.deepEqual(
    shouldSendCronJobNotification({
      environment: 'production',
      jobName: 'compliance_hourly_audit',
      source: 'scheduled',
      status: 'success',
    }),
    { send: true },
  );

  assert.deepEqual(
    shouldSendCronJobNotification({
      environment: 'production',
      jobName: 'peer-evaluation-expiry',
      source: 'startup',
      status: 'failed',
    }),
    { send: true },
  );
});

test('createCronJobNotifier posts JSON with bearer authorization', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const logger = createSilentLogger();
  const notifier = createCronJobNotifier({
    environment: 'production',
    webhookUrl: 'https://example.com/discord-bot',
    webhookToken: 'secret-token',
    timeoutMs: 5000,
    retryDelaysMs: [0, 0, 0],
    sleep: async () => undefined,
    now: () => new Date('2026-03-30T00:27:01.300Z'),
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return new Response('', { status: 200 });
    },
    log: logger.log,
  });

  const result = await notifier({
    jobName: 'compliance_hourly_audit',
    jobFamily: 'compliance',
    schedule: 'hourly@deterministic-minute',
    source: 'scheduled',
    scheduledForKey: '2026-03-30T08:27',
    scheduledForManila: '2026-03-30 08:27:00',
    startedAt: new Date('2026-03-30T00:27:00.100Z'),
    finishedAt: new Date('2026-03-30T00:27:01.241Z'),
    attempt: 1,
    status: 'success',
    message: 'Completed compliance cron occurrence',
    errorMessage: null,
    stats: null,
  });

  assert.deepEqual(result, { status: 'sent' });
  assert.equal(calls.length, 1);

  const [{ url, init }] = calls;
  assert.equal(url, 'https://example.com/discord-bot');
  const headers = (init?.headers ?? {}) as Record<string, string>;
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers.Authorization, 'Bearer secret-token');

  const body = JSON.parse(String(init?.body ?? '{}'));
  assert.equal(body.event, 'cron_job.run');
  assert.equal(body.result.status, 'success');
});

test('createCronJobNotifier skips when webhook configuration is missing', async () => {
  const logger = createSilentLogger();
  const notifier = createCronJobNotifier({
    environment: 'production',
    webhookUrl: '',
    webhookToken: '',
    log: logger.log,
  });

  const result = await notifier({
    jobName: 'compliance_hourly_audit',
    jobFamily: 'compliance',
    schedule: 'hourly@deterministic-minute',
    source: 'scheduled',
    scheduledForKey: '2026-03-30T08:27',
    scheduledForManila: '2026-03-30 08:27:00',
    startedAt: new Date('2026-03-30T00:27:00.100Z'),
    finishedAt: new Date('2026-03-30T00:27:01.241Z'),
    attempt: 1,
    status: 'success',
    message: 'Completed compliance cron occurrence',
    errorMessage: null,
    stats: null,
  });

  assert.deepEqual(result, { status: 'skipped', reason: 'config_missing' });
  assert.equal(logger.warns.length, 1);
});

test('createCronJobNotifier retries webhook failures and remains non-throwing', async () => {
  let attempts = 0;
  const logger = createSilentLogger();
  const notifier = createCronJobNotifier({
    environment: 'production',
    webhookUrl: 'https://example.com/discord-bot',
    webhookToken: 'secret-token',
    retryDelaysMs: [0, 0, 0],
    sleep: async () => undefined,
    fetchImpl: async () => {
      attempts += 1;
      throw new Error('endpoint unavailable');
    },
    log: logger.log,
  });

  const result = await notifier({
    jobName: 'peer-evaluation-expiry',
    jobFamily: 'peer_evaluation_expiry',
    schedule: '*/30 * * * *',
    source: 'scheduled',
    scheduledForKey: null,
    scheduledForManila: null,
    startedAt: new Date('2026-03-30T00:00:00.000Z'),
    finishedAt: new Date('2026-03-30T00:00:04.000Z'),
    attempt: null,
    status: 'failed',
    message: 'Peer evaluation expiry cron run failed',
    errorMessage: 'Failed company IDs: company-1',
    stats: {
      processed: 4,
      succeeded: 3,
      failed: 1,
      skipped: null,
    },
  });

  assert.deepEqual(result, { status: 'skipped', reason: 'webhook_failed' });
  assert.equal(attempts, 4);
  assert.equal(logger.errors.length, 1);
});

