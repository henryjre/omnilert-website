/**
 * Compatibility shim for tenants that previously recorded
 * `019_case_messages_soft_delete.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}
