import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PERMISSIONS } from '@omnilert/shared';
import { getIO } from '../config/socket.js';
import { AppError } from '../middleware/errorHandler.js';
import * as peerEvaluationService from '../services/peerEvaluation.service.js';

const submitSchema = z.object({
  q1_score: z.number().int().min(1).max(5),
  q2_score: z.number().int().min(1).max(5),
  q3_score: z.number().int().min(1).max(5),
  additional_message: z.string().max(1000).optional(),
});

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const filters = {
      status: req.query.status as string | undefined,
      evaluatorName: req.query.evaluatorName as string | undefined,
      evaluatedName: req.query.evaluatedName as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
      sortOrder: req.query.sortOrder as string | undefined,
      page: req.query.page ? Number(req.query.page) : undefined,
      pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    };

    const result = await peerEvaluationService.listPeerEvaluations(req.tenantDb!, filters);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
}

export async function getById(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const evaluation = await peerEvaluationService.getPeerEvaluationById(req.tenantDb!, id);
    if (!evaluation) throw new AppError(404, 'Peer evaluation not found');
    res.json({ success: true, data: evaluation });
  } catch (err) {
    next(err);
  }
}

export async function getMyPending(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user!.sub;
    const evaluations = await peerEvaluationService.getPendingForUser(req.tenantDb!, userId);
    res.json({ success: true, data: evaluations });
  } catch (err) {
    next(err);
  }
}

export async function submit(req: Request, res: Response, next: NextFunction) {
  try {
    const id = req.params.id as string;
    const userId = req.user!.sub;

    const parsed = submitSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, parsed.error.errors[0]?.message ?? 'Invalid request body');
    }

    const result = await peerEvaluationService.submitEvaluation(req.tenantDb!, id, userId, parsed.data);

    try {
      getIO().of('/peer-evaluations').to('company:' + req.companyContext!.companyId).emit('peer-evaluation:completed', { id, shift_id: result.shift_id });
    } catch { /* socket might not be ready */ }

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
