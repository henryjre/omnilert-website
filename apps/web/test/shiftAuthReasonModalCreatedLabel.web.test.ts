import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const modalSource = readFileSync(
  new URL('../src/features/account/components/ShiftAuthReasonModal.tsx', import.meta.url),
  'utf8',
);

test('ShiftAuthReasonModal labels created_at as Created', () => {
  assert.match(
    modalSource,
    /<span className="text-gray-500">Created<\/span>\s*<span className="text-gray-700">\{fmtDateTime\(data\.created_at\)\}<\/span>/,
    'ShiftAuthReasonModal should label the created_at timestamp as Created',
  );
  assert.doesNotMatch(
    modalSource,
    /<span className="text-gray-500">Submitted<\/span>\s*<span className="text-gray-700">\{fmtDateTime\(data\.created_at\)\}<\/span>/,
    'ShiftAuthReasonModal should not label the created_at timestamp as Submitted',
  );
});
