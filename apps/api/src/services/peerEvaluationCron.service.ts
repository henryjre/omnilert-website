import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';

let cronHandle: NodeJS.Timeout | null = null;

export async function runPeerEvaluationExpiryRun(): Promise<void> {
  const companies = await db.getDb()('companies')
    .where({ is_active: true })
    .select('id');

  for (const company of companies) {
    try {
      const count = await db.getDb()('peer_evaluations')
        .where('company_id', company.id)
        .where('status', 'pending')
        .where('expires_at', '<', new Date())
        .update({ status: 'expired', updated_at: new Date() });

      if (count > 0) {
        try {
          getIO()
            .of('/peer-evaluations')
            .to(`company:${company.id}`)
            .emit('peer-evaluation:expired', { count });
        } catch {
          logger.warn(
            { companyId: company.id },
            'Socket.IO not available for peer evaluation expiry emit',
          );
        }

        logger.info(
          { companyId: company.id, expiredCount: count },
          'Peer evaluations expired',
        );
      }
    } catch (error) {
      logger.error(
        { err: error, companyId: company.id },
        'Peer evaluation expiry cron failed for company',
      );
    }
  }

  logger.info('Peer evaluation expiry cron run completed');
}

export function initPeerEvaluationCron(): void {
  if (cronHandle) return;
  // Run once immediately on startup to catch any expired records from before last restart
  void runPeerEvaluationExpiryRun();
  cronHandle = setInterval(() => {
    void runPeerEvaluationExpiryRun();
  }, 30 * 60 * 1000); // 30 minutes
  logger.info('Peer evaluation expiry cron initialized (every 30 minutes)');
}

export function stopPeerEvaluationCron(): void {
  if (!cronHandle) return;
  clearInterval(cronHandle);
  cronHandle = null;
}
