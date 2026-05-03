import type {
  AicRecord,
  AicProduct,
  AicMessage,
  AicReaction,
  AicAttachment,
  AicMention,
} from '@omnilert/shared';
import type { Knex } from 'knex';
import { PERMISSIONS, SYSTEM_ROLES } from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAndDispatchNotification } from './notification.service.js';
import { buildTenantStoragePrefix, deleteFile, uploadFile } from './storage.service.js';
import {
  hydrateUsersByIds,
  resolveCompanyUsersWithPermission,
  resolveRolesWithPermission,
  userHasCompanyAccess,
} from './globalUser.service.js';
import type { GlobalUser } from './globalUser.service.js';
import { logger } from '../utils/logger.js';
import * as violationNoticeService from './violationNotice.service.js';
import { env } from '../config/env.js';
import { emitAicEvent } from './aicVarianceWebhook.service.js';

// ─── Internal row types ───────────────────────────────────────────────────────

type AicRecordRow = {
  id: string;
  aic_number: number;
  reference: string;
  company_id: string;
  branch_id: string | null;
  aic_date: Date | string;
  status: 'open' | 'resolved';
  summary: string | null;
  resolution: string | null;
  vn_requested: boolean;
  linked_vn_id: string | null;
  resolved_by: string | null;
  resolved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type AicParticipantRow = {
  aic_record_id: string;
  user_id: string;
  is_joined: boolean;
  is_muted: boolean;
  last_read_at: Date | string | null;
};

type AicMessageRow = {
  id: string;
  aic_record_id: string;
  user_id: string | null;
  content: string;
  is_system: boolean;
  is_deleted: boolean;
  is_edited: boolean;
  parent_message_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type MentionableUser = { id: string; name: string; avatar_url: string | null };
type MentionableRole = { id: string; name: string; color: string | null };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitUpdated(companyId: string, aicId: string): void {
  emitAicEvent('aic-variance:updated', companyId, { id: aicId });
}

async function getRecordOrThrow(aicId: string): Promise<AicRecordRow> {
  const row = await db.getDb()('aic_records').where({ id: aicId }).first();
  if (!row) throw new AppError(404, 'AIC record not found');
  return row as AicRecordRow;
}

async function hasAicNotificationLink(input: {
  userId: string;
  companyId: string;
  aicId: string;
}): Promise<boolean> {
  const linkPrefix = `/aic-variance?aicId=${input.aicId}`;
  const row = await db
    .getDb()('employee_notifications')
    .where({
      user_id: input.userId,
      company_id: input.companyId,
    })
    .andWhere((query) => {
      query.where('link_url', linkPrefix).orWhere('link_url', 'like', `${linkPrefix}&%`);
    })
    .first('id');

  return Boolean(row);
}

export async function upsertParticipant(
  aicId: string,
  userId: string,
  patch: Partial<Pick<AicParticipantRow, 'is_joined' | 'is_muted' | 'last_read_at'>>,
  trx?: Knex.Transaction,
): Promise<void> {
  const knex = trx ?? db.getDb();
  const existing = await knex('aic_participants')
    .where({ aic_record_id: aicId, user_id: userId })
    .first();
  const next = {
    is_joined: patch.is_joined ?? existing?.is_joined ?? false,
    is_muted: patch.is_muted ?? existing?.is_muted ?? false,
    last_read_at: patch.last_read_at ?? existing?.last_read_at ?? null,
    updated_at: new Date(),
  };
  if (existing) {
    await knex('aic_participants').where({ aic_record_id: aicId, user_id: userId }).update(next);
  } else {
    await knex('aic_participants').insert({
      aic_record_id: aicId,
      user_id: userId,
      ...next,
      created_at: new Date(),
    });
  }
}

async function createSystemMessage(
  aicId: string,
  content: string,
  trx?: Knex.Transaction,
): Promise<void> {
  const knex = trx ?? db.getDb();
  await knex('aic_messages').insert({
    aic_record_id: aicId,
    content,
    is_system: true,
    created_at: new Date(),
    updated_at: new Date(),
  });
}

async function resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
  const usersMap = await hydrateUsersByIds(userIds);
  const map: Record<string, string> = {};
  for (const [id, u] of Object.entries(usersMap)) {
    map[id] = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Unknown';
  }
  return map;
}

function hasManagePermission(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.AIC_VARIANCE_MANAGE);
}

function isAdmin(roles: string[]): boolean {
  return roles.includes(SYSTEM_ROLES.ADMINISTRATOR);
}

