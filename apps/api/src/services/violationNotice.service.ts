import type {
  ViolationNotice,
  ViolationNoticeDetail,
  ViolationNoticeMessage,
  ViolationNoticeAttachment,
  ViolationNoticeReaction,
  ViolationNoticeMention,
  GroupedUsersResponse,
} from '@omnilert/shared';
import type { Knex } from 'knex';
import { PERMISSIONS, SYSTEM_ROLES } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAndDispatchNotification } from './notification.service.js';
import { buildTenantStoragePrefix, deleteFile, uploadFile } from './storage.service.js';
import {
  hydrateUsersByIds,
  resolveCompanyUsersWithPermission,
  resolveRolesWithPermission,
} from './globalUser.service.js';
import { logger } from '../utils/logger.js';

// ─── Internal Row Types ───────────────────────────────────────────────────────

type VNRow = {
  id: string;
  vn_number: number;
  status: string;
  category: string;
  description: string;
  company_id: string;
  created_by: string;
  confirmed_by: string | null;
  issued_by: string | null;
  completed_by: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  branch_id: string | null;
  source_case_report_id: string | null;
  source_store_audit_id: string | null;
  issuance_file_url: string | null;
  issuance_file_name: string | null;
  disciplinary_file_url: string | null;
  disciplinary_file_name: string | null;
  epi_decrease: number | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type VNMessageRow = {
  id: string;
  violation_notice_id: string;
  user_id: string;
  content: string;
  type: string;
  is_deleted: boolean;
  deleted_by: string | null;
  parent_message_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type VNReplyParentRow = Pick<VNMessageRow, 'id' | 'violation_notice_id' | 'user_id' | 'type'>;

type VNParticipantRow = {
  violation_notice_id: string;
  user_id: string;
  is_joined: boolean;
  is_muted: boolean;
  last_read_at: Date | string | null;
};

type VNAttachmentRow = {
  id: string;
  violation_notice_id: string;
  message_id: string | null;
  uploaded_by: string;
  file_url: string;
  file_name: string;
  file_size: number;
  content_type: string;
  created_at: Date | string;
};

type MentionableUser = {
  id: string;
  name: string;
  avatar_url: string | null;
};

// ─── Pure Utilities ───────────────────────────────────────────────────────────

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function ensureNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AppError(400, `${label} is required`);
  return trimmed;
}

function normalizeSortOrder(value?: string): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function isAllowedMessageAttachment(contentType: string): boolean {
  return (
    contentType.startsWith('image/') ||
    contentType.startsWith('video/') ||
    [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(contentType)
  );
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function emitVNEvent(companyId: string, event: string, data: unknown): void {
  try {
    (getIO().of('/violation-notices').to(`company:${companyId}`) as any).emit(event, data);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for violation notice event');
  }
}

async function getVNOrThrow(vnId: string): Promise<VNRow> {
  const row = await db.getDb()('violation_notices').where({ id: vnId }).first();
  if (!row) throw new AppError(404, 'Violation notice not found');
  return row as VNRow;
}

async function upsertParticipant(
  vnId: string,
  userId: string,
  patch: Partial<Pick<VNParticipantRow, 'is_joined' | 'is_muted' | 'last_read_at'>>,
  trx?: Knex.Transaction,
): Promise<void> {
  const knex = trx ?? db.getDb();
  const existing = await knex('violation_notice_participants')
    .where({ violation_notice_id: vnId, user_id: userId })
    .first();
  const next = {
    is_joined: patch.is_joined ?? existing?.is_joined ?? true,
    is_muted: patch.is_muted ?? existing?.is_muted ?? false,
    last_read_at: patch.last_read_at ?? existing?.last_read_at ?? null,
    updated_at: new Date(),
  };

  if (existing) {
    await knex('violation_notice_participants')
      .where({ violation_notice_id: vnId, user_id: userId })
      .update(next);
    return;
  }

  await knex('violation_notice_participants').insert({
    violation_notice_id: vnId,
    user_id: userId,
    ...next,
    created_at: new Date(),
  });
}

async function createSystemMessage(
  vnId: string,
  userId: string,
  content: string,
  trx?: Knex.Transaction,
): Promise<VNMessageRow> {
  const knex = trx ?? db.getDb();
  const [message] = await knex('violation_notice_messages')
    .insert({
      violation_notice_id: vnId,
      user_id: userId,
      content,
      type: 'system',
    })
    .returning('*');
  return message as VNMessageRow;
}

async function getNextCompanySequence(
  trx: Knex.Transaction,
  companyId: string,
  sequenceName: 'case_number' | 'vn_number',
): Promise<number> {
  await trx('company_sequences')
    .insert({
      company_id: companyId,
      sequence_name: sequenceName,
      current_value: 0,
    })
    .onConflict(['company_id', 'sequence_name'])
    .ignore();

  const sequenceRow = (await trx('company_sequences')
    .where({
      company_id: companyId,
      sequence_name: sequenceName,
    })
    .forUpdate()
    .first('id', 'current_value')) as { id: string; current_value: number } | undefined;

  if (!sequenceRow) {
    throw new AppError(500, `Failed to allocate ${sequenceName}`);
  }

  const nextValue = Number(sequenceRow.current_value) + 1;
  await trx('company_sequences').where({ id: sequenceRow.id }).update({
    current_value: nextValue,
    updated_at: new Date(),
  });

  return nextValue;
}

async function resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
  const users = await hydrateUsersByIds(userIds);
  const map: Record<string, string> = {};
  for (const [id, user] of Object.entries(users)) {
    map[id] =
      `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() ||
      String(user.email ?? 'Unknown User');
  }
  return map;
}

type VNReplyNotificationDeps = {
  getParentMessage: (input: {
    vnId: string;
    parentMessageId: string;
  }) => Promise<VNReplyParentRow | null>;
  getParticipant: (input: {
    vnId: string;
    userId: string;
  }) => Promise<Pick<VNParticipantRow, 'is_joined' | 'is_muted'> | null>;
  upsertParticipant: typeof upsertParticipant;
  resolveUserNames: typeof resolveUserNames;
  dispatchNotification: typeof createAndDispatchNotification;
};

const defaultVNReplyNotificationDeps: VNReplyNotificationDeps = {
  getParentMessage: async ({ vnId, parentMessageId }) => {
    const row = await db
      .getDb()('violation_notice_messages')
      .where({ id: parentMessageId, violation_notice_id: vnId })
      .first('id', 'violation_notice_id', 'user_id', 'type');
    return (row as VNReplyParentRow | undefined) ?? null;
  },
  getParticipant: async ({ vnId, userId }) => {
    const row = await db
      .getDb()('violation_notice_participants')
      .where({ violation_notice_id: vnId, user_id: userId })
      .first('is_joined', 'is_muted');
    return (row as Pick<VNParticipantRow, 'is_joined' | 'is_muted'> | undefined) ?? null;
  },
  upsertParticipant,
  resolveUserNames,
  dispatchNotification: createAndDispatchNotification,
};

export async function resolveVNReplyParentMessage(
  input: {
    vnId: string;
    parentMessageId?: string;
  },
  deps: Pick<VNReplyNotificationDeps, 'getParentMessage'> = defaultVNReplyNotificationDeps,
): Promise<VNReplyParentRow | null> {
  if (!input.parentMessageId) return null;

  const parentMessage = await deps.getParentMessage({
    vnId: input.vnId,
    parentMessageId: input.parentMessageId,
  });

  if (!parentMessage) {
    throw new AppError(404, 'Parent message not found');
  }

  if (parentMessage.type === 'system') {
    throw new AppError(400, 'Cannot reply to system messages');
  }

  return parentMessage;
}

export async function notifyReplyRecipientForVNMessage(
  input: {
    vnId: string;
    messageId: string;
    senderId: string;
    parentMessage: VNReplyParentRow | null;
  },
  deps: VNReplyNotificationDeps = defaultVNReplyNotificationDeps,
): Promise<string[]> {
  if (!input.parentMessage) return [];

  const recipientUserId = String(input.parentMessage.user_id);
  if (recipientUserId === input.senderId) return [];

  const participant = await deps.getParticipant({
    vnId: input.vnId,
    userId: recipientUserId,
  });

  if (participant?.is_muted) return [];

  await deps.upsertParticipant(input.vnId, recipientUserId, { is_joined: true });

  const senderNames = await deps.resolveUserNames([input.senderId]);
  const senderName = senderNames[input.senderId] ?? 'Someone';

  await deps.dispatchNotification({
    userId: recipientUserId,
    title: 'Violation Notice Reply',
    message: `${senderName} replied to your message in a violation notice.`,
    type: 'info',
    linkUrl: `/violation-notices?vnId=${input.vnId}&messageId=${input.messageId}`,
  });

  return [recipientUserId];
}

async function resolveMessageDecorations(messageIds: string[]): Promise<{
  reactionsByMessage: Map<string, ViolationNoticeReaction[]>;
  attachmentsByMessage: Map<string, ViolationNoticeAttachment[]>;
  mentionsByMessage: Map<string, ViolationNoticeMention[]>;
}> {
  const [reactionRows, attachmentRows, mentionRows] = await Promise.all([
    messageIds.length > 0
      ? db.getDb()('violation_notice_reactions').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
    messageIds.length > 0
      ? db.getDb()('violation_notice_attachments').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
    messageIds.length > 0
      ? db
          .getDb()('violation_notice_mentions as vnm')
          .leftJoin('users as u', 'vnm.mentioned_user_id', 'u.id')
          .leftJoin('roles as r', 'vnm.mentioned_role_id', 'r.id')
          .whereIn('vnm.message_id', messageIds)
          .select('vnm.*', 'u.first_name', 'u.last_name', 'r.name as role_name')
      : Promise.resolve([]),
  ]);

  const reactionUserNames = await resolveUserNames(
    reactionRows.map((row: any) => String(row.user_id)),
  );

  const reactionsGrouped = new Map<string, Map<string, Array<{ id: string; name: string }>>>();
  for (const row of reactionRows as any[]) {
    const messageId = String(row.message_id);
    const byEmoji =
      reactionsGrouped.get(messageId) ?? new Map<string, Array<{ id: string; name: string }>>();
    const users = byEmoji.get(String(row.emoji)) ?? [];
    users.push({
      id: String(row.user_id),
      name: reactionUserNames[String(row.user_id)] ?? 'Unknown User',
    });
    byEmoji.set(String(row.emoji), users);
    reactionsGrouped.set(messageId, byEmoji);
  }

  const reactionsByMessage = new Map<string, ViolationNoticeReaction[]>();
  for (const [messageId, byEmoji] of reactionsGrouped.entries()) {
    reactionsByMessage.set(
      messageId,
      Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, users })),
    );
  }

  const attachmentsByMessage = new Map<string, ViolationNoticeAttachment[]>();
  for (const row of attachmentRows as VNAttachmentRow[]) {
    if (!row.message_id) continue;
    const list = attachmentsByMessage.get(String(row.message_id)) ?? [];
    list.push({
      id: row.id,
      violation_notice_id: row.violation_notice_id,
      message_id: row.message_id,
      uploaded_by: row.uploaded_by,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      content_type: row.content_type,
      created_at: new Date(row.created_at).toISOString(),
    });
    attachmentsByMessage.set(String(row.message_id), list);
  }

  const mentionsByMessage = new Map<string, ViolationNoticeMention[]>();
  for (const row of mentionRows as any[]) {
    const list = mentionsByMessage.get(String(row.message_id)) ?? [];
    let mentioned_name: string | undefined;
    if (row.mentioned_user_id) {
      mentioned_name = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim() || 'Unknown User';
    } else if (row.mentioned_role_id) {
      mentioned_name = row.role_name ?? 'Unknown Role';
    }

    list.push({
      mentioned_user_id: row.mentioned_user_id ? String(row.mentioned_user_id) : null,
      mentioned_role_id: row.mentioned_role_id ? String(row.mentioned_role_id) : null,
      mentioned_name,
    });
    mentionsByMessage.set(String(row.message_id), list);
  }

  return { reactionsByMessage, attachmentsByMessage, mentionsByMessage };
}

async function enrichViolationNotices(userId: string, vnRows: VNRow[]): Promise<ViolationNotice[]> {
  if (vnRows.length === 0) return [];

  const vnIds = vnRows.map((row) => row.id);
  const userIdSet = [
    ...new Set(
      vnRows.flatMap(
        (row) =>
          [
            row.created_by,
            row.confirmed_by,
            row.issued_by,
            row.completed_by,
            row.rejected_by,
          ].filter(Boolean) as string[],
      ),
    ),
  ];

  const branchIds = [...new Set(vnRows.map((r) => r.branch_id).filter(Boolean) as string[])];
  const companyIds = [...new Set(vnRows.map((r) => r.company_id).filter(Boolean) as string[])];

  const [
    participants,
    messageCounts,
    unreadCounts,
    unreadReplyCounts,
    userNames,
    targetRows,
    branchRows,
    companyRows,
  ] = await Promise.all([
    db
      .getDb()('violation_notice_participants')
      .whereIn('violation_notice_id', vnIds)
      .andWhere({ user_id: userId })
      .select('violation_notice_id', 'is_joined', 'is_muted', 'last_read_at'),
    db
      .getDb()('violation_notice_messages')
      .whereIn('violation_notice_id', vnIds)
      .andWhere({ type: 'message' })
      .groupBy('violation_notice_id')
      .select('violation_notice_id')
      .count<{ count: string }[]>({ count: '*' }),
    db
      .getDb()('violation_notice_participants as vp')
      .leftJoin(
        'violation_notice_messages as vm',
        'vp.violation_notice_id',
        'vm.violation_notice_id',
      )
      .where('vp.user_id', userId)
      .whereIn('vp.violation_notice_id', vnIds)
      .andWhere('vm.user_id', '!=', userId)
      .andWhere('vm.type', 'message')
      .andWhere((builder) => {
        builder.whereNull('vp.last_read_at').orWhereRaw('vm.created_at > vp.last_read_at');
      })
      .groupBy('vp.violation_notice_id')
      .select('vp.violation_notice_id')
      .count<{ count: string }[]>({ count: 'vm.id' }),
    db
      .getDb()('violation_notice_messages as reply')
      .join('violation_notice_messages as parent', 'reply.parent_message_id', 'parent.id')
      .join('violation_notice_participants as vp', (join) => {
        join
          .on('vp.violation_notice_id', 'reply.violation_notice_id')
          .andOnVal('vp.user_id', userId);
      })
      .whereIn('reply.violation_notice_id', vnIds)
      .where('parent.user_id', userId)
      .where('reply.user_id', '!=', userId)
      .andWhere('reply.type', 'message')
      .andWhere((builder) => {
        builder.whereNull('vp.last_read_at').orWhereRaw('reply.created_at > vp.last_read_at');
      })
      .groupBy('reply.violation_notice_id')
      .select('reply.violation_notice_id')
      .count<{ count: string }[]>({ count: 'reply.id' }),
    resolveUserNames(userIdSet),
    db.getDb()('violation_notice_targets').whereIn('violation_notice_id', vnIds).select('*'),
    branchIds.length > 0
      ? db.getDb()('branches').whereIn('id', branchIds).select('id', 'name')
      : Promise.resolve([]),
    companyIds.length > 0
      ? db.getDb()('companies').whereIn('id', companyIds).select('id', 'name')
      : Promise.resolve([]),
  ]);

  // Hydrate target user names
  const targetUserIds = [...new Set((targetRows as any[]).map((row: any) => String(row.user_id)))];
  const targetUserNames = await hydrateUsersByIds(targetUserIds, [
    'id',
    'first_name',
    'last_name',
    'avatar_url',
  ]);

  const participantMap = new Map(
    participants.map((row: any) => [String(row.violation_notice_id), row as VNParticipantRow]),
  );
  const messageCountMap = new Map(
    messageCounts.map((row: any) => [String(row.violation_notice_id), Number(row.count ?? 0)]),
  );
  const unreadCountMap = new Map(
    unreadCounts.map((row: any) => [String(row.violation_notice_id), Number(row.count ?? 0)]),
  );
  const unreadReplyCountMap = new Map(
    unreadReplyCounts.map((row: any) => [String(row.violation_notice_id), Number(row.count ?? 0)]),
  );
  const branchMap = new Map<string, string>(
    (branchRows as any[]).map((b: any) => [String(b.id), String(b.name)]),
  );
  const companyMap = new Map<string, string>(
    (companyRows as any[]).map((c: any) => [String(c.id), String(c.name)]),
  );

  const targetsByVN = new Map<string, typeof targetRows>();
  for (const row of targetRows as any[]) {
    const vnId = String(row.violation_notice_id);
    const list = targetsByVN.get(vnId) ?? [];
    list.push(row);
    targetsByVN.set(vnId, list);
  }

  return vnRows.map((row) => {
    const participant = participantMap.get(row.id);
    const targets = (targetsByVN.get(row.id) ?? []).map((t: any) => {
      const targetUser = targetUserNames[String(t.user_id)];
      return {
        id: String(t.id),
        user_id: String(t.user_id),
        user_name: targetUser
          ? `${targetUser.first_name ?? ''} ${targetUser.last_name ?? ''}`.trim() || undefined
          : undefined,
        user_avatar: (targetUser?.avatar_url as string | null) ?? null,
      };
    });

    return {
      id: row.id,
      vn_number: row.vn_number,
      status: row.status as ViolationNotice['status'],
      category: row.category as ViolationNotice['category'],
      description: row.description,
      created_by: row.created_by,
      created_by_name: userNames[row.created_by] ?? undefined,
      confirmed_by: row.confirmed_by,
      confirmed_by_name: row.confirmed_by ? (userNames[row.confirmed_by] ?? undefined) : null,
      issued_by: row.issued_by,
      issued_by_name: row.issued_by ? (userNames[row.issued_by] ?? undefined) : null,
      completed_by: row.completed_by,
      completed_by_name: row.completed_by ? (userNames[row.completed_by] ?? undefined) : null,
      rejected_by: row.rejected_by,
      rejected_by_name: row.rejected_by ? (userNames[row.rejected_by] ?? undefined) : null,
      rejection_reason: row.rejection_reason,
      branch_id: row.branch_id ?? null,
      branch_name: row.branch_id ? (branchMap.get(row.branch_id) ?? null) : null,
      company_name: companyMap.get(row.company_id) ?? null,
      source_case_report_id: row.source_case_report_id,
      source_store_audit_id: row.source_store_audit_id,
      issuance_file_url: row.issuance_file_url,
      issuance_file_name: row.issuance_file_name,
      disciplinary_file_url: row.disciplinary_file_url,
      disciplinary_file_name: row.disciplinary_file_name,
      epi_decrease: row.epi_decrease != null ? Number(row.epi_decrease) : null,
      targets,
      message_count: messageCountMap.get(row.id) ?? 0,
      unread_count: unreadCountMap.get(row.id) ?? 0,
      unread_reply_count: unreadReplyCountMap.get(row.id) ?? 0,
      is_joined: participant?.is_joined ?? false,
      is_muted: participant?.is_muted ?? false,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  });
}

async function buildVNMessageList(vnId: string): Promise<ViolationNoticeMessage[]> {
  const rows = await db
    .getDb()('violation_notice_messages')
    .where({ violation_notice_id: vnId })
    .orderBy('created_at', 'asc')
    .select('*');
  const messageRows = rows as VNMessageRow[];
  const messageIds = messageRows.map((row) => row.id);

  const userMap = await hydrateUsersByIds(
    messageRows.filter((row) => row.type !== 'system').map((row) => row.user_id),
    ['id', 'first_name', 'last_name', 'avatar_url'],
  );

  const { reactionsByMessage, attachmentsByMessage, mentionsByMessage } =
    await resolveMessageDecorations(messageIds);

  return messageRows.map((row) => {
    const user = userMap[row.user_id];
    const isSystem = row.type === 'system';
    return {
      id: row.id,
      violation_notice_id: row.violation_notice_id,
      user_id: row.user_id,
      user_name: isSystem
        ? 'System'
        : `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || undefined,
      user_avatar: typeof user?.avatar_url === 'string' ? user.avatar_url : undefined,
      content: row.content,
      type: row.type as 'message' | 'system',
      is_deleted: row.is_deleted ?? false,
      deleted_by: row.deleted_by ?? null,
      parent_message_id: row.parent_message_id,
      reactions: reactionsByMessage.get(row.id) ?? [],
      attachments: attachmentsByMessage.get(row.id) ?? [],
      mentions: mentionsByMessage.get(row.id) ?? [],
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
      is_edited: !row.is_deleted && new Date(row.updated_at) > new Date(row.created_at),
    };
  });
}

