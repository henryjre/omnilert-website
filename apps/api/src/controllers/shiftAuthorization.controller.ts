import type { NextFunction, Request, Response } from 'express';
import { canReviewSubmittedRequest } from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import { getIO } from '../config/socket.js';
import { logger } from '../utils/logger.js';
import { createAndDispatchNotification } from '../services/notification.service.js';
import { db } from '../config/database.js';
import {
  INTERIM_DUTY_AUTH_TYPE,
  authTypeLabel,
  assertEmployeeReasonSubmittedForManualReject,
  createShiftAuthorizationRejectResolver,
  hasSubmittedEmployeeReason,
  reconcileOvertimeForShift,
  syncShiftAuthorizationWithOdoo,
} from '../services/shiftAuthorizationResolution.service.js';
import { OVERTIME_BLOCKER_AUTH_TYPES } from '../services/overtimeDependency.service.js';

export {
  cleanupInterimDutyOdooArtifacts,
  resolveInterimDutyCleanupTargets,
} from '../services/shiftAuthorizationResolution.service.js';

const rejectShiftAuthorization = createShiftAuthorizationRejectResolver();

async function getManagerDisplayName(managerId: string): Promise<string> {
  const managerUser = await db
    .getDb()('users')
    .where({ id: managerId })
    .select('id', 'first_name', 'last_name')
    .first();

  return managerUser ? `${managerUser.first_name} ${managerUser.last_name}` : managerId;
}

/** Employee submits a reason for authorizations that require it */
export async function submitReason(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) {
      throw new AppError(400, 'Reason is required');
    }

    const tenantDb = db.getDb();
    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (auth.user_id !== userId) throw new AppError(403, 'Not your authorization');
    if (!auth.needs_employee_reason) {
      throw new AppError(400, 'This authorization does not require an employee reason');
    }
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }

    const [updated] = await tenantDb('shift_authorizations')
      .where({ id })
      .update({ employee_reason: reason.trim() })
      .returning('*');

    try {
      getIO()
        .of('/employee-shifts')
        .to(`branch:${auth.branch_id}`)
        .emit('shift:authorization-updated', updated);
    } catch {
      logger.warn('Socket.IO unavailable for authorization update emit');
    }

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

/** Manager approves an authorization */
export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;

    const tenantDb = db.getDb();
    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (!canReviewSubmittedRequest({ actingUserId: managerId, requestUserId: auth.user_id })) {
      throw new AppError(403, 'You cannot review your own shift authorization');
    }
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }
    if (auth.needs_employee_reason && !hasSubmittedEmployeeReason(auth)) {
      throw new AppError(400, 'Employee has not submitted a reason yet');
    }

    const { overtimeType, hours, minutes } = req.body as {
      overtimeType?: string;
      hours?: number;
      minutes?: number;
    };
    if (auth.auth_type === 'overtime') {
      if (!overtimeType || !['normal_overtime', 'overtime_premium'].includes(overtimeType)) {
        throw new AppError(400, 'Overtime type is required: normal_overtime or overtime_premium');
      }
    }

    const resolvedAt = new Date();
    const updateData: Record<string, unknown> = {
      status: 'approved',
      resolved_by: managerId,
      resolved_at: resolvedAt,
    };
    if (auth.auth_type === 'overtime' && overtimeType) {
      updateData.overtime_type = overtimeType;
    }
    const [updated] = await tenantDb('shift_authorizations')
      .where({ id })
      .update(updateData)
      .returning('*');

    await tenantDb('employee_shifts').where({ id: auth.shift_id }).decrement('pending_approvals', 1);

    const managerName = await getManagerDisplayName(managerId);
    const resolvedCompanyId = (auth.company_id as string | null | undefined) ?? companyId;
    if (!resolvedCompanyId) throw new AppError(400, 'Company context is required');
    const [resolutionLog] = await tenantDb('shift_logs')
      .insert({
        company_id: resolvedCompanyId,
        shift_id: auth.shift_id,
        branch_id: auth.branch_id,
        log_type: 'authorization_resolved',
        changes: JSON.stringify({
          authorization_id: id,
          auth_type: auth.auth_type,
          resolution: 'approved',
          resolved_by_name: managerName,
          diff_minutes: auth.diff_minutes,
          ...(auth.auth_type === 'overtime' && overtimeType
            ? { overtime_type: overtimeType }
            : {}),
        }),
        event_time: resolvedAt,
        odoo_payload: JSON.stringify({}),
      })
      .returning('*');

    if (auth.user_id) {
      const label = authTypeLabel(String(auth.auth_type));
      await createAndDispatchNotification({
        userId: auth.user_id,
        title: `${label} Approved`,
        message: `Your ${label.toLowerCase()} authorization has been approved.`,
        type: 'success',
        linkUrl: `/account/schedule?shiftId=${String(auth.shift_id)}&highlight=authorization_resolved`,
      });
    }

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:authorization-updated', updated);
      io.of('/employee-shifts').to(`branch:${auth.branch_id}`).emit('shift:log-new', resolutionLog);
    } catch {
      logger.warn('Socket.IO unavailable for authorization approve emit');
    }

    if (auth.auth_type !== INTERIM_DUTY_AUTH_TYPE) {
      await syncShiftAuthorizationWithOdoo(auth, 'approve', {
        overtimeType,
        hours,
        minutes,
        managerName,
      });
    }

    if (OVERTIME_BLOCKER_AUTH_TYPES.has(auth.auth_type as any)) {
      try {
        await reconcileOvertimeForShift(String(auth.shift_id));
      } catch (err) {
        logger.error(`Failed to reconcile overtime for shift ${auth.shift_id} after approve: ${err}`);
      }
    }

    res.json({ success: true, data: { ...updated, resolved_by_name: managerName } });
  } catch (err) {
    next(err);
  }
}

/** Manager rejects an authorization */
export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const managerId = req.user!.sub;
    const id = req.params.id as string;
    const { reason } = req.body as { reason: string };

    if (!reason || !reason.trim()) {
      throw new AppError(400, 'Rejection reason is required');
    }

    const tenantDb = db.getDb();
    const auth = await tenantDb('shift_authorizations').where({ id }).first();
    if (!auth) throw new AppError(404, 'Authorization not found');
    if (!canReviewSubmittedRequest({ actingUserId: managerId, requestUserId: auth.user_id })) {
      throw new AppError(403, 'You cannot review your own shift authorization');
    }
    if (auth.status !== 'pending') {
      throw new AppError(400, 'Authorization is already resolved');
    }

    assertEmployeeReasonSubmittedForManualReject(auth);

    const managerName = await getManagerDisplayName(managerId);
    const resolvedAt = new Date();
    const { updated } = await rejectShiftAuthorization({
      auth,
      reason: reason.trim(),
      resolvedAt,
      resolvedBy: managerId,
      resolvedByName: managerName,
      companyId,
    });

    if (OVERTIME_BLOCKER_AUTH_TYPES.has(auth.auth_type as any)) {
      try {
        await reconcileOvertimeForShift(String(auth.shift_id));
      } catch (err) {
        logger.error(`Failed to reconcile overtime for shift ${auth.shift_id} after reject: ${err}`);
      }
    }

    res.json({ success: true, data: { ...updated, resolved_by_name: managerName } });
  } catch (err) {
    next(err);
  }
}
