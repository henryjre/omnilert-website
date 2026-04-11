import type { NextFunction, Request, Response } from 'express';
import * as caseReportService from '../services/caseReport.service.js';

function getUploadedFiles(req: Request): Express.Multer.File[] {
  const files = (req as Request & { files?: Express.Multer.File[] | Record<string, Express.Multer.File[]> }).files;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

function parseJsonArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map((item) => String(item)) : undefined;
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.listCaseReports({
      userId: req.user!.sub,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      dateFrom: typeof req.query.date_from === 'string' ? req.query.date_from : undefined,
      dateTo: typeof req.query.date_to === 'string' ? req.query.date_to : undefined,
      sortOrder: typeof req.query.sort_order === 'string' ? req.query.sort_order : undefined,
      vnOnly: req.query.vn_only === 'true',
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.getCaseReport({
      userId: req.user!.sub,
      caseId: String(req.params.id),
      markRead: true,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.createCaseReport({
      companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      title: String(req.body.title ?? ''),
      description: String(req.body.description ?? ''),
      branchId: typeof req.body.branchId === 'string' ? req.body.branchId : null,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listCreateBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.listCreateBranches({
      userId: req.user!.sub,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateCorrectiveAction(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.updateCorrectiveAction({
      companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
      correctiveAction: String(req.body.correctiveAction ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateResolution(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.updateResolution({
      companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
      resolution: String(req.body.resolution ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function close(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.closeCase({
      companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function requestViolationNotice(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { description, targetUserIds } = req.body as { description: string; targetUserIds: string[] };
    const result = await caseReportService.requestViolationNotice({
      companyId,
      userId: req.user!.sub,
      caseId: String(req.params.id),
      description,
      targetUserIds,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const file = getUploadedFiles(req)[0];
    const { companyId, companyStorageRoot } = req.companyContext!;
    const data = await caseReportService.uploadAttachment({
      companyId,
      companyStorageRoot,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
      file,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteAttachment(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    await caseReportService.deleteAttachment({
      companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
      attachmentId: String(req.params.attachmentId),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.listMessages({
      caseId: String(req.params.id),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId, companyStorageRoot } = req.companyContext!;
    const data = await caseReportService.sendMessage({
      companyId,
      companyStorageRoot,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
      content: String(req.body.content ?? ''),
      parentMessageId: typeof req.body.parentMessageId === 'string' && req.body.parentMessageId
        ? req.body.parentMessageId
        : undefined,
      mentionedUserIds: parseJsonArray(req.body.mentionedUserIds) ?? [],
      mentionedRoleIds: parseJsonArray(req.body.mentionedRoleIds) ?? [],
      files: getUploadedFiles(req),
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function toggleReaction(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.toggleReaction({
      companyId,
      userId: req.user!.sub,
      caseId: String(req.params.id),
      messageId: String(req.params.messageId),
      emoji: String(req.body.emoji ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.leaveDiscussion({
      userId: req.user!.sub,
      caseId: String(req.params.id),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function mute(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.toggleMute({
      userId: req.user!.sub,
      caseId: String(req.params.id),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function mentionables(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.getMentionables({
      companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await caseReportService.markCaseRead({
      userId: req.user!.sub,
      caseId: String(req.params.id),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function editMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await caseReportService.editMessage({
      companyId,
      userId: req.user!.sub,
      caseId: String(req.params.id),
      messageId: String(req.params.messageId),
      content: String(req.body.content ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    await caseReportService.deleteMessage({
      companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      caseId: String(req.params.id),
      messageId: String(req.params.messageId),
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
