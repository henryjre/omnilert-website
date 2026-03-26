import type { Request, Response, NextFunction } from 'express';
import * as webhookService from '../services/webhook.service.js';
import { shouldCreateCssAudit } from './webhookSampling.js';

export async function posVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processPosVerification(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function posSession(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await webhookService.processPosSession(req.body);
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function employeeShift(req: Request, res: Response, next: NextFunction) {
  try {
    const action = String(req.body._action ?? '').toLowerCase();
    const isDeleteAction = action.includes('delete');

    const shift = isDeleteAction
      ? await webhookService.processPlanningSlotDelete(req.body)
      : await webhookService.processEmployeeShift(req.body);

    res.status(isDeleteAction ? 200 : 201).json({ success: true, data: shift });
  } catch (err) {
    next(err);
  }
}

export async function attendance(req: Request, res: Response, next: NextFunction) {
  try {
    const log = await webhookService.processAttendance(req.body);
    res.status(201).json({ success: true, data: log });
  } catch (err) {
    next(err);
  }
}

export async function discountOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processDiscountOrder(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function refundOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processRefundOrder(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function nonCashOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processNonCashOrder(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function tokenPayOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processTokenPayOrder(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function ispePurchaseOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processISPEPurchaseOrder(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function registerCash(req: Request, res: Response, next: NextFunction) {
  try {
    const verification = await webhookService.processRegisterCash(req.body);
    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function posSessionClose(req: Request, res: Response, next: NextFunction) {
  try {
    const session = await webhookService.processPosSessionClose(req.body);
    res.status(201).json({ success: true, data: session });
  } catch (err) {
    next(err);
  }
}

export async function posOrder(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body;

    if (!payload.x_website_key) {
      res.status(200).json({ success: true });
      return;
    }

    if (!shouldCreateCssAudit()) {
      res.status(200).json({ success: true });
      return;
    }

    await webhookService.createCssAudit(payload);
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}
