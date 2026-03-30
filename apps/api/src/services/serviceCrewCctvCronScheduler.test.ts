import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  getServiceCrewCctvOccurrenceForHour,
  getServiceCrewCctvSchedulingDecision,
} from './serviceCrewCctvCronScheduler.js';

test('getServiceCrewCctvOccurrenceForHour returns a stable minute for the same Manila hour', () => {
  const first = getServiceCrewCctvOccurrenceForHour(
    new Date('2026-03-21T04:12:00.000Z'),
    SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  );
  const second = getServiceCrewCctvOccurrenceForHour(
    new Date('2026-03-21T04:59:00.000Z'),
    SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  );

  assert.equal(first.hourKey, '2026-03-21-12');
  assert.equal(first.scheduledMinute, second.scheduledMinute);
  assert.equal(first.scheduledFor.getUTCSeconds(), 0);
  assert.equal(first.scheduledFor.getUTCMilliseconds(), 0);
  assert.match(String(first.scheduledMinute), /^(?:[0-9]|[1-5][0-9])$/);
});

test('getServiceCrewCctvOccurrenceForHour usually varies between Manila hours', () => {
  const first = getServiceCrewCctvOccurrenceForHour(
    new Date('2026-03-21T04:12:00.000Z'),
    SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  );
  const second = getServiceCrewCctvOccurrenceForHour(
    new Date('2026-03-21T05:12:00.000Z'),
    SERVICE_CREW_CCTV_HOURLY_JOB_NAME,
  );

  assert.notEqual(first.hourKey, second.hourKey);
  assert.notEqual(first.scheduledMinute, second.scheduledMinute);
});

test('getServiceCrewCctvSchedulingDecision schedules the current Manila hour before its selected minute', () => {
  const now = new Date('2026-03-21T03:00:00.000Z');
  const current = getServiceCrewCctvOccurrenceForHour(now, SERVICE_CREW_CCTV_HOURLY_JOB_NAME);
  const safeNow = new Date(current.scheduledFor.getTime() - 60_000);

  const decision = getServiceCrewCctvSchedulingDecision(safeNow, SERVICE_CREW_CCTV_HOURLY_JOB_NAME);

  assert.equal(decision.scheduleCurrentHour, true);
  assert.equal(decision.skipCurrentHour, false);
  assert.equal(decision.nextOccurrenceToSchedule.hourKey, decision.currentOccurrence.hourKey);
});

test('getServiceCrewCctvSchedulingDecision skips the current Manila hour after its selected minute', () => {
  const now = new Date('2026-03-21T03:00:00.000Z');
  const current = getServiceCrewCctvOccurrenceForHour(now, SERVICE_CREW_CCTV_HOURLY_JOB_NAME);
  const safeNow = new Date(current.scheduledFor.getTime() + 60_000);

  const decision = getServiceCrewCctvSchedulingDecision(safeNow, SERVICE_CREW_CCTV_HOURLY_JOB_NAME);

  assert.equal(decision.scheduleCurrentHour, false);
  assert.equal(decision.skipCurrentHour, true);
  assert.equal(decision.nextOccurrenceToSchedule.hourKey, decision.nextOccurrence.hourKey);
  assert.notEqual(decision.currentOccurrence.hourKey, decision.nextOccurrence.hourKey);
});
