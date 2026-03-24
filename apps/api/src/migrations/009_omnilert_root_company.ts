import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE companies
      ADD COLUMN IF NOT EXISTS is_root BOOLEAN NOT NULL DEFAULT false;
  `);

  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS companies_is_root_unique
      ON companies (is_root)
      WHERE is_root = true;
  `);

  await knex.raw(`
    INSERT INTO companies (name, slug, is_root, is_active)
    VALUES ('Omnilert', 'omnilert-root', true, true)
    ON CONFLICT (slug) DO NOTHING;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DELETE FROM companies WHERE is_root = true;`);
  await knex.raw(`DROP INDEX IF EXISTS companies_is_root_unique;`);
  await knex.raw(`ALTER TABLE companies DROP COLUMN IF EXISTS is_root;`);
}
