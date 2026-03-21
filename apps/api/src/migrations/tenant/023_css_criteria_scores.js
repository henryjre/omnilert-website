/**
 * Compatibility shim for tenants that previously recorded
 * `023_css_criteria_scores.js` in knex_migrations.
 */
export async function up(_knex) {
  // No-op compatibility migration.
}

export async function down(_knex) {
  // No-op compatibility rollback.
}
