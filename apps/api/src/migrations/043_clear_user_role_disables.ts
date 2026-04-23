import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex('user_role_disables').delete();
}

export async function down(_knex: Knex): Promise<void> {}
