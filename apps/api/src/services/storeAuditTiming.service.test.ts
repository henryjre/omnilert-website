import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompletedStoreAuditTimestamps,
  buildProcessStoreAuditClaimUpdate,
  buildRejectedStoreAuditUpdate,
} from './storeAuditTiming.service.js';

test('buildProcessStoreAuditClaimUpdate stamps processing_started_at and updated_at at claim time', () => {
  const now = new Date('2026-03-21T02:15:00.000Z');

  const result = buildProcessStoreAuditClaimUpdate({
    userId: 'auditor-1',
    now,
  });

  assert.equal(result.status, 'processing');
  assert.equal(result.auditor_user_id, 'auditor-1');
  assert.equal(result.processing_started_at, now);
  assert.equal(result.updated_at, now);
});

test('buildCompletedStoreAuditTimestamps does not overwrite processing_started_at', () => {
  const completedAt = new Date('2026-03-21T03:45:00.000Z');

  const result = buildCompletedStoreAuditTimestamps(completedAt);

  assert.deepEqual(result, {
    completed_at: completedAt,
    updated_at: completedAt,
  });
  assert.equal('processing_started_at' in result, false);
});

test('buildRejectedStoreAuditUpdate stamps rejected status, reason, and rejected_at', () => {
  const rejectedAt = new Date('2026-03-21T04:05:00.000Z');

  const result = buildRejectedStoreAuditUpdate({
    reason: 'Evidence was insufficient.',
    rejectedAt,
  });

  assert.deepEqual(result, {
    status: 'rejected',
    rejection_reason: 'Evidence was insufficient.',
    rejected_at: rejectedAt,
    updated_at: rejectedAt,
  });
  assert.equal('processing_started_at' in result, false);
  assert.equal('completed_at' in result, false);
});
