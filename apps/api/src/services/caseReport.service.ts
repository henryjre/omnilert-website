import type { Knex } from 'knex';
import type {
  CaseAttachment,
  CaseMessage,
  CaseMention,
  CaseReaction,
  CaseReport,
} from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { createAndDispatchNotification } from './notification.service.js';
import { buildTenantStoragePrefix, uploadFile } from './storage.service.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { logger } from '../utils/logger.js';

type CaseReportRow = {
  id: string;
  case_number: number;
  title: string;
  description: string;
  status: 'open' | 'closed';
  corrective_action: string | null;
  resolution: string | null;
  vn_requested: boolean;
  created_by: string;
  closed_by: string | null;
  closed_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CaseParticipantRow = {
  case_id: string;
  user_id: string;
  is_joined: boolean;
  is_muted: boolean;
  last_read_at: Date | string | null;
};

type CaseMessageRow = {
  id: string;
  case_id: string;
  user_id: string;
  content: string;
  is_system: boolean;
  parent_message_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type CaseAttachmentRow = {
  id: string;
  case_id: string;
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

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return new Date(value).toISOString();
}

function ensureNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new AppError(400, `${label} is required`);
  return trimmed;
}

function hasManagePermission(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.CASE_REPORT_MANAGE);
}

function normalizeSortOrder(value?: string): 'asc' | 'desc' {
  return value === 'asc' ? 'asc' : 'desc';
}

function isAllowedMessageAttachment(contentType: string): boolean {
  return contentType.startsWith('image/')
    || [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ].includes(contentType);
}

function emitCaseReportEvent(event: string, companyId: string, payload: unknown): void {
  try {
    (getIO().of('/case-reports').to(`company:${companyId}`) as any).emit(event, payload);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for case report event');
  }
}

async function getCaseOrThrow(tenantDb: Knex, caseId: string): Promise<CaseReportRow> {
  const row = await tenantDb('case_reports').where({ id: caseId }).first();
  if (!row) throw new AppError(404, 'Case report not found');
  return row as CaseReportRow;
}

async function upsertParticipant(
  tenantDb: Knex,
  caseId: string,
  userId: string,
  patch: Partial<Pick<CaseParticipantRow, 'is_joined' | 'is_muted' | 'last_read_at'>>,
): Promise<void> {
  const existing = await tenantDb('case_participants').where({ case_id: caseId, user_id: userId }).first();
  const next = {
    is_joined: patch.is_joined ?? existing?.is_joined ?? true,
    is_muted: patch.is_muted ?? existing?.is_muted ?? false,
    last_read_at: patch.last_read_at ?? existing?.last_read_at ?? null,
    updated_at: new Date(),
  };

  if (existing) {
    await tenantDb('case_participants').where({ case_id: caseId, user_id: userId }).update(next);
    return;
  }

  await tenantDb('case_participants').insert({
    case_id: caseId,
    user_id: userId,
    ...next,
    created_at: new Date(),
  });
}

async function createSystemMessage(
  tenantDb: Knex,
  input: { caseId: string; userId: string; content: string },
): Promise<CaseMessageRow> {
  const [message] = await tenantDb('case_messages')
    .insert({
      case_id: input.caseId,
      user_id: input.userId,
      content: input.content,
      is_system: true,
    })
    .returning('*');
  return message as CaseMessageRow;
}

async function resolveUserNames(userIds: string[]): Promise<Record<string, string>> {
  const users = await hydrateUsersByIds(userIds);
  const map: Record<string, string> = {};
  for (const [id, user] of Object.entries(users)) {
    map[id] = `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || String(user.email ?? 'Unknown User');
  }
  return map;
}

async function resolveCompanyUsers(companyId: string): Promise<MentionableUser[]> {
  const rows = await db.getMasterDb()('user_company_access as uca')
    .join('users', 'uca.user_id', 'users.id')
    .where('uca.company_id', companyId)
    .andWhere('uca.is_active', true)
    .andWhere('users.is_active', true)
    .select('users.id', 'users.first_name', 'users.last_name', 'users.avatar_url')
    .orderBy('users.first_name', 'asc')
    .orderBy('users.last_name', 'asc');

  return rows.map((row: any) => ({
    id: String(row.id),
    name: `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim(),
    avatar_url: (row.avatar_url as string | null) ?? null,
  }));
}

