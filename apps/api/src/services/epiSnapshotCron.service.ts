import { db } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { calculateKpiScores, type KpiBreakdown } from './epiCalculation.service.js';
import { generateEpiReportPdf, generateManagerSummaryPdf, type EpiReportData } from './epiReport.service.js';
import { sendWeeklyEpiEmail, sendManagerEpiSummaryEmail } from './mail.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface EpiHistoryEntry {
  type: 'weekly' | 'monthly';
  date: string;
  epi_before: number;
  epi_after: number;
  delta: number;
  kpi_breakdown: KpiBreakdown;
  capped: boolean;
  raw_delta: number;
}

interface MasterUserRow {
  id: string;
  user_key: string;
  epi_score: number;
  css_audits: unknown;
  peer_evaluations: unknown;
  compliance_audit: unknown;
  violation_notices: unknown;
}

// ─── Cron Handles ─────────────────────────────────────────────────────────────

let weeklyHandle: NodeJS.Timeout | null = null;
let monthlyHandle: NodeJS.Timeout | null = null;

// ─── Time Checks ──────────────────────────────────────────────────────────────

/**
 * Returns the current time in Asia/Manila timezone broken into components.
 */
function getManilaTime(): { dayOfWeek: number; hour: number; minute: number; dayOfMonth: number } {
  const now = new Date();
  const manilaStr = now.toLocaleString('en-US', { timeZone: 'Asia/Manila' });
  const manila = new Date(manilaStr);
  return {
    dayOfWeek: manila.getDay(),   // 0=Sun, 1=Mon, ... 6=Sat
    hour: manila.getHours(),
    minute: manila.getMinutes(),
    dayOfMonth: manila.getDate(),
  };
}

function isWeeklySnapshotTime(): boolean {
  const { dayOfWeek, hour, minute } = getManilaTime();
  return dayOfWeek === 0 && hour === 17 && minute < 30; // Sunday 5:00–5:30 PM
}

function isMonthlySnapshotTime(): boolean {
  const { dayOfMonth, hour, minute } = getManilaTime();
  return dayOfMonth === 1 && hour === 4 && minute < 30; // 1st of month 4:00–4:30 AM
}

function getManilaDateString(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // YYYY-MM-DD
}

// ─── Snapshot Runners ─────────────────────────────────────────────────────────

export async function runWeeklyEpiSnapshot(): Promise<void> {
  logger.info('EPI weekly snapshot started');

  const masterDb = db.getMasterDb();

  // Fetch active Service Crew users (those with epi_score set)
  // We use a join against user_roles/roles to find Service Crew members
  const users = await masterDb('users as u')
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .where('r.name', 'Service Crew')
    .select(
      'u.id',
      'u.user_key',
      'u.epi_score',
      'u.css_audits',
      'u.peer_evaluations',
      'u.compliance_audit',
      'u.violation_notices',
    )
    .distinct('u.id')
    .orderBy('u.id') as MasterUserRow[];

  logger.info({ count: users.length }, 'EPI weekly snapshot: processing users');

  const snapshotDate = getManilaDateString();
  const reportDataList: EpiReportData[] = [];

  // Fetch user emails and names in bulk
  const userIds = users.map((u) => u.id);
  const userDetails = userIds.length > 0
    ? await masterDb('users').whereIn('id', userIds).select('id', 'first_name', 'last_name', 'email', 'employee_number')
    : [];
  const userDetailMap = new Map(userDetails.map((u) => [u.id as string, u]));

  for (const user of users) {
    try {
      const { breakdown, delta, raw_delta, capped } = await calculateKpiScores({
        userId: user.id,
        userKey: user.user_key,
        cssAudits: (user.css_audits as any) ?? null,
        peerEvaluations: (user.peer_evaluations as any) ?? null,
        complianceAudit: (user.compliance_audit as any) ?? null,
        violationNotices: (user.violation_notices as any) ?? null,
      });

      const epiBefore = Number(user.epi_score ?? 100);
      const epiAfter = Math.round((epiBefore + delta) * 10) / 10;

      const entry: EpiHistoryEntry = {
        type: 'weekly',
        date: snapshotDate,
        epi_before: epiBefore,
        epi_after: epiAfter,
        delta,
        kpi_breakdown: breakdown,
        capped,
        raw_delta,
      };

      await masterDb('users')
        .where({ id: user.id })
        .update({
          epi_score: epiAfter,
          epi_history: masterDb.raw(
            `COALESCE(epi_history, '[]'::jsonb) || ?::jsonb`,
            [JSON.stringify([entry])],
          ),
          updated_at: new Date(),
        });

      const detail = userDetailMap.get(user.id);
      if (detail) {
        reportDataList.push({
          userId: user.id,
          fullName: `${detail.first_name} ${detail.last_name}`.trim(),
          employeeNumber: detail.employee_number ?? null,
          email: detail.email as string,
          epiBefore,
          epiAfter,
          delta,
          rawDelta: raw_delta,
          capped,
          kpiBreakdown: breakdown,
          reportDate: snapshotDate,
        });
      }
    } catch (err) {
      logger.error({ err, userId: user.id }, 'EPI weekly snapshot failed for user');
    }
  }

  // Send individual emails to Service Crew
  for (const reportData of reportDataList) {
    try {
      const pdfBuffer = await generateEpiReportPdf(reportData);
      await sendWeeklyEpiEmail(
        reportData.email,
        reportData.fullName,
        reportData.epiBefore,
        reportData.epiAfter,
        reportData.delta,
        reportData.reportDate,
        pdfBuffer,
      );
    } catch (err) {
      logger.error({ err, userId: reportData.userId }, 'Failed to send EPI email to employee');
    }
  }

  // Send summary email to managers/admins per company
  // Fetch managers grouped by company
  const companies = await masterDb('companies').where({ is_active: true }).select('id', 'name');
  for (const company of companies) {
    try {
      const companyEmployeeIds = new Set(
        (await masterDb('user_company_access')
          .where({ company_id: company.id, is_active: true })
          .select('user_id'))
          .map((r) => r.user_id as string),
      );

      const companyReports = reportDataList.filter((r) => companyEmployeeIds.has(r.userId));
      if (companyReports.length === 0) continue;

      const managers = await masterDb('users as u')
        .join('user_roles as ur', 'u.id', 'ur.user_id')
        .join('roles as r', 'ur.role_id', 'r.id')
        .join('user_company_access as uca', (qb) =>
          qb.on('uca.user_id', 'u.id').andOn('uca.company_id', masterDb.raw('?', [company.id]))
        )
        .where('u.is_active', true)
        .whereIn('r.name', ['Administrator', 'Management'])
        .select('u.id', 'u.first_name', 'u.last_name', 'u.email')
        .distinct('u.id') as Array<{ id: string; first_name: string; last_name: string; email: string }>;

      if (managers.length === 0) continue;

      const avgDelta = companyReports.reduce((s, r) => s + r.delta, 0) / companyReports.length;
      const summaryPdf = await generateManagerSummaryPdf(companyReports, company.name as string, snapshotDate);

      for (const manager of managers) {
        try {
          await sendManagerEpiSummaryEmail(
            manager.email,
            `${manager.first_name} ${manager.last_name}`.trim(),
            company.name as string,
            companyReports.length,
            avgDelta,
            snapshotDate,
            summaryPdf,
          );
        } catch (err) {
          logger.error({ err, managerId: manager.id }, 'Failed to send EPI summary email to manager');
        }
      }
    } catch (err) {
      logger.error({ err, companyId: company.id }, 'Failed to send manager EPI summary for company');
    }
  }

  logger.info({ snapshotDate, processed: reportDataList.length }, 'EPI weekly snapshot completed');
}

