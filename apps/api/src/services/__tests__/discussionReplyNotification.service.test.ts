import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';

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

const caseReportServiceSource = readFileSync(
  new URL('../caseReport.service.ts', import.meta.url),
  'utf8',
);
const violationNoticeServiceSource = readFileSync(
  new URL('../violationNotice.service.ts', import.meta.url),
  'utf8',
);

const {
  notifyReplyRecipientForCaseMessage,
  resolveCaseReplyParentMessage,
} = await import('../caseReport.service.js');
const {
  notifyReplyRecipientForVNMessage,
  resolveVNReplyParentMessage,
} = await import('../violationNotice.service.js');
const { AppError } = await import('../../middleware/errorHandler.js');

test('case replies notify the parent author with the expected notification payload', async () => {
  const upsertCalls: Array<{ caseId: string; userId: string; patch: { is_joined: boolean } }> = [];
  const notificationCalls: any[] = [];

  const notifiedUserIds = await notifyReplyRecipientForCaseMessage(
    {
      caseId: 'case-1',
      messageId: 'reply-1',
      senderId: 'sender-1',
      parentMessage: {
        id: 'parent-1',
        case_id: 'case-1',
        user_id: 'author-1',
        is_system: false,
      },
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => ({ is_joined: false, is_muted: false }),
      upsertParticipant: async (caseId, userId, patch) => {
        upsertCalls.push({ caseId, userId, patch: { is_joined: Boolean(patch.is_joined) } });
      },
      resolveUserNames: async () => ({ 'sender-1': 'Taylor Reply' }),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );

  assert.deepEqual(notifiedUserIds, ['author-1']);
  assert.deepEqual(upsertCalls, [
    {
      caseId: 'case-1',
      userId: 'author-1',
      patch: { is_joined: true },
    },
  ]);
  assert.deepEqual(notificationCalls, [
    {
      userId: 'author-1',
      title: 'Case Report Reply',
      message: 'Taylor Reply replied to your message in a case report.',
      type: 'info',
      linkUrl: '/case-reports?caseId=case-1&messageId=reply-1',
    },
  ]);
});

test('case replies skip notifications for top-level, self-reply, and muted recipients', async () => {
  const notificationCalls: any[] = [];

  const topLevelNotifiedUserIds = await notifyReplyRecipientForCaseMessage(
    {
      caseId: 'case-1',
      messageId: 'reply-1',
      senderId: 'sender-1',
      parentMessage: null,
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => null,
      upsertParticipant: async () => undefined,
      resolveUserNames: async () => ({}),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );
  const selfReplyNotifiedUserIds = await notifyReplyRecipientForCaseMessage(
    {
      caseId: 'case-1',
      messageId: 'reply-2',
      senderId: 'sender-1',
      parentMessage: {
        id: 'parent-2',
        case_id: 'case-1',
        user_id: 'sender-1',
        is_system: false,
      },
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => ({ is_joined: true, is_muted: false }),
      upsertParticipant: async () => undefined,
      resolveUserNames: async () => ({ 'sender-1': 'Taylor Reply' }),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );
  const mutedNotifiedUserIds = await notifyReplyRecipientForCaseMessage(
    {
      caseId: 'case-1',
      messageId: 'reply-3',
      senderId: 'sender-1',
      parentMessage: {
        id: 'parent-3',
        case_id: 'case-1',
        user_id: 'author-1',
        is_system: false,
      },
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => ({ is_joined: false, is_muted: true }),
      upsertParticipant: async () => undefined,
      resolveUserNames: async () => ({ 'sender-1': 'Taylor Reply' }),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );

  assert.deepEqual(topLevelNotifiedUserIds, []);
  assert.deepEqual(selfReplyNotifiedUserIds, []);
  assert.deepEqual(mutedNotifiedUserIds, []);
  assert.deepEqual(notificationCalls, []);
});

test('case reply validation rejects missing or system parents', async () => {
  await assert.rejects(
    () =>
      resolveCaseReplyParentMessage(
        {
          caseId: 'case-1',
          parentMessageId: 'missing-parent',
        },
        {
          getParentMessage: async () => null,
        },
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 404 &&
      error.message === 'Parent message not found',
  );

  await assert.rejects(
    () =>
      resolveCaseReplyParentMessage(
        {
          caseId: 'case-1',
          parentMessageId: 'system-parent',
        },
        {
          getParentMessage: async () => ({
            id: 'system-parent',
            case_id: 'case-1',
            user_id: 'system-user',
            is_system: true,
          }),
        },
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      error.message === 'Cannot reply to system messages',
  );
});

test('violation notice replies notify the parent author and rejoin left participants', async () => {
  const upsertCalls: Array<{ vnId: string; userId: string; patch: { is_joined: boolean } }> = [];
  const notificationCalls: any[] = [];

  const notifiedUserIds = await notifyReplyRecipientForVNMessage(
    {
      vnId: 'vn-1',
      messageId: 'reply-1',
      senderId: 'sender-1',
      parentMessage: {
        id: 'parent-1',
        violation_notice_id: 'vn-1',
        user_id: 'author-1',
        type: 'message',
      },
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => ({ is_joined: false, is_muted: false }),
      upsertParticipant: async (vnId, userId, patch) => {
        upsertCalls.push({ vnId, userId, patch: { is_joined: Boolean(patch.is_joined) } });
      },
      resolveUserNames: async () => ({ 'sender-1': 'Jordan Reply' }),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );

  assert.deepEqual(notifiedUserIds, ['author-1']);
  assert.deepEqual(upsertCalls, [
    {
      vnId: 'vn-1',
      userId: 'author-1',
      patch: { is_joined: true },
    },
  ]);
  assert.deepEqual(notificationCalls, [
    {
      userId: 'author-1',
      title: 'Violation Notice Reply',
      message: 'Jordan Reply replied to your message in a violation notice.',
      type: 'info',
      linkUrl: '/violation-notices?vnId=vn-1&messageId=reply-1',
    },
  ]);
});

test('violation notice replies skip notifications for self-replies and muted recipients', async () => {
  const notificationCalls: any[] = [];

  const selfReplyNotifiedUserIds = await notifyReplyRecipientForVNMessage(
    {
      vnId: 'vn-1',
      messageId: 'reply-2',
      senderId: 'sender-1',
      parentMessage: {
        id: 'parent-2',
        violation_notice_id: 'vn-1',
        user_id: 'sender-1',
        type: 'message',
      },
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => ({ is_joined: true, is_muted: false }),
      upsertParticipant: async () => undefined,
      resolveUserNames: async () => ({ 'sender-1': 'Jordan Reply' }),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );
  const mutedNotifiedUserIds = await notifyReplyRecipientForVNMessage(
    {
      vnId: 'vn-1',
      messageId: 'reply-3',
      senderId: 'sender-1',
      parentMessage: {
        id: 'parent-3',
        violation_notice_id: 'vn-1',
        user_id: 'author-1',
        type: 'message',
      },
    },
    {
      getParentMessage: async () => null,
      getParticipant: async () => ({ is_joined: false, is_muted: true }),
      upsertParticipant: async () => undefined,
      resolveUserNames: async () => ({ 'sender-1': 'Jordan Reply' }),
      dispatchNotification: async (input) => {
        notificationCalls.push(input);
        return {} as any;
      },
    },
  );

  assert.deepEqual(selfReplyNotifiedUserIds, []);
  assert.deepEqual(mutedNotifiedUserIds, []);
  assert.deepEqual(notificationCalls, []);
});

test('violation notice reply validation rejects missing or system parents', async () => {
  await assert.rejects(
    () =>
      resolveVNReplyParentMessage(
        {
          vnId: 'vn-1',
          parentMessageId: 'missing-parent',
        },
        {
          getParentMessage: async () => null,
        },
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 404 &&
      error.message === 'Parent message not found',
  );

  await assert.rejects(
    () =>
      resolveVNReplyParentMessage(
        {
          vnId: 'vn-1',
          parentMessageId: 'system-parent',
        },
        {
          getParentMessage: async () => ({
            id: 'system-parent',
            violation_notice_id: 'vn-1',
            user_id: 'system-user',
            type: 'system',
          }),
        },
      ),
    (error: unknown) =>
      error instanceof AppError &&
      error.statusCode === 400 &&
      error.message === 'Cannot reply to system messages',
  );
});

test('discussion reply senders are excluded from follow-up mention notifications in both services', () => {
  assert.match(
    caseReportServiceSource,
    /excludedUserIds:\s*replyNotifiedUserIds/,
    'Case report replies should exclude already-notified reply recipients from mention notifications',
  );
  assert.match(
    caseReportServiceSource,
    /!\(input\.excludedUserIds \?\? \[\]\)\.includes\(id\)/,
    'Case report mention notifications should filter excluded users from the target list',
  );
  assert.match(
    violationNoticeServiceSource,
    /excludedUserIds:\s*replyNotifiedUserIds/,
    'Violation notice replies should exclude already-notified reply recipients from mention notifications',
  );
  assert.match(
    violationNoticeServiceSource,
    /!\(input\.excludedUserIds \?\? \[\]\)\.includes\(id\)/,
    'Violation notice mention notifications should filter excluded users from the target list',
  );
});