async function resolveMessageDecorations(
  tenantDb: Knex,
  messageIds: string[],
): Promise<{
  reactionsByMessage: Map<string, CaseReaction[]>;
  attachmentsByMessage: Map<string, CaseAttachment[]>;
  mentionsByMessage: Map<string, CaseMention[]>;
}> {
  const [reactionRows, attachmentRows, mentionRows] = await Promise.all([
    messageIds.length > 0
      ? tenantDb('case_reactions').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
    messageIds.length > 0
      ? tenantDb('case_attachments').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
    messageIds.length > 0
      ? tenantDb('case_mentions').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
  ]);

  const reactionUserNames = await resolveUserNames(
    reactionRows.map((row: any) => String(row.user_id)),
  );

  const reactionsGrouped = new Map<string, Map<string, Array<{ id: string; name: string }>>>();
  for (const row of reactionRows as any[]) {
    const messageId = String(row.message_id);
    const byEmoji = reactionsGrouped.get(messageId) ?? new Map<string, Array<{ id: string; name: string }>>();
    const users = byEmoji.get(String(row.emoji)) ?? [];
    users.push({
      id: String(row.user_id),
      name: reactionUserNames[String(row.user_id)] ?? 'Unknown User',
    });
    byEmoji.set(String(row.emoji), users);
    reactionsGrouped.set(messageId, byEmoji);
  }

  const reactionsByMessage = new Map<string, CaseReaction[]>();
  for (const [messageId, byEmoji] of reactionsGrouped.entries()) {
    reactionsByMessage.set(
      messageId,
      Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, users })),
    );
  }

  const attachmentsByMessage = new Map<string, CaseAttachment[]>();
  for (const row of attachmentRows as CaseAttachmentRow[]) {
    if (!row.message_id) continue;
    const list = attachmentsByMessage.get(String(row.message_id)) ?? [];
    list.push({
      id: row.id,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      content_type: row.content_type,
    });
    attachmentsByMessage.set(String(row.message_id), list);
  }

  const mentionsByMessage = new Map<string, CaseMention[]>();
  for (const row of mentionRows as any[]) {
    const list = mentionsByMessage.get(String(row.message_id)) ?? [];
    list.push({
      mentioned_user_id: row.mentioned_user_id ? String(row.mentioned_user_id) : null,
      mentioned_role_id: row.mentioned_role_id ? String(row.mentioned_role_id) : null,
    });
    mentionsByMessage.set(String(row.message_id), list);
  }

  return { reactionsByMessage, attachmentsByMessage, mentionsByMessage };
}

