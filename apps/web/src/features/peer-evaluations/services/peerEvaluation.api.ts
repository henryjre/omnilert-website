import { api } from '@/shared/services/api.client';

export type PeerEvalStatus = 'pending' | 'completed' | 'expired';

export interface PeerEvaluationUser {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export interface PeerEvaluation {
  id: string;
  evaluator_user_id: string;
  evaluated_user_id: string;
  shift_id: string;
  status: PeerEvalStatus;
  q1_score: number;
  q2_score: number;
  q3_score: number;
  additional_message: string | null;
  overlap_minutes: number;
  expires_at: string;
  submitted_at: string | null;
  wrs_effective_at: string | null;
  created_at: string;
  updated_at: string;
  evaluator: PeerEvaluationUser | null;
  evaluated: PeerEvaluationUser | null;
  shift_date?: string | null;
  branch_id?: string | null;
}

export interface PeerEvalFilters {
  status?: PeerEvalStatus | 'all';
  date_from?: string;
  date_to?: string;
  sort_by?: 'created_at' | 'score';
  sort_order?: 'asc' | 'desc';
  user_id?: string;
}

export interface PeerEvalListResponse {
  items: PeerEvaluation[];
  total: number;
}

export async function listPeerEvaluations(filters: PeerEvalFilters = {}): Promise<PeerEvalListResponse> {
  const params: Record<string, string> = {};
  if (filters.status && filters.status !== 'all') params.status = filters.status;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.sort_by) params.sort_by = filters.sort_by;
  if (filters.sort_order) params.sort_order = filters.sort_order;
  if (filters.user_id) params.user_id = filters.user_id;

  const response = await api.get('/peer-evaluations', { params });
  const payload = response.data.data ?? response.data;
  return { items: payload.items ?? [], total: payload.total ?? 0 };
}

export async function getPeerEvaluationById(id: string): Promise<PeerEvaluation> {
  const response = await api.get(`/peer-evaluations/${id}`);
  return response.data.data as PeerEvaluation;
}
