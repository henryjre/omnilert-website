import { randomUUID } from 'node:crypto';
import type { Knex } from 'knex';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { hashPassword } from '../utils/password.js';
import { logger } from '../utils/logger.js';
import {
  callOdooKw,
  createOrUpdateEmployeeForRegistration,
  formatBranchEmployeeCode,
  formatEmployeeDisplayName,
  getEmployeeLinkedBankInfoByWebsiteUserKey,
  getEmployeeByWebsiteUserKey,
  unifyPartnerContactsByEmail,
} from './odoo.service.js';
import { normalizeEmail } from './globalUser.service.js';
import { seedApprovedBankVerification } from './employeeVerification.service.js';

type CompanyAssignmentInput = {
  companyId: string;
  branchIds: string[];
};

type ResolvedAssignment = {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyDbName: string;
  companyCode: string;
  branches: Array<{ id: string; name: string; odooBranchId: number }>;
};

function randomPin(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

async function resolveCompanyAssignments(
  masterDb: Knex,
  companyAssignments: CompanyAssignmentInput[],
): Promise<ResolvedAssignment[]> {
  if (!Array.isArray(companyAssignments) || companyAssignments.length === 0) {
    throw new AppError(400, 'At least one company assignment is required');
  }

  const normalized = companyAssignments.map((assignment) => ({
    companyId: assignment.companyId,
    branchIds: Array.from(new Set(assignment.branchIds)),
  }));

  const seen = new Set<string>();
  for (const assignment of normalized) {
    if (seen.has(assignment.companyId)) {
      throw new AppError(400, `Duplicate company assignment: ${assignment.companyId}`);
    }
    seen.add(assignment.companyId);
    if (assignment.branchIds.length === 0) {
      throw new AppError(400, 'At least one branch is required for every selected company');
    }
  }

  const resolved: ResolvedAssignment[] = [];

  for (const assignment of normalized) {
    const company = await masterDb('companies')
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
    const branches = await tenantDb('branches')
      .whereIn('id', assignment.branchIds)
      .where({ is_active: true })
      .select('id', 'name', 'odoo_branch_id');

    if (branches.length !== assignment.branchIds.length) {
      throw new AppError(400, `One or more selected branches are invalid for company "${company.name}"`);
    }

    const resolvedBranches = branches.map((row: any) => {
      const odooBranchId = Number(row.odoo_branch_id);
      if (!row.odoo_branch_id || Number.isNaN(odooBranchId)) {
        throw new AppError(
          400,
          `Branch "${row.name}" in "${company.name}" is missing a valid Odoo branch ID`,
        );
      }
      return {
        id: row.id as string,
        name: row.name as string,
        odooBranchId,
      };
    });

    resolved.push({
      companyId: company.id as string,
      companyName: company.name as string,
      companySlug: company.slug as string,
      companyDbName: company.db_name as string,
      companyCode,
      branches: resolvedBranches,
    });
  }

  return resolved;
}

async function getNextEmployeeNumber(masterDb: Knex): Promise<number> {
  const userMax = await masterDb('users')
    .max<{ max: string | number | null }>('employee_number as max')
    .first();
  const identityMax = await masterDb('employee_identities')
    .max<{ max: string | number | null }>('employee_number as max')
    .first();
  return Math.max(Number(userMax?.max ?? 0), Number(identityMax?.max ?? 0)) + 1;
}

async function syncOdooEmployeesForAssignments(input: {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userKey: string;
    employeeNumber: number;
  };
  assignments: ResolvedAssignment[];
}): Promise<{
  successfulBranches: Array<{ companyId: string; branchId: string; branchName: string; odooBranchId: number }>;
  failures: Array<{ companyId: string; companyName: string; branchId: string; branchName: string; error: string }>;
}> {
  const existingEmployeesForWebsiteKey = (await callOdooKw(
    'hr.employee',
    'search_read',
    [],
    {
      domain: [['x_website_key', '=', input.user.userKey]],
      fields: ['id', 'pin'],
      limit: 1000,
    },
  )) as Array<{ id: number; pin?: string | null }>;

  const existingPin = existingEmployeesForWebsiteKey
    .map((employee) => String(employee.pin ?? '').trim())
    .find((pin) => /^\d{4}$/.test(pin));
  const sharedPin = existingPin || randomPin();
  const successes: Array<{ companyId: string; branchId: string; branchName: string; odooBranchId: number }> = [];
  const failures: Array<{ companyId: string; companyName: string; branchId: string; branchName: string; error: string }> = [];

  for (const assignment of input.assignments) {
    for (const branch of assignment.branches) {
      try {
        const existing = await getEmployeeByWebsiteUserKey(input.user.userKey, branch.odooBranchId);
        if (!existing) {
          const branchCode = formatBranchEmployeeCode(branch.odooBranchId, input.user.employeeNumber);
          const barcode = `${assignment.companyCode}${branchCode}`;
          await createOrUpdateEmployeeForRegistration({
            companyId: branch.odooBranchId,
            name: formatEmployeeDisplayName(
              branch.odooBranchId,
              input.user.employeeNumber,
              input.user.firstName,
              input.user.lastName,
            ),
            workEmail: input.user.email,
            pin: sharedPin,
            barcode,
            websiteKey: input.user.userKey,
          });
        }

        successes.push({
          companyId: assignment.companyId,
          branchId: branch.id,
          branchName: branch.name,
          odooBranchId: branch.odooBranchId,
        });
      } catch (error: any) {
        failures.push({
          companyId: assignment.companyId,
          companyName: assignment.companyName,
          branchId: branch.id,
          branchName: branch.name,
          error: error?.message ?? 'Failed to create/check Odoo employee',
        });
      }
    }
  }

  if (successes.length > 0) {
    const mainCompanyId = successes[0].odooBranchId;
    await unifyPartnerContactsByEmail({
      email: input.user.email,
      mainCompanyId,
      websiteKey: input.user.userKey,
      employeeNumber: input.user.employeeNumber,
      firstName: input.user.firstName,
      lastName: input.user.lastName,
    });
  }

  return {
    successfulBranches: successes,
    failures,
  };
}

