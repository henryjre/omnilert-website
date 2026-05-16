import { logger } from '../utils/logger.js';
import { buildCronFailureErrorMessage, notifyCronJobRun } from './cronNotification.service.js';
import {
  deleteNotificationsOlderThan,
  emitDeletedNotificationEvents,
  type DeletedNotificationInfo,
} from './notification.service.js';

const NOTIFICATION_RETENTION_JOB_NAME = 'notification-retention';
const NOTIFICATION_RETENTION_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const NOTIFICATION_RETENTION_INTERVAL_MS = 30 * 60 * 1000;

let cronHandle: NodeJS.Timeout | null = null;

type NotificationRetentionRunnerDeps = {
  now: () => Date;
  deleteStaleNotifications: (input: { cutoff: Date }) => Promise<DeletedNotificationInfo[]>;
  emitDeletedNotifications: (notifications: DeletedNotificationInfo[]) => void;
  notifyCronJobRun: typeof notifyCronJobRun;
  logInfo: (context: Record<string, unknown>, message: string) => void;
  logError: (context: Record<string, unknown>, message: string) => void;
};

const defaultNotificationRetentionRunnerDeps: NotificationRetentionRunnerDeps = {
  now: () => new Date(),
  deleteStaleNotifications: ({ cutoff }) => deleteNotificationsOlderThan({ cutoff }),
  emitDeletedNotifications: emitDeletedNotificationEvents,
  notifyCronJobRun,
  logInfo: (context, message) => {
    logger.info(context, message);
  },
  logError: (context, message) => {
    logger.error(context, message);
  },
};

export function createNotificationRetentionRunner(
  overrides: Partial<NotificationRetentionRunnerDeps> = {},
) {
  const deps: NotificationRetentionRunnerDeps = {
    ...defaultNotificationRetentionRunnerDeps,
    ...overrides,
  };

  return async function runNotificationRetention(
    input: { source?: 'scheduled' | 'startup' } = {},
  ): Promise<void> {
    const source: 'scheduled' | 'startup' = input.source ?? 'scheduled';
    const startedAt = deps.now();
    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let errorMessage: string | null = null;

    try {
      const now = deps.now();
      const cutoff = new Date(now.getTime() - NOTIFICATION_RETENTION_WINDOW_MS);
      const deletedNotifications = await deps.deleteStaleNotifications({ cutoff });

      processed = deletedNotifications.length;
      succeeded = deletedNotifications.length;

      deps.emitDeletedNotifications(deletedNotifications);

      if (deletedNotifications.length > 0) {
        deps.logInfo(
          {
            cutoff: cutoff.toISOString(),
            deletedCount: deletedNotifications.length,
          },
          'Notification retention run completed',
        );
      }
    } catch (error) {
      failed = 1;
      errorMessage = buildCronFailureErrorMessage({
        failed,
        failures: [
          {
            entityType: 'cron_run',
            entityId: null,
            error,
          },
        ],
      });
      deps.logError({ err: error }, 'Notification retention cron run failed');
    }

    const finishedAt = deps.now();
    const status: 'success' | 'failed' = failed > 0 ? 'failed' : 'success';

    await deps.notifyCronJobRun({
      jobName: NOTIFICATION_RETENTION_JOB_NAME,
      jobFamily: 'notification_retention',
      schedule: '*/30 * * * *',
      source,
      startedAt,
      finishedAt,
      status,
      message:
        status === 'failed'
          ? 'Notification retention cron run failed'
          : 'Notification retention cron run completed',
      errorMessage,
      stats: {
        processed,
        succeeded,
        failed,
        skipped: 0,
      },
    });
  };
}

export const runNotificationRetention = createNotificationRetentionRunner();

export function initNotificationRetentionCron(): void {
  if (cronHandle) return;
  void runNotificationRetention({ source: 'startup' });
  cronHandle = setInterval(() => {
    void runNotificationRetention({ source: 'scheduled' });
  }, NOTIFICATION_RETENTION_INTERVAL_MS);
  logger.info('Notification retention cron initialized (every 30 minutes)');
}

export function stopNotificationRetentionCron(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
