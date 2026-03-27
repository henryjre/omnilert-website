import assert from "node:assert/strict";
import test from "node:test";

process.env.JWT_SECRET ??= "test-jwt-secret-12345";
process.env.JWT_REFRESH_SECRET ??= "test-jwt-refresh-secret";
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= "test-bootstrap-secret-1234567890";
process.env.SUPER_ADMIN_JWT_SECRET ??= "test-super-admin-jwt-secret-123456";
process.env.ODOO_DB ??= "test-odoo-db";
process.env.ODOO_URL ??= "http://localhost:8069";
process.env.ODOO_USERNAME ??= "test-odoo-user@example.com";
process.env.ODOO_PASSWORD ??= "test-odoo-password";
process.env.OPENAI_API_KEY ??= "test-openai-key";
process.env.OPENAI_ORGANIZATION_ID ??= "test-openai-org";
process.env.OPENAI_PROJECT_ID ??= "test-openai-project";

const { createRandomWrsDelayMs, buildWrsEffectiveAt } = await import("./peerEvaluation.service.js");

const TEN_DAYS_IN_MS = 10 * 24 * 60 * 60 * 1000;

test("createRandomWrsDelayMs clamps to 0..10 days inclusive bounds", () => {
  assert.equal(createRandomWrsDelayMs(0), 0);
  assert.equal(createRandomWrsDelayMs(1), TEN_DAYS_IN_MS);
  assert.equal(createRandomWrsDelayMs(-3), 0);
  assert.equal(createRandomWrsDelayMs(2), TEN_DAYS_IN_MS);
});

test("buildWrsEffectiveAt returns submittedAt plus deterministic random delay", () => {
  const submittedAt = new Date("2026-03-26T12:00:00.000Z");
  const effectiveAt = buildWrsEffectiveAt(submittedAt, 0.5);
  const delayMs = effectiveAt.getTime() - submittedAt.getTime();

  assert.ok(delayMs >= 0);
  assert.ok(delayMs <= TEN_DAYS_IN_MS);
  assert.equal(delayMs, Math.floor(0.5 * TEN_DAYS_IN_MS));
});
