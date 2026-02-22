import type { NextFunction, Request, Response } from 'express';
import {
  createShiftExchangeSchema,
  listShiftExchangeOptionsSchema,
  rejectShiftExchangeSchema,
  respondShiftExchangeSchema,
} from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import * as shiftExchangeService from '../services/shiftExchange.service.js';

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: boolean; data?: T } }, raw: unknown, message: string): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, message);
  }
  return parsed.data as T;
}

export async function listOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseBody<{ fromShiftId: string }>(
      listShiftExchangeOptionsSchema,
      req.query,
      'Invalid shift exchange options query',
    );

    const data = await shiftExchangeService.listShiftExchangeOptions({
      requesterUserId: req.user!.sub,
      currentCompanyId: req.user!.companyId,
      fromShiftId: query.fromShiftId,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseBody<{
      fromShiftId: string;
      toShiftId: string;
      toCompanyId: string;
    }>(createShiftExchangeSchema, req.body, 'Invalid shift exchange payload');

    const data = await shiftExchangeService.createShiftExchangeRequest({
      requesterUserId: req.user!.sub,
      currentCompanyId: req.user!.companyId,
      fromShiftId: body.fromShiftId,
      toShiftId: body.toShiftId,
      toCompanyId: body.toCompanyId,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await shiftExchangeService.getShiftExchangeDetail({
      requestId: req.params.id as string,
      actingUserId: req.user!.sub,
      actingRoleNames: req.user!.roles ?? [],
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function respond(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseBody<{ action: 'accept' | 'reject'; reason?: string }>(
      respondShiftExchangeSchema,
      req.body,
      'Invalid shift exchange response payload',
    );

    const data = await shiftExchangeService.respondToShiftExchange({
      requestId: req.params.id as string,
      actingUserId: req.user!.sub,
      action: body.action,
      reason: body.reason,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await shiftExchangeService.approveShiftExchange({
      requestId: req.params.id as string,
      actingUserId: req.user!.sub,
      actingRoleNames: req.user!.roles ?? [],
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    const body = parseBody<{ reason: string }>(
      rejectShiftExchangeSchema,
      req.body,
      'Invalid shift exchange rejection payload',
    );

    const data = await shiftExchangeService.rejectShiftExchange({
      requestId: req.params.id as string,
      actingUserId: req.user!.sub,
      actingRoleNames: req.user!.roles ?? [],
      reason: body.reason,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
