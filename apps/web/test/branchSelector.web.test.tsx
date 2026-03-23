import assert from 'node:assert/strict';
import test from 'node:test';

test('BranchSelector module loads under the web tsconfig alias mapping', async () => {
  const module = await import('../src/shared/components/BranchSelector');
  assert.equal(typeof module.BranchSelector, 'function');
});

test('branch store module loads with the grouped selector state', async () => {
  const module = await import('../src/shared/store/branchStore');
  const state = module.useBranchStore.getState();

  assert.ok('companyBranchGroups' in state);
  assert.equal(typeof state.fetchBranches, 'function');
});
