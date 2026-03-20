import assert from 'node:assert/strict';
import test from 'node:test';

const {
  resolveLeaderboardPaginationState,
} = await import('../../../web/src/features/dashboard/components/epi/leaderboardPagination.js');

function createEntries(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `entry-${index + 1}`,
    rank: index + 1,
  }));
}

test('resolveLeaderboardPaginationState preserves an explicitly selected page when no row is expanded', () => {
  const result = resolveLeaderboardPaginationState({
    entries: createEntries(15),
    expandedId: null,
    page: 1,
    pageSize: 10,
  });

  assert.deepEqual(result, {
    expandedId: null,
    page: 1,
  });
});

test('resolveLeaderboardPaginationState jumps to the page containing an expanded non-podium entry', () => {
  const result = resolveLeaderboardPaginationState({
    entries: createEntries(25),
    expandedId: 'entry-16',
    page: 0,
    pageSize: 10,
  });

  assert.deepEqual(result, {
    expandedId: 'entry-16',
    page: 1,
  });
});

test('resolveLeaderboardPaginationState clears missing expanded rows and clamps out-of-range pages', () => {
  const result = resolveLeaderboardPaginationState({
    entries: createEntries(8),
    expandedId: 'missing-entry',
    page: 4,
    pageSize: 10,
  });

  assert.deepEqual(result, {
    expandedId: null,
    page: 0,
  });
});
