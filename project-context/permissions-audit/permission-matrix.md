# Permissions Audit Matrix

Generated: 2026-03-17T17:43:01.724Z

## Summary

- Total canonical permissions: 50
- Enforced: 49
- Partially enforced: 1
- UI-only: 0
- Dead/Orphan: 0
- Intent unclear: 0
- Legacy aliases: 5

## Canonical Matrix

| Permission | Status | API Guards | API Inline | Socket Guards | UI Guards | Role Grants | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `account.submit_cash_request` | enforced | 1 | 0 | 0 | 1 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:68, apps/web/src/features/account/components/CashRequestsTab.tsx:229, apps/api/src/migrations/master/006_global_users_and_registration.ts:34) |
| `account.submit_private_auth_request` | enforced | 1 | 0 | 0 | 1 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:57, apps/web/src/features/account/components/AuthorizationRequestsTab.tsx:194, apps/api/src/migrations/master/006_global_users_and_registration.ts:31) |
| `account.submit_public_auth_request` | enforced | 1 | 0 | 0 | 2 | 3 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/shiftAuthorization.routes.ts:15, apps/web/src/features/account/components/ScheduleTab.tsx:843, apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx:914) |
| `account.view_auth_requests` | enforced | 1 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:52, apps/web/src/app/router.tsx:77, apps/web/src/features/dashboard/components/Sidebar.tsx:270) |
| `account.view_cash_requests` | enforced | 1 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:63, apps/web/src/app/router.tsx:85, apps/web/src/features/dashboard/components/Sidebar.tsx:276) |
| `account.view_notifications` | enforced | 4 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:117, apps/api/src/routes/account.routes.ts:122, apps/api/src/routes/account.routes.ts:127) |
| `account.view_schedule` | enforced | 5 | 0 | 1 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/shiftExchange.routes.ts:14, apps/api/src/routes/shiftExchange.routes.ts:19, apps/api/src/routes/account.routes.ts:36) |
| `admin.manage_branches` | enforced | 3 | 0 | 0 | 2 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/branch.routes.ts:13, apps/api/src/routes/branch.routes.ts:14, apps/api/src/routes/branch.routes.ts:15) |
| `admin.manage_roles` | enforced | 7 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/role.routes.ts:16, apps/api/src/routes/role.routes.ts:22, apps/api/src/routes/role.routes.ts:26) |
| `admin.manage_users` | enforced | 7 | 0 | 0 | 10 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/user.routes.ts:39, apps/api/src/routes/user.routes.ts:40, apps/api/src/routes/user.routes.ts:43) |
| `admin.view_all_branches` | partially enforced | 0 | 7 | 3 | 0 | 1 | Permission is referenced, but one or more layers (backend/UI/grants) are missing. (e.g. apps/api/src/config/socket.ts:58, apps/api/src/config/socket.ts:91, apps/api/src/config/socket.ts:253) |
| `auth_request.approve_management` | enforced | 3 | 1 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/authorizationRequest.routes.ts:14, apps/api/src/routes/authorizationRequest.routes.ts:24, apps/api/src/routes/authorizationRequest.routes.ts:30) |
| `auth_request.approve_service_crew` | enforced | 1 | 1 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/authorizationRequest.routes.ts:14, apps/web/src/app/router.tsx:142, apps/web/src/features/authorization-requests/pages/AuthorizationRequestsPage.tsx:699) |
| `auth_request.view_all` | enforced | 1 | 1 | 0 | 1 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/authorizationRequest.routes.ts:14, apps/web/src/app/router.tsx:142, apps/api/src/migrations/master/006_global_users_and_registration.ts:44) |
| `bank_information.approve` | enforced | 2 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeVerification.routes.ts:70, apps/api/src/routes/employeeVerification.routes.ts:75, apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx:327) |
| `case_report.close` | enforced | 1 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/caseReport.routes.ts:80, apps/web/src/features/case-reports/pages/CaseReportsPage.tsx:87, apps/api/src/migrations/master/011_case_report_permissions.ts:11) |
| `case_report.create` | enforced | 1 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/caseReport.routes.ts:66, apps/web/src/features/case-reports/pages/CaseReportsPage.tsx:86, apps/api/src/migrations/master/011_case_report_permissions.ts:10) |
| `case_report.manage` | enforced | 1 | 1 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/caseReport.routes.ts:81, apps/web/src/features/case-reports/pages/CaseReportsPage.tsx:88, apps/api/src/migrations/master/011_case_report_permissions.ts:12) |
| `case_report.view` | enforced | 15 | 0 | 1 | 2 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/caseReport.routes.ts:64, apps/api/src/routes/caseReport.routes.ts:65, apps/api/src/routes/caseReport.routes.ts:67) |
| `cash_request.approve` | enforced | 3 | 0 | 0 | 1 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/cashRequest.routes.ts:42, apps/api/src/routes/cashRequest.routes.ts:47, apps/api/src/routes/cashRequest.routes.ts:52) |
| `cash_request.view_all` | enforced | 1 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/cashRequest.routes.ts:35, apps/web/src/app/router.tsx:155, apps/web/src/features/dashboard/components/Sidebar.tsx:394) |
| `dashboard.view_payslip` | enforced | 2 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/dashboard.routes.ts:20, apps/api/src/routes/dashboard.routes.ts:26, apps/web/src/app/router.tsx:69) |
| `dashboard.view_performance_index` | enforced | 4 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/dashboard.routes.ts:14, apps/api/src/routes/dashboard.routes.ts:32, apps/api/src/routes/dashboard.routes.ts:38) |
| `employee_requirements.approve` | enforced | 2 | 0 | 0 | 4 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeVerification.routes.ts:58, apps/api/src/routes/employeeVerification.routes.ts:63, apps/web/src/app/router.tsx:215) |
| `employee_verification.view` | enforced | 2 | 0 | 1 | 2 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeVerification.routes.ts:20, apps/api/src/routes/registrationRequest.routes.ts:19, apps/api/src/config/socket.ts:130) |
| `employee.edit_own_profile` | enforced | 5 | 0 | 0 | 1 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:75, apps/api/src/routes/account.routes.ts:88, apps/api/src/routes/account.routes.ts:95) |
| `employee.edit_work_profile` | enforced | 1 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeProfile.routes.ts:30, apps/web/src/features/employee-profiles/pages/EmployeeProfilesPage.tsx:349, apps/api/src/migrations/master/006_global_users_and_registration.ts:39) |
| `employee.view_all_profiles` | enforced | 3 | 0 | 0 | 3 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeProfile.routes.ts:15, apps/api/src/routes/employeeProfile.routes.ts:20, apps/api/src/routes/employeeProfile.routes.ts:25) |
| `employee.view_own_profile` | enforced | 1 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/account.routes.ts:82, apps/web/src/app/router.tsx:105, apps/web/src/features/dashboard/components/Sidebar.tsx:288) |
| `peer_evaluation.manage` | enforced | 4 | 2 | 1 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/peerEvaluation.routes.ts:24, apps/api/src/routes/peerEvaluation.routes.ts:29, apps/api/src/routes/peerEvaluation.routes.ts:34) |
| `peer_evaluation.view` | enforced | 4 | 0 | 1 | 3 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/peerEvaluation.routes.ts:24, apps/api/src/routes/peerEvaluation.routes.ts:29, apps/api/src/routes/peerEvaluation.routes.ts:34) |
| `personal_information.approve` | enforced | 2 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeVerification.routes.ts:45, apps/api/src/routes/employeeVerification.routes.ts:51, apps/web/src/features/employee-verifications/pages/EmployeeVerificationsPage.tsx:325) |
| `pos_session.audit_complete` | enforced | 2 | 0 | 0 | 3 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/posVerification.routes.ts:65, apps/api/src/routes/posSession.routes.ts:16, apps/web/src/features/pos-session/pages/PosSessionPage.tsx:431) |
| `pos_session.view` | enforced | 2 | 0 | 1 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/posSession.routes.ts:12, apps/api/src/routes/posSession.routes.ts:13, apps/api/src/config/socket.ts:77) |
| `pos_verification.confirm_reject` | enforced | 2 | 0 | 0 | 4 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/posVerification.routes.ts:44, apps/api/src/routes/posVerification.routes.ts:51, apps/web/src/features/pos-verification/pages/PosVerificationPage.tsx:1023) |
| `pos_verification.upload_image` | enforced | 2 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/posVerification.routes.ts:37, apps/api/src/routes/posVerification.routes.ts:58, apps/web/src/features/pos-verification/pages/PosVerificationPage.tsx:924) |
| `pos_verification.view` | enforced | 2 | 0 | 1 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/posVerification.routes.ts:32, apps/api/src/routes/posVerification.routes.ts:33, apps/api/src/config/socket.ts:44) |
| `registration.approve` | enforced | 6 | 0 | 0 | 2 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeVerification.routes.ts:26, apps/api/src/routes/employeeVerification.routes.ts:32, apps/api/src/routes/employeeVerification.routes.ts:39) |
| `shift.approve_authorizations` | enforced | 2 | 0 | 0 | 2 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/shiftAuthorization.routes.ts:22, apps/api/src/routes/shiftAuthorization.routes.ts:29, apps/web/src/features/account/components/ScheduleTab.tsx:842) |
| `shift.end_shift` | enforced | 1 | 0 | 0 | 1 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeShift.routes.ts:14, apps/web/src/features/employee-shifts/pages/EmployeeShiftsPage.tsx:913, apps/api/src/migrations/master/006_global_users_and_registration.ts:42) |
| `shift.view_all` | enforced | 2 | 0 | 3 | 3 | 2 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/employeeShift.routes.ts:12, apps/api/src/routes/employeeShift.routes.ts:13, apps/api/src/config/socket.ts:111) |
| `store_audit.process` | enforced | 2 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/storeAudit.routes.ts:38, apps/api/src/routes/storeAudit.routes.ts:41, apps/web/src/features/store-audits/pages/StoreAuditsPage.tsx:32) |
| `store_audit.view` | enforced | 2 | 0 | 1 | 2 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/storeAudit.routes.ts:36, apps/api/src/routes/storeAudit.routes.ts:37, apps/api/src/config/socket.ts:155) |
| `violation_notice.complete` | enforced | 2 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/violationNotice.routes.ts:112, apps/api/src/routes/violationNotice.routes.ts:116, apps/web/src/features/violation-notices/pages/ViolationNoticesPage.tsx:92) |
| `violation_notice.confirm` | enforced | 1 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/violationNotice.routes.ts:95, apps/web/src/features/violation-notices/pages/ViolationNoticesPage.tsx:89, apps/api/src/migrations/master/012_violation_notice_permissions.ts:12) |
| `violation_notice.create` | enforced | 4 | 0 | 0 | 2 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/violationNotice.routes.ts:76, apps/api/src/routes/violationNotice.routes.ts:80, apps/api/src/routes/violationNotice.routes.ts:86) |
| `violation_notice.issue` | enforced | 3 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/violationNotice.routes.ts:102, apps/api/src/routes/violationNotice.routes.ts:105, apps/api/src/routes/violationNotice.routes.ts:109) |
| `violation_notice.manage` | enforced | 0 | 1 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/web/src/features/violation-notices/pages/ViolationNoticesPage.tsx:93, apps/api/src/migrations/master/012_violation_notice_permissions.ts:16) |
| `violation_notice.reject` | enforced | 1 | 0 | 0 | 1 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/violationNotice.routes.ts:98, apps/web/src/features/violation-notices/pages/ViolationNoticesPage.tsx:90, apps/api/src/migrations/master/012_violation_notice_permissions.ts:13) |
| `violation_notice.view` | enforced | 11 | 0 | 1 | 3 | 1 | Backend, socket/UI checks, and grants are present. (e.g. apps/api/src/routes/violationNotice.routes.ts:77, apps/api/src/routes/violationNotice.routes.ts:90, apps/api/src/routes/violationNotice.routes.ts:94) |

