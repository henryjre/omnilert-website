import type { Knex } from "knex";

const TABLE_NAME = "peer_evaluations";
const COLUMN_NAME = "wrs_effective_at";

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.timestamp(COLUMN_NAME, { useTz: true }).nullable();
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable(TABLE_NAME, (table) => {
    table.dropColumn(COLUMN_NAME);
  });
}
