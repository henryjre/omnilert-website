import type {
  CronJobNotificationFamily,
  CronJobNotificationPayload,
  CronJobNotificationStats,
  CronJobNotificationStatus,
  CronJobNotificationTrigger,
} from '@omnilert/shared';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

const SUCCESS_NOTIFICATION_JOB_NAMES = new Set<string>([
  'compliance_hourly_audit',
  'epi-weekly-snapshot',
  'epi-monthly-snapshot',
  'employee-metric-daily-snapshot',
]);

const RETRY_DELAYS_MS = [250, 750, 2000] as const;
const MANILA_TIMEZONE = 'Asia/Manila' as const;

type LoggerLike = {
  warn: (context: Record<string, unknown>, message: string) => void;
  error: (context: Record<string, unknown>, message: string) => void;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type NotifyCronJobRunInput = {
  jobName: string;
  jobFamily: CronJobNotificationFamily;
  schedule: string;
  source: CronJobNotificationTrigger;
  scheduledForKey?: string | null;
  scheduledForManila?: string | null;
  startedAt: Date;
  finishedAt: Date;
  attempt?: number | null;
  status: CronJobNotificationStatus;
  message: string;
  errorMessage?: string | null;
  stats?: Partial<CronJobNotificationStats> | null;
};

type ShouldSendCronJobNotificationInput = {
  environment: 'development' | 'production' | 'test';
  jobName: string;
  source: CronJobNotificationTrigger;
  status: CronJobNotificationStatus;
};

type ShouldSendCronJobNotificationResult =
  | { send: true }
  | { send: false; reason: 'non_production' | 'policy_filtered' };

export type CronJobNotificationDeliveryResult =
  | { status: 'sent' }
  | { status: 'skipped'; reason: 'non_production' | 'policy_filtered' | 'config_missing' | 'webhook_failed' };

interface CronJobNotifierDeps {
  environment: 'development' | 'production' | 'test';
  webhookUrl?: string | null;
  webhookToken?: string | null;
  timeoutMs: number;
  retryDelaysMs: readonly number[];
  sleep: (ms: number) => Promise<void>;
  fetchImpl: FetchLike;
  now: () => Date;
  log: LoggerLike;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeStats(stats: Partial<CronJobNotificationStats> | null | undefined): CronJobNotificationStats {
  return {
    processed: normalizeNumber(stats?.processed),
    succeeded: normalizeNumber(stats?.succeeded),
    failed: normalizeNumber(stats?.failed),
    skipped: normalizeNumber(stats?.skipped),
  };
}

function toErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.slice(0, 4000);
}

export function shouldSendCronJobNotification(
  input: ShouldSendCronJobNotificationInput,
): ShouldSendCronJobNotificationResult {
  if (input.environment !== 'production') {
    return { send: false, reason: 'non_production' };
  }

  if (input.status === 'failed') {
    return { send: true };
  }

  if (input.source !== 'scheduled') {
    return { send: false, reason: 'policy_filtered' };
  }

  if (!SUCCESS_NOTIFICATION_JOB_NAMES.has(input.jobName)) {
    return { send: false, reason: 'policy_filtered' };
  }

  return { send: true };
}

export function buildCronJobNotificationPayload(input: {
  environment: 'development' | 'production' | 'test';
  sentAt: Date;
  run: NotifyCronJobRunInput;
}): CronJobNotificationPayload {
  const runId = `${input.run.jobName}:${input.run.source}:${input.run.scheduledForKey ?? input.run.startedAt.toISOString()}`;
  const durationMs = Math.max(0, input.run.finishedAt.getTime() - input.run.startedAt.getTime());

  return {
    event: 'cron_job.run',
    version: 1,
    environment: input.environment,
    sent_at: input.sentAt.toISOString(),
    job: {
      name: input.run.jobName,
      family: input.run.jobFamily,
      schedule: input.run.schedule,
      trigger: input.run.source,
    },
    run: {
      id: runId,
      scheduled_for_key: input.run.scheduledForKey ?? null,
      scheduled_for_manila: input.run.scheduledForManila ?? null,
      source: input.run.source,
      started_at: input.run.startedAt.toISOString(),
      finished_at: input.run.finishedAt.toISOString(),
      duration_ms: durationMs,
      attempt: normalizeNumber(input.run.attempt),
    },
    result: {
      status: input.run.status,
      message: input.run.message,
      error_message: input.run.errorMessage ?? null,
    },
    stats: normalizeStats(input.run.stats),
    meta: {
      timezone: MANILA_TIMEZONE,
    },
  };
}

async function postCronNotificationWithRetry(input: {
  fetchImpl: FetchLike;
  webhookUrl: string;
  token: string;
  timeoutMs: number;
  payload: CronJobNotificationPayload;
  retryDelaysMs: readonly number[];
  sleep: (ms: number) => Promise<void>;
}): Promise<void> {
  const attempts = input.retryDelaysMs.length + 1;
  let lastError: unknown = null;

  for (let attemptIndex = 0; attemptIndex < attempts; attemptIndex += 1) {
    try {
      const response = await input.fetchImpl(input.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${input.token}`,
        },
        body: JSON.stringify(input.payload),
        signal: AbortSignal.timeout(input.timeoutMs),
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(
          `Cron notification webhook failed with ${response.status}: ${responseText.slice(0, 500)}`,
        );
      }

      return;
    } catch (error) {
      lastError = error;

      if (attemptIndex >= input.retryDelaysMs.length) {
        break;
      }

      await input.sleep(input.retryDelaysMs[attemptIndex]);
    }
  }

  throw lastError ?? new Error('Cron notification webhook delivery failed');
}

export function createCronJobNotifier(overrides: Partial<CronJobNotifierDeps> = {}) {
  const deps: CronJobNotifierDeps = {
    environment: overrides.environment ?? env.NODE_ENV,
    webhookUrl: overrides.webhookUrl ?? env.DISCORD_BOT_CRON_WEBHOOK_URL,
    webhookToken: overrides.webhookToken ?? env.DISCORD_BOT_CRON_WEBHOOK_TOKEN,
    timeoutMs: overrides.timeoutMs ?? env.DISCORD_BOT_CRON_WEBHOOK_TIMEOUT_MS,
    retryDelaysMs: overrides.retryDelaysMs ?? RETRY_DELAYS_MS,
    sleep: overrides.sleep ?? delay,
    fetchImpl: overrides.fetchImpl ?? fetch,
    now: overrides.now ?? (() => new Date()),
    log: overrides.log ?? logger,
  };

  return async function notifyCronJobRun(
    input: NotifyCronJobRunInput,
  ): Promise<CronJobNotificationDeliveryResult> {
    const decision = shouldSendCronJobNotification({
      environment: deps.environment,
      jobName: input.jobName,
      source: input.source,
      status: input.status,
    });

    if (!decision.send) {
      return {
        status: 'skipped',
        reason: decision.reason,
      };
    }

    const webhookUrl = String(deps.webhookUrl ?? '').trim();
    const webhookToken = String(deps.webhookToken ?? '').trim();
    if (!webhookUrl || !webhookToken) {
      deps.log.warn(
        {
          jobName: input.jobName,
          hasWebhookUrl: Boolean(webhookUrl),
          hasWebhookToken: Boolean(webhookToken),
        },
        'Skipping cron notification delivery due to missing webhook configuration',
      );
      return {
        status: 'skipped',
        reason: 'config_missing',
      };
    }

    const payload = buildCronJobNotificationPayload({
      environment: deps.environment,
      sentAt: deps.now(),
      run: {
        ...input,
        errorMessage: input.errorMessage ? input.errorMessage.slice(0, 4000) : null,
      },
    });

    try {
      await postCronNotificationWithRetry({
        fetchImpl: deps.fetchImpl,
        webhookUrl,
        token: webhookToken,
        timeoutMs: deps.timeoutMs,
        payload,
        retryDelaysMs: deps.retryDelaysMs,
        sleep: deps.sleep,
      });
      return { status: 'sent' };
    } catch (error) {
      deps.log.error(
        {
          err: error,
          jobName: input.jobName,
          runId: payload.run.id,
          status: input.status,
          errorMessage: toErrorMessage(error),
        },
        'Failed to deliver cron notification webhook',
      );
      return {
        status: 'skipped',
        reason: 'webhook_failed',
      };
    }
  };
}

export const notifyCronJobRun = createCronJobNotifier();
