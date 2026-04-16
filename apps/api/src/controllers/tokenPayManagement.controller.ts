import type { Request, Response, NextFunction } from 'express';
import * as service from '../services/tokenPayManagement.service.js';
import { getWallet, getTransactions } from '../services/tokenPay.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { db } from '../config/database.js';

// ---------------------------------------------------------------------------
// GET /token-pay-management
// ---------------------------------------------------------------------------

export async function listWallets(req: Request, res: Response, next: NextFunction) {
  try {
    const wallets = await service.getAllWallets();
    res.json({ success: true, data: wallets });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /token-pay-management/:userId
// ---------------------------------------------------------------------------

export async function getWalletDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params as { userId: string };
    const { companyId } = req.companyContext!;
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const [wallet, transactions] = await Promise.all([
      getWallet(userId),
      getTransactions(userId, companyId, page, limit),
    ]);

    res.json({ success: true, data: { wallet, transactions } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /token-pay-management/:userId/suspend
// ---------------------------------------------------------------------------

export async function suspendAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params as { userId: string };
    const knex = db.getDb();

    const user = await knex('users').select('user_key').where('id', userId).first();
    if (!user) throw new AppError(404, 'User not found');
    if (!user.user_key) throw new AppError(400, 'User has no Odoo account linked');

    await service.suspendAccount(user.user_key);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /token-pay-management/:userId/unsuspend
// ---------------------------------------------------------------------------

export async function unsuspendAccount(req: Request, res: Response, next: NextFunction) {
  try {
    const { userId } = req.params as { userId: string };
    const knex = db.getDb();

    const user = await knex('users').select('user_key').where('id', userId).first();
    if (!user) throw new AppError(404, 'User not found');
    if (!user.user_key) throw new AppError(400, 'User has no Odoo account linked');

    await service.unsuspendAccount(user.user_key);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /token-pay-management/issuances
// ---------------------------------------------------------------------------

export async function listIssuanceRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { status, page = '1', limit = '10' } = req.query as Record<string, string>;

    const result = await service.listIssuanceRequests(
      companyId,
      status || undefined,
      Number(page),
      Number(limit),
    );
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /token-pay-management/issuances
// ---------------------------------------------------------------------------

export async function createIssuanceRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const issuedByUserId = req.user!.sub;
    const { targetUserId, type, amount, reason } = req.body as {
      targetUserId: string;
      type: string;
      amount: number | string;
      reason: string;
    };

    if (!targetUserId) throw new AppError(400, 'targetUserId is required');
    if (type !== 'credit' && type !== 'debit') throw new AppError(400, "type must be 'credit' or 'debit'");
    if (!amount || Number(amount) <= 0) throw new AppError(400, 'amount must be greater than 0');
    if (!reason || !reason.trim()) throw new AppError(400, 'reason is required');

    const knex = db.getDb();
    const issuer = await knex('users')
      .select(knex.raw("CONCAT(first_name, ' ', last_name) as issued_by_name"))
      .where('id', issuedByUserId)
      .first<{ issued_by_name: string }>();

    const issuedByName = issuer?.issued_by_name?.trim() ?? '';

    const result = await service.createIssuanceRequest({
      companyId,
      targetUserId,
      issuedByUserId,
      issuedByName,
      type: type as 'credit' | 'debit',
      amount: Number(amount),
      reason: reason.trim(),
    });

    res.json({ success: true, data: { id: result.id } });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /token-pay-management/issuances/:id/approve
// ---------------------------------------------------------------------------

export async function approveIssuance(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const approverId = req.user!.sub;

    await service.approveIssuanceRequest(id, approverId);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// POST /token-pay-management/issuances/:id/reject
// ---------------------------------------------------------------------------

export async function rejectIssuance(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params as { id: string };
    const approverId = req.user!.sub;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) throw new AppError(400, 'Rejection reason is required');

    await service.rejectIssuanceRequest(id, approverId, reason.trim());
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ---------------------------------------------------------------------------
// GET /token-pay-management/grouped-users
// ---------------------------------------------------------------------------

export async function getGroupedUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const result = await service.getGroupedUsers(companyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
