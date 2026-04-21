import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const topBarSource = readFileSync(
  new URL('../src/features/dashboard/components/TopBar.tsx', import.meta.url),
  'utf8',
);

const notificationsTabSource = readFileSync(
  new URL('../src/features/account/components/EmployeeNotificationsTab.tsx', import.meta.url),
  'utf8',
);

test('TopBar listens for notification deletion events and updates local bell state', () => {
  assert.match(
    topBarSource,
    /notificationsSocket\.on\('notification:deleted', handleNotificationDeleted\)/,
    'TopBar should subscribe to notification:deleted events',
  );
  assert.match(
    topBarSource,
    /setNotifications\(\(prev\) => prev\.filter\(\(notification\) => notification\.id !== data\.id\)\)/,
    'TopBar should remove deleted notifications from the bell dropdown list',
  );
  assert.match(
    topBarSource,
    /if \(data\?\.wasUnread\) \{\s*decrement\(\);\s*\}/,
    'TopBar should decrement unread count only when the deleted notification was unread',
  );
});

test('EmployeeNotificationsTab listens for notification deletion events and removes stale cards live', () => {
  assert.match(
    notificationsTabSource,
    /const notificationsSocket = useSocket\('\/notifications'\);/,
    'EmployeeNotificationsTab should connect to the notifications socket',
  );
  assert.match(
    notificationsTabSource,
    /notificationsSocket\.on\('notification:deleted', handleNotificationDeleted\)/,
    'EmployeeNotificationsTab should subscribe to notification:deleted events',
  );
  assert.match(
    notificationsTabSource,
    /setNotifications\(\(prev\) => prev\.filter\(\(notification\) => notification\.id !== data\.id\)\)/,
    'EmployeeNotificationsTab should remove deleted notifications from the rendered feed',
  );
});