async function buildCaseMessageTree(tenantDb: Knex, caseId: string): Promise<CaseMessage[]> {
  const rows = await tenantDb('case_messages').where({ case_id: caseId }).orderBy('created_at', 'asc').select('*');
  const messageRows = rows as CaseMessageRow[];
  const messageIds = messageRows.map((row) => row.id);
  const userMap = await hydrateUsersByIds(
    messageRows.filter((row) => !row.is_system).map((row) => row.user_id),
    ['id', 'first_name', 'last_name', 'avatar_url'],
  );
  const { reactionsByMessage, attachmentsByMessage, mentionsByMessage } = await resolveMessageDecorations(
    tenantDb,
    messageIds,
  );

  const items = new Map<string, CaseMessage>();
  const roots: CaseMessage[] = [];

  for (const row of messageRows) {
    const user = userMap[row.user_id];
    items.set(row.id, {
      id: row.id,
      case_id: row.case_id,
      user_id: row.user_id,
      user_name: row.is_system ? 'System' : `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || undefined,
      user_avatar: typeof user?.avatar_url === 'string' ? user.avatar_url : undefined,
      content: row.content,
      is_system: row.is_system,
      parent_message_id: row.parent_message_id,
      reactions: reactionsByMessage.get(row.id) ?? [],
      attachments: attachmentsByMessage.get(row.id) ?? [],
      mentions: mentionsByMessage.get(row.id) ?? [],
      replies: [],
      created_at: new Date(row.created_at).toISOString(),
      is_edited: new Date(row.updated_at) > new Date(row.created_at),
    });
  }

  for (const row of messageRows) {
    const current = items.get(row.id)!;
    if (row.parent_message_id && items.has(row.parent_message_id)) {
      items.get(row.parent_message_id)!.replies!.push(current);
    } else {
      roots.push(current);
    }
  }

  return roots;
}

async function enrichCaseReports(
  tenantDb: Knex,
  rows: CaseReportRow[],
  userId: string,
): Promise<CaseReport[]> {
  if (rows.length === 0) return [];

  const caseIds = rows.map((row) => row.id);
  const userIds = [
    ...new Set(rows.flatMap((row) => [row.created_by, row.closed_by].filter(Boolean) as string[])),
  ];

  const [participants, messageCounts, unreadCounts, userNames] = await Promise.all([
    tenantDb('case_participants')
      .whereIn('case_id', caseIds)
      .andWhere({ user_id: userId })
      .select('case_id', 'is_joined', 'is_muted', 'last_read_at'),
    tenantDb('case_messages')
      .whereIn('case_id', caseIds)
      .groupBy('case_id')
      .select('case_id')
      .count<{ count: string }[]>({ count: '*' }),
    tenantDb('case_participants as cp')
      .leftJoin('case_messages as cm', 'cp.case_id', 'cm.case_id')
      .where('cp.user_id', userId)
      .whereIn('cp.case_id', caseIds)
      .andWhere('cm.user_id', '!=', userId)
      .andWhere((builder) => {
        builder.whereNull('cp.last_read_at').orWhereRaw('cm.created_at > cp.last_read_at');
      })
      .groupBy('cp.case_id')
      .select('cp.case_id')
      .count<{ count: string }[]>({ count: 'cm.id' }),
    resolveUserNames(userIds),
  ]);

  const participantMap = new Map(
    participants.map((row: any) => [String(row.case_id), row as CaseParticipantRow]),
  );
  const messageCountMap = new Map(
    messageCounts.map((row: any) => [String(row.case_id), Number(row.count ?? 0)]),
  );
  const unreadCountMap = new Map(
    unreadCounts.map((row: any) => [String(row.case_id), Number(row.count ?? 0)]),
  );

  return rows.map((row) => {
    const participant = participantMap.get(row.id);
    return {
      id: row.id,
      case_number: row.case_number,
      title: row.title,
      description: row.description,
      status: row.status,
      corrective_action: row.corrective_action,
      resolution: row.resolution,
      vn_requested: row.vn_requested,
      created_by: row.created_by,
      created_by_name: userNames[row.created_by] ?? undefined,
      closed_by: row.closed_by,
      closed_by_name: row.closed_by ? userNames[row.closed_by] ?? undefined : undefined,
      closed_at: toIso(row.closed_at),
      message_count: messageCountMap.get(row.id) ?? 0,
      unread_count: unreadCountMap.get(row.id) ?? 0,
      is_joined: participant?.is_joined ?? false,
      is_muted: participant?.is_muted ?? false,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  });
}

async function assertCanMutateCase(
  tenantDb: Knex,
  caseId: string,
  permissions: string[],
): Promise<CaseReportRow> {
  const record = await getCaseOrThrow(tenantDb, caseId);
  if (record.status === 'closed' && !hasManagePermission(permissions)) {
    throw new AppError(403, 'This case is already closed');
  }
  return record;
}

async function maybeNotifyMentionedUsers(input: {
  tenantDb: Knex;
  companyId: string;
  caseId: string;
  senderId: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
}): Promise<void> {
  const masterDb = db.getMasterDb();
  const roleMentionUsers = input.mentionedRoleIds.length > 0
    ? await masterDb('user_roles as ur')
      .join('user_company_access as uca', 'ur.user_id', 'uca.user_id')
      .join('users', 'ur.user_id', 'users.id')
      .whereIn('ur.role_id', input.mentionedRoleIds)
      .andWhere('uca.company_id', input.companyId)
      .andWhere('uca.is_active', true)
      .andWhere('users.is_active', true)
      .select('users.id')
    : [];

  const targets = Array.from(new Set([
    ...input.mentionedUserIds,
    ...roleMentionUsers.map((row: any) => String(row.id)),
  ])).filter((id) => id !== input.senderId);

  if (targets.length === 0) return;

  const senderNames = await resolveUserNames([input.senderId]);
  const senderName = senderNames[input.senderId] ?? 'Someone';
  const participantRows = await input.tenantDb('case_participants')
    .whereIn('user_id', targets)
    .andWhere({ case_id: input.caseId })
    .select('user_id', 'is_muted');
  const participantMap = new Map(participantRows.map((row: any) => [String(row.user_id), row]));

  await Promise.all(
    targets.map(async (targetUserId) => {
      await upsertParticipant(input.tenantDb, input.caseId, targetUserId, { is_joined: true });
      if (participantMap.get(targetUserId)?.is_muted) return;
      await createAndDispatchNotification({
        tenantDb: input.tenantDb,
        userId: targetUserId,
        title: 'Case report mention',
        message: `${senderName} mentioned you in a case report`,
        type: 'info',
        linkUrl: `/case-reports?caseId=${input.caseId}`,
      });
    }),
  );
}

export async function listCaseReports(input: {
  tenantDb: Knex;
  userId: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: string;
  vnOnly?: boolean;
}): Promise<{ items: CaseReport[]; total: number }> {
  const query = input.tenantDb('case_reports');
  if (input.status && ['open', 'closed'].includes(input.status)) {
    query.where({ status: input.status });
  }
  if (input.search) {
    query.andWhere((builder) => {
      builder
        .whereILike('title', `%${input.search}%`)
        .orWhereILike('description', `%${input.search}%`)
        .orWhereRaw('CAST(case_number AS TEXT) ILIKE ?', [`%${input.search}%`]);
    });
  }
  if (input.dateFrom) {
    query.andWhere('created_at', '>=', new Date(input.dateFrom));
  }
  if (input.dateTo) {
    query.andWhere('created_at', '<=', new Date(input.dateTo));
  }
  if (input.vnOnly) {
    query.andWhere({ vn_requested: true });
  }

  const [countRow, rows] = await Promise.all([
    query.clone().count<{ count: string }>({ count: '*' }).first(),
    query.clone().orderBy('created_at', normalizeSortOrder(input.sortOrder)).select('*'),
  ]);

  const items = await enrichCaseReports(input.tenantDb, rows as CaseReportRow[], input.userId);
  return { items, total: Number(countRow?.count ?? 0) };
}

export async function getCaseReport(input: {
  tenantDb: Knex;
  userId: string;
  caseId: string;
  markRead?: boolean;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const record = await getCaseOrThrow(input.tenantDb, input.caseId);
  if (input.markRead) {
    await upsertParticipant(input.tenantDb, input.caseId, input.userId, {
      is_joined: true,
      last_read_at: new Date(),
    });
  }

  const [report] = await enrichCaseReports(input.tenantDb, [record], input.userId);
  const attachments = await input.tenantDb('case_attachments')
    .where({ case_id: input.caseId })
    .whereNull('message_id')
    .orderBy('created_at', 'desc')
    .select('*');

  return {
    ...report,
    attachments: (attachments as CaseAttachmentRow[]).map((row) => ({
      id: row.id,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      content_type: row.content_type,
    })),
  };
}

export async function createCaseReport(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  title: string;
  description: string;
}): Promise<CaseReport> {
  const title = ensureNonEmpty(input.title, 'Title');
  const description = ensureNonEmpty(input.description, 'Description');
  const userNames = await resolveUserNames([input.userId]);

  const report = await input.tenantDb.transaction(async (trx) => {
    const [created] = await trx('case_reports')
      .insert({ title, description, created_by: input.userId })
      .returning('*');
    await upsertParticipant(trx, created.id, input.userId, {
      is_joined: true,
      last_read_at: new Date(),
    });
    await createSystemMessage(trx, {
      caseId: created.id,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} created this case`,
    });
    return created as CaseReportRow;
  });

  emitCaseReportEvent('case-report:created', input.companyId, {
    id: report.id,
    caseNumber: report.case_number,
    title: report.title,
    status: report.status,
    createdBy: report.created_by,
  });

  const [enriched] = await enrichCaseReports(input.tenantDb, [report], input.userId);
  return enriched;
}

