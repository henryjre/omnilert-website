import type { NextFunction, Request, Response } from 'express';
import * as employeeRequirementService from '../services/employeeRequirement.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeRequirementService.listServiceCrewRequirements(req.tenantDb!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getDetail(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeRequirementService.getServiceCrewRequirementDetail(
      req.tenantDb!,
      req.params.userId as string,
    );
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}
