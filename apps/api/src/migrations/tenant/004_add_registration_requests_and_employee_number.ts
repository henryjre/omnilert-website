import type { Knex } from 'knex';
import { PERMISSIONS } from '@omnilert/shared';

const USERS_TABLE = 'users';
const EMPLOYEE_NUMBER_COLUMN = 'employee_number';
const REGISTRATION_REQUESTS_TABLE = 'registration_requests';
const PENDING_EMAIL_INDEX = 'registration_requests_pending_email_unique';
const LEGACY_REGISTRATION_VIEW = 'registration.view';

export async function up(knex: Knex): Promise<void> {
  const hasEmployeeNumber = await knex.schema.hasColumn(USERS_TABLE, EMPLOYEE_NUMBER_COLUMN);
  if (!hasEmployeeNumber) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.integer(EMPLOYEE_NUMBER_COLUMN).nullable();
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
      table.uuid('reviewed_by').nullable();
      table.timestamp('reviewed_at').nullable();
      table.text('rejection_reason').nullable();
      table.jsonb('approved_role_ids').nullable();
      table.jsonb('approved_branch_ids').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${PENDING_EMAIL_INDEX}
    ON ${REGISTRATION_REQUESTS_TABLE} (email)
    WHERE status = 'pending'
  `);

  const permissionRows = [
    {
      key: LEGACY_REGISTRATION_VIEW,
      name: 'View',
      description: `Permission: ${LEGACY_REGISTRATION_VIEW}`,
      category: 'registration',
    },
    {
      key: PERMISSIONS.REGISTRATION_APPROVE,
      name: 'Approve',
      description: `Permission: ${PERMISSIONS.REGISTRATION_APPROVE}`,
      category: 'registration',
    },
  ];

  await knex('permissions')
    .insert(permissionRows)
    .onConflict('key')
    .ignore();

  const permissions = await knex('permissions')
    .select('id', 'key')
    .whereIn('key', [LEGACY_REGISTRATION_VIEW, PERMISSIONS.REGISTRATION_APPROVE]);
  const permMap = new Map(permissions.map((p: { id: string; key: string }) => [p.key, p.id]));

  const roles = await knex('roles')
    .whereIn('name', ['Administrator', 'Management'])
    .select('id');

  const rolePermissionRows: Array<{ role_id: string; permission_id: string }> = [];
  for (const role of roles) {
    for (const key of [LEGACY_REGISTRATION_VIEW, PERMISSIONS.REGISTRATION_APPROVE]) {
      const permissionId = permMap.get(key);
      if (permissionId) {
        rolePermissionRows.push({
          role_id: role.id,
          permission_id: permissionId,
        });
      }
    }
  }

  if (rolePermissionRows.length > 0) {
    await knex('role_permissions')
      .insert(rolePermissionRows)
      .onConflict(['role_id', 'permission_id'])
      .ignore();
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${PENDING_EMAIL_INDEX}`);

  if (await knex.schema.hasTable(REGISTRATION_REQUESTS_TABLE)) {
    await knex.schema.dropTable(REGISTRATION_REQUESTS_TABLE);
  }

  const hasEmployeeNumber = await knex.schema.hasColumn(USERS_TABLE, EMPLOYEE_NUMBER_COLUMN);
  if (hasEmployeeNumber) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn(EMPLOYEE_NUMBER_COLUMN);
    });
  }

  const permissionKeys = [LEGACY_REGISTRATION_VIEW, PERMISSIONS.REGISTRATION_APPROVE];
  const permissionIds = await knex('permissions')
    .whereIn('key', permissionKeys)
    .select('id');
  if (permissionIds.length > 0) {
    await knex('role_permissions')
      .whereIn(
        'permission_id',
        permissionIds.map((p: { id: string }) => p.id),
      )
      .delete();
  }

  await knex('permissions').whereIn('key', permissionKeys).delete();
}
