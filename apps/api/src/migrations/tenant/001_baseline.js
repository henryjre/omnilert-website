/**
 * Compatibility shim for tenants that previously recorded
 * `001_baseline.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op baseline.
}

export async function down(_knex) {
  // No-op baseline rollback.
}
