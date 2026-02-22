import type { Knex } from 'knex';

const USERS_TABLE = 'users';

export async function up(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasDepartmentId = await knex.schema.hasColumn(USERS_TABLE, 'department_id');
  if (!hasDepartmentId) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.uuid('department_id').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasUsersTable = await knex.schema.hasTable(USERS_TABLE);
  if (!hasUsersTable) return;

  const hasDepartmentId = await knex.schema.hasColumn(USERS_TABLE, 'department_id');
  if (hasDepartmentId) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('department_id');
    });
  }
}

