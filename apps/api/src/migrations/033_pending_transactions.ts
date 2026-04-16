import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('pending_transactions', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('company_id')
      .notNullable()
      .references('id')
      .inTable('companies')
      .onDelete('CASCADE');
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('type', 10).notNullable().checkIn(['credit', 'debit']);
    table.string('title', 200).notNullable();
    table
      .string('category', 20)
      .notNullable()
      .checkIn(['reward', 'purchase', 'transfer', 'adjustment']);
    table.decimal('amount', 12, 2).notNullable();
    table.string('reference', 100).nullable();
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('pending')
      .checkIn(['pending', 'completed', 'failed', 'cancelled']);
    table.string('issued_by', 200).nullable();
    table
      .uuid('issued_by_user_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('resolved_at', { useTz: true }).nullable();
    table.integer('odoo_history_id').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw(
    'CREATE INDEX pending_transactions_user_status_idx ON pending_transactions (company_id, user_id, status)',
  );
  await knex.schema.raw(
    'CREATE INDEX pending_transactions_user_date_idx ON pending_transactions (company_id, user_id, created_at DESC)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw('DROP INDEX IF EXISTS pending_transactions_user_status_idx');
  await knex.schema.raw('DROP INDEX IF EXISTS pending_transactions_user_date_idx');
  await knex.schema.dropTableIfExists('pending_transactions');
}
