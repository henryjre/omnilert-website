import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.table('case_reports', (t) => {
    t.text('summary').nullable().defaultTo(null);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.table('case_reports', (t) => {
    t.dropColumn('summary');
  });
}
