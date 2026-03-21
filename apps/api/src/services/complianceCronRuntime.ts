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
    const claimed = await deps.claimOccurrence(input.scheduledFor);

    if (!claimed) {
      deps.logger.info(
        { jobName: deps.jobName, scheduledForKey, source: input.source },
        'Skipping compliance cron occurrence; occurrence already claimed',
      );
      return;
    }

    deps.logger.info(
      {
        jobName: deps.jobName,
        scheduledForKey,
        scheduledForManila: deps.formatScheduledForManila(input.scheduledFor),
        source: input.source,
      },
      'Starting compliance cron occurrence',
    );

    try {
      const outcome = await deps.runComplianceJob();
      if (outcome.status === 'success') {
        await deps.markSuccess(input.scheduledFor);
        deps.logger.info(
          { jobName: deps.jobName, scheduledForKey },
          'Completed compliance cron occurrence',
        );
        return;
      }

      await deps.markSkipped(input.scheduledFor, outcome.reason ?? null);
      deps.logger.info(
        { jobName: deps.jobName, scheduledForKey, reason: outcome.reason ?? null },
        'Skipped compliance cron occurrence',
      );
    } catch (error) {
      await deps.markFailure(input.scheduledFor, error);
      deps.logger.error(
        { err: error, jobName: deps.jobName, scheduledForKey },
        'Compliance cron occurrence failed',
      );
    }
  };
}
