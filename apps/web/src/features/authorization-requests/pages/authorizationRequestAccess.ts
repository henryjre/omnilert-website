export interface AuthorizationRequestSectionAccessInput {
  canApproveManagement: boolean;
  canApproveServiceCrew: boolean;
  canViewManagementData: boolean;
  canViewServiceCrewData: boolean;
  canViewAuthorizationRequestsPage: boolean;
}

export interface AuthorizationRequestSectionAccess {
  showManagementSection: boolean;
  showServiceCrewSection: boolean;
  showNoDataPermissionState: boolean;
}

export function resolveAuthorizationRequestSectionAccess(
  input: AuthorizationRequestSectionAccessInput,
): AuthorizationRequestSectionAccess {
  const showManagementSection = input.canApproveManagement || input.canViewManagementData;
  const showServiceCrewSection = input.canApproveServiceCrew || input.canViewServiceCrewData;
  const showNoDataPermissionState = input.canViewAuthorizationRequestsPage
    && !showManagementSection
    && !showServiceCrewSection;

  return {
    showManagementSection,
    showServiceCrewSection,
    showNoDataPermissionState,
  };
}
