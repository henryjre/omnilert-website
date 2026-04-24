import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const {
  deleteNotificationByIdForUser,
  deleteNotificationsByUserIdAndAuthId,
  deleteNotificationsOlderThan,
  deleteReadNotificationsByUserId,
  updateNotificationReadStateForUser,
} = await import('./notification.service.js');
const { db } = await import('../config/database.js');

type NotificationRow = {
  id: string;
  user_id: string;
  is_read: boolean;
  link_url: string | null;
  created_at: string;
};

function toEpoch(value: unknown): number {
  return new Date(String(value)).getTime();
}

function createNotificationDbHarness(initialNotifications: NotificationRow[]) {
  const notifications = initialNotifications.map((row) => ({ ...row }));
  const tenantDb = ((tableName: string) => {
    if (tableName !== 'employee_notifications') {
      throw new Error(`Unsupported table in notification test harness: ${tableName}`);
    }

    const predicates: Array<(row: NotificationRow) => boolean> = [];

    const getMatchedRows = () =>
      notifications.filter((row) => predicates.every((predicate) => predicate(row)));

    const query: Record<string, any> = {
      where(
        fieldOrCondition: string | Record<string, unknown>,
        operatorOrValue?: unknown,
        value?: unknown,
      ) {
        if (typeof fieldOrCondition === 'string') {
          const field = fieldOrCondition as keyof NotificationRow;
          if (arguments.length === 2) {
            predicates.push((row) => row[field] === operatorOrValue);
            return query;
          }

          if (operatorOrValue === '<') {
            predicates.push((row) => toEpoch(row[field]) < toEpoch(value));
            return query;
          }

          throw new Error(`Unsupported where operator in notification test harness: ${String(operatorOrValue)}`);
        }

        predicates.push((row) =>
          Object.entries(fieldOrCondition).every(([key, expected]) => row[key as keyof NotificationRow] === expected),
        );
        return query;
      },
      select(...fields: string[]) {
        return Promise.resolve(
          getMatchedRows().map((row) => {
            const selected: Record<string, unknown> = {};
            for (const field of fields.flat()) {
              selected[field] = row[field as keyof NotificationRow];
            }
            return selected;
          }),
        );
      },
      delete() {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          const index = notifications.indexOf(row);
          if (index >= 0) {
            notifications.splice(index, 1);
          }
        }
        return Promise.resolve(matchedRows.length);
      },
      update(changes: Partial<NotificationRow>) {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          Object.assign(row, changes);
        }
        return Promise.resolve(matchedRows.length);
      },
    };

    return query;
  }) as any;

  return {
    notifications,
    tenantDb,
  };
}

function installNotificationDbHarness(
  harness: ReturnType<typeof createNotificationDbHarness>,
  registerCleanup: (cleanup: () => void) => void,
) {
  const originalGetDb = db.getDb.bind(db);
  (db as any).getDb = () => harness.tenantDb;
  registerCleanup(() => {
    (db as any).getDb = originalGetDb;
  });
}

