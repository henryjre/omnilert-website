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
process.env.SERVICE_CREW_CCTV_CRON_ENABLED = 'false';

const {
  SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  getServiceCrewCctvOccurrenceForHour,
} = await import('./serviceCrewCctvCronScheduler.js');
const { initServiceCrewCctvCron, stopServiceCrewCctvCron } = await import('./serviceCrewCctvCron.service.js');

test('initServiceCrewCctvCron skips scheduling when disabled by env', async () => {
  const occurrence = getServiceCrewCctvOccurrenceForHour(
    new Date('2026-03-21T03:00:00.000Z'),
    SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  );
  const frozenNow = new Date(occurrence.scheduledFor.getTime() - 60_000);
  const originalDate = globalThis.Date;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const scheduledDelays: number[] = [];

  class FrozenDate extends originalDate {
    constructor(...args: any[]) {
      super(args.length === 0 ? frozenNow.getTime() : args[0]);
    }

    static now(): number {
      return frozenNow.getTime();
    }
  }

  globalThis.Date = FrozenDate as DateConstructor;
  globalThis.setTimeout = ((...args: Parameters<typeof globalThis.setTimeout>) => {
    const [, delay] = args;
    scheduledDelays.push(typeof delay === 'number' ? delay : 0);
    return {
      ref: () => undefined,
      unref: () => undefined,
    } as unknown as ReturnType<typeof globalThis.setTimeout>;
  }) as unknown as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((() => undefined) as typeof globalThis.clearTimeout);

  try {
    await initServiceCrewCctvCron();
    assert.deepEqual(scheduledDelays, []);
  } finally {
    await stopServiceCrewCctvCron();
    globalThis.Date = originalDate;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
