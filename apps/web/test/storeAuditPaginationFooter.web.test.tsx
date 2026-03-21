import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StoreAuditPaginationFooter } from '../src/features/store-audits/components/StoreAuditPaginationFooter';

test('renders the employee profile pagination layout contract for store audits', () => {
  const markup = renderToStaticMarkup(
    <StoreAuditPaginationFooter
      currentPage={2}
      totalPages={3}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );

  assert.match(markup, /class="flex items-center justify-between text-sm text-gray-600"/);
  assert.match(markup, /Page 2 of 3/);
  assert.match(markup, />Previous</);
  assert.match(markup, />Next</);
  assert.doesNotMatch(markup, /Showing/);
});

test('disables navigation buttons at the page boundaries', () => {
  const firstPageMarkup = renderToStaticMarkup(
    <StoreAuditPaginationFooter
      currentPage={1}
      totalPages={3}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );
  const lastPageMarkup = renderToStaticMarkup(
    <StoreAuditPaginationFooter
      currentPage={3}
      totalPages={3}
      onPrevious={() => undefined}
      onNext={() => undefined}
    />,
  );

  assert.match(firstPageMarkup, /<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  assert.doesNotMatch(firstPageMarkup, /<button[^>]*disabled=""[^>]*>Next<\/button>/);
  assert.doesNotMatch(lastPageMarkup, /<button[^>]*disabled=""[^>]*>Previous<\/button>/);
  assert.match(lastPageMarkup, /<button[^>]*disabled=""[^>]*>Next<\/button>/);
});
