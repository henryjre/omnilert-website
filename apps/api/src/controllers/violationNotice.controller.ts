import type { NextFunction, Request, Response } from 'express';
import * as violationNoticeService from '../services/violationNotice.service.js';
import { AppError } from '../middleware/errorHandler.js';
import {
  resolveGlobalStoreAuditContext,
  syncGlobalStoreAuditProjectionByAuditId,
} from '../services/globalStoreAuditIndex.service.js';
import { emitStoreAuditEvent } from '../services/storeAuditRealtime.service.js';

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
    const data = await violationNoticeService.listViolationNotices({
      tenantDb: req.tenantDb!,
      userId: req.user!.sub,
      companyId: req.user!.companyId,
      filters: {
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
        dateFrom: typeof req.query.date_from === 'string' ? req.query.date_from : undefined,
        dateTo: typeof req.query.date_to === 'string' ? req.query.date_to : undefined,
        category: typeof req.query.category === 'string' ? req.query.category : undefined,
        targetUserId: typeof req.query.target_user_id === 'string' ? req.query.target_user_id : undefined,
        sortOrder: typeof req.query.sort_order === 'string' ? req.query.sort_order : undefined,
      },
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.getViolationNotice({
      tenantDb: req.tenantDb!,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.createViolationNotice({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      description: String(req.body.description ?? ''),
      targetUserIds: req.body.targetUserIds,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.confirmViolationNotice({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.rejectViolationNotice({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
      rejectionReason: String(req.body.rejectionReason ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function issue(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.issueViolationNotice({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function uploadIssuanceFile(req: Request, res: Response, next: NextFunction) {
  try {
    const file = getUploadedFiles(req)[0];
    const data = await violationNoticeService.uploadIssuanceFile({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      companyStorageRoot: req.companyContext?.companyStorageRoot ?? '',
      userId: req.user!.sub,
      vnId: req.params.id as string,
      file,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function confirmIssuance(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.confirmIssuance({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function uploadDisciplinaryFile(req: Request, res: Response, next: NextFunction) {
  try {
    const file = getUploadedFiles(req)[0];
    const data = await violationNoticeService.uploadDisciplinaryFile({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      companyStorageRoot: req.companyContext?.companyStorageRoot ?? '',
      userId: req.user!.sub,
      vnId: req.params.id as string,
      file,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function complete(req: Request, res: Response, next: NextFunction) {
  try {
    const epiDecrease = Number(req.body.epiDecrease ?? 0);
    if (isNaN(epiDecrease) || epiDecrease < 0 || epiDecrease > 5) {
      throw new AppError(400, 'epiDecrease must be a number between 0 and 5');
    }
    const data = await violationNoticeService.completeViolationNotice({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
      epiDecrease,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.listVNMessages({
      tenantDb: req.tenantDb!,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.sendMessage({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      companyStorageRoot: req.companyContext?.companyStorageRoot ?? '',
      userId: req.user!.sub,
      vnId: req.params.id as string,
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

export async function editMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.editMessage({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
      messageId: req.params.messageId as string,
      content: String(req.body.content ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    await violationNoticeService.deleteMessage({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      permissions: req.user!.permissions,
      vnId: req.params.id as string,
      messageId: req.params.messageId as string,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function toggleReaction(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.toggleReaction({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      vnId: req.params.id as string,
      messageId: req.params.messageId as string,
      emoji: String(req.body.emoji ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.markVNRead({
      tenantDb: req.tenantDb!,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function leave(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.leaveDiscussion({
      tenantDb: req.tenantDb!,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function mute(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.toggleMute({
      tenantDb: req.tenantDb!,
      userId: req.user!.sub,
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function mentionables(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.getMentionables({
      companyId: req.user!.companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function groupedUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const auditId = String(req.query.auditId ?? '').trim();
    const auditContext = auditId ? await resolveGlobalStoreAuditContext(auditId) : null;
    const data = await violationNoticeService.getGroupedUsersForVN({
      companyId: auditContext?.company.id ?? req.user!.companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createFromCaseReport(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await violationNoticeService.createViolationNotice({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      userId: req.user!.sub,
      description: String(req.body.description ?? ''),
      targetUserIds: req.body.targetUserIds,
      category: 'case_reports',
      sourceCaseReportId: String(req.body.caseId ?? ''),
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createFromStoreAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const auditId = String(req.body.auditId ?? '');
    const auditContext = await resolveGlobalStoreAuditContext(auditId);
    if (!auditContext) {
      throw new AppError(404, 'Store audit not found');
    }

    const data = await violationNoticeService.createViolationNotice({
      tenantDb: auditContext.tenantDb,
      companyId: auditContext.company.id,
      userId: req.user!.sub,
      description: String(req.body.description ?? ''),
      targetUserIds: req.body.targetUserIds,
      category: 'store_audits',
      sourceStoreAuditId: auditId,
    });
    if (auditId) {
      await auditContext.tenantDb('store_audits').where({ id: auditId }).update({
        vn_requested: true,
        updated_at: new Date(),
      });
      await syncGlobalStoreAuditProjectionByAuditId({
        companyId: auditContext.company.id,
        auditId,
      });
      emitStoreAuditEvent(auditContext.company.id, 'store-audit:updated', { id: auditId });
    }
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export const violationNoticeController = {
  list,
  getById,
  create,
  confirm,
  reject,
  issue,
  uploadIssuanceFile,
  confirmIssuance,
  uploadDisciplinaryFile,
  complete,
  listMessages,
  sendMessage,
  editMessage,
  deleteMessage,
  toggleReaction,
  markRead,
  leave,
  mute,
  mentionables,
  groupedUsers,
  createFromCaseReport,
  createFromStoreAudit,
};