async function maybeNotifyMentionedUsers(input: {
  companyId: string;
  vnId: string;
  messageId: string;
  senderId: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
  excludedUserIds?: string[];
}): Promise<void> {
  const masterDb = db.getDb();
  const roleMentionUsers =
    input.mentionedRoleIds.length > 0
      ? await masterDb('user_roles as ur')
          .join('user_company_access as uca', 'ur.user_id', 'uca.user_id')
          .join('users', 'ur.user_id', 'users.id')
          .whereIn('ur.role_id', input.mentionedRoleIds)
          .andWhere('uca.company_id', input.companyId)
          .andWhere('uca.is_active', true)
          .andWhere('users.is_active', true)
          .select('users.id')
      : [];

  const targets = Array.from(
    new Set([...input.mentionedUserIds, ...roleMentionUsers.map((row: any) => String(row.id))]),
  ).filter((id) => id !== input.senderId && !(input.excludedUserIds ?? []).includes(id));

  if (targets.length === 0) return;

  const senderNames = await resolveUserNames([input.senderId]);
  const senderName = senderNames[input.senderId] ?? 'Someone';
  const participantRows = await db
    .getDb()('violation_notice_participants')
    .whereIn('user_id', targets)
    .andWhere({ violation_notice_id: input.vnId })
    .select('user_id', 'is_muted');
  const participantMap = new Map(participantRows.map((row: any) => [String(row.user_id), row]));

  await Promise.all(
    targets.map(async (targetUserId) => {
      await upsertParticipant(input.vnId, targetUserId, { is_joined: true });
      if (participantMap.get(targetUserId)?.is_muted) return;
      await createAndDispatchNotification({
        userId: targetUserId,
        title: 'Violation Notice Mention',
        message: `${senderName} mentioned you in a violation notice.`,
        type: 'info',
        linkUrl: `/violation-notices?vnId=${input.vnId}&messageId=${input.messageId}`,
      });
    }),
  );
}

