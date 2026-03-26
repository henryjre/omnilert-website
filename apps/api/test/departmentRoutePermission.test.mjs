import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('department routes require the manage departments permission', () => {
  const routeFile = new URL('../src/routes/department.routes.ts', import.meta.url);
  const source = readFileSync(routeFile, 'utf8');

  assert.match(
    source,
    /router\.use\(authenticate,\s*resolveCompany,\s*requirePermission\(PERMISSIONS\.ADMIN_MANAGE_DEPARTMENTS\)\);/,
  );
  assert.doesNotMatch(source, /requirePermission\(PERMISSIONS\.ADMIN_MANAGE_USERS\)/);
});
