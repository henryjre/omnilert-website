import assert from 'node:assert/strict';
import test from 'node:test';

import {
  getStickyHeaderObserverRootMargin,
  isStickyHeaderStuck,
} from '../src/features/employee-analytics/stickyHeader.ts';

test('marks the header as stuck relative to the dashboard scroll container', () => {
  assert.equal(
    isStickyHeaderStuck({
      containerTop: 64,
      elementTop: 40,
      stickyTop: -24,
    }),
    true,
  );
});

test('keeps the header unstuck until it reaches the sticky threshold', () => {
  assert.equal(
    isStickyHeaderStuck({
      containerTop: 64,
      elementTop: 96,
      stickyTop: -24,
    }),
    false,
  );
});

test('supports viewport-root sticky headers as a fallback', () => {
  assert.equal(
    isStickyHeaderStuck({
      containerTop: 0,
      elementTop: -16,
      stickyTop: -16,
    }),
    true,
  );
});

test('builds the observer root margin from the sticky top offset', () => {
  assert.equal(getStickyHeaderObserverRootMargin(-24), '24px 0px 0px 0px');
  assert.equal(getStickyHeaderObserverRootMargin(-16), '16px 0px 0px 0px');
  assert.equal(getStickyHeaderObserverRootMargin(0), '0px 0px 0px 0px');
});
