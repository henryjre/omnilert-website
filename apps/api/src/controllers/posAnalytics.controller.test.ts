import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('pos analytics read controller does not dispatch alerts as a side effect', () => {
  const controllerSource = readFileSync(new URL('./posAnalytics.controller.ts', import.meta.url), 'utf8');

  assert.doesNotMatch(
    controllerSource,
    /runPosAlerts|posAnalyticsAlerts\.service/,
    'POS analytics reads should not trigger alert delivery directly',
  );
});
