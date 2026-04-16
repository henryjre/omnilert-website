import type { Request, Response, NextFunction } from 'express';
import * as tokenPayService from '../services/tokenPay.service.js';

export async function getWallet(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const wallet = await tokenPayService.getWallet(userId);
    res.json({ success: true, data: wallet });
  } catch (err) {
    next(err);
  }
}

export async function getTransactions(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const userId = req.user!.sub;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
    const result = await tokenPayService.getTransactions(userId, companyId, page, limit);
    res.json({
      success: true,
      data: result.items,
      pagination: result.pagination,
    });
  } catch (err) {
    next(err);
  }
}
