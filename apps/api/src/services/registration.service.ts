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
  getEmployeeIdentitySnapshot,
  unifyPartnerContactsByEmail,
} from './odoo.service.js';
import { sendRegistrationApprovedEmail } from './mail.service.js';
import { getIO } from '../config/socket.js';
import { normalizeEmail } from './globalUser.service.js';

const REGISTRATION_STATUSES = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
const DEFAULT_REGISTRATION_COMPANY_ID = 1;

type CompanyAssignmentInput = {
  companyId: string;
  branchIds: string[];
};

type ResidentBranchInput = {
  companyId: string;
  branchId: string;
};

type ResolvedCompanyAssignment = {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyCode: string;
  companyDbName: string;
  branches: Array<{ id: string; name: string; odooBranchId: number }>;
};

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function emitRegistrationVerificationUpdateGlobal(payload: {
  verificationId: string;
  action: 'created' | 'approved' | 'rejected';
  userId?: string;
}) {
  const masterDb = db.getMasterDb();
  const companies = await masterDb('companies').where({ is_active: true }).select('id');
  try {
    const namespace = getIO().of('/employee-verifications');
    for (const company of companies) {
      namespace.to(`company:${company.id}`).emit('employee-verification:updated', {
        companyId: company.id as string,
        verificationId: payload.verificationId,
        verificationType: 'registration',
        action: payload.action,
        userId: payload.userId,
      });
    }
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

    const existingUser = await trx('users')
      .whereRaw('LOWER(email) = ?', [email])
      .whereNotNull('employee_number')
      .whereNotNull('user_key')
      .first('id', 'employee_number', 'user_key');
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

    const identityMax = await trx('employee_identities')
      .max<{ max: string | number | null }>('employee_number as max')
      .first();
    const usersMax = await trx('users')
      .max<{ max: string | number | null }>('employee_number as max')
      .first();
    const nextEmployeeNumber = Math.max(Number(identityMax?.max ?? 0), Number(usersMax?.max ?? 0)) + 1;
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

async function resolveAssignmentsOrThrow(input: {
  masterDb: Knex;
  companyAssignments: CompanyAssignmentInput[];
  residentBranch: ResidentBranchInput;
}): Promise<{
  assignments: ResolvedCompanyAssignment[];
  resident: {
    companyId: string;
    companyName: string;
    branchId: string;
    branchName: string;
  };
}> {
  const dedupedAssignments = input.companyAssignments.map((item) => ({
    companyId: item.companyId,
    branchIds: Array.from(new Set(item.branchIds)),
  }));

  const uniqueCompanyIds = new Set<string>();
  for (const assignment of dedupedAssignments) {
    if (uniqueCompanyIds.has(assignment.companyId)) {
      throw new AppError(400, `Duplicate company assignment: ${assignment.companyId}`);
    }
    uniqueCompanyIds.add(assignment.companyId);
    if (assignment.branchIds.length === 0) {
      throw new AppError(400, 'At least one branch is required for every selected company');
    }
  }

  const assignments: ResolvedCompanyAssignment[] = [];

  for (const assignment of dedupedAssignments) {
    const company = await input.masterDb('companies')
      .where({ id: assignment.companyId, is_active: true })
      .first('id', 'name', 'slug', 'db_name', 'company_code');

    if (!company) {
      throw new AppError(400, `Selected company is invalid or inactive: ${assignment.companyId}`);
    }

    const companyCode = String(company.company_code ?? '').trim().toUpperCase();
    if (!companyCode) {
      throw new AppError(400, `Company "${company.name}" is missing a company code`);
    }

    const tenantDb = await db.getTenantDb(String(company.db_name));
    const branchRows = await tenantDb('branches')
      .whereIn('id', assignment.branchIds)
      .where({ is_active: true })
      .select('id', 'name', 'odoo_branch_id');

    if (branchRows.length !== assignment.branchIds.length) {
      throw new AppError(400, `One or more selected branches are invalid for company "${company.name}"`);
    }

    const branches = branchRows.map((row: any) => {
      const odooBranchId = Number(row.odoo_branch_id);
      if (!row.odoo_branch_id || Number.isNaN(odooBranchId)) {
        throw new AppError(400, `Branch "${row.name}" in "${company.name}" is missing a valid Odoo branch ID`);
      }
      return {
        id: row.id as string,
        name: row.name as string,
        odooBranchId,
      };
    });

    assignments.push({
      companyId: company.id as string,
      companyName: company.name as string,
      companySlug: company.slug as string,
      companyCode,
      companyDbName: company.db_name as string,
      branches,
    });
  }

  const residentCompany = assignments.find((item) => item.companyId === input.residentBranch.companyId);
  if (!residentCompany) {
    throw new AppError(400, 'Resident company must be included in selected company assignments');
  }
  const residentBranch = residentCompany.branches.find((branch) => branch.id === input.residentBranch.branchId);
  if (!residentBranch) {
    throw new AppError(400, 'Resident branch must be included in selected branches of resident company');
  }

  return {
    assignments,
    resident: {
      companyId: residentCompany.companyId,
      companyName: residentCompany.companyName,
      branchId: residentBranch.id,
      branchName: residentBranch.name,
    },
  };
}

export async function createRegistrationRequest(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<void> {
  const masterDb = db.getMasterDb();
  const email = normalizeEmail(input.email);

  const existingUser = await masterDb('users')
    .whereRaw('LOWER(email) = ?', [email])
    .where({ is_active: true })
    .first('id');
  if (existingUser) {
    throw new AppError(409, 'An active user with this email already exists');
  }

  const pending = await masterDb('registration_requests')
    .whereRaw('LOWER(email) = ?', [email])
    .where({ status: REGISTRATION_STATUSES.PENDING })
    .first('id');
  if (pending) {
    throw new AppError(409, 'A pending registration request already exists for this email');
  }

  const [created] = await masterDb('registration_requests').insert({
    first_name: input.firstName.trim(),
    last_name: input.lastName.trim(),
    email,
    encrypted_password: encryptText(input.password),
    status: REGISTRATION_STATUSES.PENDING,
    requested_at: new Date(),
    updated_at: new Date(),
  }).returning('id');

  await emitRegistrationVerificationUpdateGlobal({
    verificationId: created.id as string,
    action: 'created',
  });
}

export async function listRegistrationRequests(): Promise<any[]> {
  const masterDb = db.getMasterDb();
  return masterDb('registration_requests')
    .leftJoin('users as reviewers', 'registration_requests.reviewed_by', 'reviewers.id')
    .select(
      'registration_requests.*',
      masterDb.raw("CONCAT(reviewers.first_name, ' ', reviewers.last_name) as reviewed_by_name"),
    )
    .orderBy('registration_requests.requested_at', 'desc');
}

export async function listRegistrationAssignmentOptions(): Promise<{
  roles: any[];
  companies: Array<{
    id: string;
    name: string;
    slug: string;
    branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
  }>;
}> {
  const masterDb = db.getMasterDb();
  const roles = await masterDb('roles')
    .select('id', 'name', 'color', 'priority')
    .orderBy('priority', 'desc')
    .orderBy('name', 'asc');

  const companies = await masterDb('companies')
    .where({ is_active: true })
    .select('id', 'name', 'slug', 'db_name')
    .orderBy('name', 'asc');

  const companyOptions: Array<{
    id: string;
    name: string;
    slug: string;
    branches: Array<{ id: string; name: string; odoo_branch_id: string }>;
  }> = [];

  for (const company of companies) {
    const tenantDb = await db.getTenantDb(String(company.db_name));
    const branches = await tenantDb('branches')
      .where({ is_active: true })
      .select('id', 'name', 'odoo_branch_id')
      .orderBy('name', 'asc');

    companyOptions.push({
      id: company.id as string,
      name: company.name as string,
      slug: company.slug as string,
      branches: branches.map((branch: any) => ({
        id: branch.id as string,
        name: branch.name as string,
        odoo_branch_id: String(branch.odoo_branch_id ?? ''),
      })),
    });
  }

  return { roles, companies: companyOptions };
}

export async function approveRegistrationRequest(input: {
  reviewerId: string;
  reviewerCompanyId: string;
  requestId: string;
  roleIds: string[];
  companyAssignments: CompanyAssignmentInput[];
  residentBranch: ResidentBranchInput;
}): Promise<{ requestId: string; userId: string }> {
  const masterDb = db.getMasterDb();

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'start',
    message: 'Starting approval process...',
  });

  const request = await masterDb('registration_requests')
    .where({ id: input.requestId })
    .first();
  if (!request) {
    throw new AppError(404, 'Registration request not found');
  }
  if (request.status !== REGISTRATION_STATUSES.PENDING) {
    throw new AppError(400, 'Registration request is already resolved');
  }

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'validate',
    message: 'Validating roles and company/branch assignments...',
  });

  const existingRoles = await masterDb('roles').whereIn('id', input.roleIds).select('id');
  if (existingRoles.length !== input.roleIds.length) {
    throw new AppError(400, 'One or more selected roles are invalid');
  }

  const { assignments, resident } = await resolveAssignmentsOrThrow({
    masterDb,
    companyAssignments: input.companyAssignments,
    residentBranch: input.residentBranch,
  });
  const residentAssignment = assignments.find((item) => item.companyId === resident.companyId)!;

  const normalizedEmail = normalizeEmail(String(request.email));
  const identity = await resolveOrCreateEmployeeIdentity(masterDb, normalizedEmail);
  let employeeNumber = identity.employeeNumber;
  const websiteKey = identity.websiteKey;

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'identity',
    message: `Resolved employee identity (#${employeeNumber}).`,
  });

  const decryptedPassword = decryptText(String(request.encrypted_password));

  const allOdooBranchIds = assignments.flatMap((item) => item.branches.map((branch) => branch.odooBranchId));
  const maxByCompanyCode: Record<string, number> = {};
  for (const assignment of assignments) {
    const key = assignment.companyCode;
    if (maxByCompanyCode[key] !== undefined) continue;
    maxByCompanyCode[key] = await getMaxEmployeeNumberFromOdoo(
      assignment.companyCode,
      assignment.branches.map((branch) => branch.odooBranchId),
    );
  }
  const maxOdooEmployeeNumber = Math.max(0, ...Object.values(maxByCompanyCode));

  const identitySnapshot = await getEmployeeIdentitySnapshot({
    websiteUserKey: websiteKey,
    email: normalizedEmail,
  });

  if (identitySnapshot.employeeCount === 0 && employeeNumber <= maxOdooEmployeeNumber) {
    employeeNumber = maxOdooEmployeeNumber + 1;
  }

  const existingPin = identitySnapshot.existingPin;
  const sharedPin = existingPin || randomPin();

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'pin',
    message: existingPin
      ? 'Reused existing employee PIN for all assigned branches.'
      : 'Generated a new PIN and will apply it to all assigned branches.',
  });

  const isEmployeeNumberAvailable = async (candidate: number): Promise<boolean> => {
    for (const assignment of assignments) {
      for (const branch of assignment.branches) {
        const branchCode = formatBranchEmployeeCode(branch.odooBranchId, candidate);
        const barcode = `${assignment.companyCode}${branchCode}`;
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
          return false;
        }
      }
    }

    const defaultCompanyBranchCode = formatBranchEmployeeCode(DEFAULT_REGISTRATION_COMPANY_ID, candidate);
    const defaultCompanyBarcode = `${residentAssignment.companyCode}${defaultCompanyBranchCode}`;
    const defaultCompanyMatches = (await callOdooKw(
      'hr.employee',
      'search_read',
      [],
      {
        domain: [['barcode', '=', defaultCompanyBarcode]],
        fields: ['id', 'x_website_key'],
        limit: 10,
      },
    )) as Array<{ id: number; x_website_key?: string | null }>;
    if (defaultCompanyMatches.some((employee) => employee.x_website_key !== websiteKey)) {
      return false;
    }

    return true;
  };

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
  const totalBranches = assignments.reduce((acc, assignment) => acc + assignment.branches.length, 0);

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'employees',
    message: `Creating/updating Odoo employees in ${totalBranches} selected branch(es)...`,
  });

  let processedBranches = 0;
  for (const assignment of assignments) {
    for (const branch of assignment.branches) {
      const branchCode = formatBranchEmployeeCode(branch.odooBranchId, employeeNumber);
      const barcode = `${assignment.companyCode}${branchCode}`;
      await createOrUpdateEmployeeForRegistration({
        companyId: branch.odooBranchId,
        name: formatEmployeeDisplayName(
          branch.odooBranchId,
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
        companyId: input.reviewerCompanyId,
        verificationId: input.requestId,
        reviewerId: input.reviewerId,
        step: 'employees',
        message: `Processed branch ${processedBranches}/${totalBranches} (${assignment.companyName} · Odoo #${branch.odooBranchId}).`,
      });
    }
  }

  const residentBranch = residentAssignment.branches.find((item) => item.id === resident.branchId)!;

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'employees',
    message: `Ensuring default Odoo employee in company #${DEFAULT_REGISTRATION_COMPANY_ID}...`,
  });
  const defaultCompanyBranchCode = formatBranchEmployeeCode(DEFAULT_REGISTRATION_COMPANY_ID, employeeNumber);
  const defaultCompanyBarcode = `${residentAssignment.companyCode}${defaultCompanyBranchCode}`;
  await createOrUpdateEmployeeForRegistration({
    companyId: DEFAULT_REGISTRATION_COMPANY_ID,
    name: formatEmployeeDisplayName(
      DEFAULT_REGISTRATION_COMPANY_ID,
      employeeNumber,
      String(request.first_name ?? ''),
      String(request.last_name ?? ''),
    ),
    workEmail: normalizedEmail,
    pin: sharedPin,
    barcode: defaultCompanyBarcode,
    websiteKey,
  });

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'merge',
    message: 'Merging partner contacts and applying global contact settings...',
  });
  try {
    await unifyPartnerContactsByEmail({
      email: normalizedEmail,
      mainCompanyId: residentBranch.odooBranchId,
      websiteKey,
      employeeNumber,
      firstName: String(request.first_name ?? ''),
      lastName: String(request.last_name ?? ''),
    });
  } catch (error) {
    logger.warn(
      {
        email: normalizedEmail,
        websiteKey,
        mainCompanyId: residentBranch.odooBranchId,
        error: error instanceof Error ? error.message : String(error),
      },
      'Failed to unify Odoo partner contacts by email during registration approval; continuing',
    );
    emitRegistrationApprovalProgress({
      companyId: input.reviewerCompanyId,
      verificationId: input.requestId,
      reviewerId: input.reviewerId,
      step: 'merge',
      message: 'Partner contact merge was skipped due to Odoo-side rule constraints; continuing approval.',
    });
  }

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'user',
    message: 'Creating/updating global user and assignments...',
  });

  const passwordHash = await hashPassword(decryptedPassword);
  const result = await masterDb.transaction(async (trx) => {
    const existingUser = await trx('users')
      .whereRaw('LOWER(email) = ?', [normalizedEmail])
      .first();

    let userId: string;
    if (existingUser) {
      const [updated] = await trx('users')
        .where({ id: existingUser.id })
        .update({
          first_name: String(request.first_name ?? '').trim(),
          last_name: String(request.last_name ?? '').trim(),
          email: normalizedEmail,
          password_hash: passwordHash,
          employee_number: employeeNumber,
          user_key: websiteKey,
          is_active: true,
          employment_status: 'active',
          updated_at: new Date(),
        })
        .returning('id');
      userId = updated.id as string;
    } else {
      const [created] = await trx('users')
        .insert({
          first_name: String(request.first_name ?? '').trim(),
          last_name: String(request.last_name ?? '').trim(),
          email: normalizedEmail,
          password_hash: passwordHash,
          employee_number: employeeNumber,
          user_key: websiteKey,
          is_active: true,
          employment_status: 'active',
        })
        .returning('id');
      userId = created.id as string;
    }

    await trx('user_roles').where({ user_id: userId }).delete();
    if (input.roleIds.length > 0) {
      await trx('user_roles').insert(
        input.roleIds.map((roleId) => ({
          user_id: userId,
          role_id: roleId,
          assigned_by: input.reviewerId,
        })),
      );
    }

    await trx('user_company_access').where({ user_id: userId }).delete();
    await trx('user_company_access').insert(
      assignments.map((assignment) => ({
        user_id: userId,
        company_id: assignment.companyId,
        is_active: true,
        updated_at: new Date(),
      })),
    );

    await trx('user_company_branches').where({ user_id: userId }).delete();
    const branchRows: Array<{
      user_id: string;
      company_id: string;
      branch_id: string;
      branch_odoo_id: string;
      branch_name: string;
      assignment_type: 'resident' | 'borrow';
    }> = [];
    for (const assignment of assignments) {
      for (const branch of assignment.branches) {
        const isResident = assignment.companyId === resident.companyId && branch.id === resident.branchId;
        branchRows.push({
          user_id: userId,
          company_id: assignment.companyId,
          branch_id: branch.id,
          branch_odoo_id: String(branch.odooBranchId),
          branch_name: branch.name,
          assignment_type: isResident ? 'resident' : 'borrow',
        });
      }
    }
    if (branchRows.length > 0) {
      await trx('user_company_branches').insert(branchRows);
    }

    const [updatedRequest] = await trx('registration_requests')
      .where({ id: input.requestId, status: REGISTRATION_STATUSES.PENDING })
      .update({
        status: REGISTRATION_STATUSES.APPROVED,
        reviewed_by: input.reviewerId,
        reviewed_at: new Date(),
        approved_role_ids: JSON.stringify(input.roleIds),
        approved_user_id: userId,
        resident_company_id: resident.companyId,
        resident_branch_id: resident.branchId,
        resident_branch_name: resident.branchName,
        updated_at: new Date(),
      })
      .returning('*');
    if (!updatedRequest) {
      throw new AppError(409, 'Registration request was already updated by another process');
    }

    await trx('registration_request_company_assignments')
      .where({ registration_request_id: input.requestId })
      .delete();

    for (const assignment of assignments) {
      const [snapshotCompany] = await trx('registration_request_company_assignments')
        .insert({
          registration_request_id: input.requestId,
          company_id: assignment.companyId,
          company_name: assignment.companyName,
        })
        .returning('id');

      if (assignment.branches.length > 0) {
        await trx('registration_request_assignment_branches').insert(
          assignment.branches.map((branch) => ({
            registration_request_company_assignment_id: snapshotCompany.id,
            branch_id: branch.id,
            branch_name: branch.name,
            branch_odoo_id: String(branch.odooBranchId),
          })),
        );
      }
    }

    return {
      requestId: updatedRequest.id as string,
      userId,
      firstCompanySlug: assignments[0]?.companySlug ?? null,
    };
  });

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
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
    companySlug: result.firstCompanySlug ?? undefined,
  });

  emitRegistrationApprovalProgress({
    companyId: input.reviewerCompanyId,
    verificationId: input.requestId,
    reviewerId: input.reviewerId,
    step: 'done',
    message: 'Approval completed successfully.',
  });

  await emitRegistrationVerificationUpdateGlobal({
    verificationId: result.requestId,
    action: 'approved',
    userId: result.userId,
  });

  return {
    requestId: result.requestId,
    userId: result.userId,
  };
}

export async function rejectRegistrationRequest(input: {
  reviewerId: string;
  requestId: string;
  reason: string;
}): Promise<void> {
  const masterDb = db.getMasterDb();
  const [updated] = await masterDb('registration_requests')
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

  await emitRegistrationVerificationUpdateGlobal({
    verificationId: input.requestId,
    action: 'rejected',
  });
}
