import type { CaseTask, CaseTaskAssignee, CaseTaskMessage, CaseTaskReaction, CaseTaskMention } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { logger } from '../utils/logger.js';
import { buildTenantStoragePrefix, uploadFile } from './storage.service.js';
import { createAndDispatchNotification } from './notification.service.js';

// ── Row types ─────────────────────────────────────────────────────────────────

export interface MyTask extends CaseTask {
  case_number: number;
  case_title: string;
}

type TaskRow = {
  id: string;
  case_id: string;
  created_by: string | null;
  source_message_id: string | null;
  discussion_message_id: string | null;
  description: string;
  created_at: Date | string;
  updated_at: Date | string;
};

type AssigneeRow = {
  id: string;
  task_id: string;
  user_id: string;
  completed_at: Date | string | null;
  completed_by: string | null;
};

type TaskMessageRow = {
  id: string;
  task_id: string;
  user_id: string | null;
  content: string | null;
  file_url: string | null;
  file_name: string | null;
  file_size: number | null;
  content_type: string | null;
  parent_message_id: string | null;
  created_at: Date | string;
};

type TaskReactionRow = {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
};

type TaskMentionRow = {
  id: string;
  message_id: string;
  mentioned_user_id: string | null;
  mentioned_role_id: string | null;
  mentioned_name: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function resolveUserName(user: any): string | null {
  if (!user) return null;
  return `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim() || null;
}

function resolveUserAvatar(user: any): string | null {
  return typeof user?.avatar_url === 'string' ? user.avatar_url : null;
}

async function resolveUserNamesMap(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const users = await hydrateUsersByIds(userIds);
  const map: Record<string, string> = {};
  for (const [id, user] of Object.entries(users)) {
    map[id] = `${(user as any).first_name ?? ''} ${(user as any).last_name ?? ''}`.trim();
  }
  return map;
}

function emitCaseReportEvent(event: string, companyId: string, payload: unknown): void {
  try {
    (getIO().of('/case-reports').to(`company:${companyId}`) as any).emit(event, payload);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for case report task event');
  }
}

async function getCaseOrThrow(caseId: string): Promise<{ id: string; company_id: string; status: string; case_number: number }> {
  const row = await db.getDb()('case_reports').where({ id: caseId }).first('id', 'company_id', 'status', 'case_number');
  if (!row) throw new AppError(404, 'Case report not found');
  return row as { id: string; company_id: string; status: string; case_number: number };
}

async function getTaskOrThrow(taskId: string): Promise<TaskRow> {
  const row = await db.getDb()('case_report_tasks').where({ id: taskId }).first();
  if (!row) throw new AppError(404, 'Task not found');
  return row as TaskRow;
}

async function buildTasks(rows: TaskRow[]): Promise<CaseTask[]> {
  if (rows.length === 0) return [];

  const taskIds = rows.map((r) => r.id);
  const creatorIds = rows.map((r) => r.created_by).filter(Boolean) as string[];

  // Load assignees
  const assigneeRows = await db.getDb()('case_report_task_assignees')
    .whereIn('task_id', taskIds)
    .select('*') as AssigneeRow[];

  const assigneeUserIds = [
    ...new Set([
      ...assigneeRows.map((a) => a.user_id),
      ...assigneeRows.map((a) => a.completed_by).filter(Boolean) as string[],
    ]),
  ];

  const allUserIds = [...new Set([...creatorIds, ...assigneeUserIds])];
  const userMap = allUserIds.length > 0 ? await hydrateUsersByIds(allUserIds) : {};

  // Load source message content
  const sourceMessageIds = rows.map((r) => r.source_message_id).filter(Boolean) as string[];
  const sourceMessageMap: Record<string, { content: string; user_id: string | null }> = {};
  if (sourceMessageIds.length > 0) {
    const msgs = await db.getDb()('case_messages')
      .whereIn('id', sourceMessageIds)
      .select('id', 'content', 'user_id') as { id: string; content: string; user_id: string | null }[];
    for (const m of msgs) sourceMessageMap[m.id] = m;
  }

  // Load last message (timestamp + content + sender) per task via correlated subquery
  const lastMsgRows = await db.getDb()('case_report_task_messages as m')
    .whereIn('m.task_id', taskIds)
    .whereRaw(
      'm.created_at = (select max(m2.created_at) from case_report_task_messages m2 where m2.task_id = m.task_id)',
    )
    .select('m.task_id', 'm.content', 'm.created_at', 'm.user_id') as { task_id: string; content: string; created_at: Date | string; user_id: string | null }[];

  // Collect user IDs from last messages not already in userMap
  const lastMsgUserIds = [...new Set(lastMsgRows.map((r) => r.user_id).filter(Boolean) as string[])];
  const extraUserIds = lastMsgUserIds.filter((id) => !userMap[id]);
  if (extraUserIds.length > 0) {
    const extraUsers = await hydrateUsersByIds(extraUserIds);
    Object.assign(userMap, extraUsers);
  }

  const lastMsgMap: Record<string, { at: string | null; content: string | null; userId: string | null }> = {};
  for (const r of lastMsgRows) {
    lastMsgMap[r.task_id] = { at: toIso(r.created_at), content: r.content, userId: r.user_id };
  }

  // Load message counts per task
  const msgCountRows = await db.getDb()('case_report_task_messages')
    .whereIn('task_id', taskIds)
    .groupBy('task_id')
    .select('task_id')
    .count<{ task_id: string; count: string }[]>({ count: '*' });
  const msgCountMap: Record<string, number> = {};
  for (const r of msgCountRows) msgCountMap[(r as any).task_id] = Number((r as any).count);

  // Group assignees by task
  const assigneesByTask: Record<string, AssigneeRow[]> = {};
  for (const a of assigneeRows) {
    if (!assigneesByTask[a.task_id]) assigneesByTask[a.task_id] = [];
    assigneesByTask[a.task_id].push(a);
  }

  return rows.map((row): CaseTask => {
    const assignees: CaseTaskAssignee[] = (assigneesByTask[row.id] ?? []).map((a) => ({
      id: a.id,
      task_id: a.task_id,
      user_id: a.user_id,
      user_name: resolveUserName(userMap[a.user_id]),
      user_avatar: resolveUserAvatar(userMap[a.user_id]),
      completed_at: toIso(a.completed_at),
      completed_by: a.completed_by,
      completed_by_name: resolveUserName(userMap[a.completed_by ?? ''] ?? null),
    }));

    const srcMsg = row.source_message_id ? sourceMessageMap[row.source_message_id] : null;

    return {
      id: row.id,
      case_id: row.case_id,
      created_by: row.created_by,
      created_by_name: resolveUserName(userMap[row.created_by ?? ''] ?? null),
      source_message_id: row.source_message_id,
      source_message_content: srcMsg?.content ?? null,
      source_message_user_name: srcMsg?.user_id ? resolveUserName(userMap[srcMsg.user_id] ?? null) : null,
      description: row.description,
      discussion_message_id: row.discussion_message_id,
      assignees,
      created_at: toIso(row.created_at)!,
      updated_at: toIso(row.updated_at)!,
      last_message_at: lastMsgMap[row.id]?.at ?? null,
      last_message_content: lastMsgMap[row.id]?.content ?? null,
      last_message_user_name: resolveUserName(userMap[lastMsgMap[row.id]?.userId ?? ''] ?? null),
      last_message_user_avatar: resolveUserAvatar(userMap[lastMsgMap[row.id]?.userId ?? ''] ?? null),
      message_count: msgCountMap[row.id] ?? 0,
    };
  });
}

// ── Exported service functions ────────────────────────────────────────────────

export async function createTask(input: {
  caseId: string;
  createdBy: string;
  companyId: string;
  description: string;
  assigneeUserIds: string[];
  sourceMessageId?: string | null;
}): Promise<CaseTask> {
  const caseRow = await getCaseOrThrow(input.caseId);

  if (caseRow.status === 'closed') {
    throw new AppError(400, 'Cannot create tasks on a closed case');
  }

  const knex = db.getDb();

  const [taskRow] = await knex('case_report_tasks')
    .insert({
      case_id: input.caseId,
      created_by: input.createdBy,
      description: input.description,
      source_message_id: input.sourceMessageId ?? null,
    })
    .returning('*') as TaskRow[];

  // Insert assignees
  if (input.assigneeUserIds.length > 0) {
    await knex('case_report_task_assignees').insert(
      input.assigneeUserIds.map((userId) => ({
        task_id: taskRow.id,
        user_id: userId,
      })),
    );
  }

  // Notify each assignee
  const caseNumber = String(caseRow.case_number).padStart(4, '0');
  const creatorUsers = await hydrateUsersByIds([input.createdBy]);
  const creatorUser = creatorUsers[input.createdBy] as any;
  const creatorName = creatorUser
    ? `${creatorUser.first_name ?? ''} ${creatorUser.last_name ?? ''}`.trim() || 'Someone'
    : 'Someone';

  for (const assigneeId of input.assigneeUserIds) {
    if (assigneeId === input.createdBy) continue;
    await createAndDispatchNotification({
      userId: assigneeId,
      title: 'New Task Assigned',
      message: `${creatorName} assigned you a task in Case #${caseNumber}: ${input.description}`,
      type: 'info',
      linkUrl: `/case-reports?caseId=${input.caseId}&taskId=${taskRow.id}`,
    });
  }

  // Create a discussion-facing case message (the "task bubble")
  const assigneeCount = input.assigneeUserIds.length;
  const bubbleContent = `📋 Task: ${input.description} — 0 of ${assigneeCount} assignee${assigneeCount === 1 ? '' : 's'} done`;

  const [discussionMsg] = await knex('case_messages')
    .insert({
      case_id: input.caseId,
      user_id: input.createdBy,
      content: bubbleContent,
      is_system: false,
    })
    .returning('id') as { id: string }[];

  await knex('case_report_tasks')
    .where({ id: taskRow.id })
    .update({ discussion_message_id: discussionMsg.id });

  // System message in discussion
  await knex('case_messages').insert({
    case_id: input.caseId,
    user_id: input.createdBy,
    content: `📋 ${creatorName} created a task: ${input.description}`,
    is_system: true,
  });

  const [task] = await buildTasks([{ ...taskRow, discussion_message_id: discussionMsg.id }]);

  emitCaseReportEvent('case-report:task:created', caseRow.company_id, {
    caseId: input.caseId,
    task,
  });

  // Also emit a message event so the discussion updates
  emitCaseReportEvent('case-report:message', caseRow.company_id, { caseId: input.caseId });

  return task;
}

