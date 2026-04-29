import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('violation_notices', 'source_aic_record_id');
  if (hasColumn) return;

  await knex.schema.alterTable('violation_notices', (t) => {
    t.uuid('source_aic_record_id')
      .nullable()
      .references('id')
      .inTable('aic_records')
      .onDelete('SET NULL');
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('violation_notices', 'source_aic_record_id');
  if (!hasColumn) return;

  await knex.schema.alterTable('violation_notices', (t) => {
    t.dropColumn('source_aic_record_id');
  });
}
