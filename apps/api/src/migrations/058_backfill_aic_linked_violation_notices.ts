import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    WITH linked AS (
      SELECT DISTINCT ON (source_aic_record_id)
        source_aic_record_id,
        id
      FROM violation_notices
      WHERE source_aic_record_id IS NOT NULL
      ORDER BY source_aic_record_id, created_at DESC
    )
    UPDATE aic_records ar
    SET
      vn_requested = TRUE,
      linked_vn_id = linked.id,
      updated_at = NOW()
    FROM linked
    WHERE ar.id = linked.source_aic_record_id
      AND (ar.vn_requested IS DISTINCT FROM TRUE OR ar.linked_vn_id IS NULL);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    UPDATE aic_records ar
    SET
      vn_requested = FALSE,
      linked_vn_id = NULL,
      updated_at = NOW()
    WHERE EXISTS (
      SELECT 1
      FROM violation_notices vn
      WHERE vn.id = ar.linked_vn_id
        AND vn.source_aic_record_id = ar.id
    );
  `);
}
