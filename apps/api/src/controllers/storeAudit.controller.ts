import type { NextFunction, Request, Response } from 'express';
import * as storeAuditService from '../services/storeAudit.service.js';

function getUploadedFiles(req: Request): Express.Multer.File[] {
  const files = (req as Request & { files?: Express.Multer.File[] | Record<string, Express.Multer.File[]> }).files;
  if (!files) return [];
  if (Array.isArray(files)) return files;
  return Object.values(files).flat();
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.listStoreAudits({
      tenantDb: req.tenantDb!,
      userId: req.user!.sub,
      type: req.query.type as 'customer_service' | 'compliance' | 'all' | undefined,
      status: req.query.status as 'pending' | 'processing' | 'completed' | undefined,
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
      tenantDb: req.tenantDb!,
      id: req.params.id as string,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function processAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.processStoreAudit({
      tenantDb: req.tenantDb!,
      auditId: req.params.id as string,
      userId: req.user!.sub,
      companyId: req.user!.companyId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function completeAudit(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.completeStoreAudit({
      tenantDb: req.tenantDb!,
      auditId: req.params.id as string,
      userId: req.user!.sub,
      companyId: req.user!.companyId,
      payload: req.body,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await storeAuditService.listStoreAuditMessages({
      tenantDb: req.tenantDb!,
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
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      companyStorageRoot: req.companyContext?.companyStorageRoot ?? '',
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
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
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
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      auditId: String(req.params.id),
      messageId: String(req.params.messageId),
      userId: req.user!.sub,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}
