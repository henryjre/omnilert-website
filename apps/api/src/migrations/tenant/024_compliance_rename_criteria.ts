import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasLegacyProductivity = await knex.schema.hasColumn('store_audits', 'comp_non_idle');
  const hasRenamedProductivity = await knex.schema.hasColumn('store_audits', 'comp_productivity_rate');
  const hasCellphone = await knex.schema.hasColumn('store_audits', 'comp_cellphone');

  await knex.schema.alterTable('store_audits', (table) => {
    if (hasLegacyProductivity && !hasRenamedProductivity) {
      table.renameColumn('comp_non_idle', 'comp_productivity_rate');
    }

    if (hasCellphone) {
      table.dropColumn('comp_cellphone');
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const hasLegacyProductivity = await knex.schema.hasColumn('store_audits', 'comp_non_idle');
  const hasRenamedProductivity = await knex.schema.hasColumn('store_audits', 'comp_productivity_rate');
  const hasCellphone = await knex.schema.hasColumn('store_audits', 'comp_cellphone');

  await knex.schema.alterTable('store_audits', (table) => {
    if (hasRenamedProductivity && !hasLegacyProductivity) {
      table.renameColumn('comp_productivity_rate', 'comp_non_idle');
    }

    if (!hasCellphone) {
      table.boolean('comp_cellphone').nullable();
    }
  });
}
