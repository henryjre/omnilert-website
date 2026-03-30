import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createServiceCrewCctvOccurrenceExecutor,
  type ServiceCrewCctvRunOutcome,
} from './serviceCrewCctvCronRuntime.js';

test('createServiceCrewCctvOccurrenceExecutor skips when another worker already claimed the hour', async () => {
  const calls: string[] = [];
  const execute = createServiceCrewCctvOccurrenceExecutor({
    jobName: 'service_crew_cctv_hourly_audit',
    claimOccurrence: async () => false,
    runServiceCrewCctvJob: async () => {
      calls.push('run');
      return { status: 'success' } satisfies ServiceCrewCctvRunOutcome;
    },
    markSuccess: async () => {
      calls.push('success');
    },
    markSkipped: async () => {
      calls.push('skipped');
    },
    markFailure: async () => {
      calls.push('failure');
    },
    logger: {
      info: () => undefined,
      error: () => undefined,
    },
    formatScheduledForKey: () => '2026-03-21T12:27',
    formatScheduledForManila: () => '2026-03-21 12:27:00',
  });

  await execute({
    scheduledFor: new Date('2026-03-21T04:27:00.000Z'),
    source: 'scheduled',
  });

  assert.deepEqual(calls, []);
});

test('createServiceCrewCctvOccurrenceExecutor marks success when an audit is created', async () => {
  const calls: string[] = [];
  const notifications: string[] = [];
  const execute = createServiceCrewCctvOccurrenceExecutor({
    jobName: 'service_crew_cctv_hourly_audit',
    claimOccurrence: async () => true,
    runServiceCrewCctvJob: async () => ({ status: 'success' }),
    markSuccess: async () => {
      calls.push('success');
    },
    markSkipped: async () => {
      calls.push('skipped');
    },
    markFailure: async () => {
      calls.push('failure');
    },
    logger: {
      info: () => undefined,
      error: () => undefined,
    },
    notifyResult: async (input) => {
      notifications.push(input.status);
    },
    formatScheduledForKey: () => '2026-03-21T12:27',
    formatScheduledForManila: () => '2026-03-21 12:27:00',
  });

  await execute({
    scheduledFor: new Date('2026-03-21T04:27:00.000Z'),
    source: 'scheduled',
  });

  assert.deepEqual(calls, ['success']);
  assert.deepEqual(notifications, ['success']);
});

test('createServiceCrewCctvOccurrenceExecutor marks skipped when the occurrence is consumed without an audit', async () => {
  const skippedReasons: Array<string | null | undefined> = [];
  let notificationCount = 0;
  const execute = createServiceCrewCctvOccurrenceExecutor({
    jobName: 'service_crew_cctv_hourly_audit',
    claimOccurrence: async () => true,
    runServiceCrewCctvJob: async () => ({ status: 'skipped', reason: 'No eligible attendance' }),
    markSuccess: async () => undefined,
    markSkipped: async (_scheduledFor, reason) => {
      skippedReasons.push(reason);
    },
    markFailure: async () => undefined,
    logger: {
      info: () => undefined,
      error: () => undefined,
    },
    notifyResult: async () => {
      notificationCount += 1;
    },
    formatScheduledForKey: () => '2026-03-21T12:27',
    formatScheduledForManila: () => '2026-03-21 12:27:00',
  });

  await execute({
    scheduledFor: new Date('2026-03-21T04:27:00.000Z'),
    source: 'scheduled',
  });

  assert.deepEqual(skippedReasons, ['No eligible attendance']);
  assert.equal(notificationCount, 0);
});

test('createServiceCrewCctvOccurrenceExecutor marks failures when the SCC run throws', async () => {
  const failures: string[] = [];
  const notifications: string[] = [];
  const execute = createServiceCrewCctvOccurrenceExecutor({
    jobName: 'service_crew_cctv_hourly_audit',
    claimOccurrence: async () => true,
    runServiceCrewCctvJob: async () => {
      throw new Error('boom');
    },
    markSuccess: async () => undefined,
    markSkipped: async () => undefined,
    markFailure: async (_scheduledFor, error) => {
      failures.push(error instanceof Error ? error.message : String(error));
    },
    logger: {
      info: () => undefined,
      error: () => undefined,
    },
    notifyResult: async (input) => {
      notifications.push(input.status);
    },
    formatScheduledForKey: () => '2026-03-21T12:27',
    formatScheduledForManila: () => '2026-03-21 12:27:00',
  });

  await execute({
    scheduledFor: new Date('2026-03-21T04:27:00.000Z'),
    source: 'scheduled',
  });

  assert.deepEqual(failures, ['boom']);
  assert.deepEqual(notifications, ['failed']);
});
