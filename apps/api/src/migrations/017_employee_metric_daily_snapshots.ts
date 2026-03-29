import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('employee_metric_daily_snapshots', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');

    table.date('snapshot_date').notNullable();
    table.date('window_start_date').notNullable();
    table.date('window_end_date').notNullable();

    table.decimal('customer_service_score', 3, 2).nullable();
    table.decimal('workplace_relations_score', 3, 2).nullable();
    table.decimal('attendance_rate', 5, 2).nullable();
    table.decimal('punctuality_rate', 5, 2).nullable();
    table.decimal('productivity_rate', 5, 2).nullable();
    table.decimal('average_order_value', 12, 2).nullable();
    table.decimal('uniform_compliance_rate', 5, 2).nullable();
    table.decimal('hygiene_compliance_rate', 5, 2).nullable();
    table.decimal('sop_compliance_rate', 5, 2).nullable();
    table.decimal('epi_score', 5, 2).nullable();
    table.integer('awards_count').notNullable().defaultTo(0);
    table.integer('violations_count').notNullable().defaultTo(0);

    table.timestamp('generated_at', { useTz: true }).notNullable();
    table.string('calculation_version', 64).notNullable().defaultTo('rolling-v1');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw(`
    CREATE UNIQUE INDEX employee_metric_daily_snapshots_user_snapshot_unique
    ON employee_metric_daily_snapshots (user_id, snapshot_date)
  `);

  await knex.raw(`
    CREATE INDEX employee_metric_daily_snapshots_snapshot_date_idx
    ON employee_metric_daily_snapshots (snapshot_date)
  `);

  await knex.raw(`
    CREATE INDEX employee_metric_daily_snapshots_user_snapshot_idx
    ON employee_metric_daily_snapshots (user_id, snapshot_date)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('employee_metric_daily_snapshots');
}
