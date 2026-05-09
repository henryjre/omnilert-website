import type { Request, Response, NextFunction } from 'express';
import * as aicService from '../services/aicVariance.service.js';
import * as aicTaskService from '../services/aicVarianceTask.service.js';

function getUploadedFiles(req: Request): Express.Multer.File[] {
  const files = (req as Request & { files?: Express.Multer.File[] | Record<string, Express.Multer.File[]> }).files;
  if (!files) return [];
  return Array.isArray(files) ? files : Object.values(files).flat();
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : undefined;
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

export async function list(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;
    const { status, search, date_from, date_to, sort_order, branchIds } = req.query as Record<string, string>;

    const records = await aicService.listAicRecords({
      companyId,
      userId,
      roles,
      permissions,
      userBranchIds,
      branchIds: branchIds ? branchIds.split(',').map((id) => id.trim()).filter(Boolean) : undefined,
      status: (status as 'open' | 'resolved') || undefined,
      search,
      date_from,
      date_to,
      sort_order: (sort_order as 'asc' | 'desc') || undefined,
    });

    res.json({ success: true, data: { items: records, total: records.length } });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;

    const record = await aicService.getAicRecord({
      companyId,
      userId,
      aicId: String(req.params.id),
      roles,
      permissions,
      userBranchIds,
    });
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function mentionables(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const data = await aicService.getMentionables(companyId);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

export async function resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId } = req.user!;

    const record = await aicService.resolveAicRecord({
      companyId,
      userId,
      aicId: String(req.params.id),
    });
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function requestVN(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId } = req.user!;
    const { description, targetUserIds } = req.body as { description: string; targetUserIds: string[] };

    const record = await aicService.requestViolationNotice({
      companyId,
      userId,
      aicId: String(req.params.id),
      description,
      targetUserIds,
    });
    res.json({ success: true, data: record });
  } catch (err) {
    next(err);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = req.user!;
    await aicService.leaveAicDiscussion({ aicId: String(req.params.id), userId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function mute(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = req.user!;
    const result = await aicService.muteAicDiscussion({ aicId: String(req.params.id), userId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { sub: userId } = req.user!;
    await aicService.markAicRead({ aicId: String(req.params.id), userId });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;
    const messages = await aicService.listMessages({
      companyId,
      aicId: String(req.params.id),
      userId,
      roles,
      permissions,
      userBranchIds,
    });
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;
    const { content, parentMessageId } = req.body as {
      content: string;
      parentMessageId?: string;
    };
    const mentionedUserIds =
      parseStringArray(req.body.mentionedUserIds) ?? parseStringArray(req.body['mentionedUserIds[]']) ?? [];
    const mentionedRoleIds =
      parseStringArray(req.body.mentionedRoleIds) ?? parseStringArray(req.body['mentionedRoleIds[]']) ?? [];
    const files = getUploadedFiles(req);

    const messages = await aicService.sendMessage({
      companyId,
      aicId: String(req.params.id),
      userId,
      roles,
      permissions,
      userBranchIds,
      content,
      parentMessageId,
      mentionedUserIds,
      mentionedRoleIds,
      files,
    });
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

export async function editMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;
    const { content } = req.body as { content: string };

    await aicService.editMessage({
      companyId,
      aicId: String(req.params.id),
      userId,
      roles,
      messageId: String(req.params.messageId),
      content,
      permissions,
      userBranchIds,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;

    await aicService.deleteMessage({
      companyId,
      aicId: String(req.params.id),
      userId,
      roles,
      messageId: String(req.params.messageId),
      permissions,
      userBranchIds,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function toggleReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId, roles = [], permissions = [], branchIds: userBranchIds = [] } = req.user!;
    const { emoji } = req.body as { emoji: string };

    await aicService.toggleReaction({
      companyId,
      aicId: String(req.params.id),
      userId,
      roles,
      messageId: String(req.params.messageId),
      emoji,
      permissions,
      userBranchIds,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function listTasks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tasks = await aicTaskService.listTasks(String(req.params.id));
    res.json({ success: true, data: tasks });
  } catch (err) {
    next(err);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId } = req.user!;
    const { description, assigneeUserIds, sourceMessageId } = req.body as {
      description: string;
      assigneeUserIds: string[];
      sourceMessageId?: string;
    };

    const task = await aicTaskService.createTask({
      aicId: String(req.params.id),
      createdBy: userId,
      companyId,
      description,
      assigneeUserIds: assigneeUserIds ?? [],
      sourceMessageId,
    });
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
}

export async function getTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const task = await aicTaskService.getTask(String(req.params.taskId));
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
}

export async function listTaskMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const messages = await aicTaskService.listTaskMessages(String(req.params.taskId));
    res.json({ success: true, data: messages });
  } catch (err) {
    next(err);
  }
}

export async function sendTaskMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId } = req.user!;
    const { content, parentMessageId, mentionedUserIds, mentionedRoleIds } = req.body as {
      content?: string;
      parentMessageId?: string;
      mentionedUserIds?: string[];
      mentionedRoleIds?: string[];
    };
    const files = (req.files as Express.Multer.File[]) ?? [];

    const message = await aicTaskService.sendTaskMessage({
      taskId: String(req.params.taskId),
      userId,
      companyId,
      content: content ?? null,
      files,
      parentMessageId,
      mentionedUserIds,
      mentionedRoleIds,
    });
    res.json({ success: true, data: message });
  } catch (err) {
    next(err);
  }
}

export async function completeTask(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: completedBy } = req.user!;
    const { userId } = req.body as { userId?: string };

    const task = await aicTaskService.completeTaskForAssignee({
      taskId: String(req.params.taskId),
      userId: userId ?? completedBy,
      completedBy,
      companyId,
    });
    res.json({ success: true, data: task });
  } catch (err) {
    next(err);
  }
}

export async function toggleTaskReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { companyId } = req.companyContext!;
    const { sub: userId } = req.user!;
    const { emoji } = req.body as { emoji: string };

    await aicTaskService.toggleTaskReaction({
      taskId: String(req.params.taskId),
      messageId: String(req.params.messageId),
      userId,
      emoji,
      companyId,
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