async function resolveCompanyUsers(companyId: string): Promise<MentionableUser[]> {
  return resolveCompanyUsersWithPermission(companyId, PERMISSIONS.VIOLATION_NOTICE_VIEW);
}

// ─── Exported Functions ───────────────────────────────────────────────────────

export async function listViolationNotices(input: {
  userId: string;
  companyId: string;
  filters?: {
    status?: string;
    search?: string;
    dateFrom?: string;
    dateTo?: string;
    category?: string;
    targetUserId?: string;
    sortOrder?: string;
  };
}): Promise<ViolationNotice[]> {
  const { filters = {} } = input;
  let query = db.getDb()('violation_notices as vn').select('vn.*');

  if (filters.targetUserId) {
    query = query
      .join('violation_notice_targets as vnt', 'vn.id', 'vnt.violation_notice_id')
      .where('vnt.user_id', filters.targetUserId);
  }

  if (filters.status) {
    query.where('vn.status', filters.status);
  }
  if (filters.category) {
    query.where('vn.category', filters.category);
  }
  if (filters.search) {
    query.andWhere((builder) => {
      builder
        .whereRaw('CAST(vn.vn_number AS TEXT) ILIKE ?', [`%${filters.search}%`])
        .orWhereILike('vn.description', `%${filters.search}%`);
    });
  }
  if (filters.dateFrom) {
    query.andWhere('vn.created_at', '>=', new Date(filters.dateFrom));
  }
  if (filters.dateTo) {
    query.andWhere('vn.created_at', '<=', new Date(filters.dateTo));
  }

  query.orderBy('vn.vn_number', normalizeSortOrder(filters.sortOrder));

  const rows = await query;
  return enrichViolationNotices(input.userId, rows as VNRow[]);
}

