import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatElapsedMinutes,
  resolveServiceCrewCctvAuditPanelTiming,
} from '../src/features/store-audits/components/serviceCrewCctvAuditTiming';

test('formats durations below one hour in minutes only', () => {
  assert.equal(formatElapsedMinutes(45), '45 mins');
});

test('formats durations of one hour or more in hours and minutes', () => {
  assert.equal(formatElapsedMinutes(75), '1 hour 15 mins');
  assert.equal(formatElapsedMinutes(125), '2 hours 5 mins');
});

test('uses processing timing for active service crew CCTV audits', () => {
  const result = resolveServiceCrewCctvAuditPanelTiming({
    status: 'processing',
    processing_started_at: '2026-03-21T01:00:00.000Z',
    completed_at: null,
    rejected_at: null,
  }, new Date('2026-03-21T01:45:00.000Z'));

  assert.deepEqual(result, {
    kind: 'processing',
    durationText: '45 mins',
  });
});

test('uses audit processing duration for completed service crew CCTV audits', () => {
  const result = resolveServiceCrewCctvAuditPanelTiming({
    status: 'completed',
    processing_started_at: '2026-03-21T02:10:00.000Z',
    completed_at: '2026-03-21T03:25:00.000Z',
    rejected_at: null,
  }, new Date('2026-03-21T04:00:00.000Z'));

  assert.deepEqual(result, {
    kind: 'completed',
    durationText: '1 hour 15 mins',
  });
});

test('falls back to null timing text when required timestamps are missing', () => {
  const result = resolveServiceCrewCctvAuditPanelTiming({
    status: 'completed',
    processing_started_at: null,
    completed_at: '2026-03-21T03:25:00.000Z',
    rejected_at: null,
  }, new Date('2026-03-21T04:00:00.000Z'));

  assert.deepEqual(result, {
    kind: 'completed',
    durationText: null,
  });
});