function hasAllBranchAccess(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES);
}

async function canAccessRecordBranch(input: {
  row: AicRecordRow;
  userId: string;
  roles: string[];
  permissions: string[];
  userBranchIds: string[];
}): Promise<boolean> {
  if (isAdmin(input.roles)) return true;
  if (input.row.branch_id && input.userBranchIds.includes(input.row.branch_id)) return true;
  if (hasAllBranchAccess(input.permissions)) {
    return userHasCompanyAccess(input.userId, input.row.company_id);
  }
  return false;
}

async function resolveAllowedAicBranchIds(input: {
  requestedBranchIds: string[];
  userId: string;
  roles: string[];
  permissions: string[];
  userBranchIds: string[];
}): Promise<string[]> {
  if (input.requestedBranchIds.length === 0) return [];
  if (isAdmin(input.roles)) return input.requestedBranchIds;
  if (!hasAllBranchAccess(input.permissions)) {
    return input.requestedBranchIds.filter((id) => input.userBranchIds.includes(id));
  }

  const rows = await db
    .getDb()('branches as b')
    .join('user_company_access as uca', 'uca.company_id', 'b.company_id')
    .whereIn('b.id', input.requestedBranchIds)
    .where('uca.user_id', input.userId)
    .where('uca.is_active', true)
    .where('b.is_active', true)
    .select('b.id');

  return rows.map((row: any) => String(row.id));
}

// ─── Message decorations ──────────────────────────────────────────────────────

async function resolveMessageDecorations(messageIds: string[]): Promise<{
  reactionsByMessage: Map<string, AicReaction[]>;
  attachmentsByMessage: Map<string, AicAttachment[]>;
  mentionsByMessage: Map<string, AicMention[]>;
}> {
  if (messageIds.length === 0) {
    return {
      reactionsByMessage: new Map(),
      attachmentsByMessage: new Map(),
      mentionsByMessage: new Map(),
    };
  }

  const [reactionRows, attachmentRows, mentionRows] = await Promise.all([
    db.getDb()('aic_message_reactions').whereIn('message_id', messageIds).select('*'),
    db.getDb()('aic_message_attachments').whereIn('message_id', messageIds).select('*'),
    db
      .getDb()('aic_message_mentions as m')
      .leftJoin('users as u', 'm.mentioned_user_id', 'u.id')
      .leftJoin('roles as r', 'm.mentioned_role_id', 'r.id')
      .whereIn('m.message_id', messageIds)
      .select('m.*', 'u.first_name', 'u.last_name', 'r.name as role_name'),
  ]);

  const reactionUserNames = await resolveUserNames(
    reactionRows.map((r: any) => String(r.user_id)),
  );

  const reactionsGrouped = new Map<string, Map<string, Array<{ id: string; name: string }>>>();
  for (const row of reactionRows as any[]) {
    const msgId = String(row.message_id);
    const byEmoji = reactionsGrouped.get(msgId) ?? new Map();
    const users = byEmoji.get(String(row.emoji)) ?? [];
    users.push({ id: String(row.user_id), name: reactionUserNames[String(row.user_id)] ?? 'Unknown' });
    byEmoji.set(String(row.emoji), users);
    reactionsGrouped.set(msgId, byEmoji);
  }

  const reactionsByMessage = new Map<string, AicReaction[]>();
  for (const [msgId, byEmoji] of reactionsGrouped.entries()) {
    reactionsByMessage.set(msgId, Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, users })));
  }

  const attachmentsByMessage = new Map<string, AicAttachment[]>();
  for (const row of attachmentRows as any[]) {
    if (!row.message_id) continue;
    const list = attachmentsByMessage.get(String(row.message_id)) ?? [];
    list.push({
      id: String(row.id),
      file_url: String(row.file_url),
      file_name: String(row.file_name),
      file_size: Number(row.file_size),
      content_type: String(row.content_type),
    });
    attachmentsByMessage.set(String(row.message_id), list);
  }

  const mentionsByMessage = new Map<string, AicMention[]>();
  for (const row of mentionRows as any[]) {
    const msgId = String(row.message_id);
    const list = mentionsByMessage.get(msgId) ?? [];
    list.push({
      mentioned_user_id: row.mentioned_user_id ? String(row.mentioned_user_id) : null,
      mentioned_role_id: row.mentioned_role_id ? String(row.mentioned_role_id) : null,
      mentioned_name: row.mentioned_user_id
        ? [row.first_name, row.last_name].filter(Boolean).join(' ')
        : row.role_name ?? null,
    });
    mentionsByMessage.set(msgId, list);
  }

  return { reactionsByMessage, attachmentsByMessage, mentionsByMessage };
}

