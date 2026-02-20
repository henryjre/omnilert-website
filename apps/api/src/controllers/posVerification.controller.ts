import type { Request, Response, NextFunction } from 'express';
import type { Knex } from 'knex';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { updatePosSessionOpeningPcf, updatePosSessionClosingPcf } from '../services/odoo.service.js';
import { uploadFile } from '../services/storage.service.js';

async function resolveUserName(db: Knex, userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null;
  const user = await db('users').where({ id: userId }).select('first_name', 'last_name').first();
  return user ? `${user.first_name} ${user.last_name}` : null;
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const user = req.user!;
    const branchIdsParam = req.query.branchIds as string | undefined;
    const branchId = req.query.branchId as string | undefined;

    // Parse branchIds (comma-separated) or fall back to single branchId
    let requestedIds: string[] | undefined;
    if (branchIdsParam) {
      requestedIds = branchIdsParam.split(',').filter(Boolean);
    } else if (branchId) {
      requestedIds = [branchId];
    }

    const statusParam = req.query.status as string | undefined;

    let query = tenantDb('pos_verifications').orderBy('created_at', 'desc');

    if (statusParam) {
      query = query.where('status', statusParam);
    }

    if (requestedIds && requestedIds.length > 0) {
      // Intersect with user's allowed branches for security (admins bypass)
      const allowed = user.permissions.includes('admin.view_all_branches')
        ? requestedIds
        : requestedIds.filter((id) => user.branchIds.includes(id));
      query = query.whereIn('branch_id', allowed);
    } else if (!user.permissions.includes('admin.view_all_branches')) {
      query = query.whereIn('branch_id', user.branchIds);
    }

    const verifications = await query;

    // Attach images
    const vIds = verifications.map((v: { id: string }) => v.id);
    const images =
      vIds.length > 0
        ? await tenantDb('pos_verification_images').whereIn('pos_verification_id', vIds)
        : [];

    const imageMap = new Map<string, typeof images>();
    for (const img of images) {
      const list = imageMap.get(img.pos_verification_id) || [];
      list.push(img);
      imageMap.set(img.pos_verification_id, list);
    }

    // Resolve customer names for token_pay_order verifications
    const customerUserIds = [
      ...new Set(
        verifications
          .filter((v: any) => v.verification_type === 'token_pay_order' && v.customer_user_id)
          .map((v: any) => v.customer_user_id as string),
      ),
    ];
    const customerNames: Record<string, string> = {};
    if (customerUserIds.length > 0) {
      const customerUsers = await tenantDb('users')
        .whereIn('id', customerUserIds)
        .select('id', 'first_name', 'last_name');
      for (const u of customerUsers) {
        customerNames[u.id] = `${u.first_name} ${u.last_name}`;
      }
    }

    const result = verifications.map((v: any) => ({
      ...v,
      images: imageMap.get(v.id) || [],
      customer_name: v.customer_user_id ? (customerNames[v.customer_user_id] ?? null) : null,
    }));

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function get(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');

    const images = await tenantDb('pos_verification_images')
      .where('pos_verification_id', id);

    res.json({ success: true, data: { ...verification, images } });
  } catch (err) {
    next(err);
  }
}

export async function uploadImage(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const verificationId = req.params.id as string;
    const user = req.user!;

    const verification = await tenantDb('pos_verifications').where({ id: verificationId }).first();
    if (!verification) throw new AppError(404, 'Verification not found');

    if (!req.file) throw new AppError(400, 'No file uploaded');

    // Upload to S3
    const fileUrl = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      "POS Verifications"
    );
    if (!fileUrl) {
      throw new AppError(500, 'Failed to upload image to storage');
    }

    const [image] = await tenantDb('pos_verification_images')
      .insert({
        pos_verification_id: verificationId,
        uploaded_by: user.sub,
        file_path: fileUrl, // Store S3 URL instead of local path
        file_name: req.file.originalname,
        mime_type: req.file.mimetype,
        file_size: req.file.size,
      })
      .returning('*');

    // Emit real-time event with S3 URL
    try {
      const io = getIO();
      io.of('/pos-verification')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:image-uploaded', {
          verificationId,
          imageUrl: fileUrl,
          fileName: req.file.originalname,
        });
    } catch {
      logger.warn('Socket.IO not available for image upload emit');
    }

    res.status(201).json({ success: true, data: image });
  } catch (err) {
    next(err);
  }
}

