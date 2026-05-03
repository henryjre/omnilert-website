import type { Knex } from 'knex';
import { createAndDispatchNotification } from './notification.service.js';

interface AutoApprovedEpiAdjustmentInput {
  companyId: string;
  createdByUserId: string | null;
  targetUserIds: string[];
  epiDelta: number;
  reason: string;
  approvedAt: Date;
  clampMinimum?: number;
  sourceViolationNoticeId?: string | null;
}

export interface AutoApprovedEpiAdjustmentResult {
  requestId: string;
  companyId: string;
  targetUserIds: string[];
  epiDelta: number;
  reason: string;
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function formatEpiPoints(value: number): string {
  return parseFloat(Math.abs(value).toFixed(2)).toString();
}

export async function createAutoApprovedEpiAdjustment(
  trx: Knex.Transaction,
  input: AutoApprovedEpiAdjustmentInput,
): Promise<AutoApprovedEpiAdjustmentResult | null> {
  const targetUserIds = Array.from(new Set(input.targetUserIds));
  if (targetUserIds.length === 0 || input.epiDelta === 0) return null;

  const [request] = await trx('reward_requests')
    .insert({
      company_id: input.companyId,
      epi_delta: input.epiDelta,
      reason: input.reason.trim(),
      status: 'approved',
      created_by: input.createdByUserId,
      reviewed_by: null,
      source_violation_notice_id: input.sourceViolationNoticeId ?? null,
      reviewed_at: input.approvedAt,
      created_at: input.approvedAt,
      updated_at: input.approvedAt,
    })
    .returning<{ id: string }[]>('id');

  if (!request) {
    throw new Error('Failed to create auto-approved EPI adjustment request');
  }

  const rewardTargets = await trx('reward_request_targets')
    .insert(
      targetUserIds.map((userId) => ({
        reward_request_id: request.id,
        user_id: userId,
        created_at: input.approvedAt,
      })),
    )
    .returning<{ id: string; user_id: string }[]>(['id', 'user_id']);

  for (const target of rewardTargets) {
    const user = await trx('users')
      .where({ id: target.user_id })
      .forUpdate()
      .first<{ epi_score: number | string | null }>('epi_score');

    if (!user) continue;

    const epiBefore = toNumber(user.epi_score, 100);
    const unclampedEpiAfter = epiBefore + input.epiDelta;
    const epiAfter =
      typeof input.clampMinimum === 'number'
        ? Math.round(Math.max(input.clampMinimum, unclampedEpiAfter) * 100) / 100
        : Math.round(unclampedEpiAfter * 100) / 100;
    const appliedDelta = Math.round((epiAfter - epiBefore) * 100) / 100;

    await trx('users').where({ id: target.user_id }).update({
      epi_score: epiAfter,
      updated_at: input.approvedAt,
    });

    await trx('reward_request_targets').where({ id: target.id }).update({
      epi_before: epiBefore,
      epi_after: epiAfter,
      epi_delta: appliedDelta,
      applied_at: input.approvedAt,
    });
  }

  return {
    requestId: String(request.id),
    companyId: input.companyId,
    targetUserIds,
    epiDelta: input.epiDelta,
    reason: input.reason.trim(),
  };
}

export async function notifyAutoApprovedEpiAdjustmentTargets(
  adjustment: AutoApprovedEpiAdjustmentResult,
): Promise<void> {
  const isEpiAddition = adjustment.epiDelta >= 0;
  const epiPoints = formatEpiPoints(adjustment.epiDelta);
  const title = isEpiAddition ? 'EPI Points Added' : 'EPI Points Deducted';
  const message = isEpiAddition
    ? `You have been added ${epiPoints} EPI points due to the following reason: ${adjustment.reason}`
    : `You have been deducted ${epiPoints} EPI points due to the following reason: ${adjustment.reason}`;

  await Promise.all(
    adjustment.targetUserIds.map((userId) =>
      createAndDispatchNotification({
        userId,
        companyId: adjustment.companyId,
        title,
        message,
        type: isEpiAddition ? 'success' : 'danger',
        linkUrl: '/dashboard',
      }),
    ),
  );
}
