import type { NextFunction, Request, Response } from 'express';
import * as storeAuditService from '../services/globalStoreAudit.service.js';

function getUploadedFiles(req: Request): Express.Multer.File[] {
  const files = (req as Request & { files?: Express.Multer.File[] | Record<string, Express.Multer.File[]> }).files;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.listStoreAudits({
      userId: req.user!.sub,
      type: req.query.type as 'customer_service' | 'service_crew_cctv' | 'all' | undefined,
      status: req.query.status as 'pending' | 'processing' | 'completed' | 'rejected' | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.getStoreAuditById({
      auditId: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function processAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.processAudit({
      auditId: req.params.id as string,
      userId: req.user!.sub,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function completeAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.completeAudit({
      auditId: req.params.id as string,
      userId: req.user!.sub,
      payload: req.body,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function rejectAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.rejectAudit({
      auditId: req.params.id as string,
      userId: req.user!.sub,
      reason: String(req.body.reason ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.listStoreAuditMessages({
      auditId: String(req.params.id),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function sendMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.sendStoreAuditMessage({
      auditId: String(req.params.id),
      userId: req.user!.sub,
      content: String(req.body.content ?? ''),
      files: getUploadedFiles(req),
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function editMessage(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.editStoreAuditMessage({
      auditId: String(req.params.id),
      messageId: String(req.params.messageId),
      userId: req.user!.sub,
      content: String(req.body.content ?? ''),
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction) {
  try {
    await storeAuditService.deleteStoreAuditMessage({
      auditId: String(req.params.id),
      messageId: String(req.params.messageId),
      userId: req.user!.sub,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

export async function getStats(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.getAuditorStats({
      userId: req.user!.sub,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
