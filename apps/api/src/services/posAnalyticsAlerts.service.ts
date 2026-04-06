import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { parseUtcTimestamp } from './odoo.service.js';
import {
  listPosSessionsForRange,
  type PosAnalyticsBranchInput,
  type PosSessionDetail,
} from './posAnalytics.service.js';

const ALERTS_WEBHOOK_URL = 'https://bot.omnilert.app/website/notifications/posAlerts';
const MANILA_TIME_ZONE = 'Asia/Manila' as const;
const ALERT_MONITOR_INTERVAL_MS = 30 * 60 * 1000;
const ALERT_DELIVERY_TIMEOUT_MS = 5_000;
const ALERT_RETRY_DELAYS_MS = [250, 750, 2_000] as const;
const ALERT_DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000;
const MONITOR_WINDOW_DAYS = 2;
const ROLLING_BASELINE_DAYS = 30;
const CASH_VARIANCE_THRESHOLD = 500;
const UNCLOSED_SESSION_HOURS_THRESHOLD = 12;
const ABNORMAL_SALES_HIGH_MULTIPLIER = 3;
const ABNORMAL_SALES_LOW_DIVISOR = 3;
const LONG_DURATION_MINUTES_THRESHOLD = 720;

const ALERT_TITLES = {
  high_cash_variance: '🔴 High Cash Variance Alert',
  unclosed_session: '🔴 Unclosed Session Alert',
  abnormal_sales_session: '🔴 Abnormal Sales Session Alert',
  long_duration_session: '🔴 Long Duration Session Alert',
} as const;

type MonitorSource = 'scheduled' | 'startup';

export type PosAlertCode =
  | 'high_cash_variance'
  | 'unclosed_session'
  | 'abnormal_sales_session'
  | 'long_duration_session';

type AlertComparator = 'gt' | 'lt';
type AlertUnit = 'php' | 'hours' | 'minutes';

type LoggerLike = {
  info: (context: Record<string, unknown>, message: string) => void;
  warn: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface PosAlertPayload {
  event: 'pos_alert.triggered';
  version: 1;
  environment: 'development' | 'production' | 'test';
  sent_at: string;
  alert: {
    key: string;
    code: PosAlertCode;
    title: (typeof ALERT_TITLES)[PosAlertCode];
    severity: 'critical';
    triggered_at: string;
  };
  branch: {
    id: string;
    name: string;
    company_id: string;
    company_name: string;
    odoo_company_id: number;
  };
  session: {
    name: string;
    start_at: string;
    stop_at: string | null;
    state: PosSessionDetail['state'];
    duration_minutes: number | null;
    transaction_count: number;
  };
  metrics: {
    net_sales: number;
    gross_sales: number;
    opening_cash: number;
    expected_closing_cash: number;
    actual_closing_cash: number;
    cash_variance: number;
  };
  threshold: {
    metric: string;
    comparator: AlertComparator;
    value: number;
    unit: AlertUnit;
  };
  context: Record<string, unknown>;
  meta: {
    timezone: typeof MANILA_TIME_ZONE;
    currency: 'PHP';
    monitor_window_start_ymd: string;
    monitor_window_end_ymd: string;
  };
}

interface BuildPosAlertPayloadInput {
  alertCode: PosAlertCode;
  branch: PosAnalyticsBranchInput;
  session: PosSessionDetail;
  triggeredAt: Date;
  sentAt: Date;
  threshold: PosAlertPayload['threshold'];
  context: Record<string, unknown>;
  monitorRange: {
    rangeStartYmd: string;
    rangeEndYmd: string;
  };
  environment: 'development' | 'production' | 'test';
}

interface EvaluatePosAlertsInput {
  branches: PosAnalyticsBranchInput[];
  currentSessions: PosSessionDetail[];
  rollingBaselineSessions: PosSessionDetail[];
  monitorRange: {
    rangeStartYmd: string;
    rangeEndYmd: string;
  };
  now: Date;
  environment: 'development' | 'production' | 'test';
}

interface DeliverPosAlertsOverrides {
  fetchImpl?: FetchLike;
  log?: LoggerLike;
  sentAt?: () => Date;
  token?: string | null;
  webhookUrl?: string | null;
}

interface RunPosAlertsMonitorDeps {
  now?: () => Date;
  loadBranches?: () => Promise<PosAnalyticsBranchInput[]>;
  listSessionsForRangeFn?: typeof listPosSessionsForRange;
  deliverAlertsFn?: (
    alerts: PosAlertPayload[],
  ) => Promise<{ sentCount: number; skippedCount: number; failedCount: number }>;
  log?: LoggerLike;
}

let cronHandle: NodeJS.Timeout | null = null;
const recentAlertKeys = new Map<string, number>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function parseYmdToUtcDate(ymd: string): Date {
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-');
  return new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw), 0, 0, 0, 0));
}

