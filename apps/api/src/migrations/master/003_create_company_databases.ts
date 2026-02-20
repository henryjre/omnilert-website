import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('company_databases', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('company_id').notNullable().references('id').inTable('companies').onDelete('CASCADE');
    table.string('db_name', 100).notNullable();
    table.string('migration_version', 50);
    table.timestamp('provisioned_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('last_migrated_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('company_databases');
}
