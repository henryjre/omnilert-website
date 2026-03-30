import assert from 'node:assert/strict';
import test from 'node:test';

import {
  up as upStoreAuditServiceCrewCctvRename,
} from '../src/migrations/023_store_audits_service_crew_cctv_rename.js';

function createColumnAwareKnexStub(initialColumns: string[]) {
  const columns = new Set(initialColumns);
  const operations: Array<{ kind: string; from?: string; to?: string; column?: string }> = [];
  const rawCalls: string[] = [];
  const updates: Array<Record<string, unknown>> = [];

  const knexTable = {
    where(whereClause: Record<string, unknown>) {
      updates.push({ where: whereClause });
      return {
        update(updateClause: Record<string, unknown>) {
          updates.push({ update: updateClause });
          return Promise.resolve(1);
        },
      };
    },
  };

  const knex = Object.assign(
    ((tableName: string) => {
      assert.equal(tableName, 'store_audits');
      return knexTable;
    }) as any,
    {
      schema: {
        hasTable: async () => true,
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
            integer(column: string) {
              operations.push({ kind: 'addInteger', column });
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
      raw: async (sql: string) => {
        rawCalls.push(sql);
        return undefined;
      },
    },
  );

  return { knex: knex as any, operations, columns, rawCalls, updates };
}

test('023_store_audits_service_crew_cctv_rename replaces compliance schema with SCC columns', async () => {
  const { knex, operations, columns, rawCalls, updates } = createColumnAwareKnexStub([
    'type',
    'comp_odoo_employee_id',
    'comp_employee_name',
    'comp_check_in_time',
    'comp_extra_fields',
    'comp_productivity_rate',
    'comp_uniform',
    'comp_hygiene',
    'comp_sop',
    'comp_ai_report',
  ]);

  await upStoreAuditServiceCrewCctvRename(knex);

  assert.deepEqual(updates, [
    { where: { type: 'compliance' } },
    { update: { type: 'service_crew_cctv' } },
  ]);
  assert.deepEqual(operations, [
    { kind: 'rename', from: 'comp_odoo_employee_id', to: 'scc_odoo_employee_id' },
    { kind: 'rename', from: 'comp_employee_name', to: 'scc_employee_name' },
    { kind: 'rename', from: 'comp_productivity_rate', to: 'scc_productivity_rate' },
    { kind: 'rename', from: 'comp_uniform', to: 'scc_uniform_compliance' },
    { kind: 'rename', from: 'comp_hygiene', to: 'scc_hygiene_compliance' },
    { kind: 'rename', from: 'comp_sop', to: 'scc_sop_compliance' },
    { kind: 'rename', from: 'comp_ai_report', to: 'scc_ai_report' },
    { kind: 'drop', column: 'comp_check_in_time' },
    { kind: 'drop', column: 'comp_extra_fields' },
    { kind: 'addInteger', column: 'scc_customer_interaction' },
    { kind: 'addInteger', column: 'scc_cashiering' },
    { kind: 'addInteger', column: 'scc_suggestive_selling_and_upselling' },
    { kind: 'addInteger', column: 'scc_service_efficiency' },
  ]);
  assert.equal(columns.has('comp_odoo_employee_id'), false);
  assert.equal(columns.has('comp_check_in_time'), false);
  assert.equal(columns.has('comp_extra_fields'), false);
  assert.equal(columns.has('scc_odoo_employee_id'), true);
  assert.equal(columns.has('scc_uniform_compliance'), true);
  assert.equal(columns.has('scc_customer_interaction'), true);
  assert.equal(columns.has('scc_service_efficiency'), true);
  assert.ok(rawCalls.some((sql) => sql.includes("type IN ('customer_service', 'service_crew_cctv')")));
  assert.ok(rawCalls.some((sql) => sql.includes('scc_customer_interaction IS NULL OR (scc_customer_interaction BETWEEN 1 AND 5)')));
});
