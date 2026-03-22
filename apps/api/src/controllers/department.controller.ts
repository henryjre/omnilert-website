import type { NextFunction, Request, Response } from 'express';
import * as departmentService from '../services/department.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await departmentService.listDepartments(companyId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listMemberOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await departmentService.listDepartmentMemberOptions(req.user!.companyId);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await departmentService.createDepartment({
      companyId,
      name: req.body.name,
      headUserId: req.body.headUserId ?? null,
      memberUserIds: req.body.memberUserIds ?? [],
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function update(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await departmentService.updateDepartment({
      companyId,
      departmentId: req.params.id as string,
      name: req.body.name,
      headUserId: req.body.headUserId ?? null,
      memberUserIds: req.body.memberUserIds ?? [],
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
