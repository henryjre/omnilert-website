import { db } from '../config/database.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

type UserRow = {
  id: string;
  user_key: string | null;
  discord_user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  employee_number: number | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: Date | string | null;
  created_at: Date | string;
};

type RoleRow = {
  user_id: string;
  id: string;
  name: string;
  color: string | null;
  discord_role_id: string | null;
};

type CompanyRow = {
  user_id: string;
  company_id: string;
  company_name: string;
  company_slug: string;
};

type BranchRow = {
  user_id: string;
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
  assignment_type: string;
};

type DiscordIntegrationRole = {
  id: string;
  name: string;
  color: string | null;
  discord_role_id: string | null;
};

type DiscordIntegrationCompany = {
  company_id: string;
  company_name: string;
  company_slug: string;
};

type DiscordIntegrationCompanyBranch = {
  company_id: string;
  company_name: string;
  branch_id: string;
  branch_name: string;
  assignment_type: string;
};

type DiscordIntegrationUser = {
  id: string;
  user_key: string | null;
  discord_user_id: string | null;
  email: string;
  first_name: string;
  last_name: string;
  employee_number: number | null;
  avatar_url: string | null;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  roles: DiscordIntegrationRole[];
  companies: DiscordIntegrationCompany[];
  company_branches: DiscordIntegrationCompanyBranch[];
};

type DiscordIntegrationUsersListData = {
  users: DiscordIntegrationUser[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
};

type RegistrationStatus = 'pending' | 'approved' | 'rejected';

type RegistrationRequestRow = {
  status: RegistrationStatus;
};

type RegistrationDiscordIdRow = {
  id: string;
  email: string;
  discord_user_id: string | null;
};

type DiscordRegistrationStatusData = {
  registration: {
    exists: boolean;
    status: RegistrationStatus | null;
  };
};

type DiscordRegistrationDiscordIdData = {
  registration_request: RegistrationDiscordIdRow;
};

export type DiscordUsersListQuery = {
  page?: number | string;
  limit?: number | string;
  include_inactive?: boolean | string;
};

export type DiscordUserLookupQuery = {
  id?: string;
  email?: string;
  user_key?: string;
  include_inactive?: boolean | string;
};

export type DiscordRegistrationStatusQuery = {
  email?: string;
};

export class DiscordIntegrationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscordIntegrationValidationError';
  }
}

export class DiscordIntegrationNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscordIntegrationNotFoundError';
  }
}

type DiscordUserIntegrationRepository = {
  countUsers(includeInactive: boolean): Promise<number>;
  listUsers(input: { includeInactive: boolean; offset: number; limit: number }): Promise<UserRow[]>;
  listRolesForUsers(userIds: string[]): Promise<RoleRow[]>;
  listCompaniesForUsers(userIds: string[]): Promise<CompanyRow[]>;
  listBranchesForUsers(userIds: string[]): Promise<BranchRow[]>;
  findUserById(id: string, includeInactive: boolean): Promise<UserRow | null>;
  findUserByEmail(email: string, includeInactive: boolean): Promise<UserRow | null>;
  findUserByUserKey(userKey: string, includeInactive: boolean): Promise<UserRow | null>;
  findUserByDiscordUserId(discordUserId: string): Promise<{ id: string; email: string } | null>;
  findLatestRegistrationRequestByEmail(email: string): Promise<RegistrationRequestRow | null>;
  updatePendingRegistrationDiscordUserId(input: {
    email: string;
    discordUserId: string;
  }): Promise<RegistrationDiscordIdRow | null>;
  updateDiscordUserIdByEmail(email: string, discordUserId: string): Promise<{
    id: string;
    email: string;
    discord_user_id: string | null;
  } | null>;
};

function parsePositiveInt(
  value: number | string | undefined,
  fieldName: 'page' | 'limit',
  defaultValue: number,
  max?: number,
): number {
  if (value === undefined || value === null || value === '') return defaultValue;

  const parsed = typeof value === 'number'
    ? value
    : (() => {
      const normalized = String(value).trim();
      if (!/^\d+$/.test(normalized)) {
        return Number.NaN;
      }
      return Number(normalized);
    })();

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new DiscordIntegrationValidationError(`${fieldName} must be a positive integer`);
  }

  if (max !== undefined && parsed > max) {
    throw new DiscordIntegrationValidationError(`${fieldName} must be less than or equal to ${max}`);
  }

  return parsed;
}