test('deleteNotificationByIdForUser deletes one owned notification and preserves unread metadata', async (t) => {
  const harness = createNotificationDbHarness([
    {
      id: 'notif-owned',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-other',
      user_id: 'user-2',
      is_read: true,
      link_url: '/account/profile',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotification = await deleteNotificationByIdForUser({
    userId: 'user-1',
    notificationId: 'notif-owned',
  });

  assert.deepEqual(deletedNotification, {
    userId: 'user-1',
    id: 'notif-owned',
    wasUnread: true,
  });
  assert.deepEqual(
    harness.notifications.map((notification) => notification.id),
    ['notif-other'],
  );
});

test('deleteNotificationByIdForUser returns null for missing or non-owned notifications', async (t) => {
  const harness = createNotificationDbHarness([
    {
      id: 'notif-other-user',
      user_id: 'user-2',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotification = await deleteNotificationByIdForUser({
    userId: 'user-1',
    notificationId: 'notif-other-user',
  });

  assert.equal(deletedNotification, null);
  assert.deepEqual(
    harness.notifications.map((notification) => notification.id),
    ['notif-other-user'],
  );
});

test('deleteReadNotificationsByUserId deletes only read notifications for the matching user', async (t) => {
  const harness = createNotificationDbHarness([
    {
      id: 'notif-read-1',
      user_id: 'user-1',
      is_read: true,
      link_url: '/account/profile',
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-unread',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/settings',
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-read-2',
      user_id: 'user-1',
      is_read: true,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-other-user',
      user_id: 'user-2',
      is_read: true,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotifications = await deleteReadNotificationsByUserId('user-1');

  assert.deepEqual(deletedNotifications, [
    { userId: 'user-1', id: 'notif-read-1', wasUnread: false },
    { userId: 'user-1', id: 'notif-read-2', wasUnread: false },
  ]);
  assert.deepEqual(
    harness.notifications.map((notification) => notification.id),
    ['notif-unread', 'notif-other-user'],
  );
});

test('deleteNotificationsOlderThan purges only notifications older than the cutoff', async (t) => {
  const cutoff = new Date('2026-03-25T00:00:00.000Z');
  const harness = createNotificationDbHarness([
    {
      id: 'notif-old-unread',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-03-24T23:59:59.000Z',
    },
    {
      id: 'notif-old-read',
      user_id: 'user-2',
      is_read: true,
      link_url: '/account/profile',
      created_at: '2026-03-20T00:00:00.000Z',
    },
    {
      id: 'notif-at-cutoff',
      user_id: 'user-3',
      is_read: true,
      link_url: '/account/settings',
      created_at: '2026-03-25T00:00:00.000Z',
    },
    {
      id: 'notif-fresh',
      user_id: 'user-4',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-01T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotifications = await deleteNotificationsOlderThan({ cutoff });

  assert.deepEqual(deletedNotifications, [
    { userId: 'user-1', id: 'notif-old-unread', wasUnread: true },
    { userId: 'user-2', id: 'notif-old-read', wasUnread: false },
  ]);
  assert.deepEqual(
    harness.notifications.map((notification) => notification.id),
    ['notif-at-cutoff', 'notif-fresh'],
  );
});

test('deleteNotificationsByUserIdAndAuthId deletes only auth-linked notifications for the matching user', async (t) => {
  const authId = '11111111-1111-4111-8111-111111111111';
  const otherAuthId = '22222222-2222-4222-8222-222222222222';
  const harness = createNotificationDbHarness([
    {
      id: 'notif-unread-match',
      user_id: 'user-1',
      is_read: false,
      link_url: `/account/schedule?shiftId=shift-1&authId=${authId}`,
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-read-match',
      user_id: 'user-1',
      is_read: true,
      link_url: `/account/schedule?authId=${authId}&shiftId=shift-1`,
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-other-auth',
      user_id: 'user-1',
      is_read: false,
      link_url: `/account/schedule?shiftId=shift-1&authId=${otherAuthId}`,
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-other-user',
      user_id: 'user-2',
      is_read: false,
      link_url: `/account/schedule?shiftId=shift-1&authId=${authId}`,
      created_at: '2026-04-24T00:00:00.000Z',
    },
    {
      id: 'notif-no-auth',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotifications = await deleteNotificationsByUserIdAndAuthId({
    userId: 'user-1',
    authId,
  });

  assert.deepEqual(deletedNotifications, [
    { userId: 'user-1', id: 'notif-unread-match', wasUnread: true },
    { userId: 'user-1', id: 'notif-read-match', wasUnread: false },
  ]);
  assert.deepEqual(
    harness.notifications.map((notification) => notification.id),
    ['notif-other-auth', 'notif-other-user', 'notif-no-auth'],
  );
});

test('deleteNotificationsByUserIdAndAuthId is a no-op when no auth-linked notifications match', async (t) => {
  const authId = '33333333-3333-4333-8333-333333333333';
  const harness = createNotificationDbHarness([
    {
      id: 'notif-1',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotifications = await deleteNotificationsByUserIdAndAuthId({
    userId: 'user-1',
    authId,
  });

  assert.deepEqual(deletedNotifications, []);
  assert.deepEqual(
    harness.notifications.map((notification) => notification.id),
    ['notif-1'],
  );
});

test('updateNotificationReadStateForUser marks an owned notification as read', async (t) => {
  const harness = createNotificationDbHarness([
    {
      id: 'notif-1',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const result = await updateNotificationReadStateForUser({
    userId: 'user-1',
    notificationId: 'notif-1',
    isRead: true,
  });

  assert.deepEqual(result, { id: 'notif-1', userId: 'user-1', isRead: true });
  assert.equal(harness.notifications[0].is_read, true);
});

test('updateNotificationReadStateForUser marks an owned notification as unread', async (t) => {
  const harness = createNotificationDbHarness([
    {
      id: 'notif-2',
      user_id: 'user-1',
      is_read: true,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const result = await updateNotificationReadStateForUser({
    userId: 'user-1',
    notificationId: 'notif-2',
    isRead: false,
  });

  assert.deepEqual(result, { id: 'notif-2', userId: 'user-1', isRead: false });
  assert.equal(harness.notifications[0].is_read, false);
});

test('updateNotificationReadStateForUser returns null for missing or non-owned notification', async (t) => {
  const harness = createNotificationDbHarness([
    {
      id: 'notif-other',
      user_id: 'user-2',
      is_read: false,
      link_url: '/account/notifications',
      created_at: '2026-04-24T00:00:00.000Z',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const result = await updateNotificationReadStateForUser({
    userId: 'user-1',
    notificationId: 'notif-other',
    isRead: true,
  });

  assert.equal(result, null);
  assert.equal(harness.notifications[0].is_read, false);
});
