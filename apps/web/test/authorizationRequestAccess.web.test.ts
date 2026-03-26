import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveAuthorizationRequestSectionAccess } from '../src/features/authorization-requests/pages/authorizationRequestAccess';

test('hides service crew section when user can only manage private requests', () => {
  const access = resolveAuthorizationRequestSectionAccess({
    canApproveManagement: true,
    canApproveServiceCrew: false,
    canViewManagementData: true,
    canViewServiceCrewData: false,
    canViewAuthorizationRequestsPage: true,
  });

  assert.equal(access.showManagementSection, true);
  assert.equal(access.showServiceCrewSection, false);
  assert.equal(access.showNoDataPermissionState, false);
});

test('shows no-data permission state for view-only users with no manage permissions', () => {
  const access = resolveAuthorizationRequestSectionAccess({
    canApproveManagement: false,
    canApproveServiceCrew: false,
    canViewManagementData: false,
    canViewServiceCrewData: false,
    canViewAuthorizationRequestsPage: true,
  });

  assert.equal(access.showManagementSection, false);
  assert.equal(access.showServiceCrewSection, false);
  assert.equal(access.showNoDataPermissionState, true);
});

test('shows service crew section when public authorization view is allowed', () => {
  const access = resolveAuthorizationRequestSectionAccess({
    canApproveManagement: false,
    canApproveServiceCrew: false,
    canViewManagementData: false,
    canViewServiceCrewData: true,
    canViewAuthorizationRequestsPage: true,
  });

  assert.equal(access.showManagementSection, false);
  assert.equal(access.showServiceCrewSection, true);
  assert.equal(access.showNoDataPermissionState, false);
});

test('shows management section when private authorization view is allowed', () => {
  const access = resolveAuthorizationRequestSectionAccess({
    canApproveManagement: false,
    canApproveServiceCrew: false,
    canViewManagementData: true,
    canViewServiceCrewData: false,
    canViewAuthorizationRequestsPage: true,
  });

  assert.equal(access.showManagementSection, true);
  assert.equal(access.showServiceCrewSection, false);
  assert.equal(access.showNoDataPermissionState, false);
});
