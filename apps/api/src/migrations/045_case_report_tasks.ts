import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('case_report_tasks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('case_id').notNullable().references('id').inTable('case_reports').onDelete('CASCADE');
    t.uuid('created_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.uuid('source_message_id').nullable().references('id').inTable('case_messages').onDelete('SET NULL');
    t.uuid('discussion_message_id').nullable().references('id').inTable('case_messages').onDelete('SET NULL');
    t.text('description').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('case_report_task_assignees', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('case_report_tasks').onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('completed_at', { useTz: true }).nullable();
    t.uuid('completed_by').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.unique(['task_id', 'user_id']);
  });

  await knex.schema.createTable('case_report_task_messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('task_id').notNullable().references('id').inTable('case_report_tasks').onDelete('CASCADE');
    t.uuid('user_id').nullable().references('id').inTable('users').onDelete('SET NULL');
    t.text('content').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  await knex.schema.raw('CREATE INDEX idx_case_report_tasks_case_id ON case_report_tasks(case_id)');
  await knex.schema.raw('CREATE INDEX idx_case_report_task_messages_task_id ON case_report_task_messages(task_id)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('case_report_task_messages');
  await knex.schema.dropTableIfExists('case_report_task_assignees');
  await knex.schema.dropTableIfExists('case_report_tasks');
}
