import assert from 'node:assert/strict';
import test from 'node:test';

const {
  CSS_AUDIT_SAMPLE_RATE,
  resolveCssAuditSampleRate,
  shouldCreateCssAudit,
} = await import('./webhookSampling.js');

test('resolveCssAuditSampleRate falls back to the default threshold', () => {
  assert.equal(CSS_AUDIT_SAMPLE_RATE, 0.1);
  assert.equal(resolveCssAuditSampleRate({} as NodeJS.ProcessEnv), 0.1);
  assert.equal(resolveCssAuditSampleRate({ CSS_AUDIT_SAMPLE_RATE: '' } as NodeJS.ProcessEnv), 0.1);
  assert.equal(resolveCssAuditSampleRate({ CSS_AUDIT_SAMPLE_RATE: 'not-a-number' } as NodeJS.ProcessEnv), 0.1);
});

test('resolveCssAuditSampleRate uses the env override and clamps it into range', () => {
  assert.equal(resolveCssAuditSampleRate({ CSS_AUDIT_SAMPLE_RATE: '1' } as NodeJS.ProcessEnv), 1);
  assert.equal(resolveCssAuditSampleRate({ CSS_AUDIT_SAMPLE_RATE: '0.35' } as NodeJS.ProcessEnv), 0.35);
  assert.equal(resolveCssAuditSampleRate({ CSS_AUDIT_SAMPLE_RATE: '3' } as NodeJS.ProcessEnv), 1);
  assert.equal(resolveCssAuditSampleRate({ CSS_AUDIT_SAMPLE_RATE: '-1' } as NodeJS.ProcessEnv), 0);
});

test('shouldCreateCssAudit uses the provided sampling threshold', () => {
  assert.equal(shouldCreateCssAudit(0), true);
  assert.equal(shouldCreateCssAudit(0.1), true);
  assert.equal(shouldCreateCssAudit(0.10001), false);
  assert.equal(shouldCreateCssAudit(0.7, 1), true);
  assert.equal(shouldCreateCssAudit(0.7, 0.5), false);
});