async function writeCompanyAccessAndBranchSnapshots(input: {
  masterDb: Knex;
  userId: string;
  assignments: ResolvedAssignment[];
  successfulBranches: Array<{ companyId: string; branchId: string; branchName: string; odooBranchId: number }>;
}): Promise<void> {
  await input.masterDb.transaction(async (trx) => {
    await trx('user_company_access').where({ user_id: input.userId }).delete();
    await trx('user_company_access').insert(
      input.assignments.map((assignment) => ({
        user_id: input.userId,
        company_id: assignment.companyId,
        is_active: true,
        updated_at: new Date(),
      })),
    );

    await trx('user_company_branches').where({ user_id: input.userId }).delete();

    if (input.successfulBranches.length > 0) {
      await trx('user_company_branches').insert(
        input.successfulBranches.map((branch) => ({
          user_id: input.userId,
          company_id: branch.companyId,
          branch_id: branch.branchId,
          branch_odoo_id: String(branch.odooBranchId),
          branch_name: branch.branchName,
          assignment_type: 'borrow',
          updated_at: new Date(),
        })),
      );
    }
  });
}

export async function listGlobalUsers() {
  const masterDb = db.getMasterDb();
  const users = await masterDb('users')
    .select(
      'id',
      'email',
      'first_name',
      'last_name',
      'user_key',
      'employee_number',
      'avatar_url',
      'is_active',
      'last_login_at',
      'created_at',
    )
    .orderBy('created_at', 'desc');

  const userIds = users.map((row: any) => row.id as string);
  if (userIds.length === 0) return [];

  const [rolesRows, accessRows, branchRows] = await Promise.all([
    masterDb('user_roles as ur')
      .join('roles as roles', 'ur.role_id', 'roles.id')
      .whereIn('ur.user_id', userIds)
      .select('ur.user_id', 'roles.id', 'roles.name', 'roles.color'),
    masterDb('user_company_access as uca')
      .join('companies as companies', 'uca.company_id', 'companies.id')
      .whereIn('uca.user_id', userIds)
      .where('uca.is_active', true)
      .select('uca.user_id', 'companies.id as company_id', 'companies.name as company_name', 'companies.slug as company_slug'),
    masterDb('user_company_branches as ucb')
      .join('companies as companies', 'ucb.company_id', 'companies.id')
      .whereIn('ucb.user_id', userIds)
      .select(
        'ucb.user_id',
        'ucb.company_id',
        'companies.name as company_name',
        'ucb.branch_id',
        'ucb.branch_name',
        'ucb.assignment_type',
      ),
  ]);

  const rolesByUser = new Map<string, any[]>();
  for (const row of rolesRows as any[]) {
    const current = rolesByUser.get(row.user_id) ?? [];
    current.push({ id: row.id, name: row.name, color: row.color ?? null });
    rolesByUser.set(row.user_id, current);
  }

  const companiesByUser = new Map<string, any[]>();
  for (const row of accessRows as any[]) {
    const current = companiesByUser.get(row.user_id) ?? [];
    current.push({
      companyId: row.company_id,
      companyName: row.company_name,
      companySlug: row.company_slug,
    });
    companiesByUser.set(row.user_id, current);
  }

  const branchesByUser = new Map<string, any[]>();
  for (const row of branchRows as any[]) {
    const current = branchesByUser.get(row.user_id) ?? [];
    current.push({
      companyId: row.company_id,
      companyName: row.company_name,
      branchId: row.branch_id,
      branchName: row.branch_name,
      assignmentType: row.assignment_type,
    });
    branchesByUser.set(row.user_id, current);
  }

  return users.map((user: any) => ({
    ...user,
    roles: rolesByUser.get(user.id as string) ?? [],
    companies: companiesByUser.get(user.id as string) ?? [],
    companyBranches: branchesByUser.get(user.id as string) ?? [],
  }));
}

