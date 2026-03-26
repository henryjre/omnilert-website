import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { createAndDispatchNotification } from '../services/notification.service.js';
import { db } from '../config/database.js';

/**
 * GET /cash-requests
 * Returns all cash requests visible to the caller (approver view).
 */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const { branchIds, status } = req.query as Record<string, string>;

    const branchIdList: string[] = branchIds ? branchIds.split(',').filter(Boolean) : [];
    const allBranchIds = branchIdList.length === 0
      ? (await tenantDb('branches').select('id')).map((b: any) => b.id)
      : branchIdList;

    if (allBranchIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    let q = tenantDb('cash_requests as cr')
      .leftJoin('branches as b', 'b.id', 'cr.branch_id')
      .leftJoin('users as u', 'u.id', 'cr.user_id')
      .leftJoin('users as rv', 'rv.id', 'cr.reviewed_by')
      .whereIn('cr.branch_id', allBranchIds)
      .orderBy('cr.created_at', 'desc')
      .select(
        'cr.*',
        'b.name as branch_name',
        tenantDb.raw("CONCAT(u.first_name, ' ', u.last_name) as created_by_name"),
        tenantDb.raw("CONCAT(rv.first_name, ' ', rv.last_name) as reviewed_by_name"),
      );
    if (status) q = q.where('cr.status', status);

    const requests = await q;
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /cash-requests/:id
 * Returns a single cash request with joined names.
 */
export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = db.getDb();
    const { id } = req.params as { id: string };

    const request = await tenantDb('cash_requests as cr')
      .leftJoin('branches as b', 'b.id', 'cr.branch_id')
      .leftJoin('users as u', 'u.id', 'cr.user_id')
      .leftJoin('users as rv', 'rv.id', 'cr.reviewed_by')
      .where('cr.id', id)
      .select(
        'cr.*',
        'b.name as branch_name',
        tenantDb.raw("CONCAT(u.first_name, ' ', u.last_name) as created_by_name"),
        tenantDb.raw("CONCAT(rv.first_name, ' ', rv.last_name) as reviewed_by_name"),
      )
      .first();

    if (!request) throw new AppError(404, 'Cash request not found');
    res.json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /cash-requests/:id/approve
 */
export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const reviewerId = req.user!.sub;
    const id = req.params.id as string;

    const cashReq = await tenantDb('cash_requests').where({ id }).first();
    if (!cashReq) throw new AppError(404, 'Cash request not found');
    if (cashReq.status !== 'pending') throw new AppError(400, 'Request is already resolved');

    const reviewedAt = new Date();
    await tenantDb('cash_requests')
      .where({ id })
      .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: reviewedAt, updated_at: reviewedAt });

    if (cashReq.user_id) {
      const label = requestTypeLabel(cashReq.request_type);
      await createAndDispatchNotification({
        userId: cashReq.user_id,
        title: `${label} Approved`,
        message: `Your ${label.toLowerCase()} has been approved.`,
        type: 'success',
        linkUrl: `/account/cash-requests?requestId=${id}`,
      });
    }

    const updated = await fetchWithJoins(tenantDb, id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /cash-requests/:id/reject
 */
export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const reviewerId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) throw new AppError(400, 'Rejection reason is required');

    const cashReq = await tenantDb('cash_requests').where({ id }).first();
    if (!cashReq) throw new AppError(404, 'Cash request not found');
    if (cashReq.status !== 'pending') throw new AppError(400, 'Request is already resolved');

    const reviewedAt = new Date();
    await tenantDb('cash_requests')
      .where({ id })
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        reviewed_by: reviewerId,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      });

    if (cashReq.user_id) {
      const label = requestTypeLabel(cashReq.request_type);
      await createAndDispatchNotification({
        userId: cashReq.user_id,
        title: `${label} Rejected`,
        message: `Your ${label.toLowerCase()} has been rejected: ${reason.trim()}`,
        type: 'danger',
        linkUrl: `/account/cash-requests?requestId=${id}`,
      });
    }

    const updated = await fetchWithJoins(tenantDb, id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /cash-requests/:id/disburse
 */
export async function disburse(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const disbursedBy = req.user!.sub;
    const id = req.params.id as string;

    const cashReq = await tenantDb('cash_requests').where({ id }).first();
    if (!cashReq) throw new AppError(404, 'Cash request not found');
    if (cashReq.status !== 'approved') throw new AppError(400, 'Only approved requests can be disbursed');

    const disbursedAt = new Date();
    await tenantDb('cash_requests')
      .where({ id })
      .update({ status: 'disbursed', disbursed_by: disbursedBy, disbursed_at: disbursedAt, updated_at: disbursedAt });

    if (cashReq.user_id) {
      const label = requestTypeLabel(cashReq.request_type);
      await createAndDispatchNotification({
        userId: cashReq.user_id,
        title: `${label} Disbursed`,
        message: `Your ${label.toLowerCase()} has been disbursed.`,
        type: 'success',
        linkUrl: `/account/cash-requests?requestId=${id}`,
      });
    }

    const updated = await fetchWithJoins(tenantDb, id);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

// ─── Shared join helper ───────────────────────────────────────────────────────

function fetchWithJoins(tenantDb: any, id: string) {
  return tenantDb('cash_requests as cr')
    .leftJoin('branches as b', 'b.id', 'cr.branch_id')
    .leftJoin('users as u', 'u.id', 'cr.user_id')
    .leftJoin('users as rv', 'rv.id', 'cr.reviewed_by')
    .where('cr.id', id)
    .select(
      'cr.*',
      'b.name as branch_name',
      tenantDb.raw("CONCAT(u.first_name, ' ', u.last_name) as created_by_name"),
      tenantDb.raw("CONCAT(rv.first_name, ' ', rv.last_name) as reviewed_by_name"),
    )
    .first();
}

function requestTypeLabel(requestType: string): string {
  switch (requestType) {
    case 'salary_wage_request': return 'Salary/Wage Request';
    case 'cash_advance_request': return 'Cash Advance Request';
    case 'expense_reimbursement': return 'Expense Reimbursement';
    case 'training_allowance': return 'Training Allowance';
    case 'transport_allowance': return 'Transport Allowance';
    default: return requestType ?? 'Cash Request';
  }
}
