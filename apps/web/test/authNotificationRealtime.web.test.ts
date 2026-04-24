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

test('EmployeeNotificationsTab exposes single-delete and delete-all-read controls', () => {
  assert.match(
    notificationsTabSource,
    /await api\.delete\(`\/account\/notifications\/\$\{notificationId\}`\);/,
    'EmployeeNotificationsTab should call the single notification delete endpoint',
  );
  assert.match(
    notificationsTabSource,
    /await api\.delete\('\/account\/notifications\/read-all'\);/,
    'EmployeeNotificationsTab should call the delete-all-read endpoint',
  );
  assert.match(
    notificationsTabSource,
    />\s*Delete all read\s*</,
    'EmployeeNotificationsTab should render a Delete all read action',
  );
  assert.match(
    notificationsTabSource,
    /\?\s*'Deleting\.\.\.'\s*:\s*'Delete'/,
    'EmployeeNotificationsTab should render a per-notification delete control with loading feedback',
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

test('EmployeeNotificationsTab calls the unread endpoint and exposes a mark-unread path', () => {
  assert.match(
    notificationsTabSource,
    /\/account\/notifications\/\$\{notificationId\}\/unread/,
    'EmployeeNotificationsTab should reference the mark-unread endpoint',
  );
});

test('EmployeeNotificationsTab contains MobileSwipeNotificationCard wrapper', () => {
  assert.match(
    notificationsTabSource,
    /MobileSwipeNotificationCard/,
    'EmployeeNotificationsTab should use a MobileSwipeNotificationCard component',
  );
});

test('EmployeeNotificationsTab uses Trash2, CheckCheck, and Mail icons for swipe lanes', () => {
  assert.match(
    notificationsTabSource,
    /Trash2/,
    'EmployeeNotificationsTab should import and use the Trash2 icon',
  );
  assert.match(
    notificationsTabSource,
    /CheckCheck/,
    'EmployeeNotificationsTab should import and use the CheckCheck icon',
  );
  assert.match(
    notificationsTabSource,
    /Mail/,
    'EmployeeNotificationsTab should import and use the Mail icon',
  );
});

test('EmployeeNotificationsTab hides Mark read and Delete text actions on mobile', () => {
  assert.match(
    notificationsTabSource,
    /hidden.*sm:inline.*Mark read|Mark read.*hidden.*sm:inline/s,
    'Mark read button should be hidden on mobile and visible on sm+',
  );
  assert.match(
    notificationsTabSource,
    /hidden.*sm:inline.*Deleting\.\.\.|Deleting\.\.\..*hidden.*sm:inline/s,
    'Delete button should be hidden on mobile and visible on sm+',
  );
});

test('EmployeeNotificationsTab guards CTA buttons with data-no-swipe', () => {
  assert.match(
    notificationsTabSource,
    /data-no-swipe/,
    'EmployeeNotificationsTab should mark CTA buttons with data-no-swipe',
  );
});

test('TopBar subscribes to latestNotificationPatch and patches local bell dropdown state', () => {
  const topBarSrc = readFileSync(
    new URL('../src/features/dashboard/components/TopBar.tsx', import.meta.url),
    'utf8',
  );
  assert.match(
    topBarSrc,
    /latestNotificationPatch/,
    'TopBar should subscribe to latestNotificationPatch from the notification store',
  );
  assert.match(
    topBarSrc,
    /prev\.map\(\(n\) => \(n\.id === id \? \{ \.\.\.n, \.\.\.changes \} : n\)\)/,
    'TopBar should patch local notification items when a patch broadcast arrives',
  );
});

test('EmployeeNotificationsTab subscribes to latestNotificationPatch for same-session sync', () => {
  assert.match(
    notificationsTabSource,
    /latestNotificationPatch/,
    'EmployeeNotificationsTab should subscribe to latestNotificationPatch from the notification store',
  );
});
