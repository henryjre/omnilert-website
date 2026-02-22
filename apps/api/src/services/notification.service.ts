import type { Knex } from 'knex';
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
  tenantDb: Knex;
  userId: string;
  title: string;
  message: string;
  type: NotificationType;
  linkUrl?: string | null;
};

export type RegisterPushSubscriptionInput = {
  tenantDb: Knex;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string | null;
};

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
  const [notif] = await input.tenantDb('employee_notifications')
    .insert({
      user_id: input.userId,
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

  await maybeDispatchWebPush(input.tenantDb, input.userId, notification);
  return notification;
}

export async function registerPushSubscription(
  input: RegisterPushSubscriptionInput,
): Promise<void> {
  const existing = await input.tenantDb('push_subscriptions')
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
    await input.tenantDb('push_subscriptions')
      .where({ endpoint: input.endpoint })
      .update(payload);
    return;
  }

  await input.tenantDb('push_subscriptions').insert({
    endpoint: input.endpoint,
    ...payload,
  });
}

export async function unregisterPushSubscription(
  tenantDb: Knex,
  userId: string,
  endpoint: string,
): Promise<void> {
  await tenantDb('push_subscriptions')
    .where({ user_id: userId, endpoint })
    .delete();
}

async function maybeDispatchWebPush(
  tenantDb: Knex,
  userId: string,
  notification: NotificationRecord,
): Promise<void> {
  if (!isWebPushConfigured) return;
  if (hasActiveNotificationSocket(userId)) return;

  const user = await db.getMasterDb()('users')
    .where({ id: userId })
    .select('push_notifications_enabled')
    .first();
  if (!user || user.push_notifications_enabled === false) return;

  const subscriptions = await tenantDb('push_subscriptions')
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

        await tenantDb('push_subscriptions')
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

        await tenantDb('push_subscriptions')
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
