/**
 * Compatibility shim for tenants that previously recorded
 * `027_add_comp_ai_report.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}
