import assert from 'node:assert/strict';
import test from 'node:test';

const {
  CSS_AUDIT_SAMPLE_RATE,
  shouldCreateCssAudit,
} = await import('./webhookSampling.js');

test('shouldCreateCssAudit uses the 25 percent sampling threshold', () => {
  assert.equal(CSS_AUDIT_SAMPLE_RATE, 0.25);
  assert.equal(shouldCreateCssAudit(0), true);
  assert.equal(shouldCreateCssAudit(0.25), true);
  assert.equal(shouldCreateCssAudit(0.25001), false);
});
