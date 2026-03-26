import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_role_disables', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.uuid('role_id').notNullable();
    table.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());

    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('role_id').references('id').inTable('roles').onDelete('CASCADE');
  });

  await knex.raw(`
    CREATE UNIQUE INDEX user_role_disables_user_id_role_id_unique
    ON user_role_disables (user_id, role_id)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('user_role_disables');
}