export async function confirm(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const user = req.user!;
    const { notes, breakdownItems } = req.body as {
      notes?: string;
      breakdownItems?: { denomination: number; quantity: number }[];
    };

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');
    if (verification.status !== 'pending') {
      throw new AppError(400, 'Verification is no longer pending');
    }

    // Discount/refund/non-cash/token-pay orders: only the assigned cashier or an Administrator may act.
    // Fallback: if cashier_user_id is NULL (x_website_key was absent from payload), allow any branch member.
    if (
      verification.verification_type === 'discount_order' ||
      verification.verification_type === 'refund_order' ||
      verification.verification_type === 'non_cash_order' ||
      verification.verification_type === 'token_pay_order' ||
      verification.verification_type === 'ispe_purchase_order' ||
      verification.verification_type === 'register_cash_out' ||
      verification.verification_type === 'register_cash_in'
    ) {
      const isAssignedCashier = verification.cashier_user_id && user.sub === verification.cashier_user_id;
      const roleNames: string[] = await tenantDb('user_roles')
        .join('roles', 'roles.id', 'user_roles.role_id')
        .where('user_roles.user_id', user.sub)
        .pluck('roles.name');
      const isAdmin = roleNames.includes('Administrator');
      const noCashierAssigned = !verification.cashier_user_id;
      const isInBranch = (user.branchIds as string[]).includes(verification.branch_id);
      if (!isAssignedCashier && !isAdmin && !(noCashierAssigned && isInBranch)) {
        throw new AppError(403, 'Only the cashier or an Administrator can act on this verification');
      }
    }

    // Token pay orders: cashier confirm sets status to 'awaiting_customer' and notifies the customer
    if (verification.verification_type === 'token_pay_order') {
      const imageCount = await tenantDb('pos_verification_images')
        .where('pos_verification_id', id)
        .count('id as count')
        .first();
      if (!imageCount || Number(imageCount.count) === 0) {
        throw new AppError(400, 'At least one image must be uploaded before confirming');
      }

      const [updated] = await tenantDb('pos_verifications')
        .where({ id })
        .update({
          status: 'awaiting_customer',
          reviewed_by: user.sub,
          reviewed_at: new Date(),
          review_notes: notes || null,
          updated_at: new Date(),
        })
        .returning('*');

      const images = await tenantDb('pos_verification_images').where('pos_verification_id', id);
      const reviewer_name = await resolveUserName(tenantDb, user.sub);

      try {
        const io = getIO();
        const socketPayload = { ...updated, images, reviewer_name };
        io.of('/pos-verification').to(`branch:${verification.branch_id}`).emit('pos-verification:updated', socketPayload);
      } catch {
        logger.warn('Socket.IO not available');
      }

      // Notify the customer
      if (verification.customer_user_id) {
        const [notif] = await tenantDb('employee_notifications')
          .insert({
            user_id: verification.customer_user_id,
            title: 'Token Pay Order Requires Your Verification',
            message: `A Token Pay Order (${verification.title}) requires your verification. Please review and confirm or reject.`,
            type: 'warning',
            link_url: `/account?tokenPayVerificationId=${id}`,
          })
          .returning('*');

        try {
          const io = getIO();
          io.of('/notifications').to(`user:${verification.customer_user_id}`).emit('notification:new', notif);
        } catch {
          logger.warn('Socket.IO not available for customer notification');
        }
      }

      return res.json({ success: true, data: { ...updated, images } });
    }

    // Check images exist (not required for refund orders)
    if (verification.verification_type !== 'refund_order') {
      const imageCount = await tenantDb('pos_verification_images')
        .where('pos_verification_id', id)
        .count('id as count')
        .first();

      if (!imageCount || Number(imageCount.count) === 0) {
        throw new AppError(400, 'At least one image must be uploaded before confirming');
      }
    }

    const updatePayload: Record<string, unknown> = {
      status: 'confirmed',
      reviewed_by: user.sub,
      reviewed_at: new Date(),
      review_notes: notes || null,
      updated_at: new Date(),
    };

    if (Array.isArray(breakdownItems) && breakdownItems.length > 0) {
      updatePayload.breakdown = JSON.stringify(breakdownItems);
    }

    const [updated] = await tenantDb('pos_verifications')
      .where({ id })
      .update(updatePayload)
      .returning('*');

    const images = await tenantDb('pos_verification_images')
      .where('pos_verification_id', id);
    const reviewer_name = await resolveUserName(tenantDb, user.sub);

    try {
      const io = getIO();
      const payload = { ...updated, images, reviewer_name };
      io.of('/pos-verification')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', payload);
      io.of('/pos-session')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', payload);
    } catch {
      logger.warn('Socket.IO not available');
    }

    // Fire-and-forget Odoo PCF update via RPC
    if (
      verification.verification_type === 'pcf_breakdown' ||
      verification.verification_type === 'closing_pcf_breakdown'
    ) {
      const countedAmount =
        Array.isArray(breakdownItems) && breakdownItems.length > 0
          ? breakdownItems.reduce((sum, item) => sum + item.denomination * item.quantity, 0)
          : Number(verification.amount ?? 0);

      const session = verification.pos_session_id
        ? await tenantDb('pos_sessions').where({ id: verification.pos_session_id }).first()
        : null;

      if (session) {
        const sessionOdooPayload =
          typeof session.odoo_payload === 'string'
            ? JSON.parse(session.odoo_payload)
            : session.odoo_payload;
        const companyId: number | null = sessionOdooPayload?.company_id ?? null;
        const sessionName: string | null = session.session_name ?? null;

        if (verification.verification_type === 'pcf_breakdown' && sessionName) {
          // Opening PCF - find by x_pos_name and update x_opening_pcf
          updatePosSessionOpeningPcf(sessionName, countedAmount)
            .catch((err) => logger.warn('Odoo opening PCF update failed:', err));
        } else if (verification.verification_type === 'closing_pcf_breakdown' && companyId) {
          // Closing PCF - find by state='opening_control' and company_id, update x_closing_pcf
          updatePosSessionClosingPcf(companyId, countedAmount)
            .catch((err) => logger.warn('Odoo closing PCF update failed:', err));
        }
      }
    }

    res.json({ success: true, data: { ...updated, images } });
  } catch (err) {
    next(err);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const user = req.user!;

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');
    if (verification.status !== 'pending') {
      throw new AppError(400, 'Verification is no longer pending');
    }

    // Discount/refund/non-cash/token-pay orders: only the assigned cashier or an Administrator may act.
    // Fallback: if cashier_user_id is NULL (x_website_key was absent from payload), allow any branch member.
    if (
      verification.verification_type === 'discount_order' ||
      verification.verification_type === 'refund_order' ||
      verification.verification_type === 'non_cash_order' ||
      verification.verification_type === 'token_pay_order' ||
      verification.verification_type === 'ispe_purchase_order' ||
      verification.verification_type === 'register_cash_out' ||
      verification.verification_type === 'register_cash_in'
    ) {
      const isAssignedCashier = verification.cashier_user_id && user.sub === verification.cashier_user_id;
      const roleNames: string[] = await tenantDb('user_roles')
        .join('roles', 'roles.id', 'user_roles.role_id')
        .where('user_roles.user_id', user.sub)
        .pluck('roles.name');
      const isAdmin = roleNames.includes('Administrator');
      const noCashierAssigned = !verification.cashier_user_id;
      const isInBranch = (user.branchIds as string[]).includes(verification.branch_id);
      if (!isAssignedCashier && !isAdmin && !(noCashierAssigned && isInBranch)) {
        throw new AppError(403, 'Only the cashier or an Administrator can act on this verification');
      }
    }

    const [updated] = await tenantDb('pos_verifications')
      .where({ id })
      .update({
        status: 'rejected',
        reviewed_by: user.sub,
        reviewed_at: new Date(),
        review_notes: req.body.notes || null,
        updated_at: new Date(),
      })
      .returning('*');

    const images = await tenantDb('pos_verification_images')
      .where('pos_verification_id', id);
    const reviewer_name = await resolveUserName(tenantDb, user.sub);

    try {
      const io = getIO();
      const payload = { ...updated, images, reviewer_name };
      io.of('/pos-verification')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', payload);
      io.of('/pos-session')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', payload);
    } catch {
      logger.warn('Socket.IO not available');
    }

    res.json({ success: true, data: { ...updated, images } });
  } catch (err) {
    next(err);
  }
}