## Legacy Alias Findings

| Alias | Status | Occurrences | Notes |
| --- | --- | --- | --- |
| `admin.toggle_branch` | legacy-alias | 2 | Unknown permission-like alias found in grants/migrations. (e.g. apps/api/src/migrations/master/006_global_users_and_registration.ts:20, apps/api/src/migrations/master/018_remove_dashboard_and_toggle_permissions.ts:9) |
| `auth_request.create_management` | legacy-alias | 1 | Unknown permission-like alias found in grants/migrations. (e.g. apps/api/src/scripts/migration.ts:441) |
| `auth_request.view_service_crew` | legacy-alias | 1 | Legacy alias remains in migration history; map to canonical key before cleanup. (e.g. apps/api/src/scripts/migration.ts:442) |
| `dashboard.view` | legacy-alias | 3 | Unknown permission-like alias found in grants/migrations. (e.g. apps/api/src/migrations/master/006_global_users_and_registration.ts:21, apps/api/src/migrations/master/006_global_users_and_registration.ts:425, apps/api/src/migrations/master/018_remove_dashboard_and_toggle_permissions.ts:15) |
| `registration.view` | legacy-alias | 2 | Unknown permission-like alias found in grants/migrations. (e.g. apps/api/src/migrations/tenant/004_add_registration_requests_and_employee_number.ts:8, apps/api/src/migrations/tenant/005_employee_verifications_expansion.ts:12) |

## Literal Permission String Check

No literal permission violations found outside allowlisted files.

## Remediation Tasks

1. Close enforcement gap for `admin.view_all_branches` (missing one of backend/UI/grants).
2. Replace legacy alias `admin.toggle_branch` with shared constants and remove alias grants when migrated.
3. Replace legacy alias `auth_request.create_management` with shared constants and remove alias grants when migrated.
4. Replace legacy alias `auth_request.view_service_crew` with shared constants and remove alias grants when migrated.
5. Replace legacy alias `dashboard.view` with shared constants and remove alias grants when migrated.
6. Replace legacy alias `registration.view` with shared constants and remove alias grants when migrated.
