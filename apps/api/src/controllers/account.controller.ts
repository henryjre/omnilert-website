import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler.js';
import { buildTenantStoragePrefix, uploadFile } from '../services/storage.service.js';
import { getIO } from '../config/socket.js';

function toDisplayStatus(status: string | null): 'complete' | 'rejected' | 'verification' | 'pending' {
  if (!status) return 'pending';
  if (status === 'approved') return 'complete';
  if (status === 'rejected') return 'rejected';
  if (status === 'pending') return 'verification';
  return 'pending';
}

async function notifyUser(
  tenantDb: any,
  userId: string,
  title: string,
  message: string,
  type: 'info' | 'success' | 'danger' | 'warning',
  linkUrl: string,
) {
  const [notif] = await tenantDb('employee_notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      link_url: linkUrl,
    })
    .returning('*');

  try {
    getIO().of('/notifications').to(`user:${userId}`).emit('notification:new', notif);
  } catch {
    // ignore socket failures
  }
}

function emitEmployeeVerificationUpdated(payload: {
  companyId: string;
  verificationId: string;
  verificationType: 'personal_information' | 'employment_requirement';
  action: 'submitted';
  userId?: string;
}) {
  try {
    getIO().of('/employee-verifications')
      .to(`company:${payload.companyId}`)
      .emit('employee-verification:updated', payload);
  } catch {
    // ignore socket failures
  }
}

function emitEmployeeRequirementUpdated(payload: {
  companyId: string;
  action: 'submitted';
  submissionId?: string;
  userId?: string;
  requirementCode?: string;
}) {
  try {
    getIO().of('/employee-requirements')
      .to(`company:${payload.companyId}`)
      .emit('employee-requirement:updated', payload);
  } catch {
    // ignore socket failures
  }
}

async function resolveAndValidateBranchId(
  tenantDb: any,
  userId: string,
  branchIdInput: unknown,
): Promise<string> {
  const branchId = typeof branchIdInput === 'string' ? branchIdInput.trim() : '';
  if (!branchId) {
    throw new AppError(400, 'Branch is required');
  }

  const branch = await tenantDb('branches')
    .where({ id: branchId })
    .select('id', 'is_active')
    .first();

  if (!branch || branch.is_active !== true) {
    throw new AppError(400, 'Selected branch is invalid or inactive. Please refresh and try again.');
  }

  const assignedBranches = await tenantDb('user_branches')
    .where({ user_id: userId })
    .select('branch_id');

  if (assignedBranches.length > 0) {
    const isAssigned = assignedBranches.some(
      (row: { branch_id: string }) => row.branch_id === branchId,
    );
    if (!isAssigned) {
      throw new AppError(403, 'You are not assigned to the selected branch');
    }
  }

  return branchId;
}

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
    const { requestType, description, level, reference, requestedAmount, bankName, accountName, accountNumber } = req.body;
    const branchId = await resolveAndValidateBranchId(tenantDb, userId, req.body.branchId);

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
    const companyStorageRoot = req.companyContext?.companyStorageRoot ?? '';
    const { requestType, reference, amount, bankName, accountName, accountNumber } = req.body;
    const branchId = await resolveAndValidateBranchId(tenantDb, userId, req.body.branchId);
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
      const folder = buildTenantStoragePrefix(companyStorageRoot, 'Cash Requests', userId);
      attachmentUrl = await uploadFile(
        attachmentFile.buffer,
        attachmentFile.originalname,
        attachmentFile.mimetype,
        folder,
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

export async function submitPersonalInformationVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const user = await tenantDb('users')
      .where({ id: userId })
      .select(
        'id',
        'first_name',
        'last_name',
        'email',
        'mobile_number',
        'legal_name',
        'birthday',
        'gender',
        'valid_id_url',
      )
      .first();
    if (!user) throw new AppError(404, 'User not found');
    if (!user.valid_id_url) {
      throw new AppError(400, 'A valid ID upload is required before submitting personal information verification');
    }

    const pending = await tenantDb('personal_information_verifications')
      .where({ user_id: userId, status: 'pending' })
      .first('id');
    if (pending) {
      throw new AppError(409, 'You already have a pending personal information verification');
    }

    const requestedChanges: Record<string, unknown> = {};
    if (req.body.firstName !== undefined && req.body.firstName !== user.first_name) requestedChanges.firstName = req.body.firstName;
    if (req.body.lastName !== undefined && req.body.lastName !== user.last_name) requestedChanges.lastName = req.body.lastName;
    if (req.body.email !== undefined && req.body.email !== user.email) requestedChanges.email = req.body.email;
    if (req.body.mobileNumber !== undefined && req.body.mobileNumber !== user.mobile_number) requestedChanges.mobileNumber = req.body.mobileNumber;
    if (req.body.legalName !== undefined && req.body.legalName !== user.legal_name) requestedChanges.legalName = req.body.legalName;
    if (req.body.birthday !== undefined && req.body.birthday !== user.birthday) requestedChanges.birthday = req.body.birthday;
    if (req.body.gender !== undefined && req.body.gender !== user.gender) requestedChanges.gender = req.body.gender;

    if (Object.keys(requestedChanges).length === 0) {
      throw new AppError(400, 'No changes detected for verification');
    }

    const [verification] = await tenantDb('personal_information_verifications')
      .insert({
        user_id: userId,
        status: 'pending',
        requested_changes: JSON.stringify(requestedChanges),
        valid_id_url: user.valid_id_url,
        updated_at: new Date(),
      })
      .returning('*');

    await notifyUser(
      tenantDb,
      userId,
      'Personal Information Submitted',
      'Your personal information changes were submitted for verification.',
      'info',
      '/account/settings',
    );

    emitEmployeeVerificationUpdated({
      companyId: req.user!.companyId,
      verificationId: verification.id as string,
      verificationType: 'personal_information',
      action: 'submitted',
      userId,
    });

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function uploadValidId(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const companyStorageRoot = req.companyContext?.companyStorageRoot ?? '';
    const file = (req as any).file as Express.Multer.File | undefined;
    if (!file) throw new AppError(400, 'No document uploaded');

    const folder = buildTenantStoragePrefix(companyStorageRoot, 'Valid IDs', userId);
    const validIdUrl = await uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      folder,
    );
    if (!validIdUrl) throw new AppError(500, 'Failed to upload valid ID');

    await tenantDb('users')
      .where({ id: userId })
      .update({
        valid_id_url: validIdUrl,
        valid_id_updated_at: new Date(),
        updated_at: new Date(),
      });

    res.json({ success: true, data: { validIdUrl } });
  } catch (err) {
    next(err);
  }
}