export async function auditVerification(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const user = req.user!;
    const { rating, details } = req.body as { rating: number; details?: string };

    if (!rating || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new AppError(400, 'Rating must be an integer between 1 and 5');
    }

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');
    if (verification.status === 'pending') {
      throw new AppError(400, 'Cannot audit a pending verification');
    }

    const [updated] = await tenantDb('pos_verifications')
      .where({ id })
      .update({
        audit_rating: rating,
        audit_details: details || null,
        audited_by: user.sub,
        audited_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    const images = await tenantDb('pos_verification_images').where('pos_verification_id', id);
    const auditor_name = await resolveUserName(tenantDb, user.sub);

    try {
      const io = getIO();
      const payload = { ...updated, images, auditor_name };
      io.of('/pos-verification')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', payload);
      io.of('/pos-session')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', payload);
    } catch {
      logger.warn('Socket.IO not available');
    }

    res.json({ success: true, data: { ...updated, images } });
  } catch (err) {
    next(err);
  }
}

export async function customerVerify(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const user = req.user!;

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');
    if (verification.status !== 'awaiting_customer') {
      throw new AppError(400, 'Verification is not awaiting customer verification');
    }
    if (user.sub !== verification.customer_user_id) {
      throw new AppError(403, 'Only the assigned customer can verify this order');
    }

    const [updated] = await tenantDb('pos_verifications')
      .where({ id })
      .update({ status: 'confirmed', updated_at: new Date() })
      .returning('*');

    const images = await tenantDb('pos_verification_images').where('pos_verification_id', id);

    try {
      const io = getIO();
      const socketPayload = { ...updated, images };
      io.of('/pos-verification').to(`branch:${verification.branch_id}`).emit('pos-verification:updated', socketPayload);
      io.of('/pos-session').to(`branch:${verification.branch_id}`).emit('pos-verification:updated', socketPayload);
    } catch {
      logger.warn('Socket.IO not available');
    }

    // Notify the cashier
    if (verification.cashier_user_id) {
      const [notif] = await tenantDb('employee_notifications')
        .insert({
          user_id: verification.cashier_user_id,
          title: 'Token Pay Order Verified',
          message: `The customer verified the Token Pay Order (${verification.title}).`,
          type: 'success',
          link_url: '/pos-verification',
        })
        .returning('*');
      try {
        const io = getIO();
        io.of('/notifications').to(`user:${verification.cashier_user_id}`).emit('notification:new', notif);
      } catch {
        logger.warn('Socket.IO not available for cashier notification');
      }
    }

    res.json({ success: true, data: { ...updated, images } });
  } catch (err) {
    next(err);
  }
}

