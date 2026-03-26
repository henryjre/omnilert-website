import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import type { GlobalUser } from './globalUser.service.js';
import { db } from '../config/database.js';

// ─── Internal Row Types ───────────────────────────────────────────────────────

type PeerEvaluationRow = {
  id: string;
  evaluator_user_id: string;
  evaluated_user_id: string;
  shift_id: string;
  status: string;
  q1_score: number;
  q2_score: number;
  q3_score: number;
  additional_message: string | null;
  overlap_minutes: number;
  expires_at: Date | string;
  submitted_at: Date | string | null;
  wrs_effective_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  branch_id?: string | null;
  shift_date?: Date | string | null;
};

// ─── Public Types ─────────────────────────────────────────────────────────────

export type PeerEvaluationWithUsers = PeerEvaluationRow & {
  evaluator: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
  evaluated: {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url: string | null;
  } | null;
};

export interface ListPeerEvaluationsFilters {
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  userId?: string;
  page?: number;
  pageSize?: number;
  companyId: string;
  requesterUserId: string;
  canManage: boolean;
}

export interface SubmitEvaluationBody {
  q1_score: number;
  q2_score: number;
  q3_score: number;
  additional_message?: string;
}

const TEN_DAYS_IN_MS = 10 * 24 * 60 * 60 * 1000;

export function createRandomWrsDelayMs(randomValue: number = Math.random()): number {
  const normalized = Number.isFinite(randomValue)
    ? Math.min(1, Math.max(0, randomValue))
    : 0;
  return Math.floor(normalized * TEN_DAYS_IN_MS);
}

