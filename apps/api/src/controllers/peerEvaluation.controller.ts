import type { Request, Response, NextFunction } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { getIO } from '../config/socket.js';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as peerEvaluationService from '../services/peerEvaluation.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const canManage = req.user!.permissions.includes(PERMISSIONS.WORKPLACE_RELATIONS_VIEW);
    const filters = {
      status: req.query.status as string | undefined,
      dateFrom: (req.query.date_from ?? req.query.dateFrom) as string | undefined,
      dateTo: (req.query.date_to ?? req.query.dateTo) as string | undefined,
      sortBy: (req.query.sort_by ?? req.query.sortBy) as string | undefined,
      sortOrder: ((req.query.sort_order ?? req.query.sortOrder) as 'asc' | 'desc' | undefined),
      userId: req.query.user_id as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
      companyId: req.companyContext!.companyId,
      requesterUserId: req.user!.sub,
      canManage,
    };

    const result = await peerEvaluationService.listPeerEvaluations(filters);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const canManage = req.user!.permissions.includes(PERMISSIONS.WORKPLACE_RELATIONS_VIEW);
    const evaluation = await peerEvaluationService.getPeerEvaluationById(id, {
      requesterUserId: req.user!.sub,
      canManage,
    });
    if (!evaluation) throw new AppError(404, 'Peer evaluation not found');
    res.json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
}

export async function getMyPending(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const evaluations = await peerEvaluationService.getPendingForUser(userId);
    res.json({ success: true, data: evaluations });
  } catch (err) {
    next(err);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const userId = req.user!.sub;
    const { companyId } = req.companyContext!;

    const result = await peerEvaluationService.submitEvaluation(id, userId, req.body);
    const shift = await db.getDb()('employee_shifts')
      .where({ id: result.shift_id })
      .select('branch_id')
      .first();

    let submittedLog: Record<string, unknown> | null = null;
    if (shift?.branch_id) {
      [submittedLog] = await db.getDb()('shift_logs')
        .insert({
          company_id: companyId,
          shift_id: result.shift_id,
          branch_id: shift.branch_id,
          log_type: 'peer_evaluation_submitted',
          changes: JSON.stringify({
            peer_evaluation_id: result.id,
            evaluator_user_id: result.evaluator_user_id,
            evaluated_user_id: result.evaluated_user_id,
            submitted_by: userId,
            note: 'Peer evaluation has been submitted.',
          }),
          event_time: result.submitted_at ? new Date(result.submitted_at) : new Date(),
          odoo_payload: JSON.stringify({}),
        })
        .returning('*');
    }

    try {
      const io = getIO();
      io.of('/peer-evaluations').to('company:' + companyId).emit('peer-evaluation:completed', { id });
      if (submittedLog && shift?.branch_id) {
        io.of('/employee-shifts').to(`branch:${shift.branch_id}`).emit('shift:log-new', submittedLog);
      }
    } catch { /* socket might not be ready */ }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
