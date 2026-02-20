import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { uploadFile } from '../services/storage.service.js';

export async function getSchedule(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const shifts = await tenantDb('employee_shifts')
      .leftJoin('branches', 'employee_shifts.branch_id', 'branches.id')
      .where('employee_shifts.user_id', userId)
      .select('employee_shifts.*', 'branches.name as branch_name')
      .orderBy('shift_start', 'asc');

    res.json({ success: true, data: shifts });
  } catch (err) {
    next(err);
  }
}

export async function getScheduleBranches(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;

    const branches = await tenantDb('branches')
      .select('id', 'name', 'is_active')
      .orderBy('name', 'asc');

    res.json({ success: true, data: branches });
  } catch (err) {
    next(err);
  }
}

export async function getScheduleShift(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const id = req.params.id as string;

    const shift = await tenantDb('employee_shifts')
      .leftJoin('branches', 'employee_shifts.branch_id', 'branches.id')
      .where('employee_shifts.id', id)
      .where('employee_shifts.user_id', userId)
      .select('employee_shifts.*', 'branches.name as branch_name')
      .first();
    if (!shift) throw new AppError(404, 'Shift not found');

    const logs = await tenantDb('shift_logs')
      .where({ shift_id: id })
      .orderBy('event_time', 'asc');

    const authorizations = await tenantDb('shift_authorizations')
      .where({ shift_id: id })
      .orderBy('created_at', 'asc');

    const resolvedByIds = authorizations
      .map((a: Record<string, unknown>) => a.resolved_by)
      .filter(Boolean) as string[];
    const resolvers: Record<string, string> = {};
    if (resolvedByIds.length > 0) {
      const users = await tenantDb('users').whereIn('id', resolvedByIds).select('id', 'first_name', 'last_name');
      for (const u of users) resolvers[u.id] = `${u.first_name} ${u.last_name}`;
    }
    const authorizationsWithResolver = authorizations.map((a: Record<string, unknown>) => ({
      ...a,
      resolved_by_name: a.resolved_by ? (resolvers[a.resolved_by as string] ?? null) : null,
    }));

    res.json({ success: true, data: { ...shift, logs, authorizations: authorizationsWithResolver } });
  } catch (err) {
    next(err);
  }
}

export async function getAuthorizationRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const requests = await tenantDb('authorization_requests')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');

    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

export async function createAuthorizationRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const { branchId, requestType, description, level, reference, requestedAmount, bankName, accountName, accountNumber } = req.body;

    const requestLevel: string = level || 'management';

    // Management-level requests require payment fields
    if (requestLevel === 'management') {
      if (!reference || !requestedAmount || !bankName || !accountName || !accountNumber) {
        throw new AppError(400, 'Reference, requested amount, bank name, account name, and account number are required');
      }
    }

    // Denormalize creator name for display
    const creator = await tenantDb('users').where({ id: userId }).select('first_name', 'last_name').first();
    const createdByName = creator ? `${creator.first_name} ${creator.last_name}` : null;

    const [request] = await tenantDb('authorization_requests')
      .insert({
        user_id: userId,
        branch_id: branchId,
        request_type: requestType,
        level: requestLevel,
        description: description || null,
        reference: reference || null,
        requested_amount: requestedAmount || null,
        bank_name: bankName || null,
        account_name: accountName || null,
        account_number: accountNumber || null,
        created_by_name: createdByName,
      })
      .returning('*');

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

export async function getCashRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const requests = await tenantDb('cash_requests')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');

    res.json({ success: true, data: requests });
  } catch (err) {
    next(err);
  }
}

