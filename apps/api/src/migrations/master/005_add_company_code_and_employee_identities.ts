import type { Knex } from 'knex';

const COMPANY_TABLE = 'companies';
const COMPANY_CODE_COLUMN = 'company_code';
const COMPANY_CODE_INDEX = 'companies_company_code_unique';

const IDENTITIES_TABLE = 'employee_identities';

export async function up(knex: Knex): Promise<void> {
  const hasCompanyCode = await knex.schema.hasColumn(COMPANY_TABLE, COMPANY_CODE_COLUMN);
  if (!hasCompanyCode) {
    await knex.schema.alterTable(COMPANY_TABLE, (table) => {
      table.string(COMPANY_CODE_COLUMN, 20).nullable();
    });
  }

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS ${COMPANY_CODE_INDEX}
    ON ${COMPANY_TABLE} (${COMPANY_CODE_COLUMN})
    WHERE ${COMPANY_CODE_COLUMN} IS NOT NULL
  `);

  const hasEmployeeIdentities = await knex.schema.hasTable(IDENTITIES_TABLE);
  if (!hasEmployeeIdentities) {
    await knex.schema.createTable(IDENTITIES_TABLE, (table) => {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      table.string('email', 255).notNullable().unique();
      table.integer('employee_number').notNullable().unique();
      table.uuid('website_key').notNullable().unique();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists(IDENTITIES_TABLE);
  await knex.raw(`DROP INDEX IF EXISTS ${COMPANY_CODE_INDEX}`);

  const hasCompanyCode = await knex.schema.hasColumn(COMPANY_TABLE, COMPANY_CODE_COLUMN);
  if (hasCompanyCode) {
    await knex.schema.alterTable(COMPANY_TABLE, (table) => {
      table.dropColumn(COMPANY_CODE_COLUMN);
    });
  }
}