export async function listTasks(caseId: string): Promise<CaseTask[]> {
  await getCaseOrThrow(caseId);
  const rows = await db.getDb()('case_report_tasks')
    .where({ case_id: caseId })
    .orderBy('created_at', 'asc') as TaskRow[];
  return buildTasks(rows);
}

export async function listMyTasks(input: {
  userId: string;
  companyId: string;
}): Promise<MyTask[]> {
  const knex = db.getDb();
  const rows = await knex('case_report_tasks as ct')
    .join('case_report_task_assignees as cta', 'cta.task_id', 'ct.id')
    .join('case_reports as cr', 'cr.id', 'ct.case_id')
    .where('cta.user_id', input.userId)
    .where('cr.company_id', input.companyId)
    .select('ct.*', 'cr.case_number', knex.raw('cr.title as case_title'))
    .orderBy('ct.created_at', 'desc') as Array<TaskRow & { case_number: number; case_title: string }>;

  const tasks = await buildTasks(rows);
  return tasks.map((task, index) => ({
    ...task,
    case_number: Number(rows[index]?.case_number ?? 0),
    case_title: String(rows[index]?.case_title ?? ''),
  }));
}

export async function getTask(taskId: string): Promise<CaseTask> {
  const row = await getTaskOrThrow(taskId);
  const [task] = await buildTasks([row]);
  return task;
}