async function enrichMessages(rows: AicMessageRow[]): Promise<AicMessage[]> {
  const ids = rows.map((r) => r.id);
  const userIds = rows.map((r) => r.user_id).filter(Boolean) as string[];
  const [decorations, userNames, users] = await Promise.all([
    resolveMessageDecorations(ids),
    resolveUserNames(userIds),
    hydrateUsersByIds(userIds),
  ]);

  const avatarMap = new Map(Object.entries(users).map(([id, u]) => [id, u.avatar_url ?? null]));

  const messageMap = new Map(rows.map((r) => [r.id, r]));
  const parentIds = [...new Set(rows.map((r) => r.parent_message_id).filter(Boolean) as string[])];
  const missingParents = parentIds.filter((id) => !messageMap.has(id));
  if (missingParents.length > 0) {
    const extra = await db.getDb()('aic_messages').whereIn('id', missingParents).select('*');
    for (const r of extra as AicMessageRow[]) messageMap.set(r.id, r);
  }

  return rows
    .filter((r) => !r.parent_message_id)
    .map((r) => {
      const replies = rows
        .filter((m) => m.parent_message_id === r.id)
        .map((m) => buildMessage(m, decorations, userNames, avatarMap));
      return { ...buildMessage(r, decorations, userNames, avatarMap), replies };
    });
}

function buildMessage(
  row: AicMessageRow,
  decorations: {
    reactionsByMessage: Map<string, AicReaction[]>;
    attachmentsByMessage: Map<string, AicAttachment[]>;
    mentionsByMessage: Map<string, AicMention[]>;
  },
  userNames: Record<string, string>,
  avatarMap: Map<string, string | null>,
): AicMessage {
  return {
    id: row.id,
    aic_record_id: row.aic_record_id,
    user_id: row.user_id ?? null,
    user_name: row.user_id ? (userNames[row.user_id] ?? null) : null,
    user_avatar: row.user_id ? (avatarMap.get(row.user_id) ?? null) : null,
    content: row.content,
    is_system: row.is_system,
    is_deleted: row.is_deleted,
    is_edited: row.is_edited,
    parent_message_id: row.parent_message_id,
    reactions: decorations.reactionsByMessage.get(row.id) ?? [],
    attachments: decorations.attachmentsByMessage.get(row.id) ?? [],
    mentions: decorations.mentionsByMessage.get(row.id) ?? [],
    created_at: new Date(row.created_at).toISOString(),
  };
}

// ─── AI Summary ───────────────────────────────────────────────────────────────

async function generateAicSummaryWithAI(input: {
  reference: string;
  messages: { userName: string; content: string; createdAt: string }[];
}): Promise<{ summary: string; resolution: string }> {
  const FALLBACK = {
    summary: 'Inventory variance detected and reviewed.',
    resolution: 'Not explicitly documented in the discussion.',
  };

  const transcript =
    input.messages.length === 0
      ? '(No discussion messages were recorded for this AIC record.)'
      : input.messages
          .map(
            (m) =>
              `[${new Date(m.createdAt).toLocaleString('en-PH')}] ${m.userName}: ${m.content}`,
          )
          .join('\n');

  const systemPrompt = `You are a concise inventory analyst for a Philippine-based operations team. Given an inventory count reference and a discussion transcript, produce exactly two labeled sections:

**Summary:** [2-3 sentences describing what the inventory variance was about and its context]
**Resolution:** [2-3 sentences describing how the variance was addressed or resolved]

Rules:
- Write in plain, conversational English. Avoid formal or complex words.
- Use evidence from the discussion; if absent, write "Not explicitly documented in the discussion."
- No markdown beyond the two bold labels. No preamble. No extra sections.`;

  const userContent = `Reference: ${input.reference}\n\nDiscussion:\n${transcript}`;

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'OpenAI-Organization': env.OPENAI_ORGANIZATION_ID,
        'OpenAI-Project': env.OPENAI_PROJECT_ID,
      },
      body: JSON.stringify({
        model: 'gpt-4.1',
        max_output_tokens: 600,
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
      }),
    });

    if (!response.ok) return FALLBACK;

    const payload = (await response.json()) as any;
    const text: string =
      payload.output_text ??
      ((payload.output as any[]) ?? [])
        .flatMap((o: any) => o.content ?? [])
        .filter((c: any) => c.type === 'output_text' || c.type === 'text')
        .map((c: any) => c.text as string)
        .join('');

    const trimmed = text.trim();
    if (!trimmed) return FALLBACK;

    const summaryMatch = trimmed.match(/\*\*Summary:\*\*\s*([\s\S]*?)(?=\*\*Resolution:\*\*|$)/);
    const resolutionMatch = trimmed.match(/\*\*Resolution:\*\*\s*([\s\S]*?)$/);

    return {
      summary: summaryMatch?.[1]?.trim() ?? FALLBACK.summary,
      resolution: resolutionMatch?.[1]?.trim() ?? FALLBACK.resolution,
    };
  } catch {
    return FALLBACK;
  }
}

