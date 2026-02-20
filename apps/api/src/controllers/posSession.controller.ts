import type { Request, Response, NextFunction } from 'express';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

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

    let query = tenantDb('pos_sessions').orderBy('created_at', 'desc');

    if (requestedIds && requestedIds.length > 0) {
      // Intersect with user's allowed branches for security (admins bypass)
      const allowed = user.permissions.includes('admin.view_all_branches')
        ? requestedIds
        : requestedIds.filter((id) => user.branchIds.includes(id));
      query = query.whereIn('branch_id', allowed);
    } else if (!user.permissions.includes('admin.view_all_branches')) {
      query = query.whereIn('branch_id', user.branchIds);
    }

    const sessions = await query;

    // Attach verifications with images for each session (linked by pos_session_id)
    const sessionIds = sessions.map((s: { id: string }) => s.id);

    const verifications =
      sessionIds.length > 0
        ? await tenantDb('pos_verifications').whereIn('pos_session_id', sessionIds)
        : [];

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

    const verWithImages = verifications.map((v: { id: string; pos_session_id: string }) => ({
      ...v,
      images: imageMap.get(v.id) || [],
    }));

    const verBySession = new Map<string, typeof verWithImages>();
    for (const v of verWithImages) {
      const list = verBySession.get(v.pos_session_id) || [];
      list.push(v);
      verBySession.set(v.pos_session_id, list);
    }

    const result = sessions.map((s: { id: string }) => ({
      ...s,
      verifications: verBySession.get(s.id) || [],
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

    const session = await tenantDb('pos_sessions').where({ id }).first();
    if (!session) throw new AppError(404, 'Session not found');

    const verifications = await tenantDb('pos_verifications')
      .where('pos_session_id', id as string);

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

    const verificationsWithImages = verifications.map((v: { id: string }) => ({
      ...v,
      images: imageMap.get(v.id) || [],
    }));

    // Resolve reviewer, auditor, and customer names
    const userIds = [
      ...new Set(
        verificationsWithImages.flatMap((v: any) => [v.reviewed_by, v.audited_by, v.customer_user_id]).filter(Boolean) as string[],
      ),
    ];
    const users =
      userIds.length > 0
        ? await tenantDb('users').whereIn('id', userIds).select('id', 'first_name', 'last_name')
        : [];
    const userMap = new Map(
      users.map((u: { id: string; first_name: string; last_name: string }) => [
        u.id,
        `${u.first_name} ${u.last_name}`,
      ]),
    );

    const enrichedVerifications = verificationsWithImages.map((v: any) => ({
      ...v,
      reviewer_name: v.reviewed_by ? (userMap.get(v.reviewed_by) ?? v.reviewed_by) : null,
      auditor_name: v.audited_by ? (userMap.get(v.audited_by) ?? v.audited_by) : null,
      customer_name: v.customer_user_id ? (userMap.get(v.customer_user_id) ?? null) : null,
    }));

    res.json({ success: true, data: { ...session, verifications: enrichedVerifications } });
  } catch (err) {
    next(err);
  }
}

export async function auditComplete(req: Request, res: Response, next: NextFunction) {
  try {
    const tenantDb = req.tenantDb!;
    const { id } = req.params;
    const user = req.user!;

    const session = await tenantDb('pos_sessions').where({ id }).first();
    if (!session) throw new AppError(404, 'Session not found');
    if (session.status === 'audit_complete') {
      throw new AppError(400, 'Session is already audited');
    }

    const [updated] = await tenantDb('pos_sessions')
      .where({ id })
      .update({
        status: 'audit_complete',
        audited_by: user.sub,
        audited_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    // Fetch verifications with audit data for downstream use
    const verifications = await tenantDb('pos_verifications')
      .where('pos_session_id', id)
      .select(
        'id', 'title', 'verification_type', 'status', 'amount',
        'reviewed_by', 'reviewed_at', 'review_notes',
        'breakdown', 'audit_rating', 'audit_details',
      );

    try {
      const io = getIO();
      io.of('/pos-session')
        .to(`branch:${session.branch_id}`)
        .emit('pos-session:updated', { ...updated, verifications: [] });
    } catch {
      logger.warn('Socket.IO not available');
    }

    res.json({ success: true, data: { ...updated, verifications } });
  } catch (err) {
    next(err);
  }
}