export async function listTaskMessages(taskId: string): Promise<CaseTaskMessage[]> {
  await getTaskOrThrow(taskId);

  const rows = await db.getDb()('case_report_task_messages')
    .where({ task_id: taskId })
    .orderBy('created_at', 'asc') as TaskMessageRow[];

  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
  const userMap = userIds.length > 0 ? await hydrateUsersByIds(userIds) : {};

  const [reactionRows, mentionRows] = await Promise.all([
    db.getDb()('case_report_task_reactions').whereIn('message_id', messageIds).select('*') as Promise<TaskReactionRow[]>,
    db.getDb()('case_report_task_mentions').whereIn('message_id', messageIds).select('*') as Promise<TaskMentionRow[]>,
  ]);

  const reactionUserIds = [...new Set(reactionRows.map((r) => r.user_id))];
  const reactionUserMap = reactionUserIds.length > 0 ? await resolveUserNamesMap(reactionUserIds) : {};

  const reactionsByMessage = new Map<string, CaseTaskReaction[]>();
  const reactionGrouped = new Map<string, Map<string, Array<{ id: string; name: string }>>>();
  for (const r of reactionRows) {
    const byEmoji = reactionGrouped.get(r.message_id) ?? new Map();
    const users = byEmoji.get(r.emoji) ?? [];
    users.push({ id: r.user_id, name: reactionUserMap[r.user_id] ?? 'Unknown' });
    byEmoji.set(r.emoji, users);
    reactionGrouped.set(r.message_id, byEmoji);
  }
  for (const [msgId, byEmoji] of reactionGrouped.entries()) {
    reactionsByMessage.set(msgId, Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, users })));
  }

  const mentionsByMessage = new Map<string, CaseTaskMention[]>();
  for (const m of mentionRows) {
    const list = mentionsByMessage.get(m.message_id) ?? [];
    list.push({ id: m.id, message_id: m.message_id, mentioned_user_id: m.mentioned_user_id, mentioned_role_id: m.mentioned_role_id, mentioned_name: m.mentioned_name });
    mentionsByMessage.set(m.message_id, list);
  }

  return rows.map((row): CaseTaskMessage => ({
    id: row.id,
    task_id: row.task_id,
    user_id: row.user_id,
    user_name: row.user_id ? resolveUserName(userMap[row.user_id]) : null,
    user_avatar: row.user_id ? resolveUserAvatar(userMap[row.user_id]) : null,
    content: row.content,
    file_url: row.file_url,
    file_name: row.file_name,
    file_size: row.file_size,
    content_type: row.content_type,
    parent_message_id: row.parent_message_id,
    reactions: reactionsByMessage.get(row.id) ?? [],
    mentions: mentionsByMessage.get(row.id) ?? [],
    created_at: toIso(row.created_at)!,
  }));
}

