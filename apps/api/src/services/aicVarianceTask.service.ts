import type { AicTask, AicTaskAssignee, AicTaskMessage, AicTaskReaction, AicTaskMention } from '@omnilert/shared';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { logger } from '../utils/logger.js';
import { buildTenantStoragePrefix, uploadFile } from './storage.service.js';
import { createAndDispatchNotification } from './notification.service.js';
import { emitAicEvent } from './aicVarianceWebhook.service.js';

// ── Row types ─────────────────────────────────────────────────────────────────

type TaskRow = {
  id: string;
  aic_record_id: string;
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

async function getAicOrThrow(aicId: string): Promise<{ id: string; company_id: string; status: string; aic_number: number }> {
  const row = await db.getDb()('aic_records').where({ id: aicId }).first('id', 'company_id', 'status', 'aic_number');
  if (!row) throw new AppError(404, 'AIC record not found');
  return row as { id: string; company_id: string; status: string; aic_number: number };
}

async function getTaskOrThrow(taskId: string): Promise<TaskRow> {
  const row = await db.getDb()('aic_tasks').where({ id: taskId }).first();
  if (!row) throw new AppError(404, 'Task not found');
  return row as TaskRow;
}

async function buildTasks(rows: TaskRow[]): Promise<AicTask[]> {
  if (rows.length === 0) return [];

  const taskIds = rows.map((r) => r.id);
  const creatorIds = rows.map((r) => r.created_by).filter(Boolean) as string[];

  const assigneeRows = (await db.getDb()('aic_task_assignees').whereIn('task_id', taskIds).select('*')) as AssigneeRow[];

  const assigneeUserIds = [...new Set([
    ...assigneeRows.map((a) => a.user_id),
    ...assigneeRows.map((a) => a.completed_by).filter(Boolean) as string[],
  ])];

  const allUserIds = [...new Set([...creatorIds, ...assigneeUserIds])];
  const userMap = allUserIds.length > 0 ? await hydrateUsersByIds(allUserIds) : {};

  const sourceMessageIds = rows.map((r) => r.source_message_id).filter(Boolean) as string[];
  const sourceMessageMap: Record<string, { content: string; user_id: string | null }> = {};
  if (sourceMessageIds.length > 0) {
    const msgs = (await db.getDb()('aic_messages').whereIn('id', sourceMessageIds).select('id', 'content', 'user_id')) as { id: string; content: string; user_id: string | null }[];
    for (const m of msgs) sourceMessageMap[m.id] = m;
  }

  const lastMsgRows = (await db.getDb()('aic_task_messages as m')
    .whereIn('m.task_id', taskIds)
    .whereRaw('m.created_at = (select max(m2.created_at) from aic_task_messages m2 where m2.task_id = m.task_id)')
    .select('m.task_id', 'm.content', 'm.created_at', 'm.user_id')) as { task_id: string; content: string; created_at: Date | string; user_id: string | null }[];

  const lastMsgUserIds = [...new Set(lastMsgRows.map((r) => r.user_id).filter(Boolean) as string[])];
  const extraUserIds = lastMsgUserIds.filter((id) => !(userMap as any)[id]);
  if (extraUserIds.length > 0) {
    const extra = await hydrateUsersByIds(extraUserIds);
    Object.assign(userMap, extra);
  }

  const lastMsgMap: Record<string, { at: string | null; content: string | null; userId: string | null }> = {};
  for (const r of lastMsgRows) {
    lastMsgMap[r.task_id] = { at: toIso(r.created_at), content: r.content, userId: r.user_id };
  }

  const msgCountRows = (await db.getDb()('aic_task_messages').whereIn('task_id', taskIds).groupBy('task_id').select('task_id').count<{ task_id: string; count: string }[]>({ count: '*' })) as any[];
  const msgCountMap: Record<string, number> = {};
  for (const r of msgCountRows) msgCountMap[r.task_id] = Number(r.count);

  const assigneesByTask: Record<string, AssigneeRow[]> = {};
  for (const a of assigneeRows) {
    if (!assigneesByTask[a.task_id]) assigneesByTask[a.task_id] = [];
    assigneesByTask[a.task_id].push(a);
  }

  return rows.map((row): AicTask => {
    const assignees: AicTaskAssignee[] = (assigneesByTask[row.id] ?? []).map((a) => ({
      id: a.id,
      task_id: a.task_id,
      user_id: a.user_id,
      user_name: resolveUserName((userMap as any)[a.user_id]),
      user_avatar: resolveUserAvatar((userMap as any)[a.user_id]),
      completed_at: toIso(a.completed_at),
      completed_by: a.completed_by,
      completed_by_name: resolveUserName((userMap as any)[a.completed_by ?? ''] ?? null),
    }));

    const srcMsg = row.source_message_id ? sourceMessageMap[row.source_message_id] : null;

    return {
      id: row.id,
      aic_record_id: row.aic_record_id,
      created_by: row.created_by,
      created_by_name: resolveUserName((userMap as any)[row.created_by ?? ''] ?? null),
      source_message_id: row.source_message_id,
      discussion_message_id: row.discussion_message_id,
      source_message_content: srcMsg?.content ?? null,
      source_message_user_name: srcMsg?.user_id ? resolveUserName((userMap as any)[srcMsg.user_id] ?? null) : null,
      description: row.description,
      assignees,
      created_at: toIso(row.created_at)!,
      updated_at: toIso(row.updated_at)!,
      last_message_at: lastMsgMap[row.id]?.at ?? null,
      last_message_content: lastMsgMap[row.id]?.content ?? null,
      last_message_user_name: resolveUserName((userMap as any)[lastMsgMap[row.id]?.userId ?? ''] ?? null),
      last_message_user_avatar: resolveUserAvatar((userMap as any)[lastMsgMap[row.id]?.userId ?? ''] ?? null),
      message_count: msgCountMap[row.id] ?? 0,
    };
  });
}

// ── Public API ─────────────────────────────────────────────────────────────────

export async function createTask(input: {
  aicId: string;
  createdBy: string;
  companyId: string;
  description: string;
  assigneeUserIds: string[];
  sourceMessageId?: string | null;
}): Promise<AicTask> {
  const aicRow = await getAicOrThrow(input.aicId);

  const [taskRow] = (await db.getDb()('aic_tasks')
    .insert({
      aic_record_id: input.aicId,
      created_by: input.createdBy,
      description: input.description,
      source_message_id: input.sourceMessageId ?? null,
    })
    .returning('*')) as TaskRow[];

  if (input.assigneeUserIds.length > 0) {
    await db.getDb()('aic_task_assignees').insert(
      input.assigneeUserIds.map((userId) => ({ task_id: taskRow.id, user_id: userId })),
    );
  }

  const aicNumber = String(aicRow.aic_number).padStart(4, '0');
  const creatorUsers = await hydrateUsersByIds([input.createdBy]);
  const creatorName = resolveUserName((creatorUsers as any)[input.createdBy]) ?? 'Someone';

  for (const assigneeId of input.assigneeUserIds) {
    if (assigneeId === input.createdBy) continue;
    await createAndDispatchNotification({
      userId: assigneeId,
      companyId: input.companyId,
      title: 'AIC Variance Task',
      message: `${creatorName} assigned you a task in AIC ${aicNumber}: ${input.description}`,
      type: 'info',
      linkUrl: `/aic-variance?aicId=${input.aicId}`,
    });
  }

  const assigneeCount = input.assigneeUserIds.length;
  const bubbleContent = `Task: ${input.description} - 0 of ${assigneeCount} assignee${assigneeCount === 1 ? '' : 's'} done`;

  const [discussionMsg] = (await db.getDb()('aic_messages')
    .insert({
      aic_record_id: input.aicId,
      user_id: input.createdBy,
      content: bubbleContent,
      is_system: false,
      created_at: new Date(),
      updated_at: new Date(),
    })
    .returning('id')) as { id: string }[];

  await db.getDb()('aic_tasks')
    .where({ id: taskRow.id })
    .update({ discussion_message_id: discussionMsg.id, updated_at: new Date() });

  await db.getDb()('aic_messages').insert({
    aic_record_id: input.aicId,
    user_id: input.createdBy,
    content: `${creatorName} created a task: ${input.description}`,
    is_system: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  emitAicEvent('aic-variance:task:created', aicRow.company_id, { aicId: input.aicId, taskId: taskRow.id });
  emitAicEvent('aic-variance:message', aicRow.company_id, { aicId: input.aicId });

  const [task] = await buildTasks([{ ...taskRow, discussion_message_id: discussionMsg.id }]);
  return task;
}

export async function listTasks(aicId: string): Promise<AicTask[]> {
  await getAicOrThrow(aicId);
  const rows = (await db.getDb()('aic_tasks').where({ aic_record_id: aicId }).orderBy('created_at', 'asc')) as TaskRow[];
  return buildTasks(rows);
}

export async function getTask(taskId: string): Promise<AicTask> {
  const row = await getTaskOrThrow(taskId);
  const [task] = await buildTasks([row]);
  return task;
}

export async function listTaskMessages(taskId: string): Promise<AicTaskMessage[]> {
  await getTaskOrThrow(taskId);

  const rows = (await db.getDb()('aic_task_messages').where({ task_id: taskId }).orderBy('created_at', 'asc')) as TaskMessageRow[];
  if (rows.length === 0) return [];

  const messageIds = rows.map((r) => r.id);
  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
  const userMap = userIds.length > 0 ? await hydrateUsersByIds(userIds) : {};

  const [reactionRows, mentionRows] = await Promise.all([
    db.getDb()('aic_task_message_reactions').whereIn('message_id', messageIds).select('*') as Promise<any[]>,
    db.getDb()('aic_task_message_mentions').whereIn('message_id', messageIds).select('*') as Promise<any[]>,
  ]);

  const reactionUserIds = [...new Set(reactionRows.map((r: any) => r.user_id))];
  const reactionUserMap: Record<string, string> = {};
  if (reactionUserIds.length > 0) {
    const ru = await hydrateUsersByIds(reactionUserIds);
    for (const [id, u] of Object.entries(ru)) {
      reactionUserMap[id] = resolveUserName(u) ?? 'Unknown';
    }
  }

  const reactionsByMessage = new Map<string, AicTaskReaction[]>();
  const grouped = new Map<string, Map<string, Array<{ id: string; name: string }>>>();
  for (const r of reactionRows) {
    const byEmoji = grouped.get(r.message_id) ?? new Map();
    const users = byEmoji.get(r.emoji) ?? [];
    users.push({ id: r.user_id, name: reactionUserMap[r.user_id] ?? 'Unknown' });
    byEmoji.set(r.emoji, users);
    grouped.set(r.message_id, byEmoji);
  }
  for (const [msgId, byEmoji] of grouped.entries()) {
    reactionsByMessage.set(msgId, Array.from(byEmoji.entries()).map(([emoji, users]) => ({ emoji, users })));
  }

  const mentionsByMessage = new Map<string, AicTaskMention[]>();
  for (const m of mentionRows) {
    const list = mentionsByMessage.get(m.message_id) ?? [];
    list.push({
      mentioned_user_id: m.mentioned_user_id ?? null,
      mentioned_role_id: m.mentioned_role_id ?? null,
      mentioned_name: m.mentioned_name ?? null,
    });
    mentionsByMessage.set(m.message_id, list);
  }

  return rows.map((row): AicTaskMessage => ({
    id: row.id,
    task_id: row.task_id,
    user_id: row.user_id,
    user_name: row.user_id ? resolveUserName((userMap as any)[row.user_id]) : null,
    user_avatar: row.user_id ? resolveUserAvatar((userMap as any)[row.user_id]) : null,
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
  files: Express.Multer.File[];
  parentMessageId?: string | null;
  mentionedUserIds?: string[];
  mentionedRoleIds?: string[];
}): Promise<AicTaskMessage> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const aicRow = await getAicOrThrow(taskRow.aic_record_id);

  let fileUrl: string | null = null;
  let fileName: string | null = null;
  let fileSize: number | null = null;
  let contentType: string | null = null;

  if (input.files.length > 0) {
    const file = input.files[0]!;
    const folder = `${buildTenantStoragePrefix(input.companyId)}/aic-task-messages`;
    fileUrl = await uploadFile(file.buffer, file.originalname, file.mimetype, folder);
    if (!fileUrl) throw new AppError(500, 'Failed to upload attachment');
    fileName = file.originalname;
    fileSize = file.size;
    contentType = file.mimetype;
  }

  const [msgRow] = (await db.getDb()('aic_task_messages')
    .insert({
      task_id: input.taskId,
      user_id: input.userId,
      content: input.content,
      file_url: fileUrl,
      file_name: fileName,
      file_size: fileSize,
      content_type: contentType,
      parent_message_id: input.parentMessageId ?? null,
    })
    .returning('*')) as TaskMessageRow[];

  if ((input.mentionedUserIds?.length ?? 0) > 0 || (input.mentionedRoleIds?.length ?? 0) > 0) {
    await db.getDb()('aic_task_message_mentions').insert([
      ...(input.mentionedUserIds ?? []).map((uid) => ({
        message_id: msgRow.id,
        mentioned_user_id: uid,
        mentioned_role_id: null,
      })),
      ...(input.mentionedRoleIds ?? []).map((rid) => ({
        message_id: msgRow.id,
        mentioned_user_id: null,
        mentioned_role_id: rid,
      })),
    ]);
  }

  emitAicEvent('aic-variance:task:updated', aicRow.company_id, { aicId: taskRow.aic_record_id, taskId: input.taskId });

  const userMap = await hydrateUsersByIds([input.userId]);
  return {
    id: msgRow.id,
    task_id: msgRow.task_id,
    user_id: msgRow.user_id,
    user_name: resolveUserName((userMap as any)[input.userId]),
    user_avatar: resolveUserAvatar((userMap as any)[input.userId]),
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
}): Promise<void> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const aicRow = await getAicOrThrow(taskRow.aic_record_id);

  const existing = await db.getDb()('aic_task_message_reactions')
    .where({ message_id: input.messageId, user_id: input.userId, emoji: input.emoji })
    .first();

  if (existing) {
    await db.getDb()('aic_task_message_reactions').where({ id: existing.id }).delete();
  } else {
    await db.getDb()('aic_task_message_reactions').insert({
      message_id: input.messageId,
      user_id: input.userId,
      emoji: input.emoji,
    });
  }

  emitAicEvent('aic-variance:task:updated', aicRow.company_id, { aicId: taskRow.aic_record_id, taskId: input.taskId });
}

export async function completeTaskForAssignee(input: {
  taskId: string;
  userId: string;
  completedBy: string;
  companyId: string;
}): Promise<AicTask> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const aicRow = await getAicOrThrow(taskRow.aic_record_id);

  if (aicRow.company_id !== input.companyId) throw new AppError(404, 'Task not found');
  if (taskRow.created_by !== input.completedBy) {
    throw new AppError(403, 'Only the task creator can mark assignees as done');
  }

  const assigneeRow = (await db.getDb()('aic_task_assignees')
    .where({ task_id: input.taskId, user_id: input.userId })
    .first()) as AssigneeRow | undefined;

  if (!assigneeRow) throw new AppError(404, 'User is not an assignee of this task');
  if (assigneeRow.completed_at) throw new AppError(400, 'This assignee has already completed the task');

  await db.getDb()('aic_task_assignees').where({ id: assigneeRow.id }).update({
    completed_at: new Date(),
    completed_by: input.completedBy,
  });

  const allAssignees = (await db.getDb()('aic_task_assignees')
    .where({ task_id: input.taskId })
    .select('*')) as AssigneeRow[];

  const doneCount = allAssignees.filter((a) => a.completed_at || a.id === assigneeRow.id).length;
  const allDone = doneCount === allAssignees.length;

  const userMap = await hydrateUsersByIds([input.userId]);
  const assigneeName = resolveUserName((userMap as any)[input.userId]) ?? 'Someone';

  if (taskRow.discussion_message_id) {
    const updatedBubble = `Task: ${taskRow.description} - ${doneCount} of ${allAssignees.length} assignee${allAssignees.length === 1 ? '' : 's'} done`;
    await db.getDb()('aic_messages')
      .where({ id: taskRow.discussion_message_id })
      .update({ content: updatedBubble, created_at: new Date(), updated_at: new Date() });
  }

  const systemContent = allDone
    ? `Task completed: ${taskRow.description}`
    : `${assigneeName} completed their task: ${taskRow.description}`;

  await db.getDb()('aic_messages').insert({
    aic_record_id: taskRow.aic_record_id,
    user_id: input.completedBy,
    content: systemContent,
    is_system: true,
    created_at: new Date(),
    updated_at: new Date(),
  });

  emitAicEvent('aic-variance:task:updated', aicRow.company_id, { aicId: taskRow.aic_record_id, taskId: input.taskId });
  emitAicEvent('aic-variance:message', aicRow.company_id, { aicId: taskRow.aic_record_id });

  const [task] = await buildTasks([taskRow]);
  return task;
}
