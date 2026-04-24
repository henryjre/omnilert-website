import webpush from 'web-push';
import { env } from '../config/env.js';
import { getIO, hasActiveNotificationSocket } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { db } from '../config/database.js';

type NotificationType = 'info' | 'success' | 'danger' | 'warning';

type NotificationRecord = {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: NotificationType;
  is_read: boolean;
  link_url: string | null;
  created_at: string | Date;
};

type NotificationDeletionLookupRow = Pick<NotificationRecord, 'id' | 'user_id' | 'is_read'>;
type NotificationLookupRow = NotificationDeletionLookupRow & Pick<NotificationRecord, 'link_url'>;

type PushSubscriptionRecord = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  is_active: boolean;
  failure_count: number;
  last_success_at: Date | null;
  last_failure_at: Date | null;
  last_failure_reason: string | null;
  created_at: Date;
  updated_at: Date;
};

export type CreateAndDispatchNotificationInput = {
  userId: string;
  companyId?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  linkUrl?: string | null;
};

export type RegisterPushSubscriptionInput = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

export type DeletedNotificationInfo = {
  userId: string;
  id: string;
  wasUnread: boolean;
};

const AUTH_ID_PARAM_PATTERN = /(?:[?&])authId=([0-9a-f-]{36})(?:&|$)/i;

const isWebPushConfigured =
  env.WEB_PUSH_ENABLED
  && Boolean(env.WEB_PUSH_VAPID_PUBLIC_KEY)
  && Boolean(env.WEB_PUSH_VAPID_PRIVATE_KEY)
  && Boolean(env.WEB_PUSH_VAPID_SUBJECT);

if (isWebPushConfigured) {
  webpush.setVapidDetails(
    env.WEB_PUSH_VAPID_SUBJECT as string,
    env.WEB_PUSH_VAPID_PUBLIC_KEY as string,
    env.WEB_PUSH_VAPID_PRIVATE_KEY as string,
  );
}

export function getWebPushConfig() {
  return {
    enabled: isWebPushConfigured,
    vapidPublicKey: env.WEB_PUSH_VAPID_PUBLIC_KEY ?? '',
  };
}

export async function createAndDispatchNotification(
  input: CreateAndDispatchNotificationInput,
): Promise<NotificationRecord> {
  const [notif] = await db.getDb()('employee_notifications')
    .insert({
      user_id: input.userId,
      company_id: input.companyId ?? null,
      title: input.title,
      message: input.message,
      type: input.type,
      link_url: input.linkUrl ?? null,
    })
    .returning('*');

  const notification = notif as NotificationRecord;

  try {
    getIO().of('/notifications').to(`user:${input.userId}`).emit('notification:new', {
      ...notification,
      createdAt: new Date(notification.created_at).toISOString(),
    } as any);
  } catch {
    // Ignore socket failures and continue with push/offline handling.
  }

  await maybeDispatchWebPush(input.userId, notification);
  return notification;
}

export function emitDeletedNotificationEvents(notifications: DeletedNotificationInfo[]): void {
  if (notifications.length === 0) return;

  try {
    const namespace = getIO().of('/notifications');
    for (const notification of notifications) {
      namespace.to(`user:${notification.userId}`).emit('notification:deleted', {
        id: notification.id,
        wasUnread: notification.wasUnread,
      });
    }
  } catch {
    // Ignore socket failures and continue with deletion flow.
  }
}

export async function updateNotificationReadStateForUser(input: {
  userId: string;
  notificationId: string;
  isRead: boolean;
}): Promise<{ id: string; userId: string; isRead: boolean } | null> {
  const rows = (await db.getDb()('employee_notifications')
    .where({ id: input.notificationId, user_id: input.userId })
    .select('id', 'user_id')) as Array<{ id: string; user_id: string }>;

  if (rows.length === 0) return null;

  await db.getDb()('employee_notifications')
    .where({ id: input.notificationId, user_id: input.userId })
    .update({ is_read: input.isRead });

  return { id: input.notificationId, userId: input.userId, isRead: input.isRead };
}

export async function deleteNotificationByIdForUser(input: {
  userId: string;
  notificationId: string;
}): Promise<DeletedNotificationInfo | null> {
  const userId = input.userId.trim();
  const notificationId = input.notificationId.trim();
  if (!userId || !notificationId) return null;

  const rows = (await db.getDb()('employee_notifications')
    .where({ id: notificationId, user_id: userId })
    .select('id', 'user_id', 'is_read')) as NotificationDeletionLookupRow[];

  const deletedNotifications = await deleteNotificationRows(rows);
  return deletedNotifications[0] ?? null;
}

export async function deleteReadNotificationsByUserId(userId: string): Promise<DeletedNotificationInfo[]> {
  const trimmedUserId = userId.trim();
  if (!trimmedUserId) return [];

  const rows = (await db.getDb()('employee_notifications')
    .where({ user_id: trimmedUserId, is_read: true })
    .select('id', 'user_id', 'is_read')) as NotificationDeletionLookupRow[];

  return deleteNotificationRows(rows);
}

