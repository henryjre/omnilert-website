import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const { default: router } = await import('./discordIntegration.routes.js');

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
  };
};

function hasRoute(path: string, method: string): boolean {
  const routeMethod = method.toLowerCase();

  return ((router as unknown as { stack?: RouteLayer[] }).stack ?? []).some((layer) => (
    layer.route?.path === path && layer.route.methods?.[routeMethod] === true
  ));
}

test('discord integration routes expose list and lookup endpoints', () => {
  assert.equal(hasRoute('/users', 'GET'), true);
  assert.equal(hasRoute('/users/lookup', 'GET'), true);
  assert.equal(hasRoute('/registration-requests/status', 'GET'), true);
  assert.equal(hasRoute('/registration-requests/discord-id', 'POST'), true);
  assert.equal(hasRoute('/users/discord-id', 'POST'), true);
});

test('discord integration routes apply bot auth middleware', () => {
  const routeFile = new URL('./discordIntegration.routes.ts', import.meta.url);
  const source = readFileSync(routeFile, 'utf8');
  assert.match(source, /router\.use\(authenticateDiscordBot\);/);
});
