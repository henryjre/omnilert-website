import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';

/**
 * GET /cash-requests
 * Returns all cash requests visible to the caller (approver view).
 */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { branchIds, status } = req.query as Record<string, string>;

    const branchIdList: string[] = branchIds ? branchIds.split(',').filter(Boolean) : [];
    const allBranchIds = branchIdList.length === 0
      ? (await tenantDb('branches').select('id')).map((b: any) => b.id)
      : branchIdList;

    if (allBranchIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    let q = tenantDb('cash_requests')
      .whereIn('branch_id', allBranchIds)
      .orderBy('created_at', 'desc');
    if (status) q = q.where('status', status);

    const requests = await q;
    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /cash-requests/:id/approve
 */
export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const reviewerId = req.user!.sub;
    const id = req.params.id as string;

    const cashReq = await tenantDb('cash_requests').where({ id }).first();
    if (!cashReq) throw new AppError(404, 'Cash request not found');
    if (cashReq.status !== 'pending') throw new AppError(400, 'Request is already resolved');

    const reviewedAt = new Date();
    const [updated] = await tenantDb('cash_requests')
      .where({ id })
      .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: reviewedAt, updated_at: reviewedAt })
      .returning('*');

    if (cashReq.user_id) {
      const label = requestTypeLabel(cashReq.request_type);
      const [notif] = await tenantDb('employee_notifications').insert({
        user_id: cashReq.user_id,
        title: `${label} Approved`,
        message: `Your ${label.toLowerCase()} has been approved.`,
        type: 'success',
        link_url: '/account/cash-requests',
      }).returning('*');
      try {
        getIO().of('/notifications').to(`user:${cashReq.user_id}`).emit('notification:new', notif);
      } catch { /* socket unavailable */ }
    }

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
    const tenantDb = req.tenantDb!;
    const reviewerId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) throw new AppError(400, 'Rejection reason is required');

    const cashReq = await tenantDb('cash_requests').where({ id }).first();
    if (!cashReq) throw new AppError(404, 'Cash request not found');
    if (cashReq.status !== 'pending') throw new AppError(400, 'Request is already resolved');

    const reviewedAt = new Date();
    const [updated] = await tenantDb('cash_requests')
      .where({ id })
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        reviewed_by: reviewerId,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .returning('*');

    if (cashReq.user_id) {
      const label = requestTypeLabel(cashReq.request_type);
      const [notif] = await tenantDb('employee_notifications').insert({
        user_id: cashReq.user_id,
        title: `${label} Rejected`,
        message: `Your ${label.toLowerCase()} has been rejected: ${reason.trim()}`,
        type: 'danger',
        link_url: '/account/cash-requests',
      }).returning('*');
      try {
        getIO().of('/notifications').to(`user:${cashReq.user_id}`).emit('notification:new', notif);
      } catch { /* socket unavailable */ }
    }

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
    const tenantDb = req.tenantDb!;
    const disbursedBy = req.user!.sub;
    const id = req.params.id as string;

    const cashReq = await tenantDb('cash_requests').where({ id }).first();
    if (!cashReq) throw new AppError(404, 'Cash request not found');
    if (cashReq.status !== 'approved') throw new AppError(400, 'Only approved requests can be disbursed');

    const disbursedAt = new Date();
    const [updated] = await tenantDb('cash_requests')
      .where({ id })
      .update({ status: 'disbursed', disbursed_by: disbursedBy, disbursed_at: disbursedAt, updated_at: disbursedAt })
      .returning('*');

    if (cashReq.user_id) {
      const label = requestTypeLabel(cashReq.request_type);
      const [notif] = await tenantDb('employee_notifications').insert({
        user_id: cashReq.user_id,
        title: `${label} Disbursed`,
        message: `Your ${label.toLowerCase()} has been disbursed.`,
        type: 'success',
        link_url: '/account/cash-requests',
      }).returning('*');
      try {
        getIO().of('/notifications').to(`user:${cashReq.user_id}`).emit('notification:new', notif);
      } catch { /* socket unavailable */ }
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
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
