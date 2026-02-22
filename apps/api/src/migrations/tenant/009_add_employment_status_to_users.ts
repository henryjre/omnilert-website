import type { Knex } from 'knex';

const USERS_TABLE = 'users';
const STATUS_COLUMN = 'employment_status';
const STATUS_CHECK_CONSTRAINT = 'users_employment_status_check';
const STATUS_INDEX = 'users_employment_status_idx';

async function hasConstraint(knex: Knex, tableName: string, constraintName: string): Promise<boolean> {
  const result = await knex
    .raw(
      `
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_name = ?
        AND constraint_name = ?
      LIMIT 1
      `,
      [tableName, constraintName],
    );
  return (result.rows?.length ?? 0) > 0;
}

export async function up(knex: Knex): Promise<void> {
  const columnExists = await knex.schema.hasColumn(USERS_TABLE, STATUS_COLUMN);
  if (!columnExists) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.string(STATUS_COLUMN, 20).nullable();
    });
  }

  await knex(USERS_TABLE)
    .whereNull(STATUS_COLUMN)
    .update({
      [STATUS_COLUMN]: knex.raw(`CASE WHEN is_active THEN 'active' ELSE 'inactive' END`),
    });

  await knex.raw(`ALTER TABLE ${USERS_TABLE} ALTER COLUMN ${STATUS_COLUMN} SET DEFAULT 'active'`);
  await knex.raw(`ALTER TABLE ${USERS_TABLE} ALTER COLUMN ${STATUS_COLUMN} SET NOT NULL`);

  if (!(await hasConstraint(knex, USERS_TABLE, STATUS_CHECK_CONSTRAINT))) {
    await knex.raw(`
      ALTER TABLE ${USERS_TABLE}
      ADD CONSTRAINT ${STATUS_CHECK_CONSTRAINT}
      CHECK (${STATUS_COLUMN} IN ('active', 'resigned', 'inactive'))
    `);
  }

  await knex.raw(`CREATE INDEX IF NOT EXISTS ${STATUS_INDEX} ON ${USERS_TABLE} (${STATUS_COLUMN})`);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${STATUS_INDEX}`);

  if (await hasConstraint(knex, USERS_TABLE, STATUS_CHECK_CONSTRAINT)) {
    await knex.raw(`ALTER TABLE ${USERS_TABLE} DROP CONSTRAINT ${STATUS_CHECK_CONSTRAINT}`);
  }

  if (await knex.schema.hasColumn(USERS_TABLE, STATUS_COLUMN)) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn(STATUS_COLUMN);
    });
  }
}

