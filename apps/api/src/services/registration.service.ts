import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { decryptText, encryptText } from '../utils/secureText.js';
import { hashPassword } from '../utils/password.js';
import {
  callOdooKw,
  createOrUpdateEmployeeForRegistration,
  formatBranchEmployeeCode,
  formatEmployeeDisplayName,
  unifyPartnerContactsByEmail,
} from './odoo.service.js';
import { sendRegistrationApprovedEmail } from './mail.service.js';
import { getIO } from '../config/socket.js';

const REGISTRATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function emitRegistrationVerificationUpdate(payload: {
  companyId: string;
  verificationId: string;
  action: 'created' | 'approved' | 'rejected';
  userId?: string;
}): void {
  try {
    getIO().of('/employee-verifications')
      .to(`company:${payload.companyId}`)
      .emit('employee-verification:updated', {
        companyId: payload.companyId,
        verificationId: payload.verificationId,
        verificationType: 'registration',
        action: payload.action,
        userId: payload.userId,
      });
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

function emitRegistrationApprovalProgress(payload: {
  companyId: string;
  verificationId: string;
  reviewerId: string;
  step:
    | 'start'
    | 'validate'
    | 'identity'
    | 'pin'
    | 'employees'
    | 'merge'
    | 'user'
    | 'email'
    | 'done';
  message: string;
}): void {
  try {
    getIO().of('/employee-verifications')
      .to(`company:${payload.companyId}`)
      .emit('employee-verification:approval-progress', {
        companyId: payload.companyId,
        verificationId: payload.verificationId,
        verificationType: 'registration',
        reviewerId: payload.reviewerId,
        step: payload.step,
        message: payload.message,
        createdAt: new Date().toISOString(),
      });
  } catch {
    // socket can be unavailable during tests/bootstrapping
  }
}

async function getMaxEmployeeNumberFromOdoo(
  companyCode: string,
  odooBranchIds: number[],
): Promise<number> {
  const employees = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['barcode', '=ilike', `${companyCode}%`]],
      fields: ['barcode'],
      limit: 10000,
    },
  )) as Array<{ barcode?: string | null }>;

  let maxEmployeeNumber = 0;
  for (const row of employees) {
    const barcode = (row.barcode ?? '').trim().toUpperCase();
    if (!barcode.startsWith(companyCode)) continue;

    const numericPart = barcode.slice(companyCode.length);
    if (!/^\d+$/.test(numericPart)) continue;

    for (const branchId of odooBranchIds) {
      const prefix = String(branchId - 1);
      if (!numericPart.startsWith(prefix)) continue;
      const employeePart = numericPart.slice(prefix.length);
      if (!employeePart || !/^\d+$/.test(employeePart)) continue;
      maxEmployeeNumber = Math.max(maxEmployeeNumber, Number(employeePart));
    }
  }

  return maxEmployeeNumber;
}

async function resolveOrCreateEmployeeIdentity(
  masterDb: Knex,
  email: string,
): Promise<{ employeeNumber: number; websiteKey: string; identityId: string; wasExisting: boolean }> {
  return masterDb.transaction(async (trx) => {
    const existingIdentity = await trx('employee_identities')
      .where({ email })
      .forUpdate()
      .first();
    if (existingIdentity) {
      return {
        employeeNumber: existingIdentity.employee_number as number,
        websiteKey: existingIdentity.website_key as string,
        identityId: existingIdentity.id as string,
        wasExisting: true,
      };
    }

    const companies = await trx('companies').where({ is_active: true }).select('db_name');
    for (const company of companies) {
      const tenantDb = await db.getTenantDb(company.db_name);
      const existingUser = await tenantDb('users')
        .whereRaw('LOWER(email) = ?', [email])
        .whereNotNull('employee_number')
        .whereNotNull('user_key')
        .select('employee_number', 'user_key')
        .first();
      if (existingUser) {
        const [createdIdentity] = await trx('employee_identities').insert({
          email,
          employee_number: existingUser.employee_number,
          website_key: existingUser.user_key,
          updated_at: new Date(),
        }).returning('*');
        return {
          employeeNumber: existingUser.employee_number as number,
          websiteKey: existingUser.user_key as string,
          identityId: createdIdentity.id as string,
          wasExisting: true,
        };
      }
    }

    const identityMax = await trx('employee_identities')
      .max<{ max: string | number | null }>('employee_number as max')
      .first();
    let tenantUserMax = 0;
    for (const company of companies) {
      const tenantDb = await db.getTenantDb(company.db_name);
      const tenantMax = await tenantDb('users')
        .max<{ max: string | number | null }>('employee_number as max')
        .first();
      tenantUserMax = Math.max(tenantUserMax, Number(tenantMax?.max ?? 0));
    }

    const nextEmployeeNumber = Math.max(Number(identityMax?.max ?? 0), tenantUserMax) + 1;
    const websiteKey = randomUUID();

    const [createdIdentity] = await trx('employee_identities').insert({
      email,
      employee_number: nextEmployeeNumber,
      website_key: websiteKey,
      updated_at: new Date(),
    }).returning('*');

    return {
      employeeNumber: nextEmployeeNumber,
      websiteKey,
      identityId: createdIdentity.id as string,
      wasExisting: false,
    };
  });
}

