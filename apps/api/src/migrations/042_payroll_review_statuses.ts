import type { Knex } from 'knex';

const TABLE_NAME = 'payroll_review_statuses';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable(TABLE_NAME, (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table.integer('odoo_company_id').notNullable();
    table.integer('employee_odoo_id').notNullable();
    table.date('date_from').notNullable();
    table.date('date_to').notNullable();
    table.string('status', 20).notNullable().defaultTo('on_hold').checkIn(['on_hold']);
    table.text('reason').nullable();
    table
      .uuid('flagged_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('resolved_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['company_id', 'odoo_company_id', 'employee_odoo_id', 'date_from', 'date_to']);
  });

  await knex.schema.raw(
    `CREATE INDEX ${TABLE_NAME}_company_period_status_idx ON ${TABLE_NAME} (company_id, date_from, date_to, status)`,
  );
  await knex.schema.raw(
    `CREATE INDEX ${TABLE_NAME}_company_employee_period_idx ON ${TABLE_NAME} (company_id, employee_odoo_id, date_from, date_to)`,
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`DROP INDEX IF EXISTS ${TABLE_NAME}_company_employee_period_idx`);
  await knex.schema.raw(`DROP INDEX IF EXISTS ${TABLE_NAME}_company_period_status_idx`);
  await knex.schema.dropTableIfExists(TABLE_NAME);
}