export async function getGlobalUserAssignmentOptions() {
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

export async function createGlobalUser(input: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  userKey: string;
  employeeNumber?: number;
  roleIds?: string[];
  companyAssignments: CompanyAssignmentInput[];
}) {
  const masterDb = db.getMasterDb();
  const email = normalizeEmail(input.email);

  const existing = await masterDb('users').whereRaw('LOWER(email) = ?', [email]).first('id');
  if (existing) {
    throw new AppError(409, 'Email already exists');
  }

  const assignments = await resolveCompanyAssignments(masterDb, input.companyAssignments);

  const existingRoles = input.roleIds && input.roleIds.length > 0
    ? await masterDb('roles').whereIn('id', input.roleIds).select('id')
    : [];
  if ((input.roleIds?.length ?? 0) !== existingRoles.length) {
    throw new AppError(400, 'One or more selected roles are invalid');
  }

  const employeeNumber = input.employeeNumber ?? (await getNextEmployeeNumber(masterDb));
  const passwordHash = await hashPassword(input.password);

  const [created] = await masterDb('users')
    .insert({
      email,
      password_hash: passwordHash,
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      user_key: input.userKey || randomUUID(),
      employee_number: employeeNumber,
      is_active: true,
      employment_status: 'active',
    })
    .returning('*');

  if (input.roleIds && input.roleIds.length > 0) {
    await masterDb('user_roles').insert(
      input.roleIds.map((roleId) => ({
        user_id: created.id as string,
        role_id: roleId,
        assigned_by: null,
      })),
    );
  }

  const provisioning = await syncOdooEmployeesForAssignments({
    user: {
      id: created.id as string,
      email,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      userKey: created.user_key as string,
      employeeNumber,
    },
    assignments,
  });

  await writeCompanyAccessAndBranchSnapshots({
    masterDb,
    userId: created.id as string,
    assignments,
    successfulBranches: provisioning.successfulBranches,
  });

  const createdUserKey = String(created.user_key ?? '').trim();
  if (createdUserKey) {
    try {
      const existingBankInfo = await getEmployeeLinkedBankInfoByWebsiteUserKey(createdUserKey);
      if (existingBankInfo) {
        await masterDb('users')
          .where({ id: created.id })
          .update({
            bank_id: existingBankInfo.bankId,
            bank_account_number: existingBankInfo.accountNumber,
            updated_at: new Date(),
          });
        (created as any).bank_id = existingBankInfo.bankId;
        (created as any).bank_account_number = existingBankInfo.accountNumber;

        await seedApprovedBankVerification({
          userId: created.id as string,
          bankId: existingBankInfo.bankId,
          accountNumber: existingBankInfo.accountNumber,
          companyDbNames: assignments.map((a) => a.companyDbName),
        });
      }
    } catch (error) {
      logger.warn(
        {
          userId: created.id,
          userKey: createdUserKey,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to auto-fill bank information from Odoo during global user creation',
      );
    }
  }

  return {
    user: created,
    provisioning,
  };
}

export async function updateGlobalUser(input: {
  userId: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  userKey?: string;
  employeeNumber?: number;
  isActive?: boolean;
}) {
  const masterDb = db.getMasterDb();
  const updates: Record<string, unknown> = { updated_at: new Date() };

  if (input.email !== undefined) updates.email = normalizeEmail(input.email);
  if (input.firstName !== undefined) updates.first_name = input.firstName.trim();
  if (input.lastName !== undefined) updates.last_name = input.lastName.trim();
  if (input.userKey !== undefined) updates.user_key = input.userKey;
  if (input.employeeNumber !== undefined) updates.employee_number = input.employeeNumber;
  if (input.isActive !== undefined) {
    updates.is_active = input.isActive;
    updates.employment_status = input.isActive ? 'active' : 'inactive';
  }

  const [updated] = await masterDb('users').where({ id: input.userId }).update(updates).returning('*');
  if (!updated) throw new AppError(404, 'User not found');
  return updated;
}

export async function assignGlobalRoles(input: {
  userId: string;
  roleIds: string[];
}) {
  const masterDb = db.getMasterDb();
  const user = await masterDb('users').where({ id: input.userId }).first('id');
  if (!user) throw new AppError(404, 'User not found');

  const roles = await masterDb('roles').whereIn('id', input.roleIds).select('id');
  if (roles.length !== input.roleIds.length) {
    throw new AppError(400, 'One or more selected roles are invalid');
  }

  await masterDb('user_roles').where({ user_id: input.userId }).delete();
  if (input.roleIds.length > 0) {
    await masterDb('user_roles').insert(
      input.roleIds.map((roleId) => ({
        user_id: input.userId,
        role_id: roleId,
        assigned_by: null,
      })),
    );
  }
}

export async function assignGlobalCompanyBranches(input: {
  userId: string;
  companyAssignments: CompanyAssignmentInput[];
}) {
  const masterDb = db.getMasterDb();
  const user = await masterDb('users')
    .where({ id: input.userId })
    .first('id', 'email', 'first_name', 'last_name', 'user_key', 'employee_number');
  if (!user) throw new AppError(404, 'User not found');
  if (!user.user_key) throw new AppError(400, 'User key is required before assigning company branches');

  const assignments = await resolveCompanyAssignments(masterDb, input.companyAssignments);
  const employeeNumber = Number(user.employee_number ?? 0) > 0
    ? Number(user.employee_number)
    : await getNextEmployeeNumber(masterDb);

  if (!user.employee_number) {
    await masterDb('users').where({ id: input.userId }).update({
      employee_number: employeeNumber,
      updated_at: new Date(),
    });
  }

  const provisioning = await syncOdooEmployeesForAssignments({
    user: {
      id: user.id as string,
      email: String(user.email),
      firstName: String(user.first_name),
      lastName: String(user.last_name),
      userKey: String(user.user_key),
      employeeNumber,
    },
    assignments,
  });

  await writeCompanyAccessAndBranchSnapshots({
    masterDb,
    userId: input.userId,
    assignments,
    successfulBranches: provisioning.successfulBranches,
  });

  return provisioning;
}

export async function deactivateGlobalUser(userId: string) {
  const masterDb = db.getMasterDb();
  const [user] = await masterDb('users')
    .where({ id: userId })
    .update({
      is_active: false,
      employment_status: 'inactive',
      updated_at: new Date(),
    })
    .returning('*');
  if (!user) throw new AppError(404, 'User not found');
}

export async function deleteGlobalUser(userId: string) {
  const masterDb = db.getMasterDb();
  const count = await masterDb('users').where({ id: userId }).delete();
  if (!count) throw new AppError(404, 'User not found');
}
