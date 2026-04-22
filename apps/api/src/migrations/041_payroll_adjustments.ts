import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('payroll_adjustment_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('branch_id')
      .notNullable()
      .references('id')
      .inTable('branches')
      .onDelete('CASCADE');
    table.string('type', 20).notNullable().checkIn(['issuance', 'deduction']);
    table.text('reason').notNullable();
    table.decimal('total_amount', 12, 2).notNullable();
    table.integer('payroll_periods').notNullable().defaultTo(1);
    table
      .string('status', 30)
      .notNullable()
      .defaultTo('pending')
      .checkIn([
        'pending',
        'processing',
        'employee_approval',
        'in_progress',
        'completed',
        'rejected',
      ]);
    table
      .uuid('created_by_user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('processing_owner_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('approved_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table
      .uuid('rejected_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.text('rejection_reason').nullable();
    table.timestamp('confirmed_at', { useTz: true }).nullable();
    table.timestamp('approved_at', { useTz: true }).nullable();
    table.timestamp('rejected_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('payroll_adjustment_request_targets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('request_id')
      .notNullable()
      .references('id')
      .inTable('payroll_adjustment_requests')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.decimal('allocated_total_amount', 12, 2).notNullable();
    table.decimal('allocated_monthly_amount', 12, 2).notNullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'in_progress', 'completed']);
    table.timestamp('authorized_at', { useTz: true }).nullable();
    table.integer('odoo_salary_attachment_id').nullable().unique();
    table.timestamp('completed_at', { useTz: true }).nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.unique(['request_id', 'user_id']);
  });

  await knex.schema.raw(
    'CREATE INDEX payroll_adjustment_requests_company_status_created_idx ON payroll_adjustment_requests (company_id, status, created_at DESC)',
  );
  await knex.schema.raw(
    'CREATE INDEX payroll_adjustment_requests_company_branch_created_idx ON payroll_adjustment_requests (company_id, branch_id, created_at DESC)',
  );
  await knex.schema.raw(
    'CREATE INDEX payroll_adjustment_request_targets_user_status_idx ON payroll_adjustment_request_targets (user_id, status)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS payroll_adjustment_request_targets_user_status_idx');
  await knex.schema.raw('DROP INDEX IF EXISTS payroll_adjustment_requests_company_branch_created_idx');
  await knex.schema.raw('DROP INDEX IF EXISTS payroll_adjustment_requests_company_status_created_idx');
  await knex.schema.dropTableIfExists('payroll_adjustment_request_targets');
  await knex.schema.dropTableIfExists('payroll_adjustment_requests');
}
