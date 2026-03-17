import type { Knex } from 'knex';

const TABLE = 'violation_notices';
const COLUMN = 'epi_decrease';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (!hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.decimal(COLUMN, 3, 1).nullable().defaultTo(null);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE);
  if (!hasTable) return;

  const hasColumn = await knex.schema.hasColumn(TABLE, COLUMN);
  if (hasColumn) {
    await knex.schema.alterTable(TABLE, (table) => {
      table.dropColumn(COLUMN);
    });
  }
}