export async function getEmploymentRequirements(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;

    const user = await tenantDb('users').where({ id: userId }).select('valid_id_url').first();
    const types = await tenantDb('employment_requirement_types')
      .where({ is_active: true })
      .select('code', 'label', 'sort_order')
      .orderBy('sort_order', 'asc');

    const latestRowsResult = await tenantDb.raw(
      `
      SELECT DISTINCT ON (requirement_code)
        id,
        requirement_code,
        document_url,
        status,
        reviewed_by,
        reviewed_at,
        rejection_reason,
        created_at,
        updated_at
      FROM employment_requirement_submissions
      WHERE user_id = ?
      ORDER BY requirement_code, created_at DESC
      `,
      [userId],
    );
    const latestRows = latestRowsResult.rows as Array<{
      id: string;
      requirement_code: string;
      document_url: string;
      status: string;
      reviewed_by: string | null;
      reviewed_at: string | null;
      rejection_reason: string | null;
      created_at: string;
      updated_at: string;
    }>;
    const latestByCode = new Map(latestRows.map((row) => [row.requirement_code, row]));

    const requirements = types.map((type: any) => {
      const latest = latestByCode.get(type.code) ?? null;
      const documentUrl = latest?.document_url ?? null;
      const sharedDocument = type.code === 'government_issued_id'
        ? (documentUrl ?? user?.valid_id_url ?? null)
        : documentUrl;
      return {
        code: type.code,
        label: type.label,
        sort_order: type.sort_order,
        latest_submission: latest,
        display_status: toDisplayStatus(latest?.status ?? null),
        document_url: sharedDocument,
      };
    });

    res.json({ success: true, data: requirements });
  } catch (err) {
    next(err);
  }
}

export async function submitEmploymentRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const userId = req.user!.sub;
    const companyStorageRoot = req.companyContext?.companyStorageRoot ?? '';
    const requirementCode = req.params.requirementCode as string;
    const file = (req as any).file as Express.Multer.File | undefined;

    const requirement = await tenantDb('employment_requirement_types')
      .where({ code: requirementCode, is_active: true })
      .first('code');
    if (!requirement) throw new AppError(404, 'Requirement type not found');

    const pending = await tenantDb('employment_requirement_submissions')
      .where({ user_id: userId, requirement_code: requirementCode, status: 'pending' })
      .first('id');
    if (pending) {
      throw new AppError(409, 'You already have a pending submission for this requirement');
    }

    let documentUrl: string | null = null;
    if (file) {
      const folder = buildTenantStoragePrefix(
        companyStorageRoot,
        'Employment Requirements',
        userId,
        requirementCode,
      );
      documentUrl = await uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        folder,
      );
      if (!documentUrl) throw new AppError(500, 'Failed to upload requirement document');
    } else if (requirementCode === 'government_issued_id') {
      const user = await tenantDb('users')
        .where({ id: userId })
        .select('valid_id_url')
        .first();
      if (!user?.valid_id_url) {
        throw new AppError(400, 'No document uploaded and no existing valid ID available');
      }
      documentUrl = user.valid_id_url as string;
    } else {
      throw new AppError(400, 'No document uploaded');
    }

    const [submission] = await tenantDb('employment_requirement_submissions')
      .insert({
        user_id: userId,
        requirement_code: requirementCode,
        document_url: documentUrl as string,
        status: 'pending',
        updated_at: new Date(),
      })
      .returning('*');

    if (requirementCode === 'government_issued_id' && file) {
      await tenantDb('users')
        .where({ id: userId })
        .update({
          valid_id_url: documentUrl as string,
          valid_id_updated_at: new Date(),
          updated_at: new Date(),
        });
    }

    await notifyUser(
      tenantDb,
      userId,
      'Employment Requirement Submitted',
      'Your employment requirement was submitted for verification.',
      'info',
      '/account/employment',
    );

    emitEmployeeVerificationUpdated({
      companyId: req.user!.companyId,
      verificationId: submission.id as string,
      verificationType: 'employment_requirement',
      action: 'submitted',
      userId,
    });
    emitEmployeeRequirementUpdated({
      companyId: req.user!.companyId,
      action: 'submitted',
      submissionId: submission.id as string,
      userId,
      requirementCode,
    });

    res.status(201).json({ success: true, data: submission });
  } catch (err) {
    next(err);
  }
}
