import type { Knex } from 'knex';

const TABLE_NAME = 'aic_tasks';
const COLUMN_NAME = 'discussion_message_id';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.uuid(COLUMN_NAME).nullable().references('id').inTable('aic_messages').onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn(COLUMN_NAME);
  });
}