async function upsertTenantUser(input: {
  tenantDb: Knex;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  employeeNumber: number;
  websiteKey: string;
  roleIds: string[];
  branchIds: string[];
}): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);

  let user = await input.tenantDb('users')
    .whereRaw('LOWER(email) = ?', [input.email])
    .first();

  if (user) {
    const [updated] = await input.tenantDb('users')
      .where({ id: user.id })
      .update({
        first_name: input.firstName,
        last_name: input.lastName,
        email: input.email,
        password_hash: passwordHash,
        employee_number: input.employeeNumber,
        user_key: input.websiteKey,
        is_active: true,
        employment_status: 'active',
        updated_at: new Date(),
      })
      .returning('id');
    user = updated;
  } else {
    const [created] = await input.tenantDb('users')
      .insert({
        email: input.email,
        password_hash: passwordHash,
        first_name: input.firstName,
        last_name: input.lastName,
        employee_number: input.employeeNumber,
        user_key: input.websiteKey,
        is_active: true,
        employment_status: 'active',
      })
      .returning('id');
    user = created;
  }

  await input.tenantDb('user_roles').where({ user_id: user.id }).delete();
  await input.tenantDb('user_branches').where({ user_id: user.id }).delete();

  const roleRows = input.roleIds.map((roleId) => ({
    user_id: user.id,
    role_id: roleId,
    assigned_by: null,
  }));
  if (roleRows.length > 0) {
    await input.tenantDb('user_roles').insert(roleRows);
  }

  const branchRows = input.branchIds.map((branchId, index) => ({
    user_id: user.id,
    branch_id: branchId,
    is_primary: index === 0,
  }));
  if (branchRows.length > 0) {
    await input.tenantDb('user_branches').insert(branchRows);
  }

  return { id: user.id };
}

