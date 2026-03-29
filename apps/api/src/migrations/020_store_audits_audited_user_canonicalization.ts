import type { Knex } from 'knex';

const TABLE_NAME = 'store_audits';
const AUDITED_USER_ID_COLUMN = 'audited_user_id';
const AUDITED_USER_KEY_COLUMN = 'audited_user_key';
const LEGACY_AVATAR_COLUMN = 'comp_employee_avatar';

const AUDITED_USER_ID_INDEX = 'store_audits_audited_user_id_idx';
const AUDITED_USER_KEY_INDEX = 'store_audits_audited_user_key_idx';

export async function up(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const hasAuditedUserId = await knex.schema.hasColumn(TABLE_NAME, AUDITED_USER_ID_COLUMN);
  const hasAuditedUserKey = await knex.schema.hasColumn(TABLE_NAME, AUDITED_USER_KEY_COLUMN);
  const hasLegacyAvatar = await knex.schema.hasColumn(TABLE_NAME, LEGACY_AVATAR_COLUMN);

  if (!hasAuditedUserId || !hasAuditedUserKey || hasLegacyAvatar) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      if (!hasAuditedUserId) {
        table
          .uuid(AUDITED_USER_ID_COLUMN)
          .nullable()
          .references('id')
          .inTable('users')
          .onDelete('SET NULL');
      }

      if (!hasAuditedUserKey) {
        table.uuid(AUDITED_USER_KEY_COLUMN).nullable();
      }

      if (hasLegacyAvatar) {
        table.dropColumn(LEGACY_AVATAR_COLUMN);
      }
    });
  }

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${AUDITED_USER_ID_INDEX}
    ON ${TABLE_NAME} (${AUDITED_USER_ID_COLUMN})
  `);
  await knex.raw(`
    CREATE INDEX IF NOT EXISTS ${AUDITED_USER_KEY_INDEX}
    ON ${TABLE_NAME} (${AUDITED_USER_KEY_COLUMN})
  `);

  // CSS rows can be backfilled directly from users.user_key.
  await knex.raw(`
    UPDATE ${TABLE_NAME} AS audits
    SET
      ${AUDITED_USER_ID_COLUMN} = users.id,
      ${AUDITED_USER_KEY_COLUMN} = users.user_key
    FROM users
    WHERE audits.${AUDITED_USER_ID_COLUMN} IS NULL
      AND audits.css_cashier_user_key IS NOT NULL
      AND users.user_key = audits.css_cashier_user_key
  `);

  // Fallback for tenants where website key mirrors users.id instead of users.user_key.
  await knex.raw(`
    UPDATE ${TABLE_NAME} AS audits
    SET
      ${AUDITED_USER_ID_COLUMN} = users.id,
      ${AUDITED_USER_KEY_COLUMN} = COALESCE(users.user_key, audits.css_cashier_user_key)
    FROM users
    WHERE audits.${AUDITED_USER_ID_COLUMN} IS NULL
      AND audits.css_cashier_user_key IS NOT NULL
      AND users.id = audits.css_cashier_user_key
  `);

  // Keep the website key snapshot even if users.id resolution is not available.
  await knex.raw(`
    UPDATE ${TABLE_NAME}
    SET ${AUDITED_USER_KEY_COLUMN} = css_cashier_user_key
    WHERE ${AUDITED_USER_KEY_COLUMN} IS NULL
      AND css_cashier_user_key IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tableExists = await knex.schema.hasTable(TABLE_NAME);
  if (!tableExists) {
    return;
  }

  const hasAuditedUserId = await knex.schema.hasColumn(TABLE_NAME, AUDITED_USER_ID_COLUMN);
  const hasAuditedUserKey = await knex.schema.hasColumn(TABLE_NAME, AUDITED_USER_KEY_COLUMN);
  const hasLegacyAvatar = await knex.schema.hasColumn(TABLE_NAME, LEGACY_AVATAR_COLUMN);

  await knex.raw(`DROP INDEX IF EXISTS ${AUDITED_USER_ID_INDEX}`);
  await knex.raw(`DROP INDEX IF EXISTS ${AUDITED_USER_KEY_INDEX}`);

  if (!hasLegacyAvatar || hasAuditedUserId || hasAuditedUserKey) {
    await knex.schema.alterTable(TABLE_NAME, (table) => {
      if (!hasLegacyAvatar) {
        table.text(LEGACY_AVATAR_COLUMN).nullable();
      }

      if (hasAuditedUserId) {
        table.dropColumn(AUDITED_USER_ID_COLUMN);
      }

      if (hasAuditedUserKey) {
        table.dropColumn(AUDITED_USER_KEY_COLUMN);
      }
    });
  }
}
