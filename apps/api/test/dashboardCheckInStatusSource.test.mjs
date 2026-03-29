import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('dashboard check-in status resolves latest attendance from webhook-backed shift logs', () => {
  const controllerFile = new URL('../src/controllers/dashboard.controller.ts', import.meta.url);
  const source = readFileSync(controllerFile, 'utf8');

  assert.doesNotMatch(source, /getLatestActiveAttendanceForWebsiteUserKey/);
  assert.match(source, /getLatestAttendanceWebhookEventForWebsiteUserKey/);
  assert.match(source, /whereIn\('sl\.log_type', \['check_in', 'check_out'\]\)/);
  assert.match(source, /sl\.odoo_payload->>'x_website_key'/);
});