function formatUtcDateToYmd(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function addYmdDays(ymd: string, days: number): string {
  const next = new Date(parseYmdToUtcDate(ymd).getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return formatUtcDateToYmd(next);
}

function formatDateInManilaYmd(date: Date): string {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = formatted.find((part) => part.type === 'year')?.value ?? '1970';
  const month = formatted.find((part) => part.type === 'month')?.value ?? '01';
  const day = formatted.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIsoUtcString(timestamp: string | null): string | null {
  if (!timestamp) return null;
  return parseUtcTimestamp(timestamp).toISOString();
}

function buildAlertKey(
  alertCode: PosAlertCode,
  session: PosSessionDetail,
  discriminator?: string,
): string {
  return [
    alertCode,
    session.branchId,
    session.sessionName,
    session.startAt,
    discriminator ?? '',
  ].join(':');
}

export function buildPosAlertPayload(input: BuildPosAlertPayloadInput): PosAlertPayload {
  return {
    event: 'pos_alert.triggered',
    version: 1,
    environment: input.environment,
    sent_at: input.sentAt.toISOString(),
    alert: {
      key: buildAlertKey(
        input.alertCode,
        input.session,
        typeof input.context.direction === 'string' ? input.context.direction : undefined,
      ),
      code: input.alertCode,
      title: ALERT_TITLES[input.alertCode],
      severity: 'critical',
      triggered_at: input.triggeredAt.toISOString(),
    },
    branch: {
      id: input.branch.id,
      name: input.branch.name,
      company_id: input.branch.companyId,
      company_name: input.branch.companyName,
      odoo_company_id: input.branch.odooCompanyId,
    },
    session: {
      name: input.session.sessionName,
      start_at: toIsoUtcString(input.session.startAt) ?? input.session.startAt,
      stop_at: toIsoUtcString(input.session.stopAt),
      state: input.session.state,
      duration_minutes: input.session.durationMinutes,
      transaction_count: input.session.transactionCount,
    },
    metrics: {
      net_sales: input.session.netSales,
      gross_sales: input.session.grossSales,
      opening_cash: input.session.openingCash,
      expected_closing_cash: input.session.expectedClosingCash,
      actual_closing_cash: input.session.actualClosingCash,
      cash_variance: input.session.cashVariance,
    },
    threshold: input.threshold,
    context: input.context,
    meta: {
      timezone: MANILA_TIME_ZONE,
      currency: 'PHP',
      monitor_window_start_ymd: input.monitorRange.rangeStartYmd,
      monitor_window_end_ymd: input.monitorRange.rangeEndYmd,
    },
  };
}

export function evaluatePosAlerts(input: EvaluatePosAlertsInput): PosAlertPayload[] {
  const branchById = new Map(input.branches.map((branch) => [branch.id, branch]));
  const baselineByBranch = new Map<string, PosSessionDetail[]>();

  for (const session of input.rollingBaselineSessions) {
    if (session.state !== 'closed') continue;
    const sessions = baselineByBranch.get(session.branchId) ?? [];
    sessions.push(session);
    baselineByBranch.set(session.branchId, sessions);
  }

  const alerts: PosAlertPayload[] = [];

  for (const session of input.currentSessions) {
    const branch = branchById.get(session.branchId);
    if (!branch) continue;

    if (session.state === 'closed' && Math.abs(session.cashVariance) > CASH_VARIANCE_THRESHOLD) {
      alerts.push(
        buildPosAlertPayload({
          alertCode: 'high_cash_variance',
          branch,
          session,
          triggeredAt: input.now,
          sentAt: input.now,
          threshold: {
            metric: 'cash_variance',
            comparator: 'gt',
            value: CASH_VARIANCE_THRESHOLD,
            unit: 'php',
          },
          context: {
            direction: session.cashVariance >= 0 ? 'over' : 'short',
            threshold_currency: 'PHP',
          },
          monitorRange: input.monitorRange,
          environment: input.environment,
        }),
      );
    }

    if (session.state === 'opened') {
      const elapsedMs = input.now.getTime() - parseUtcTimestamp(session.startAt).getTime();
      const elapsedHours = round2(elapsedMs / (1000 * 60 * 60));

      if (elapsedHours > UNCLOSED_SESSION_HOURS_THRESHOLD) {
        alerts.push(
          buildPosAlertPayload({
            alertCode: 'unclosed_session',
            branch,
            session,
            triggeredAt: input.now,
            sentAt: input.now,
            threshold: {
              metric: 'elapsed_hours_open',
              comparator: 'gt',
              value: UNCLOSED_SESSION_HOURS_THRESHOLD,
              unit: 'hours',
            },
            context: {
              elapsed_hours: elapsedHours,
            },
            monitorRange: input.monitorRange,
            environment: input.environment,
          }),
        );
      }
    }

    if (session.state === 'closed' && session.durationMinutes !== null) {
      if (session.durationMinutes > LONG_DURATION_MINUTES_THRESHOLD) {
        alerts.push(
          buildPosAlertPayload({
            alertCode: 'long_duration_session',
            branch,
            session,
            triggeredAt: input.now,
            sentAt: input.now,
            threshold: {
              metric: 'duration_minutes',
              comparator: 'gt',
              value: LONG_DURATION_MINUTES_THRESHOLD,
              unit: 'minutes',
            },
            context: {
              duration_hours: round2(session.durationMinutes / 60),
            },
            monitorRange: input.monitorRange,
            environment: input.environment,
          }),
        );
      }

      const baselineSessions = baselineByBranch.get(session.branchId) ?? [];
      if (baselineSessions.length > 0) {
        const averageNetSales = round2(
          baselineSessions.reduce((sum, item) => sum + item.netSales, 0) / baselineSessions.length,
        );

        if (averageNetSales > 0) {
          const abnormalHighThreshold = round2(averageNetSales * ABNORMAL_SALES_HIGH_MULTIPLIER);
          const abnormalLowThreshold = round2(averageNetSales / ABNORMAL_SALES_LOW_DIVISOR);
          const isAbnormalHigh = session.netSales > abnormalHighThreshold;
          const isAbnormalLow = session.netSales < abnormalLowThreshold;

          if (isAbnormalHigh || isAbnormalLow) {
            alerts.push(
              buildPosAlertPayload({
                alertCode: 'abnormal_sales_session',
                branch,
                session,
                triggeredAt: input.now,
                sentAt: input.now,
                threshold: {
                  metric: 'net_sales',
                  comparator: isAbnormalHigh ? 'gt' : 'lt',
                  value: isAbnormalHigh ? abnormalHighThreshold : abnormalLowThreshold,
                  unit: 'php',
                },
                context: {
                  direction: isAbnormalHigh ? 'high' : 'low',
                  rolling_average_net_sales: averageNetSales,
                  rolling_baseline_days: ROLLING_BASELINE_DAYS,
                  rolling_sample_size: baselineSessions.length,
                },
                monitorRange: input.monitorRange,
                environment: input.environment,
              }),
            );
          }
        }
      }
    }
  }

  const deduped = new Map<string, PosAlertPayload>();
  for (const alert of alerts) {
    deduped.set(alert.alert.key, alert);
  }

  return Array.from(deduped.values());
}

async function postPosAlert(
  payload: PosAlertPayload,
  overrides: DeliverPosAlertsOverrides = {},
): Promise<void> {
  const webhookUrl = String(overrides.webhookUrl ?? ALERTS_WEBHOOK_URL).trim();
  const token = String(overrides.token ?? env.DISCORD_BOT_API_TOKEN ?? '').trim();

  if (!webhookUrl || !token) {
    throw new Error('POS alerts webhook configuration is missing');
  }

  const fetchImpl = overrides.fetchImpl ?? fetch;
  let lastError: unknown = null;

  for (let attemptIndex = 0; attemptIndex <= ALERT_RETRY_DELAYS_MS.length; attemptIndex += 1) {
    try {
      const response = await fetchImpl(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(ALERT_DELIVERY_TIMEOUT_MS),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`POS alerts webhook failed with ${response.status}: ${text.slice(0, 500)}`);
      }

      return;
    } catch (error) {
      lastError = error;
      if (attemptIndex >= ALERT_RETRY_DELAYS_MS.length) {
        break;
      }
      await delay(ALERT_RETRY_DELAYS_MS[attemptIndex]);
    }
  }

  throw lastError ?? new Error('POS alerts webhook delivery failed');
}

function shouldDispatchAlert(alert: PosAlertPayload, nowMs: number): boolean {
  for (const [key, expiresAt] of recentAlertKeys.entries()) {
    if (expiresAt <= nowMs) {
      recentAlertKeys.delete(key);
    }
  }

  const existingExpiry = recentAlertKeys.get(alert.alert.key);
  if (existingExpiry && existingExpiry > nowMs) {
    return false;
  }

  recentAlertKeys.set(alert.alert.key, nowMs + ALERT_DEDUP_WINDOW_MS);
  return true;
}

export async function deliverPosAlerts(
  alerts: PosAlertPayload[],
  overrides: DeliverPosAlertsOverrides = {},
): Promise<{ sentCount: number; skippedCount: number; failedCount: number }> {
  const token = String(overrides.token ?? env.DISCORD_BOT_API_TOKEN ?? '').trim();
  const log = overrides.log ?? logger;
  const nowMs = (overrides.sentAt?.() ?? new Date()).getTime();

  if (!token) {
    log.warn(
      { alertCount: alerts.length },
      'Skipping POS alert delivery due to missing DISCORD_BOT_API_TOKEN',
    );
    return {
      sentCount: 0,
      skippedCount: alerts.length,
      failedCount: 0,
    };
  }

  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const alert of alerts) {
    if (!shouldDispatchAlert(alert, nowMs)) {
      skippedCount += 1;
      continue;
    }

    try {
      await postPosAlert(alert, overrides);
      sentCount += 1;
    } catch (error) {
      failedCount += 1;
      log.error(
        {
          err: error,
          alertCode: alert.alert.code,
          alertKey: alert.alert.key,
          sessionName: alert.session.name,
          branchName: alert.branch.name,
        },
        'Failed to deliver POS alert',
      );
    }
  }

  return { sentCount, skippedCount, failedCount };
}

async function loadMonitoredPosBranches(): Promise<PosAnalyticsBranchInput[]> {
  const rows = await db.getDb()('companies as c')
    .join('branches as b', 'b.company_id', 'c.id')
    .where('c.is_active', true)
    .where('b.is_active', true)
    .whereNotNull('b.odoo_branch_id')
    .select(
      'b.id',
      'b.name',
      'c.id as company_id',
      'c.name as company_name',
      'b.odoo_branch_id',
    );

  return rows.flatMap((row) => {
    const odooCompanyId = Number(row.odoo_branch_id);
    if (Number.isNaN(odooCompanyId)) {
      return [];
    }

    return [{
      id: String(row.id),
      name: String(row.name),
      companyId: String(row.company_id),
      companyName: String(row.company_name),
      odooCompanyId,
    }];
  });
}

export async function runPosAlertsMonitor(
  input: { source?: MonitorSource } = {},
  deps: RunPosAlertsMonitorDeps = {},
): Promise<{
  branchCount: number;
  currentSessionCount: number;
  baselineSessionCount: number;
  alertCount: number;
  sentCount: number;
  skippedCount: number;
  failedCount: number;
}> {
  const source = input.source ?? 'scheduled';
  const now = deps.now?.() ?? new Date();
  const log = deps.log ?? logger;
  const loadBranches = deps.loadBranches ?? loadMonitoredPosBranches;
  const listSessions = deps.listSessionsForRangeFn ?? listPosSessionsForRange;
  const deliverAlerts = deps.deliverAlertsFn ?? deliverPosAlerts;

  const monitorEndYmd = formatDateInManilaYmd(now);
  const monitorStartYmd = addYmdDays(monitorEndYmd, -(MONITOR_WINDOW_DAYS - 1));
  const baselineEndYmd = addYmdDays(monitorStartYmd, -1);
  const baselineStartYmd = addYmdDays(monitorStartYmd, -ROLLING_BASELINE_DAYS);

  const branches = await loadBranches();
  if (branches.length === 0) {
    return {
      branchCount: 0,
      currentSessionCount: 0,
      baselineSessionCount: 0,
      alertCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
    };
  }

  const [currentSessions, rollingBaselineSessions] = await Promise.all([
    listSessions({
      rangeStartYmd: monitorStartYmd,
      rangeEndYmd: monitorEndYmd,
      branches,
    }),
    listSessions({
      rangeStartYmd: baselineStartYmd,
      rangeEndYmd: baselineEndYmd,
      branches,
    }),
  ]);

  const alerts = evaluatePosAlerts({
    branches,
    currentSessions,
    rollingBaselineSessions,
    monitorRange: {
      rangeStartYmd: monitorStartYmd,
      rangeEndYmd: monitorEndYmd,
    },
    now,
    environment: env.NODE_ENV,
  });

  const delivery = await deliverAlerts(alerts);

  log.info(
    {
      source,
      branchCount: branches.length,
      currentSessionCount: currentSessions.length,
      baselineSessionCount: rollingBaselineSessions.length,
      alertCount: alerts.length,
      sentCount: delivery.sentCount,
      skippedCount: delivery.skippedCount,
      failedCount: delivery.failedCount,
    },
    'Completed POS alerts monitor run',
  );

  return {
    branchCount: branches.length,
    currentSessionCount: currentSessions.length,
    baselineSessionCount: rollingBaselineSessions.length,
    alertCount: alerts.length,
    sentCount: delivery.sentCount,
    skippedCount: delivery.skippedCount,
    failedCount: delivery.failedCount,
  };
}

export function initPosAlertsMonitor(): void {
  if (cronHandle) return;
  void runPosAlertsMonitor({ source: 'startup' }).catch((error) => {
    logger.error({ err: error }, 'POS alerts monitor startup run failed');
  });
  cronHandle = setInterval(() => {
    void runPosAlertsMonitor({ source: 'scheduled' }).catch((error) => {
      logger.error({ err: error }, 'POS alerts monitor scheduled run failed');
    });
  }, ALERT_MONITOR_INTERVAL_MS);
  logger.info(
    { intervalMs: ALERT_MONITOR_INTERVAL_MS },
    'POS alerts monitor initialized',
  );
}

export function stopPosAlertsMonitor(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
