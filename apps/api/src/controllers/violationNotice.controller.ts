import type { NextFunction, Request, Response } from 'express';
import * as violationNoticeService from '../services/violationNotice.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { emitStoreAuditEvent } from '../services/storeAuditRealtime.service.js';
import { db } from '../config/database.js';

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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.listViolationNotices({
      userId: req.user!.sub,
      companyId,
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
    const { companyId } = req.companyContext!;
    const branchId = typeof req.body.branchId === 'string' ? req.body.branchId : null;
    console.log('[VN create] branchId received:', branchId);
    const data = await violationNoticeService.createViolationNotice({
      companyId,
      userId: req.user!.sub,
      description: String(req.body.description ?? ''),
      targetUserIds: req.body.targetUserIds,
      branchId,
    });
    console.log('[VN create] returned branch_id:', data.branch_id, 'branch_name:', data.branch_name);
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.confirmViolationNotice({
      companyId,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.rejectViolationNotice({
      companyId,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.issueViolationNotice({
      companyId,
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
    const { companyId, companyStorageRoot } = req.companyContext!;
    const data = await violationNoticeService.uploadIssuanceFile({
      companyId,
      companyStorageRoot,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.confirmIssuance({
      companyId,
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
    const { companyId, companyStorageRoot } = req.companyContext!;
    const data = await violationNoticeService.uploadDisciplinaryFile({
      companyId,
      companyStorageRoot,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.completeViolationNotice({
      companyId,
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
      vnId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId, companyStorageRoot } = req.companyContext!;
    const data = await violationNoticeService.sendMessage({
      companyId,
      companyStorageRoot,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.editMessage({
      companyId,
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
    const { companyId } = req.companyContext!;
    await violationNoticeService.deleteMessage({
      companyId,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.toggleReaction({
      companyId,
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
    const { companyId } = req.companyContext!;
    const data = await violationNoticeService.getMentionables({
      companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function groupedUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const auditId = String(req.query.auditId ?? '').trim();
    const caseId = String(req.query.caseId ?? '').trim();
    const queryCompanyId = String(req.query.companyId ?? '').trim();
    const allCompaniesParam = String(req.query.allCompanies ?? '').trim().toLowerCase();
    const includeAllCompanies = allCompaniesParam === 'true' || allCompaniesParam === '1';
    let resolvedCompanyId = companyId;
    if (auditId) {
      const auditRow = await db.getDb()('store_audits').where({ id: auditId }).first('company_id');
      resolvedCompanyId = auditRow?.company_id ?? companyId;
    } else if (caseId && /^[0-9a-f-]{36}$/i.test(caseId)) {
      const caseRow = await db.getDb()('case_reports').where({ id: caseId }).first('company_id');
      resolvedCompanyId = caseRow?.company_id ?? companyId;
    } else if (queryCompanyId && /^[0-9a-f-]{36}$/i.test(queryCompanyId)) {
      resolvedCompanyId = queryCompanyId;
    }

    const data = includeAllCompanies
      ? await violationNoticeService.getGroupedUsersForVN({ includeAllCompanies: true })
      : await violationNoticeService.getGroupedUsersForVN({ companyId: resolvedCompanyId });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createFromCaseReport(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const caseId = String(req.body.caseId ?? '');
    const caseRow = caseId
      ? await db.getDb()('case_reports').where({ id: caseId }).first('branch_id')
      : null;
    const data = await violationNoticeService.createViolationNotice({
      companyId,
      userId: req.user!.sub,
      description: String(req.body.description ?? ''),
      targetUserIds: req.body.targetUserIds,
      category: 'case_reports',
      sourceCaseReportId: caseId,
      branchId: caseRow?.branch_id ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function createFromStoreAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const auditId = String(req.body.auditId ?? '');
    const auditRow = await db.getDb()('store_audits').where({ id: auditId }).first('company_id', 'branch_id');
    if (!auditRow) {
      throw new AppError(404, 'Store audit not found');
    }

    const data = await violationNoticeService.createViolationNotice({
      companyId: auditRow.company_id,
      userId: req.user!.sub,
      description: String(req.body.description ?? ''),
      targetUserIds: req.body.targetUserIds,
      category: 'store_audits',
      sourceStoreAuditId: auditId,
      branchId: auditRow.branch_id ?? null,
    });
    if (auditId) {
      await db.getDb()('store_audits').where({ id: auditId }).update({
        vn_requested: true,
        updated_at: new Date(),
      });
      emitStoreAuditEvent(auditRow.company_id, 'store-audit:updated', { id: auditId });
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
