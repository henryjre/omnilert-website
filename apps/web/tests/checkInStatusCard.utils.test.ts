import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatCheckInTimeInManila,
  formatDurationSince,
  parseOdooUtcDateTime,
} from '../src/features/dashboard/components/checkin/checkInStatusCard.utils.js';

test('parseOdooUtcDateTime parses Odoo UTC datetime values', () => {
  const parsed = parseOdooUtcDateTime('2026-03-26 12:00:00');
  assert.equal(parsed?.toISOString(), '2026-03-26T12:00:00.000Z');
  assert.equal(parseOdooUtcDateTime(''), null);
  assert.equal(parseOdooUtcDateTime(null), null);
});

test('formatCheckInTimeInManila uses h:mm A for same Manila day', () => {
  const checkIn = new Date('2026-03-26T12:00:00.000Z');
  const now = new Date('2026-03-26T15:00:00.000Z');

  assert.equal(formatCheckInTimeInManila(checkIn, now), '8:00 PM');
});

test('formatCheckInTimeInManila uses MMM DD, h:mm A for prior Manila day', () => {
  const checkIn = new Date('2026-03-26T12:00:00.000Z');
  const now = new Date('2026-03-27T01:00:00.000Z');

  assert.equal(formatCheckInTimeInManila(checkIn, now), 'Mar 26, 8:00 PM');
});

test('formatDurationSince returns humanized elapsed time', () => {
  const start = new Date('2026-03-26T12:00:00.000Z');

  assert.equal(formatDurationSince(start, new Date('2026-03-26T12:45:00.000Z')), '45 mins');
  assert.equal(formatDurationSince(start, new Date('2026-03-26T13:15:00.000Z')), '1 hr 15 mins');
  assert.equal(formatDurationSince(start, new Date('2026-03-26T11:59:00.000Z')), '0 mins');
});

