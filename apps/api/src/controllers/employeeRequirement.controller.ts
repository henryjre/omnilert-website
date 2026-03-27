import type { NextFunction, Request, Response } from 'express';
import * as employeeRequirementService from '../services/employeeRequirement.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await employeeRequirementService.listServiceCrewRequirements(
      companyId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    const data = await employeeRequirementService.getServiceCrewRequirementDetail(
      req.params.userId as string,
      companyId,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
