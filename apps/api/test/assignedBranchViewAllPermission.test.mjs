import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('assigned branch controller and service honor admin.view_all_branches', () => {
  const controllerFile = new URL('../src/controllers/assignedBranch.controller.ts', import.meta.url);
  const serviceFile = new URL('../src/services/assignedBranch.service.ts', import.meta.url);

  const controllerSource = readFileSync(controllerFile, 'utf8');
  const serviceSource = readFileSync(serviceFile, 'utf8');

  assert.match(
    controllerSource,
    /req\.user!\.permissions\.includes\(PERMISSIONS\.ADMIN_VIEW_ALL_BRANCHES\)/,
  );
  assert.match(
    controllerSource,
    /getAssignedBranches\(userId,\s*isSuperAdmin,\s*canViewAllBranches\)/,
  );
  assert.match(
    serviceSource,
    /export async function getAssignedBranches\(\s*userId:\s*string,\s*isSuperAdmin:\s*boolean,\s*canViewAllBranches:\s*boolean,\s*\)/,
  );
  assert.match(serviceSource, /else if\s*\(canViewAllBranches\)/);
});
