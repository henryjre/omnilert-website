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
  buildProfitabilityBuckets,
  getProfitabilityPreviousRange,
  getProfitabilityAnalytics,
} = await import('./profitabilityAnalytics.service.js');

test('buildProfitabilityBuckets aligns week ranges to Monday-Sunday boundaries', () => {
  const buckets = buildProfitabilityBuckets({
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

test('getProfitabilityPreviousRange uses the immediately preceding same-length window', () => {
  assert.deepEqual(
    getProfitabilityPreviousRange({
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

  assert.deepEqual(
    getProfitabilityPreviousRange({
      granularity: 'year',
      rangeStartYmd: '2026-03-28',
      rangeEndYmd: '2027-12-31',
    }),
    {
      granularity: 'year',
      rangeStartYmd: '2024-01-01',
      rangeEndYmd: '2025-12-31',
    },
  );
});

test('getProfitabilityAnalytics prorates monthly overhead across days and estimates a month from the immediately previous actual month', async () => {
  const odooCalls: Array<{
    model: string;
    method: string;
    args: unknown[];
    kwargs?: Record<string, unknown>;
  }> = [];

  const result = await getProfitabilityAnalytics(
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
          variableExpenseVendorIds: [125, 3022],
          overheadAccountIds: [107, 2507],
        },
      ],
    },
    {
      now: () => new Date('2026-04-02T12:00:00+08:00'),
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        odooCalls.push({ model, method, args, kwargs });
        assert.equal(method, 'search_read');

        const domainJson = JSON.stringify(kwargs?.domain ?? []);

        if (model === 'pos.session' && domainJson.includes('2026-03-31 16:00:00')) {
          return [
            {
              name: 'POS/0001',
              company_id: [5, 'Main Branch'],
              start_at: '2026-04-01 01:00:00',
              x_discount_orders: [
                {
                  price_unit: -10,
                },
              ],
              x_refund_orders: [
                {
                  price_unit: 12,
                  qty: -2,
                },
              ],
              x_payment_methods: [
                {
                  amount: 150,
                },
              ],
            },
          ];
        }

        if (model === 'pos.session' && domainJson.includes('2026-03-29 16:00:00')) {
          return [
            {
              name: 'POS/PRIOR',
              company_id: [5, 'Main Branch'],
              start_at: '2026-03-30 02:00:00',
              x_discount_orders: [
                {
                  price_unit: -5,
                },
              ],
              x_refund_orders: [
                {
                  price_unit: 10,
                  qty: -1,
                },
              ],
              x_payment_methods: [
                {
                  amount: 100,
                },
              ],
            },
          ];
        }

        if (
          model === 'account.move.line'
          && domainJson.includes('POS/0001')
          && domainJson.includes('100')
        ) {
          return [
            {
              ref: 'POS/0001',
              debit: 40,
              credit: 5,
            },
          ];
        }

        if (model === 'account.move.line' && domainJson.includes('POS/0001')) {
          return [
            {
              ref: 'POS/0001',
              debit: 0,
              credit: 150,
            },
            {
              ref: 'POS/0001',
              debit: 40,
              credit: 5,
            },
            {
              ref: 'POS/0001',
              debit: 115,
              credit: 0,
            },
          ];
        }

        if (
          model === 'account.move.line'
          && domainJson.includes('POS/PRIOR')
          && domainJson.includes('100')
        ) {
          return [
            {
              ref: 'POS/PRIOR',
              debit: 20,
              credit: 0,
            },
          ];
        }

        if (model === 'account.move.line' && domainJson.includes('POS/PRIOR')) {
          return [
            {
              ref: 'POS/PRIOR',
              debit: 0,
              credit: 100,
            },
            {
              ref: 'POS/PRIOR',
              debit: 20,
              credit: 0,
            },
            {
              ref: 'POS/PRIOR',
              debit: 80,
              credit: 0,
            },
          ];
        }

        if (
          model === 'purchase.order'
          && domainJson.includes('2026-03-31 16:00:00')
          && domainJson.includes('1053')
          && domainJson.includes('1052')
          && domainJson.includes('1054')
        ) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date_approve: '2026-04-01 05:00:00',
              amount_total: 20,
            },
          ];
        }

        if (
          model === 'purchase.order'
          && domainJson.includes('2026-03-29 16:00:00')
          && domainJson.includes('1053')
          && domainJson.includes('1052')
          && domainJson.includes('1054')
        ) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date_approve: '2026-03-30 05:00:00',
              amount_total: 10,
            },
          ];
        }

        if (model === 'hr.work.entry' && domainJson.includes('2026-04-01')) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date: '2026-04-01',
              x_total_wage: 30,
            },
          ];
        }

        if (model === 'hr.work.entry' && domainJson.includes('2026-03-30')) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date: '2026-03-30',
              x_total_wage: 20,
            },
          ];
        }

        if (
          model === 'account.move.line'
          && domainJson.includes('107')
          && domainJson.includes('2026-03-01')
          && domainJson.includes('2026-04-30')
        ) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date: '2026-03-15',
              debit: 310,
              credit: 0,
            },
          ];
        }

        if (
          model === 'account.move.line'
          && domainJson.includes('107')
          && domainJson.includes('2026-02-01')
          && domainJson.includes('2026-03-31')
        ) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date: '2026-03-15',
              debit: 310,
              credit: 0,
            },
          ];
        }

        throw new Error(`Unhandled Odoo call: ${model} ${domainJson}`);
      },
    },
  );

  assert.equal(result.selectedBranches.length, 1);
  assert.equal(result.current.grossSales, 184);
  assert.equal(result.current.discounts, 10);
  assert.equal(result.current.refunds, 24);
  assert.equal(result.current.netSales, 150);
  assert.equal(result.current.cogs, 35);
  assert.equal(result.current.grossProfit, 115);
  assert.equal(result.current.variableExpenses, 20);
  assert.equal(result.current.grossSalary, 30);
  assert.equal(result.current.operatingProfit, 65);
  assert.equal(result.current.overheadExpenses, 20.67);
  assert.equal(result.current.netProfit, 44.33);
  assert.equal(result.current.overheadSource, 'estimated');
  assert.equal(result.current.netProfitSource, 'estimated');
  assert.equal(result.current.expenseRatio, 47.11);

  assert.equal(result.previousPeriod.grossSales, 115);
  assert.equal(result.previousPeriod.netSales, 100);
  assert.equal(result.previousPeriod.overheadExpenses, 20);
  assert.equal(result.previousPeriod.overheadSource, 'actual');
  assert.equal(result.previousPeriod.netProfit, 30);

  assert.equal(result.currentBuckets.length, 2);
  assert.equal(result.currentBuckets[0]?.key, '2026-04-01');
  assert.equal(result.currentBuckets[0]?.grossSales, 184);
  assert.equal(result.currentBuckets[0]?.overheadExpenses, 10.33);
  assert.equal(result.currentBuckets[0]?.overheadSource, 'estimated');
  assert.equal(result.branchComparison.length, 1);
  assert.equal(result.branchComparison[0]?.branch.id, 'branch-1');
  assert.equal(result.branchComparison[0]?.current.netProfit, 44.33);
  assert.equal(result.branchComparison[0]?.previousPeriod.netProfit, 30);

  assert.ok(
    odooCalls.some((call) => call.model === 'pos.session' && JSON.stringify(call.kwargs?.domain ?? []).includes('2026-03-31 16:00:00')),
  );
});

