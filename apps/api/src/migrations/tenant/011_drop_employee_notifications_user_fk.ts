import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('employee_notifications');
  if (!hasTable) return;

  await knex.raw(`
    ALTER TABLE employee_notifications
    DROP CONSTRAINT IF EXISTS employee_notifications_user_id_foreign
  `);
}

export async function down(knex: Knex): Promise<void> {
  const hasTable = await knex.schema.hasTable('employee_notifications');
  if (!hasTable) return;

  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  await knex.raw(`
    ALTER TABLE employee_notifications
    ADD CONSTRAINT employee_notifications_user_id_foreign
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
  `);
}
