import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';

export const GLOBAL_STORE_AUDITS_ROOM = 'store-audits:global';

export type StoreAuditRealtimeEvent =
  | 'store-audit:new'
  | 'store-audit:claimed'
  | 'store-audit:completed'
  | 'store-audit:updated';

export function emitStoreAuditEvent(
  companyId: string,
  event: StoreAuditRealtimeEvent,
  payload: unknown,
): void {
  try {
    const namespace = getIO().of('/store-audits');
    namespace.to(`company:${companyId}`).emit(event, payload as never);
    namespace.to(GLOBAL_STORE_AUDITS_ROOM).emit(event, payload as never);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for store audit event');
  }
}
