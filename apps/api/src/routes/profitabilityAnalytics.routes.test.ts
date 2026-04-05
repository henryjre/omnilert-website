import assert from 'node:assert/strict';
import test from 'node:test';
import router from './profitabilityAnalytics.routes.js';

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

test('profitability analytics routes expose the profitability read endpoint', () => {
  assert.equal(hasRoute('/', 'GET'), true);
});
