import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('case_report_task_messages', (t) => {
    t.text('content').nullable().alter();
    t.text('file_url').nullable();
    t.string('file_name', 255).nullable();
    t.integer('file_size').nullable();
    t.string('content_type', 100).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('case_report_task_messages', (t) => {
    t.dropColumn('file_url');
    t.dropColumn('file_name');
    t.dropColumn('file_size');
    t.dropColumn('content_type');
    t.text('content').notNullable().alter();
  });
}
