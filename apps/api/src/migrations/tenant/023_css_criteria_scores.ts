import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasCriteria = await knex.schema.hasColumn('store_audits', 'css_criteria_scores');
  if (!hasCriteria) {
    await knex.schema.alterTable('store_audits', (table) => {
      table.jsonb('css_criteria_scores').nullable();
    });
  }

  // Alter css_star_rating from INTEGER to NUMERIC(3,2) to support decimal averages.
  // We drop and recreate the column type; existing integer values are cast automatically.
  await knex.raw(`
    ALTER TABLE store_audits
    ALTER COLUMN css_star_rating TYPE NUMERIC(3,2) USING css_star_rating::numeric;
  `);

  // Drop old CHECK constraint if it exists (it was created for INTEGER range 1-5).
  // Re-add constraint covering NUMERIC range 1.00-5.00.
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'store_audits_css_star_rating_check'
          AND conrelid = 'store_audits'::regclass
      ) THEN
        ALTER TABLE store_audits DROP CONSTRAINT store_audits_css_star_rating_check;
      END IF;
    END;
    $$;
  `);

  await knex.raw(`
    ALTER TABLE store_audits
    ADD CONSTRAINT store_audits_css_star_rating_check
      CHECK (css_star_rating IS NULL OR (css_star_rating >= 1 AND css_star_rating <= 5));
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Remove constraint added in up
  await knex.raw(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'store_audits_css_star_rating_check'
          AND conrelid = 'store_audits'::regclass
      ) THEN
        ALTER TABLE store_audits DROP CONSTRAINT store_audits_css_star_rating_check;
      END IF;
    END;
    $$;
  `);

  // Revert css_star_rating back to INTEGER
  await knex.raw(`
    ALTER TABLE store_audits
    ALTER COLUMN css_star_rating TYPE INTEGER USING ROUND(css_star_rating)::integer;
  `);

  // Restore original integer CHECK constraint
  await knex.raw(`
    ALTER TABLE store_audits
    ADD CONSTRAINT store_audits_css_star_rating_check
      CHECK (css_star_rating IS NULL OR (css_star_rating >= 1 AND css_star_rating <= 5));
  `);

  // Drop the criteria scores column
  const hasCriteria = await knex.schema.hasColumn('store_audits', 'css_criteria_scores');
  if (hasCriteria) {
    await knex.schema.alterTable('store_audits', (table) => {
      table.dropColumn('css_criteria_scores');
    });
  }
}
