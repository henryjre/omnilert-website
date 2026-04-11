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

const {
  createOdooRpcClient,
  archiveEmployeesByWebsiteUserKey,
  unarchiveEmployeesByWebsiteUserKey,
  upsertBreakWorkEntry,
} = await import('./odoo.service.js');

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createJsonResponse(result: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {
      get: () => null,
    },
    json: async () => ({ result }),
  };
}

test('createOdooRpcClient retries 429 responses using retry-after before succeeding', async () => {
  const sleepCalls: number[] = [];
  let attempts = 0;

  const client = createOdooRpcClient({
    maxConcurrentRequests: 1,
    max429Retries: 2,
    baseRetryDelayMs: 250,
    logger: {
      warn: () => undefined,
      error: () => undefined,
    },
    sleep: async (ms: number) => {
      sleepCalls.push(ms);
    },
    fetchImpl: async () => {
      attempts += 1;

      if (attempts === 1) {
        return {
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          headers: {
            get: (name: string) => (name.toLowerCase() === 'retry-after' ? '2' : null),
          },
          json: async () => ({}),
        };
      }

      return createJsonResponse([{ id: 1 }]);
    },
  });

  const result = await client.callOdooKw('pos.order', 'search_read', [], { limit: 1 });

  assert.deepEqual(result, [{ id: 1 }]);
  assert.equal(attempts, 2);
  assert.deepEqual(sleepCalls, [2000]);
});

test('createOdooRpcClient limits concurrent JSON-RPC calls', async () => {
  const firstRequest = createDeferred<ReturnType<typeof createJsonResponse>>();
  const secondRequest = createDeferred<ReturnType<typeof createJsonResponse>>();
  const fetchOrder: number[] = [];
  let fetchCalls = 0;

  const client = createOdooRpcClient({
    maxConcurrentRequests: 1,
    max429Retries: 0,
    logger: {
      warn: () => undefined,
      error: () => undefined,
    },
    fetchImpl: async () => {
      fetchCalls += 1;
      fetchOrder.push(fetchCalls);
      return fetchCalls === 1 ? firstRequest.promise : secondRequest.promise;
    },
  });

  const firstCall = client.callOdooKw('pos.order', 'search_read', [], { limit: 1 });
  const secondCall = client.callOdooKw('hr.attendance', 'search_read', [], { limit: 1 });

  await Promise.resolve();
  assert.equal(fetchCalls, 1);

  firstRequest.resolve(createJsonResponse([{ id: 'first' }]));
  assert.deepEqual(await firstCall, [{ id: 'first' }]);

  await Promise.resolve();
  assert.equal(fetchCalls, 2);

  secondRequest.resolve(createJsonResponse([{ id: 'second' }]));
  assert.deepEqual(await secondCall, [{ id: 'second' }]);
  assert.deepEqual(fetchOrder, [1, 2]);
});

