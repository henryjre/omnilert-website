import assert from 'node:assert/strict';
import test from 'node:test';
import {
  resolveEmployeeVerificationTabAccess,
  type VerificationType,
} from '../src/features/employee-verifications/pages/employeeVerificationTabAccess';

function expectVisible(
  visibleTypes: VerificationType[],
  expected: VerificationType[],
) {
  assert.deepEqual(visibleTypes, expected);
}

test('manage bank information can only see bank information tab', () => {
  const access = resolveEmployeeVerificationTabAccess({
    canApproveRegistration: false,
    canApprovePersonalInfo: false,
    canApproveRequirements: false,
    canApproveBankInfo: true,
    canViewEmployeeVerificationPage: true,
  });

  expectVisible(access.visibleTypes, ['bankInformation']);
  assert.equal(access.showNoDataPermissionState, false);
});

test('manage personal information can only see personal information tab', () => {
  const access = resolveEmployeeVerificationTabAccess({
    canApproveRegistration: false,
    canApprovePersonalInfo: true,
    canApproveRequirements: false,
    canApproveBankInfo: false,
    canViewEmployeeVerificationPage: true,
  });

  expectVisible(access.visibleTypes, ['personalInformation']);
  assert.equal(access.showNoDataPermissionState, false);
});

test('manage registration can only see registration tab', () => {
  const access = resolveEmployeeVerificationTabAccess({
    canApproveRegistration: true,
    canApprovePersonalInfo: false,
    canApproveRequirements: false,
    canApproveBankInfo: false,
    canViewEmployeeVerificationPage: true,
  });

  expectVisible(access.visibleTypes, ['registration']);
  assert.equal(access.showNoDataPermissionState, false);
});

test('manage employee requirements can only see employment requirements tab', () => {
  const access = resolveEmployeeVerificationTabAccess({
    canApproveRegistration: false,
    canApprovePersonalInfo: false,
    canApproveRequirements: true,
    canApproveBankInfo: false,
    canViewEmployeeVerificationPage: true,
  });

  expectVisible(access.visibleTypes, ['employmentRequirements']);
  assert.equal(access.showNoDataPermissionState, false);
});

test('view page without any manage permissions shows no-data permission state', () => {
  const access = resolveEmployeeVerificationTabAccess({
    canApproveRegistration: false,
    canApprovePersonalInfo: false,
    canApproveRequirements: false,
    canApproveBankInfo: false,
    canViewEmployeeVerificationPage: true,
  });

  expectVisible(access.visibleTypes, []);
  assert.equal(access.showNoDataPermissionState, true);
});

