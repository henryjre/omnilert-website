import type { Knex } from 'knex';

const USERS_TABLE = 'users';

async function addColumnIfMissing(
  knex: Knex,
  table: string,
  column: string,
  alter: (tableBuilder: Knex.AlterTableBuilder) => void,
): Promise<void> {
  const hasColumn = await knex.schema.hasColumn(table, column);
  if (!hasColumn) {
    await knex.schema.alterTable(table, alter);
  }
}

export async function up(knex: Knex): Promise<void> {
  await addColumnIfMissing(knex, USERS_TABLE, 'tin_number', (table) => {
    table.string('tin_number', 100).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'marital_status', (table) => {
    table.string('marital_status', 50).nullable();
  });
  await addColumnIfMissing(knex, USERS_TABLE, 'emergency_relationship', (table) => {
    table.string('emergency_relationship', 100).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  if (await knex.schema.hasColumn(USERS_TABLE, 'emergency_relationship')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('emergency_relationship');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'marital_status')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('marital_status');
    });
  }
  if (await knex.schema.hasColumn(USERS_TABLE, 'tin_number')) {
    await knex.schema.alterTable(USERS_TABLE, (table) => {
      table.dropColumn('tin_number');
    });
  }
}
