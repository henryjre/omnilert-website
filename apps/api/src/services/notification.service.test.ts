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

const { deleteNotificationsByUserIdAndAuthId } = await import('./notification.service.js');
const { db } = await import('../config/database.js');

type NotificationRow = {
  id: string;
  user_id: string;
  is_read: boolean;
  link_url: string | null;
};

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
      where(condition: Record<string, unknown>) {
        predicates.push((row) =>
          Object.entries(condition).every(([key, value]) => row[key as keyof NotificationRow] === value),
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

test('deleteNotificationsByUserIdAndAuthId deletes only auth-linked notifications for the matching user', async (t) => {
  const authId = '11111111-1111-4111-8111-111111111111';
  const otherAuthId = '22222222-2222-4222-8222-222222222222';
  const harness = createNotificationDbHarness([
    {
      id: 'notif-unread-match',
      user_id: 'user-1',
      is_read: false,
      link_url: `/account/schedule?shiftId=shift-1&authId=${authId}`,
    },
    {
      id: 'notif-read-match',
      user_id: 'user-1',
      is_read: true,
      link_url: `/account/schedule?authId=${authId}&shiftId=shift-1`,
    },
    {
      id: 'notif-other-auth',
      user_id: 'user-1',
      is_read: false,
      link_url: `/account/schedule?shiftId=shift-1&authId=${otherAuthId}`,
    },
    {
      id: 'notif-other-user',
      user_id: 'user-2',
      is_read: false,
      link_url: `/account/schedule?shiftId=shift-1&authId=${authId}`,
    },
    {
      id: 'notif-no-auth',
      user_id: 'user-1',
      is_read: false,
      link_url: '/account/notifications',
    },
  ]);
  installNotificationDbHarness(harness, (cleanup) => t.after(cleanup));

  const deletedNotifications = await deleteNotificationsByUserIdAndAuthId({
    userId: 'user-1',
    authId,
  });

  assert.deepEqual(deletedNotifications, [
    { id: 'notif-unread-match', wasUnread: true },
    { id: 'notif-read-match', wasUnread: false },
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
