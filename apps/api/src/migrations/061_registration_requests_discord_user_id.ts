import type { Knex } from 'knex';

const TABLE_NAME = 'registration_requests';
const COLUMN_NAME = 'discord_user_id';

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) return;

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.string(COLUMN_NAME, 32).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) return;

  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn(COLUMN_NAME);
  });
}
