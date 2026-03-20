import assert from 'node:assert/strict';
import test from 'node:test';

const {
  resolveStoreAuditPaginationState,
} = await import('../../web/src/features/store-audits/pages/storeAuditPagination.js');

test('resolveStoreAuditPaginationState preserves an in-range page and reports total pages', () => {
  const result = resolveStoreAuditPaginationState({
    page: 2,
    pageSize: 10,
    total: 45,
  });

  assert.deepEqual(result, {
    page: 2,
    totalPages: 5,
  });
});

test('resolveStoreAuditPaginationState clamps out-of-range pages to the last page', () => {
  const result = resolveStoreAuditPaginationState({
    page: 5,
    pageSize: 10,
    total: 21,
  });

  assert.deepEqual(result, {
    page: 3,
    totalPages: 3,
  });
});

test('resolveStoreAuditPaginationState falls back to the first page when there are no audits', () => {
  const result = resolveStoreAuditPaginationState({
    page: 4,
    pageSize: 10,
    total: 0,
  });

  assert.deepEqual(result, {
    page: 1,
    totalPages: 1,
  });
});
