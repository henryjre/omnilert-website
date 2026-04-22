import type { NextFunction, Request, Response } from 'express';
import type {
  CreatePayrollAdjustmentRequestInput,
  PayrollAdjustmentEmployeeStatus,
  PayrollAdjustmentManagerStatus,
  UpdatePayrollAdjustmentProcessingInput,
  RejectPayrollAdjustmentInput,
} from '@omnilert/shared';
import {
  authorizePayrollAdjustment,
  completePayrollAdjustmentFromWebhook,
  confirmPayrollAdjustmentRequest,
  createPayrollAdjustmentRequest,
  getPayrollAdjustmentEmployeeDetail,
  getPayrollAdjustmentRequestDetail,
  listPayrollAdjustmentEmployeeItems,
  listPayrollAdjustmentRequests,
  rejectPayrollAdjustmentRequest,
  updatePayrollAdjustmentProcessing,
  approvePayrollAdjustmentRequest,
} from '../services/payrollAdjustment.service.js';
import { AppError } from '../middleware/errorHandler.js';

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseUuidList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => String(entry)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return [];
}

function parseManagerStatus(value: unknown): PayrollAdjustmentManagerStatus | undefined {
  if (typeof value !== 'string' || value === 'all' || value.trim() === '') return undefined;

  const normalized = value.trim() as PayrollAdjustmentManagerStatus;
  const allowed = new Set<PayrollAdjustmentManagerStatus>([
    'pending',
    'processing',
    'employee_approval',
    'in_progress',
    'completed',
    'rejected',
  ]);

  if (!allowed.has(normalized)) {
    throw new AppError(400, 'Invalid payroll adjustment status');
  }

  return normalized;
}

function parseEmployeeStatus(value: unknown): PayrollAdjustmentEmployeeStatus | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;

  const normalized = value.trim() as PayrollAdjustmentEmployeeStatus;
  const allowed = new Set<PayrollAdjustmentEmployeeStatus>([
    'pending',
    'in_progress',
    'completed',
  ]);

  if (!allowed.has(normalized)) {
    throw new AppError(400, 'Invalid payroll adjustment employee status');
  }

  return normalized;
}

export async function listManagerRequests(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const status = parseManagerStatus(req.query.status);
    const branchIds = parseUuidList(req.query.branchIds);
    const page = parsePositiveInt(req.query.page as string | undefined, 1, 10000);
    const limit = parsePositiveInt(req.query.limit as string | undefined, 20, 250);

    const result = await listPayrollAdjustmentRequests({
      companyId,
      status,
      branchIds,
      page,
      limit,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function createManagerRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const userId = req.user!.sub;
    const input = req.body as CreatePayrollAdjustmentRequestInput;

    const result = await createPayrollAdjustmentRequest({
      companyId,
      branchId: input.branchId,
      createdByUserId: userId,
      type: input.type,
      totalAmount: input.totalAmount,
      reason: input.reason,
      payrollPeriods: input.payrollPeriods,
      targetUserIds: input.targetUserIds,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getManagerRequestDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };

    const result = await getPayrollAdjustmentRequestDetail(id, companyId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function confirmManagerRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };
    await confirmPayrollAdjustmentRequest(id, companyId, req.user!.sub);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function updateProcessingRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };
    const input = req.body as UpdatePayrollAdjustmentProcessingInput;

    await updatePayrollAdjustmentProcessing({
      requestId: id,
      companyId,
      actingUserId: req.user!.sub,
      totalAmount: input.totalAmount,
      payrollPeriods: input.payrollPeriods,
      targetUserIds: input.targetUserIds,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function approveManagerRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };

    await approvePayrollAdjustmentRequest({
      requestId: id,
      companyId,
      actingUserId: req.user!.sub,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function rejectManagerRequest(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { id } = req.params as { id: string };
    const input = req.body as RejectPayrollAdjustmentInput;

    await rejectPayrollAdjustmentRequest({
      requestId: id,
      companyId,
      actingUserId: req.user!.sub,
      reason: input.reason,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function listEmployeeAdjustments(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const status = parseEmployeeStatus(req.query.status);
    const branchIds = parseUuidList(req.query.branchIds);
    const page = parsePositiveInt(req.query.page as string | undefined, 1, 10000);
    const limit = parsePositiveInt(req.query.limit as string | undefined, 20, 250);

    const result = await listPayrollAdjustmentEmployeeItems({
      companyId,
      userId: req.user!.sub,
      status,
      branchIds,
      page,
      limit,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function getEmployeeAdjustmentDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { targetId } = req.params as { targetId: string };

    const result = await getPayrollAdjustmentEmployeeDetail({
      targetId,
      userId: req.user!.sub,
      companyId,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function authorizeEmployeeAdjustment(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const { targetId } = req.params as { targetId: string };

    await authorizePayrollAdjustment({
      targetId,
      userId: req.user!.sub,
      companyId,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function completeFromOdooWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    const payload = req.body as { _id: number };
    await completePayrollAdjustmentFromWebhook(payload._id);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
