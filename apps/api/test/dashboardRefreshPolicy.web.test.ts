import assert from 'node:assert/strict';
import test from 'node:test';

type GetDashboardRefreshPolicy = (args: {
  selectedMonthKey: string | null | undefined;
  currentMonthKey: string | null | undefined;
}) => {
  staleTime: number;
  refetchOnWindowFocus: boolean;
  refetchOnMount: boolean | 'always';
  refetchInterval: number | false;
  refetchIntervalInBackground: boolean;
};

let getDashboardRefreshPolicy: GetDashboardRefreshPolicy | undefined;

try {
  const mod = await import('../../web/src/features/dashboard/services/dashboardRefreshPolicy.js');
  getDashboardRefreshPolicy = mod.getDashboardRefreshPolicy as GetDashboardRefreshPolicy;
} catch {
  getDashboardRefreshPolicy = undefined;
}

test('getDashboardRefreshPolicy enables live refresh for the selected current month', () => {
  assert.equal(typeof getDashboardRefreshPolicy, 'function');

  const result = getDashboardRefreshPolicy?.({
    selectedMonthKey: '2026-03',
    currentMonthKey: '2026-03',
  });

  assert.deepEqual(result, {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchInterval: 300_000,
    refetchIntervalInBackground: false,
  });
});

test('getDashboardRefreshPolicy keeps historical months infinitely fresh with no auto-refetch', () => {
  assert.equal(typeof getDashboardRefreshPolicy, 'function');

  const result = getDashboardRefreshPolicy?.({
    selectedMonthKey: '2026-02',
    currentMonthKey: '2026-03',
  });

  assert.deepEqual(result, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });
});
