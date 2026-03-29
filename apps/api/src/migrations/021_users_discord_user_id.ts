import type { Knex } from 'knex';

const TABLE_NAME = 'users';
const COLUMN_NAME = 'discord_user_id';
const UNIQUE_INDEX_NAME = 'users_discord_user_id_unique';

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.string(COLUMN_NAME, 32).nullable();
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${UNIQUE_INDEX_NAME}
    ON ${TABLE_NAME} (${COLUMN_NAME})
    WHERE ${COLUMN_NAME} IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  await knex.raw(`DROP INDEX IF EXISTS ${UNIQUE_INDEX_NAME}`);

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      table.dropColumn(COLUMN_NAME);
    });
  }
}
