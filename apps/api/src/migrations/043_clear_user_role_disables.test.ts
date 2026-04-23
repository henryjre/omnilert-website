import assert from 'node:assert/strict';
import test from 'node:test';

const migration = await import('./043_clear_user_role_disables.js');

test('043_clear_user_role_disables up deletes all rows from user_role_disables', async () => {
  const calls: Array<{ tableName: string; method: string }> = [];

  const knex = ((tableName: string) => ({
    delete: async () => {
      calls.push({ tableName, method: 'delete' });
      return 3;
    },
  })) as any;

  await migration.up(knex);

  assert.deepEqual(calls, [{ tableName: 'user_role_disables', method: 'delete' }]);
});

test('043_clear_user_role_disables down is a no-op', async () => {
  await assert.doesNotReject(() => migration.down({} as any));
});
