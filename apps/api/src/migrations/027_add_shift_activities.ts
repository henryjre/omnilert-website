import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // 1. Create shift_activities table
  await knex.schema.createTable('shift_activities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table
      .uuid('shift_id')
      .notNullable()
      .references('id')
      .inTable('employee_shifts')
      .onDelete('CASCADE');
    table
      .string('activity_type', 50)
      .notNullable()
      .checkIn(['break', 'field_task']);
    table.timestamp('start_time', { useTz: true }).notNullable();
    table.timestamp('end_time', { useTz: true }).nullable();
    table.integer('duration_minutes').nullable();
    table.jsonb('activity_details').nullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // 2. Update shift_logs.log_type check constraint
  // In Knex, updating a check constraint usually requires clearing and re-adding or raw SQL.
  // We'll use raw SQL to drop the old constraint and add the new one.
  const checkConstraintName = 'shift_logs_log_type_check';
  const newLogTypes = [
    'shift_updated',
    'check_in',
    'check_out',
    'shift_ended',
    'authorization_resolved',
    'peer_evaluation_available',
    'peer_evaluation_submitted',
    'peer_evaluation_expired',
    'break_start',
    'break_end',
    'field_task_start',
    'field_task_end',
  ];
  const list = newLogTypes.map((t) => `'${t}'`).join(', ');

  await knex.raw(`
    ALTER TABLE shift_logs DROP CONSTRAINT IF EXISTS ${checkConstraintName};
    ALTER TABLE shift_logs ADD CONSTRAINT ${checkConstraintName} CHECK (log_type IN (${list}));
  `);
}

export async function down(knex: Knex): Promise<void> {
  // 1. Restore old shift_logs.log_type check constraint
  const checkConstraintName = 'shift_logs_log_type_check';
  const oldLogTypes = [
    'shift_updated',
    'check_in',
    'check_out',
    'shift_ended',
    'authorization_resolved',
    'peer_evaluation_available',
    'peer_evaluation_submitted',
    'peer_evaluation_expired',
  ];
  const list = oldLogTypes.map((t) => `'${t}'`).join(', ');

  await knex.raw(`
    ALTER TABLE shift_logs DROP CONSTRAINT IF EXISTS ${checkConstraintName};
    ALTER TABLE shift_logs ADD CONSTRAINT ${checkConstraintName} CHECK (log_type IN (${list}));
  `);

  // 2. Drop shift_activities table
  await knex.schema.dropTableIfExists('shift_activities');
}
