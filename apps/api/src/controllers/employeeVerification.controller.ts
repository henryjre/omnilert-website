import type { NextFunction, Request, Response } from 'express';
import * as registrationService from '../services/registration.service.js';
import * as employeeVerificationService from '../services/employeeVerification.service.js';

export async function list(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeVerificationService.listEmployeeVerifications();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listRegistrationOnly(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await employeeVerificationService.listRegistrationVerifications();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function listRegistrationAssignmentOptions(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await registrationService.listRegistrationAssignmentOptions();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function approveRegistration(req: Request, res: Response, next: NextFunction) {
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

export async function rejectRegistration(req: Request, res: Response, next: NextFunction) {
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

export async function approvePersonalInformation(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId } = req.companyContext!;
    await employeeVerificationService.approvePersonalInformationVerification({
      companyId,
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
    const { companyId } = req.companyContext!;
    await employeeVerificationService.rejectPersonalInformationVerification({
      companyId,
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
    const { companyId } = req.companyContext!;
    await employeeVerificationService.approveEmploymentRequirementSubmission({
      companyId,
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
    const { companyId } = req.companyContext!;
    await employeeVerificationService.rejectEmploymentRequirementSubmission({
      companyId,
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
    const { companyId } = req.companyContext!;
    await employeeVerificationService.approveBankInformationVerification({
      companyId,
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
    const { companyId } = req.companyContext!;
    await employeeVerificationService.rejectBankInformationVerification({
      companyId,
      verificationId: req.params.id as string,
      reviewerId: req.user!.sub,
      reason: req.body.reason,
    });
    res.json({ success: true, message: 'Bank information verification rejected' });
  } catch (error) {
    next(error);
  }
}
