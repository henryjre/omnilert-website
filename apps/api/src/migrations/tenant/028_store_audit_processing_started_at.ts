import type { Knex } from 'knex';

const STORE_AUDITS_TABLE = 'store_audits';
const PROCESSING_STARTED_AT_COLUMN = 'processing_started_at';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(
    STORE_AUDITS_TABLE,
    PROCESSING_STARTED_AT_COLUMN,
  );
  if (hasColumn) return;

  await knex.schema.alterTable(STORE_AUDITS_TABLE, (table) => {
    table.timestamp(PROCESSING_STARTED_AT_COLUMN).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(
    STORE_AUDITS_TABLE,
    PROCESSING_STARTED_AT_COLUMN,
  );
  if (!hasColumn) return;

  await knex.schema.alterTable(STORE_AUDITS_TABLE, (table) => {
    table.dropColumn(PROCESSING_STARTED_AT_COLUMN);
  });
}
