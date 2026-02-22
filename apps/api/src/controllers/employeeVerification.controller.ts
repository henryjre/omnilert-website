import type { NextFunction, Request, Response } from 'express';
import * as registrationService from '../services/registration.service.js';
import * as employeeVerificationService from '../services/employeeVerification.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeVerificationService.listEmployeeVerifications(req.tenantDb!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listRegistrationOnly(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeVerificationService.listRegistrationVerifications(req.tenantDb!);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function approveRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await registrationService.approveRegistrationRequest({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      reviewerId: req.user!.sub,
      requestId: req.params.id as string,
      roleIds: req.body.roleIds,
      branchIds: req.body.branchIds,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function rejectRegistration(req: Request, res: Response, next: NextFunction) {
  try {
    await registrationService.rejectRegistrationRequest({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      reviewerId: req.user!.sub,
      requestId: req.params.id as string,
      reason: req.body.reason,
    });
    res.json({ success: true, message: 'Registration request rejected' });
  } catch (error) {
    next(error);
  }
}

export async function approvePersonalInformation(req: Request, res: Response, next: NextFunction) {
  try {
    await employeeVerificationService.approvePersonalInformationVerification({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      verificationId: req.params.id as string,
      reviewerId: req.user!.sub,
      edits: req.body,
    });
    res.json({ success: true, message: 'Personal information verification approved' });
  } catch (error) {
    next(error);
  }
}

export async function rejectPersonalInformation(req: Request, res: Response, next: NextFunction) {
  try {
    await employeeVerificationService.rejectPersonalInformationVerification({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      verificationId: req.params.id as string,
      reviewerId: req.user!.sub,
      reason: req.body.reason,
    });
    res.json({ success: true, message: 'Personal information verification rejected' });
  } catch (error) {
    next(error);
  }
}

export async function approveEmploymentRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    await employeeVerificationService.approveEmploymentRequirementSubmission({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      submissionId: req.params.id as string,
      reviewerId: req.user!.sub,
    });
    res.json({ success: true, message: 'Employment requirement approved' });
  } catch (error) {
    next(error);
  }
}

export async function rejectEmploymentRequirement(req: Request, res: Response, next: NextFunction) {
  try {
    await employeeVerificationService.rejectEmploymentRequirementSubmission({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      submissionId: req.params.id as string,
      reviewerId: req.user!.sub,
      reason: req.body.reason,
    });
    res.json({ success: true, message: 'Employment requirement rejected' });
  } catch (error) {
    next(error);
  }
}

export async function approveBankInformation(req: Request, res: Response, next: NextFunction) {
  try {
    await employeeVerificationService.approveBankInformationVerification({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      verificationId: req.params.id as string,
      reviewerId: req.user!.sub,
    });
    res.json({ success: true, message: 'Bank information verification approved' });
  } catch (error) {
    next(error);
  }
}

export async function rejectBankInformation(req: Request, res: Response, next: NextFunction) {
  try {
    await employeeVerificationService.rejectBankInformationVerification({
      tenantDb: req.tenantDb!,
      companyId: req.user!.companyId,
      verificationId: req.params.id as string,
      reviewerId: req.user!.sub,
      reason: req.body.reason,
    });
    res.json({ success: true, message: 'Bank information verification rejected' });
  } catch (error) {
    next(error);
  }
}
