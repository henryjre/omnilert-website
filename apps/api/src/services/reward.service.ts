import type {
  GroupedUsersResponse,
  RewardRequestDetail,
  RewardRequestListResponse,
  RewardRequestStatus,
  RewardRequestSummary,
  RewardRequestTarget,
} from '@omnilert/shared';
import { canReviewSubmittedRequest } from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { createAndDispatchNotification } from './notification.service.js';
import { getGroupedUsersForVN } from './violationNotice.service.js';

interface RewardRequestRow {
  id: string;
  company_id: string;
  company_name: string | null;
  epi_delta: number | string;
  reason: string;
  status: RewardRequestStatus;
  created_by: string | null;
  created_by_name: string | null;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: Date | string | null;
  rejection_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  target_count?: number | string;
}

interface RewardTargetRow {
  id: string;
  reward_request_id: string;
  user_id: string;
  employee_name: string | null;
  employee_avatar_url: string | null;
  epi_before: number | string | null;
  epi_after: number | string | null;
  epi_delta: number | string | null;
  applied_at: Date | string | null;
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapTarget(row: RewardTargetRow): RewardRequestTarget {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    employeeName: String(row.employee_name ?? '').trim(),
    employeeAvatarUrl: row.employee_avatar_url ?? null,
    epiBefore: row.epi_before === null ? null : toNumber(row.epi_before),
    epiAfter: row.epi_after === null ? null : toNumber(row.epi_after),
    epiDelta: row.epi_delta === null ? null : toNumber(row.epi_delta),
    appliedAt: toIso(row.applied_at),
  };
}

function mapRequest(row: RewardRequestRow, targets: RewardRequestTarget[]): RewardRequestSummary {
  const createdByName = row.created_by
    ? String(row.created_by_name ?? '').trim()
    : 'Omnilert System';
  const reviewedByName = row.reviewed_by
    ? String(row.reviewed_by_name ?? '').trim() || null
    : row.status === 'approved'
      ? 'Omnilert System'
      : null;

  return {
    id: String(row.id),
    companyId: String(row.company_id),
    companyName: row.company_name ?? null,
    status: row.status,
    reason: row.reason,
    epiDelta: toNumber(row.epi_delta),
    targetCount: Number(row.target_count ?? targets.length),
    createdByUserId: row.created_by ? String(row.created_by) : null,
    createdByName,
    reviewedByUserId: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewedByName,
    reviewedAt: toIso(row.reviewed_at),
    rejectionReason: row.rejection_reason ?? null,
    createdAt: toIso(row.created_at) ?? new Date().toISOString(),
    updatedAt: toIso(row.updated_at) ?? new Date().toISOString(),
    targets,
  };
}

function baseRequestQuery() {
  const knex = db.getDb();
  return knex('reward_requests as rr')
    .leftJoin('companies as c', 'c.id', 'rr.company_id')
    .leftJoin('users as creator', 'creator.id', 'rr.created_by')
    .leftJoin('users as reviewer', 'reviewer.id', 'rr.reviewed_by')
    .select(
      'rr.id',
      'rr.company_id',
      'c.name as company_name',
      'rr.epi_delta',
      'rr.reason',
      'rr.status',
      'rr.created_by',
      knex.raw(
        `NULLIF(TRIM(CONCAT_WS(' ', creator.first_name, creator.last_name)), '') as created_by_name`,
      ),
      'rr.reviewed_by',
      knex.raw(
        `NULLIF(TRIM(CONCAT_WS(' ', reviewer.first_name, reviewer.last_name)), '') as reviewed_by_name`,
      ),
      'rr.reviewed_at',
      'rr.rejection_reason',
      'rr.created_at',
      'rr.updated_at',
    );
}

async function fetchTargetsByRequestIds(
  requestIds: string[],
): Promise<Map<string, RewardRequestTarget[]>> {
  if (requestIds.length === 0) return new Map();

  const rows = await db
    .getDb()('reward_request_targets as rrt')
    .leftJoin('users as u', 'u.id', 'rrt.user_id')
    .whereIn('rrt.reward_request_id', requestIds)
    .select<
      RewardTargetRow[]
    >('rrt.id', 'rrt.reward_request_id', 'rrt.user_id', db.getDb().raw(`NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), '') as employee_name`), 'u.avatar_url as employee_avatar_url', 'rrt.epi_before', 'rrt.epi_after', 'rrt.epi_delta', 'rrt.applied_at')
    .orderBy('u.last_name', 'asc')
    .orderBy('u.first_name', 'asc')
    .orderBy('rrt.id', 'asc');

  const byRequestId = new Map<string, RewardRequestTarget[]>();
  for (const row of rows) {
    const requestTargets = byRequestId.get(row.reward_request_id) ?? [];
    requestTargets.push(mapTarget(row));
    byRequestId.set(row.reward_request_id, requestTargets);
  }
  return byRequestId;
}

