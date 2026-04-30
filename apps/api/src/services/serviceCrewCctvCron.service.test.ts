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
const {
  hasOpenBreakOrFieldTaskActivity,
  initServiceCrewCctvCron,
  stopServiceCrewCctvCron,
} = await import('./serviceCrewCctvCron.service.js');

function createShiftActivityDbStub(firstResult: unknown) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const chain = {
    where(...args: unknown[]) {
      calls.push({ method: 'where', args });
      return chain;
    },
    whereIn(...args: unknown[]) {
      calls.push({ method: 'whereIn', args });
      return chain;
    },
    whereNull(...args: unknown[]) {
      calls.push({ method: 'whereNull', args });
      return chain;
    },
    async first(...args: unknown[]) {
      calls.push({ method: 'first', args });
      return firstResult;
    },
  };
  const dbStub = Object.assign(
    (tableName: string) => {
      calls.push({ method: 'table', args: [tableName] });
      return chain;
    },
    { calls },
  );

  return dbStub;
}

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

test('hasOpenBreakOrFieldTaskActivity detects an open break or field task for a user', async () => {
  const dbStub = createShiftActivityDbStub({ id: 'activity-open-break' });

  const result = await hasOpenBreakOrFieldTaskActivity('user-1', dbStub as any);

  assert.equal(result, true);
  assert.deepEqual(dbStub.calls, [
    { method: 'table', args: ['shift_activities'] },
    { method: 'where', args: [{ user_id: 'user-1' }] },
    { method: 'whereIn', args: ['activity_type', ['break', 'field_task']] },
    { method: 'whereNull', args: ['end_time'] },
    { method: 'first', args: ['id'] },
  ]);
});

test('hasOpenBreakOrFieldTaskActivity allows users without open break or field task activity', async () => {
  const dbStub = createShiftActivityDbStub(undefined);

  const result = await hasOpenBreakOrFieldTaskActivity('user-2', dbStub as any);

  assert.equal(result, false);
});
