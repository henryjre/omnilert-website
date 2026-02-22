/**
 * Compatibility shim for tenants that previously recorded
 * `008_expand_personal_information_fields.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

