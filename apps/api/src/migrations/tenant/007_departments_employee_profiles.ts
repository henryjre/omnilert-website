import type { Knex } from 'knex';
import { PERMISSIONS } from '@omnilert/shared';

const USERS_TABLE = 'users';
const DEPARTMENTS_TABLE = 'departments';
const DEPARTMENTS_NAME_CI_INDEX = 'departments_name_ci_unique';
const USERS_DEPARTMENT_FK = 'users_department_id_foreign';

function permissionLabelFromKey(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function addColumnIfMissing(
  knex: Knex,
  table: string,
  column: string,
  alter: (tableBuilder: Knex.AlterTableBuilder) => void,
): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(table, column);
  if (!hasColumn) {
    await knex.schema.alterTable(table, alter);
  }
}

export async function up(knex: Knex): Promise<void> {
  await addColumnIfMissing(knex, USERS_TABLE, 'address', (table) => {
    table.string('address', 500).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'sss_number', (table) => {
    table.string('sss_number', 100).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'pagibig_number', (table) => {
    table.string('pagibig_number', 100).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'philhealth_number', (table) => {
    table.string('philhealth_number', 100).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'department_id', (table) => {
    table.uuid('department_id').nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'position_title', (table) => {
    table.string('position_title', 255).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'date_started', (table) => {
    table.date('date_started').nullable();
  });

  if (!(await knex.schema.hasTable(DEPARTMENTS_TABLE))) {
    await knex.schema.createTable(DEPARTMENTS_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('name', 255).notNullable().unique();
      table.uuid('head_user_id').nullable().references('id').inTable(USERS_TABLE).onDelete('SET NULL');
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${DEPARTMENTS_NAME_CI_INDEX}
    ON ${DEPARTMENTS_TABLE} (LOWER(name))
  `);

  const hasDepartmentFk = await knex
    .raw(
      `
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      LIMIT 1
      `,
      [USERS_TABLE, USERS_DEPARTMENT_FK],
    )
    .then((r) => (r.rows?.length ?? 0) > 0);

  if (!hasDepartmentFk) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table
        .foreign('department_id', USERS_DEPARTMENT_FK)
        .references('id')
        .inTable(DEPARTMENTS_TABLE)
        .onDelete('SET NULL');
    });
  }

  const permissionKeys = [
    PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES,
    PERMISSIONS.EMPLOYEE_EDIT_WORK_PROFILE,
  ];
  const permissionRows = permissionKeys.map((key) => ({
    key,
    name: permissionLabelFromKey(key),
    description: `Permission: ${key}`,
    category: 'employee',
  }));

  await knex('permissions').insert(permissionRows).onConflict('key').merge({
    name: knex.raw('excluded.name'),
    description: knex.raw('excluded.description'),
    category: knex.raw('excluded.category'),
  });

  const roles = await knex('roles')
    .whereIn('name', ['Administrator', 'Management'])
    .select('id');
  const permissions = await knex('permissions')
    .whereIn('key', permissionKeys)
    .select('id');

  const rolePermissionRows: Array<{ role_id: string; permission_id: string }> = [];
  for (const role of roles) {
    for (const permission of permissions) {
      rolePermissionRows.push({ role_id: role.id as string, permission_id: permission.id as string });
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
  const permissionKeys = [
    PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES,
    PERMISSIONS.EMPLOYEE_EDIT_WORK_PROFILE,
  ];
  const permissionIds = await knex('permissions').whereIn('key', permissionKeys).select('id');
  if (permissionIds.length > 0) {
    await knex('role_permissions')
      .whereIn(
        'permission_id',
        permissionIds.map((p: { id: string }) => p.id),
      )
      .delete();
    await knex('permissions').whereIn('key', permissionKeys).delete();
  }

  const hasDepartmentFk = await knex
    .raw(
      `
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_name = ?
        AND constraint_name = ?
        AND constraint_type = 'FOREIGN KEY'
      LIMIT 1
      `,
      [USERS_TABLE, USERS_DEPARTMENT_FK],
    )
    .then((r) => (r.rows?.length ?? 0) > 0);

  if (hasDepartmentFk) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropForeign(['department_id'], USERS_DEPARTMENT_FK);
    });
  }

  await knex.raw(`DROP INDEX IF EXISTS ${DEPARTMENTS_NAME_CI_INDEX}`);
  if (await knex.schema.hasTable(DEPARTMENTS_TABLE)) {
    await knex.schema.dropTable(DEPARTMENTS_TABLE);
  }

  if (await knex.schema.hasColumn(USERS_TABLE, 'date_started')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('date_started');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'position_title')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('position_title');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'department_id')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('department_id');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'philhealth_number')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('philhealth_number');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'pagibig_number')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('pagibig_number');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'sss_number')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('sss_number');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'address')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('address');
    });
  }
}
