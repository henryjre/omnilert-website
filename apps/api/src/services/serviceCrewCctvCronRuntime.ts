import type { CronJobNotificationStats } from '@omnilert/shared';

export type ServiceCrewCctvRunOutcome =
  | { status: 'success'; stats?: Partial<CronJobNotificationStats> | null }
  | { status: 'skipped'; reason?: string | null; stats?: Partial<CronJobNotificationStats> | null };

interface ServiceCrewCctvOccurrenceExecutorDeps {
  jobName: string;
  claimOccurrence: (scheduledFor: Date) => Promise<boolean>;
  runServiceCrewCctvJob: () => Promise<ServiceCrewCctvRunOutcome>;
  markSuccess: (scheduledFor: Date) => Promise<void>;
  markSkipped: (scheduledFor: Date, reason?: string | null) => Promise<void>;
  markFailure: (scheduledFor: Date, error: unknown) => Promise<void>;
  notifyResult?: (input: {
    status: 'success' | 'failed';
    scheduledFor: Date;
    scheduledForKey: string;
    scheduledForManila: string;
    source: 'scheduled' | 'startup';
    startedAt: Date;
    finishedAt: Date;
    message: string;
    errorMessage?: string | null;
    stats?: Partial<CronJobNotificationStats> | null;
  }) => Promise<void>;
  logger: {
    info: (context: Record<string, unknown>, message: string) => void;
    error: (context: Record<string, unknown>, message: string) => void;
  };
  formatScheduledForKey: (scheduledFor: Date) => string;
  formatScheduledForManila: (scheduledFor: Date) => string;
}

export function createServiceCrewCctvOccurrenceExecutor(
  deps: ServiceCrewCctvOccurrenceExecutorDeps,
) {
  return async function executeOccurrence(input: {
    scheduledFor: Date;
    source: 'scheduled' | 'startup';
  }): Promise<void> {
    const scheduledForKey = deps.formatScheduledForKey(input.scheduledFor);
    const scheduledForManila = deps.formatScheduledForManila(input.scheduledFor);
    const claimed = await deps.claimOccurrence(input.scheduledFor);

    if (!claimed) {
      deps.logger.info(
        { jobName: deps.jobName, scheduledForKey, source: input.source },
        'Skipping service crew cctv cron occurrence; occurrence already claimed',
      );
      return;
    }

    const startedAt = new Date();
    deps.logger.info(
      {
        jobName: deps.jobName,
        scheduledForKey,
        scheduledForManila,
        source: input.source,
      },
      'Starting service crew cctv cron occurrence',
    );

    try {
      const outcome = await deps.runServiceCrewCctvJob();
      if (outcome.status === 'success') {
        const finishedAt = new Date();
        await deps.markSuccess(input.scheduledFor);
        deps.logger.info(
          { jobName: deps.jobName, scheduledForKey },
          'Completed service crew cctv cron occurrence',
        );
        if (deps.notifyResult) {
          try {
            await deps.notifyResult({
              status: 'success',
              scheduledFor: input.scheduledFor,
              scheduledForKey,
              scheduledForManila,
              source: input.source,
              startedAt,
              finishedAt,
              message: 'Completed service crew cctv cron occurrence',
              stats: outcome.stats ?? null,
            });
          } catch (notifyError) {
            deps.logger.error(
              { err: notifyError, jobName: deps.jobName, scheduledForKey },
              'Failed to send service crew cctv cron notification',
            );
          }
        }
        return;
      }

      await deps.markSkipped(input.scheduledFor, outcome.reason ?? null);
      deps.logger.info(
        { jobName: deps.jobName, scheduledForKey, reason: outcome.reason ?? null },
        'Skipped service crew cctv cron occurrence',
      );
    } catch (error) {
      const finishedAt = new Date();
      await deps.markFailure(input.scheduledFor, error);
      deps.logger.error(
        { err: error, jobName: deps.jobName, scheduledForKey },
        'Service crew cctv cron occurrence failed',
      );
      if (deps.notifyResult) {
        try {
          await deps.notifyResult({
            status: 'failed',
            scheduledFor: input.scheduledFor,
            scheduledForKey,
            scheduledForManila,
            source: input.source,
            startedAt,
            finishedAt,
            message: 'Service crew cctv cron occurrence failed',
            errorMessage: error instanceof Error ? error.message : String(error),
            stats: { processed: 1, succeeded: 0, failed: 1, skipped: 0 },
          });
        } catch (notifyError) {
          deps.logger.error(
            { err: notifyError, jobName: deps.jobName, scheduledForKey },
            'Failed to send service crew cctv cron notification',
          );
        }
      }
    }
  };
}