export async function getViolationNotice(input: {
  userId: string;
  vnId: string;
}): Promise<ViolationNoticeDetail> {
  const record = await getVNOrThrow(input.vnId);

  // Auto-mark read on fetch
  await upsertParticipant(input.vnId, input.userId, {
    is_joined: true,
    last_read_at: new Date(),
  });

  const [enriched] = await enrichViolationNotices(input.userId, [record]);

  const attachmentRows = await db
    .getDb()('violation_notice_attachments')
    .where({ violation_notice_id: input.vnId })
    .whereNull('message_id')
    .orderBy('created_at', 'desc')
    .select('*');

  const attachments: ViolationNoticeAttachment[] = (attachmentRows as VNAttachmentRow[]).map(
    (row) => ({
      id: row.id,
      violation_notice_id: row.violation_notice_id,
      message_id: row.message_id,
      uploaded_by: row.uploaded_by,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      content_type: row.content_type,
      created_at: new Date(row.created_at).toISOString(),
    }),
  );

  return { ...enriched, attachments };
}

export async function createViolationNotice(input: {
  companyId: string;
  userId: string;
  description: string;
  targetUserIds: string[];
  branchId?: string | null;
  category?: string;
  sourceCaseReportId?: string;
  sourceStoreAuditId?: string;
}): Promise<ViolationNotice> {
  const description = ensureNonEmpty(input.description, 'Description');
  if (!input.targetUserIds || input.targetUserIds.length === 0) {
    throw new AppError(400, 'At least one target user is required');
  }

  const userNames = await resolveUserNames([input.userId]);

  const vn = await db.getDb().transaction(async (trx) => {
    const vnNumber = await getNextCompanySequence(trx, input.companyId, 'vn_number');
    const [created] = await trx('violation_notices')
      .insert({
        company_id: input.companyId,
        vn_number: vnNumber,
        status: 'queued',
        category: input.category ?? 'manual',
        description,
        created_by: input.userId,
        branch_id: input.branchId ?? null,
        source_case_report_id: input.sourceCaseReportId ?? null,
        source_store_audit_id: input.sourceStoreAuditId ?? null,
      })
      .returning('*');

    await trx('violation_notice_targets').insert(
      input.targetUserIds.map((userId) => ({
        violation_notice_id: created.id,
        user_id: userId,
      })),
    );

    await upsertParticipant(
      created.id,
      input.userId,
      {
        is_joined: true,
        last_read_at: new Date(),
      },
      trx,
    );

    await createSystemMessage(
      created.id,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} created this violation notice`,
      trx,
    );

    return created as VNRow;
  });

  emitVNEvent(input.companyId, 'violation-notice:created', {
    id: vn.id,
    vnNumber: vn.vn_number,
    status: vn.status,
    createdBy: vn.created_by,
  });

  const [enriched] = await enrichViolationNotices(input.userId, [vn]);
  return enriched;
}

export async function confirmViolationNotice(input: {
  companyId: string;
  userId: string;
  vnId: string;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'queued') {
    throw new AppError(409, 'Violation notice must be in queued status to confirm');
  }

  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      status: 'discussion',
      confirmed_by: input.userId,
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} confirmed this violation notice`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:status-changed', {
    id: input.vnId,
    status: 'discussion',
  });

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

export async function rejectViolationNotice(input: {
  companyId: string;
  userId: string;
  vnId: string;
  rejectionReason: string;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'queued' && record.status !== 'discussion') {
    throw new AppError(409, 'Violation notice must be in queued or discussion status to reject');
  }

  const rejectionReason = ensureNonEmpty(input.rejectionReason, 'Rejection reason');
  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      status: 'rejected',
      rejected_by: input.userId,
      rejection_reason: rejectionReason,
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} rejected this violation notice: ${rejectionReason}`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:status-changed', {
    id: input.vnId,
    status: 'rejected',
  });

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

export async function issueViolationNotice(input: {
  companyId: string;
  userId: string;
  vnId: string;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'discussion') {
    throw new AppError(409, 'Violation notice must be in discussion status to issue');
  }

  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      status: 'issuance',
      issued_by: input.userId,
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} issued this violation notice`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:status-changed', {
    id: input.vnId,
    status: 'issuance',
  });

  try {
    await notifyViolationNoticeIssuanceTargets({
      companyId: input.companyId,
      vnId: input.vnId,
      vnNumber: record.vn_number,
    });
  } catch (err) {
    logger.error({ err, vnId: input.vnId }, 'Failed to notify VN issuance to target users');
  }

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

