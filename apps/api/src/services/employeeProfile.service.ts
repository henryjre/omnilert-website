import type { Knex } from 'knex';
import { AppError } from '../middleware/errorHandler.js';

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

export async function listEmployeeProfiles(input: {
  tenantDb: Knex;
  status: 'all' | 'active' | 'inactive';
  page: number;
  pageSize: number;
  search?: string;
  excludedEmails?: string[];
}) {
  const excludedEmails = (input.excludedEmails ?? [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email.length > 0);

  const baseQuery = input.tenantDb('users as users')
    .leftJoin('departments as departments', 'users.department_id', 'departments.id')
    .select(
      'users.id',
      'users.first_name',
      'users.last_name',
      'users.email',
      'users.mobile_number',
      'users.pin',
      'users.avatar_url',
      'users.position_title',
      'users.is_active',
      'users.date_started',
      'users.created_at',
      'departments.name as department_name',
    );

  if (excludedEmails.length > 0) {
    baseQuery.whereNotIn('users.email', excludedEmails);
  }

  if (input.status === 'active') {
    baseQuery.where('users.is_active', true);
  } else if (input.status === 'inactive') {
    baseQuery.where('users.is_active', false);
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
    .orderBy('users.created_at', 'desc')
    .offset(offset)
    .limit(input.pageSize);

  const items = rows.map((row: any) => {
    const dateStartedEffective = toDateOnly(row.date_started ?? row.created_at);
    return {
      id: row.id as string,
      first_name: row.first_name as string,
      last_name: row.last_name as string,
      email: row.email as string,
      mobile_number: (row.mobile_number as string | null) ?? null,
      pin: (row.pin as string | null) ?? null,
      avatar_url: (row.avatar_url as string | null) ?? null,
      department_name: (row.department_name as string | null) ?? null,
      position_title: (row.position_title as string | null) ?? null,
      is_active: Boolean(row.is_active),
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
  const normalizedExcludedEmails = (excludedEmails ?? [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email.length > 0);

  const user = await tenantDb('users as users')
    .leftJoin('departments as departments', 'users.department_id', 'departments.id')
    .where('users.id', userId)
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
      'users.is_active',
      'users.department_id',
      'users.position_title',
      'users.date_started',
      'users.created_at',
      'departments.name as department_name',
    )
    .first();

  if (!user) {
    throw new AppError(404, 'Employee not found');
  }

  const roles = await tenantDb('user_roles')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .where('user_roles.user_id', userId)
    .select('roles.id', 'roles.name', 'roles.color')
    .orderBy('roles.priority', 'desc');

  const departmentOptions = await tenantDb('departments')
    .select('id', 'name')
    .orderBy('name', 'asc');

  const dateStartedEffective = toDateOnly(user.date_started ?? user.created_at);
  const daysOfEmployment = computeDaysOfEmployment(user.date_started, user.created_at);

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
      department_id: (user.department_id as string | null) ?? null,
      department_name: (user.department_name as string | null) ?? null,
      position_title: (user.position_title as string | null) ?? null,
      status: user.is_active ? 'active' : 'inactive',
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
  isActive: boolean;
  dateStarted: string | null;
  excludedEmails?: string[];
}) {
  const normalizedExcludedEmails = (input.excludedEmails ?? [])
    .map((email) => String(email).trim().toLowerCase())
    .filter((email) => email.length > 0);

  const existingUser = await input.tenantDb('users')
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

  await input.tenantDb('users')
    .where({ id: input.userId })
    .update({
      department_id: input.departmentId,
      position_title: input.positionTitle,
      is_active: input.isActive,
      date_started: input.dateStarted,
      updated_at: new Date(),
    });

  return getEmployeeProfileDetail(input.tenantDb, input.userId, normalizedExcludedEmails);
}