function parseIncludeInactive(value: boolean | string | undefined): boolean {
  if (value === undefined || value === null || value === '') return false;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no'].includes(normalized)) return false;

  throw new DiscordIntegrationValidationError('include_inactive must be a boolean');
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeRequiredEmail(email: string | undefined): string {
  const normalized = normalizeEmail(email ?? '');
  if (!normalized) {
    throw new DiscordIntegrationValidationError('email is required');
  }
  return normalized;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function mapUsers(
  users: UserRow[],
  rolesRows: RoleRow[],
  companyRows: CompanyRow[],
  branchRows: BranchRow[],
): DiscordIntegrationUser[] {
  const rolesByUserId = new Map<string, DiscordIntegrationRole[]>();
  for (const row of rolesRows) {
    const current = rolesByUserId.get(row.user_id) ?? [];
    current.push({
      id: row.id,
      name: row.name,
      color: row.color ?? null,
      discord_role_id: row.discord_role_id ?? null,
    });
    rolesByUserId.set(row.user_id, current);
  }

  const companiesByUserId = new Map<string, DiscordIntegrationCompany[]>();
  for (const row of companyRows) {
    const current = companiesByUserId.get(row.user_id) ?? [];
    current.push({
      company_id: row.company_id,
      company_name: row.company_name,
      company_slug: row.company_slug,
    });
    companiesByUserId.set(row.user_id, current);
  }

  const branchesByUserId = new Map<string, DiscordIntegrationCompanyBranch[]>();
  for (const row of branchRows) {
    const current = branchesByUserId.get(row.user_id) ?? [];
    current.push({
      company_id: row.company_id,
      company_name: row.company_name,
      branch_id: row.branch_id,
      branch_name: row.branch_name,
      assignment_type: row.assignment_type,
    });
    branchesByUserId.set(row.user_id, current);
  }

  return users.map((row) => ({
    id: row.id,
    user_key: row.user_key ?? null,
    discord_user_id: row.discord_user_id ?? null,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    employee_number: row.employee_number ?? null,
    avatar_url: row.avatar_url ?? null,
    is_active: Boolean(row.is_active),
    last_login_at: toIsoString(row.last_login_at),
    created_at: toIsoString(row.created_at) ?? '',
    roles: rolesByUserId.get(row.id) ?? [],
    companies: companiesByUserId.get(row.id) ?? [],
    company_branches: branchesByUserId.get(row.id) ?? [],
  }));
}

function createDatabaseRepository(): DiscordUserIntegrationRepository {
  return {
    async countUsers(includeInactive) {
      const countQuery = db.getDb()('users')
        .count<{ count: string | number }>('id as count')
        .first();

      if (!includeInactive) {
        countQuery.where('is_active', true);
      }

      const countRow = await countQuery;
      return Number(countRow?.count ?? 0);
    },
    async listUsers(input) {
      const query = db.getDb()('users')
        .select(
          'id',
          'user_key',
          'discord_user_id',
          'email',
          'first_name',
          'last_name',
          'employee_number',
          'avatar_url',
          'is_active',
          'last_login_at',
          'created_at',
        )
        .orderBy('created_at', 'desc')
        .orderBy('id', 'desc')
        .offset(input.offset)
        .limit(input.limit);

      if (!input.includeInactive) {
        query.where('is_active', true);
      }

      return query as Promise<UserRow[]>;
    },
    async listRolesForUsers(userIds) {
      if (userIds.length === 0) return [];

      return db.getDb()('user_roles as ur')
        .join('roles as roles', 'ur.role_id', 'roles.id')
        .whereIn('ur.user_id', userIds)
        .select(
          'ur.user_id',
          'roles.id',
          'roles.name',
          'roles.color',
          'roles.discord_role_id',
        ) as Promise<RoleRow[]>;
    },
    async listCompaniesForUsers(userIds) {
      if (userIds.length === 0) return [];

      return db.getDb()('user_company_access as uca')
        .join('companies as companies', 'uca.company_id', 'companies.id')
        .whereIn('uca.user_id', userIds)
        .where('uca.is_active', true)
        .select(
          'uca.user_id',
          'companies.id as company_id',
          'companies.name as company_name',
          'companies.slug as company_slug',
        ) as Promise<CompanyRow[]>;
    },
    async listBranchesForUsers(userIds) {
      if (userIds.length === 0) return [];

      return db.getDb()('user_company_branches as ucb')
        .join('companies as companies', 'ucb.company_id', 'companies.id')
        .join('branches as branches', 'ucb.branch_id', 'branches.id')
        .whereIn('ucb.user_id', userIds)
        .select(
          'ucb.user_id',
          'ucb.company_id',
          'companies.name as company_name',
          'ucb.branch_id',
          'branches.name as branch_name',
          'ucb.assignment_type',
        ) as Promise<BranchRow[]>;
    },
    async findUserById(id, includeInactive) {
      const query = db.getDb()('users')
        .where({ id })
        .first(
          'id',
          'user_key',
          'discord_user_id',
          'email',
          'first_name',
          'last_name',
          'employee_number',
          'avatar_url',
          'is_active',
          'last_login_at',
          'created_at',
        );

      if (!includeInactive) {
        query.where('is_active', true);
      }

      return (await query) as UserRow | null;
    },
    async findUserByEmail(email, includeInactive) {
      const query = db.getDb()('users')
        .whereRaw('LOWER(email) = ?', [normalizeEmail(email)])
        .first(
          'id',
          'user_key',
          'discord_user_id',
          'email',
          'first_name',
          'last_name',
          'employee_number',
          'avatar_url',
          'is_active',
          'last_login_at',
          'created_at',
        );

      if (!includeInactive) {
        query.where('is_active', true);
      }

      return (await query) as UserRow | null;
    },
    async findUserByUserKey(userKey, includeInactive) {
      const query = db.getDb()('users')
        .where({ user_key: userKey })
        .first(
          'id',
          'user_key',
          'discord_user_id',
          'email',
          'first_name',
          'last_name',
          'employee_number',
          'avatar_url',
          'is_active',
          'last_login_at',
          'created_at',
        );

      if (!includeInactive) {
        query.where('is_active', true);
      }

      return (await query) as UserRow | null;
    },
    async findUserByDiscordUserId(discordUserId) {
      const row = await db.getDb()('users')
        .where({ discord_user_id: discordUserId })
        .first('id', 'email');
      if (!row) return null;
      return {
        id: row.id as string,
        email: row.email as string,
      };
    },
    async findLatestRegistrationRequestByEmail(email) {
      return (await db.getDb()('registration_requests')
        .whereRaw('LOWER(email) = ?', [normalizeEmail(email)])
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .first('status')) as RegistrationRequestRow | null;
    },
    async updatePendingRegistrationDiscordUserId(input) {
      const request = await db.getDb()('registration_requests')
        .whereRaw('LOWER(email) = ?', [normalizeEmail(input.email)])
        .where({ status: 'pending' })
        .orderBy('requested_at', 'desc')
        .orderBy('id', 'desc')
        .first('id');
      if (!request) return null;

      const [updated] = await db.getDb()('registration_requests')
        .where({ id: request.id })
        .update({
          discord_user_id: input.discordUserId,
          updated_at: new Date(),
        })
        .returning(['id', 'email', 'discord_user_id']);
      if (!updated) return null;

      return {
        id: updated.id as string,
        email: updated.email as string,
        discord_user_id: (updated.discord_user_id as string | null) ?? null,
      };
    },
    async updateDiscordUserIdByEmail(email, discordUserId) {
      const [updated] = await db.getDb()('users')
        .whereRaw('LOWER(email) = ?', [normalizeEmail(email)])
        .where('is_active', true)
        .update({
          discord_user_id: discordUserId,
          updated_at: new Date(),
        })
        .returning(['id', 'email', 'discord_user_id']);

      if (!updated) return null;

      return {
        id: updated.id as string,
        email: updated.email as string,
        discord_user_id: (updated.discord_user_id as string | null) ?? null,
      };
    },
  };
}

function resolveLookupIdentifier(input: DiscordUserLookupQuery): { kind: 'id' | 'email' | 'user_key'; value: string } {
  const id = input.id?.trim();
  const email = input.email?.trim();
  const userKey = input.user_key?.trim();
  const provided = [
    id ? { kind: 'id' as const, value: id } : null,
    email ? { kind: 'email' as const, value: email } : null,
    userKey ? { kind: 'user_key' as const, value: userKey } : null,
  ].filter(Boolean) as Array<{ kind: 'id' | 'email' | 'user_key'; value: string }>;

  if (provided.length !== 1) {
    throw new DiscordIntegrationValidationError('Provide exactly one of id, email, or user_key');
  }

  return provided[0]!;
}

export function createDiscordUserIntegrationService(repository: DiscordUserIntegrationRepository) {
  return {
    async listUsers(input: DiscordUsersListQuery): Promise<DiscordIntegrationUsersListData> {
      const page = parsePositiveInt(input.page, 'page', DEFAULT_PAGE);
      const limit = parsePositiveInt(input.limit, 'limit', DEFAULT_LIMIT, MAX_LIMIT);
      const includeInactive = parseIncludeInactive(input.include_inactive);
      const offset = (page - 1) * limit;

      const [total, users] = await Promise.all([
        repository.countUsers(includeInactive),
        repository.listUsers({ includeInactive, offset, limit }),
      ]);

      const userIds = users.map((user) => user.id);
      const [rolesRows, companyRows, branchRows] = await Promise.all([
        repository.listRolesForUsers(userIds),
        repository.listCompaniesForUsers(userIds),
        repository.listBranchesForUsers(userIds),
      ]);

      return {
        users: mapUsers(users, rolesRows, companyRows, branchRows),
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      };
    },
    async lookupUser(input: DiscordUserLookupQuery): Promise<DiscordIntegrationUser> {
      const includeInactive = parseIncludeInactive(input.include_inactive);
      const lookup = resolveLookupIdentifier(input);

      let user: UserRow | null = null;
      if (lookup.kind === 'id') {
        user = await repository.findUserById(lookup.value, includeInactive);
      } else if (lookup.kind === 'email') {
        user = await repository.findUserByEmail(lookup.value, includeInactive);
      } else {
        user = await repository.findUserByUserKey(lookup.value, includeInactive);
      }

      if (!user) {
        throw new DiscordIntegrationNotFoundError('User not found');
      }

      const [rolesRows, companyRows, branchRows] = await Promise.all([
        repository.listRolesForUsers([user.id]),
        repository.listCompaniesForUsers([user.id]),
        repository.listBranchesForUsers([user.id]),
      ]);

      return mapUsers([user], rolesRows, companyRows, branchRows)[0]!;
    },
    async getRegistrationStatus(input: DiscordRegistrationStatusQuery): Promise<DiscordRegistrationStatusData> {
      const email = normalizeRequiredEmail(input.email);
      const registration = await repository.findLatestRegistrationRequestByEmail(email);

      return {
        registration: {
          exists: Boolean(registration),
          status: registration?.status ?? null,
        },
      };
    },
    async setRegistrationDiscordUserId(input: {
      email: string;
      discord_id: string;
    }): Promise<DiscordRegistrationDiscordIdData> {
      const email = normalizeRequiredEmail(input.email);
      const existingUser = await repository.findUserByDiscordUserId(input.discord_id);
      if (existingUser) {
        throw new DiscordIntegrationValidationError('Discord ID is already linked to another user');
      }

      const updated = await repository.updatePendingRegistrationDiscordUserId({
        email,
        discordUserId: input.discord_id,
      });
      if (!updated) {
        throw new DiscordIntegrationNotFoundError('Pending registration request not found for the provided email');
      }

      return {
        registration_request: updated,
      };
    },
    async setDiscordUserId(input: { email: string; discord_id: string }): Promise<{
      id: string;
      email: string;
      discord_user_id: string | null;
    }> {
      const updated = await repository.updateDiscordUserIdByEmail(input.email, input.discord_id);
      if (!updated) {
        throw new DiscordIntegrationNotFoundError('Active user not found for the provided email');
      }
      return updated;
    },
  };
}

export const discordUserIntegrationService = createDiscordUserIntegrationService(createDatabaseRepository());
