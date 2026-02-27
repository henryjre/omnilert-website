import type { NextFunction, Request, Response } from 'express';
import {
  employeeProfilesListQuerySchema,
  type EmployeeProfilesListQueryInput,
} from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import * as employeeProfileService from '../services/employeeProfile.service.js';
import { db } from '../config/database.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseListQuery(raw: unknown): EmployeeProfilesListQueryInput {
  const parsed = employeeProfilesListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid employee profile filters');
  }
  return parsed.data;
}

function parseRoleIdsCsv(raw: string | undefined): string[] {
  if (!raw) return [];
  const roleIds = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (roleIds.some((value) => !UUID_PATTERN.test(value))) {
    throw new AppError(400, 'Invalid roleIdsCsv');
  }
  return roleIds;
}

async function getSuperAdminEmails(): Promise<string[]> {
  const rows = await db.getMasterDb()('super_admins')
    .select('email');
  return rows
    .map((row: any) => String(row.email ?? '').trim().toLowerCase())
    .filter((email: string) => email.length > 0);
}

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const query = parseListQuery(req.query);
    const roleIds = parseRoleIdsCsv(query.roleIdsCsv);
    const excludedEmails = await getSuperAdminEmails();
    const data = await employeeProfileService.listEmployeeProfiles({
      tenantDb: req.tenantDb!,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      departmentId: query.departmentId,
      roleIds,
      sortBy: query.sortBy,
      sortDirection: query.sortDirection,
      excludedEmails,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function detail(req: Request, res: Response, next: NextFunction) {
  try {
    const excludedEmails = await getSuperAdminEmails();
    const data = await employeeProfileService.getEmployeeProfileDetail(
      req.tenantDb!,
      req.params.userId as string,
      excludedEmails,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function filterOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeProfileService.getEmployeeProfileFilterOptions(req.tenantDb!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function updateWorkInformation(req: Request, res: Response, next: NextFunction) {
  try {
    const excludedEmails = await getSuperAdminEmails();
    const data = await employeeProfileService.updateEmployeeWorkInformation({
      tenantDb: req.tenantDb!,
      userId: req.params.userId as string,
      departmentId: req.body.departmentId,
      positionTitle: req.body.positionTitle,
      employmentStatus: req.body.employmentStatus,
      isActive: req.body.isActive,
      companyAssignments: req.body.companyAssignments,
      residentBranch: req.body.residentBranch,
      dateStarted: req.body.dateStarted,
      excludedEmails,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
