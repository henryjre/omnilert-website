import type { Knex } from 'knex';

const TABLE_NAME = 'employee_metric_daily_snapshots';

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) return;

  const [
    hasCustomerServiceScore,
    hasCustomerInteraction,
    hasCashiering,
    hasSuggestiveSelling,
    hasServiceEfficiency,
  ] = await Promise.all([
    knex.schema.hasColumn(TABLE_NAME, 'customer_service_score'),
    knex.schema.hasColumn(TABLE_NAME, 'customer_interaction'),
    knex.schema.hasColumn(TABLE_NAME, 'cashiering'),
    knex.schema.hasColumn(TABLE_NAME, 'suggestive_selling_and_upselling'),
    knex.schema.hasColumn(TABLE_NAME, 'service_efficiency'),
  ]);

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    if (hasCustomerServiceScore) {
      table.dropColumn('customer_service_score');
    }
    if (!hasCustomerInteraction) {
      table.decimal('customer_interaction', 5, 2).nullable();
    }
    if (!hasCashiering) {
      table.decimal('cashiering', 5, 2).nullable();
    }
    if (!hasSuggestiveSelling) {
      table.decimal('suggestive_selling_and_upselling', 5, 2).nullable();
    }
    if (!hasServiceEfficiency) {
      table.decimal('service_efficiency', 5, 2).nullable();
    }
  });
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) return;

  const [
    hasCustomerServiceScore,
    hasCustomerInteraction,
    hasCashiering,
    hasSuggestiveSelling,
    hasServiceEfficiency,
  ] = await Promise.all([
    knex.schema.hasColumn(TABLE_NAME, 'customer_service_score'),
    knex.schema.hasColumn(TABLE_NAME, 'customer_interaction'),
    knex.schema.hasColumn(TABLE_NAME, 'cashiering'),
    knex.schema.hasColumn(TABLE_NAME, 'suggestive_selling_and_upselling'),
    knex.schema.hasColumn(TABLE_NAME, 'service_efficiency'),
  ]);

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    if (!hasCustomerServiceScore) {
      table.decimal('customer_service_score', 5, 2).nullable();
    }
    if (hasCustomerInteraction) {
      table.dropColumn('customer_interaction');
    }
    if (hasCashiering) {
      table.dropColumn('cashiering');
    }
    if (hasSuggestiveSelling) {
      table.dropColumn('suggestive_selling_and_upselling');
    }
    if (hasServiceEfficiency) {
      table.dropColumn('service_efficiency');
    }
  });
}
