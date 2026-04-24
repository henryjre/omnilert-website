import type { CaseTask, CaseTaskAssignee, CaseTaskMessage } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { hydrateUsersByIds } from './globalUser.service.js';
import { logger } from '../utils/logger.js';

// ── Row types ─────────────────────────────────────────────────────────────────

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
  content: string;
  created_at: Date | string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function emitCaseReportEvent(event: string, companyId: string, payload: unknown): void {
  try {
    (getIO().of('/case-reports').to(`company:${companyId}`) as any).emit(event, payload);
  } catch {
    logger.warn({ companyId, event }, 'Socket.IO not available for case report task event');
  }
}

async function getCaseOrThrow(caseId: string): Promise<{ id: string; company_id: string; status: string }> {
  const row = await db.getDb()('case_reports').where({ id: caseId }).first('id', 'company_id', 'status');
  if (!row) throw new AppError(404, 'Case report not found');
  return row as { id: string; company_id: string; status: string };
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

  // Load last message timestamps per task
  const lastMsgRows = await db.getDb()('case_report_task_messages')
    .whereIn('task_id', taskIds)
    .groupBy('task_id')
    .select('task_id')
    .max('created_at as last_message_at') as { task_id: string; last_message_at: Date | string | null }[];
  const lastMsgMap: Record<string, string | null> = {};
  for (const r of lastMsgRows) lastMsgMap[r.task_id] = toIso(r.last_message_at);

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
      user_name: userMap[a.user_id]?.name ?? null,
      user_avatar: userMap[a.user_id]?.avatarUrl ?? null,
      completed_at: toIso(a.completed_at),
      completed_by: a.completed_by,
      completed_by_name: a.completed_by ? (userMap[a.completed_by]?.name ?? null) : null,
    }));

    const srcMsg = row.source_message_id ? sourceMessageMap[row.source_message_id] : null;

    return {
      id: row.id,
      case_id: row.case_id,
      created_by: row.created_by,
      created_by_name: row.created_by ? (userMap[row.created_by]?.name ?? null) : null,
      source_message_id: row.source_message_id,
      source_message_content: srcMsg?.content ?? null,
      source_message_user_name: srcMsg?.user_id ? (userMap[srcMsg.user_id]?.name ?? null) : null,
      description: row.description,
      discussion_message_id: row.discussion_message_id,
      assignees,
      created_at: toIso(row.created_at)!,
      updated_at: toIso(row.updated_at)!,
      last_message_at: lastMsgMap[row.id] ?? null,
    };
  });
}

// ── Exported service functions ────────────────────────────────────────────────

export async function createTask(input: {
  caseId: string;
  createdBy: string;
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

  // Create a discussion-facing case message (the "task bubble")
  const creatorName = (await hydrateUsersByIds([input.createdBy]))[input.createdBy]?.name ?? 'Someone';
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

  const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])];
  const userMap = userIds.length > 0 ? await hydrateUsersByIds(userIds) : {};

  return rows.map((row): CaseTaskMessage => ({
    id: row.id,
    task_id: row.task_id,
    user_id: row.user_id,
    user_name: row.user_id ? (userMap[row.user_id]?.name ?? null) : null,
    user_avatar: row.user_id ? (userMap[row.user_id]?.avatarUrl ?? null) : null,
    content: row.content,
    created_at: toIso(row.created_at)!,
  }));
}

export async function sendTaskMessage(input: {
  taskId: string;
  userId: string;
  content: string;
}): Promise<CaseTaskMessage> {
  const taskRow = await getTaskOrThrow(input.taskId);
  const caseRow = await getCaseOrThrow(taskRow.case_id);

  const knex = db.getDb();

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
    })
    .returning('*') as TaskMessageRow[];

  if (shouldBump && taskRow.discussion_message_id) {
    await knex('case_messages')
      .where({ id: taskRow.discussion_message_id })
      .update({ updated_at: new Date() });

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
    user_name: userMap[input.userId]?.name ?? null,
    user_avatar: userMap[input.userId]?.avatarUrl ?? null,
    content: msgRow.content,
    created_at: toIso(msgRow.created_at)!,
  };
}

export async function completeTaskForAssignee(input: {
  taskId: string;
  userId: string;
  completedBy: string;
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
  const assigneeName = userMap[input.userId]?.name ?? 'Someone';

  // Update the discussion bubble content
  if (taskRow.discussion_message_id) {
    const updatedBubble = `📋 Task: ${taskRow.description} — ${doneCount} of ${allAssignees.length} assignee${allAssignees.length === 1 ? '' : 's'} done`;
    await knex('case_messages')
      .where({ id: taskRow.discussion_message_id })
      .update({ content: updatedBubble, updated_at: new Date() });
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