export async function sendTaskMessage(input: {
  taskId: string;
  userId: string;
  companyId: string;
  content: string | null;
  companyStorageRoot: string;
  files: Express.Multer.File[];
  parentMessageId?: string | null;
  mentionedUserIds?: string[];
  mentionedRoleIds?: string[];
}): Promise<CaseTaskMessage> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const caseRow = await getCaseOrThrow(taskRow.case_id);
  const knex = db.getDb();

  // Validate parent message belongs to same task
  let parentMessage: TaskMessageRow | null = null;
  if (input.parentMessageId) {
    const parent = await knex('case_report_task_messages')
      .where({ id: input.parentMessageId, task_id: input.taskId })
      .first() as TaskMessageRow | undefined;
    if (parent) parentMessage = parent;
  }

  // Upload file if provided
  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let contentType: string | null = null;

  if (input.files.length > 0) {
    const file = input.files[0];
    const folder = buildTenantStoragePrefix(input.companyStorageRoot, 'task-messages');
    fileUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folder);
    if (!fileUrl) throw new AppError(500, 'Failed to upload attachment');
    fileName = file.originalname;
    fileSize = file.size;
    contentType = file.mimetype;
  }

  // Check if bump is needed (no messages yet, or last message > 10 min ago)
  const lastMsg = await knex('case_report_task_messages')
    .where({ task_id: input.taskId })
    .orderBy('created_at', 'desc')
    .first('created_at') as { created_at: Date | string } | undefined;

  const shouldBump = !lastMsg || (Date.now() - new Date(lastMsg.created_at).getTime() > 10 * 60 * 1000);

  const [msgRow] = await knex('case_report_task_messages')
    .insert({
      task_id: input.taskId,
      user_id: input.userId,
      content: input.content,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      content_type: contentType,
      parent_message_id: parentMessage?.id ?? null,
    })
    .returning('*') as TaskMessageRow[];

  const mentionedUserIds = input.mentionedUserIds ?? [];
  const mentionedRoleIds = input.mentionedRoleIds ?? [];

  if (mentionedUserIds.length > 0 || mentionedRoleIds.length > 0) {
    const senderMap = await hydrateUsersByIds([input.userId]);
    const senderName = resolveUserName(senderMap[input.userId]) ?? 'Someone';

    await knex('case_report_task_mentions').insert([
      ...mentionedUserIds.map((uid) => ({
        message_id: msgRow.id,
        mentioned_user_id: uid,
        mentioned_role_id: null,
        mentioned_name: null,
      })),
      ...mentionedRoleIds.map((rid) => ({
        message_id: msgRow.id,
        mentioned_user_id: null,
        mentioned_role_id: rid,
        mentioned_name: null,
      })),
    ]);

    // Collect extra users from role mentions
    const roleMemberRows = mentionedRoleIds.length > 0
      ? await knex('user_roles as ur')
          .join('user_company_access as uca', 'ur.user_id', 'uca.user_id')
          .join('users', 'ur.user_id', 'users.id')
          .whereIn('ur.role_id', mentionedRoleIds)
          .andWhere('uca.company_id', input.companyId)
          .andWhere('uca.is_active', true)
          .andWhere('users.is_active', true)
          .select('users.id')
      : [];

    const mentionTargets = Array.from(new Set([
      ...mentionedUserIds,
      ...roleMemberRows.map((r: any) => String(r.id)),
    ])).filter((id) => id !== input.userId);

    for (const targetId of mentionTargets) {
      await createAndDispatchNotification({
        userId: targetId,
        title: 'Task Mention',
        message: `${senderName} mentioned you in task: ${taskRow.description}`,
        type: 'info',
        linkUrl: `/case-reports?caseId=${taskRow.case_id}&taskId=${input.taskId}&messageId=${msgRow.id}`,
      });
    }
  }

  // Reply notification
  const replyNotifiedIds: string[] = [];
  if (parentMessage?.user_id && parentMessage.user_id !== input.userId) {
    const senderMap = await hydrateUsersByIds([input.userId]);
    const senderName = resolveUserName(senderMap[input.userId]) ?? 'Someone';
    await createAndDispatchNotification({
      userId: parentMessage.user_id,
      title: 'Task Reply',
      message: `${senderName} replied to your message in task: ${taskRow.description}`,
      type: 'info',
      linkUrl: `/case-reports?caseId=${taskRow.case_id}&taskId=${input.taskId}&messageId=${msgRow.id}`,
    });
    replyNotifiedIds.push(parentMessage.user_id);
  }

  if (shouldBump && taskRow.discussion_message_id) {
    await knex('case_messages')
      .where({ id: taskRow.discussion_message_id })
      .update({ created_at: new Date(), updated_at: new Date() });

    emitCaseReportEvent('case-report:updated', caseRow.company_id, { caseId: taskRow.case_id });
  }

  emitCaseReportEvent('case-report:task:updated', caseRow.company_id, {
    caseId: taskRow.case_id,
    taskId: input.taskId,
  });

  const userMap = await hydrateUsersByIds([input.userId]);

  return {
    id: msgRow.id,
    task_id: msgRow.task_id,
    user_id: msgRow.user_id,
    user_name: resolveUserName(userMap[input.userId]),
    user_avatar: resolveUserAvatar(userMap[input.userId]),
    content: msgRow.content,
    file_url: msgRow.file_url,
    file_name: msgRow.file_name,
    file_size: msgRow.file_size,
    content_type: msgRow.content_type,
    parent_message_id: msgRow.parent_message_id,
    reactions: [],
    mentions: [],
    created_at: toIso(msgRow.created_at)!,
  };
}

