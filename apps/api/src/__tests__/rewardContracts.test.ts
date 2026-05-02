import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRewardRequestSchema, rejectRewardRequestSchema, PERMISSIONS } from '@omnilert/shared';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('Rewards contracts', () => {
  test('create reward validation accepts signed epi delta with up to 2 decimal places', () => {
    const addValid = createRewardRequestSchema.safeParse({
      targetUserIds: ['11111111-1111-4111-8111-111111111111'],
      epiDelta: 2.5,
      reason: 'Handled a difficult rush well',
    });
    expect(addValid.success).toBe(true);

    const deductValid = createRewardRequestSchema.safeParse({
      targetUserIds: ['11111111-1111-4111-8111-111111111111'],
      epiDelta: -1.75,
      reason: 'Deduction for policy violation',
    });
    expect(deductValid.success).toBe(true);

    const zeroInvalid = createRewardRequestSchema.safeParse({
      targetUserIds: ['11111111-1111-4111-8111-111111111111'],
      epiDelta: 0,
      reason: 'Zero is not allowed',
    });
    expect(zeroInvalid.success).toBe(false);

    const tooManyDecimalsInvalid = createRewardRequestSchema.safeParse({
      targetUserIds: ['11111111-1111-4111-8111-111111111111'],
      epiDelta: 2.255,
      reason: 'Too many decimals',
    });
    expect(tooManyDecimalsInvalid.success).toBe(false);
  });

  test('reject reward validation requires a rejection reason', () => {
    expect(rejectRewardRequestSchema.safeParse({ rejectionReason: 'Duplicate request' }).success).toBe(true);
    expect(rejectRewardRequestSchema.safeParse({ rejectionReason: '   ' }).success).toBe(false);
  });

  test('shared permissions expose view, issue, and manage rewards grants', () => {
    expect(PERMISSIONS.REWARDS_VIEW).toBe('rewards.view');
    expect(PERMISSIONS.REWARDS_ISSUE).toBe('rewards.issue');
    expect(PERMISSIONS.REWARDS_MANAGE).toBe('rewards.manage');
  });

  test('reward routes are gated with the expected permissions', () => {
    const routes = readRepoFile('apps/api/src/routes/reward.routes.ts');
    expect(routes).toContain('requirePermission(PERMISSIONS.REWARDS_VIEW)');
    expect(routes).toContain('requirePermission(PERMISSIONS.REWARDS_ISSUE)');
    expect(routes).toContain('requirePermission(PERMISSIONS.REWARDS_MANAGE)');
  });

  test('reward service dedupes targets and blocks self review with the shared policy', () => {
    const service = readRepoFile('apps/api/src/services/reward.service.ts');
    expect(service).toContain('Array.from(new Set(input.targetUserIds))');
    expect(service.match(/canReviewSubmittedRequest/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test('reward approval supports signed epi delta (add and deduct)', () => {
    const service = readRepoFile('apps/api/src/services/reward.service.ts');
    expect(service).toContain('epiBefore + epiDeltaValue');
    expect(service).not.toContain('Math.min(100');
    expect(service).not.toContain('epi_points');
    expect(service).toContain('epi_delta');
  });

  test('reward mapping shows Omnilert System for auto-approved system reviews', () => {
    const service = readRepoFile('apps/api/src/services/reward.service.ts');
    expect(service).toContain("'Omnilert System'");
    expect(service).toContain("row.status === 'approved'");
    expect(service).toContain("createdByUserId: row.created_by ? String(row.created_by) : null");
  });

  test('auto-approved EPI adjustments insert approved requests and apply target deltas', () => {
    const helper = readRepoFile('apps/api/src/services/autoApprovedEpiAdjustment.service.ts');
    expect(helper).toContain("status: 'approved'");
    expect(helper).toContain('reviewed_by: null');
    expect(helper).toContain('created_by: input.createdByUserId');
    expect(helper).toContain('epi_score: epiAfter');
    expect(helper).toContain('epi_delta: appliedDelta');
  });

  test('violation notice completion uses auto-approved EPI adjustments for deductions', () => {
    const service = readRepoFile('apps/api/src/services/violationNotice.service.ts');
    const completeBlock = service.slice(
      service.indexOf('export async function completeViolationNotice'),
      service.indexOf('export async function sendMessage'),
    );

    expect(completeBlock).toContain('createAutoApprovedEpiAdjustment');
    expect(completeBlock).toContain('epiDelta: -input.epiDecrease');
    expect(completeBlock).toContain('reason: vnLabel');
    expect(completeBlock).not.toContain('epi_score: epiAfter');
    expect(completeBlock).not.toContain('epiBefore - input.epiDecrease');
  });

  test('violation notice completion notification leaves EPI wording to adjustment notifications', () => {
    const service = readRepoFile('apps/api/src/services/violationNotice.service.ts');
    const notificationBlock = service.slice(
      service.indexOf('async function notifyViolationNoticeCompletionTargets'),
      service.indexOf('export async function completeViolationNotice'),
    );

    expect(notificationBlock).toContain('Violation Notice Completed');
    expect(notificationBlock).not.toContain('EPI decrease');
    expect(notificationBlock).not.toContain('official EPI score');
  });
});