export async function updateCorrectiveAction(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  correctiveAction: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await assertCanMutateCase(input.tenantDb, input.caseId, input.permissions);
  const nextText = ensureNonEmpty(input.correctiveAction, 'Corrective action');
  const userNames = await resolveUserNames([input.userId]);
  const verb = current.corrective_action ? 'updated the corrective action' : 'added a corrective action';

  await input.tenantDb.transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      corrective_action: nextText,
      updated_at: new Date(),
    });
    await createSystemMessage(trx, {
      caseId: input.caseId,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} ${verb}`,
    });
  });

  emitCaseReportEvent('case-report:updated', input.companyId, {
    id: current.id,
    caseNumber: current.case_number,
    field: 'corrective_action',
  });
  return getCaseReport({ tenantDb: input.tenantDb, userId: input.userId, caseId: input.caseId });
}

export async function updateResolution(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  resolution: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await assertCanMutateCase(input.tenantDb, input.caseId, input.permissions);
  const nextText = ensureNonEmpty(input.resolution, 'Resolution');
  const userNames = await resolveUserNames([input.userId]);
  const verb = current.resolution ? 'updated the resolution' : 'added a resolution';

  await input.tenantDb.transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      resolution: nextText,
      updated_at: new Date(),
    });
    await createSystemMessage(trx, {
      caseId: input.caseId,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} ${verb}`,
    });
  });

  emitCaseReportEvent('case-report:updated', input.companyId, {
    id: current.id,
    caseNumber: current.case_number,
    field: 'resolution',
  });
  return getCaseReport({ tenantDb: input.tenantDb, userId: input.userId, caseId: input.caseId });
}