// ─── Notification helpers ─────────────────────────────────────────────────────

async function notifyMentionedUsers(input: {
  companyId: string;
  aicId: string;
  messageId: string;
  senderId: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
  excludedUserIds: string[];
}): Promise<void> {
  const targetUserIds = new Set<string>(input.mentionedUserIds);

  if (input.mentionedRoleIds.length > 0) {
    const roleMentionUsers = await db
      .getDb()('user_roles as ur')
      .join('user_company_access as uca', 'ur.user_id', 'uca.user_id')
      .join('users', 'ur.user_id', 'users.id')
      .whereIn('ur.role_id', input.mentionedRoleIds)
      .andWhere('uca.company_id', input.companyId)
      .andWhere('uca.is_active', true)
      .andWhere('users.is_active', true)
      .select('users.id');
    for (const u of roleMentionUsers as any[]) targetUserIds.add(String(u.id));
  }

  targetUserIds.delete(input.senderId);
  for (const id of input.excludedUserIds) targetUserIds.delete(id);

  if (targetUserIds.size === 0) return;

  const participants = await db
    .getDb()('aic_participants')
    .whereIn('user_id', [...targetUserIds])
    .andWhere({ aic_record_id: input.aicId })
    .select('user_id', 'is_muted');

  const mutedSet = new Set(
    participants.filter((p: any) => p.is_muted).map((p: any) => String(p.user_id)),
  );

  const senderNames = await resolveUserNames([input.senderId]);
  const senderName = senderNames[input.senderId] ?? 'Someone';

  await Promise.all(
    [...targetUserIds].map(async (userId) => {
      await upsertParticipant(input.aicId, userId, { is_joined: true });
      if (mutedSet.has(userId)) return;
      await createAndDispatchNotification({
        userId,
        companyId: input.companyId,
        title: 'AIC Variance Mention',
        message: `${senderName} mentioned you in an AIC variance discussion.`,
        type: 'info',
        linkUrl: `/aic-variance?aicId=${input.aicId}&messageId=${input.messageId}`,
      });
    }),
  );
}

async function notifyReplyRecipient(input: {
  companyId: string;
  aicId: string;
  messageId: string;
  senderId: string;
  parentMessage: AicMessageRow | null;
}): Promise<string[]> {
  if (!input.parentMessage) return [];
  const recipientId = input.parentMessage.user_id;
  if (!recipientId || recipientId === input.senderId) return [];

  const participant = await db
    .getDb()('aic_participants')
    .where({ aic_record_id: input.aicId, user_id: recipientId })
    .first();
  if (participant?.is_muted) return [];

  await upsertParticipant(input.aicId, recipientId, { is_joined: true });

  const senderNames = await resolveUserNames([input.senderId]);
  await createAndDispatchNotification({
    userId: recipientId,
    companyId: input.companyId,
    title: 'AIC Variance Reply',
    message: `${senderNames[input.senderId] ?? 'Someone'} replied to your message.`,
    type: 'info',
    linkUrl: `/aic-variance?aicId=${input.aicId}&messageId=${input.messageId}`,
  });

  return [recipientId];
}

// ─── Enrich record ────────────────────────────────────────────────────────────

