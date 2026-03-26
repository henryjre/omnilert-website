export type VerificationType =
  | 'registration'
  | 'personalInformation'
  | 'employmentRequirements'
  | 'bankInformation';

export interface EmployeeVerificationTabAccessInput {
  canApproveRegistration: boolean;
  canApprovePersonalInfo: boolean;
  canApproveRequirements: boolean;
  canApproveBankInfo: boolean;
  canViewEmployeeVerificationPage: boolean;
}

export interface EmployeeVerificationTabAccess {
  visibleTypes: VerificationType[];
  showNoDataPermissionState: boolean;
}

export function resolveEmployeeVerificationTabAccess(
  input: EmployeeVerificationTabAccessInput,
): EmployeeVerificationTabAccess {
  const visibleTypes: VerificationType[] = [];

  if (input.canApproveRegistration) visibleTypes.push('registration');
  if (input.canApprovePersonalInfo) visibleTypes.push('personalInformation');
  if (input.canApproveRequirements) visibleTypes.push('employmentRequirements');
  if (input.canApproveBankInfo) visibleTypes.push('bankInformation');

  const showNoDataPermissionState = input.canViewEmployeeVerificationPage && visibleTypes.length === 0;

  return {
    visibleTypes,
    showNoDataPermissionState,
  };
}

