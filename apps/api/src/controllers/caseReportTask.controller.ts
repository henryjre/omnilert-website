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
    if (!content) throw new AppError(400, 'Message content is required');
    const data = await taskService.sendTaskMessage({
      taskId: String(req.params.taskId),
      userId: req.user!.sub,
      content,
    });
    res.status(201).json({ success: true, data });
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
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
