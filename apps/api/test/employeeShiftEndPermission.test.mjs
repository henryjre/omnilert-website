import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('employee shift end route allows manage-shift, legacy end-shift, public auth manage, or own-schedule permissions', () => {
  const routeFile = new URL('../src/routes/employeeShift.routes.ts', import.meta.url);
  const source = readFileSync(routeFile, 'utf8');

  assert.match(source, /router\.post\(\s*['"]\/:id\/end['"]/);
  assert.match(
    source,
    /requireAnyPermission\([\s\S]*PERMISSIONS\.SCHEDULE_MANAGE_SHIFT[\s\S]*PERMISSIONS\.SCHEDULE_END_SHIFT[\s\S]*PERMISSIONS\.AUTH_REQUEST_MANAGE_PUBLIC[\s\S]*PERMISSIONS\.ACCOUNT_MANAGE_SCHEDULE[\s\S]*\)/,
  );
  assert.doesNotMatch(
    source,
    /router\.post\(\s*['"]\/:id\/end['"]\s*,\s*requirePermission\(PERMISSIONS\.SCHEDULE_END_SHIFT\)/,
  );
});

test('employee shift end controller restricts manage schedule users to their own shifts', () => {
  const controllerFile = new URL('../src/controllers/employeeShift.controller.ts', import.meta.url);
  const source = readFileSync(controllerFile, 'utf8');

  assert.match(
    source,
    /const userPermissions = new Set\(req\.user!\.permissions\);/,
  );
  assert.match(
    source,
    /const canEndAnyShift = userPermissions\.has\(PERMISSIONS\.SCHEDULE_MANAGE_SHIFT\)\s*\|\|\s*userPermissions\.has\(PERMISSIONS\.SCHEDULE_END_SHIFT\)\s*\|\|\s*userPermissions\.has\(PERMISSIONS\.AUTH_REQUEST_MANAGE_PUBLIC\);/,
  );
  assert.match(
    source,
    /const canEndOwnShift = req\.user!\.permissions\.includes\(PERMISSIONS\.ACCOUNT_MANAGE_SCHEDULE\);/,
  );
  assert.match(
    source,
    /if \(!canEndAnyShift && !canEndOwnShift\) throw new AppError\(403,\s*'Forbidden'\);/,
  );
  assert.match(
    source,
    /if \(!canEndAnyShift && shift\.user_id !== managerId\) \{\s*throw new AppError\(403,\s*'You can only end your own shift'\);\s*\}/,
  );
});

test('shift authorization manager routes allow manage-shift permission keys', () => {
  const routeFile = new URL('../src/routes/shiftAuthorization.routes.ts', import.meta.url);
  const source = readFileSync(routeFile, 'utf8');

  assert.match(
    source,
    /router\.post\(\s*['"]\/:id\/approve['"]\s*,[\s\S]*requireAnyPermission\([\s\S]*PERMISSIONS\.SCHEDULE_MANAGE_SHIFT[\s\S]*PERMISSIONS\.SCHEDULE_END_SHIFT[\s\S]*PERMISSIONS\.AUTH_REQUEST_MANAGE_PUBLIC[\s\S]*\)/,
  );
  assert.match(
    source,
    /router\.post\(\s*['"]\/:id\/reject['"]\s*,[\s\S]*requireAnyPermission\([\s\S]*PERMISSIONS\.SCHEDULE_MANAGE_SHIFT[\s\S]*PERMISSIONS\.SCHEDULE_END_SHIFT[\s\S]*PERMISSIONS\.AUTH_REQUEST_MANAGE_PUBLIC[\s\S]*\)/,
  );
});
