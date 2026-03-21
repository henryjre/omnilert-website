import assert from 'node:assert/strict';
import test from 'node:test';

import { up as upStoreAudits } from '../src/migrations/tenant/017_store_audits.js';
import { up as upCaseReports } from '../src/migrations/tenant/018_case_reports.js';
import { up as upViolationNotices } from '../src/migrations/tenant/020_violation_notices.js';

function createMigrationKnexStub() {
  const rawCalls: string[] = [];

  const knex = {
    schema: {
      hasTable: async () => true,
      createTable: async () => undefined,
    },
    raw: async (sql: string) => {
      rawCalls.push(sql);
      return undefined;
    },
    fn: {
      now: () => new Date(),
    },
  };

  return { knex: knex as any, rawCalls };
}

function assertConstraintSqlIsTransactionSafe(rawCalls: string[], constraintName: string) {
  const sql = rawCalls.find((statement) => statement.includes(constraintName));
  assert.ok(sql, `Expected raw SQL for constraint ${constraintName}`);
  assert.match(sql, /DO \$\$/);
  assert.match(sql, /IF NOT EXISTS\s*\(/);
  assert.match(sql, /pg_constraint/);
}

test('017_store_audits adds check constraints without aborting the transaction on duplicates', async () => {
  const { knex, rawCalls } = createMigrationKnexStub();

  await upStoreAudits(knex);

  assertConstraintSqlIsTransactionSafe(rawCalls, 'store_audits_type_check');
  assertConstraintSqlIsTransactionSafe(rawCalls, 'store_audits_status_check');
  assertConstraintSqlIsTransactionSafe(rawCalls, 'store_audits_css_star_rating_check');
});

test('018_case_reports adds check constraints without relying on caught migration errors', async () => {
  const { knex, rawCalls } = createMigrationKnexStub();

  await upCaseReports(knex);

  assertConstraintSqlIsTransactionSafe(rawCalls, 'case_reports_status_check');
  assertConstraintSqlIsTransactionSafe(rawCalls, 'case_mentions_target_check');
});

test('020_violation_notices adds check constraints without relying on caught migration errors', async () => {
  const { knex, rawCalls } = createMigrationKnexStub();

  await upViolationNotices(knex);

  assertConstraintSqlIsTransactionSafe(rawCalls, 'violation_notices_status_check');
  assertConstraintSqlIsTransactionSafe(rawCalls, 'violation_notices_category_check');
  assertConstraintSqlIsTransactionSafe(rawCalls, 'violation_notice_messages_type_check');
  assertConstraintSqlIsTransactionSafe(rawCalls, 'violation_notice_mentions_target_check');
});
