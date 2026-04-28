import type { Request, Response, NextFunction } from 'express';
import type {
  CreateRewardRequestInput,
  RejectRewardRequestInput,
  RewardRequestStatus,
} from '@omnilert/shared';
import * as service from '../services/reward.service.js';

function normalizeStatus(value: unknown): RewardRequestStatus | undefined {
  if (value === 'pending' || value === 'approved' || value === 'rejected') return value;
  return undefined;
}

export async function listRewardRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const result = await service.listRewardRequests({
      companyId,
      status: normalizeStatus(req.query.status),
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 10,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function createRewardRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const input = req.body as CreateRewardRequestInput;
    const result = await service.createRewardRequest({
      companyId,
      createdByUserId: req.user!.sub,
      targetUserIds: input.targetUserIds,
      epiDelta: input.epiDelta,
      reason: input.reason,
    });
    res.status(201).json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getRewardRequestDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };
    const result = await service.getRewardRequestDetail({ companyId, requestId: id });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function approveRewardRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };
    const result = await service.approveRewardRequest({
      companyId,
      requestId: id,
      actingUserId: req.user!.sub,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function rejectRewardRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };
    const input = req.body as RejectRewardRequestInput;
    const result = await service.rejectRewardRequest({
      companyId,
      requestId: id,
      actingUserId: req.user!.sub,
      rejectionReason: input.rejectionReason,
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getGroupedUsers(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const result = await service.getGroupedUsers(companyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}
