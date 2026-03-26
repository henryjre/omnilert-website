import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('authorization request list uses private/public view permissions for section visibility', () => {
  const controllerFile = new URL('../src/controllers/authorizationRequest.controller.ts', import.meta.url);
  const source = readFileSync(controllerFile, 'utf8');

  assert.match(
    source,
    /const canViewManagementRequests =[\s\S]*AUTH_REQUEST_VIEW_PRIVATE[\s\S]*AUTH_REQUEST_MANAGE_PRIVATE/,
  );
  assert.match(
    source,
    /const canViewServiceCrewRequests =[\s\S]*AUTH_REQUEST_VIEW_PUBLIC[\s\S]*AUTH_REQUEST_MANAGE_PUBLIC/,
  );
  assert.match(source, /if \(canViewManagementRequests\) \{/);
  assert.match(source, /if \(canViewServiceCrewRequests\) \{/);
  assert.doesNotMatch(
    source,
    /if \(\s*userPermissions\.has\(PERMISSIONS\.AUTH_REQUEST_VIEW_PAGE\)\s*\|\|\s*userPermissions\.has\(PERMISSIONS\.AUTH_REQUEST_MANAGE_PUBLIC\)\s*\)/,
  );
});