async function notifyViolationNoticeIssuanceTargets(input: {
  companyId: string;
  vnId: string;
  vnNumber: number;
}): Promise<void> {
  const targets = await db
    .getDb()('violation_notice_targets')
    .where({ violation_notice_id: input.vnId })
    .select('user_id');
  if (targets.length === 0) return;

  const vnLabel = `VN-${String(input.vnNumber).padStart(4, '0')}`;
  const message = `A Violation Notice (${vnLabel}) has been issued. Please review the details and wait for further instructions from HR regarding the disciplinary meeting.`;

  await Promise.all(
    targets.map(async (target: { user_id: unknown }) => {
      await createAndDispatchNotification({
        userId: String(target.user_id),
        companyId: input.companyId,
        title: 'Official Violation Notice',
        message,
        type: 'danger',
        linkUrl: `/violation-notices?vnId=${input.vnId}`,
      });
    }),
  );
}

export async function uploadIssuanceFile(input: {
  companyId: string;
  userId: string;
  vnId: string;
  file: { buffer: Buffer; originalname: string; mimetype: string };
  companyStorageRoot: string;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'issuance') {
    throw new AppError(
      409,
      'Violation notice must be in issuance status to upload an issuance file',
    );
  }

  const vnNumberPadded = String(record.vn_number).padStart(4, '0');
  const folder = buildTenantStoragePrefix(
    input.companyStorageRoot,
    'Violation Notices',
    `VN-${vnNumberPadded}`,
  );

  const fileUrl = await uploadFile(
    input.file.buffer,
    input.file.originalname,
    input.file.mimetype,
    folder,
  );
  if (!fileUrl) throw new AppError(500, 'Failed to upload issuance file');

  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      issuance_file_url: fileUrl,
      issuance_file_name: input.file.originalname,
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} uploaded the issuance document`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:updated', {
    id: input.vnId,
    field: 'issuance_file',
  });

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

export async function confirmIssuance(input: {
  companyId: string;
  userId: string;
  vnId: string;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'issuance') {
    throw new AppError(409, 'Violation notice must be in issuance status to confirm issuance');
  }

  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      status: 'disciplinary_meeting',
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} confirmed issuance, starting disciplinary meeting`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:status-changed', {
    id: input.vnId,
    status: 'disciplinary_meeting',
  });

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

