import type { Knex } from 'knex';

const TABLE = 'users';
const COLUMN = 'user_key';
const INDEX = 'users_user_key_unique';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.uuid(COLUMN).nullable();
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${INDEX}
    ON ${TABLE} (${COLUMN})
    WHERE ${COLUMN} IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP INDEX IF EXISTS ${INDEX}`);

  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn(COLUMN);
    });
  }
}
