import type { NextFunction, Request, Response } from 'express';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import * as registrationService from '../services/registration.service.js';
import * as employeeVerificationService from '../services/employeeVerification.service.js';
import { buildTenantStoragePrefix, deleteFolder, uploadFile } from '../services/storage.service.js';

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
      employeeNumber: req.body.employeeNumber,
      userKey: req.body.userKey,
      avatarUrl: req.body.avatarUrl,
      avatarStorageRoot: req.companyContext?.companyStorageRoot ?? null,
    });
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

export async function uploadRegistrationAvatar(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      throw new AppError(400, 'No image uploaded');
    }

    const requestId = String(req.params.id ?? '').trim();
    const request = await db.getDb()('registration_requests')
      .where({ id: requestId })
      .first('id', 'status');
    if (!request) {
      throw new AppError(404, 'Registration request not found');
    }
    if (request.status !== 'pending') {
      throw new AppError(400, 'Registration request is already resolved');
    }

    const folderPath = buildTenantStoragePrefix(
      req.companyContext?.companyStorageRoot ?? '',
      'Employee Verifications',
      'Registration',
      requestId,
      'Profile Picture',
    );
    await deleteFolder(folderPath);

    const avatarUrl = await uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      folderPath,
    );
    if (!avatarUrl) {
      throw new AppError(500, 'Failed to upload profile picture');
    }

    res.json({ success: true, data: { avatar_url: avatarUrl } });
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
