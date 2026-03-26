import { db } from '../config/database.js';

/**
 * Returns a Knex query builder pre-filtered to the given company.
 * Use this for all company-scoped tables (tables with a company_id column).
 *
 * Global tables (users, departments, employee_notifications, push_subscriptions, etc.)
 * should query db.getDb() directly without scopedQuery.
 */
export function scopedQuery(table: string, companyId: string) {
  return db.getDb()(table).where('company_id', companyId);
}