export function buildWrsEffectiveAt(submittedAt: Date, randomValue: number = Math.random()): Date {
  return new Date(submittedAt.getTime() + createRandomWrsDelayMs(randomValue));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hydrateRows(rows: PeerEvaluationRow[]): Promise<PeerEvaluationWithUsers[]> {
  if (rows.length === 0) return [];

  const allUserIds = rows.flatMap((r) => [r.evaluator_user_id, r.evaluated_user_id]);
  const userMap = await hydrateUsersByIds(allUserIds, ['id', 'first_name', 'last_name', 'avatar_url']);

  const toHydratedUser = (
    candidate: Partial<GlobalUser> | undefined,
  ): { id: string; first_name: string; last_name: string; avatar_url: string | null } | null => {
    if (!candidate) return null;
    if (typeof candidate.id !== 'string') return null;
    if (typeof candidate.first_name !== 'string') return null;
    if (typeof candidate.last_name !== 'string') return null;
    const avatarUrl = candidate.avatar_url === null || typeof candidate.avatar_url === 'string'
      ? candidate.avatar_url
      : null;
    return {
      id: candidate.id,
      first_name: candidate.first_name,
      last_name: candidate.last_name,
      avatar_url: avatarUrl,
    };
  };

  return rows.map((row) => ({
    ...row,
    evaluator: toHydratedUser(userMap[row.evaluator_user_id]),
    evaluated: toHydratedUser(userMap[row.evaluated_user_id]),
  }));
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listPeerEvaluations(
  filters: ListPeerEvaluationsFilters,
): Promise<{ items: PeerEvaluationWithUsers[]; total: number; page: number; pageSize: number }> {
  const {
    status,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder = 'desc',
    userId,
    page = 1,
    pageSize: rawPageSize = 20,
    companyId,
    requesterUserId,
    canManage,
  } = filters;

  // 'score' sorts by average of q1+q2+q3
  const ALLOWED_SORT_FIELDS = ['created_at', 'submitted_at', 'status', 'overlap_minutes'];
  const safeSortBy =
    sortBy === 'score'
      ? null
      : sortBy && ALLOWED_SORT_FIELDS.includes(sortBy)
        ? sortBy
        : 'created_at';

  const pageSize = Math.min(rawPageSize, 100);
  const offset = (page - 1) * pageSize;

  const buildQuery = () => {
    let q = db.getDb()('peer_evaluations as pe')
      .join('employee_shifts as s', 'pe.shift_id', 's.id')
      .where('pe.company_id', companyId);

    if (!canManage) {
      q = q.where((builder) => {
        builder
          .where('pe.evaluator_user_id', requesterUserId)
          .orWhere('pe.evaluated_user_id', requesterUserId);
      });
    }

    if (status) q = q.where('pe.status', status);
    if (dateFrom) q = q.where('pe.created_at', '>=', dateFrom);
    if (dateTo) q = q.where('pe.created_at', '<=', dateTo);
    if (userId) q = q.where('pe.evaluated_user_id', userId);

    return q;
  };

  const rowsQuery = buildQuery()
    .limit(pageSize)
    .offset(offset)
    .select('pe.*', 's.branch_id', 's.shift_start as shift_date');
  if (safeSortBy === null) {
    // sort by average score
    rowsQuery.orderByRaw(`(q1_score + q2_score + q3_score) / 3.0 ${sortOrder}`);
  } else {
    rowsQuery.orderBy(safeSortBy, sortOrder);
  }

  const [countResult, rows] = await Promise.all([
    buildQuery().count('pe.id as count').first(),
    rowsQuery,
  ]);

  const total = Number(((countResult as { count?: number | string } | undefined)?.count ?? 0));
  const items = await hydrateRows(rows as PeerEvaluationRow[]);

  return { items, total, page, pageSize };
}

export async function getPeerEvaluationById(
  id: string,
  access: { requesterUserId: string; canManage: boolean },
): Promise<PeerEvaluationWithUsers | null> {
  const row = await db.getDb()('peer_evaluations as pe')
    .join('employee_shifts as s', 'pe.shift_id', 's.id')
    .where('pe.id', id)
    .select('pe.*', 's.branch_id', 's.shift_start as shift_date')
    .first();
  if (!row) return null;
  if (!access.canManage) {
    const requesterUserId = access.requesterUserId;
    const isRequesterRelated = row.evaluator_user_id === requesterUserId || row.evaluated_user_id === requesterUserId;
    if (!isRequesterRelated) {
      return null;
    }
  }

  const [hydrated] = await hydrateRows([row as PeerEvaluationRow]);
  return hydrated ?? null;
}

export async function getPendingForUser(
  userId: string,
): Promise<PeerEvaluationWithUsers[]> {
  const rows = await db.getDb()('peer_evaluations')
    .where('evaluator_user_id', userId)
    .where('status', 'pending')
    .whereRaw('expires_at > now()')
    .orderBy('created_at', 'asc')
    .select('*');

  return hydrateRows(rows as PeerEvaluationRow[]);
}

export async function submitEvaluation(
  id: string,
  userId: string,
  body: SubmitEvaluationBody,
): Promise<PeerEvaluationRow> {
  const evaluation = await db.getDb()('peer_evaluations').where({ id }).first() as PeerEvaluationRow | undefined;

  if (!evaluation) {
    throw new AppError(404, 'Peer evaluation not found');
  }

  if (evaluation.evaluator_user_id !== userId) {
    throw new AppError(403, 'Not authorized to submit this evaluation');
  }

  if (evaluation.status !== 'pending') {
    throw new AppError(400, 'Evaluation is no longer pending');
  }

  if (new Date(evaluation.expires_at) <= new Date()) {
    throw new AppError(400, 'Evaluation period has expired');
  }

  const now = new Date();
  const wrsEffectiveAt = buildWrsEffectiveAt(now);
  const [updated] = await db.getDb()('peer_evaluations')
    .where({ id })
    .update({
      q1_score: body.q1_score,
      q2_score: body.q2_score,
      q3_score: body.q3_score,
      additional_message: body.additional_message ?? null,
      status: 'completed',
      submitted_at: now,
      wrs_effective_at: wrsEffectiveAt,
      updated_at: now,
    })
    .returning('*');

  return updated as PeerEvaluationRow;
}
