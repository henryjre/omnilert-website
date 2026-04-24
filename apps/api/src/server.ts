import { createServer } from 'http';
import { createApp } from './app.js';
import { initializeSocket } from './config/socket.js';
import { env } from './config/env.js';
import { db } from './config/database.js';
import { initAttendanceQueue, stopAttendanceQueue } from './services/attendanceQueue.service.js';
import {
  initServiceCrewCctvCron,
  stopServiceCrewCctvCron,
} from './services/serviceCrewCctvCron.service.js';
import {
  initPeerEvaluationQueue,
  stopPeerEvaluationQueue,
} from './services/peerEvaluationQueue.service.js';
import {
  initPeerEvaluationCron,
  stopPeerEvaluationCron,
} from './services/peerEvaluationCron.service.js';
import {
  initPosAlertsMonitor,
  stopPosAlertsMonitor,
} from './services/posAnalyticsAlerts.service.js';
import {
  initShiftAuthorizationCron,
  stopShiftAuthorizationCron,
} from './services/shiftAuthorizationCron.service.js';
import { initEpiSnapshotCrons, stopEpiSnapshotCrons } from './services/epiSnapshotCron.service.js';
import {
  initNotificationRetentionCron,
  stopNotificationRetentionCron,
} from './services/notificationRetentionCron.service.js';
import { logger } from './utils/logger.js';
import fs from 'fs';

// Ensure uploads directory exists
if (!fs.existsSync(env.UPLOAD_DIR)) {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
}

const app = createApp();
const server = createServer(app);

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info({ signal }, 'Shutting down server');

  try {
    await stopAttendanceQueue();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop attendance queue');
  }

  try {
    await stopServiceCrewCctvCron();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop service crew cctv cron');
  }

  try {
    await stopPeerEvaluationQueue();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop peer evaluation queue');
  }

  try {
    stopPeerEvaluationCron();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop peer evaluation cron');
  }

  try {
    stopPosAlertsMonitor();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop POS alerts monitor');
  }

  try {
    stopShiftAuthorizationCron();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop shift authorization cron');
  }

  try {
    stopEpiSnapshotCrons();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop EPI snapshot crons');
  }

  try {
    stopNotificationRetentionCron();
  } catch (error) {
    logger.error({ err: error }, 'Failed to stop notification retention cron');
  }

  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });

  try {
    await db.destroyAll();
  } catch (error) {
    logger.error({ err: error }, 'Failed to close database pools');
  }
}

async function bootstrap(): Promise<void> {
  // Initialize Socket.IO
  initializeSocket(server);

  await initAttendanceQueue();
  await initServiceCrewCctvCron();
  await initPeerEvaluationQueue();
  initPeerEvaluationCron();
  initPosAlertsMonitor();
  initShiftAuthorizationCron();
  await initEpiSnapshotCrons();
  initNotificationRetentionCron();

  server.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
    logger.info(`Client URL: ${env.CLIENT_URL}`);
  });
}

void bootstrap().catch((error) => {
  logger.error({ err: error }, 'Failed to bootstrap server');
  process.exit(1);
});

process.on('SIGINT', () => {
  void shutdown('SIGINT').finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM').finally(() => process.exit(0));
});