export async function toggleTaskReaction(input: {
  taskId: string;
  messageId: string;
  userId: string;
  emoji: string;
  companyId: string;
}): Promise<{ messageId: string; reactions: CaseTaskReaction[] }> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const caseRow = await getCaseOrThrow(taskRow.case_id);
  const knex = db.getDb();

  const message = await knex('case_report_task_messages')
    .where({ id: input.messageId, task_id: input.taskId })
    .first() as TaskMessageRow | undefined;
  if (!message) throw new AppError(404, 'Message not found');

  const existing = await knex('case_report_task_reactions')
    .where({ message_id: input.messageId, user_id: input.userId, emoji: input.emoji })
    .first();

  if (existing) {
    await knex('case_report_task_reactions').where({ id: existing.id }).delete();
  } else {
    await knex('case_report_task_reactions').insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    });
  }

  const reactionRows = await knex('case_report_task_reactions')
    .where({ message_id: input.messageId })
    .select('*') as TaskReactionRow[];

  const reactionUserIds = [...new Set(reactionRows.map((r) => r.user_id))];
  const reactionUserMap = await resolveUserNamesMap(reactionUserIds);

  const byEmoji = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of reactionRows) {
    const users = byEmoji.get(r.emoji) ?? [];
    users.push({ id: r.user_id, name: reactionUserMap[r.user_id] ?? 'Unknown' });
    byEmoji.set(r.emoji, users);
  }
  const reactions: CaseTaskReaction[] = Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, users }));

  emitCaseReportEvent('case-report:task:updated', caseRow.company_id, {
    caseId: taskRow.case_id,
    taskId: input.taskId,
  });

  return { messageId: input.messageId, reactions };
}