export async function uploadDisciplinaryFile(input: {
  companyId: string;
  userId: string;
  vnId: string;
  file: { buffer: Buffer; originalname: string; mimetype: string };
  companyStorageRoot: string;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'disciplinary_meeting') {
    throw new AppError(
      409,
      'Violation notice must be in disciplinary_meeting status to upload a disciplinary file',
    );
  }

  const vnNumberPadded = String(record.vn_number).padStart(4, '0');
  const folder = buildTenantStoragePrefix(
    input.companyStorageRoot,
    'Violation Notices',
    `VN-${vnNumberPadded}`,
  );

  const fileUrl = await uploadFile(
    input.file.buffer,
    input.file.originalname,
    input.file.mimetype,
    folder,
  );
  if (!fileUrl) throw new AppError(500, 'Failed to upload disciplinary file');

  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      disciplinary_file_url: fileUrl,
      disciplinary_file_name: input.file.originalname,
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} uploaded the disciplinary meeting proof`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:updated', {
    id: input.vnId,
    field: 'disciplinary_file',
  });

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

async function notifyViolationNoticeCompletionTargets(input: {
  companyId: string;
  vnId: string;
  vnNumber: number;
  epiDecrease: number;
}): Promise<void> {
  const targets = await db
    .getDb()('violation_notice_targets')
    .where({ violation_notice_id: input.vnId })
    .select('user_id');
  if (targets.length === 0) return;

  const vnLabel = `VN-${String(input.vnNumber).padStart(4, '0')}`;
  const epiMessage =
    input.epiDecrease > 0
      ? ` EPI decrease: ${input.epiDecrease.toFixed(1)} has been applied to your official EPI score.`
      : '';

  await Promise.all(
    targets.map(async (target: { user_id: unknown }) => {
      await createAndDispatchNotification({
        userId: String(target.user_id),
        companyId: input.companyId,
        title: 'Violation Notice Completed',
        message: `Violation Notice ${vnLabel} has been completed.${epiMessage ? ` ${epiMessage}` : ''}`,
        type: input.epiDecrease > 0 ? 'warning' : 'info',
        linkUrl: `/violation-notices?vnId=${input.vnId}`,
      });
    }),
  );
}

export async function completeViolationNotice(input: {
  companyId: string;
  userId: string;
  vnId: string;
  epiDecrease: number;
}): Promise<ViolationNotice> {
  const record = await getVNOrThrow(input.vnId);
  if (record.status !== 'disciplinary_meeting') {
    throw new AppError(409, 'Violation notice must be in disciplinary_meeting status to complete');
  }

  const userNames = await resolveUserNames([input.userId]);
  const completedAt = new Date();

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notices').where({ id: input.vnId }).update({
      status: 'completed',
      completed_by: input.userId,
      epi_decrease: input.epiDecrease,
      updated_at: completedAt,
    });

    if (input.epiDecrease > 0) {
      const targets = await trx('violation_notice_targets')
        .where({ violation_notice_id: input.vnId })
        .select<{ user_id: string }[]>('user_id');

      for (const target of targets) {
        const user = await trx('users').where({ id: target.user_id }).first<{
          epi_score: number | string | null;
          epi_history: any;
        }>('epi_score', 'epi_history');

        if (!user) continue;

        const epiBefore = user.epi_score !== null ? Number(user.epi_score) : 100;
        const epiAfter = Math.round(Math.max(0, epiBefore - input.epiDecrease) * 100) / 100;
        const delta = Number((epiAfter - epiBefore).toFixed(2));

        const historyEntry = {
          type: 'violation',
          date: completedAt.toISOString(),
          epi_before: epiBefore,
          epi_after: epiAfter,
          delta,
          vn_id: input.vnId,
          vn_number: record.vn_number,
        };

        await trx('users').where({ id: target.user_id }).update({
          epi_score: epiAfter,
          updated_at: completedAt,
        });
      }
    }

    await createSystemMessage(
      input.vnId,
      input.userId,
      `${userNames[input.userId] ?? 'Someone'} completed this violation notice`,
    );
  });

  emitVNEvent(input.companyId, 'violation-notice:status-changed', {
    id: input.vnId,
    status: 'completed',
  });

  try {
    await notifyViolationNoticeCompletionTargets({
      companyId: input.companyId,
      vnId: input.vnId,
      vnNumber: record.vn_number,
      epiDecrease: input.epiDecrease,
    });
  } catch (err) {
    logger.error({ err, vnId: input.vnId }, 'Failed to notify VN completion to target users');
  }

  const updated = await getVNOrThrow(input.vnId);
  const [enriched] = await enrichViolationNotices(input.userId, [updated]);
  return enriched;
}

export async function sendMessage(input: {
  companyId: string;
  companyStorageRoot: string;
  userId: string;
  vnId: string;
  content: string;
  parentMessageId?: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
  files: Array<{ buffer: Buffer; originalname: string; mimetype: string; size: number }>;
}): Promise<ViolationNoticeMessage> {
  await getVNOrThrow(input.vnId);

  if (!input.content?.trim() && input.files.length === 0) {
    throw new AppError(400, 'Message must have content or at least one attachment');
  }
  const content = input.content?.trim() ?? '';

  if (input.files.some((file) => !isAllowedMessageAttachment(file.mimetype))) {
    throw new AppError(400, 'Unsupported attachment type');
  }
  const parentMessage = await resolveVNReplyParentMessage({
    vnId: input.vnId,
    parentMessageId: input.parentMessageId,
  });

  const vn = await getVNOrThrow(input.vnId);
  const vnNumberPadded = String(vn.vn_number).padStart(4, '0');

  let messageId = '';
  await db.getDb().transaction(async (trx) => {
    await upsertParticipant(input.vnId, input.userId, {
      is_joined: true,
      last_read_at: new Date(),
    });

    const [created] = await trx('violation_notice_messages')
      .insert({
        violation_notice_id: input.vnId,
        user_id: input.userId,
        content,
        type: 'message',
        parent_message_id: parentMessage?.id ?? null,
      })
      .returning('*');
    messageId = String(created.id);

    if (input.mentionedUserIds.length > 0 || input.mentionedRoleIds.length > 0) {
      await trx('violation_notice_mentions').insert([
        ...input.mentionedUserIds.map((mentionedUserId) => ({
          message_id: messageId,
          mentioned_user_id: mentionedUserId,
          mentioned_role_id: null,
        })),
        ...input.mentionedRoleIds.map((mentionedRoleId) => ({
          message_id: messageId,
          mentioned_user_id: null,
          mentioned_role_id: mentionedRoleId,
        })),
      ]);
    }

    if (input.files.length > 0) {
      const folder = buildTenantStoragePrefix(
        input.companyStorageRoot,
        'Violation Notices',
        `VN-${vnNumberPadded}`,
      );

      for (const file of input.files) {
        const fileUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folder);
        if (!fileUrl) throw new AppError(500, 'Failed to upload message attachment');

        await trx('violation_notice_attachments').insert({
          violation_notice_id: input.vnId,
          message_id: messageId,
          uploaded_by: input.userId,
          file_url: fileUrl,
          file_name: file.originalname,
          file_size: file.size,
          content_type: file.mimetype,
        });
      }
    }
  });

  const replyNotifiedUserIds = await notifyReplyRecipientForVNMessage({
    vnId: input.vnId,
    messageId,
    senderId: input.userId,
    parentMessage,
  });

  await maybeNotifyMentionedUsers({
    companyId: input.companyId,
    vnId: input.vnId,
    messageId,
    senderId: input.userId,
    mentionedUserIds: input.mentionedUserIds,
    mentionedRoleIds: input.mentionedRoleIds,
    excludedUserIds: replyNotifiedUserIds,
  });

  const messages = await buildVNMessageList(input.vnId);
  const found = messages.find((m) => m.id === messageId);
  if (!found) throw new AppError(500, 'Failed to load saved message');

  emitVNEvent(input.companyId, 'violation-notice:message', {
    vnId: input.vnId,
    message: found,
  });

  return found;
}

export async function editMessage(input: {
  companyId: string;
  userId: string;
  vnId: string;
  messageId: string;
  content: string;
}): Promise<ViolationNoticeMessage> {
  const content = ensureNonEmpty(input.content, 'Message content');
  const message = (await db
    .getDb()('violation_notice_messages')
    .where({ id: input.messageId, violation_notice_id: input.vnId })
    .first()) as VNMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');
  if (message.type === 'system') throw new AppError(400, 'Cannot edit system messages');
  if (message.user_id !== input.userId)
    throw new AppError(403, 'You can only edit your own messages');

  await db
    .getDb()('violation_notice_messages')
    .where({ id: input.messageId })
    .update({ content, updated_at: new Date() });

  const messages = await buildVNMessageList(input.vnId);
  const updated = messages.find((m) => m.id === input.messageId);
  if (!updated) throw new AppError(500, 'Failed to retrieve updated message');

  emitVNEvent(input.companyId, 'violation-notice:message:edited', {
    vnId: input.vnId,
    message: updated,
  });

  return updated;
}

export async function deleteMessage(input: {
  companyId: string;
  userId: string;
  vnId: string;
  messageId: string;
  permissions: string[];
}): Promise<void> {
  const message = (await db
    .getDb()('violation_notice_messages')
    .where({ id: input.messageId, violation_notice_id: input.vnId })
    .first()) as VNMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');
  if (message.type === 'system') throw new AppError(400, 'Cannot delete system messages');

  const isOwn = message.user_id === input.userId;
  const canManage = input.permissions.includes(PERMISSIONS.VIOLATION_NOTICE_MANAGE);
  if (!isOwn && !canManage) throw new AppError(403, 'Permission denied');

  const attachments = (await db
    .getDb()('violation_notice_attachments')
    .where({ message_id: input.messageId })
    .select('file_url')) as { file_url: string }[];

  const userNames = await resolveUserNames([input.userId]);
  const deleterName = userNames[input.userId] ?? 'Someone';

  await db.getDb().transaction(async (trx) => {
    await trx('violation_notice_messages')
      .where({ id: input.messageId })
      .update({
        content: `${deleterName} deleted this message`,
        is_deleted: true,
        deleted_by: input.userId,
        updated_at: new Date(),
      });
  });

  // Delete S3 files after DB update (best-effort)
  await Promise.all(attachments.map((a) => deleteFile(a.file_url).catch(() => {})));

  emitVNEvent(input.companyId, 'violation-notice:message:deleted', {
    vnId: input.vnId,
    messageId: input.messageId,
  });
}

export async function toggleReaction(input: {
  companyId: string;
  userId: string;
  vnId: string;
  messageId: string;
  emoji: string;
}): Promise<{ messageId: string; reactions: ViolationNoticeReaction[] }> {
  ensureNonEmpty(input.emoji, 'Emoji');
  const message = await db
    .getDb()('violation_notice_messages')
    .where({ id: input.messageId, violation_notice_id: input.vnId })
    .first();
  if (!message) throw new AppError(404, 'Message not found');

  const existing = await db
    .getDb()('violation_notice_reactions')
    .where({ message_id: input.messageId, user_id: input.userId, emoji: input.emoji })
    .first();

  if (existing) {
    await db.getDb()('violation_notice_reactions').where({ id: existing.id }).delete();
  } else {
    await db.getDb()('violation_notice_reactions').insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    });
  }

  const { reactionsByMessage } = await resolveMessageDecorations([input.messageId]);
  const reactions = reactionsByMessage.get(input.messageId) ?? [];

  emitVNEvent(input.companyId, 'violation-notice:reaction', {
    vnId: input.vnId,
    messageId: input.messageId,
    reactions,
  });

  return { messageId: input.messageId, reactions };
}

export async function leaveDiscussion(input: {
  userId: string;
  vnId: string;
}): Promise<{ is_joined: boolean }> {
  await getVNOrThrow(input.vnId);
  await upsertParticipant(input.vnId, input.userId, {
    is_joined: false,
    last_read_at: new Date(),
  });
  return { is_joined: false };
}

export async function toggleMute(input: {
  userId: string;
  vnId: string;
}): Promise<{ is_muted: boolean }> {
  await getVNOrThrow(input.vnId);
  const existing = await db
    .getDb()('violation_notice_participants')
    .where({ violation_notice_id: input.vnId, user_id: input.userId })
    .first();
  const nextMuted = !(existing?.is_muted ?? false);

  await upsertParticipant(input.vnId, input.userId, {
    is_joined: existing?.is_joined ?? true,
    is_muted: nextMuted,
  });

  return { is_muted: nextMuted };
}

export async function markVNRead(input: {
  userId: string;
  vnId: string;
}): Promise<{ last_read_at: string }> {
  await getVNOrThrow(input.vnId);
  const now = new Date();
  await upsertParticipant(input.vnId, input.userId, {
    is_joined: true,
    last_read_at: now,
  });
  return { last_read_at: now.toISOString() };
}

export async function listVNMessages(input: { vnId: string }): Promise<ViolationNoticeMessage[]> {
  await getVNOrThrow(input.vnId);
  return buildVNMessageList(input.vnId);
}

export async function getMentionables(input: { companyId: string }): Promise<{
  users: MentionableUser[];
  roles: Array<{ id: string; name: string; color: string | null }>;
}> {
  const [users, roles] = await Promise.all([
    resolveCompanyUsers(input.companyId),
    db
      .getDb()('roles')
      .whereNot('name', SYSTEM_ROLES.SERVICE_CREW)
      .select('id', 'name', 'color')
      .orderBy('priority', 'desc')
      .orderBy('name', 'asc'),
  ]);

  return {
    users,
    roles: roles.map((role: any) => ({
      id: String(role.id),
      name: String(role.name),
      color: (role.color as string | null) ?? null,
    })),
  };
}

export async function getGroupedUsersForVN(input: {
  companyId?: string;
  includeAllCompanies?: boolean;
}): Promise<GroupedUsersResponse> {
  const masterDb = db.getDb();

  type UserRow = {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  };

  type SuperAdminRow = {
    email: string;
  };

  type UserRoleRow = {
    user_id: string;
    name: string;
    priority: number;
  };

  if (!input.includeAllCompanies && !input.companyId) {
    throw new AppError(400, 'companyId is required unless includeAllCompanies is enabled');
  }

  const [userRows, superAdminRows] = input.includeAllCompanies
    ? await Promise.all([
        masterDb('users')
          .where('users.is_active', true)
          .select(
            'users.id',
            'users.email',
            'users.first_name',
            'users.last_name',
            'users.avatar_url',
          ),
        masterDb('super_admins').select('email'),
      ])
    : await Promise.all([
        masterDb('user_company_access as uca')
          .join('users', 'uca.user_id', 'users.id')
          .where('uca.company_id', input.companyId)
          .andWhere('uca.is_active', true)
          .andWhere('users.is_active', true)
          .select(
            'users.id',
            'users.email',
            'users.first_name',
            'users.last_name',
            'users.avatar_url',
          ),
        masterDb('super_admins').select('email'),
      ]);

  const typedUserRows = userRows as UserRow[];
  const typedSuperAdmins = superAdminRows as SuperAdminRow[];
  const superAdminEmails = new Set(typedSuperAdmins.map((row) => String(row.email).toLowerCase()));

  const filteredUsers = typedUserRows.filter(
    (row) => !superAdminEmails.has(String(row.email).toLowerCase()),
  );

  if (filteredUsers.length === 0) {
    return { management: [], service_crew: [], other: [] };
  }

  const userIds = filteredUsers.map((row) => String(row.id));

  // Fetch highest-priority role for each user
  const userRoleRows = (await masterDb('user_roles as ur')
    .join('roles as r', 'ur.role_id', 'r.id')
    .whereIn('ur.user_id', userIds)
    .select('ur.user_id', 'r.name', 'r.priority')
    .orderBy('r.priority', 'desc')) as UserRoleRow[];

  // Build a map of userId → highest-priority role name
  const userTopRoleMap = new Map<string, string>();
  for (const row of userRoleRows) {
    const userId = String(row.user_id);
    if (!userTopRoleMap.has(userId)) userTopRoleMap.set(userId, String(row.name));
  }

  const management: GroupedUsersResponse['management'] = [];
  const service_crew: GroupedUsersResponse['service_crew'] = [];
  const other: GroupedUsersResponse['other'] = [];

  for (const row of filteredUsers) {
    const userId = String(row.id);
    const topRole = userTopRoleMap.get(userId);
    const entry = {
      id: userId,
      name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
      avatar_url: (row.avatar_url as string | null) ?? null,
    };

    if (topRole === SYSTEM_ROLES.MANAGEMENT || topRole === SYSTEM_ROLES.ADMINISTRATOR) {
      management.push(entry);
    } else if (topRole === SYSTEM_ROLES.SERVICE_CREW) {
      service_crew.push(entry);
    } else {
      other.push(entry);
    }
  }

  return { management, service_crew, other };
}
