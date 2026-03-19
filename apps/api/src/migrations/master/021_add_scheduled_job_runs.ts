import type { Knex } from 'knex';

const TABLE_NAME = 'scheduled_job_runs';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (hasTable) return;

  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('job_name', 120).notNullable();
    table.string('scheduled_for_key', 32).notNullable();
    table.timestamp('scheduled_for_manila', { useTz: false }).notNullable();
    table.string('status', 20).notNullable();
    table.integer('attempt_count').notNullable().defaultTo(1);
    table.timestamp('started_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('finished_at', { useTz: true }).nullable();
    table.text('error_message').nullable();
    table.timestamps(true, true);

    table.unique(['job_name', 'scheduled_for_key']);
    table.index(['job_name', 'status']);
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable(TABLE_NAME);
  if (!hasTable) return;

  await knex.schema.dropTable(TABLE_NAME);
}
