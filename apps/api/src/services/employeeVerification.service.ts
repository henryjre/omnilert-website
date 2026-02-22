import type { Knex } from 'knex';
import { AppError } from '../middleware/errorHandler.js';
import { createPartnerBankAndAssignEmployees, syncUserProfileToOdoo } from './odoo.service.js';
import { getIO } from '../config/socket.js';

type NotificationType = 'info' | 'success' | 'danger' | 'warning';

function parseJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function emitEmployeeVerificationUpdated(payload: {
  companyId: string;
  verificationId: string;
  verificationType: 'personal_information' | 'employment_requirement' | 'bank_information';
  action: 'submitted' | 'approved' | 'rejected';
  userId?: string;
}) {
  try {
    getIO().of('/employee-verifications')
      .to(`company:${payload.companyId}`)
      .emit('employee-verification:updated', payload);
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

function emitEmployeeRequirementUpdated(payload: {
  companyId: string;
  action: 'submitted' | 'approved' | 'rejected';
  submissionId?: string;
  userId?: string;
  requirementCode?: string;
}) {
  try {
    getIO().of('/employee-requirements')
      .to(`company:${payload.companyId}`)
      .emit('employee-requirement:updated', payload);
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

async function notifyUser(
  tenantDb: Knex,
  userId: string,
  title: string,
  message: string,
  type: NotificationType,
  linkUrl: string,
): Promise<void> {
  const [notif] = await tenantDb('employee_notifications')
    .insert({
      user_id: userId,
      title,
      message,
      type,
      link_url: linkUrl,
    })
    .returning('*');

  try {
    getIO().of('/notifications').to(`user:${userId}`).emit('notification:new', notif);
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

export async function listEmployeeVerifications(tenantDb: Knex) {
  const [registration, personalInformation, employmentRequirements, bankInformation] = await Promise.all([
    tenantDb('registration_requests')
      .leftJoin('users as reviewers', 'registration_requests.reviewed_by', 'reviewers.id')
      .select(
        'registration_requests.*',
        tenantDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
      )
      .orderBy('registration_requests.requested_at', 'desc'),
    tenantDb('personal_information_verifications')
      .join('users', 'personal_information_verifications.user_id', 'users.id')
      .leftJoin('users as reviewers', 'personal_information_verifications.reviewed_by', 'reviewers.id')
      .select(
        'personal_information_verifications.*',
        'users.first_name',
        'users.last_name',
        'users.email',
        'users.mobile_number',
        'users.legal_name',
        'users.birthday',
        'users.gender',
        'users.address',
        'users.sss_number',
        'users.tin_number',
        'users.pagibig_number',
        'users.philhealth_number',
        'users.marital_status',
        'users.emergency_contact',
        'users.emergency_phone',
        'users.emergency_relationship',
        tenantDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
      )
      .orderBy('personal_information_verifications.created_at', 'desc'),
    tenantDb('employment_requirement_submissions')
      .join('users', 'employment_requirement_submissions.user_id', 'users.id')
      .join(
        'employment_requirement_types',
        'employment_requirement_submissions.requirement_code',
        'employment_requirement_types.code',
      )
      .leftJoin('users as reviewers', 'employment_requirement_submissions.reviewed_by', 'reviewers.id')
      .select(
        'employment_requirement_submissions.*',
        'employment_requirement_types.label as requirement_label',
        'users.first_name',
        'users.last_name',
        'users.email',
        tenantDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
      )
      .orderBy('employment_requirement_submissions.created_at', 'desc'),
    tenantDb('bank_information_verifications')
      .join('users', 'bank_information_verifications.user_id', 'users.id')
      .leftJoin('users as reviewers', 'bank_information_verifications.reviewed_by', 'reviewers.id')
      .select(
        'bank_information_verifications.*',
        'users.first_name',
        'users.last_name',
        'users.email',
        tenantDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
      )
      .orderBy('bank_information_verifications.created_at', 'desc'),
  ]);

  return {
    registration,
    personalInformation: personalInformation.map((row: any) => ({
      ...row,
      requested_changes: parseJsonField<Record<string, unknown>>(row.requested_changes, {}),
      approved_changes: parseJsonField<Record<string, unknown> | null>(row.approved_changes, null),
    })),
    employmentRequirements: employmentRequirements,
    bankInformation,
  };
}

export async function listRegistrationVerifications(tenantDb: Knex) {
  return tenantDb('registration_requests')
    .leftJoin('users as reviewers', 'registration_requests.reviewed_by', 'reviewers.id')
    .select(
      'registration_requests.*',
      tenantDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
    )
    .orderBy('registration_requests.requested_at', 'desc');
}

export async function approvePersonalInformationVerification(input: {
  tenantDb: Knex;
  companyId: string;
  verificationId: string;
  reviewerId: string;
  edits: {
    firstName?: string;
    lastName?: string;
    email?: string;
    mobileNumber?: string;
    legalName?: string;
    birthday?: string | null;
    gender?: string | null;
    address?: string;
    sssNumber?: string;
    tinNumber?: string;
    pagibigNumber?: string;
    philhealthNumber?: string;
    maritalStatus?: string;
    emergencyContact?: string;
    emergencyPhone?: string;
    emergencyRelationship?: string;
  };
}) {
  const verification = await input.tenantDb('personal_information_verifications')
    .where({ id: input.verificationId })
    .first();
  if (!verification) {
    throw new AppError(404, 'Personal information verification not found');
  }
  if (verification.status !== 'pending') {
    throw new AppError(400, 'Verification is already resolved');
  }

  const requested = parseJsonField<Record<string, unknown>>(verification.requested_changes, {});
  const approved = {
    firstName: input.edits.firstName ?? requested.firstName,
    lastName: input.edits.lastName ?? requested.lastName,
    email: input.edits.email ?? requested.email,
    mobileNumber: input.edits.mobileNumber ?? requested.mobileNumber,
    legalName: input.edits.legalName ?? requested.legalName,
    birthday: input.edits.birthday ?? requested.birthday ?? null,
    gender: input.edits.gender ?? requested.gender ?? null,
    address: input.edits.address ?? requested.address,
    sssNumber: input.edits.sssNumber ?? requested.sssNumber,
    tinNumber: input.edits.tinNumber ?? requested.tinNumber,
    pagibigNumber: input.edits.pagibigNumber ?? requested.pagibigNumber,
    philhealthNumber: input.edits.philhealthNumber ?? requested.philhealthNumber,
    maritalStatus: input.edits.maritalStatus ?? requested.maritalStatus,
    emergencyContact: input.edits.emergencyContact ?? requested.emergencyContact,
    emergencyPhone: input.edits.emergencyPhone ?? requested.emergencyPhone,
    emergencyRelationship: input.edits.emergencyRelationship ?? requested.emergencyRelationship,
  } as const;

  const user = await input.tenantDb('users')
    .where({ id: verification.user_id })
    .select(
      'id',
      'user_key',
      'employee_number',
      'email',
      'first_name',
      'last_name',
      'mobile_number',
      'legal_name',
      'birthday',
      'gender',
      'address',
      'sss_number',
      'tin_number',
      'pagibig_number',
      'philhealth_number',
      'marital_status',
      'emergency_contact',
      'emergency_phone',
      'emergency_relationship',
    )
    .first();
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const updates: Record<string, unknown> = { updated_at: new Date(), updated: true };
  if (approved.firstName !== undefined) updates.first_name = approved.firstName;
  if (approved.lastName !== undefined) updates.last_name = approved.lastName;
  if (approved.email !== undefined) updates.email = approved.email;
  if (approved.mobileNumber !== undefined) updates.mobile_number = approved.mobileNumber;
  if (approved.legalName !== undefined) updates.legal_name = approved.legalName;
  if (approved.birthday !== undefined) updates.birthday = approved.birthday;
  if (approved.gender !== undefined) updates.gender = approved.gender;
  if (approved.address !== undefined) updates.address = approved.address;
  if (approved.sssNumber !== undefined) updates.sss_number = approved.sssNumber;
  if (approved.tinNumber !== undefined) updates.tin_number = approved.tinNumber;
  if (approved.pagibigNumber !== undefined) updates.pagibig_number = approved.pagibigNumber;
  if (approved.philhealthNumber !== undefined) updates.philhealth_number = approved.philhealthNumber;
  if (approved.maritalStatus !== undefined) updates.marital_status = approved.maritalStatus;
  if (approved.emergencyContact !== undefined) updates.emergency_contact = approved.emergencyContact;
  if (approved.emergencyPhone !== undefined) updates.emergency_phone = approved.emergencyPhone;
  if (approved.emergencyRelationship !== undefined) {
    updates.emergency_relationship = approved.emergencyRelationship;
  }

  await input.tenantDb.transaction(async (trx) => {
    await trx('users').where({ id: user.id }).update(updates);
    await trx('personal_information_verifications')
      .where({ id: input.verificationId })
      .update({
        status: 'approved',
        approved_changes: JSON.stringify(approved),
        reviewed_by: input.reviewerId,
        reviewed_at: new Date(),
        updated_at: new Date(),
      });
  });

  const activeBranches = await input.tenantDb('branches')
    .where({ is_active: true })
    .select('is_main_branch', 'odoo_branch_id');
  const branchesWithCompanyId = activeBranches
    .filter((branch: any) => branch.odoo_branch_id && !Number.isNaN(Number(branch.odoo_branch_id)));
  const mainBranch = branchesWithCompanyId.find((branch: any) => branch.is_main_branch)
    ?? branchesWithCompanyId[0]
    ?? null;

  const hasNameChange = approved.firstName !== undefined || approved.lastName !== undefined;

  await syncUserProfileToOdoo(user.user_key ?? null, {
    email: (approved.email as string) || user.email,
    mobileNumber: (approved.mobileNumber as string) || user.mobile_number || '',
    legalName: (approved.legalName as string) || user.legal_name || '',
    birthday: (approved.birthday as string | null) ?? user.birthday,
    gender: (approved.gender as string | null) ?? user.gender,
    address: approved.address !== undefined
      ? String(approved.address ?? '')
      : undefined,
    emergencyContact: (approved.emergencyContact as string) || user.emergency_contact || '',
    emergencyPhone: (approved.emergencyPhone as string) || user.emergency_phone || '',
    firstName: hasNameChange ? ((approved.firstName as string) || user.first_name) : undefined,
    lastName: hasNameChange ? ((approved.lastName as string) || user.last_name) : undefined,
    employeeNumber: (user.employee_number as number | null) ?? null,
    mainCompanyId: mainBranch ? Number(mainBranch.odoo_branch_id) : null,
  });

  await notifyUser(
    input.tenantDb,
    user.id,
    'Personal Information Verified',
    'Your personal information verification request has been approved.',
    'success',
    '/account/profile',
  );

  emitEmployeeVerificationUpdated({
    companyId: input.companyId,
    verificationId: input.verificationId,
    verificationType: 'personal_information',
    action: 'approved',
    userId: user.id as string,
  });
}

export async function rejectPersonalInformationVerification(input: {
  tenantDb: Knex;
  companyId: string;
  verificationId: string;
  reviewerId: string;
  reason: string;
}) {
  const verification = await input.tenantDb('personal_information_verifications')
    .where({ id: input.verificationId })
    .first();
  if (!verification) {
    throw new AppError(404, 'Personal information verification not found');
  }
  if (verification.status !== 'pending') {
    throw new AppError(400, 'Verification is already resolved');
  }

  await input.tenantDb('personal_information_verifications')
    .where({ id: input.verificationId })
    .update({
      status: 'rejected',
      rejection_reason: input.reason.trim(),
      reviewed_by: input.reviewerId,
      reviewed_at: new Date(),
      updated_at: new Date(),
    });

  await notifyUser(
    input.tenantDb,
    verification.user_id as string,
    'Personal Information Rejected',
    `Your personal information verification was rejected: ${input.reason.trim()}`,
    'danger',
    '/account/profile',
  );

  emitEmployeeVerificationUpdated({
    companyId: input.companyId,
    verificationId: input.verificationId,
    verificationType: 'personal_information',
    action: 'rejected',
    userId: verification.user_id as string,
  });
}

export async function approveEmploymentRequirementSubmission(input: {
  tenantDb: Knex;
  companyId: string;
  submissionId: string;
  reviewerId: string;
}) {
  const submission = await input.tenantDb('employment_requirement_submissions')
    .where({ id: input.submissionId })
    .first();
  if (!submission) throw new AppError(404, 'Employment requirement submission not found');
  if (submission.status !== 'pending') throw new AppError(400, 'Submission is already resolved');

  await input.tenantDb.transaction(async (trx) => {
    await trx('employment_requirement_submissions')
      .where({ id: input.submissionId })
      .update({
        status: 'approved',
        reviewed_by: input.reviewerId,
        reviewed_at: new Date(),
        updated_at: new Date(),
      });

    // Shared canonical valid ID sync from requirement submission.
    if (submission.requirement_code === 'government_issued_id') {
      await trx('users')
        .where({ id: submission.user_id })
        .update({
          valid_id_url: submission.document_url,
          valid_id_updated_at: new Date(),
          updated_at: new Date(),
        });
    }
  });

  await notifyUser(
    input.tenantDb,
    submission.user_id as string,
    'Employment Requirement Approved',
    'Your employment requirement submission has been approved.',
    'success',
    '/account/profile',
  );

  emitEmployeeVerificationUpdated({
    companyId: input.companyId,
    verificationId: input.submissionId,
    verificationType: 'employment_requirement',
    action: 'approved',
    userId: submission.user_id as string,
  });
  emitEmployeeRequirementUpdated({
    companyId: input.companyId,
    action: 'approved',
    submissionId: input.submissionId,
    userId: submission.user_id as string,
    requirementCode: submission.requirement_code as string,
  });
}

export async function rejectEmploymentRequirementSubmission(input: {
  tenantDb: Knex;
  companyId: string;
  submissionId: string;
  reviewerId: string;
  reason: string;
}) {
  const submission = await input.tenantDb('employment_requirement_submissions')
    .where({ id: input.submissionId })
    .first();
  if (!submission) throw new AppError(404, 'Employment requirement submission not found');
  if (submission.status !== 'pending') throw new AppError(400, 'Submission is already resolved');

  await input.tenantDb('employment_requirement_submissions')
    .where({ id: input.submissionId })
    .update({
      status: 'rejected',
      reviewed_by: input.reviewerId,
      reviewed_at: new Date(),
      rejection_reason: input.reason.trim(),
      updated_at: new Date(),
    });

  await notifyUser(
    input.tenantDb,
    submission.user_id as string,
    'Employment Requirement Rejected',
    `Your employment requirement submission was rejected: ${input.reason.trim()}`,
    'danger',
    '/account/profile',
  );

  emitEmployeeVerificationUpdated({
    companyId: input.companyId,
    verificationId: input.submissionId,
    verificationType: 'employment_requirement',
    action: 'rejected',
    userId: submission.user_id as string,
  });
  emitEmployeeRequirementUpdated({
    companyId: input.companyId,
    action: 'rejected',
    submissionId: input.submissionId,
    userId: submission.user_id as string,
    requirementCode: submission.requirement_code as string,
  });
}

export async function approveBankInformationVerification(input: {
  tenantDb: Knex;
  companyId: string;
  verificationId: string;
  reviewerId: string;
}) {
  const verification = await input.tenantDb('bank_information_verifications')
    .where({ id: input.verificationId })
    .first();
  if (!verification) {
    throw new AppError(404, 'Bank information verification not found');
  }
  if (verification.status !== 'pending') {
    throw new AppError(400, 'Verification is already resolved');
  }

  const user = await input.tenantDb('users')
    .where({ id: verification.user_id })
    .select('id', 'user_key', 'email')
    .first();
  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const { partnerBankId } = await createPartnerBankAndAssignEmployees({
    websiteUserKey: user.user_key ?? null,
    email: user.email ?? null,
    bankId: Number(verification.bank_id),
    accountNumber: String(verification.account_number),
  });

  await input.tenantDb.transaction(async (trx) => {
    await trx('users')
      .where({ id: user.id })
      .update({
        bank_id: Number(verification.bank_id),
        bank_account_number: String(verification.account_number),
        updated_at: new Date(),
      });

    await trx('bank_information_verifications')
      .where({ id: input.verificationId })
      .update({
        status: 'approved',
        reviewed_by: input.reviewerId,
        reviewed_at: new Date(),
        odoo_partner_bank_id: partnerBankId,
        updated_at: new Date(),
      });
  });

  await notifyUser(
    input.tenantDb,
    user.id as string,
    'Bank Information Approved',
    'Your bank information verification has been approved.',
    'success',
    '/account/profile',
  );

  emitEmployeeVerificationUpdated({
    companyId: input.companyId,
    verificationId: input.verificationId,
    verificationType: 'bank_information',
    action: 'approved',
    userId: user.id as string,
  });
}

export async function rejectBankInformationVerification(input: {
  tenantDb: Knex;
  companyId: string;
  verificationId: string;
  reviewerId: string;
  reason: string;
}) {
  const verification = await input.tenantDb('bank_information_verifications')
    .where({ id: input.verificationId })
    .first();
  if (!verification) {
    throw new AppError(404, 'Bank information verification not found');
  }
  if (verification.status !== 'pending') {
    throw new AppError(400, 'Verification is already resolved');
  }

  await input.tenantDb('bank_information_verifications')
    .where({ id: input.verificationId })
    .update({
      status: 'rejected',
      rejection_reason: input.reason.trim(),
      reviewed_by: input.reviewerId,
      reviewed_at: new Date(),
      updated_at: new Date(),
    });

  await notifyUser(
    input.tenantDb,
    verification.user_id as string,
    'Bank Information Rejected',
    `Your bank information verification was rejected: ${input.reason.trim()}`,
    'danger',
    '/account/profile',
  );

  emitEmployeeVerificationUpdated({
    companyId: input.companyId,
    verificationId: input.verificationId,
    verificationType: 'bank_information',
    action: 'rejected',
    userId: verification.user_id as string,
  });
}