export async function completeTaskForAssignee(input: {
  taskId: string;
  userId: string;
  completedBy: string;
  companyId: string;
}): Promise<CaseTask> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const caseRow = await getCaseOrThrow(taskRow.case_id);
  const knex = db.getDb();

  // Verify the userId is an assignee
  const assigneeRow = await knex('case_report_task_assignees')
    .where({ task_id: input.taskId, user_id: input.userId })
    .first() as AssigneeRow | undefined;

  if (!assigneeRow) throw new AppError(404, 'User is not an assignee of this task');
  if (assigneeRow.completed_at) throw new AppError(400, 'This assignee has already completed the task');

  await knex('case_report_task_assignees')
    .where({ id: assigneeRow.id })
    .update({
      completed_at: new Date(),
      completed_by: input.completedBy,
    });

  // Check if all assignees are now done
  const allAssignees = await knex('case_report_task_assignees')
    .where({ task_id: input.taskId })
    .select('*') as AssigneeRow[];

  const doneCount = allAssignees.filter((a) => a.completed_at || a.id === assigneeRow.id).length;
  const allDone = doneCount === allAssignees.length;

  const userMap = await hydrateUsersByIds([input.userId, input.completedBy]);
  const assigneeName = resolveUserName(userMap[input.userId]) ?? 'Someone';

  // Update the discussion bubble content
  if (taskRow.discussion_message_id) {
    const updatedBubble = `📋 Task: ${taskRow.description} — ${doneCount} of ${allAssignees.length} assignee${allAssignees.length === 1 ? '' : 's'} done`;
    await knex('case_messages')
      .where({ id: taskRow.discussion_message_id })
      .update({ content: updatedBubble, created_at: new Date(), updated_at: new Date() });
  }

  // System message
  const systemContent = allDone
    ? `✅ Task completed: ${taskRow.description}`
    : `✅ ${assigneeName} completed their task: ${taskRow.description}`;

  await knex('case_messages').insert({
    case_id: taskRow.case_id,
    user_id: input.completedBy,
    content: systemContent,
    is_system: true,
  });

  emitCaseReportEvent('case-report:task:updated', caseRow.company_id, {
    caseId: taskRow.case_id,
    taskId: input.taskId,
  });

  emitCaseReportEvent('case-report:message', caseRow.company_id, { caseId: taskRow.case_id });

  const [task] = await buildTasks([taskRow]);
  return task;
}
