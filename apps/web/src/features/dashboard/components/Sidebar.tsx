import { type ReactNode, useEffect, useState } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  User,
  ShieldCheck,
  Monitor,
  Calendar,
  Users,
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
  BarChart2,
} from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePosVerificationStore } from '@/shared/store/posVerificationStore';
import { PERMISSIONS } from '@omnilert/shared';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary-50 text-primary-700 shadow-sm'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

const categoryLabel = (label: string) => (
  <p className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
    {label}
  </p>
);

const AnimatedNavLink = ({ to, children, className, end, onClick }: { to: string, children: ReactNode, className?: any, end?: boolean, onClick?: () => void }) => (
  <motion.div whileHover={{ x: 4 }} whileTap={{ scale: 0.98 }} className="block">
    <NavLink to={to} className={className} end={end} onClick={onClick}>
      {children}
    </NavLink>
  </motion.div>
);

interface SidebarProps {
  className?: string;
}

const HR_PATHS = ['/employee-profiles', '/employee-schedule', '/violation-notices', '/workplace-relations'];
const ANALYTICS_PATHS = ['/employee-analytics'];
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
    <div className="overflow-hidden">
      <motion.button
        type="button"
        onClick={onToggle}
        whileHover={{ x: 4 }}
        whileTap={{ scale: 0.98 }}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
      >
        <span>{label}</span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </motion.button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            <div className="ml-3 mt-1 space-y-1 border-l-2 border-gray-100 pl-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function Sidebar({ className = '' }: SidebarProps) {
  const { hasPermission, hasAnyPermission } = usePermission();
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
          <h1 className="text-xl font-bold bg-gradient-to-r from-primary-600 to-primary-400 bg-clip-text text-transparent">Omnilert</h1>
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <AnimatedNavLink to="/dashboard" className={linkClass}>
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </AnimatedNavLink>
        <div className="my-2 border-t border-gray-200" />

        {categoryLabel('My Account')}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE) && (
          <AnimatedNavLink to="/account/schedule" className={linkClass}>
            <Calendar className="h-5 w-5" />
            My Schedule
          </AnimatedNavLink>
        )}
        <AnimatedNavLink to="/account/payslip" className={linkClass}>
          <Receipt className="h-5 w-5" />
          My Payslip
        </AnimatedNavLink>
        {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST) && (
          <AnimatedNavLink to="/account/authorization-requests" className={linkClass}>
            <FileText className="h-5 w-5" />
            My Authorization Requests
          </AnimatedNavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST) && (
          <AnimatedNavLink to="/account/cash-requests" className={linkClass}>
            <DollarSign className="h-5 w-5" />
            My Cash Requests
          </AnimatedNavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS) && (
          <AnimatedNavLink to="/account/audit-results" className={linkClass}>
            <ClipboardList className="h-5 w-5" />
            My Audit Results
          </AnimatedNavLink>
        )}
        <AnimatedNavLink to="/account/notifications" className={linkClass}>
          <Bell className="h-5 w-5" />
          My Notifications
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/profile" className={linkClass}>
          <IdCard className="h-5 w-5" />
          My Profile
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/settings" className={linkClass}>
          <Settings className="h-5 w-5" />
          My Settings
        </AnimatedNavLink>

        {hasAnyPermission(
          PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS,
          PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS,
          PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS,
        ) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Analytics')}
            {hasPermission(PERMISSIONS.ANALYTICS_VIEW_EMPLOYEE_ANALYTICS) && (
              <AnimatedNavLink to="/employee-analytics" className={linkClass}>
                <BarChart2 className="h-5 w-5" />
                Employee Analytics
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.ANALYTICS_VIEW_POS_ANALYTICS) && (
              <AnimatedNavLink to="/pos-analytics" className={linkClass}>
                <Monitor className="h-5 w-5" />
                POS Analytics
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.ANALYTICS_VIEW_PROFITABILITY_ANALYTICS) && (
              <AnimatedNavLink to="/profitability-analytics" className={linkClass}>
                <DollarSign className="h-5 w-5" />
                Profitability Analytics
              </AnimatedNavLink>
            )}
          </>
        )}

        {/* Management */}
        {hasAnyPermission(
          PERMISSIONS.AUTH_REQUEST_VIEW_PAGE,
          PERMISSIONS.CASH_REQUESTS_VIEW,
          PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE,
          PERMISSIONS.EMPLOYEE_PROFILES_VIEW,
          PERMISSIONS.SCHEDULE_VIEW,
          PERMISSIONS.VIOLATION_NOTICE_VIEW,
          PERMISSIONS.WORKPLACE_RELATIONS_VIEW,
          PERMISSIONS.STORE_AUDIT_VIEW,
          PERMISSIONS.CASE_REPORT_VIEW,
        ) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Management')}
            {hasPermission(PERMISSIONS.AUTH_REQUEST_VIEW_PAGE) && (
              <AnimatedNavLink to="/authorization-requests" className={linkClass}>
                <FileText className="h-5 w-5" />
                Authorization Requests
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.EMPLOYEE_VERIFICATION_VIEW_PAGE) && (
              <AnimatedNavLink to="/employee-verifications" className={linkClass}>
                <Users className="h-5 w-5" />
                Employee Verifications
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.CASE_REPORT_VIEW) && (
              <AnimatedNavLink to="/case-reports" className={linkClass}>
                <FileWarning className="h-5 w-5" />
                Case Reports
              </AnimatedNavLink>
            )}

            {hasPermission(PERMISSIONS.STORE_AUDIT_VIEW) && (
              <SubCategory
                label="Internal Audit"
                expanded={auditExpanded}
                onToggle={() => setAuditExpanded((value) => !value)}
              >
                <AnimatedNavLink to="/store-audits" className={linkClass}>
                  <ClipboardList className="h-5 w-5" />
                  Store Audits
                </AnimatedNavLink>
              </SubCategory>
            )}

            {(hasPermission(PERMISSIONS.EMPLOYEE_PROFILES_VIEW)
              || hasPermission(PERMISSIONS.SCHEDULE_VIEW)
              || hasPermission(PERMISSIONS.VIOLATION_NOTICE_VIEW)
              || hasPermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW)) && (
              <SubCategory
                label="Human Resources"
                expanded={hrExpanded}
                onToggle={() => setHrExpanded((value) => !value)}
              >
                {hasPermission(PERMISSIONS.EMPLOYEE_PROFILES_VIEW) && (
                  <AnimatedNavLink to="/employee-profiles" className={linkClass}>
                    <User className="h-5 w-5" />
                    Employee Profiles
                  </AnimatedNavLink>
                )}
                {hasPermission(PERMISSIONS.SCHEDULE_VIEW) && (
                  <AnimatedNavLink to="/employee-schedule" className={linkClass}>
                    <Calendar className="h-5 w-5" />
                    Employee Schedule
                  </AnimatedNavLink>
                )}
                {hasPermission(PERMISSIONS.VIOLATION_NOTICE_VIEW) && (
                  <AnimatedNavLink to="/violation-notices" className={linkClass}>
                    <TriangleAlert className="h-5 w-5" />
                    Violation Notices
                  </AnimatedNavLink>
                )}
                {hasPermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW) && (
                  <AnimatedNavLink to="/workplace-relations" className={linkClass}>
                    <Users className="h-5 w-5" />
                    Workplace Relations
                  </AnimatedNavLink>
                )}
              </SubCategory>
            )}

            {hasPermission(PERMISSIONS.CASH_REQUESTS_VIEW) && (
              <SubCategory
                label="Accounting and Finance"
                expanded={financeExpanded}
                onToggle={() => setFinanceExpanded((value) => !value)}
              >
                <AnimatedNavLink to="/cash-requests" className={linkClass}>
                  <DollarSign className="h-5 w-5" />
                  Cash Requests
                </AnimatedNavLink>
              </SubCategory>
            )}
          </>
        )}

        {/* Store Operations */}
        {hasPermission(PERMISSIONS.POS_VIEW) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Store Operations')}
            {hasPermission(PERMISSIONS.POS_VIEW) && (
              <AnimatedNavLink to="/pos-verification" className={linkClass}>
                <ShieldCheck className="h-5 w-5" />
                <span className="flex-1">POS Verification</span>
                {pendingVerificationCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-bold text-white">
                    {pendingVerificationCount > 99 ? '99+' : pendingVerificationCount}
                  </span>
                )}
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.POS_VIEW) && (
              <AnimatedNavLink to="/pos-sessions" className={linkClass}>
                <Monitor className="h-5 w-5" />
                POS Sessions
              </AnimatedNavLink>
            )}
          </>
        )}

        {/* Administration */}
        {hasAnyPermission(
          PERMISSIONS.ADMIN_MANAGE_USERS,
          PERMISSIONS.ADMIN_MANAGE_ROLES,
          PERMISSIONS.ADMIN_MANAGE_COMPANIES,
          PERMISSIONS.ADMIN_MANAGE_DEPARTMENTS,
        ) && (
          <>
            <div className="my-2 border-t border-gray-200" />
            {categoryLabel('Administration')}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS) && (
              <AnimatedNavLink to="/admin/users" className={linkClass}>
                <Users className="h-5 w-5" />
                Users
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_ROLES) && (
              <AnimatedNavLink to="/admin/roles" className={linkClass}>
                <Shield className="h-5 w-5" />
                Roles
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_DEPARTMENTS) && (
              <AnimatedNavLink to="/admin/departments" className={linkClass}>
                <Building2 className="h-5 w-5" />
                Departments
              </AnimatedNavLink>
            )}
            {hasPermission(PERMISSIONS.ADMIN_MANAGE_COMPANIES) && (
              <AnimatedNavLink to="/admin/company" className={linkClass}>
                <Building2 className="h-5 w-5" />
                Company
              </AnimatedNavLink>
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
        <motion.button
          onClick={logout}
          whileHover={{ x: 4 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </motion.button>
      </div>
    </aside>
  );
}

