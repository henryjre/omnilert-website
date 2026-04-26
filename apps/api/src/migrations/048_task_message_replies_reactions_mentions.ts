import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('case_report_task_messages', (t) => {
    t.uuid('parent_message_id')
      .nullable()
      .references('id')
      .inTable('case_report_task_messages')
      .onDelete('SET NULL');
  });

  await knex.schema.createTable('case_report_task_reactions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id')
      .notNullable()
      .references('id')
      .inTable('case_report_task_messages')
      .onDelete('CASCADE');
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('emoji', 20).notNullable();
    t.unique(['message_id', 'user_id', 'emoji']);
  });

  await knex.schema.createTable('case_report_task_mentions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('message_id')
      .notNullable()
      .references('id')
      .inTable('case_report_task_messages')
      .onDelete('CASCADE');
    t.uuid('mentioned_user_id').nullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('mentioned_role_id').nullable().references('id').inTable('roles').onDelete('CASCADE');
    t.string('mentioned_name', 255).nullable();
  });

  await knex.schema.raw(
    'CREATE INDEX idx_task_reactions_message_id ON case_report_task_reactions(message_id)',
  );
  await knex.schema.raw(
    'CREATE INDEX idx_task_mentions_message_id ON case_report_task_mentions(message_id)',
  );
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('case_report_task_mentions');
  await knex.schema.dropTableIfExists('case_report_task_reactions');
  await knex.schema.alterTable('case_report_task_messages', (t) => {
    t.dropColumn('parent_message_id');
  });
}
