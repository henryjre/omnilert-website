import type { NextFunction, Request, Response } from 'express';
import * as storeAuditService from '../services/storeAudit.service.js';

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
