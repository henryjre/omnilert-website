/**
 * Compatibility shim for tenants that previously recorded
 * `012_add_suspended_employment_status.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

