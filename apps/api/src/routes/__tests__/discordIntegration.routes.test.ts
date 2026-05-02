import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

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

const { createDiscordSystemAdjustmentSchema } = await import('@omnilert/shared');
const { default: router } = await import('../discordIntegration.routes.js');

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

test('discord integration routes expose list, lookup, and system adjustment endpoints', () => {
  expect(hasRoute('/users', 'GET')).toBe(true);
  expect(hasRoute('/users/lookup', 'GET')).toBe(true);
  expect(hasRoute('/registration-requests/status', 'GET')).toBe(true);
  expect(hasRoute('/adjustments', 'POST')).toBe(true);
  expect(hasRoute('/registration-requests/discord-id', 'POST')).toBe(true);
  expect(hasRoute('/users/discord-id', 'POST')).toBe(true);
});

test('discord integration routes apply bot auth middleware', () => {
  const routeFile = new URL('../discordIntegration.routes.ts', import.meta.url);
  const source = readFileSync(routeFile, 'utf8');
  expect(source).toMatch(/router\.use\(authenticateDiscordBot\);/);
});

test('discord system adjustment schema validates bot payloads', () => {
  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: '123456789012345678',
    adjustment_type: 'token_pay',
    adjustment_direction: 'deduction',
    amount: 100,
    reason: 'Manual Discord adjustment',
  }).success).toBe(true);

  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: 'not-discord',
    adjustment_type: 'token_pay',
    adjustment_direction: 'deduction',
    amount: 100,
    reason: 'Manual Discord adjustment',
  }).success).toBe(false);

  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: '123456789012345678',
    adjustment_type: 'unknown',
    adjustment_direction: 'deduction',
    amount: 100,
    reason: 'Manual Discord adjustment',
  }).success).toBe(false);

  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: '123456789012345678',
    adjustment_type: 'payroll',
    adjustment_direction: 'deduction',
    amount: 0,
    reason: 'Manual Discord adjustment',
  }).success).toBe(false);

  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: '123456789012345678',
    adjustment_type: 'epi_adjustment',
    adjustment_direction: 'deduction',
    amount: 1.234,
    reason: 'Manual Discord adjustment',
  }).success).toBe(false);

  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: '123456789012345678',
    adjustment_type: 'epi_adjustment',
    adjustment_direction: 'invalid',
    amount: 1,
    reason: 'Manual Discord adjustment',
  }).success).toBe(false);

  expect(createDiscordSystemAdjustmentSchema.safeParse({
    discord_id: '123456789012345678',
    adjustment_type: 'epi_adjustment',
    adjustment_direction: 'deduction',
    amount: 1,
    reason: '',
  }).success).toBe(false);
});
