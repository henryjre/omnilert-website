import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  const hasLastCompanyId = await knex.schema.hasColumn('users', 'last_company_id');
  if (!hasLastCompanyId) {
    await knex.schema.alterTable('users', (table) => {
      table
        .uuid('last_company_id')
        .nullable()
        .references('id')
        .inTable('companies')
        .onDelete('SET NULL');
    });
  }

  await knex.raw('CREATE INDEX IF NOT EXISTS users_last_company_id_idx ON users(last_company_id)');
}

export async function down(knex: Knex): Promise<void> {
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return;

  await knex.raw('DROP INDEX IF EXISTS users_last_company_id_idx');

  const hasLastCompanyId = await knex.schema.hasColumn('users', 'last_company_id');
  if (!hasLastCompanyId) return;

  await knex.schema.alterTable('users', (table) => {
    table.dropColumn('last_company_id');
  });
}