test('getProfitabilityAnalytics does not chain monthly overhead estimates beyond one month', async () => {
  const result = await getProfitabilityAnalytics(
    {
      granularity: 'month',
      rangeStartYmd: '2026-04-01',
      rangeEndYmd: '2026-05-31',
      branches: [
        {
          id: 'branch-1',
          name: 'Main Branch',
          companyId: 'company-1',
          companyName: 'Company One',
          odooCompanyId: 5,
          variableExpenseVendorIds: [125, 3022],
          overheadAccountIds: [107, 2507],
        },
      ],
    },
    {
      now: () => new Date('2026-05-10T12:00:00+08:00'),
      callOdooKwFn: async (
        model: string,
        method: string,
        args: unknown[],
        kwargs?: Record<string, unknown>,
      ) => {
        assert.equal(method, 'search_read');
        const domainJson = JSON.stringify(kwargs?.domain ?? []);

        if (model === 'pos.session') {
          return [];
        }

        if (model === 'purchase.order') {
          return [];
        }

        if (model === 'hr.work.entry') {
          return [];
        }

        if (
          model === 'account.move.line'
          && domainJson.includes('107')
          && domainJson.includes('2026-03-01')
          && domainJson.includes('2026-05-31')
        ) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date: '2026-03-15',
              debit: 310,
              credit: 0,
            },
          ];
        }

        if (
          model === 'account.move.line'
          && domainJson.includes('107')
          && domainJson.includes('2026-01-01')
          && domainJson.includes('2026-03-31')
        ) {
          return [
            {
              company_id: [5, 'Main Branch'],
              date: '2026-02-10',
              debit: 280,
              credit: 0,
            },
            {
              company_id: [5, 'Main Branch'],
              date: '2026-03-15',
              debit: 310,
              credit: 0,
            },
          ];
        }

        if (model === 'account.move.line') {
          return [];
        }

        throw new Error(`Unhandled Odoo call: ${model} ${domainJson}`);
      },
    },
  );

  assert.equal(result.current.overheadExpenses, 310);
  assert.equal(result.current.overheadSource, 'estimated');
  assert.equal(result.previousPeriod.overheadExpenses, 590);
  assert.equal(result.previousPeriod.overheadSource, 'actual');
  assert.equal(result.currentBuckets.length, 2);
  assert.equal(result.currentBuckets[0]?.key, '2026-04');
  assert.equal(result.currentBuckets[0]?.overheadExpenses, 310);
  assert.equal(result.currentBuckets[0]?.overheadSource, 'estimated');
  assert.equal(result.currentBuckets[1]?.key, '2026-05');
  assert.equal(result.currentBuckets[1]?.overheadExpenses, 0);
});
