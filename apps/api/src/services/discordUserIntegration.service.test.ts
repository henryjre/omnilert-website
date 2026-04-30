import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const {
  createDiscordUserIntegrationService,
  DiscordIntegrationValidationError,
  DiscordIntegrationNotFoundError,
} = await import('./discordUserIntegration.service.js');

test('discord integration role query aliases roles.discord_id as discord_role_id', () => {
  const source = readFileSync(new URL('./discordUserIntegration.service.ts', import.meta.url), 'utf8');
  assert.match(source, /'roles\.discord_id as discord_role_id'/);
  assert.doesNotMatch(source, /'roles\.discord_role_id'/);
});

type FakeUserRow = {
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
};

type FakeRegistrationRow = {
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  id: string;
  discord_user_id: string | null;
};

const USERS: FakeUserRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    user_key: '11111111-1111-1111-1111-111111111111',
    discord_user_id: null,
    email: 'active@example.com',
    first_name: 'Active',
    last_name: 'User',
    employee_number: 101,
    avatar_url: null,
    is_active: true,
    last_login_at: '2026-03-29T12:00:00.000Z',
    created_at: '2026-03-29T12:00:00.000Z',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    user_key: '22222222-2222-2222-2222-222222222222',
    discord_user_id: null,
    email: 'inactive@example.com',
    first_name: 'Inactive',
    last_name: 'User',
    employee_number: 102,
    avatar_url: null,
    is_active: false,
    last_login_at: null,
    created_at: '2026-03-28T12:00:00.000Z',
  },
];

const ROLE_ROWS = [
  { user_id: USERS[0]!.id, id: 'role-1', name: 'Admin', color: '#111', discord_role_id: '123456789012345678' },
  { user_id: USERS[1]!.id, id: 'role-2', name: 'Manager', color: '#222', discord_role_id: null },
];

const COMPANY_ROWS = [
  {
    user_id: USERS[0]!.id,
    company_id: 'company-1',
    company_name: 'Omnilert Corp',
    company_slug: 'omnilert',
  },
];

const BRANCH_ROWS = [
  {
    user_id: USERS[0]!.id,
    company_id: 'company-1',
    company_name: 'Omnilert Corp',
    branch_id: 'branch-1',
    branch_name: 'Main',
    assignment_type: 'resident',
  },
];

const REGISTRATION_ROWS: FakeRegistrationRow[] = [
  {
    email: 'pending@example.com',
    status: 'pending',
    requested_at: '2026-03-30T12:00:00.000Z',
    id: 'registration-1',
    discord_user_id: null,
  },
  {
    email: 'approved@example.com',
    status: 'approved',
    requested_at: '2026-03-30T12:00:00.000Z',
    id: 'registration-2',
    discord_user_id: null,
  },
  {
    email: 'rejected@example.com',
    status: 'rejected',
    requested_at: '2026-03-30T12:00:00.000Z',
    id: 'registration-3',
    discord_user_id: null,
  },
  {
    email: 'pending@example.com',
    status: 'rejected',
    requested_at: '2026-03-29T12:00:00.000Z',
    id: 'registration-4',
    discord_user_id: null,
  },
];

function sortRows(rows: FakeUserRow[]): FakeUserRow[] {
  return [...rows].sort((a, b) => {
    const byCreatedAt = b.created_at.localeCompare(a.created_at);
    if (byCreatedAt !== 0) return byCreatedAt;
    return b.id.localeCompare(a.id);
  });
}

