import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import * as taskService from '../services/caseReportTask.service.js';

export async function listTasks(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await taskService.listTasks(String(req.params.id));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createTask(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await taskService.createTask({
      caseId: String(req.params.id),
      createdBy: req.user!.sub,
      companyId: req.companyContext!.companyId,
      description: String(req.body.description ?? ''),
      assigneeUserIds: Array.isArray(req.body.assigneeUserIds) ? req.body.assigneeUserIds : [],
      sourceMessageId: typeof req.body.sourceMessageId === 'string' ? req.body.sourceMessageId : null,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getTask(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await taskService.getTask(String(req.params.taskId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listTaskMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await taskService.listTaskMessages(String(req.params.taskId));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function sendTaskMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const content = String(req.body.content ?? '').trim();
    const files = Array.isArray(req.files) ? req.files as Express.Multer.File[] : [];
    if (!content && files.length === 0) throw new AppError(400, 'Message content or attachment is required');
    const { companyId, companyStorageRoot } = req.companyContext!;

    let mentionedUserIds: string[] = [];
    let mentionedRoleIds: string[] = [];
    try {
      mentionedUserIds = Array.isArray(req.body.mentionedUserIds)
        ? req.body.mentionedUserIds
        : typeof req.body.mentionedUserIds === 'string'
          ? JSON.parse(req.body.mentionedUserIds)
          : [];
      mentionedRoleIds = Array.isArray(req.body.mentionedRoleIds)
        ? req.body.mentionedRoleIds
        : typeof req.body.mentionedRoleIds === 'string'
          ? JSON.parse(req.body.mentionedRoleIds)
          : [];
    } catch { /* invalid JSON, keep empty arrays */ }

    const data = await taskService.sendTaskMessage({
      taskId: String(req.params.taskId),
      userId: req.user!.sub,
      companyId,
      content: content || null,
      companyStorageRoot,
      files,
      parentMessageId: typeof req.body.parentMessageId === 'string' ? req.body.parentMessageId : null,
      mentionedUserIds,
      mentionedRoleIds,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function toggleTaskReaction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await taskService.toggleTaskReaction({
      taskId: String(req.params.taskId),
      messageId: String(req.params.messageId),
      userId: req.user!.sub,
      emoji: String(req.body.emoji ?? ''),
      companyId: req.companyContext!.companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function completeTask(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = typeof req.body.userId === 'string' ? req.body.userId : req.user!.sub;
    const data = await taskService.completeTaskForAssignee({
      taskId: String(req.params.taskId),
      userId,
      completedBy: req.user!.sub,
      companyId: req.companyContext!.companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
