import type { NextFunction, Request, Response } from 'express';
import * as registrationService from '../services/registration.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const requests = await registrationService.listRegistrationRequests();
    res.json({ success: true, data: requests });
  } catch (error) {
    next(error);
  }
}

export async function listAssignmentOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await registrationService.listRegistrationAssignmentOptions();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function approve(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await registrationService.approveRegistrationRequest({
      reviewerCompanyId: req.user!.companyId,
      reviewerId: req.user!.sub,
      requestId: req.params.id as string,
      roleIds: req.body.roleIds,
      companyAssignments: req.body.companyAssignments,
      residentBranch: req.body.residentBranch,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function reject(req: Request, res: Response, next: NextFunction) {
  try {
    await registrationService.rejectRegistrationRequest({
      reviewerId: req.user!.sub,
      requestId: req.params.id as string,
      reason: req.body.reason,
    });
    res.json({ success: true, message: 'Registration request rejected' });
  } catch (error) {
    next(error);
  }
}
