import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { calculateKpiScores, type KpiBreakdown, type UserKpiData } from './epiCalculation.service.js';

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
  currentThirtyDay: CurrentThirtyDaySnapshot | null;
}

export interface LeaderboardEntry {
  userId: string;
  fullName: string;
  avatarUrl: string | null;
  epiScore: number;
  rank: number;
}

export interface CurrentThirtyDaySnapshot {
  asOfDate: string;
  epiProjected: number;
  delta: number;
  raw_delta: number;
  capped: boolean;
  kpi_breakdown: KpiBreakdown;
}

interface EpiDashboardUserRow {
  epi_score: number | null;
  epi_history: unknown;
  user_key: string | null;
  css_audits: unknown;
  peer_evaluations: unknown;
  compliance_audit: unknown;
  violation_notices: unknown;
}

function getManilaDateString(): string {
  const manilaNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
  const year = manilaNow.getFullYear();
  const month = String(manilaNow.getMonth() + 1).padStart(2, '0');
  const day = String(manilaNow.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ─── Service Functions ─────────────────────────────────────────────────────────

export async function getEpiDashboard(userId: string): Promise<EpiDashboardResponse> {
  const masterDb = db.getMasterDb();

  const user = (await masterDb('users')
    .where({ id: userId })
    .select(
      'epi_score',
      'epi_history',
      'user_key',
      'css_audits',
      'peer_evaluations',
      'compliance_audit',
      'violation_notices',
    )
    .first()) as EpiDashboardUserRow | undefined;

  if (!user) {
    return { epiScore: 100, epiHistory: [], currentThirtyDay: null };
  }

  const epiScore = Number(user.epi_score ?? 100);
  const epiHistory: EpiHistoryEntry[] = Array.isArray(user.epi_history)
    ? (user.epi_history as EpiHistoryEntry[])
    : [];
  let currentThirtyDay: CurrentThirtyDaySnapshot | null = null;

  if (user.user_key) {
    try {
      const { breakdown, delta, raw_delta, capped } = await calculateKpiScores({
        userId,
        userKey: user.user_key,
        cssAudits: (user.css_audits as UserKpiData['cssAudits']) ?? null,
        peerEvaluations: (user.peer_evaluations as UserKpiData['peerEvaluations']) ?? null,
        complianceAudit: (user.compliance_audit as UserKpiData['complianceAudit']) ?? null,
        violationNotices: (user.violation_notices as UserKpiData['violationNotices']) ?? null,
      });

      currentThirtyDay = {
        asOfDate: getManilaDateString(),
        epiProjected: Math.round((epiScore + delta) * 10) / 10,
        delta,
        raw_delta,
        capped,
        kpi_breakdown: breakdown,
      };
    } catch (err) {
      logger.error({ err, userId }, 'Failed to compute rolling 30-day dashboard snapshot');
    }
  }

  return { epiScore, epiHistory, currentThirtyDay };
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
