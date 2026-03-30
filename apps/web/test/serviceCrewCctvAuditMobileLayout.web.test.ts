import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const detailPanelSource = readFileSync(
  new URL('../src/features/store-audits/components/ServiceCrewCctvAuditDetailPanel.tsx', import.meta.url),
  'utf8',
);

const yesNoPillSource = readFileSync(
  new URL('../src/features/store-audits/components/YesNoPill.tsx', import.meta.url),
  'utf8',
);

const starRatingInputSource = readFileSync(
  new URL('../src/features/store-audits/components/StarRatingInput.tsx', import.meta.url),
  'utf8',
);

test('SCC compliance criteria stacks copy and controls on mobile before returning to a desktop row', () => {
  assert.match(detailPanelSource, /flex flex-col gap-3 md:flex-row md:items-start md:justify-between/);
});

test('SCC yes-no pill uses a full-width mobile control bar with balanced buttons', () => {
  assert.match(yesNoPillSource, /w-full rounded-2xl/);
  assert.match(yesNoPillSource, /relative flex w-full items-center gap-1/);
  assert.match(yesNoPillSource, /relative flex-1 overflow-hidden rounded-xl/);
  assert.match(yesNoPillSource, /sm:inline-flex sm:w-auto sm:flex-nowrap/);
});

test('SCC star rating input spreads stars comfortably across mobile width', () => {
  assert.match(starRatingInputSource, /flex w-full items-center justify-between/);
  assert.match(starRatingInputSource, /rounded-xl border border-amber-100\/60 bg-amber-50\/45/);
  assert.match(starRatingInputSource, /sm:w-auto sm:justify-start/);
});
