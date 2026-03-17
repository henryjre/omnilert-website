import { db } from '../config/database.js';
import type { KpiBreakdown } from './epiCalculation.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EpiHistoryEntry {
  type: 'weekly' | 'monthly';
  date: string;
  epi_before: number;
  epi_after: number;
  delta: number;
  kpi_breakdown: KpiBreakdown;
  capped: boolean;
  raw_delta: number;
}

export interface EpiDashboardResponse {
  epiScore: number;
  epiHistory: EpiHistoryEntry[];
}

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  epiScore: number;
  rank: number;
}

// ─── Service Functions ─────────────────────────────────────────────────────────

export async function getEpiDashboard(userId: string): Promise<EpiDashboardResponse> {
  const masterDb = db.getMasterDb();

  const user = await masterDb('users')
    .where({ id: userId })
    .select('epi_score', 'epi_history')
    .first();

  if (!user) {
    return { epiScore: 100, epiHistory: [] };
  }

  const epiScore = Number(user.epi_score ?? 100);
  const epiHistory: EpiHistoryEntry[] = Array.isArray(user.epi_history)
    ? (user.epi_history as EpiHistoryEntry[])
    : [];

  return { epiScore, epiHistory };
}

export async function getEpiLeaderboard(companyId: string): Promise<LeaderboardEntry[]> {
  const masterDb = db.getMasterDb();

  // Get active Service Crew users in this company, ranked by EPI score
  const users = await masterDb('users as u')
    .join('user_company_access as uca', (qb) =>
      qb.on('uca.user_id', 'u.id').andOnVal('uca.company_id', companyId),
    )
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .where('r.name', 'Service Crew')
    .where('uca.is_active', true)
    .select(
      'u.id as userId',
      'u.first_name',
      'u.last_name',
      'u.avatar_url as avatarUrl',
      'u.epi_score as epiScore',
    )
    .distinct('u.id')
    .orderBy('u.epi_score', 'desc') as Array<{
    userId: string;
    first_name: string;
    last_name: string;
    avatarUrl: string | null;
    epiScore: string | number;
  }>;

  return users.map((u, idx) => ({
    userId: u.userId,
    fullName: `${u.first_name} ${u.last_name}`.trim(),
    avatarUrl: u.avatarUrl,
    epiScore: Math.round(Number(u.epiScore ?? 100) * 10) / 10,
    rank: idx + 1,
  }));
}