function createService() {
  const repository = {
    async countUsers(includeInactive: boolean) {
      return USERS.filter((user) => includeInactive || user.is_active).length;
    },
    async listUsers(input: { includeInactive: boolean; offset: number; limit: number }) {
      const filtered = sortRows(USERS).filter((user) => input.includeInactive || user.is_active);
      return filtered.slice(input.offset, input.offset + input.limit);
    },
    async listRolesForUsers(userIds: string[]) {
      const set = new Set(userIds);
      return ROLE_ROWS.filter((row) => set.has(row.user_id));
    },
    async listCompaniesForUsers(userIds: string[]) {
      const set = new Set(userIds);
      return COMPANY_ROWS.filter((row) => set.has(row.user_id));
    },
    async listBranchesForUsers(userIds: string[]) {
      const set = new Set(userIds);
      return BRANCH_ROWS.filter((row) => set.has(row.user_id));
    },
    async findUserById(id: string, includeInactive: boolean) {
      return USERS.find((user) => user.id === id && (includeInactive || user.is_active)) ?? null;
    },
    async findUserByEmail(email: string, includeInactive: boolean) {
      const normalized = email.trim().toLowerCase();
      return USERS.find((user) => user.email.toLowerCase() === normalized && (includeInactive || user.is_active)) ?? null;
    },
    async findUserByUserKey(userKey: string, includeInactive: boolean) {
      return USERS.find((user) => user.user_key === userKey && (includeInactive || user.is_active)) ?? null;
    },
    async findUserByDiscordUserId(discordUserId: string) {
      const user = USERS.find((row) => row.discord_user_id === discordUserId) ?? null;
      if (!user) return null;
      return {
        id: user.id,
        email: user.email,
      };
    },
    async findLatestRegistrationRequestByEmail(email: string) {
      const normalized = email.trim().toLowerCase();
      const row = [...REGISTRATION_ROWS]
        .filter((row) => row.email.toLowerCase() === normalized)
        .sort((a, b) => {
          const byRequestedAt = b.requested_at.localeCompare(a.requested_at);
          if (byRequestedAt !== 0) return byRequestedAt;
          return b.id.localeCompare(a.id);
        })[0];
      return row ? { status: row.status } : null;
    },
    async updatePendingRegistrationDiscordUserId(input: { email: string; discordUserId: string }) {
      const normalized = input.email.trim().toLowerCase();
      const row = [...REGISTRATION_ROWS]
        .filter((item) => item.email.toLowerCase() === normalized && item.status === 'pending')
        .sort((a, b) => {
          const byRequestedAt = b.requested_at.localeCompare(a.requested_at);
          if (byRequestedAt !== 0) return byRequestedAt;
          return b.id.localeCompare(a.id);
        })[0] ?? null;
      if (!row) return null;

      row.discord_user_id = input.discordUserId;
      return {
        id: row.id,
        email: row.email,
        discord_user_id: row.discord_user_id,
      };
    },
    async updateDiscordUserIdByEmail(email: string, discordUserId: string) {
      const normalized = email.trim().toLowerCase();
      const user = USERS.find((row) => row.email.toLowerCase() === normalized && row.is_active) ?? null;
      if (!user) return null;
      user.discord_user_id = discordUserId;
      return {
        id: user.id,
        email: user.email,
        discord_user_id: user.discord_user_id ?? null,
      };
    },
  };

  return createDiscordUserIntegrationService(repository);
}

test('listUsers returns active users by default with standard pagination envelope', async () => {
  const service = createService();
  const result = await service.listUsers({});

  assert.equal(result.users.length, 1);
  assert.equal(result.users[0]?.email, 'active@example.com');
  assert.deepEqual(result.users[0]?.roles, [
    {
      id: 'role-1',
      name: 'Admin',
      color: '#111',
      discord_role_id: '123456789012345678',
    },
  ]);
  assert.deepEqual(result.pagination, {
    page: 1,
    limit: 50,
    total: 1,
    total_pages: 1,
  });
});

test('listUsers includes inactive users when include_inactive is true', async () => {
  const service = createService();
  const result = await service.listUsers({ include_inactive: true, page: 1, limit: 50 });

  assert.equal(result.users.length, 2);
});

test('listUsers throws validation error for invalid page', async () => {
  const service = createService();

  await assert.rejects(
    () => service.listUsers({ page: 0 }),
    (error: unknown) => error instanceof DiscordIntegrationValidationError,
  );
});

test('listUsers throws validation error when limit is greater than 100', async () => {
  const service = createService();

  await assert.rejects(
    () => service.listUsers({ limit: 101 }),
    (error: unknown) => error instanceof DiscordIntegrationValidationError,
  );
});

test('lookupUser supports case-insensitive email lookup', async () => {
  const service = createService();
  const user = await service.lookupUser({ email: 'ACTIVE@EXAMPLE.COM' });

  assert.equal(user.id, USERS[0]!.id);
  assert.equal(user.email, 'active@example.com');
});

test('lookupUser supports user_key lookup', async () => {
  const service = createService();
  const user = await service.lookupUser({ user_key: USERS[0]!.user_key as string });

  assert.equal(user.id, USERS[0]!.id);
});