export async function closeCase(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  caseId: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await getCaseOrThrow(input.tenantDb, input.caseId);
  if (current.status === 'closed') throw new AppError(409, 'Case is already closed');
  if (!current.corrective_action || !current.resolution) {
    throw new AppError(400, 'Corrective action and resolution are required before closing');
  }

  const userNames = await resolveUserNames([input.userId]);
  await input.tenantDb.transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      status: 'closed',
      closed_by: input.userId,
      closed_at: new Date(),
      updated_at: new Date(),
    });
    await createSystemMessage(trx, {
      caseId: input.caseId,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} closed this case`,
    });
  });

  emitCaseReportEvent('case-report:updated', input.companyId, {
    id: current.id,
    caseNumber: current.case_number,
    field: 'status',
  });
  return getCaseReport({ tenantDb: input.tenantDb, userId: input.userId, caseId: input.caseId });
}

export async function requestViolationNotice(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  caseId: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await getCaseOrThrow(input.tenantDb, input.caseId);
  const userNames = await resolveUserNames([input.userId]);

  await input.tenantDb.transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      vn_requested: true,
      updated_at: new Date(),
    });
    await createSystemMessage(trx, {
      caseId: input.caseId,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} requested a Violation Notice`,
    });
  });

  emitCaseReportEvent('case-report:updated', input.companyId, {
    id: current.id,
    caseNumber: current.case_number,
    field: 'vn_requested',
  });
  return getCaseReport({ tenantDb: input.tenantDb, userId: input.userId, caseId: input.caseId });
}

