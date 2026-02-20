import type { Request, Response, NextFunction } from 'express';
import * as webhookService from '../services/webhook.service.js';

export async function posVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.branchId);
    const verification = await webhookService.processPosVerification(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function posSession(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const session = await webhookService.processPosSession(company.db_name, req.body);

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function employeeShift(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const action = String(req.body._action ?? '').toLowerCase();
    const isDeleteAction = action.includes('delete');

    const shift = isDeleteAction
      ? await webhookService.processPlanningSlotDelete(company.db_name, req.body)
      : await webhookService.processEmployeeShift(company.db_name, req.body);

    res.status(isDeleteAction ? 200 : 201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
}

export async function attendance(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.x_company_id);
    const log = await webhookService.processAttendance(company.db_name, req.body);

    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

export async function discountOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const verification = await webhookService.processDiscountOrder(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function refundOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const verification = await webhookService.processRefundOrder(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function nonCashOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const verification = await webhookService.processNonCashOrder(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function tokenPayOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const verification = await webhookService.processTokenPayOrder(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function ispePurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const verification = await webhookService.processISPEPurchaseOrder(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function registerCash(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const verification = await webhookService.processRegisterCash(company.db_name, req.body);

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function posSessionClose(req: Request, res: Response, next: NextFunction) {
  try {
    const company = await webhookService.resolveCompanyByOdooBranchId(req.body.company_id);
    const session = await webhookService.processPosSessionClose(company.db_name, req.body);

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}
