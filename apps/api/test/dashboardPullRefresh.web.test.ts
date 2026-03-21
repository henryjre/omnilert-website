import assert from 'node:assert/strict';
import test from 'node:test';

type ResolveDashboardPullMetrics = (distance: number) => {
  distance: number;
  progress: number;
  armed: boolean;
};

let resolveDashboardPullMetrics: ResolveDashboardPullMetrics | undefined;
let DASHBOARD_PULL_REFRESH_TRIGGER_PX: number | undefined;
let DASHBOARD_PULL_REFRESH_MAX_PULL_PX: number | undefined;

try {
  const mod = await import('../../web/src/features/dashboard/services/dashboardPullRefresh.js');
  resolveDashboardPullMetrics = mod.resolveDashboardPullMetrics as ResolveDashboardPullMetrics;
  DASHBOARD_PULL_REFRESH_TRIGGER_PX = mod.DASHBOARD_PULL_REFRESH_TRIGGER_PX as number;
  DASHBOARD_PULL_REFRESH_MAX_PULL_PX = mod.DASHBOARD_PULL_REFRESH_MAX_PULL_PX as number;
} catch {
  resolveDashboardPullMetrics = undefined;
  DASHBOARD_PULL_REFRESH_TRIGGER_PX = undefined;
  DASHBOARD_PULL_REFRESH_MAX_PULL_PX = undefined;
}

test('resolveDashboardPullMetrics reports partial progress below the refresh threshold', () => {
  assert.equal(typeof resolveDashboardPullMetrics, 'function');
  assert.equal(DASHBOARD_PULL_REFRESH_TRIGGER_PX, 72);

  const result = resolveDashboardPullMetrics?.(36);

  assert.deepEqual(result, {
    distance: 36,
    progress: 0.5,
    armed: false,
  });
});

test('resolveDashboardPullMetrics arms refresh at the threshold and clamps to the max pull distance', () => {
  assert.equal(typeof resolveDashboardPullMetrics, 'function');
  assert.equal(DASHBOARD_PULL_REFRESH_MAX_PULL_PX, 108);

  const result = resolveDashboardPullMetrics?.(140);

  assert.deepEqual(result, {
    distance: 108,
    progress: 1,
    armed: true,
  });
});

test('resolveDashboardPullMetrics resets negative pulls to an idle value', () => {
  assert.equal(typeof resolveDashboardPullMetrics, 'function');

  const result = resolveDashboardPullMetrics?.(-12);

  assert.deepEqual(result, {
    distance: 0,
    progress: 0,
    armed: false,
  });
});
