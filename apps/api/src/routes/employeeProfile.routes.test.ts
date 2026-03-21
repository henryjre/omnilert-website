import assert from 'node:assert/strict';
import test from 'node:test';
import router from './employeeProfile.routes.js';

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

test('employee profile routes expose assignment options for work-profile editing', () => {
  assert.equal(hasRoute('/assignment-options', 'GET'), true);
});
