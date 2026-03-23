import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
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
  created_at: Date | string;
  updated_at: Date | string;
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
  requesterUserId: string;
  canManage: boolean;
}

export interface SubmitEvaluationBody {
  q1_score: number;
  q2_score: number;
  q3_score: number;
  additional_message?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function hydrateRows(rows: PeerEvaluationRow[]): Promise<PeerEvaluationWithUsers[]> {
  if (rows.length === 0) return [];

  const allUserIds = rows.flatMap((r) => [r.evaluator_user_id, r.evaluated_user_id]);
  const userMap = await hydrateUsersByIds(allUserIds, ['id', 'first_name', 'last_name', 'avatar_url']);

  return rows.map((row) => ({
    ...row,
    evaluator: (userMap[row.evaluator_user_id] as any) ?? null,
    evaluated: (userMap[row.evaluated_user_id] as any) ?? null,
  }));
}

// ─── Service Functions ────────────────────────────────────────────────────────

export async function listPeerEvaluations(
  filters: ListPeerEvaluationsFilters,
): Promise<{ data: PeerEvaluationWithUsers[]; total: number; page: number; pageSize: number }> {
  const {
    status,
    dateFrom,
    dateTo,
    sortBy,
    sortOrder = 'desc',
    userId,
    page = 1,
    pageSize: rawPageSize = 20,
    requesterUserId,
    canManage,
  } = filters;

  // 'score' sorts by average of q1+q2+q3
  const ALLOWED_SORT_FIELDS = ['created_at', 'submitted_at', 'status', 'overlap_minutes'];
  const safeSortBy = sortBy === 'score' ? null : (ALLOWED_SORT_FIELDS.includes(sortBy ?? '') ? sortBy! : 'created_at');

  const pageSize = Math.min(rawPageSize, 100);
  const offset = (page - 1) * pageSize;

  const buildQuery = () => {
    let q = db.getDb()('peer_evaluations');
    if (!canManage) {
      q = q.where((builder) => {
        builder
          .where('evaluator_user_id', requesterUserId)
          .orWhere('evaluated_user_id', requesterUserId);
      });
    }
    if (status) q = q.where('status', status);
    if (dateFrom) q = q.where('created_at', '>=', dateFrom);
    if (dateTo) q = q.where('created_at', '<=', dateTo);
    if (userId) q = q.where('evaluated_user_id', userId);
    return q;
  };

  const rowsQuery = buildQuery().limit(pageSize).offset(offset).select('*');
  if (safeSortBy === null) {
    // sort by average score
    rowsQuery.orderByRaw(`(q1_score + q2_score + q3_score) / 3.0 ${sortOrder}`);
  } else {
    rowsQuery.orderBy(safeSortBy, sortOrder);
  }

  const [countResult, rows] = await Promise.all([
    buildQuery().count('id as count').first(),
    rowsQuery,
  ]);

  const total = Number((countResult as any)?.count ?? 0);
  const data = await hydrateRows(rows as PeerEvaluationRow[]);

  return { data, total, page, pageSize };
}

export async function getPeerEvaluationById(
  id: string,
  access: { requesterUserId: string; canManage: boolean },
): Promise<PeerEvaluationWithUsers | null> {
  const row = await db.getDb()('peer_evaluations').where({ id }).first();
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
  const [updated] = await db.getDb()('peer_evaluations')
    .where({ id })
    .update({
      q1_score: body.q1_score,
      q2_score: body.q2_score,
      q3_score: body.q3_score,
      additional_message: body.additional_message ?? null,
      status: 'completed',
      submitted_at: now,
      updated_at: now,
    })
    .returning('*');

  return updated as PeerEvaluationRow;
}
