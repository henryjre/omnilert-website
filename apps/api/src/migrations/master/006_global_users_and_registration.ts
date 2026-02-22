import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const PERMISSIONS_TABLE = 'permissions';
const ROLES_TABLE = 'roles';
const ROLE_PERMISSIONS_TABLE = 'role_permissions';
const USER_ROLES_TABLE = 'user_roles';
const USER_COMPANY_ACCESS_TABLE = 'user_company_access';
const USER_COMPANY_BRANCHES_TABLE = 'user_company_branches';
const REFRESH_TOKENS_TABLE = 'refresh_tokens';
const REGISTRATION_REQUESTS_TABLE = 'registration_requests';
const REG_ASSIGN_COMPANIES_TABLE = 'registration_request_company_assignments';
const REG_ASSIGN_BRANCHES_TABLE = 'registration_request_assignment_branches';

const PERMISSION_KEYS = [
  'admin.manage_roles',
  'admin.manage_users',
  'admin.manage_branches',
  'admin.view_all_branches',
  'admin.toggle_branch',
  'dashboard.view',
  'dashboard.view_performance_index',
  'dashboard.view_payslip',
  'pos_verification.view',
  'pos_verification.confirm_reject',
  'pos_verification.upload_image',
  'pos_session.view',
  'pos_session.audit_complete',
  'account.view_schedule',
  'account.view_auth_requests',
  'account.submit_private_auth_request',
  'account.submit_public_auth_request',
  'account.view_cash_requests',
  'account.submit_cash_request',
  'account.view_notifications',
  'employee.view_own_profile',
  'employee.edit_own_profile',
  'employee.view_all_profiles',
  'employee.edit_work_profile',
  'shift.view_all',
  'shift.approve_authorizations',
  'shift.end_shift',
  'auth_request.approve_management',
  'auth_request.view_all',
  'auth_request.approve_service_crew',
  'cash_request.view_all',
  'cash_request.approve',
  'employee_verification.view',
  'registration.approve',
  'personal_information.approve',
  'employee_requirements.approve',
  'bank_information.approve',
] as const;

const SYSTEM_ROLES = {
  ADMINISTRATOR: 'Administrator',
  MANAGEMENT: 'Management',
  SERVICE_CREW: 'Service Crew',
} as const;

function permissionCategory(key: string): string {
  if (key.startsWith('admin.')) return 'admin';
  if (key.startsWith('dashboard.')) return 'dashboard';
  if (key.startsWith('pos_verification.')) return 'pos_verification';
  if (key.startsWith('pos_session.')) return 'pos_session';
  if (key.startsWith('account.')) return 'account';
  if (key.startsWith('employee.')) return 'employee';
  if (key.startsWith('shift.')) return 'shifts';
  if (key.startsWith('auth_request.')) return 'auth_requests';
  if (key.startsWith('cash_request.')) return 'cash_requests';
  if (
    key.startsWith('employee_verification.')
    || key.startsWith('registration.')
    || key.startsWith('personal_information.')
    || key.startsWith('employee_requirements.')
    || key.startsWith('bank_information.')
  ) {
    return 'employee_verifications';
  }
  return 'misc';
}