export async function runMonthlyEpiSnapshot(): Promise<void> {
  logger.info('EPI monthly snapshot started');

  const masterDb = db.getMasterDb();

  const users = await masterDb('users as u')
    .join('user_roles as ur', 'u.id', 'ur.user_id')
    .join('roles as r', 'ur.role_id', 'r.id')
    .where('u.is_active', true)
    .where('u.employment_status', 'active')
    .where('r.name', 'Service Crew')
    .select(
      'u.id',
      'u.user_key',
      'u.epi_score',
      'u.css_audits',
      'u.peer_evaluations',
      'u.compliance_audit',
      'u.violation_notices',
    )
    .distinct('u.id')
    .orderBy('u.id') as MasterUserRow[];

  const snapshotDate = getManilaDateString();

  for (const user of users) {
    try {
      const { breakdown, raw_delta, capped } = await calculateKpiScores({
        userId: user.id,
        userKey: user.user_key,
        cssAudits: (user.css_audits as any) ?? null,
        peerEvaluations: (user.peer_evaluations as any) ?? null,
        complianceAudit: (user.compliance_audit as any) ?? null,
        violationNotices: (user.violation_notices as any) ?? null,
      });

      const currentEpi = Number(user.epi_score ?? 100);

      const entry: EpiHistoryEntry = {
        type: 'monthly',
        date: snapshotDate,
        epi_before: currentEpi,
        epi_after: currentEpi,
        delta: 0,
        kpi_breakdown: breakdown,
        capped,
        raw_delta,
      };

      await masterDb('users')
        .where({ id: user.id })
        .update({
          epi_history: masterDb.raw(
            `COALESCE(epi_history, '[]'::jsonb) || ?::jsonb`,
            [JSON.stringify([entry])],
          ),
          updated_at: new Date(),
        });
    } catch (err) {
      logger.error({ err, userId: user.id }, 'EPI monthly snapshot failed for user');
    }
  }

  logger.info({ snapshotDate, processed: users.length }, 'EPI monthly snapshot completed');
}

// ─── Cron Init/Stop ───────────────────────────────────────────────────────────

let lastWeeklyRunDate: string | null = null;
let lastMonthlyRunDate: string | null = null;

function weeklyTick(): void {
  if (!isWeeklySnapshotTime()) return;

  const today = getManilaDateString();
  if (lastWeeklyRunDate === today) return; // Already ran today

  lastWeeklyRunDate = today;
  void runWeeklyEpiSnapshot().catch((err) => {
    logger.error({ err }, 'EPI weekly snapshot cron error');
  });
}

function monthlyTick(): void {
  if (!isMonthlySnapshotTime()) return;

  const today = getManilaDateString();
  if (lastMonthlyRunDate === today) return; // Already ran today

  lastMonthlyRunDate = today;
  void runMonthlyEpiSnapshot().catch((err) => {
    logger.error({ err }, 'EPI monthly snapshot cron error');
  });
}

export function initEpiSnapshotCrons(): void {
  if (weeklyHandle || monthlyHandle) return;

  // Check every 15 minutes
  const INTERVAL_MS = 15 * 60 * 1000;

  weeklyHandle = setInterval(weeklyTick, INTERVAL_MS);
  monthlyHandle = setInterval(monthlyTick, INTERVAL_MS);

  logger.info('EPI snapshot crons initialized (check interval: 15 min)');
}

export function stopEpiSnapshotCrons(): void {
  if (weeklyHandle) {
    clearInterval(weeklyHandle);
    weeklyHandle = null;
  }
  if (monthlyHandle) {
    clearInterval(monthlyHandle);
    monthlyHandle = null;
  }
}
