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

test('TopBar routes both case report and violation notice discussion links directly from the bell', () => {
  assert.match(
    topBarSource,
    /if \(n\.link_url\?\.startsWith\('\/case-reports'\) \|\| n\.link_url\?\.startsWith\('\/violation-notices'\)\) \{\s*navigate\(n\.link_url\);/s,
    'TopBar should navigate directly for both case report and violation notice discussion links',
  );
});

test('EmployeeNotificationsTab opens case report and violation notice discussion links and exposes a View Reply action', () => {
  assert.match(
    notificationsTabSource,
    /if \(linkUrl\.startsWith\('\/case-reports'\) \|\| linkUrl\.startsWith\('\/violation-notices'\)\) \{\s*navigate\(linkUrl\);/s,
    'EmployeeNotificationsTab should navigate directly for both discussion link families',
  );
  assert.match(
    notificationsTabSource,
    /const messageId = getMessageId\(n\.link_url\);/,
    'EmployeeNotificationsTab should derive a messageId from discussion notification links',
  );
  assert.match(
    notificationsTabSource,
    /messageId && isDiscussionLink && \(/,
    'EmployeeNotificationsTab should show a discussion CTA only for discussion links that target a specific message',
  );
  assert.match(
    notificationsTabSource,
    />\s*View Reply\s*</,
    'EmployeeNotificationsTab should render a View Reply button for discussion reply notifications',
  );
});
