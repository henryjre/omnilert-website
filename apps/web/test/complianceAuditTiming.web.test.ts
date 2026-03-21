import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatElapsedMinutes,
  resolveComplianceAuditPanelTiming,
} from '../src/features/store-audits/components/complianceAuditTiming';

test('formats durations below one hour in minutes only', () => {
  assert.equal(formatElapsedMinutes(45), '45 mins');
});

test('formats durations of one hour or more in hours and minutes', () => {
  assert.equal(formatElapsedMinutes(75), '1 hour 15 mins');
  assert.equal(formatElapsedMinutes(125), '2 hours 5 mins');
});

test('uses active attendance timing for pending compliance audits', () => {
  const result = resolveComplianceAuditPanelTiming({
    status: 'pending',
    comp_check_in_time: '2026-03-21T01:00:00.000Z',
    processing_started_at: null,
    completed_at: null,
  }, new Date('2026-03-21T01:45:00.000Z'));

  assert.deepEqual(result, {
    kind: 'active',
    activeSince: '2026-03-21T01:00:00.000Z',
    durationText: '45 mins',
  });
});

test('uses audit processing duration for completed compliance audits', () => {
  const result = resolveComplianceAuditPanelTiming({
    status: 'completed',
    comp_check_in_time: '2026-03-21T01:00:00.000Z',
    processing_started_at: '2026-03-21T02:10:00.000Z',
    completed_at: '2026-03-21T03:25:00.000Z',
  }, new Date('2026-03-21T04:00:00.000Z'));

  assert.deepEqual(result, {
    kind: 'completed',
    durationText: '1 hour 15 mins',
  });
});

test('falls back to null timing text when required timestamps are missing', () => {
  const result = resolveComplianceAuditPanelTiming({
    status: 'completed',
    comp_check_in_time: null,
    processing_started_at: null,
    completed_at: '2026-03-21T03:25:00.000Z',
  }, new Date('2026-03-21T04:00:00.000Z'));

  assert.deepEqual(result, {
    kind: 'completed',
    durationText: null,
  });
});
