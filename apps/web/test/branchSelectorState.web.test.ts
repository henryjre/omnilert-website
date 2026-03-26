import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSelectorCompanyGroupsFromSnapshots,
  clearAllBranchesToFirst,
  flattenCompanyBranchIds,
  formatBranchSelectionLabel,
  selectAllGroupedBranches,
  toggleCompanyBranchSelection,
  toggleGroupedBranchSelection,
} from '../src/shared/components/branchSelectorState';

const companyGroups = [
  {
    id: 'company-a',
    name: 'Company A',
    branches: [
      {
        id: 'branch-a-1',
        name: 'Alpha 1',
        companyId: 'company-a',
        companyName: 'Company A',
      },
      {
        id: 'branch-a-2',
        name: 'Alpha 2',
        companyId: 'company-a',
        companyName: 'Company A',
      },
    ],
  },
  {
    id: 'company-b',
    name: 'Company B',
    branches: [
      {
        id: 'branch-b-1',
        name: 'Beta 1',
        companyId: 'company-b',
        companyName: 'Company B',
      },
      {
        id: 'branch-b-2',
        name: 'Beta 2',
        companyId: 'company-b',
        companyName: 'Company B',
      },
    ],
  },
];

test('selectAllGroupedBranches returns all branch ids in rendered order', () => {
  assert.deepEqual(selectAllGroupedBranches(companyGroups), [
    'branch-a-1',
    'branch-a-2',
    'branch-b-1',
    'branch-b-2',
  ]);
});

test('clearAllBranchesToFirst falls back to the first branch in rendered order', () => {
  assert.deepEqual(clearAllBranchesToFirst(companyGroups), ['branch-a-1']);
});

test('toggleGroupedBranchSelection keeps the final remaining branch selected', () => {
  const orderedIds = flattenCompanyBranchIds(companyGroups);

  assert.deepEqual(toggleGroupedBranchSelection(['branch-a-1'], 'branch-a-1', orderedIds), [
    'branch-a-1',
  ]);
});

test('toggleCompanyBranchSelection selects all branches in a company and falls back to the first branch when clearing the only selected company', () => {
  const orderedIds = flattenCompanyBranchIds(companyGroups);

  assert.deepEqual(
    toggleCompanyBranchSelection(['branch-b-2'], ['branch-a-1', 'branch-a-2'], orderedIds),
    ['branch-b-2', 'branch-a-1', 'branch-a-2'],
  );

  assert.deepEqual(
    toggleCompanyBranchSelection(['branch-a-1', 'branch-a-2'], ['branch-a-1', 'branch-a-2'], orderedIds),
    ['branch-a-1'],
  );
});

test('formatBranchSelectionLabel shows all branches or first selected branch plus count', () => {
  assert.equal(
    formatBranchSelectionLabel(companyGroups, selectAllGroupedBranches(companyGroups)),
    'All Branches',
  );

  assert.equal(
    formatBranchSelectionLabel(companyGroups, ['branch-b-2', 'branch-a-1', 'branch-a-2']),
    'Beta 2 +2',
  );
});

test('buildSelectorCompanyGroupsFromSnapshots sorts current company first and orders branches by Odoo id', () => {
  const groups = buildSelectorCompanyGroupsFromSnapshots(
    [
      {
        id: 'company-b',
        name: 'Company B',
        slug: 'company-b',
        branches: [
          { id: 'branch-b-2', name: 'Beta 2', odoo_branch_id: '22' },
          { id: 'branch-b-1', name: 'Beta 1', odoo_branch_id: '11' },
        ],
      },
      {
        id: 'company-a',
        name: 'Company A',
        slug: 'company-a',
        branches: [
          { id: 'branch-a-2', name: 'Alpha 2', odoo_branch_id: '2' },
          { id: 'branch-a-1', name: 'Alpha 1', odoo_branch_id: '1' },
        ],
      },
    ],
    'company-b',
  );

  assert.deepEqual(groups.map((group) => group.id), ['company-b', 'company-a']);
  assert.deepEqual(groups[0]?.branches.map((branch) => branch.id), ['branch-b-1', 'branch-b-2']);
});
