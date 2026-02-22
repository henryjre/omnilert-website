import type { NextFunction, Request, Response } from 'express';
import {
  employeeProfilesListQuerySchema,
  type EmployeeProfilesListQueryInput,
} from '@omnilert/shared';
import { AppError } from '../middleware/errorHandler.js';
import * as employeeProfileService from '../services/employeeProfile.service.js';
import { db } from '../config/database.js';

function parseListQuery(raw: unknown): EmployeeProfilesListQueryInput {
  const parsed = employeeProfilesListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(400, 'Invalid employee profile filters');
  }
  return parsed.data;
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
    const excludedEmails = await getSuperAdminEmails();
    const data = await employeeProfileService.listEmployeeProfiles({
      tenantDb: req.tenantDb!,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
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

export async function updateWorkInformation(req: Request, res: Response, next: NextFunction) {
  try {
    const excludedEmails = await getSuperAdminEmails();
    const data = await employeeProfileService.updateEmployeeWorkInformation({
      tenantDb: req.tenantDb!,
      userId: req.params.userId as string,
      departmentId: req.body.departmentId,
      positionTitle: req.body.positionTitle,
      isActive: req.body.isActive,
      dateStarted: req.body.dateStarted,
      excludedEmails,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