async function enrichRecord(row: AicRecordRow, userId: string): Promise<AicRecord> {
  const participant = await db.getDb()('aic_participants').where({ aic_record_id: row.id, user_id: userId }).first();

  const [productCount, messageCount, unreadData, branchRow, companyRow, resolvedByMap] =
    await Promise.all([
      db.getDb()('aic_products').where({ aic_record_id: row.id }).count('id as count').first(),
      db
        .getDb()('aic_messages')
        .where({ aic_record_id: row.id, is_deleted: false, is_system: false })
        .count('id as count')
        .first(),
      participant
        ? db
            .getDb()('aic_messages')
            .where({ aic_record_id: row.id, is_deleted: false, is_system: false })
            .where('created_at', '>', participant.last_read_at ?? new Date(0))
            .count('id as count')
            .first()
        : Promise.resolve({ count: 0 }),
      row.branch_id
        ? db.getDb()('branches').where({ id: row.branch_id }).first('name')
        : Promise.resolve(null),
      db.getDb()('companies').where({ id: row.company_id }).first('name'),
      row.resolved_by
        ? hydrateUsersByIds([row.resolved_by])
        : Promise.resolve({} as Record<string, Partial<GlobalUser>>),
    ]);

  const resolvedByUser = row.resolved_by ? resolvedByMap[row.resolved_by] ?? null : null;

  return {
    id: row.id,
    aic_number: row.aic_number,
    reference: row.reference,
    company_id: row.company_id,
    company_name: companyRow?.name ?? null,
    branch_id: row.branch_id,
    branch_name: branchRow?.name ?? null,
    aic_date: new Date(row.aic_date).toISOString().split('T')[0]!,
    status: row.status,
    summary: row.summary,
    resolution: row.resolution,
    vn_requested: row.vn_requested,
    linked_vn_id: row.linked_vn_id,
    resolved_by: row.resolved_by,
    resolved_by_name: resolvedByUser
      ? [resolvedByUser.first_name, resolvedByUser.last_name].filter(Boolean).join(' ')
      : null,
    resolved_at: row.resolved_at ? new Date(row.resolved_at).toISOString() : null,
    product_count: Number((productCount as any)?.count ?? 0),
    message_count: Number((messageCount as any)?.count ?? 0),
    unread_count: Number((unreadData as any)?.count ?? 0),
    unread_reply_count: 0,
    is_joined: participant?.is_joined ?? false,
    is_muted: participant?.is_muted ?? false,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function listAicRecords(input: {
  companyId: string;
  userId: string;
  roles: string[];
  permissions: string[];
  userBranchIds: string[];
  branchIds?: string[];
  status?: 'open' | 'resolved';
  search?: string;
  date_from?: string;
  date_to?: string;
  sort_order?: 'asc' | 'desc';
}): Promise<AicRecord[]> {
  const requestedBranchIds = Array.from(new Set((input.branchIds ?? []).filter(Boolean)));
  const query = db.getDb()('aic_records as ar');

  if (requestedBranchIds.length > 0) {
    const allowedBranchIds = await resolveAllowedAicBranchIds({
      requestedBranchIds,
      userId: input.userId,
      roles: input.roles,
      permissions: input.permissions,
      userBranchIds: input.userBranchIds,
    });

    if (allowedBranchIds.length === 0) return [];
    query.whereIn('ar.branch_id', allowedBranchIds);
  } else {
    query.where('ar.company_id', input.companyId);
  }

  if (!isAdmin(input.roles)) {
    query.whereExists(
      db
        .getDb()('aic_participants as p')
        .whereRaw('p.aic_record_id = ar.id')
        .where('p.user_id', input.userId)
        .where('p.is_joined', true),
    );
  }

  if (input.status) query.where('ar.status', input.status);
  if (input.search) {
    query.where((q) => {
      q.whereILike('ar.reference', `%${input.search}%`).orWhereRaw(
        "CAST(ar.aic_number AS TEXT) LIKE ?",
        [`%${input.search}%`],
      );
    });
  }
  if (input.date_from) query.where('ar.aic_date', '>=', input.date_from);
  if (input.date_to) query.where('ar.aic_date', '<=', input.date_to);

  query.orderBy('ar.aic_number', input.sort_order ?? 'desc');

  const rows = (await query.select('ar.*')) as AicRecordRow[];
  return Promise.all(rows.map((r) => enrichRecord(r, input.userId)));
}

export async function getAicRecord(input: {
  companyId: string;
  userId: string;
  aicId: string;
  roles: string[];
  permissions: string[];
  userBranchIds: string[];
}): Promise<AicRecord & { products: AicProduct[] }> {
  const row = await getRecordOrThrow(input.aicId);
  if (row.company_id !== input.companyId) {
    const canAccessBranch = await canAccessRecordBranch({
      row,
      userId: input.userId,
      roles: input.roles,
      permissions: input.permissions,
      userBranchIds: input.userBranchIds,
    });
    if (!canAccessBranch) throw new AppError(404, 'AIC record not found');
  }

  if (!isAdmin(input.roles)) {
    const participant = await db
      .getDb()('aic_participants')
      .where({ aic_record_id: input.aicId, user_id: input.userId, is_joined: true })
      .first();
    if (!participant) {
      const hasNotificationLink = await hasAicNotificationLink({
        userId: input.userId,
        companyId: row.company_id,
        aicId: input.aicId,
      });
      if (!hasNotificationLink) throw new AppError(403, 'You are not a participant of this AIC record');
    }
  }

  await upsertParticipant(input.aicId, input.userId, {
    last_read_at: new Date(),
    is_joined: true,
  });

  const [record, products] = await Promise.all([
    enrichRecord(row, input.userId),
    db.getDb()('aic_products').where({ aic_record_id: input.aicId }).select('*'),
  ]);

  return {
    ...record,
    products: (products as any[]).map((p) => ({
      id: String(p.id),
      aic_record_id: String(p.aic_record_id),
      odoo_product_tmpl_id: Number(p.odoo_product_tmpl_id),
      product_name: String(p.product_name),
      quantity: Number(p.quantity),
      uom_name: String(p.uom_name),
      flag_type: p.flag_type as 'threshold_violation' | 'invalid_threshold',
      discrepancy_direction: (p.discrepancy_direction ?? 'neutral') as 'negative' | 'positive' | 'neutral',
      created_at: new Date(p.created_at).toISOString(),
    })),
  };
}

export async function getMentionables(companyId: string): Promise<{
  users: MentionableUser[];
  roles: MentionableRole[];
}> {
  const [users, rolesRaw] = await Promise.all([
    resolveCompanyUsersWithPermission(companyId, PERMISSIONS.AIC_VARIANCE_VIEW),
    resolveRolesWithPermission(PERMISSIONS.AIC_VARIANCE_VIEW),
  ]);

  return {
    users,
    roles: rolesRaw.map((r: any) => ({ id: String(r.id), name: String(r.name), color: r.color ?? null })),
  };
}

export async function resolveAicRecord(input: {
  companyId: string;
  userId: string;
  aicId: string;
}): Promise<AicRecord & { products: AicProduct[] }> {
  const current = await getRecordOrThrow(input.aicId);
  if (current.company_id !== input.companyId) throw new AppError(404, 'AIC record not found');
  if (current.status === 'resolved') throw new AppError(409, 'AIC record is already resolved');

  const rawMessages = await db
    .getDb()('aic_messages as m')
    .leftJoin('users as u', 'm.user_id', 'u.id')
    .where('m.aic_record_id', input.aicId)
    .where('m.is_system', false)
    .where('m.is_deleted', false)
    .orderBy('m.created_at', 'asc')
    .select<{ content: string; created_at: Date | string; first_name: string | null; last_name: string | null }[]>(
      'm.content',
      'm.created_at',
      'u.first_name',
      'u.last_name',
    );

  const messages = rawMessages.map((r) => ({
    userName: [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
    content: r.content,
    createdAt: new Date(r.created_at).toISOString(),
  }));

  const { summary, resolution } = await generateAicSummaryWithAI({
    reference: current.reference,
    messages,
  });

  const userNames = await resolveUserNames([input.userId]);
  await db.getDb().transaction(async (trx) => {
    await trx('aic_records').where({ id: input.aicId }).update({
      status: 'resolved',
      summary,
      resolution,
      resolved_by: input.userId,
      resolved_at: new Date(),
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.aicId,
      `${userNames[input.userId] ?? 'Someone'} marked this AIC record as resolved`,
      trx,
    );
  });

  emitUpdated(input.companyId, input.aicId);
  return getAicRecord({
    companyId: input.companyId,
    userId: input.userId,
    aicId: input.aicId,
    roles: [],
    permissions: [],
    userBranchIds: [],
  });
}

export async function requestViolationNotice(input: {
  companyId: string;
  userId: string;
  aicId: string;
  description: string;
  targetUserIds: string[];
}): Promise<AicRecord & { products: AicProduct[] }> {
  const current = await getRecordOrThrow(input.aicId);
  if (current.company_id !== input.companyId) throw new AppError(404, 'AIC record not found');

  const vn = await violationNoticeService.createViolationNotice({
    companyId: input.companyId,
    userId: input.userId,
    description: input.description,
    targetUserIds: input.targetUserIds,
    branchId: current.branch_id ?? undefined,
    category: 'aic_variance',
    sourceAicRecordId: input.aicId,
  });

  const userNames = await resolveUserNames([input.userId]);
  await db.getDb().transaction(async (trx) => {
    await trx('aic_records').where({ id: input.aicId }).update({
      vn_requested: true,
      linked_vn_id: vn.id,
      updated_at: new Date(),
    });
    await createSystemMessage(
      input.aicId,
      `${userNames[input.userId] ?? 'Someone'} requested a Violation Notice`,
      trx,
    );
  });

  emitUpdated(input.companyId, input.aicId);
  return getAicRecord({
    companyId: input.companyId,
    userId: input.userId,
    aicId: input.aicId,
    roles: [],
    permissions: [],
    userBranchIds: [],
  });
}

export async function leaveAicDiscussion(input: {
  aicId: string;
  userId: string;
}): Promise<void> {
  await upsertParticipant(input.aicId, input.userId, { is_joined: false });
}

export async function muteAicDiscussion(input: {
  aicId: string;
  userId: string;
}): Promise<{ is_muted: boolean }> {
  const participant = await db
    .getDb()('aic_participants')
    .where({ aic_record_id: input.aicId, user_id: input.userId })
    .first();
  const nextMuted = !(participant?.is_muted ?? false);
  await upsertParticipant(input.aicId, input.userId, { is_muted: nextMuted });
  return { is_muted: nextMuted };
}

export async function markAicRead(input: { aicId: string; userId: string }): Promise<void> {
  await upsertParticipant(input.aicId, input.userId, { last_read_at: new Date() });
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function listMessages(input: {
  companyId: string;
  aicId: string;
}): Promise<AicMessage[]> {
  const rows = (await db
    .getDb()('aic_messages')
    .where({ aic_record_id: input.aicId })
    .where('is_deleted', false)
    .orderBy('created_at', 'asc')
    .select('*')) as AicMessageRow[];
  return enrichMessages(rows);
}

export async function sendMessage(input: {
  companyId: string;
  aicId: string;
  userId: string;
  content: string;
  parentMessageId?: string | null;
  mentionedUserIds?: string[];
  mentionedRoleIds?: string[];
  files?: Express.Multer.File[];
}): Promise<AicMessage[]> {
  const record = await getRecordOrThrow(input.aicId);
  if (record.company_id !== input.companyId) throw new AppError(404, 'AIC record not found');

  let parentMessage: AicMessageRow | null = null;
  if (input.parentMessageId) {
    parentMessage =
      ((await db.getDb()('aic_messages').where({ id: input.parentMessageId }).first()) as AicMessageRow) ?? null;
  }

  const [messageRow] = await db.getDb()('aic_messages').insert({
    aic_record_id: input.aicId,
    user_id: input.userId,
    content: input.content,
    parent_message_id: input.parentMessageId ?? null,
    created_at: new Date(),
    updated_at: new Date(),
  }).returning('*') as AicMessageRow[];

  await upsertParticipant(input.aicId, input.userId, { is_joined: true, last_read_at: new Date() });

  if (input.mentionedUserIds?.length || input.mentionedRoleIds?.length) {
    await db.getDb()('aic_message_mentions').insert([
      ...(input.mentionedUserIds ?? []).map((uid) => ({
        message_id: messageRow.id,
        mentioned_user_id: uid,
        mentioned_role_id: null,
      })),
      ...(input.mentionedRoleIds ?? []).map((rid) => ({
        message_id: messageRow.id,
        mentioned_user_id: null,
        mentioned_role_id: rid,
      })),
    ]);
  }

  if (input.files?.length) {
    const storagePrefix = buildTenantStoragePrefix(input.companyId);
    await Promise.all(
      input.files.map(async (file) => {
        const folder = `${storagePrefix}/aic-messages/${messageRow.id}`;
        const fileUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folder);
        if (!fileUrl) throw new AppError(500, 'Failed to upload message attachment');
        await db.getDb()('aic_message_attachments').insert({
          message_id: messageRow.id,
          aic_record_id: input.aicId,
          file_url: fileUrl,
          file_name: file.originalname,
          file_size: file.size,
          content_type: file.mimetype,
        });
      }),
    );
  }

  await db.getDb()('aic_records').where({ id: input.aicId }).update({ updated_at: new Date() });

  const replyNotified = await notifyReplyRecipient({
    companyId: input.companyId,
    aicId: input.aicId,
    messageId: messageRow.id,
    senderId: input.userId,
    parentMessage,
  });

  if (input.mentionedUserIds?.length || input.mentionedRoleIds?.length) {
    await notifyMentionedUsers({
      companyId: input.companyId,
      aicId: input.aicId,
      messageId: messageRow.id,
      senderId: input.userId,
      mentionedUserIds: input.mentionedUserIds ?? [],
      mentionedRoleIds: input.mentionedRoleIds ?? [],
      excludedUserIds: replyNotified,
    });
  }

  emitAicEvent('aic-variance:message', input.companyId, { aicId: input.aicId, messageId: messageRow.id });
  return listMessages({ companyId: input.companyId, aicId: input.aicId });
}

export async function editMessage(input: {
  companyId: string;
  aicId: string;
  userId: string;
  messageId: string;
  content: string;
  permissions: string[];
}): Promise<void> {
  const msg = await db.getDb()('aic_messages').where({ id: input.messageId, aic_record_id: input.aicId }).first() as AicMessageRow | undefined;
  if (!msg) throw new AppError(404, 'Message not found');
  if (msg.user_id !== input.userId && !hasManagePermission(input.permissions)) {
    throw new AppError(403, 'Cannot edit this message');
  }
  await db.getDb()('aic_messages').where({ id: input.messageId }).update({
    content: input.content,
    is_edited: true,
    updated_at: new Date(),
  });
  emitAicEvent('aic-variance:message', input.companyId, { aicId: input.aicId, messageId: input.messageId });
}

export async function deleteMessage(input: {
  companyId: string;
  aicId: string;
  userId: string;
  messageId: string;
  permissions: string[];
}): Promise<void> {
  const msg = await db.getDb()('aic_messages').where({ id: input.messageId, aic_record_id: input.aicId }).first() as AicMessageRow | undefined;
  if (!msg) throw new AppError(404, 'Message not found');
  if (msg.user_id !== input.userId && !hasManagePermission(input.permissions)) {
    throw new AppError(403, 'Cannot delete this message');
  }
  await db.getDb()('aic_messages').where({ id: input.messageId }).update({ is_deleted: true, updated_at: new Date() });
  emitAicEvent('aic-variance:message', input.companyId, { aicId: input.aicId, messageId: input.messageId });
}

export async function toggleReaction(input: {
  companyId: string;
  aicId: string;
  userId: string;
  messageId: string;
  emoji: string;
}): Promise<void> {
  const existing = await db
    .getDb()('aic_message_reactions')
    .where({ message_id: input.messageId, user_id: input.userId, emoji: input.emoji })
    .first();

  if (existing) {
    await db.getDb()('aic_message_reactions').where({ id: existing.id }).delete();
  } else {
    await db.getDb()('aic_message_reactions').insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    });
  }

  emitAicEvent('aic-variance:reaction', input.companyId, { aicId: input.aicId, messageId: input.messageId });
}

export async function uploadAttachment(input: {
  companyId: string;
  aicId: string;
  userId: string;
  file: Express.Multer.File;
}): Promise<AicAttachment> {
  const storagePrefix = buildTenantStoragePrefix(input.companyId);
  const folder = `${storagePrefix}/aic-attachments/${input.aicId}`;
  const fileUrl = await uploadFile(input.file.buffer, input.file.originalname, input.file.mimetype, folder);
  if (!fileUrl) throw new AppError(500, 'Failed to upload attachment');
  const [row] = await db.getDb()('aic_message_attachments').insert({
    aic_record_id: input.aicId,
    file_url: fileUrl,
    file_name: input.file.originalname,
    file_size: input.file.size,
    content_type: input.file.mimetype,
  }).returning('*');

  emitAicEvent('aic-variance:updated', input.companyId, { id: input.aicId });
  return {
    id: String(row.id),
    file_url: fileUrl,
    file_name: input.file.originalname,
    file_size: input.file.size,
    content_type: input.file.mimetype,
  };
}

export async function deleteAttachment(input: {
  companyId: string;
  aicId: string;
  attachmentId: string;
}): Promise<void> {
  const row = await db
    .getDb()('aic_message_attachments')
    .where({ id: input.attachmentId, aic_record_id: input.aicId })
    .first();
  if (!row) throw new AppError(404, 'Attachment not found');
  await deleteFile(row.file_url);
  await db.getDb()('aic_message_attachments').where({ id: input.attachmentId }).delete();
  emitAicEvent('aic-variance:updated', input.companyId, { id: input.aicId });
}
