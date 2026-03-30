import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const yesNoPillSource = readFileSync(
  new URL('../src/features/store-audits/components/YesNoPill.tsx', import.meta.url),
  'utf8',
);

const starRatingInputSource = readFileSync(
  new URL('../src/features/store-audits/components/StarRatingInput.tsx', import.meta.url),
  'utf8',
);

test('SCC yes-no pill uses a sliding thumb with reduced-motion fallback', () => {
  assert.match(yesNoPillSource, /motion/);
  assert.match(yesNoPillSource, /useReducedMotion/);
  assert.match(yesNoPillSource, /selectedIndex/);
  assert.match(yesNoPillSource, /buttonRefs/);
  assert.match(yesNoPillSource, /animate=\{\{\s*x:\s*thumbPosition\.x,\s*width:\s*thumbPosition\.width/);
});

test('SCC star rating input animates star selection with motion and reduced-motion awareness', () => {
  assert.match(starRatingInputSource, /motion/);
  assert.match(starRatingInputSource, /useReducedMotion/);
  assert.match(starRatingInputSource, /whileTap=/);
  assert.match(starRatingInputSource, /animate=\{/);
});

test('SCC star rating input gives stars a tactile chip treatment that visually matches the pill control', () => {
  assert.match(starRatingInputSource, /border-amber-200\/85 bg-amber-50\/95/);
  assert.match(starRatingInputSource, /shadow-\[0_3px_10px_rgba\(245,158,11,0\.14\)\]/);
  assert.match(starRatingInputSource, /border-amber-100\/70 bg-white\/72/);
  assert.doesNotMatch(starRatingInputSource, /blur-md/);
});

test('SCC yes-no pill constrains desktop track width for a compact slider layout', () => {
  assert.match(yesNoPillSource, /sm:inline-flex sm:w-auto/);
  assert.match(yesNoPillSource, /sm:flex-none/);
  assert.match(yesNoPillSource, /whitespace-nowrap/);
});
