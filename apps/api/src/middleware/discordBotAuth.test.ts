import assert from 'node:assert/strict';
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

const { createDiscordBotAuthMiddleware } = await import('./discordBotAuth.js');

function createMockResponse() {
  let statusCode = 200;
  let payload: unknown;

  return {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      payload = body;
      return this;
    },
    getSnapshot() {
      return { statusCode, payload };
    },
  };
}

test('discord bot auth returns 503 when integration token is not configured', () => {
  const middleware = createDiscordBotAuthMiddleware(() => undefined);
  const req = { headers: { authorization: 'Bearer any-token' } } as any;
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res as any, () => {
    nextCalled = true;
  });

  const snapshot = res.getSnapshot();
  assert.equal(nextCalled, false);
  assert.equal(snapshot.statusCode, 503);
  assert.deepEqual(snapshot.payload, {
    success: false,
    error: 'Discord integration token is not configured',
  });
});

test('discord bot auth returns 401 when bearer token is missing', () => {
  const middleware = createDiscordBotAuthMiddleware(() => 'expected-token');
  const req = { headers: {} } as any;
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res as any, () => {
    nextCalled = true;
  });

  const snapshot = res.getSnapshot();
  assert.equal(nextCalled, false);
  assert.equal(snapshot.statusCode, 401);
  assert.deepEqual(snapshot.payload, {
    success: false,
    error: 'Unauthorized',
  });
});

test('discord bot auth returns 401 when bearer token is invalid', () => {
  const middleware = createDiscordBotAuthMiddleware(() => 'expected-token');
  const req = { headers: { authorization: 'Bearer wrong-token' } } as any;
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res as any, () => {
    nextCalled = true;
  });

  const snapshot = res.getSnapshot();
  assert.equal(nextCalled, false);
  assert.equal(snapshot.statusCode, 401);
  assert.deepEqual(snapshot.payload, {
    success: false,
    error: 'Unauthorized',
  });
});

test('discord bot auth calls next when bearer token is valid', () => {
  const middleware = createDiscordBotAuthMiddleware(() => 'expected-token');
  const req = { headers: { authorization: 'Bearer expected-token' } } as any;
  const res = createMockResponse();
  let nextCalled = false;

  middleware(req, res as any, () => {
    nextCalled = true;
  });

  const snapshot = res.getSnapshot();
  assert.equal(nextCalled, true);
  assert.equal(snapshot.statusCode, 200);
  assert.equal(snapshot.payload, undefined);
});
