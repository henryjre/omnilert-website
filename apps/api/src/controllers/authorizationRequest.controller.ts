import type { Request, Response, NextFunction } from 'express';
import { canReviewSubmittedRequest, PERMISSIONS } from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import { db } from '../config/database.js';
import { createAndDispatchNotification } from '../services/notification.service.js';
import { listShiftExchangeRequestsForAuthorization } from '../services/shiftExchange.service.js';

/**
 * GET /authorization-requests
 * Returns management requests and/or service-crew shift authorizations
 * based on the caller's permissions.
 */
export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const userPermissions = new Set(req.user!.permissions);
    const currentCompanyId = companyId;
    const { branchIds, status } = req.query as Record<string, string>;

    const branchIdList: string[] = branchIds ? branchIds.split(',').filter(Boolean) : [];
    // If no branch filter provided, approvers see all branches
    const allBranchIds = branchIdList.length === 0
      ? (await tenantDb('branches').select('id')).map((b: any) => b.id)
      : branchIdList;
    if (allBranchIds.length === 0) {
      return res.json({ success: true, data: { managementRequests: [], serviceCrewRequests: [] } });
    }
    const canViewManagementRequests =
      userPermissions.has(PERMISSIONS.AUTH_REQUEST_VIEW_PRIVATE)
      || userPermissions.has(PERMISSIONS.AUTH_REQUEST_MANAGE_PRIVATE);
    const canViewServiceCrewRequests =
      userPermissions.has(PERMISSIONS.AUTH_REQUEST_VIEW_PUBLIC)
      || userPermissions.has(PERMISSIONS.AUTH_REQUEST_MANAGE_PUBLIC);

    // Management-level requests
    let managementRows: any[] = [];
    let managementRequests: any[] = [];
    if (canViewManagementRequests) {
      let q = tenantDb('authorization_requests as ar')
        .whereIn('ar.branch_id', allBranchIds)
        .where('ar.level', 'management')
        .leftJoin('branches as b', 'b.id', 'ar.branch_id')
        .leftJoin('companies as co', 'co.id', 'ar.company_id')
        .select(
          'ar.*',
          'b.name as branch_name',
          'co.name as company_name',
        );
      if (status) q = q.where('ar.status', status);
      managementRows = await q.orderBy('ar.created_at', 'desc');
    }

    // Service-crew requests (shift_authorizations)
    let authRows: any[] = [];
    let serviceCrewRequests: any[] = [];
    if (canViewServiceCrewRequests) {
      let q = tenantDb('shift_authorizations')
        .whereIn('shift_authorizations.branch_id', allBranchIds)
        .leftJoin('employee_shifts', 'shift_authorizations.shift_id', 'employee_shifts.id')
        .leftJoin('branches', 'shift_authorizations.branch_id', 'branches.id')
        .leftJoin('companies', 'branches.company_id', 'companies.id')
        .select(
          'shift_authorizations.*',
          'employee_shifts.duty_type',
          'employee_shifts.shift_start',
          'employee_shifts.employee_name as shift_employee_name',
          'branches.name as branch_name',
          'companies.name as company_name',
        );
      if (status) q = q.where('shift_authorizations.status', status);
      authRows = await q.orderBy('shift_authorizations.created_at', 'desc');
    }

    const userIds = Array.from(
      new Set(
        [
          ...managementRows.flatMap((row: any) => [row.user_id, row.reviewed_by]),
          ...authRows.flatMap((row: any) => [row.user_id, row.resolved_by]),
        ]
          .map((value) => String(value ?? '').trim())
          .filter((value) => value.length > 0),
      ),
    );
    let namesById: Record<string, string> = {};
    if (userIds.length > 0) {
      const users = await db.getDb()('users')
        .whereIn('id', userIds)
        .select('id', 'first_name', 'last_name');
      namesById = Object.fromEntries(
        users.map((row: any) => [
          row.id,
          `${String(row.first_name ?? '').trim()} ${String(row.last_name ?? '').trim()}`.trim() || 'Unknown User',
        ]),
      );
    }

    managementRequests = managementRows.map((row: any) => ({
      ...row,
      created_by_name: namesById[row.user_id] ?? null,
      reviewed_by_name: row.reviewed_by ? (namesById[row.reviewed_by] ?? null) : null,
    }));

    if (canViewServiceCrewRequests) {
      const mappedAuthRows = authRows.map((row: any) => ({
        ...row,
        employee_name: namesById[row.user_id] || row.shift_employee_name || null,
        resolved_by_name: row.resolved_by ? (namesById[row.resolved_by] ?? null) : null,
      }));

      const shiftExchangeRows = await listShiftExchangeRequestsForAuthorization({
        currentCompanyId,
        branchIds: allBranchIds,
        status,
      });

      serviceCrewRequests = [...mappedAuthRows, ...shiftExchangeRows]
        .sort(
          (a: any, b: any) =>
            new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime(),
        );
    }

    res.json({ success: true, data: { managementRequests, serviceCrewRequests } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /authorization-requests/:id/approve
 * Approves a management-level authorization request.
 */
export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const reviewerId = req.user!.sub;
    const id = req.params.id as string;

    const authReq = await tenantDb('authorization_requests').where({ id }).first();
    if (!authReq) throw new AppError(404, 'Authorization request not found');
    if (!canReviewSubmittedRequest({ actingUserId: reviewerId, requestUserId: authReq.user_id })) {
      throw new AppError(403, 'You cannot review your own authorization request');
    }
    if (authReq.status !== 'pending') throw new AppError(400, 'Request is already resolved');

    const reviewedAt = new Date();
    const [updated] = await tenantDb('authorization_requests')
      .where({ id })
      .update({ status: 'approved', reviewed_by: reviewerId, reviewed_at: reviewedAt, updated_at: reviewedAt })
      .returning('*');
    const reviewer = await db.getDb()('users')
      .where({ id: reviewerId })
      .select('first_name', 'last_name')
      .first();
    const reviewedByName = reviewer
      ? `${String(reviewer.first_name ?? '').trim()} ${String(reviewer.last_name ?? '').trim()}`.trim()
      : reviewerId;

    // Notify creator
    if (authReq.user_id) {
      const label = requestTypeLabel(authReq.request_type);
      await createAndDispatchNotification({
        userId: authReq.user_id,
        title: `${label} Approved`,
        message: `Your ${label.toLowerCase()} has been approved.`,
        type: 'success',
        linkUrl: `/account/authorization-requests?requestId=${id}`,
      });
    }

    res.json({ success: true, data: { ...updated, reviewed_by_name: reviewedByName } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /authorization-requests/:id/reject
 * Rejects a management-level authorization request.
 */
export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const tenantDb = db.getDb();
    const reviewerId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) throw new AppError(400, 'Rejection reason is required');

    const authReq = await tenantDb('authorization_requests').where({ id }).first();
    if (!authReq) throw new AppError(404, 'Authorization request not found');
    if (!canReviewSubmittedRequest({ actingUserId: reviewerId, requestUserId: authReq.user_id })) {
      throw new AppError(403, 'You cannot review your own authorization request');
    }
    if (authReq.status !== 'pending') throw new AppError(400, 'Request is already resolved');

    const reviewedAt = new Date();
    const [updated] = await tenantDb('authorization_requests')
      .where({ id })
      .update({
        status: 'rejected',
        rejection_reason: reason.trim(),
        reviewed_by: reviewerId,
        reviewed_at: reviewedAt,
        updated_at: reviewedAt,
      })
      .returning('*');
    const reviewer = await db.getDb()('users')
      .where({ id: reviewerId })
      .select('first_name', 'last_name')
      .first();
    const reviewedByName = reviewer
      ? `${String(reviewer.first_name ?? '').trim()} ${String(reviewer.last_name ?? '').trim()}`.trim()
      : reviewerId;

    // Notify creator
    if (authReq.user_id) {
      const label = requestTypeLabel(authReq.request_type);
      await createAndDispatchNotification({
        userId: authReq.user_id,
        title: `${label} Rejected`,
        message: `Your ${label.toLowerCase()} has been rejected: ${reason.trim()}`,
        type: 'danger',
        linkUrl: `/account/authorization-requests?requestId=${id}`,
      });
    }

    res.json({ success: true, data: { ...updated, reviewed_by_name: reviewedByName } });
  } catch (err) {
    next(err);
  }
}

function requestTypeLabel(requestType: string): string {
  switch (requestType) {
    case 'payment_request': return 'Payment Request';
    case 'replenishment_request': return 'Replenishment Request';
    default: return requestType;
  }
}
