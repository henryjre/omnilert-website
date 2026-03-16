import type { Knex } from 'knex';
import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';

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
  evaluatorName?: string;
  evaluatedName?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
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
  tenantDb: Knex,
  filters: ListPeerEvaluationsFilters,
): Promise<{ data: PeerEvaluationWithUsers[]; total: number; page: number; pageSize: number }> {
  const {
    status,
    dateFrom,
    dateTo,
    sortBy = 'created_at',
    sortOrder = 'desc',
    page = 1,
    pageSize: rawPageSize = 20,
  } = filters;

  const pageSize = Math.min(rawPageSize, 100);
  const offset = (page - 1) * pageSize;

  const buildQuery = () => {
    let q = tenantDb('peer_evaluations');
    if (status) q = q.where('status', status);
    if (dateFrom) q = q.where('created_at', '>=', dateFrom);
    if (dateTo) q = q.where('created_at', '<=', dateTo);
    return q;
  };

  const [countResult, rows] = await Promise.all([
    buildQuery().count('id as count').first(),
    buildQuery()
      .orderBy(sortBy, sortOrder)
      .limit(pageSize)
      .offset(offset)
      .select('*'),
  ]);

  const total = Number((countResult as any)?.count ?? 0);
  const data = await hydrateRows(rows as PeerEvaluationRow[]);

  return { data, total, page, pageSize };
}

export async function getPeerEvaluationById(
  tenantDb: Knex,
  id: string,
): Promise<PeerEvaluationWithUsers | null> {
  const row = await tenantDb('peer_evaluations').where({ id }).first();
  if (!row) return null;

  const [hydrated] = await hydrateRows([row as PeerEvaluationRow]);
  return hydrated ?? null;
}

export async function getPendingForUser(
  tenantDb: Knex,
  userId: string,
): Promise<PeerEvaluationWithUsers[]> {
  const rows = await tenantDb('peer_evaluations')
    .where('evaluator_user_id', userId)
    .where('status', 'pending')
    .whereRaw('expires_at > now()')
    .orderBy('created_at', 'asc')
    .select('*');

  return hydrateRows(rows as PeerEvaluationRow[]);
}

export async function submitEvaluation(
  tenantDb: Knex,
  id: string,
  userId: string,
  body: SubmitEvaluationBody,
): Promise<PeerEvaluationRow> {
  const evaluation = await tenantDb('peer_evaluations').where({ id }).first() as PeerEvaluationRow | undefined;

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
  const [updated] = await tenantDb('peer_evaluations')
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