function permissionName(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function hasConstraint(knex: Knex, tableName: string, constraintName: string): Promise<boolean> {
  const result = await knex
    .select('con.conname')
    .from({ con: 'pg_constraint' })
    .join({ rel: 'pg_class' }, 'rel.oid', 'con.conrelid')
    .join({ nsp: 'pg_namespace' }, 'nsp.oid', 'rel.relnamespace')
    .whereRaw('rel.relname = ?', [tableName])
    .andWhereRaw('nsp.nspname = current_schema()')
    .andWhere('con.conname', constraintName)
    .first();
  return Boolean(result);
}

export async function up(knex: Knex): Promise<void> {
  if (!(await knex.schema.hasTable(USERS_TABLE))) {
    await knex.schema.createTable(USERS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('email', 255).notNullable().unique();
      table.string('password_hash', 255).notNullable();
      table.string('first_name', 100).notNullable();
      table.string('last_name', 100).notNullable();
      table.uuid('user_key').unique();
      table.string('mobile_number', 50).nullable();
      table.string('legal_name', 255).nullable();
      table.date('birthday').nullable();
      table.string('gender', 20).nullable();
      table.string('address', 500).nullable();
      table.string('sss_number', 100).nullable();
      table.string('tin_number', 100).nullable();
      table.string('pagibig_number', 100).nullable();
      table.string('philhealth_number', 100).nullable();
      table.string('marital_status', 50).nullable();
      table.string('avatar_url', 500).nullable();
      table.string('valid_id_url', 500).nullable();
      table.timestamp('valid_id_updated_at').nullable();
      table.string('pin', 50).nullable();
      table.string('emergency_contact', 255).nullable();
      table.string('emergency_phone', 50).nullable();
      table.string('emergency_relationship', 100).nullable();
      table.string('bank_account_number', 255).nullable();
      table.integer('bank_id').nullable();
      table.string('position_title', 255).nullable();
      table.date('date_started').nullable();
      table.integer('employee_number').nullable().unique();
      table.boolean('updated').notNullable().defaultTo(false);
      table.boolean('is_active').notNullable().defaultTo(true);
      table.string('employment_status', 20).notNullable().defaultTo('active');
      table.boolean('push_notifications_enabled').notNullable().defaultTo(true);
      table.timestamp('last_login_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw(`
      ALTER TABLE ${USERS_TABLE}
      ADD CONSTRAINT ${USERS_TABLE}_employment_status_check
      CHECK (employment_status IN ('active', 'resigned', 'inactive'))
    `);
  }

  if (!(await knex.schema.hasTable(PERMISSIONS_TABLE))) {
    await knex.schema.createTable(PERMISSIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('key', 100).notNullable().unique();
      table.string('name', 100).notNullable();
      table.text('description').nullable();
      table.string('category', 50).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(ROLES_TABLE))) {
    await knex.schema.createTable(ROLES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name', 100).notNullable().unique();
      table.text('description').nullable();
      table.string('color', 20).nullable();
      table.boolean('is_system').notNullable().defaultTo(false);
      table.integer('priority').notNullable().defaultTo(0);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable(ROLE_PERMISSIONS_TABLE))) {
    await knex.schema.createTable(ROLE_PERMISSIONS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('role_id').notNullable().references('id').inTable(ROLES_TABLE).onDelete('CASCADE');
      table.uuid('permission_id').notNullable().references('id').inTable(PERMISSIONS_TABLE).onDelete('CASCADE');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['role_id', 'permission_id']);
    });
  }

  if (!(await knex.schema.hasTable(USER_ROLES_TABLE))) {
    await knex.schema.createTable(USER_ROLES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable(USERS_TABLE).onDelete('CASCADE');
      table.uuid('role_id').notNullable().references('id').inTable(ROLES_TABLE).onDelete('CASCADE');
      table.uuid('assigned_by').nullable().references('id').inTable(USERS_TABLE).onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'role_id']);
    });
  }

  if (!(await knex.schema.hasTable(USER_COMPANY_ACCESS_TABLE))) {
    await knex.schema.createTable(USER_COMPANY_ACCESS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable(USERS_TABLE).onDelete('CASCADE');
      table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.boolean('is_active').notNullable().defaultTo(true);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'company_id']);
    });
  }

  if (!(await knex.schema.hasTable(USER_COMPANY_BRANCHES_TABLE))) {
    await knex.schema.createTable(USER_COMPANY_BRANCHES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable(USERS_TABLE).onDelete('CASCADE');
      table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
      table.uuid('branch_id').notNullable();
      table.string('branch_odoo_id', 100).nullable();
      table.string('branch_name', 255).nullable();
      table.string('assignment_type', 20).notNullable(); // resident | borrow
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['user_id', 'company_id', 'branch_id']);
    });
    await knex.raw(`
      ALTER TABLE ${USER_COMPANY_BRANCHES_TABLE}
      ADD CONSTRAINT ${USER_COMPANY_BRANCHES_TABLE}_assignment_type_check
      CHECK (assignment_type IN ('resident', 'borrow'))
    `);
  }

  if (!(await knex.schema.hasTable(REFRESH_TOKENS_TABLE))) {
    await knex.schema.createTable(REFRESH_TOKENS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('user_id').notNullable().references('id').inTable(USERS_TABLE).onDelete('CASCADE');
      table.uuid('company_id').nullable().references('id').inTable('companies').onDelete('SET NULL');
      table.string('company_db_name', 100).nullable();
      table.string('token_hash', 255).notNullable();
      table.timestamp('expires_at').notNullable();
      table.boolean('is_revoked').notNullable().defaultTo(false);
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.index(['user_id']);
      table.index(['company_db_name']);
      table.unique(['token_hash']);
    });
  }

  if (!(await knex.schema.hasTable(REGISTRATION_REQUESTS_TABLE))) {
    await knex.schema.createTable(REGISTRATION_REQUESTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('first_name', 100).notNullable();
      table.string('last_name', 100).notNullable();
      table.string('email', 255).notNullable();
      table.text('encrypted_password').notNullable();
      table.string('status', 20).notNullable().defaultTo('pending');
      table.timestamp('requested_at').notNullable().defaultTo(knex.fn.now());
      table.uuid('reviewed_by').nullable().references('id').inTable(USERS_TABLE).onDelete('SET NULL');
      table.timestamp('reviewed_at').nullable();
      table.text('rejection_reason').nullable();
      table.jsonb('approved_role_ids').nullable();
      table.uuid('approved_user_id').nullable().references('id').inTable(USERS_TABLE).onDelete('SET NULL');
      table.uuid('resident_company_id').nullable().references('id').inTable('companies').onDelete('SET NULL');
      table.uuid('resident_branch_id').nullable();
      table.string('resident_branch_name', 255).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });

    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS registration_requests_pending_email_unique
      ON ${REGISTRATION_REQUESTS_TABLE} (LOWER(email))
      WHERE status = 'pending'
    `);
  }

  if (!(await knex.schema.hasTable(REG_ASSIGN_COMPANIES_TABLE))) {
    await knex.schema.createTable(REG_ASSIGN_COMPANIES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('registration_request_id').notNullable();
      table.uuid('company_id').notNullable();
      table.string('company_name', 255).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.foreign('registration_request_id', 'rrca_registration_request_fk')
        .references('id')
        .inTable(REGISTRATION_REQUESTS_TABLE)
        .onDelete('CASCADE');
      table.foreign('company_id', 'rrca_company_fk')
        .references('id')
        .inTable('companies')
        .onDelete('CASCADE');
      table.unique(['registration_request_id', 'company_id'], 'rrca_registration_company_unique');
    });
  } else {
    // Cleanup legacy truncated auto-generated constraint name from prior migration attempts.
    if (await hasConstraint(knex, REG_ASSIGN_COMPANIES_TABLE, 'registration_request_company_assignments_registration_request_i')) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_COMPANIES_TABLE}
        DROP CONSTRAINT registration_request_company_assignments_registration_request_i
      `);
    }

    if (!(await hasConstraint(knex, REG_ASSIGN_COMPANIES_TABLE, 'rrca_registration_request_fk'))) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_COMPANIES_TABLE}
        ADD CONSTRAINT rrca_registration_request_fk
        FOREIGN KEY (registration_request_id)
        REFERENCES ${REGISTRATION_REQUESTS_TABLE}(id)
        ON DELETE CASCADE
      `);
    }
    if (!(await hasConstraint(knex, REG_ASSIGN_COMPANIES_TABLE, 'rrca_company_fk'))) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_COMPANIES_TABLE}
        ADD CONSTRAINT rrca_company_fk
        FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE CASCADE
      `);
    }
    if (!(await hasConstraint(knex, REG_ASSIGN_COMPANIES_TABLE, 'rrca_registration_company_unique'))) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_COMPANIES_TABLE}
        ADD CONSTRAINT rrca_registration_company_unique
        UNIQUE (registration_request_id, company_id)
      `);
    }
  }

  if (!(await knex.schema.hasTable(REG_ASSIGN_BRANCHES_TABLE))) {
    await knex.schema.createTable(REG_ASSIGN_BRANCHES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('registration_request_company_assignment_id').notNullable();
      table.uuid('branch_id').notNullable();
      table.string('branch_name', 255).nullable();
      table.string('branch_odoo_id', 100).nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.foreign('registration_request_company_assignment_id', 'rrab_company_assignment_fk')
        .references('id')
        .inTable(REG_ASSIGN_COMPANIES_TABLE)
        .onDelete('CASCADE');
      table.unique(
        ['registration_request_company_assignment_id', 'branch_id'],
        'rrab_assignment_branch_unique',
      );
    });
  } else {
    // Cleanup legacy truncated auto-generated constraint name from prior migration attempts.
    if (await hasConstraint(knex, REG_ASSIGN_BRANCHES_TABLE, 'registration_request_assignment_branches_registration_request_c')) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_BRANCHES_TABLE}
        DROP CONSTRAINT registration_request_assignment_branches_registration_request_c
      `);
    }

    if (!(await hasConstraint(knex, REG_ASSIGN_BRANCHES_TABLE, 'rrab_company_assignment_fk'))) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_BRANCHES_TABLE}
        ADD CONSTRAINT rrab_company_assignment_fk
        FOREIGN KEY (registration_request_company_assignment_id)
        REFERENCES ${REG_ASSIGN_COMPANIES_TABLE}(id)
        ON DELETE CASCADE
      `);
    }
    if (!(await hasConstraint(knex, REG_ASSIGN_BRANCHES_TABLE, 'rrab_assignment_branch_unique'))) {
      await knex.raw(`
        ALTER TABLE ${REG_ASSIGN_BRANCHES_TABLE}
        ADD CONSTRAINT rrab_assignment_branch_unique
        UNIQUE (registration_request_company_assignment_id, branch_id)
      `);
    }
  }

  const existingPermissions = await knex(PERMISSIONS_TABLE).select('id', 'key');
  const existingPermissionKeys = new Set(existingPermissions.map((row: any) => row.key as string));

  const permissionRows = PERMISSION_KEYS
    .filter((key) => !existingPermissionKeys.has(key))
    .map((key) => ({
      key,
      name: permissionName(key),
      description: `Permission: ${key}`,
      category: permissionCategory(key),
    }));

  if (permissionRows.length > 0) {
    await knex(PERMISSIONS_TABLE).insert(permissionRows);
  }

  const roleSeed = [
    {
      name: SYSTEM_ROLES.ADMINISTRATOR,
      description: 'System role: Administrator',
      color: '#e74c3c',
      is_system: true,
      priority: 100,
    },
    {
      name: SYSTEM_ROLES.MANAGEMENT,
      description: 'System role: Management',
      color: '#3498db',
      is_system: true,
      priority: 50,
    },
    {
      name: SYSTEM_ROLES.SERVICE_CREW,
      description: 'System role: Service Crew',
      color: '#2ecc71',
      is_system: true,
      priority: 10,
    },
  ];

  for (const role of roleSeed) {
    const existing = await knex(ROLES_TABLE).where({ name: role.name }).first('id');
    if (!existing) {
      await knex(ROLES_TABLE).insert(role);
    }
  }

  const allPermissions = await knex(PERMISSIONS_TABLE).select('id', 'key');
  const permMap = new Map(allPermissions.map((perm: any) => [perm.key as string, perm.id as string]));
  const roles = await knex(ROLES_TABLE).select('id', 'name');
  const roleMap = new Map(roles.map((role: any) => [role.name as string, role.id as string]));

  const managementPermissions = PERMISSION_KEYS.filter(
    (key) => key !== 'admin.manage_roles' && key !== 'admin.manage_users',
  );
  const serviceCrewPermissions = [
    'dashboard.view',
    'dashboard.view_payslip',
    'dashboard.view_performance_index',
    'pos_verification.view',
    'pos_verification.confirm_reject',
    'pos_verification.upload_image',
    'pos_session.view',
    'account.view_schedule',
    'account.view_auth_requests',
    'account.submit_public_auth_request',
    'account.view_cash_requests',
    'account.submit_cash_request',
    'account.view_notifications',
    'employee.view_own_profile',
    'employee.edit_own_profile',
  ];

  const rolePermissionSeed: Array<{ roleName: string; permissionKeys: string[] }> = [
    { roleName: SYSTEM_ROLES.ADMINISTRATOR, permissionKeys: [...PERMISSION_KEYS] },
    { roleName: SYSTEM_ROLES.MANAGEMENT, permissionKeys: managementPermissions },
    { roleName: SYSTEM_ROLES.SERVICE_CREW, permissionKeys: serviceCrewPermissions },
  ];

  for (const seed of rolePermissionSeed) {
    const roleId = roleMap.get(seed.roleName);
    if (!roleId) continue;
    for (const permissionKey of seed.permissionKeys) {
      const permissionId = permMap.get(permissionKey);
      if (!permissionId) continue;
      const existing = await knex(ROLE_PERMISSIONS_TABLE)
        .where({ role_id: roleId, permission_id: permissionId })
        .first('id');
      if (!existing) {
        await knex(ROLE_PERMISSIONS_TABLE).insert({
          role_id: roleId,
          permission_id: permissionId,
        });
      }
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(REG_ASSIGN_BRANCHES_TABLE);
  await knex.schema.dropTableIfExists(REG_ASSIGN_COMPANIES_TABLE);
  await knex.schema.dropTableIfExists(REGISTRATION_REQUESTS_TABLE);
  await knex.schema.dropTableIfExists(REFRESH_TOKENS_TABLE);
  await knex.schema.dropTableIfExists(USER_COMPANY_BRANCHES_TABLE);
  await knex.schema.dropTableIfExists(USER_COMPANY_ACCESS_TABLE);
  await knex.schema.dropTableIfExists(USER_ROLES_TABLE);
  await knex.schema.dropTableIfExists(ROLE_PERMISSIONS_TABLE);
  await knex.schema.dropTableIfExists(ROLES_TABLE);
  await knex.schema.dropTableIfExists(PERMISSIONS_TABLE);
  await knex.schema.dropTableIfExists(USERS_TABLE);
}