export async function createCashRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const { branchId, requestType, reference, amount, bankName, accountName, accountNumber } = req.body;
    const attachmentFile = (req as any).file as Express.Multer.File | undefined;

    if (!requestType) throw new AppError(400, 'Request type is required');
    if (!amount) throw new AppError(400, 'Amount is required');
    if (!reference || !bankName || !accountName || !accountNumber) {
      throw new AppError(400, 'Reference, bank name, account name, and account number are required');
    }
    if (requestType === 'expense_reimbursement' && !attachmentFile) {
      throw new AppError(400, 'Receipt attachment is required for expense reimbursement');
    }

    const user = await tenantDb('users').where({ id: userId }).first('first_name', 'last_name');
    const createdByName = user ? `${user.first_name} ${user.last_name}` : null;

    // Upload attachment to S3 if provided
    let attachmentUrl: string | null = null;
    if (attachmentFile) {
      attachmentUrl = await uploadFile(
        attachmentFile.buffer,
        attachmentFile.originalname,
        attachmentFile.mimetype,
        "Cash Requests"
      );
      if (!attachmentUrl) {
        throw new AppError(500, 'Failed to upload attachment');
      }
    }

    const [request] = await tenantDb('cash_requests')
      .insert({
        user_id: userId,
        branch_id: branchId,
        request_type: requestType,
        reference: reference || null,
        amount,
        bank_name: bankName || null,
        account_name: accountName || null,
        account_number: accountNumber || null,
        attachment_url: attachmentUrl,
        created_by_name: createdByName,
      })
      .returning('*');

    res.status(201).json({ success: true, data: request });
  } catch (err) {
    next(err);
  }
}

export async function getNotificationCount(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const result = await tenantDb('employee_notifications')
      .where({ user_id: userId, is_read: false })
      .count('id as count')
      .first();

    res.json({ success: true, data: { unreadCount: Number(result?.count ?? 0) } });
  } catch (err) {
    next(err);
  }
}

export async function getNotifications(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const notifications = await tenantDb('employee_notifications')
      .where('user_id', userId)
      .orderBy('created_at', 'desc');

    // Enrich token pay notifications with verification status
    const prefix = '/account?tokenPayVerificationId=';
    const tokenPayNotifs = notifications.filter((n) => n.link_url?.startsWith(prefix));
    if (tokenPayNotifs.length > 0) {
      const verificationIds = tokenPayNotifs.map((n) => n.link_url.slice(prefix.length));
      const verifications = await tenantDb('pos_verifications')
        .whereIn('id', verificationIds)
        .select('id', 'status', 'customer_rejection_reason');
      const statusMap = Object.fromEntries(verifications.map((v) => [v.id, v]));
      const enriched = notifications.map((n) => {
        if (!n.link_url?.startsWith(prefix)) return n;
        const verificationId = n.link_url.slice(prefix.length);
        const v = statusMap[verificationId];
        return v ? { ...n, verification_status: v.status, verification_rejection_reason: v.customer_rejection_reason } : n;
      });
      return res.json({ success: true, data: enriched });
    }

    res.json({ success: true, data: notifications });
  } catch (err) {
    next(err);
  }
}

export async function markNotificationRead(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    await tenantDb('employee_notifications')
      .where({ id, user_id: req.user!.sub })
      .update({ is_read: true });

    res.json({ success: true, message: 'Notification marked as read' });
  } catch (err) {
    next(err);
  }
}

export async function getTokenPayVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const user = req.user!;
    const { id } = req.params;

    const verification = await tenantDb('pos_verifications')
      .where({ id, customer_user_id: user.sub })
      .first();
    if (!verification) throw new AppError(404, 'Verification not found');

    const images = await tenantDb('pos_verification_images').where('pos_verification_id', id);

    const customerUser = await tenantDb('users')
      .where({ id: user.sub })
      .select('first_name', 'last_name')
      .first();
    const customer_name = customerUser ? `${customerUser.first_name} ${customerUser.last_name}` : null;

    res.json({ success: true, data: { ...verification, images, customer_name } });
  } catch (err) {
    next(err);
  }
}

export async function markAllNotificationsRead(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    await tenantDb('employee_notifications')
      .where({ user_id: userId, is_read: false })
      .update({ is_read: true });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
