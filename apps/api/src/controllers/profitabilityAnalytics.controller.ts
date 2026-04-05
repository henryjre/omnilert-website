import type { NextFunction, Request, Response } from 'express';
import { PERMISSIONS } from '@omnilert/shared';
import { db } from '../config/database.js';
import { getAssignedBranches } from '../services/assignedBranch.service.js';
import { getProfitabilityBranchConfig } from '../config/profitabilityAnalytics.config.js';
import {
  getProfitabilityAnalytics,
  type ProfitabilityAnalyticsBranchInput,
  type ProfitabilityGranularity,
} from '../services/profitabilityAnalytics.service.js';
import { normalizeEmail } from '../services/globalUser.service.js';
import { AppError } from '../middleware/errorHandler.js';

function parseGranularity(value: string | undefined): ProfitabilityGranularity {
  if (!value) {
    throw new AppError(400, 'granularity is required');
  }

  if (value !== 'day' && value !== 'week' && value !== 'month' && value !== 'year') {
    throw new AppError(400, 'granularity must be one of day, week, month, or year');
  }

  return value;
}

function parseRangeYmd(value: string | undefined, fieldName: 'rangeStartYmd' | 'rangeEndYmd'): string {
  if (!value) {
    throw new AppError(400, `${fieldName} is required`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new AppError(400, `${fieldName} must be in YYYY-MM-DD format`);
  }

  return value;
}

function parseBranchIds(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseBranchIds(entry));
  }

  return [];
}

async function resolveAccessibleProfitabilityBranches(
  userId: string,
  permissions: string[],
): Promise<ProfitabilityAnalyticsBranchInput[]> {
  const canViewAllBranches = permissions.includes(PERMISSIONS.ADMIN_VIEW_ALL_BRANCHES);
  const user = await db.getDb()('users').where({ id: userId }).first('email');
  const isSuperAdmin = user
    ? Boolean(
      await db.getDb()('super_admins')
        .whereRaw('LOWER(email) = ?', [normalizeEmail(String(user.email ?? ''))])
        .first('id'),
    )
    : false;

  const assignedBranchGroups = await getAssignedBranches(userId, isSuperAdmin, canViewAllBranches);

  return assignedBranchGroups.flatMap((group) =>
    group.branches
      .filter((branch) => branch.odoo_branch_id !== null)
      .map((branch) => {
        const config = getProfitabilityBranchConfig(branch.id);

        return {
          id: branch.id,
          name: branch.name,
          companyId: group.companyId,
          companyName: group.companyName,
          odooCompanyId: Number(branch.odoo_branch_id),
          variableExpenseVendorIds: config.variableExpenseVendorIds,
          overheadAccountIds: config.overheadAccountIds,
        };
      }),
  );
}

export async function getData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.sub;
    const granularity = parseGranularity(req.query.granularity as string | undefined);
    const rangeStartYmd = parseRangeYmd(
      req.query.rangeStartYmd as string | undefined,
      'rangeStartYmd',
    );
    const rangeEndYmd = parseRangeYmd(
      req.query.rangeEndYmd as string | undefined,
      'rangeEndYmd',
    );
    const requestedBranchIds = parseBranchIds(req.query.branchIds);

    if (requestedBranchIds.length === 0) {
      throw new AppError(400, 'branchIds is required');
    }

    const accessibleBranches = await resolveAccessibleProfitabilityBranches(
      userId,
      req.user!.permissions,
    );
    const accessibleById = new Map(accessibleBranches.map((branch) => [branch.id, branch]));
    const selectedBranches = requestedBranchIds.map((branchId) => accessibleById.get(branchId)).filter(
      (branch): branch is ProfitabilityAnalyticsBranchInput => Boolean(branch),
    );

    if (selectedBranches.length !== requestedBranchIds.length) {
      throw new AppError(403, 'One or more selected branches are not accessible');
    }

    const data = await getProfitabilityAnalytics({
      granularity,
      rangeStartYmd,
      rangeEndYmd,
      branches: selectedBranches,
    });

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
}

