import assert from 'node:assert/strict';
import test from 'node:test';
import { reassignUserToSingleCheckedInBranch } from './webhook.service.js';

type RecordedOperation =
  | { type: 'transaction:start' | 'transaction:end' }
  | { type: 'delete'; where: Record<string, string> }
  | { type: 'insert'; values: Record<string, unknown> }
  | { type: 'onConflict'; columns: string[] }
  | { type: 'ignore' };

function createTenantDbMock() {
  const operations: RecordedOperation[] = [];

  const trx = ((tableName: string) => {
    assert.equal(tableName, 'user_branches');
    return {
      where: (whereClause: Record<string, string>) => ({
        delete: async () => {
          operations.push({ type: 'delete', where: whereClause });
        },
      }),
      insert: (values: Record<string, unknown>) => {
        operations.push({ type: 'insert', values });
        return {
          onConflict: (columns: string[]) => {
            operations.push({ type: 'onConflict', columns });
            return {
              ignore: async () => {
                operations.push({ type: 'ignore' });
              },
            };
          },
        };
      },
    };
  }) as any;

  const tenantDb = {
    transaction: async (callback: (trxDb: any) => Promise<void>) => {
      operations.push({ type: 'transaction:start' });
      await callback(trx);
      operations.push({ type: 'transaction:end' });
    },
  } as any;

  return { tenantDb, operations };
}

test('reassignUserToSingleCheckedInBranch clears existing assignments and inserts checked-in branch', async () => {
  const userId = 'user-123';
  const branchId = 'branch-789';
  const { tenantDb, operations } = createTenantDbMock();

  await reassignUserToSingleCheckedInBranch(tenantDb, userId, branchId);

  assert.deepEqual(operations, [
    { type: 'transaction:start' },
    { type: 'delete', where: { user_id: userId } },
    {
      type: 'insert',
      values: {
        user_id: userId,
        branch_id: branchId,
        is_primary: false,
      },
    },
    { type: 'onConflict', columns: ['user_id', 'branch_id'] },
    { type: 'ignore' },
    { type: 'transaction:end' },
  ]);
});
