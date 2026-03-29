export type ComplianceRunOutcome =
  | { status: 'success' }
  | { status: 'skipped'; reason?: string | null };

interface ComplianceOccurrenceExecutorDeps {
  jobName: string;
  claimOccurrence: (scheduledFor: Date) => Promise<boolean>;
  runComplianceJob: () => Promise<ComplianceRunOutcome>;
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
  }) => Promise<void>;
  logger: {
    info: (context: Record<string, unknown>, message: string) => void;
    error: (context: Record<string, unknown>, message: string) => void;
  };
  formatScheduledForKey: (scheduledFor: Date) => string;
  formatScheduledForManila: (scheduledFor: Date) => string;
}

export function createComplianceOccurrenceExecutor(deps: ComplianceOccurrenceExecutorDeps) {
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
        'Skipping compliance cron occurrence; occurrence already claimed',
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
      'Starting compliance cron occurrence',
    );

    try {
      const outcome = await deps.runComplianceJob();
      if (outcome.status === 'success') {
        const finishedAt = new Date();
        await deps.markSuccess(input.scheduledFor);
        deps.logger.info(
          { jobName: deps.jobName, scheduledForKey },
          'Completed compliance cron occurrence',
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
              message: 'Completed compliance cron occurrence',
            });
          } catch (notifyError) {
            deps.logger.error(
              { err: notifyError, jobName: deps.jobName, scheduledForKey },
              'Failed to send compliance cron notification',
            );
          }
        }
        return;
      }

      await deps.markSkipped(input.scheduledFor, outcome.reason ?? null);
      deps.logger.info(
        { jobName: deps.jobName, scheduledForKey, reason: outcome.reason ?? null },
        'Skipped compliance cron occurrence',
      );
    } catch (error) {
      const finishedAt = new Date();
      await deps.markFailure(input.scheduledFor, error);
      deps.logger.error(
        { err: error, jobName: deps.jobName, scheduledForKey },
        'Compliance cron occurrence failed',
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
            message: 'Compliance cron occurrence failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        } catch (notifyError) {
          deps.logger.error(
            { err: notifyError, jobName: deps.jobName, scheduledForKey },
            'Failed to send compliance cron notification',
          );
        }
      }
    }
  };
}