test('lookupUser throws validation error when no identifier is provided', async () => {
  const service = createService();

  await assert.rejects(
    () => service.lookupUser({}),
    (error: unknown) => error instanceof DiscordIntegrationValidationError,
  );
});

test('lookupUser throws validation error when multiple identifiers are provided', async () => {
  const service = createService();

  await assert.rejects(
    () => service.lookupUser({ id: USERS[0]!.id, email: USERS[0]!.email }),
    (error: unknown) => error instanceof DiscordIntegrationValidationError,
  );
});

test('lookupUser returns not found for inactive user by default', async () => {
  const service = createService();

  await assert.rejects(
    () => service.lookupUser({ id: USERS[1]!.id }),
    (error: unknown) => error instanceof DiscordIntegrationNotFoundError,
  );
});

test('lookupUser can include inactive users', async () => {
  const service = createService();
  const user = await service.lookupUser({ id: USERS[1]!.id, include_inactive: true });

  assert.equal(user.id, USERS[1]!.id);
  assert.equal(user.is_active, false);
});

test('getRegistrationStatus returns latest registration status by email', async () => {
  const service = createService();

  assert.deepEqual(await service.getRegistrationStatus({ email: 'PENDING@EXAMPLE.COM' }), {
    registration: {
      exists: true,
      status: 'pending',
    },
  });
});

test('getRegistrationStatus returns approved and rejected statuses', async () => {
  const service = createService();

  assert.deepEqual(await service.getRegistrationStatus({ email: 'approved@example.com' }), {
    registration: {
      exists: true,
      status: 'approved',
    },
  });
  assert.deepEqual(await service.getRegistrationStatus({ email: 'rejected@example.com' }), {
    registration: {
      exists: true,
      status: 'rejected',
    },
  });
});

test('getRegistrationStatus returns empty status when no request exists', async () => {
  const service = createService();

  assert.deepEqual(await service.getRegistrationStatus({ email: 'missing@example.com' }), {
    registration: {
      exists: false,
      status: null,
    },
  });
});

test('getRegistrationStatus throws validation error when email is missing', async () => {
  const service = createService();

  await assert.rejects(
    () => service.getRegistrationStatus({}),
    (error: unknown) => error instanceof DiscordIntegrationValidationError,
  );
});

test('setRegistrationDiscordUserId links discord id to the latest pending registration', async () => {
  const service = createService();
  const result = await service.setRegistrationDiscordUserId({
    email: 'PENDING@EXAMPLE.COM',
    discord_id: '123456789012345678',
  });

  assert.deepEqual(result, {
    registration_request: {
      id: 'registration-1',
      email: 'pending@example.com',
      discord_user_id: '123456789012345678',
    },
  });
});

test('setRegistrationDiscordUserId rejects discord id already linked to a user', async () => {
  const service = createService();
  USERS[0]!.discord_user_id = '123456789012345678';

  await assert.rejects(
    () => service.setRegistrationDiscordUserId({
      email: 'pending@example.com',
      discord_id: '123456789012345678',
    }),
    (error: unknown) => error instanceof DiscordIntegrationValidationError,
  );

  USERS[0]!.discord_user_id = null;
});

test('setRegistrationDiscordUserId throws not found when no pending registration exists', async () => {
  const service = createService();

  await assert.rejects(
    () => service.setRegistrationDiscordUserId({
      email: 'approved@example.com',
      discord_id: '123456789012345678',
    }),
    (error: unknown) => error instanceof DiscordIntegrationNotFoundError,
  );
});

test('setDiscordUserId updates discord id by email and returns updated user summary', async () => {
  const service = createService();
  const updated = await service.setDiscordUserId({
    email: 'ACTIVE@EXAMPLE.COM',
    discord_id: '1484847611604373564',
  });

  assert.deepEqual(updated, {
    id: USERS[0]!.id,
    email: USERS[0]!.email,
    discord_user_id: '1484847611604373564',
  });
});

test('setDiscordUserId throws not found when active user email does not exist', async () => {
  const service = createService();

  await assert.rejects(
    () => service.setDiscordUserId({
      email: 'missing@example.com',
      discord_id: '748568303219245117',
    }),
    (error: unknown) => error instanceof DiscordIntegrationNotFoundError,
  );
});
