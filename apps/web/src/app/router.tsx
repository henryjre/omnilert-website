import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { PermissionGuard } from '@/features/auth/components/PermissionGuard';
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { ScheduleTab } from '@/features/account/components/ScheduleTab';
import { AuthorizationRequestsTab } from '@/features/account/components/AuthorizationRequestsTab';
import { CashRequestsTab } from '@/features/account/components/CashRequestsTab';
import { EmployeeNotificationsTab } from '@/features/account/components/EmployeeNotificationsTab';
import { SettingsTab } from '@/features/account/components/SettingsTab';
import { AuditResultsPage } from '@/features/account/pages/AuditResultsPage';
import { PayslipPage } from '@/features/account/pages/PayslipPage';
import { EmploymentTab } from '@/features/account/components/EmploymentTab';
import { PosVerificationPage } from '@/features/pos-verification/pages/PosVerificationPage';
import { PosSessionPage } from '@/features/pos-session/pages/PosSessionPage';
import { EmployeeShiftsPage } from '@/features/employee-shifts/pages/EmployeeShiftsPage';
import { RoleManagementPage } from '@/features/roles/pages/RoleManagementPage';
import { UserManagementPage } from '@/features/company/pages/UserManagementPage';
import { CompanyPage } from '@/features/company/pages/CompanyPage';
import { DepartmentManagementPage } from '@/features/company/pages/DepartmentManagementPage';
import { AuthorizationRequestsPage } from '@/features/authorization-requests/pages/AuthorizationRequestsPage';
import { CashRequestsPage } from '@/features/cash-requests/pages/CashRequestsPage';
import { EmployeeVerificationsPage } from '@/features/employee-verifications/pages/EmployeeVerificationsPage';
import { EmployeeProfilesPage } from '@/features/employee-profiles/pages/EmployeeProfilesPage';
import { StoreAuditsPage } from '@/features/store-audits/pages/StoreAuditsPage';
import { CaseReportsPage } from '@/features/case-reports/pages/CaseReportsPage';
import { ViolationNoticesPage } from '@/features/violation-notices/pages/ViolationNoticesPage';
import { PeerEvaluationsPage } from '@/features/peer-evaluations/pages/PeerEvaluationsPage';
import { EmployeeAnalyticsPage } from '@/features/employee-analytics/pages/EmployeeAnalyticsPage';
import { ProfitabilityAnalyticsPage } from '@/features/profitability-analytics/pages/ProfitabilityAnalyticsPage';
import { PosAnalyticsPage } from '@/features/pos-analytics/pages/PosAnalyticsPage';
import { ProductAnalyticsPage } from '@/features/product-analytics/pages/ProductAnalyticsPage';
import { PERMISSIONS } from '@omnilert/shared';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/',
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            index: true,
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: 'dashboard',
            element: <DashboardPage />,
          },
          {
            path: 'account',
            element: <Navigate to="/account/schedule" replace />,
          },
          {
            path: 'account/schedule',
            element: (
              <PermissionGuard permission={PERMISSIONS.ACCOUNT_VIEW_SCHEDULE}>
                <ScheduleTab />
              </PermissionGuard>
            ),
          },
          {
            path: 'account/payslip',
            element: <PayslipPage />,
          },
          {
            path: 'account/authorization-requests',
            element: (
              <PermissionGuard permission={PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST}>
                <AuthorizationRequestsTab />
              </PermissionGuard>
            ),
          },
          {
            path: 'account/cash-requests',
            element: (
              <PermissionGuard permission={PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST}>
                <CashRequestsTab />
              </PermissionGuard>
            ),
          },
          {
            path: 'account/audit-results',
            element: (
              <PermissionGuard permission={PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS}>
                <AuditResultsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'account/notifications',
            element: <EmployeeNotificationsTab />,
          },
          {
            path: 'account/settings',
            element: <SettingsTab />,
          },
          {
            path: 'account/profile',
            element: <EmploymentTab />,
          },
          {
            path: 'account/employment',
            element: <Navigate to="/account/profile" replace />,
          },
          {
            path: 'pos-verification',
            element: (
              <PermissionGuard permission={PERMISSIONS.POS_VIEW}>
                <PosVerificationPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'pos-sessions',
            element: (
              <PermissionGuard permission={PERMISSIONS.POS_VIEW}>
                <PosSessionPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'employee-schedule',
            element: (
              <PermissionGuard permission={PERMISSIONS.SCHEDULE_VIEW}>
                <EmployeeShiftsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'authorization-requests',
            element: (
              <PermissionGuard permission={PERMISSIONS.AUTH_REQUEST_VIEW_PAGE}>
                <AuthorizationRequestsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'cash-requests',
            element: (
              <PermissionGuard permission={PERMISSIONS.CASH_REQUESTS_VIEW}>
                <CashRequestsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'employee-verifications',
            element: (
              <PermissionGuard permission={PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE}>
                <EmployeeVerificationsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'employee-profiles',
            element: (
              <PermissionGuard permission={PERMISSIONS.EMPLOYEE_PROFILES_VIEW}>
                <EmployeeProfilesPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'employee-analytics',
            element: (
              <PermissionGuard permission={PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS}>
                <EmployeeAnalyticsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'profitability-analytics',
            element: (
              <PermissionGuard permission={PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS}>
                <ProfitabilityAnalyticsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'pos-analytics',
            element: (
              <PermissionGuard permission={PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS}>
                <PosAnalyticsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'product-analytics',
            element: (
              <PermissionGuard permission={PERMISSIONS.ANALYTICS_VIEW_PRODUCT_ANALYTICS}>
                <ProductAnalyticsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'store-audits',
            element: (
              <PermissionGuard permission={PERMISSIONS.STORE_AUDIT_VIEW}>
                <StoreAuditsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'case-reports',
            element: (
              <PermissionGuard permission={PERMISSIONS.CASE_REPORT_VIEW}>
                <CaseReportsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'violation-notices',
            element: (
              <PermissionGuard permission={PERMISSIONS.VIOLATION_NOTICE_VIEW}>
                <ViolationNoticesPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'workplace-relations',
            element: (
              <PermissionGuard permission={PERMISSIONS.WORKPLACE_RELATIONS_VIEW}>
                <PeerEvaluationsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'registration-requests',
            element: <Navigate to="/employee-verifications" replace />,
          },
          {
            path: 'employee-requirements',
            element: <Navigate to="/employee-profiles" replace />,
          },
          {
            path: 'admin/roles',
            element: (
              <PermissionGuard permission={PERMISSIONS.ADMIN_MANAGE_ROLES}>
                <RoleManagementPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'admin/users',
            element: (
              <PermissionGuard permission={PERMISSIONS.ADMIN_MANAGE_USERS}>
                <UserManagementPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'admin/departments',
            element: (
              <PermissionGuard permission={PERMISSIONS.ADMIN_MANAGE_DEPARTMENTS}>
                <DepartmentManagementPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'admin/company',
            element: (
              <PermissionGuard permission={PERMISSIONS.ADMIN_MANAGE_COMPANIES}>
                <CompanyPage />
              </PermissionGuard>
            ),
          },
        ],
      },
    ],
  },
]);