export async function uploadAttachment(input: {
  tenantDb: Knex;
  companyId: string;
  companyStorageRoot: string;
  userId: string;
  caseId: string;
  file?: Express.Multer.File;
}): Promise<CaseAttachment> {
  if (!input.file) throw new AppError(400, 'Attachment file is required');
  if (input.file.mimetype !== 'application/pdf') throw new AppError(400, 'Only PDF files are allowed');
  if (input.file.size > 10 * 1024 * 1024) throw new AppError(400, 'File exceeds 10MB limit');

  const report = await getCaseOrThrow(input.tenantDb, input.caseId);
  const folder = buildTenantStoragePrefix(
    input.companyStorageRoot,
    'Case Reports',
    `CASE-${String(report.case_number).padStart(4, '0')}`,
  );
  const fileUrl = await uploadFile(
    input.file.buffer,
    input.file.originalname,
    input.file.mimetype,
    folder,
  );
  if (!fileUrl) throw new AppError(500, 'Failed to upload attachment');

  const userNames = await resolveUserNames([input.userId]);
  const [attachment] = await input.tenantDb.transaction(async (trx) => {
    const [created] = await trx('case_attachments')
      .insert({
        case_id: input.caseId,
        uploaded_by: input.userId,
        file_url: fileUrl,
        file_name: input.file!.originalname,
        file_size: input.file!.size,
        content_type: input.file!.mimetype,
      })
      .returning('*');
    await createSystemMessage(trx, {
      caseId: input.caseId,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} attached a file: ${input.file!.originalname}`,
    });
    return [created as CaseAttachmentRow];
  });

  const payload: CaseAttachment = {
    id: attachment.id,
    file_url: attachment.file_url,
    file_name: attachment.file_name,
    file_size: attachment.file_size,
    content_type: attachment.content_type,
  };
  emitCaseReportEvent('case-report:attachment', input.companyId, {
    caseId: input.caseId,
    attachment: payload,
  });
  return payload;
}

export async function listMessages(input: {
  tenantDb: Knex;
  caseId: string;
}): Promise<CaseMessage[]> {
  await getCaseOrThrow(input.tenantDb, input.caseId);
  return buildCaseMessageTree(input.tenantDb, input.caseId);
}

export async function sendMessage(input: {
  tenantDb: Knex;
  companyId: string;
  companyStorageRoot: string;
  userId: string;
  permissions: string[];
  caseId: string;
  content: string;
  parentMessageId?: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
  files: Express.Multer.File[];
}): Promise<CaseMessage> {
  const report = await assertCanMutateCase(input.tenantDb, input.caseId, input.permissions);
  const content = ensureNonEmpty(input.content, 'Message content');
  if (input.files.some((file) => !isAllowedMessageAttachment(file.mimetype))) {
    throw new AppError(400, 'Unsupported attachment type');
  }

  let messageId = '';
  await input.tenantDb.transaction(async (trx) => {
    await upsertParticipant(trx, input.caseId, input.userId, {
      is_joined: true,
      last_read_at: new Date(),
    });

    const [created] = await trx('case_messages')
      .insert({
        case_id: input.caseId,
        user_id: input.userId,
        content,
        parent_message_id: input.parentMessageId ?? null,
      })
      .returning('*');
    messageId = String(created.id);

    if (input.mentionedUserIds.length > 0 || input.mentionedRoleIds.length > 0) {
      await trx('case_mentions').insert([
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
        'Case Reports',
        `CASE-${String(report.case_number).padStart(4, '0')}`,
      );

      for (const file of input.files) {
        const fileUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folder);
        if (!fileUrl) throw new AppError(500, 'Failed to upload message attachment');

        await trx('case_attachments').insert({
          case_id: input.caseId,
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

  await maybeNotifyMentionedUsers({
    tenantDb: input.tenantDb,
    companyId: input.companyId,
    caseId: input.caseId,
    senderId: input.userId,
    mentionedUserIds: input.mentionedUserIds,
    mentionedRoleIds: input.mentionedRoleIds,
  });

  const roots = await buildCaseMessageTree(input.tenantDb, input.caseId);
  const queue = [...roots];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.id === messageId) {
      emitCaseReportEvent('case-report:message', input.companyId, {
        caseId: input.caseId,
        message: current,
      });
      return current;
    }
    queue.push(...(current.replies ?? []));
  }

  throw new AppError(500, 'Failed to load saved message');
}

export async function toggleReaction(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  caseId: string;
  messageId: string;
  emoji: string;
}): Promise<{ messageId: string; reactions: CaseReaction[] }> {
  ensureNonEmpty(input.emoji, 'Emoji');
  const message = await input.tenantDb('case_messages')
    .where({ id: input.messageId, case_id: input.caseId })
    .first();
  if (!message) throw new AppError(404, 'Message not found');

  const existing = await input.tenantDb('case_reactions')
    .where({ message_id: input.messageId, user_id: input.userId, emoji: input.emoji })
    .first();

  if (existing) {
    await input.tenantDb('case_reactions').where({ id: existing.id }).delete();
  } else {
    await input.tenantDb('case_reactions').insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    });
  }

  const { reactionsByMessage } = await resolveMessageDecorations(input.tenantDb, [input.messageId]);
  const reactions = reactionsByMessage.get(input.messageId) ?? [];
  emitCaseReportEvent('case-report:reaction', input.companyId, {
    caseId: input.caseId,
    messageId: input.messageId,
    reactions,
  });
  return { messageId: input.messageId, reactions };
}

export async function leaveDiscussion(input: {
  tenantDb: Knex;
  userId: string;
  caseId: string;
}): Promise<{ is_joined: boolean }> {
  await getCaseOrThrow(input.tenantDb, input.caseId);
  await upsertParticipant(input.tenantDb, input.caseId, input.userId, {
    is_joined: false,
    last_read_at: new Date(),
  });
  return { is_joined: false };
}

export async function toggleMute(input: {
  tenantDb: Knex;
  userId: string;
  caseId: string;
}): Promise<{ is_muted: boolean }> {
  await getCaseOrThrow(input.tenantDb, input.caseId);
  const existing = await input.tenantDb('case_participants')
    .where({ case_id: input.caseId, user_id: input.userId })
    .first();
  const nextMuted = !(existing?.is_muted ?? false);

  await upsertParticipant(input.tenantDb, input.caseId, input.userId, {
    is_joined: existing?.is_joined ?? true,
    is_muted: nextMuted,
  });

  return { is_muted: nextMuted };
}

export async function getMentionables(input: {
  companyId: string;
}): Promise<{
  users: MentionableUser[];
  roles: Array<{ id: string; name: string; color: string | null }>;
}> {
  const [users, roles] = await Promise.all([
    resolveCompanyUsers(input.companyId),
    db.getMasterDb()('roles').select('id', 'name', 'color').orderBy('priority', 'desc').orderBy('name', 'asc'),
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

export async function markCaseRead(input: {
  tenantDb: Knex;
  userId: string;
  caseId: string;
}): Promise<{ last_read_at: string }> {
  await getCaseOrThrow(input.tenantDb, input.caseId);
  const now = new Date();
  await upsertParticipant(input.tenantDb, input.caseId, input.userId, {
    is_joined: true,
    last_read_at: now,
  });
  return { last_read_at: now.toISOString() };
}

function findMessageInTree(messages: CaseMessage[], id: string): CaseMessage | undefined {
  for (const msg of messages) {
    if (msg.id === id) return msg;
    if (msg.replies) {
      const found = findMessageInTree(msg.replies, id);
      if (found) return found;
    }
  }
  return undefined;
}

export async function editMessage(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  caseId: string;
  messageId: string;
  content: string;
}): Promise<CaseMessage> {
  const content = ensureNonEmpty(input.content, 'Message content');
  const message = await input.tenantDb('case_messages')
    .where({ id: input.messageId, case_id: input.caseId })
    .first() as CaseMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');
  if (message.is_system) throw new AppError(400, 'Cannot edit system messages');
  if (message.user_id !== input.userId) throw new AppError(403, 'You can only edit your own messages');

  await input.tenantDb('case_messages')
    .where({ id: input.messageId })
    .update({ content, updated_at: new Date() });

  const messages = await buildCaseMessageTree(input.tenantDb, input.caseId);
  const updated = findMessageInTree(messages, input.messageId);
  if (!updated) throw new AppError(500, 'Failed to retrieve updated message');

  emitCaseReportEvent('case-report:message:edited', input.companyId, {
    caseId: input.caseId,
    message: updated,
  });

  return updated;
}

export async function deleteMessage(input: {
  tenantDb: Knex;
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  messageId: string;
}): Promise<void> {
  const message = await input.tenantDb('case_messages')
    .where({ id: input.messageId, case_id: input.caseId })
    .first() as CaseMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');
  if (message.is_system) throw new AppError(400, 'Cannot delete system messages');

  const isOwn = message.user_id === input.userId;
  const canManage = hasManagePermission(input.permissions);
  if (!isOwn && !canManage) throw new AppError(403, 'Permission denied');

  await input.tenantDb('case_messages').where({ id: input.messageId }).delete();

  emitCaseReportEvent('case-report:message:deleted', input.companyId, {
    caseId: input.caseId,
    messageId: input.messageId,
  });
}
