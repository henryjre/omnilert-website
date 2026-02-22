import type { Knex } from 'knex';
import { AppError } from '../middleware/errorHandler.js';
import { db } from '../config/database.js';
import { loadUserWorkScope } from './globalUser.service.js';

type EmploymentStatus = 'active' | 'resigned' | 'inactive' | 'suspended';

function toEffectiveStartDate(dateStarted: unknown, createdAt: unknown): Date | null {
  const raw = dateStarted ?? createdAt;
  if (!raw) return null;
  const date = new Date(String(raw));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function computeDaysOfEmployment(dateStarted: unknown, createdAt: unknown): number | null {
  const start = toEffectiveStartDate(dateStarted, createdAt);
  if (!start) return null;
  const diffMs = Date.now() - start.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function toDateOnly(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function normalizeEmploymentStatus(raw: unknown, isActive: unknown): EmploymentStatus {
  if (raw === 'active' || raw === 'resigned' || raw === 'inactive' || raw === 'suspended') return raw;
  return isActive ? 'active' : 'inactive';
}

type BranchRef = {
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
};

type UserBranchSummary = {
  companies: Array<{ company_id: string; company_name: string; company_theme_color: string | null }>;
  resident_branch: BranchRef | null;
  borrow_branches: BranchRef[];
  branch_options: BranchRef[];
};

async function loadUserBranchSummaryMap(
  masterDb: Knex,
  userIds: string[],
): Promise<Record<string, UserBranchSummary>> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueUserIds.length === 0) return {};

  const [companyRows, branchRows] = await Promise.all([
    masterDb('user_company_access as uca')
      .join('companies as companies', 'uca.company_id', 'companies.id')
      .whereIn('uca.user_id', uniqueUserIds)
      .andWhere('uca.is_active', true)
      .select(
        'uca.user_id',
        'companies.id as company_id',
        'companies.name as company_name',
        'companies.theme_color as company_theme_color',
      )
      .orderBy('companies.name', 'asc'),
    masterDb('user_company_branches as ucb')
      .join('companies as companies', 'ucb.company_id', 'companies.id')
      .whereIn('ucb.user_id', uniqueUserIds)
      .select(
        'ucb.user_id',
        'ucb.company_id',
        'companies.name as company_name',
        'ucb.branch_id',
        'ucb.branch_name',
        'ucb.assignment_type',
      )
      .orderBy('companies.name', 'asc')
      .orderBy('ucb.branch_name', 'asc'),
  ]);

  const out: Record<string, UserBranchSummary> = {};
  for (const userId of uniqueUserIds) {
    out[userId] = {
      companies: [],
      resident_branch: null,
      borrow_branches: [],
      branch_options: [],
    };
  }

  for (const row of companyRows as any[]) {
    const userId = row.user_id as string;
    if (!out[userId]) continue;
    out[userId].companies.push({
      company_id: row.company_id as string,
      company_name: row.company_name as string,
      company_theme_color: (row.company_theme_color as string | null) ?? null,
    });
  }

  for (const row of branchRows as any[]) {
    const userId = row.user_id as string;
    if (!out[userId]) continue;
    const ref: BranchRef = {
      company_id: row.company_id as string,
      company_name: row.company_name as string,
      branch_id: row.branch_id as string,
      branch_name: row.branch_name as string,
    };
    out[userId].branch_options.push(ref);
    if (row.assignment_type === 'resident') {
      out[userId].resident_branch = ref;
    } else {
      out[userId].borrow_branches.push(ref);
    }
  }

  return out;
}

export async function listEmployeeProfiles(input: {
  tenantDb: Knex;
  status: 'all' | 'active' | 'resigned' | 'inactive' | 'suspended';
  page: number;
  pageSize: number;
  search?: string;
  departmentId?: string;
  roleIds?: string[];
  sortBy?: 'date_started' | 'days_of_employment';
  sortDirection?: 'asc' | 'desc';
  excludedEmails?: string[];
}) {
  const masterDb = db.getMasterDb();
  const excludedEmails = (input.excludedEmails ?? [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email.length > 0);

  const baseQuery = masterDb('users as users')
    .whereExists((builder) => {
      builder
        .select(masterDb.raw('1'))
        .from('user_company_access as uca')
        .whereRaw('uca.user_id = users.id')
        .andWhere('uca.is_active', true);
    })
    .select(
      'users.id',
      'users.first_name',
      'users.last_name',
      'users.email',
      'users.mobile_number',
      'users.pin',
      'users.avatar_url',
      'users.position_title',
      'users.employment_status',
      'users.is_active',
      'users.date_started',
      'users.created_at',
      'users.department_id',
    );

  if (excludedEmails.length > 0) {
    baseQuery.whereNotIn('users.email', excludedEmails);
  }

  if (input.status !== 'all') {
    baseQuery.where('users.employment_status', input.status);
  }

  if (input.departmentId) {
    baseQuery.where('users.department_id', input.departmentId);
  }

  if (input.roleIds && input.roleIds.length > 0) {
    baseQuery.whereExists((builder) => {
      builder
        .select(masterDb.raw('1'))
        .from('user_roles as ur')
        .whereRaw('ur.user_id = users.id')
        .whereIn('ur.role_id', input.roleIds as string[]);
    });
  }

  if (input.search?.trim()) {
    const q = `%${input.search.trim().toLowerCase()}%`;
    baseQuery.andWhere((builder) => {
      builder
        .whereRaw('LOWER(users.first_name) LIKE ?', [q])
        .orWhereRaw('LOWER(users.last_name) LIKE ?', [q])
        .orWhereRaw('LOWER(users.email) LIKE ?', [q])
        .orWhereRaw('LOWER(COALESCE(users.mobile_number, \'\')) LIKE ?', [q]);
    });
  }

  const countRow = (await baseQuery
    .clone()
    .clearSelect()
    .clearOrder()
    .count({ count: 'users.id' })
    .first()) as { count?: string | number } | undefined;
  const total = Number(countRow?.count ?? 0);
  const offset = (input.page - 1) * input.pageSize;

  const rows = await baseQuery
    .clone()
    .modify((queryBuilder) => {
      const direction = (input.sortDirection ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
      if (input.sortBy === 'date_started') {
        queryBuilder.orderByRaw(`COALESCE(users.date_started::timestamp, users.created_at) ${direction}`);
      } else if (input.sortBy === 'days_of_employment') {
        queryBuilder.orderByRaw(`DATE_PART('day', NOW() - COALESCE(users.date_started::timestamp, users.created_at)) ${direction}`);
      } else {
        queryBuilder.orderBy('users.created_at', 'desc');
      }
      queryBuilder.orderBy('users.created_at', 'desc');
    })
    .offset(offset)
    .limit(input.pageSize);

  const userIds = rows.map((row: any) => row.id as string);
  const branchSummaryByUserId = await loadUserBranchSummaryMap(masterDb, userIds);
  const departmentIds = Array.from(new Set(rows
    .map((row: any) => row.department_id as string | null)
    .filter(Boolean) as string[]));
  const departments = departmentIds.length > 0
    ? await input.tenantDb('departments').whereIn('id', departmentIds).select('id', 'name')
    : [];
  const departmentNameById = new Map(departments.map((d: any) => [d.id as string, d.name as string]));

  const items = rows.map((row: any) => {
    const dateStartedEffective = toDateOnly(row.date_started ?? row.created_at);
    const employmentStatus = normalizeEmploymentStatus(row.employment_status, row.is_active);
    return {
      id: row.id as string,
      first_name: row.first_name as string,
      last_name: row.last_name as string,
      email: row.email as string,
      mobile_number: (row.mobile_number as string | null) ?? null,
      pin: (row.pin as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      companies: branchSummaryByUserId[row.id as string]?.companies ?? [],
      resident_branch: branchSummaryByUserId[row.id as string]?.resident_branch ?? null,
      borrow_branches: branchSummaryByUserId[row.id as string]?.borrow_branches ?? [],
      department_name: row.department_id ? (departmentNameById.get(row.department_id as string) ?? null) : null,
      position_title: (row.position_title as string | null) ?? null,
      employment_status: employmentStatus,
      is_active: employmentStatus === 'active',
      date_started_effective: dateStartedEffective,
      days_of_employment: computeDaysOfEmployment(row.date_started, row.created_at),
    };
  });

  return {
    items,
    pagination: {
      total,
      page: input.page,
      pageSize: input.pageSize,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    },
  };
}

export async function getEmployeeProfileDetail(
  tenantDb: Knex,
  userId: string,
  excludedEmails?: string[],
) {
  const masterDb = db.getMasterDb();
  const normalizedExcludedEmails = (excludedEmails ?? [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email.length > 0);

  const user = await masterDb('users as users')
    .where('users.id', userId)
    .whereExists((builder) => {
      builder
        .select(masterDb.raw('1'))
        .from('user_company_access as uca')
        .whereRaw('uca.user_id = users.id')
        .andWhere('uca.is_active', true);
    })
    .modify((queryBuilder) => {
      if (normalizedExcludedEmails.length > 0) {
        queryBuilder.whereNotIn('users.email', normalizedExcludedEmails);
      }
    })
    .select(
      'users.id',
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
      'users.pin',
      'users.emergency_contact',
      'users.emergency_phone',
      'users.emergency_relationship',
      'users.bank_id',
      'users.bank_account_number',
      'users.valid_id_url',
      'users.avatar_url',
      'users.employment_status',
      'users.is_active',
      'users.department_id',
      'users.position_title',
      'users.date_started',
      'users.created_at',
    )
    .first();

  if (!user) {
    throw new AppError(404, 'Employee not found');
  }

  const roles = await masterDb('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.id', 'roles.name', 'roles.color')
    .orderBy('roles.priority', 'desc');

  const departmentOptions = await tenantDb('departments')
    .select('id', 'name')
    .orderBy('name', 'asc');
  const department = user.department_id
    ? await tenantDb('departments').where({ id: user.department_id }).first('name')
    : null;

  const dateStartedEffective = toDateOnly(user.date_started ?? user.created_at);
  const daysOfEmployment = computeDaysOfEmployment(user.date_started, user.created_at);
  const employmentStatus = normalizeEmploymentStatus(user.employment_status, user.is_active);
  const [branchSummaryByUserId, company] = await Promise.all([
    loadUserBranchSummaryMap(masterDb, [userId]),
    masterDb('user_company_access as uca')
      .join('companies as companies', 'uca.company_id', 'companies.id')
      .where('uca.user_id', userId)
      .andWhere('uca.is_active', true)
      .select('companies.id', 'companies.name')
      .orderBy('companies.name', 'asc')
      .first(),
  ]);
  const branchSummary = branchSummaryByUserId[userId] ?? {
    companies: [],
    resident_branch: null,
    borrow_branches: [],
    branch_options: [],
  };
  const fallbackWorkScope = await loadUserWorkScope(masterDb, userId, String(company?.id ?? ''));

  return {
    id: user.id as string,
    avatar_url: (user.avatar_url as string | null) ?? null,
    personal_information: {
      first_name: user.first_name as string,
      last_name: user.last_name as string,
      email: user.email as string,
      mobile_number: (user.mobile_number as string | null) ?? null,
      legal_name: (user.legal_name as string | null) ?? null,
      birthday: (user.birthday as string | null) ?? null,
      gender: (user.gender as string | null) ?? null,
      address: (user.address as string | null) ?? null,
      sss_number: (user.sss_number as string | null) ?? null,
      tin_number: (user.tin_number as string | null) ?? null,
      pagibig_number: (user.pagibig_number as string | null) ?? null,
      philhealth_number: (user.philhealth_number as string | null) ?? null,
      marital_status: (user.marital_status as string | null) ?? null,
    },
    pin: (user.pin as string | null) ?? null,
    emergency_contact_information: {
      emergency_contact: (user.emergency_contact as string | null) ?? null,
      emergency_phone: (user.emergency_phone as string | null) ?? null,
      emergency_relationship: (user.emergency_relationship as string | null) ?? null,
    },
    work_information: {
      company: company
        ? { id: String(company.id), name: String(company.name) }
        : fallbackWorkScope.company,
      companies: branchSummary.companies,
      resident_branch: branchSummary.resident_branch ?? fallbackWorkScope.home_resident_branch,
      home_resident_branch: fallbackWorkScope.home_resident_branch,
      borrow_branches: branchSummary.borrow_branches,
      branch_options: branchSummary.branch_options,
      department_id: (user.department_id as string | null) ?? null,
      department_name: (department?.name as string | null) ?? null,
      position_title: (user.position_title as string | null) ?? null,
      status: employmentStatus,
      date_started: dateStartedEffective,
      days_of_employment: daysOfEmployment,
    },
    bank_information: {
      bank_id: (user.bank_id as number | null) ?? null,
      account_number: (user.bank_account_number as string | null) ?? null,
    },
    valid_id_url: (user.valid_id_url as string | null) ?? null,
    roles: roles.map((role: any) => ({
      id: role.id as string,
      name: role.name as string,
      color: (role.color as string | null) ?? null,
    })),
    department_options: departmentOptions.map((department: any) => ({
      id: department.id as string,
      name: department.name as string,
    })),
  };
}

export async function updateEmployeeWorkInformation(input: {
  tenantDb: Knex;
  userId: string;
  departmentId: string | null;
  positionTitle: string | null;
  employmentStatus?: EmploymentStatus;
  isActive?: boolean;
  residentBranch?: { companyId: string; branchId: string } | null;
  dateStarted: string | null;
  excludedEmails?: string[];
}) {
  const masterDb = db.getMasterDb();
  const normalizedExcludedEmails = (input.excludedEmails ?? [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email.length > 0);

  const existingUser = await masterDb('users')
    .where({ id: input.userId })
    .first('id', 'email');
  if (!existingUser) {
    throw new AppError(404, 'Employee not found');
  }
  if (normalizedExcludedEmails.includes(String(existingUser.email ?? '').trim().toLowerCase())) {
    throw new AppError(404, 'Employee not found');
  }

  if (input.departmentId) {
    const department = await input.tenantDb('departments')
      .where({ id: input.departmentId })
      .first('id');
    if (!department) {
      throw new AppError(400, 'Selected department does not exist');
    }
  }

  const employmentStatus: EmploymentStatus | null = input.employmentStatus
    ?? (input.isActive === undefined ? null : (input.isActive ? 'active' : 'inactive'));
  if (!employmentStatus) {
    throw new AppError(400, 'employmentStatus or isActive is required');
  }

  if (!input.residentBranch) {
    throw new AppError(400, 'residentBranch is required');
  }

  const residentRow = await masterDb('user_company_branches')
    .where({
      user_id: input.userId,
      company_id: input.residentBranch.companyId,
      branch_id: input.residentBranch.branchId,
    })
    .first('id');
  if (!residentRow) {
    throw new AppError(400, 'Selected resident branch is not assigned to this user');
  }

  await masterDb.transaction(async (trx) => {
    await trx('users')
      .where({ id: input.userId })
      .update({
        department_id: input.departmentId,
        position_title: input.positionTitle,
        employment_status: employmentStatus,
        is_active: employmentStatus === 'active',
        date_started: input.dateStarted,
        updated_at: new Date(),
      });

    await trx('user_company_branches')
      .where({ user_id: input.userId })
      .update({
        assignment_type: 'borrow',
        updated_at: new Date(),
      });

    await trx('user_company_branches')
      .where({
        user_id: input.userId,
        company_id: input.residentBranch!.companyId,
        branch_id: input.residentBranch!.branchId,
      })
      .update({
        assignment_type: 'resident',
        updated_at: new Date(),
      });
  });

  return getEmployeeProfileDetail(
    input.tenantDb,
    input.userId,
    normalizedExcludedEmails,
  );
}

export async function getEmployeeProfileFilterOptions(tenantDb: Knex) {
  const masterDb = db.getMasterDb();
  const [departments, roles] = await Promise.all([
    tenantDb('departments')
      .select('id', 'name')
      .orderBy('name', 'asc'),
    masterDb('roles')
      .select('id', 'name')
      .orderBy('priority', 'desc')
      .orderBy('name', 'asc'),
  ]);

  return {
    departments: departments.map((department: any) => ({
      id: department.id as string,
      name: department.name as string,
    })),
    roles: roles.map((role: any) => ({
      id: role.id as string,
      name: role.name as string,
    })),
  };
}
