import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasPeerEvaluations = await knex.schema.hasTable('peer_evaluations');
  if (!hasPeerEvaluations) {
    await knex.schema.createTable('peer_evaluations', (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.uuid('evaluator_user_id').notNullable();
      table.uuid('evaluated_user_id').notNullable();
      table.uuid('shift_id').notNullable().references('id').inTable('employee_shifts').onDelete('CASCADE');
      table.string('status', 20).notNullable().defaultTo('pending');
      table.integer('q1_score').notNullable().defaultTo(5);
      table.integer('q2_score').notNullable().defaultTo(5);
      table.integer('q3_score').notNullable().defaultTo(5);
      table.text('additional_message').nullable();
      table.integer('overlap_minutes').notNullable();
      table.timestamp('expires_at').notNullable();
      table.timestamp('submitted_at').nullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['evaluator_user_id', 'evaluated_user_id', 'shift_id']);
      table.index(['evaluator_user_id', 'status']);
      table.index(['expires_at', 'status']);
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('peer_evaluations');
}
