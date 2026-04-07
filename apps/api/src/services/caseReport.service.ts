import type {
  CaseAttachment,
  CaseMessage,
  CaseMention,
  CaseReaction,
  CaseReport,
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
import * as violationNoticeService from './violationNotice.service.js';

type CaseReportRow = {
  id: string;
  case_number: number;
  title: string;
  description: string;
  status: 'open' | 'closed';
  corrective_action: string | null;
  resolution: string | null;
  vn_requested: boolean;
  branch_id: string | null;
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
  is_deleted: boolean;
  deleted_by: string | null;
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

async function resolveAndValidateCaseBranchId(
  companyId: string,
  userId: string,
  branchIdInput?: string | null,
): Promise<string | null> {
  const branchId = typeof branchIdInput === 'string' ? branchIdInput.trim() : '';
  if (!branchId) return null;

  const branch = await db
    .getDb()('branches')
    .where({ id: branchId, company_id: companyId, is_active: true })
    .select('id', 'is_active')
    .first();

  if (!branch || branch.is_active !== true) {
    throw new AppError(400, 'Selected branch is invalid or inactive. Please refresh and try again.');
  }

  const [legacyAssignments, companyAssignments] = await Promise.all([
    db.getDb()('user_branches').where({ company_id: companyId, user_id: userId }).select('branch_id'),
    db.getDb()('user_company_branches').where({ company_id: companyId, user_id: userId }).select('branch_id'),
  ]);

  const effectiveAssignments = companyAssignments.length > 0 ? companyAssignments : legacyAssignments;
  if (effectiveAssignments.length > 0) {
    const isAssigned = effectiveAssignments.some(
      (row: { branch_id: string }) => row.branch_id === branchId,
    );
    if (!isAssigned) {
      throw new AppError(403, 'You are not assigned to the selected branch');
    }
  }

  return branchId;
}

function hasManagePermission(permissions: string[]): boolean {
  return permissions.includes(PERMISSIONS.CASE_REPORT_MANAGE);
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

function emitCaseReportEvent(event: string, companyId: string, payload: unknown): void {
  try {
    (getIO().of('/case-reports').to(`company:${companyId}`) as any).emit(event, payload);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for case report event');
  }
}

async function getCaseOrThrow(caseId: string): Promise<CaseReportRow> {
  const row = await db.getDb()('case_reports').where({ id: caseId }).first();
  if (!row) throw new AppError(404, 'Case report not found');
  return row as CaseReportRow;
}

async function upsertParticipant(
  caseId: string,
  userId: string,
  patch: Partial<Pick<CaseParticipantRow, 'is_joined' | 'is_muted' | 'last_read_at'>>,
  trx?: Knex.Transaction,
): Promise<void> {
  const knex = trx ?? db.getDb();
  const existing = await knex('case_participants')
    .where({ case_id: caseId, user_id: userId })
    .first();
  const next = {
    is_joined: patch.is_joined ?? existing?.is_joined ?? true,
    is_muted: patch.is_muted ?? existing?.is_muted ?? false,
    last_read_at: patch.last_read_at ?? existing?.last_read_at ?? null,
    updated_at: new Date(),
  };

  if (existing) {
    await knex('case_participants').where({ case_id: caseId, user_id: userId }).update(next);
    return;
  }

  await knex('case_participants').insert({
    case_id: caseId,
    user_id: userId,
    ...next,
    created_at: new Date(),
  });
}

async function createSystemMessage(
  input: { caseId: string; userId: string; content: string },
  trx?: Knex.Transaction,
): Promise<CaseMessageRow> {
  const knex = trx ?? db.getDb();
  const [message] = await knex('case_messages')
    .insert({
      case_id: input.caseId,
      user_id: input.userId,
      content: input.content,
      is_system: true,
    })
    .returning('*');
  return message as CaseMessageRow;
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

async function resolveCompanyUsers(companyId: string): Promise<MentionableUser[]> {
  return resolveCompanyUsersWithPermission(companyId, PERMISSIONS.CASE_REPORT_VIEW);
}

async function resolveMessageDecorations(messageIds: string[]): Promise<{
  reactionsByMessage: Map<string, CaseReaction[]>;
  attachmentsByMessage: Map<string, CaseAttachment[]>;
  mentionsByMessage: Map<string, CaseMention[]>;
}> {
  const [reactionRows, attachmentRows, mentionRows] = await Promise.all([
    messageIds.length > 0
      ? db.getDb()('case_reactions').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
    messageIds.length > 0
      ? db.getDb()('case_attachments').whereIn('message_id', messageIds).select('*')
      : Promise.resolve([]),
    messageIds.length > 0
      ? db
          .getDb()('case_mentions as cm')
          .leftJoin('users as u', 'cm.mentioned_user_id', 'u.id')
          .leftJoin('roles as r', 'cm.mentioned_role_id', 'r.id')
          .whereIn('cm.message_id', messageIds)
          .select('cm.*', 'u.first_name', 'u.last_name', 'r.name as role_name')
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

async function buildCaseMessageTree(caseId: string): Promise<CaseMessage[]> {
  const rows = await db
    .getDb()('case_messages')
    .where({ case_id: caseId })
    .orderBy('created_at', 'asc')
    .select('*');
  const messageRows = rows as CaseMessageRow[];
  const messageIds = messageRows.map((row) => row.id);
  const userMap = await hydrateUsersByIds(
    messageRows.filter((row) => !row.is_system).map((row) => row.user_id),
    ['id', 'first_name', 'last_name', 'avatar_url'],
  );
  const { reactionsByMessage, attachmentsByMessage, mentionsByMessage } =
    await resolveMessageDecorations(messageIds);

  const items = new Map<string, CaseMessage>();
  const roots: CaseMessage[] = [];

  for (const row of messageRows) {
    const user = userMap[row.user_id];
    items.set(row.id, {
      id: row.id,
      case_id: row.case_id,
      user_id: row.user_id,
      user_name: row.is_system
        ? 'System'
        : `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim() || undefined,
      user_avatar: typeof user?.avatar_url === 'string' ? user.avatar_url : undefined,
      content: row.content,
      is_system: row.is_system,
      is_deleted: row.is_deleted ?? false,
      parent_message_id: row.parent_message_id,
      reactions: reactionsByMessage.get(row.id) ?? [],
      attachments: attachmentsByMessage.get(row.id) ?? [],
      mentions: mentionsByMessage.get(row.id) ?? [],
      replies: [],
      created_at: new Date(row.created_at).toISOString(),
      is_edited: !row.is_deleted && new Date(row.updated_at) > new Date(row.created_at),
    });
  }

  // All messages are returned flat sorted by created_at.
  // parent_message_id is kept on each message so the frontend can render
  // a quoted reply block — replies are not nested in a tree.
  for (const row of messageRows) {
    roots.push(items.get(row.id)!);
  }

  return roots;
}

async function enrichCaseReports(rows: CaseReportRow[], userId: string): Promise<CaseReport[]> {
  if (rows.length === 0) return [];

  const caseIds = rows.map((row) => row.id);
  const userIds = [
    ...new Set(rows.flatMap((row) => [row.created_by, row.closed_by].filter(Boolean) as string[])),
  ];

  const [participants, messageCounts, unreadCounts, unreadReplyCounts, userNames, linkedVns] =
    await Promise.all([
      db
        .getDb()('case_participants')
        .whereIn('case_id', caseIds)
        .andWhere({ user_id: userId })
        .select('case_id', 'is_joined', 'is_muted', 'last_read_at'),
      db
        .getDb()('case_messages')
        .whereIn('case_id', caseIds)
        .where('is_system', false)
        .groupBy('case_id')
        .select('case_id')
        .count<{ count: string }[]>({ count: '*' }),
      db
        .getDb()('case_participants as cp')
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
      // Count replies to the current user's messages that are unread
      db
        .getDb()('case_messages as reply')
        .join('case_messages as parent', 'reply.parent_message_id', 'parent.id')
        .join('case_participants as cp', (join) => {
          join.on('cp.case_id', 'reply.case_id').andOnVal('cp.user_id', userId);
        })
        .whereIn('reply.case_id', caseIds)
        .where('parent.user_id', userId)
        .where('reply.user_id', '!=', userId)
        .andWhere((builder) => {
          builder.whereNull('cp.last_read_at').orWhereRaw('reply.created_at > cp.last_read_at');
        })
        .groupBy('reply.case_id')
        .select('reply.case_id')
        .count<{ count: string }[]>({ count: 'reply.id' }),
      resolveUserNames(userIds),
      db
        .getDb()('violation_notices')
        .whereIn('source_case_report_id', caseIds)
        .whereNotNull('source_case_report_id')
        .select('id', 'source_case_report_id'),
    ]);

  const vnMap = new Map(
    linkedVns.map((vn: any) => [vn.source_case_report_id as string, vn.id as string]),
  );

  const participantMap = new Map(
    participants.map((row: any) => [String(row.case_id), row as CaseParticipantRow]),
  );
  const messageCountMap = new Map(
    messageCounts.map((row: any) => [String(row.case_id), Number(row.count ?? 0)]),
  );
  const unreadCountMap = new Map(
    unreadCounts.map((row: any) => [String(row.case_id), Number(row.count ?? 0)]),
  );
  const unreadReplyCountMap = new Map(
    unreadReplyCounts.map((row: any) => [String(row.case_id), Number(row.count ?? 0)]),
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
      linked_vn_id: vnMap.get(row.id) ?? null,
      created_by: row.created_by,
      created_by_name: userNames[row.created_by] ?? undefined,
      closed_by: row.closed_by,
      closed_by_name: row.closed_by ? (userNames[row.closed_by] ?? undefined) : undefined,
      closed_at: toIso(row.closed_at),
      message_count: messageCountMap.get(row.id) ?? 0,
      unread_count: unreadCountMap.get(row.id) ?? 0,
      unread_reply_count: unreadReplyCountMap.get(row.id) ?? 0,
      is_joined: participant?.is_joined ?? false,
      is_muted: participant?.is_muted ?? false,
      branch_id: (row as any).branch_id ?? null,
      branch_name: (row as any).branch_name ?? null,
      company_name: (row as any).company_name ?? null,
      created_at: new Date(row.created_at).toISOString(),
      updated_at: new Date(row.updated_at).toISOString(),
    };
  });
}

async function assertCanMutateCase(caseId: string, permissions: string[]): Promise<CaseReportRow> {
  const record = await getCaseOrThrow(caseId);
  if (record.status === 'closed' && !hasManagePermission(permissions)) {
    throw new AppError(403, 'This case is already closed');
  }
  return record;
}

async function maybeNotifyMentionedUsers(input: {
  companyId: string;
  caseId: string;
  messageId: string;
  senderId: string;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
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
  ).filter((id) => id !== input.senderId);

  if (targets.length === 0) return;

  const senderNames = await resolveUserNames([input.senderId]);
  const senderName = senderNames[input.senderId] ?? 'Someone';
  const participantRows = await db
    .getDb()('case_participants')
    .whereIn('user_id', targets)
    .andWhere({ case_id: input.caseId })
    .select('user_id', 'is_muted');
  const participantMap = new Map(participantRows.map((row: any) => [String(row.user_id), row]));

  await Promise.all(
    targets.map(async (targetUserId) => {
      await upsertParticipant(input.caseId, targetUserId, { is_joined: true });
      if (participantMap.get(targetUserId)?.is_muted) return;
      await createAndDispatchNotification({
        userId: targetUserId,
        title: 'Case report mention',
        message: `${senderName} mentioned you in a case report`,
        type: 'info',
        linkUrl: `/case-reports?caseId=${input.caseId}&messageId=${input.messageId}`,
      });
    }),
  );
}

export async function listCaseReports(input: {
  userId: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortOrder?: string;
  vnOnly?: boolean;
}): Promise<{ items: CaseReport[]; total: number }> {
  const query = db.getDb()('case_reports');
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
    query
      .clone()
      .leftJoin('branches', 'case_reports.branch_id', 'branches.id')
      .leftJoin('companies', 'case_reports.company_id', 'companies.id')
      .orderBy('case_reports.created_at', normalizeSortOrder(input.sortOrder))
      .select('case_reports.*', 'branches.name as branch_name', 'companies.name as company_name'),
  ]);

  const items = await enrichCaseReports(rows as CaseReportRow[], input.userId);
  return { items, total: Number(countRow?.count ?? 0) };
}

export async function getCaseReport(input: {
  userId: string;
  caseId: string;
  markRead?: boolean;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const rawRecord = await getCaseOrThrow(input.caseId);
  if (input.markRead) {
    await upsertParticipant(input.caseId, input.userId, {
      is_joined: true,
      last_read_at: new Date(),
    });
  }

  const recordWithCompany = await db
    .getDb()('case_reports')
    .where('case_reports.id', input.caseId)
    .leftJoin('branches', 'case_reports.branch_id', 'branches.id')
    .leftJoin('companies', 'case_reports.company_id', 'companies.id')
    .select('case_reports.*', 'branches.name as branch_name', 'companies.name as company_name')
    .first();

  const record = recordWithCompany ?? rawRecord;
  const [report] = await enrichCaseReports([record], input.userId);
  const attachments = await db
    .getDb()('case_attachments')
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
  companyId: string;
  userId: string;
  title: string;
  description: string;
  branchId?: string | null;
}): Promise<CaseReport> {
  const title = ensureNonEmpty(input.title, 'Title');
  const description = ensureNonEmpty(input.description, 'Description');
  const branchId = await resolveAndValidateCaseBranchId(input.companyId, input.userId, input.branchId);
  const userNames = await resolveUserNames([input.userId]);

  const report = await db.getDb().transaction(async (trx) => {
    const caseNumber = await getNextCompanySequence(trx, input.companyId, 'case_number');
    const [created] = await trx('case_reports')
      .insert({
        company_id: input.companyId,
        case_number: caseNumber,
        title,
        description,
        created_by: input.userId,
        branch_id: branchId,
      })
      .returning('*');
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
      {
        caseId: created.id,
        userId: input.userId,
        content: `${userNames[input.userId] ?? 'Someone'} created this case`,
      },
      trx,
    );
    return created as CaseReportRow;
  });

  emitCaseReportEvent('case-report:created', input.companyId, {
    id: report.id,
    caseNumber: report.case_number,
    title: report.title,
    status: report.status,
    createdBy: report.created_by,
  });

  const reportWithNames =
    (await db
      .getDb()('case_reports')
      .where('case_reports.id', report.id)
      .leftJoin('branches', 'case_reports.branch_id', 'branches.id')
      .leftJoin('companies', 'case_reports.company_id', 'companies.id')
      .select('case_reports.*', 'branches.name as branch_name', 'companies.name as company_name')
      .first()) ?? report;

  const [enriched] = await enrichCaseReports([reportWithNames], input.userId);
  return enriched;
}

export async function updateCorrectiveAction(input: {
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  correctiveAction: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await assertCanMutateCase(input.caseId, input.permissions);
  if (current.created_by !== input.userId && !hasManagePermission(input.permissions)) {
    throw new AppError(403, 'Only the case creator can update the corrective action');
  }
  const nextText = ensureNonEmpty(input.correctiveAction, 'Corrective action');
  const userNames = await resolveUserNames([input.userId]);
  const verb = current.corrective_action
    ? 'updated the corrective action'
    : 'added a corrective action';

  await db.getDb().transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      corrective_action: nextText,
      updated_at: new Date(),
    });
    await createSystemMessage({
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
  return getCaseReport({ userId: input.userId, caseId: input.caseId });
}

export async function updateResolution(input: {
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  resolution: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await assertCanMutateCase(input.caseId, input.permissions);
  if (current.created_by !== input.userId && !hasManagePermission(input.permissions)) {
    throw new AppError(403, 'Only the case creator can update the resolution');
  }
  const nextText = ensureNonEmpty(input.resolution, 'Resolution');
  const userNames = await resolveUserNames([input.userId]);
  const verb = current.resolution ? 'updated the resolution' : 'added a resolution';

  await db.getDb().transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      resolution: nextText,
      updated_at: new Date(),
    });
    await createSystemMessage({
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
  return getCaseReport({ userId: input.userId, caseId: input.caseId });
}

export async function closeCase(input: {
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await getCaseOrThrow(input.caseId);
  if (current.status === 'closed') throw new AppError(409, 'Case is already closed');
  if (current.created_by !== input.userId && !hasManagePermission(input.permissions)) {
    throw new AppError(403, 'Only the case creator can close this case');
  }
  if (!current.corrective_action || !current.resolution) {
    throw new AppError(400, 'Corrective action and resolution are required before closing');
  }

  const userNames = await resolveUserNames([input.userId]);
  await db.getDb().transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      status: 'closed',
      closed_by: input.userId,
      closed_at: new Date(),
      updated_at: new Date(),
    });
    await createSystemMessage({
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
  return getCaseReport({ userId: input.userId, caseId: input.caseId });
}

export async function requestViolationNotice(input: {
  companyId: string;
  userId: string;
  caseId: string;
  description: string;
  targetUserIds: string[];
}): Promise<CaseReport & { attachments: CaseAttachment[] }> {
  const current = await getCaseOrThrow(input.caseId);
  const userNames = await resolveUserNames([input.userId]);

  await db.getDb().transaction(async (trx) => {
    await trx('case_reports').where({ id: input.caseId }).update({
      vn_requested: true,
      updated_at: new Date(),
    });
    await createSystemMessage({
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

  await violationNoticeService.createViolationNotice({
    companyId: input.companyId,
    userId: input.userId,
    description: input.description,
    targetUserIds: input.targetUserIds,
    category: 'case_reports',
    sourceCaseReportId: input.caseId,
    branchId: current.branch_id ?? null,
  });

  return getCaseReport({ userId: input.userId, caseId: input.caseId });
}

export async function uploadAttachment(input: {
  companyId: string;
  companyStorageRoot: string;
  userId: string;
  permissions?: string[];
  caseId: string;
  file?: Express.Multer.File;
}): Promise<CaseAttachment> {
  if (!input.file) throw new AppError(400, 'Attachment file is required');
  if (input.file.size > 50 * 1024 * 1024) throw new AppError(400, 'File exceeds 50MB limit');

  const report = await getCaseOrThrow(input.caseId);
  if (report.created_by !== input.userId && !hasManagePermission(input.permissions ?? [])) {
    throw new AppError(403, 'Only the case creator can add attachments');
  }
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
  const [attachment] = await db.getDb().transaction(async (trx) => {
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
    await createSystemMessage({
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

export async function deleteAttachment(input: {
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  attachmentId: string;
}): Promise<void> {
  const attachment = (await db
    .getDb()('case_attachments')
    .where({ id: input.attachmentId, case_id: input.caseId })
    .whereNull('message_id')
    .first()) as CaseAttachmentRow | undefined;
  if (!attachment) throw new AppError(404, 'Attachment not found');

  const report = await getCaseOrThrow(input.caseId);
  const isCreator = report.created_by === input.userId;
  if (!isCreator && !hasManagePermission(input.permissions)) {
    throw new AppError(403, 'Only the case creator can remove attachments');
  }

  const userNames = await resolveUserNames([input.userId]);
  await db.getDb().transaction(async (trx) => {
    await trx('case_attachments').where({ id: input.attachmentId }).delete();
    await createSystemMessage({
      caseId: input.caseId,
      userId: input.userId,
      content: `${userNames[input.userId] ?? 'Someone'} removed the attachment: ${attachment.file_name}`,
    });
  });
  await deleteFile(attachment.file_url).catch(() => {});

  emitCaseReportEvent('case-report:attachment', input.companyId, { caseId: input.caseId });
}

export async function listMessages(input: { caseId: string }): Promise<CaseMessage[]> {
  await getCaseOrThrow(input.caseId);
  return buildCaseMessageTree(input.caseId);
}

export async function sendMessage(input: {
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
  const report = await assertCanMutateCase(input.caseId, input.permissions);
  if (!input.content?.trim() && input.files.length === 0) {
    throw new AppError(400, 'Message must have content or at least one attachment');
  }
  const content = input.content?.trim() ?? '';
  if (input.files.some((file) => !isAllowedMessageAttachment(file.mimetype))) {
    throw new AppError(400, 'Unsupported attachment type');
  }

  let messageId = '';
  await db.getDb().transaction(async (trx) => {
    await upsertParticipant(input.caseId, input.userId, {
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
    companyId: input.companyId,
    caseId: input.caseId,
    messageId,
    senderId: input.userId,
    mentionedUserIds: input.mentionedUserIds,
    mentionedRoleIds: input.mentionedRoleIds,
  });

  const roots = await buildCaseMessageTree(input.caseId);
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
  companyId: string;
  userId: string;
  caseId: string;
  messageId: string;
  emoji: string;
}): Promise<{ messageId: string; reactions: CaseReaction[] }> {
  ensureNonEmpty(input.emoji, 'Emoji');
  const message = await db
    .getDb()('case_messages')
    .where({ id: input.messageId, case_id: input.caseId })
    .first();
  if (!message) throw new AppError(404, 'Message not found');

  const existing = await db
    .getDb()('case_reactions')
    .where({ message_id: input.messageId, user_id: input.userId, emoji: input.emoji })
    .first();

  if (existing) {
    await db.getDb()('case_reactions').where({ id: existing.id }).delete();
  } else {
    await db.getDb()('case_reactions').insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    });
  }

  const { reactionsByMessage } = await resolveMessageDecorations([input.messageId]);
  const reactions = reactionsByMessage.get(input.messageId) ?? [];
  emitCaseReportEvent('case-report:reaction', input.companyId, {
    caseId: input.caseId,
    messageId: input.messageId,
    reactions,
  });
  return { messageId: input.messageId, reactions };
}

export async function leaveDiscussion(input: {
  userId: string;
  caseId: string;
}): Promise<{ is_joined: boolean }> {
  await getCaseOrThrow(input.caseId);
  await upsertParticipant(input.caseId, input.userId, {
    is_joined: false,
    last_read_at: new Date(),
  });
  return { is_joined: false };
}

export async function toggleMute(input: {
  userId: string;
  caseId: string;
}): Promise<{ is_muted: boolean }> {
  await getCaseOrThrow(input.caseId);
  const existing = await db
    .getDb()('case_participants')
    .where({ case_id: input.caseId, user_id: input.userId })
    .first();
  const nextMuted = !(existing?.is_muted ?? false);

  await upsertParticipant(input.caseId, input.userId, {
    is_joined: existing?.is_joined ?? true,
    is_muted: nextMuted,
  });

  return { is_muted: nextMuted };
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

export async function markCaseRead(input: {
  userId: string;
  caseId: string;
}): Promise<{ last_read_at: string }> {
  await getCaseOrThrow(input.caseId);
  const now = new Date();
  await upsertParticipant(input.caseId, input.userId, {
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
  companyId: string;
  userId: string;
  caseId: string;
  messageId: string;
  content: string;
}): Promise<CaseMessage> {
  const content = ensureNonEmpty(input.content, 'Message content');
  const message = (await db
    .getDb()('case_messages')
    .where({ id: input.messageId, case_id: input.caseId })
    .first()) as CaseMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');
  if (message.is_system) throw new AppError(400, 'Cannot edit system messages');
  if (message.user_id !== input.userId)
    throw new AppError(403, 'You can only edit your own messages');

  await db
    .getDb()('case_messages')
    .where({ id: input.messageId })
    .update({ content, updated_at: new Date() });

  const messages = await buildCaseMessageTree(input.caseId);
  const updated = findMessageInTree(messages, input.messageId);
  if (!updated) throw new AppError(500, 'Failed to retrieve updated message');

  emitCaseReportEvent('case-report:message:edited', input.companyId, {
    caseId: input.caseId,
    message: updated,
  });

  return updated;
}

export async function deleteMessage(input: {
  companyId: string;
  userId: string;
  permissions: string[];
  caseId: string;
  messageId: string;
}): Promise<void> {
  const message = (await db
    .getDb()('case_messages')
    .where({ id: input.messageId, case_id: input.caseId })
    .first()) as CaseMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');
  if (message.is_system) throw new AppError(400, 'Cannot delete system messages');

  const isOwn = message.user_id === input.userId;
  const canManage = hasManagePermission(input.permissions);
  if (!isOwn && !canManage) throw new AppError(403, 'Permission denied');

  // Fetch attachments before deleting so we can remove them from S3
  const attachments = (await db
    .getDb()('case_attachments')
    .where({ message_id: input.messageId })
    .select('file_url')) as { file_url: string }[];

  const userNames = await resolveUserNames([input.userId]);
  const deleterName = userNames[input.userId] ?? 'Someone';

  await db.getDb().transaction(async (trx) => {
    await trx('case_messages')
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

  emitCaseReportEvent('case-report:message:deleted', input.companyId, {
    caseId: input.caseId,
    messageId: input.messageId,
  });
}
