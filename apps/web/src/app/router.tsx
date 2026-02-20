import { createBrowserRouter, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/features/auth/components/ProtectedRoute';
import { PermissionGuard } from '@/features/auth/components/PermissionGuard';
import { AdminRoleGuard } from '@/features/auth/components/AdminRoleGuard';
import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';
import { LoginPage } from '@/features/auth/pages/LoginPage';
import { DashboardPage } from '@/features/dashboard/pages/DashboardPage';
import { AccountPage } from '@/features/account/pages/AccountPage';
import { ScheduleTab } from '@/features/account/components/ScheduleTab';
import { AuthorizationRequestsTab } from '@/features/account/components/AuthorizationRequestsTab';
import { CashRequestsTab } from '@/features/account/components/CashRequestsTab';
import { EmployeeNotificationsTab } from '@/features/account/components/EmployeeNotificationsTab';
import { SettingsTab } from '@/features/account/components/SettingsTab';
import { PosVerificationPage } from '@/features/pos-verification/pages/PosVerificationPage';
import { PosSessionPage } from '@/features/pos-session/pages/PosSessionPage';
import { EmployeeShiftsPage } from '@/features/employee-shifts/pages/EmployeeShiftsPage';
import { RoleManagementPage } from '@/features/roles/pages/RoleManagementPage';
import { BranchManagementPage } from '@/features/company/pages/BranchManagementPage';
import { UserManagementPage } from '@/features/company/pages/UserManagementPage';
import { CompanyPage } from '@/features/company/pages/CompanyPage';
import { AuthorizationRequestsPage } from '@/features/authorization-requests/pages/AuthorizationRequestsPage';
import { CashRequestsPage } from '@/features/cash-requests/pages/CashRequestsPage';
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
            element: (
              <PermissionGuard permission={PERMISSIONS.DASHBOARD_VIEW}>
                <DashboardPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'account',
            element: <AccountPage />,
            children: [
              {
                index: true,
                element: <Navigate to="/account/schedule" replace />,
              },
              { path: 'schedule', element: <ScheduleTab /> },
              { path: 'authorization-requests', element: <AuthorizationRequestsTab /> },
              { path: 'cash-requests', element: <CashRequestsTab /> },
              { path: 'notifications', element: <EmployeeNotificationsTab /> },
              { path: 'settings', element: <SettingsTab /> },
            ],
          },
          {
            path: 'pos-verification',
            element: (
              <PermissionGuard permission={PERMISSIONS.POS_VERIFICATION_VIEW}>
                <PosVerificationPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'pos-sessions',
            element: (
              <PermissionGuard permission={PERMISSIONS.POS_SESSION_VIEW}>
                <PosSessionPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'employee-schedule',
            element: (
              <PermissionGuard permission={PERMISSIONS.SHIFT_VIEW_ALL}>
                <EmployeeShiftsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'authorization-requests',
            element: (
              <PermissionGuard
                anyPermission={[
                  PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT,
                  PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
                  PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
                ]}
              >
                <AuthorizationRequestsPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'cash-requests',
            element: (
              <PermissionGuard permission={PERMISSIONS.CASH_REQUEST_VIEW_ALL}>
                <CashRequestsPage />
              </PermissionGuard>
            ),
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
            path: 'admin/branches',
            element: (
              <PermissionGuard permission={PERMISSIONS.ADMIN_MANAGE_BRANCHES}>
                <BranchManagementPage />
              </PermissionGuard>
            ),
          },
          {
            path: 'admin/company',
            element: (
              <AdminRoleGuard>
                <CompanyPage />
              </AdminRoleGuard>
            ),
          },
        ],
      },
    ],
  },
]);
