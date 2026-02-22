/**
 * Compatibility shim for tenants that previously recorded
 * `009_add_employment_status_to_users.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}

