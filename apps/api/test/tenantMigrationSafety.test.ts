import assert from 'node:assert/strict';
import test from 'node:test';

import { up as upStoreAudits } from '../src/migrations/tenant/017_store_audits.js';
import { up as upCaseReports } from '../src/migrations/tenant/018_case_reports.js';
import { up as upViolationNotices } from '../src/migrations/tenant/020_violation_notices.js';
import { down as downComplianceCriteria, up as upComplianceCriteria } from '../src/migrations/tenant/024_compliance_rename_criteria.js';

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

function createColumnAwareKnexStub(initialColumns: string[]) {
  const columns = new Set(initialColumns);
  const operations: Array<{ kind: string; from?: string; to?: string; column?: string }> = [];

  const knex = {
    schema: {
      hasColumn: async (_tableName: string, columnName: string) => columns.has(columnName),
      alterTable: async (_tableName: string, callback: (table: any) => void) => {
        const table = {
          renameColumn(from: string, to: string) {
            operations.push({ kind: 'rename', from, to });
            columns.delete(from);
            columns.add(to);
          },
          dropColumn(column: string) {
            operations.push({ kind: 'drop', column });
            columns.delete(column);
          },
          boolean(column: string) {
            operations.push({ kind: 'addBoolean', column });
            columns.add(column);
            return {
              nullable() {
                return undefined;
              },
            };
          },
        };

        callback(table);
      },
    },
  };

  return { knex: knex as any, operations, columns };
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

test('024_compliance_rename_criteria skips renaming when the new column already exists', async () => {
  const { knex, operations, columns } = createColumnAwareKnexStub([
    'comp_productivity_rate',
    'comp_cellphone',
  ]);

  await upComplianceCriteria(knex);

  assert.deepEqual(operations, [
    { kind: 'drop', column: 'comp_cellphone' },
  ]);
  assert.equal(columns.has('comp_productivity_rate'), true);
  assert.equal(columns.has('comp_non_idle'), false);
  assert.equal(columns.has('comp_cellphone'), false);
});

test('024_compliance_rename_criteria renames the legacy column when needed', async () => {
  const { knex, operations, columns } = createColumnAwareKnexStub([
    'comp_non_idle',
    'comp_cellphone',
  ]);

  await upComplianceCriteria(knex);

  assert.deepEqual(operations, [
    { kind: 'rename', from: 'comp_non_idle', to: 'comp_productivity_rate' },
    { kind: 'drop', column: 'comp_cellphone' },
  ]);
  assert.equal(columns.has('comp_productivity_rate'), true);
  assert.equal(columns.has('comp_non_idle'), false);
  assert.equal(columns.has('comp_cellphone'), false);
});

test('024_compliance_rename_criteria down skips renaming when the legacy column already exists', async () => {
  const { knex, operations, columns } = createColumnAwareKnexStub([
    'comp_non_idle',
    'comp_cellphone',
  ]);

  await downComplianceCriteria(knex);

  assert.deepEqual(operations, []);
  assert.equal(columns.has('comp_non_idle'), true);
  assert.equal(columns.has('comp_productivity_rate'), false);
});
