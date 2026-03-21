/**
 * Compatibility shim for tenants that previously recorded
 * `026_store_audit_messages.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}
