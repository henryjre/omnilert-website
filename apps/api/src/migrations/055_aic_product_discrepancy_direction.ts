import type { Knex } from 'knex';

const TABLE_NAME = 'aic_products';
const COLUMN_NAME = 'discrepancy_direction';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.text(COLUMN_NAME).notNullable().defaultTo('neutral');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasColumn) return;

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn(COLUMN_NAME);
  });
}