test('archiveEmployeesByWebsiteUserKey includes inactive employees in lookup and archives active matches', async () => {
  const calls: Array<{
    model: string;
    method: string;
    args: unknown[];
    kwargs?: Record<string, unknown>;
  }> = [];

  const result = await archiveEmployeesByWebsiteUserKey(
    { websiteUserKey: 'website-key-1' },
    {
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        calls.push({ model, method, args, kwargs });

        if (method === 'search_read') {
          return [
            { id: 10, active: true },
            { id: 11, active: false },
            { id: 10, active: true },
          ];
        }

        if (method === 'write') {
          return true;
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    },
  );

  assert.deepEqual(result, { matchedCount: 2, archivedCount: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.model, 'hr.employee');
  assert.equal(calls[0]?.method, 'search_read');
  assert.deepEqual(calls[0]?.kwargs?.context, { active_test: false });
  assert.equal(calls[1]?.model, 'hr.employee');
  assert.equal(calls[1]?.method, 'write');
  assert.deepEqual(calls[1]?.args, [[10], { active: false }]);
});

test('archiveEmployeesByWebsiteUserKey skips calls when website key is blank', async () => {
  let called = false;
  const result = await archiveEmployeesByWebsiteUserKey(
    { websiteUserKey: '   ' },
    {
      callOdooKwFn: async () => {
        called = true;
        return [];
      },
    },
  );

  assert.deepEqual(result, { matchedCount: 0, archivedCount: 0 });
  assert.equal(called, false);
});

test('unarchiveEmployeesByWebsiteUserKey includes inactive employees in lookup and unarchives inactive matches', async () => {
  const calls: Array<{
    model: string;
    method: string;
    args: unknown[];
    kwargs?: Record<string, unknown>;
  }> = [];

  const result = await unarchiveEmployeesByWebsiteUserKey(
    { websiteUserKey: 'website-key-1' },
    {
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        calls.push({ model, method, args, kwargs });

        if (method === 'search_read') {
          return [
            { id: 10, active: true },
            { id: 11, active: false },
            { id: 11, active: false },
          ];
        }

        if (method === 'write') {
          return true;
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    },
  );

  assert.deepEqual(result, { matchedCount: 2, unarchivedCount: 1 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.model, 'hr.employee');
  assert.equal(calls[0]?.method, 'search_read');
  assert.deepEqual(calls[0]?.kwargs?.context, { active_test: false });
  assert.equal(calls[1]?.model, 'hr.employee');
  assert.equal(calls[1]?.method, 'write');
  assert.deepEqual(calls[1]?.args, [[11], { active: true }]);
});

test('upsertBreakWorkEntry creates a type-129 break work entry when none exists for the employee and date', async () => {
  const calls: Array<{
    model: string;
    method: string;
    args: unknown[];
    kwargs?: Record<string, unknown>;
  }> = [];

  const result = await upsertBreakWorkEntry(
    {
      employeeId: 501,
      date: '2026-04-02',
      durationMinutes: 30,
    },
    {
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        calls.push({ model, method, args, kwargs });

        if (method === 'search_read') {
          return [];
        }

        if (method === 'create') {
          return 9876;
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    },
  );

  assert.deepEqual(result, { id: 9876, action: 'created', durationHours: 0.5 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.model, 'hr.work.entry');
  assert.equal(calls[0]?.method, 'search_read');
  assert.equal(calls[1]?.model, 'hr.work.entry');
  assert.equal(calls[1]?.method, 'create');
  assert.deepEqual(calls[1]?.args, [
    {
      employee_id: 501,
      date: '2026-04-02',
      work_entry_type_id: 129,
      duration: 0.5,
      name: 'Break - Synced from Omnilert',
    },
  ]);
});

test('upsertBreakWorkEntry increases the existing type-129 break work entry duration by the new break minutes', async () => {
  const calls: Array<{
    model: string;
    method: string;
    args: unknown[];
    kwargs?: Record<string, unknown>;
  }> = [];

  const result = await upsertBreakWorkEntry(
    {
      employeeId: 502,
      date: '2026-04-03',
      durationMinutes: 15,
    },
    {
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        calls.push({ model, method, args, kwargs });

        if (method === 'search_read') {
          return [{ id: 321, duration: 0.5 }];
        }

        if (method === 'write') {
          return true;
        }

        throw new Error(`Unexpected method: ${method}`);
      },
    },
  );

  assert.deepEqual(result, { id: 321, action: 'updated', durationHours: 0.75 });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.model, 'hr.work.entry');
  assert.equal(calls[0]?.method, 'search_read');
  assert.equal(calls[1]?.model, 'hr.work.entry');
  assert.equal(calls[1]?.method, 'write');
  assert.deepEqual(calls[1]?.args, [[321], { duration: 0.75, name: 'Break - Synced from Omnilert' }]);
});

test('unarchiveEmployeesByWebsiteUserKey skips calls when website key is blank', async () => {
  let called = false;
  const result = await unarchiveEmployeesByWebsiteUserKey(
    { websiteUserKey: '   ' },
    {
      callOdooKwFn: async () => {
        called = true;
        return [];
      },
    },
  );

  assert.deepEqual(result, { matchedCount: 0, unarchivedCount: 0 });
  assert.equal(called, false);
});
