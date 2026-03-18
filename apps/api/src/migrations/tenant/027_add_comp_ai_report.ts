import type { Knex } from 'knex';

const STORE_AUDITS_TABLE = 'store_audits';
const COMP_AI_REPORT_COLUMN = 'comp_ai_report';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(STORE_AUDITS_TABLE, COMP_AI_REPORT_COLUMN);
  if (hasColumn) return;

  await knex.schema.alterTable(STORE_AUDITS_TABLE, (table) => {
    table.text(COMP_AI_REPORT_COLUMN).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(STORE_AUDITS_TABLE, COMP_AI_REPORT_COLUMN);
  if (!hasColumn) return;

  await knex.schema.alterTable(STORE_AUDITS_TABLE, (table) => {
    table.dropColumn(COMP_AI_REPORT_COLUMN);
  });
}
