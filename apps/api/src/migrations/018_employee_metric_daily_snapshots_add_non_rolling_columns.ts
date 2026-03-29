import type { Knex } from 'knex';

const TABLE_NAME = 'employee_metric_daily_snapshots';

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const [hasEpiScore, hasAwardsCount, hasViolationsCount] = await Promise.all([
    knex.schema.hasColumn(TABLE_NAME, 'epi_score'),
    knex.schema.hasColumn(TABLE_NAME, 'awards_count'),
    knex.schema.hasColumn(TABLE_NAME, 'violations_count'),
  ]);

  if (!hasEpiScore || !hasAwardsCount || !hasViolationsCount) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      if (!hasEpiScore) {
        table.decimal('epi_score', 5, 2).nullable();
      }
      if (!hasAwardsCount) {
        table.integer('awards_count').notNullable().defaultTo(0);
      }
      if (!hasViolationsCount) {
        table.integer('violations_count').notNullable().defaultTo(0);
      }
    });
  }

  if (hasAwardsCount) {
    await knex.raw(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN awards_count SET DEFAULT 0`);
    await knex.raw(`UPDATE ${TABLE_NAME} SET awards_count = 0 WHERE awards_count IS NULL`);
    await knex.raw(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN awards_count SET NOT NULL`);
  }

  if (hasViolationsCount) {
    await knex.raw(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN violations_count SET DEFAULT 0`);
    await knex.raw(`UPDATE ${TABLE_NAME} SET violations_count = 0 WHERE violations_count IS NULL`);
    await knex.raw(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN violations_count SET NOT NULL`);
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const [hasEpiScore, hasAwardsCount, hasViolationsCount] = await Promise.all([
    knex.schema.hasColumn(TABLE_NAME, 'epi_score'),
    knex.schema.hasColumn(TABLE_NAME, 'awards_count'),
    knex.schema.hasColumn(TABLE_NAME, 'violations_count'),
  ]);

  if (!hasEpiScore && !hasAwardsCount && !hasViolationsCount) {
    return;
  }

  await knex.schema.alterTable(TABLE_NAME, (table) => {
    if (hasEpiScore) {
      table.dropColumn('epi_score');
    }
    if (hasAwardsCount) {
      table.dropColumn('awards_count');
    }
    if (hasViolationsCount) {
      table.dropColumn('violations_count');
    }
  });
}