export async function deleteNotificationsOlderThan(input: {
  cutoff: Date;
}): Promise<DeletedNotificationInfo[]> {
  if (!(input.cutoff instanceof Date) || Number.isNaN(input.cutoff.getTime())) {
    return [];
  }

  const rows = (await db.getDb()('employee_notifications')
    .where('created_at', '<', input.cutoff)
    .select('id', 'user_id', 'is_read')) as NotificationDeletionLookupRow[];

  return deleteNotificationRows(rows);
}

export async function deleteNotificationsByUserIdAndAuthId(input: {
  userId: string;
  authId: string;
}): Promise<DeletedNotificationInfo[]> {
  const userId = input.userId.trim();
  const authId = input.authId.trim();
  if (!userId || !authId) return [];

  const tenantDb = db.getDb();
  const rows = (await tenantDb('employee_notifications')
    .where({ user_id: userId })
    .select('id', 'user_id', 'is_read', 'link_url')) as NotificationLookupRow[];

  return deleteNotificationRows(
    rows.filter((row) => extractAuthIdFromLinkUrl(row.link_url) === authId),
  );
}

export async function registerPushSubscription(
  input: RegisterPushSubscriptionInput,
): Promise<void> {
  const existing = await db.getDb()('push_subscriptions')
    .where({ endpoint: input.endpoint })
    .first();

  const payload = {
    user_id: input.userId,
    p256dh: input.p256dh,
    auth: input.auth,
    user_agent: input.userAgent ?? null,
    is_active: true,
    failure_count: 0,
    last_success_at: null,
    last_failure_at: null,
    last_failure_reason: null,
    updated_at: new Date(),
  };

  if (existing) {
    await db.getDb()('push_subscriptions')
      .where({ endpoint: input.endpoint })
      .update(payload);
    return;
  }

  await db.getDb()('push_subscriptions').insert({
    endpoint: input.endpoint,
    ...payload,
  });
}

export async function unregisterPushSubscription(
  userId: string,
  endpoint: string,
): Promise<void> {
  await db.getDb()('push_subscriptions')
    .where({ user_id: userId, endpoint })
    .delete();
}

async function maybeDispatchWebPush(
  userId: string,
  notification: NotificationRecord,
): Promise<void> {
  if (!isWebPushConfigured) return;
  if (hasActiveNotificationSocket(userId)) return;

  const user = await db.getDb()('users')
    .where({ id: userId })
    .select('push_notifications_enabled')
    .first();
  if (!user || user.push_notifications_enabled === false) return;

  const subscriptions = await db.getDb()('push_subscriptions')
    .where({ user_id: userId, is_active: true })
    .select('*');
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    notificationId: notification.id,
    title: notification.title,
    message: notification.message,
    type: notification.type,
    linkUrl: notification.link_url,
    createdAt: notification.created_at,
  });

  await Promise.all(
    subscriptions.map(async (subscription: PushSubscriptionRecord) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
        );

        await db.getDb()('push_subscriptions')
          .where({ id: subscription.id })
          .update({
            failure_count: 0,
            last_success_at: new Date(),
            last_failure_at: null,
            last_failure_reason: null,
            updated_at: new Date(),
          });
      } catch (error: any) {
        const statusCode = Number(error?.statusCode ?? 0);
        const failureReason = error?.body || error?.message || 'Push send failed';
        const isGone = statusCode === 404 || statusCode === 410;

        await db.getDb()('push_subscriptions')
          .where({ id: subscription.id })
          .update({
            is_active: isGone ? false : subscription.is_active,
            failure_count: (subscription.failure_count ?? 0) + 1,
            last_failure_at: new Date(),
            last_failure_reason: String(failureReason).slice(0, 1000),
            updated_at: new Date(),
          });

        logger.warn(
          {
            userId,
            endpoint: subscription.endpoint,
            statusCode,
            isGone,
          },
          'Web push delivery failed',
        );
      }
    }),
  );
}

function extractAuthIdFromLinkUrl(linkUrl: string | null | undefined): string | null {
  if (typeof linkUrl !== 'string') return null;
  const match = linkUrl.match(AUTH_ID_PARAM_PATTERN);
  return match?.[1] ?? null;
}

async function deleteNotificationRows(
  rows: NotificationDeletionLookupRow[],
): Promise<DeletedNotificationInfo[]> {
  if (rows.length === 0) return [];

  const tenantDb = db.getDb();
  const deletedNotifications: DeletedNotificationInfo[] = [];

  for (const row of rows) {
    const userId = String(row.user_id ?? '').trim();
    const id = String(row.id ?? '').trim();
    if (!userId || !id) continue;

    const deletedCount = await tenantDb('employee_notifications')
      .where({ id, user_id: userId })
      .delete();

    if (deletedCount > 0) {
      deletedNotifications.push({
        userId,
        id,
        wasUnread: row.is_read !== true,
      });
    }
  }

  return deletedNotifications;
}
