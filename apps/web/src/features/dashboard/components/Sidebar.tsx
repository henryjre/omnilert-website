import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
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
  ChevronDown,
  Bell,
  IdCard,
  Settings,
  Receipt,
  ClipboardList,
  TriangleAlert,
  FileWarning,
} from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
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

const HR_PATHS = ['/employee-profiles', '/employee-schedule', '/employee-requirements', '/violation-notices', '/workplace-relations'];
const FINANCE_PATHS = ['/cash-requests'];
const AUDIT_PATHS = ['/store-audits'];

function SubCategory({
  label,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <span>{label}</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-3">
          {children}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ className = '' }: SidebarProps) {
  const { hasPermission, hasAnyPermission } = usePermission();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isAdministrator = (user?.roles ?? []).some((role) => role.name === 'Administrator');
  const pendingVerificationCount = usePosVerificationStore((s) => s.pendingCount);
  const [hrExpanded, setHrExpanded] = useState(() =>
    HR_PATHS.some((path) => location.pathname.startsWith(path)),
  );
  const [financeExpanded, setFinanceExpanded] = useState(() =>
    FINANCE_PATHS.some((path) => location.pathname.startsWith(path)),
  );
  const [auditExpanded, setAuditExpanded] = useState(() =>
    AUDIT_PATHS.some((path) => location.pathname.startsWith(path)),
  );

  // Auto-expand subcategories when navigating to their routes
  useEffect(() => {
    if (HR_PATHS.some((path) => location.pathname.startsWith(path))) setHrExpanded(true);
    if (FINANCE_PATHS.some((path) => location.pathname.startsWith(path))) setFinanceExpanded(true);
    if (AUDIT_PATHS.some((path) => location.pathname.startsWith(path))) setAuditExpanded(true);
  }, [location.pathname]);

  return (
    <aside className={`flex h-[100dvh] w-64 flex-col border-r border-gray-200 bg-white ${className}`}>
      {/* Logo */}
      <div className="border-b border-gray-200">
        <div className="flex h-16 items-center px-6">
          <h1 className="text-xl font-bold text-primary-600">Omnilert</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <NavLink to="/dashboard" className={linkClass}>
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </NavLink>

        <div className="my-2 border-t border-gray-200" />
        {categoryLabel('My Account')}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE) && (
          <NavLink to="/account/schedule" className={linkClass}>
            <Calendar className="h-5 w-5" />
            Schedule
          </NavLink>
        )}
        {hasPermission(PERMISSIONS.DASHBOARD_VIEW_PAYSLIP) && (
          <NavLink to="/account/payslip" className={linkClass}>
            <Receipt className="h-5 w-5" />
            Payslip
          </NavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUTH_REQUESTS) && (
          <NavLink to="/account/authorization-requests" className={linkClass}>
            <FileText className="h-5 w-5" />
            Authorization Requests
          </NavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_CASH_REQUESTS) && (
          <NavLink to="/account/cash-requests" className={linkClass}>
            <DollarSign className="h-5 w-5" />
            Cash Requests
          </NavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS) && (
          <NavLink to="/account/audit-results" className={linkClass}>
            <ClipboardList className="h-5 w-5" />
            Audit Results
          </NavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_NOTIFICATIONS) && (
          <NavLink to="/account/notifications" className={linkClass}>
            <Bell className="h-5 w-5" />
            Notifications
          </NavLink>
        )}
        {hasPermission(PERMISSIONS.EMPLOYEE_VIEW_OWN_PROFILE) && (
          <NavLink to="/account/profile" className={linkClass}>
            <IdCard className="h-5 w-5" />
            Profile
          </NavLink>
        )}
        <NavLink to="/account/settings" className={linkClass}>
          <Settings className="h-5 w-5" />
          Settings
        </NavLink>

        {/* Management */}
        {hasAnyPermission(
          PERMISSIONS.AUTH_REQUEST_APPROVE_MANAGEMENT,
          PERMISSIONS.AUTH_REQUEST_VIEW_ALL,
          PERMISSIONS.AUTH_REQUEST_APPROVE_SERVICE_CREW,
          PERMISSIONS.CASH_REQUEST_VIEW_ALL,
          PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW,
          PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES,
          PERMISSIONS.SHIFT_VIEW_ALL,
          PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE,
          PERMISSIONS.STORE_AUDIT_VIEW,
          PERMISSIONS.CASE_REPORT_VIEW,
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
            {hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW) && (
              <NavLink to="/employee-verifications" className={linkClass}>
                <Users className="h-5 w-5" />
                Employee Verifications
              </NavLink>
            )}
            {hasPermission(PERMISSIONS.CASE_REPORT_VIEW) && (
              <NavLink to="/case-reports" className={linkClass}>
                <FileWarning className="h-5 w-5" />
                Case Reports
              </NavLink>
            )}

            {hasPermission(PERMISSIONS.STORE_AUDIT_VIEW) && (
              <SubCategory
                label="Internal Audit"
                expanded={auditExpanded}
                onToggle={() => setAuditExpanded((value) => !value)}
              >
                <NavLink to="/store-audits" className={linkClass}>
                  <ClipboardList className="h-5 w-5" />
                  Store Audits
                </NavLink>
              </SubCategory>
            )}

            {(hasPermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES)
              || hasPermission(PERMISSIONS.SHIFT_VIEW_ALL)
              || hasPermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE)
              || hasPermission(PERMISSIONS.VIOLATION_NOTICE_VIEW)
              || hasPermission(PERMISSIONS.PEER_EVALUATION_VIEW)) && (
              <SubCategory
                label="Human Resources"
                expanded={hrExpanded}
                onToggle={() => setHrExpanded((value) => !value)}
              >
                {hasPermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES) && (
                  <NavLink to="/employee-profiles" className={linkClass}>
                    <User className="h-5 w-5" />
                    Employee Profiles
                  </NavLink>
                )}
                {hasPermission(PERMISSIONS.SHIFT_VIEW_ALL) && (
                  <NavLink to="/employee-schedule" className={linkClass}>
                    <Calendar className="h-5 w-5" />
                    Employee Schedule
                  </NavLink>
                )}
                {hasPermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE) && (
                  <NavLink to="/employee-requirements" className={linkClass}>
                    <ClipboardCheck className="h-5 w-5" />
                    Employee Requirements
                  </NavLink>
                )}
                {hasPermission(PERMISSIONS.VIOLATION_NOTICE_VIEW) && (
                  <NavLink to="/violation-notices" className={linkClass}>
                    <TriangleAlert className="h-5 w-5" />
                    Violation Notices
                  </NavLink>
                )}
                {hasPermission(PERMISSIONS.PEER_EVALUATION_VIEW) && (
                  <NavLink to="/workplace-relations" className={linkClass}>
                    <Users className="h-5 w-5" />
                    Workplace Relations
                  </NavLink>
                )}
              </SubCategory>
            )}

            {hasPermission(PERMISSIONS.CASH_REQUEST_VIEW_ALL) && (
              <SubCategory
                label="Accounting and Finance"
                expanded={financeExpanded}
                onToggle={() => setFinanceExpanded((value) => !value)}
              >
                <NavLink to="/cash-requests" className={linkClass}>
                  <DollarSign className="h-5 w-5" />
                  Cash Requests
                </NavLink>
              </SubCategory>
            )}
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
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  );
}

