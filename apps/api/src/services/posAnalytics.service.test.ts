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
  buildPosBuckets,
  getPosAnalyticsPreviousRange,
  getPosAnalytics,
} = await import('./posAnalytics.service.js');

test('buildPosBuckets aligns week ranges to Monday-Sunday boundaries', () => {
  const buckets = buildPosBuckets({
    granularity: 'week',
    rangeStartYmd: '2026-04-01',
    rangeEndYmd: '2026-04-15',
  });

  assert.deepEqual(
    buckets.map((bucket: any) => ({
      key: bucket.key,
      rangeStartYmd: bucket.rangeStartYmd,
      rangeEndYmd: bucket.rangeEndYmd,
    })),
    [
      {
        key: '2026-03-30',
        rangeStartYmd: '2026-03-30',
        rangeEndYmd: '2026-04-05',
      },
      {
        key: '2026-04-06',
        rangeStartYmd: '2026-04-06',
        rangeEndYmd: '2026-04-12',
      },
      {
        key: '2026-04-13',
        rangeStartYmd: '2026-04-13',
        rangeEndYmd: '2026-04-19',
      },
    ],
  );
});

test('getPosAnalyticsPreviousRange returns the immediately preceding equivalent window', () => {
  assert.deepEqual(
    getPosAnalyticsPreviousRange({
      granularity: 'month',
      rangeStartYmd: '2026-04-01',
      rangeEndYmd: '2026-06-30',
    }),
    {
      granularity: 'month',
      rangeStartYmd: '2026-01-01',
      rangeEndYmd: '2026-03-31',
    },
  );
});

test('getPosAnalytics reuses a superset fetch and aggregates refunded products across all session rows', async () => {
  const odooCalls: Array<{
    model: string;
    method: string;
    args: unknown[];
    kwargs?: Record<string, unknown>;
  }> = [];

  const result = await getPosAnalytics(
    {
      granularity: 'day',
      rangeStartYmd: '2026-04-01',
      rangeEndYmd: '2026-04-02',
      branches: [
        {
          id: 'branch-1',
          name: 'Main Branch',
          companyId: 'company-1',
          companyName: 'Company One',
          odooCompanyId: 5,
        },
      ],
    },
    {
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        odooCalls.push({ model, method, args, kwargs });
        assert.equal(model, 'pos.session');
        assert.equal(method, 'search_read');

        const domainJson = JSON.stringify(args[0] ?? []);
        assert.match(domainJson, /2026-03-29 16:00:00/); 
        assert.match(domainJson, /2026-04-02 15:59:59/);

        return [
          {
            name: 'POS/PRIOR',
            company_id: [5, 'Main Branch'],
            start_at: '2026-03-31 01:00:00',
            stop_at: '2026-03-31 09:00:00',
            state: 'closed',
            cash_register_balance_start: 100,
            cash_register_balance_end: 120,
            cash_register_balance_end_real: 118,
            order_ids: [1, 2],
            x_payment_methods: [
              { amount: 90, payment_method_name: 'Cash' },
            ],
            x_discount_orders: [
              { price_unit: -5, product_name: 'Promo' },
            ],
            x_refund_orders: [
              { price_unit: 4, qty: -1, product_name: 'Prior Item' },
            ],
          },
          {
            name: 'POS/0001',
            company_id: [5, 'Main Branch'],
            start_at: '2026-04-01 01:00:00',
            stop_at: '2026-04-01 09:00:00',
            state: 'closed',
            cash_register_balance_start: 150,
            cash_register_balance_end: 210,
            cash_register_balance_end_real: 205,
            order_ids: [10, 11, 12],
            x_payment_methods: [
              { amount: 150, payment_method_name: 'Cash' },
            ],
            x_discount_orders: [
              { price_unit: -10, product_name: 'Promo' },
            ],
            x_refund_orders: [
              { price_unit: 20, qty: -1, product_name: 'Refund A' },
              { price_unit: 9, qty: -1, product_name: 'Refund B' },
              { price_unit: 8, qty: -1, product_name: 'Refund C' },
              { price_unit: 7, qty: -1, product_name: 'Refund D' },
            ],
          },
          {
            name: 'POS/0002',
            company_id: [5, 'Main Branch'],
            start_at: '2026-04-02 03:00:00',
            stop_at: '2026-04-02 12:00:00',
            state: 'closed',
            cash_register_balance_start: 175,
            cash_register_balance_end: 260,
            cash_register_balance_end_real: 264,
            order_ids: [20, 21, 22, 23],
            x_payment_methods: [
              { amount: 200, payment_method_name: 'Cash' },
            ],
            x_discount_orders: [
              { price_unit: -12, product_name: 'Promo' },
            ],
            x_refund_orders: [
              { price_unit: 10, qty: -1, product_name: 'Refund E' },
              { price_unit: 9, qty: -1, product_name: 'Refund F' },
              { price_unit: 8, qty: -1, product_name: 'Refund G' },
              { price_unit: 7, qty: -1, product_name: 'Refund D' },
            ],
          },
        ];
      },
    },
  );

  assert.equal(result.current.totalSessions, 2);
  assert.equal(result.previousPeriod.totalSessions, 1);
  assert.equal(result.current.netSales, 350);
  assert.equal(result.current.refunds, 78);
  assert.equal(result.current.topRefundedProducts[0]?.product, 'Refund D');
  assert.equal(result.current.topRefundedProducts[0]?.total, 14);
  assert.equal(result.current.topRefundedProducts[0]?.count, 2);
  assert.equal(result.current.topRefundedProducts[1]?.product, 'Refund A');
  assert.equal(result.currentBuckets.length, 2);
  assert.equal(result.branchComparison.length, 1);
  assert.equal(result.branchComparison[0]?.current.totalSessions, 2);
  assert.equal(odooCalls.length, 1);
});
