import { createServer } from 'http';
import { createApp } from './app.js';
import { initializeSocket } from './config/socket.js';
import { env } from './config/env.js';
import { db } from './config/database.js';
import { initAttendanceQueue, stopAttendanceQueue } from './services/attendanceQueue.service.js';
import { verifyMailConnection } from './services/mail.service.js';
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
  await verifyMailConnection();

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
