import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  User,
  ShieldCheck,
  Monitor,
  Calendar,
  Users,
  GitBranch,
  Building2,
  Shield,
  LogOut,
  FileText,
  DollarSign,
  ClipboardCheck,
} from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePosVerificationStore } from '@/shared/store/posVerificationStore';
import { PERMISSIONS } from '@omnilert/shared';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary-50 text-primary-700'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

const categoryLabel = (label: string) => (
  <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
    {label}
  </p>
);

interface SidebarProps {
  className?: string;
}

export function Sidebar({ className = '' }: SidebarProps) {
  const { hasPermission, hasAnyPermission } = usePermission();
  const { logout, user } = useAuth();
  const companyName = useAuthStore((s) => s.companyName);
  const isAdministrator = (user?.roles ?? []).some((role) => role.name === 'Administrator');
  const pendingVerificationCount = usePosVerificationStore((s) => s.pendingCount);

  return (
    <aside className={`flex h-[100dvh] w-64 flex-col border-r border-gray-200 bg-white ${className}`}>
      {/* Logo */}
      <div className="flex h-16 items-center border-b border-gray-200 px-6">
        <div className="leading-tight">
          <h1 className="text-xl font-bold text-primary-600">Omnilert</h1>
          {companyName && <p className="text-[11px] text-gray-500">{companyName}</p>}
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {hasPermission(PERMISSIONS.DASHBOARD_VIEW) && (
          <NavLink to="/dashboard" className={linkClass}>
            <LayoutDashboard className="h-5 w-5" />
            Dashboard
          </NavLink>
        )}

        <NavLink to="/account" end={false} className={linkClass}>
          <User className="h-5 w-5" />
          My Account
        </NavLink>

        {/* Management */}
        {hasAnyPermission(
          PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT,
          PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
          PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
          PERMISSIONS.CASH_REQUEST_VIEW_ALL,
          PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW,
          PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES,
        ) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Management')}
            {hasAnyPermission(
              PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT,
              PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
              PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
            ) && (
              <NavLink to="/authorization-requests" className={linkClass}>
                <FileText className="h-5 w-5" />
                Authorization Requests
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.CASH_REQUEST_VIEW_ALL) && (
              <NavLink to="/cash-requests" className={linkClass}>
                <DollarSign className="h-5 w-5" />
                Cash Requests
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW) && (
              <NavLink to="/employee-verifications" className={linkClass}>
                <Users className="h-5 w-5" />
                Employee Verifications
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES) && (
              <NavLink to="/employee-profiles" className={linkClass}>
                <User className="h-5 w-5" />
                Employee Profiles
              </NavLink>
            )}
          </>
        )}

        {/* Service Crew */}
        {hasPermission(PERMISSIONS.SHIFT_VIEW_ALL) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Service Crew')}
            <NavLink to="/employee-schedule" className={linkClass}>
              <Calendar className="h-5 w-5" />
              Employee Schedule
            </NavLink>
            <NavLink to="/employee-requirements" className={linkClass}>
              <ClipboardCheck className="h-5 w-5" />
              Employee Requirements
            </NavLink>
          </>
        )}

        {/* Store Operations */}
        {hasAnyPermission(PERMISSIONS.POS_VERIFICATION_VIEW, PERMISSIONS.POS_SESSION_VIEW) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Store Operations')}
            {hasPermission(PERMISSIONS.POS_VERIFICATION_VIEW) && (
              <NavLink to="/pos-verification" className={linkClass}>
                <ShieldCheck className="h-5 w-5" />
                <span className="flex-1">POS Verification</span>
                {pendingVerificationCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {pendingVerificationCount > 99 ? '99+' : pendingVerificationCount}
                  </span>
                )}
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.POS_SESSION_VIEW) && (
              <NavLink to="/pos-sessions" className={linkClass}>
                <Monitor className="h-5 w-5" />
                POS Sessions
              </NavLink>
            )}
          </>
        )}

        {/* Administration */}
        {hasAnyPermission(
          PERMISSIONS.ADMIN_MANAGE_USERS,
          PERMISSIONS.ADMIN_MANAGE_ROLES,
          PERMISSIONS.ADMIN_MANAGE_BRANCHES,
        ) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Administration')}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS) && (
              <NavLink to="/admin/users" className={linkClass}>
                <Users className="h-5 w-5" />
                Users
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_ROLES) && (
              <NavLink to="/admin/roles" className={linkClass}>
                <Shield className="h-5 w-5" />
                Roles
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_BRANCHES) && (
              <NavLink to="/admin/branches" className={linkClass}>
                <GitBranch className="h-5 w-5" />
                Branches
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS) && (
              <NavLink to="/admin/departments" className={linkClass}>
                <Building2 className="h-5 w-5" />
                Departments
              </NavLink>
            )}
            {isAdministrator && (
              <NavLink to="/admin/company" className={linkClass}>
                <Building2 className="h-5 w-5" />
                Company
              </NavLink>
            )}
          </>
        )}
      </nav>

      {/* User section */}
      <div className="mt-auto border-t border-gray-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mb-2 text-sm">
          <p className="font-medium text-gray-900">
            {user?.firstName} {user?.lastName}
          </p>
          <p className="text-xs text-gray-500">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}
