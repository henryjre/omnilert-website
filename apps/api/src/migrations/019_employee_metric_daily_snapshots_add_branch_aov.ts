import type { Knex } from 'knex';

const TABLE_NAME = 'employee_metric_daily_snapshots';
const COLUMN_NAME = 'branch_aov';

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const hasBranchAov = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (hasBranchAov) {
    return;
  }

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.decimal(COLUMN_NAME, 12, 2).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const hasBranchAov = await knex.schema.hasColumn(TABLE_NAME, COLUMN_NAME);
  if (!hasBranchAov) {
    return;
  }

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn(COLUMN_NAME);
  });
}