export async function customerReject(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const user = req.user!;
    const { reason } = req.body as { reason?: string };

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');
    if (verification.status !== 'awaiting_customer') {
      throw new AppError(400, 'Verification is not awaiting customer verification');
    }
    if (user.sub !== verification.customer_user_id) {
      throw new AppError(403, 'Only the assigned customer can reject this order');
    }

    const [updated] = await tenantDb('pos_verifications')
      .where({ id })
      .update({
        status: 'rejected',
        customer_rejection_reason: reason || null,
        updated_at: new Date(),
      })
      .returning('*');

    const images = await tenantDb('pos_verification_images').where('pos_verification_id', id);

    try {
      const io = getIO();
      const socketPayload = { ...updated, images };
      io.of('/pos-verification').to(`branch:${verification.branch_id}`).emit('pos-verification:updated', socketPayload);
      io.of('/pos-session').to(`branch:${verification.branch_id}`).emit('pos-verification:updated', socketPayload);
    } catch {
      logger.warn('Socket.IO not available');
    }

    // Notify the cashier
    if (verification.cashier_user_id) {
      const rejectionMsg = reason
        ? `The customer rejected the Token Pay Order (${verification.title}). Reason: ${reason}`
        : `The customer rejected the Token Pay Order (${verification.title}).`;
      const [notif] = await tenantDb('employee_notifications')
        .insert({
          user_id: verification.cashier_user_id,
          title: 'Token Pay Order Rejected by Customer',
          message: rejectionMsg,
          type: 'danger',
          link_url: '/pos-verification',
        })
        .returning('*');
      try {
        const io = getIO();
        io.of('/notifications').to(`user:${verification.cashier_user_id}`).emit('notification:new', notif);
      } catch {
        logger.warn('Socket.IO not available for cashier notification');
      }
    }

    res.json({ success: true, data: { ...updated, images } });
  } catch (err) {
    next(err);
  }
}

export async function submitBreakdown(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const { items, notes } = req.body as {
      items: { denomination: number; quantity: number }[];
      notes?: string;
    };

    const verification = await tenantDb('pos_verifications').where({ id }).first();
    if (!verification) throw new AppError(404, 'Verification not found');
    if (verification.status !== 'pending') {
      throw new AppError(400, 'Verification is no longer pending');
    }

    const [updated] = await tenantDb('pos_verifications')
      .where({ id })
      .update({
        breakdown: JSON.stringify(items),
        review_notes: notes || verification.review_notes,
        updated_at: new Date(),
      })
      .returning('*');

    const images = await tenantDb('pos_verification_images').where('pos_verification_id', id);

    try {
      const io = getIO();
      io.of('/pos-verification')
        .to(`branch:${verification.branch_id}`)
        .emit('pos-verification:updated', { ...updated, images });
    } catch {
      logger.warn('Socket.IO not available');
    }

    res.json({ success: true, data: { ...updated, images } });
  } catch (err) {
    next(err);
  }
}