export async function listRewardRequests(input: {
  companyId: string;
  status?: RewardRequestStatus;
  page: number;
  limit: number;
}): Promise<RewardRequestListResponse> {
  const knex = db.getDb();
  const page = Math.max(1, Number(input.page) || 1);
  const limit = Math.max(1, Math.min(Number(input.limit) || 10, 100));

  const baseFilter = () => {
    let query = knex('reward_requests as rr').where('rr.company_id', input.companyId);
    if (input.status) {
      query = query.andWhere('rr.status', input.status);
    }
    return query;
  };

  const countRow = await baseFilter().count<{ count: string }>('* as count').first();
  const total = Number(countRow?.count ?? 0);

  const rows = (await baseRequestQuery()
    .where('rr.company_id', input.companyId)
    .modify((query) => {
      if (input.status) query.andWhere('rr.status', input.status);
    })
    .select(
      knex('reward_request_targets as rrt')
        .whereRaw('rrt.reward_request_id = rr.id')
        .count('*')
        .as('target_count'),
    )
    .orderBy('rr.created_at', 'desc')
    .offset((page - 1) * limit)
    .limit(limit)) as RewardRequestRow[];

  const targetsByRequestId = await fetchTargetsByRequestIds(rows.map((row) => row.id));
  return {
    items: rows.map((row) => mapRequest(row, targetsByRequestId.get(row.id) ?? [])),
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getRewardRequestDetail(input: {
  companyId: string;
  requestId: string;
}): Promise<RewardRequestDetail> {
  const row = await baseRequestQuery()
    .where({ 'rr.company_id': input.companyId, 'rr.id': input.requestId })
    .first<RewardRequestRow>();

  if (!row) {
    throw new AppError(404, 'Reward request not found');
  }

  const targetsByRequestId = await fetchTargetsByRequestIds([row.id]);
  const targets = targetsByRequestId.get(row.id) ?? [];
  return mapRequest({ ...row, target_count: targets.length }, targets);
}

export async function createRewardRequest(input: {
  companyId: string;
  createdByUserId: string;
  targetUserIds: string[];
  epiDelta: number;
  reason: string;
}): Promise<{ id: string }> {
  const uniqueTargetUserIds = Array.from(new Set(input.targetUserIds));
  if (uniqueTargetUserIds.length === 0) {
    throw new AppError(400, 'At least one target employee is required');
  }

  const now = new Date();
  const [created] = await db.getDb().transaction(async (trx) => {
    const [request] = await trx('reward_requests')
      .insert({
        company_id: input.companyId,
        epi_delta: input.epiDelta,
        reason: input.reason.trim(),
        status: 'pending',
        created_by: input.createdByUserId,
        created_at: now,
        updated_at: now,
      })
      .returning<{ id: string }[]>('id');

    await trx('reward_request_targets').insert(
      uniqueTargetUserIds.map((userId) => ({
        reward_request_id: request.id,
        user_id: userId,
        created_at: now,
      })),
    );

    return [request];
  });

  return { id: String(created.id) };
}

export async function approveRewardRequest(input: {
  companyId: string;
  requestId: string;
  actingUserId: string;
}): Promise<RewardRequestDetail> {
  const knex = db.getDb();
  const now = new Date();

  await knex.transaction(async (trx) => {
    const request = await trx('reward_requests')
      .where({ id: input.requestId, company_id: input.companyId })
      .forUpdate()
      .first<{
        id: string;
        company_id: string;
        status: RewardRequestStatus;
        created_by: string | null;
        epi_delta: number | string;
      }>();

    if (!request) {
      throw new AppError(404, 'Reward request not found');
    }

    if (
      !canReviewSubmittedRequest({
        actingUserId: input.actingUserId,
        requestUserId: request.created_by,
      })
    ) {
      throw new AppError(403, 'You cannot approve your own reward request');
    }

    if (request.status !== 'pending') {
      throw new AppError(409, 'Reward request is already resolved');
    }

    const targets = await trx('reward_request_targets')
      .where({ reward_request_id: request.id })
      .forUpdate()
      .select<{ id: string; user_id: string }[]>('id', 'user_id');

    const epiDeltaValue = toNumber(request.epi_delta);

    for (const target of targets) {
      const user = await trx('users')
        .where({ id: target.user_id })
        .forUpdate()
        .first<{ epi_score: number | string | null }>('epi_score');

      if (!user) continue;

      const epiBefore = toNumber(user.epi_score, 100);
      const epiAfter = Math.round((epiBefore + epiDeltaValue) * 100) / 100;
      const epiDelta = Math.round((epiAfter - epiBefore) * 100) / 100;

      await trx('users').where({ id: target.user_id }).update({
        epi_score: epiAfter,
        updated_at: now,
      });

      await trx('reward_request_targets').where({ id: target.id }).update({
        epi_before: epiBefore,
        epi_after: epiAfter,
        epi_delta: epiDelta,
        applied_at: now,
      });
    }

    await trx('reward_requests').where({ id: request.id }).update({
      status: 'approved',
      reviewed_by: input.actingUserId,
      reviewed_at: now,
      updated_at: now,
    });
  });

  const detail = await getRewardRequestDetail({
    companyId: input.companyId,
    requestId: input.requestId,
  });
  const isEpiAddition = detail.epiDelta >= 0;
  const epiPoints = parseFloat(Math.abs(detail.epiDelta).toFixed(2)).toString();
  const notificationTitle = isEpiAddition ? 'EPI Points Added' : 'EPI Points Deducted';
  const notificationMessage = isEpiAddition
    ? `You have been added ${epiPoints} EPI points due to the following reason: ${detail.reason}`
    : `You have been deducted ${epiPoints} EPI points due to the following reason: ${detail.reason}`;

  await Promise.allSettled(
    detail.targets.map((target) =>
      createAndDispatchNotification({
        userId: target.userId,
        companyId: input.companyId,
        title: notificationTitle,
        message: notificationMessage,
        type: 'success',
        linkUrl: '/dashboard',
      }),
    ),
  ).then((results) => {
    const rejected = results.filter((result) => result.status === 'rejected');
    if (rejected.length > 0) {
      logger.error(
        { requestId: input.requestId, rejected: rejected.length },
        'Failed to notify some reward targets',
      );
    }
  });

  return detail;
}

export async function rejectRewardRequest(input: {
  companyId: string;
  requestId: string;
  actingUserId: string;
  rejectionReason: string;
}): Promise<RewardRequestDetail> {
  const knex = db.getDb();
  const now = new Date();

  const request = await knex('reward_requests')
    .where({ id: input.requestId, company_id: input.companyId })
    .first<{
      id: string;
      status: RewardRequestStatus;
        created_by: string | null;
    }>();

  if (!request) {
    throw new AppError(404, 'Reward request not found');
  }

  if (
    !canReviewSubmittedRequest({
      actingUserId: input.actingUserId,
      requestUserId: request.created_by,
    })
  ) {
    throw new AppError(403, 'You cannot reject your own reward request');
  }

  if (request.status !== 'pending') {
    throw new AppError(409, 'Reward request is already resolved');
  }

  await knex('reward_requests').where({ id: request.id }).update({
    status: 'rejected',
    reviewed_by: input.actingUserId,
    reviewed_at: now,
    rejection_reason: input.rejectionReason.trim(),
    updated_at: now,
  });

  if (request.created_by) {
    try {
      await createAndDispatchNotification({
        userId: request.created_by,
        companyId: input.companyId,
        title: 'Reward Request Rejected',
        message: `Your reward request was rejected. Reason: ${input.rejectionReason.trim()}`,
        type: 'warning',
        linkUrl: '/rewards',
      });
    } catch (err) {
      logger.error(
        { err, requestId: input.requestId },
        'Failed to notify reward requester about rejection',
      );
    }
  }

  return getRewardRequestDetail({ companyId: input.companyId, requestId: input.requestId });
}

export async function getGroupedUsers(companyId: string): Promise<GroupedUsersResponse> {
  return getGroupedUsersForVN({ companyId });
}