export async function createRegistrationRequest(input: {
  companySlug: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<void> {
  const masterDb = db.getMasterDb();
  const email = normalizeEmail(input.email);
  const company = await masterDb('companies')
    .where({ slug: input.companySlug, is_active: true })
    .first();
  if (!company) {
    throw new AppError(404, 'Company not found');
  }

  const tenantDb = await db.getTenantDb(company.db_name);
  const existingUser = await tenantDb('users')
    .whereRaw('LOWER(email) = ?', [email])
    .where({ is_active: true })
    .first();
  if (existingUser) {
    throw new AppError(409, 'An active user with this email already exists');
  }

  const pending = await tenantDb('registration_requests')
    .whereRaw('LOWER(email) = ?', [email])
    .where({ status: REGISTRATION_STATUSES.PENDING })
    .first();
  if (pending) {
    throw new AppError(409, 'A pending registration request already exists for this email');
  }

  const [created] = await tenantDb('registration_requests').insert({
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email,
    encrypted_password: encryptText(input.password),
    status: REGISTRATION_STATUSES.PENDING,
    requested_at: new Date(),
    updated_at: new Date(),
  }).returning('id');

  emitRegistrationVerificationUpdate({
    companyId: company.id as string,
    verificationId: created.id as string,
    action: 'created',
  });
}

export async function listRegistrationRequests(tenantDb: Knex): Promise<any[]> {
  return tenantDb('registration_requests')
    .leftJoin('users as reviewers', 'registration_requests.reviewed_by', 'reviewers.id')
    .select(
      'registration_requests.*',
      tenantDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
    )
    .orderBy('registration_requests.requested_at', 'desc');
}

export async function approveRegistrationRequest(input: {
  tenantDb: Knex;
  companyId: string;
  reviewerId: string;
  requestId: string;
  roleIds: string[];
  branchIds?: string[];
}): Promise<{ requestId: string; userId: string }> {
  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'start',
    message: 'Starting approval process...',
  });

  const request = await input.tenantDb('registration_requests')
    .where({ id: input.requestId })
    .first();
  if (!request) {
    throw new AppError(404, 'Registration request not found');
  }
  if (request.status !== REGISTRATION_STATUSES.PENDING) {
    throw new AppError(400, 'Registration request is already resolved');
  }

  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'validate',
    message: 'Validating roles, branches, and company setup...',
  });

  const existingRoles = await input.tenantDb('roles').whereIn('id', input.roleIds).select('id');
  if (existingRoles.length !== input.roleIds.length) {
    throw new AppError(400, 'One or more selected roles are invalid');
  }

  const companyBranches = await input.tenantDb('branches')
    .where({ is_active: true })
    .select('id', 'odoo_branch_id', 'is_main_branch');
  if (companyBranches.length === 0) {
    throw new AppError(400, 'No active branches found');
  }

  const resolvedBranchIds = input.branchIds && input.branchIds.length > 0
    ? input.branchIds
    : [];

  if (resolvedBranchIds.length > 0) {
    const selectedBranches = companyBranches.filter((branch) => resolvedBranchIds.includes(branch.id));
    if (selectedBranches.length !== resolvedBranchIds.length) {
      throw new AppError(400, 'One or more selected branches are invalid or inactive');
    }
  }

  const invalidOdooBranch = companyBranches.find((branch) => !branch.odoo_branch_id || Number.isNaN(Number(branch.odoo_branch_id)));
  if (invalidOdooBranch) {
    throw new AppError(400, `Branch "${invalidOdooBranch.id}" is missing a valid Odoo branch ID`);
  }

  const masterDb = db.getMasterDb();
  const company = await masterDb('companies').where({ id: input.companyId }).first();
  if (!company) {
    throw new AppError(404, 'Company not found');
  }
  if (!company.company_code) {
    throw new AppError(400, 'Company code is required before approving registration');
  }
  const companyCode = String(company.company_code).trim().toUpperCase();
  const normalizedEmail = normalizeEmail(request.email as string);
  const odooBranchIds = companyBranches.map((branch) => Number(branch.odoo_branch_id));

  const identity = await resolveOrCreateEmployeeIdentity(masterDb, normalizedEmail);
  let employeeNumber = identity.employeeNumber;
  const websiteKey = identity.websiteKey;
  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'identity',
    message: `Resolved employee identity (#${employeeNumber}).`,
  });

  const decryptedPassword = decryptText(request.encrypted_password as string);
  const maxOdooEmployeeNumber = await getMaxEmployeeNumberFromOdoo(companyCode, odooBranchIds);
  logger.info(
    {
      phase: 'registration-approve',
      companyCode,
      maxOdooEmployeeNumber,
      identityEmployeeNumber: identity.employeeNumber,
    },
    'Resolved current max employee number from Odoo and identity store',
  );

  const isEmployeeNumberAvailable = async (candidate: number): Promise<boolean> => {
    for (const branch of companyBranches) {
      const branchCode = formatBranchEmployeeCode(Number(branch.odoo_branch_id), candidate);
      const barcode = `${companyCode}${branchCode}`;
      logger.info(
        {
          phase: 'registration-approve',
          candidateEmployeeNumber: candidate,
          branchId: branch.id,
          odooBranchId: Number(branch.odoo_branch_id),
          barcode,
        },
        'Checking barcode availability in Odoo',
      );
      const matches = (await callOdooKw(
        'hr.employee',
        'search_read',
        [],
        {
          domain: [['barcode', '=', barcode]],
          fields: ['id', 'x_website_key'],
          limit: 10,
        },
      )) as Array<{ id: number; x_website_key?: string | null }>;

      const takenByOtherIdentity = matches.some((employee) => employee.x_website_key !== websiteKey);
      if (takenByOtherIdentity) {
        logger.warn(
          {
            phase: 'registration-approve',
            candidateEmployeeNumber: candidate,
            branchId: branch.id,
            barcode,
            websiteKey,
            matchedEmployees: matches,
          },
          'Barcode already used by another identity in Odoo',
        );
        return false;
      }
    }
    return true;
  };

  const existingEmployeesForWebsiteKey = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['x_website_key', '=', websiteKey]],
      fields: ['id', 'pin'],
      limit: 1000,
    },
  )) as Array<{ id: number; pin?: string | null }>;

  // If this identity has no Odoo employee yet and its number is behind Odoo max, bump forward.
  if (existingEmployeesForWebsiteKey.length === 0 && employeeNumber <= maxOdooEmployeeNumber) {
    employeeNumber = maxOdooEmployeeNumber + 1;
  }

  const existingPin = existingEmployeesForWebsiteKey
    .map((employee) => String(employee.pin ?? '').trim())
    .find((pin) => /^\d{4}$/.test(pin));
  const sharedPin = existingPin || randomPin();
  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'pin',
    message: existingPin
      ? 'Reused existing employee PIN for all branches.'
      : 'Generated a new PIN and will apply it to all branches.',
  });

  let guard = 0;
  while (!(await isEmployeeNumberAvailable(employeeNumber))) {
    guard += 1;
    if (guard > 5000) {
      throw new AppError(500, 'Unable to allocate a unique employee number');
    }
    employeeNumber += 1;
  }

  if (employeeNumber !== identity.employeeNumber) {
    await masterDb('employee_identities')
      .where({ id: identity.identityId })
      .update({ employee_number: employeeNumber, updated_at: new Date() });
  }

  const fullName = `${request.first_name} ${request.last_name}`.trim();
  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'employees',
    message: `Creating/updating employees in ${companyBranches.length} active branch(es)...`,
  });

  let processedBranches = 0;
  for (const branch of companyBranches) {
    const odooBranchId = Number(branch.odoo_branch_id);
    const branchCode = formatBranchEmployeeCode(odooBranchId, employeeNumber);
    const barcode = `${companyCode}${branchCode}`;
    logger.info(
      {
        phase: 'registration-approve',
        requestId: input.requestId,
        email: normalizedEmail,
        employeeNumber,
        branchId: branch.id,
        odooBranchId,
        branchCode,
        pin: sharedPin,
        barcode,
        websiteKey,
      },
      'Creating/updating Odoo employee for registration',
    );
    await createOrUpdateEmployeeForRegistration({
      companyId: odooBranchId,
      name: formatEmployeeDisplayName(
        odooBranchId,
        employeeNumber,
        String(request.first_name ?? ''),
        String(request.last_name ?? ''),
      ),
      workEmail: normalizedEmail,
      pin: sharedPin,
      barcode,
      websiteKey,
    });
    processedBranches += 1;
    emitRegistrationApprovalProgress({
      companyId: input.companyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'employees',
      message: `Processed branch ${processedBranches}/${companyBranches.length} (Odoo #${odooBranchId}).`,
    });
  }

  const mainBranch = companyBranches.find((branch) => branch.is_main_branch) ?? companyBranches[0];
  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'merge',
    message: 'Merging partner contacts and applying global contact settings...',
  });
  await unifyPartnerContactsByEmail({
    email: normalizedEmail,
    mainCompanyId: Number(mainBranch.odoo_branch_id),
    websiteKey,
    employeeNumber,
    firstName: String(request.first_name ?? ''),
    lastName: String(request.last_name ?? ''),
  });

  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'user',
    message: 'Creating/updating website user, roles, and branch assignments...',
  });
  const result = await input.tenantDb.transaction(async (trx) => {
    const [updatedRequest] = await trx('registration_requests')
      .where({ id: input.requestId, status: REGISTRATION_STATUSES.PENDING })
      .update({
        status: REGISTRATION_STATUSES.APPROVED,
        reviewed_by: input.reviewerId,
        reviewed_at: new Date(),
        approved_role_ids: JSON.stringify(input.roleIds),
        approved_branch_ids: JSON.stringify(resolvedBranchIds),
        updated_at: new Date(),
      })
      .returning('*');
    if (!updatedRequest) {
      throw new AppError(409, 'Registration request was already updated by another process');
    }

    const tenantUser = await upsertTenantUser({
      tenantDb: trx,
      firstName: request.first_name as string,
      lastName: request.last_name as string,
      email: normalizedEmail,
      password: decryptedPassword,
      employeeNumber,
      websiteKey,
      roleIds: input.roleIds,
      branchIds: resolvedBranchIds,
    });

    return {
      requestId: updatedRequest.id as string,
      userId: tenantUser.id,
    };
  });

  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'email',
    message: 'Sending registration approved email...',
  });
  await sendRegistrationApprovedEmail({
    to: normalizedEmail,
    fullName,
    email: normalizedEmail,
    password: decryptedPassword,
    companySlug: String(company.slug ?? ''),
  });

  emitRegistrationApprovalProgress({
    companyId: input.companyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'done',
    message: 'Approval completed successfully.',
  });

  emitRegistrationVerificationUpdate({
    companyId: input.companyId,
    verificationId: result.requestId,
    action: 'approved',
    userId: result.userId,
  });

  return result;
}

export async function rejectRegistrationRequest(input: {
  tenantDb: Knex;
  companyId: string;
  reviewerId: string;
  requestId: string;
  reason: string;
}): Promise<void> {
  const [updated] = await input.tenantDb('registration_requests')
    .where({ id: input.requestId, status: REGISTRATION_STATUSES.PENDING })
    .update({
      status: REGISTRATION_STATUSES.REJECTED,
      rejection_reason: input.reason.trim(),
      reviewed_by: input.reviewerId,
      reviewed_at: new Date(),
      updated_at: new Date(),
    })
    .returning('id');

  if (!updated) {
    throw new AppError(404, 'Pending registration request not found');
  }

  emitRegistrationVerificationUpdate({
    companyId: input.companyId,
    verificationId: input.requestId,
    action: 'rejected',
  });
}
