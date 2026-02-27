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
} from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { usePosVerificationStore } from '@/shared/store/posVerificationStore';
import { useBranchStore } from '@/shared/store/branchStore';
import { api } from '@/shared/services/api.client';
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

interface CompanyOption {
  id: string;
  name: string;
  slug: string;
  themeColor?: string | null;
}

const HR_PATHS = ['/employee-profiles', '/employee-schedule', '/employee-requirements'];
const FINANCE_PATHS = ['/cash-requests'];

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
  const { logout, switchCompany, user } = useAuth();
  const companyName = useAuthStore((s) => s.companyName);
  const companySlug = useAuthStore((s) => s.companySlug);
  const fetchBranches = useBranchStore((s) => s.fetchBranches);
  const setSelectedBranchIds = useBranchStore((s) => s.setSelectedBranchIds);
  const navigate = useNavigate();
  const location = useLocation();
  const isAdministrator = (user?.roles ?? []).some((role) => role.name === 'Administrator');
  const pendingVerificationCount = usePosVerificationStore((s) => s.pendingCount);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [switchingCompany, setSwitchingCompany] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const [hrExpanded, setHrExpanded] = useState(() =>
    HR_PATHS.some((path) => location.pathname.startsWith(path)),
  );
  const [financeExpanded, setFinanceExpanded] = useState(() =>
    FINANCE_PATHS.some((path) => location.pathname.startsWith(path)),
  );

  useEffect(() => {
    let mounted = true;
    api.get('/auth/companies')
      .then((res) => {
        if (!mounted) return;
        setCompanies((res.data.data || []) as CompanyOption[]);
      })
      .catch(() => {
        if (!mounted) return;
        setCompanies([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCompanySwitch = async (nextSlug: string) => {
    if (!nextSlug || switchingCompany) return;
    if (companySlug === nextSlug) return;

    setSwitchError('');
    setSwitchingCompany(true);
    try {
      const switchedUser = await switchCompany(nextSlug);
      await fetchBranches();
      setSelectedBranchIds(switchedUser.branchIds ?? []);
      setCompanyMenuOpen(false);
      navigate('/dashboard');
    } catch (err: any) {
      setSwitchError(err.response?.data?.error || 'Failed to switch company');
    } finally {
      setSwitchingCompany(false);
    }
  };

  const currentCompanySlug = companySlug ?? companies[0]?.slug ?? '';

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!companyMenuOpen) return;
      const target = event.target as Element | null;
      if (!target) return;
      if (!target.closest('[data-company-switcher]')) {
        setCompanyMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [companyMenuOpen]);

  useEffect(() => {
    if (HR_PATHS.some((path) => location.pathname.startsWith(path))) {
      setHrExpanded(true);
    }
    if (FINANCE_PATHS.some((path) => location.pathname.startsWith(path))) {
      setFinanceExpanded(true);
    }
  }, [location.pathname]);

  return (
    <aside className={`flex h-[100dvh] w-64 flex-col border-r border-gray-200 bg-white ${className}`}>
      {/* Logo + Company Switcher */}
      <div className="relative border-b border-gray-200" data-company-switcher>
        {companies.length > 1 ? (
          <button
            type="button"
            onClick={() => {
              setSwitchError('');
              setCompanyMenuOpen((open) => !open);
            }}
            className="flex h-16 w-full items-center justify-between px-6 text-left transition-colors hover:bg-gray-50"
          >
            <div className="leading-tight">
              <h1 className="text-xl font-bold text-primary-600">Omnilert</h1>
              {companyName && <p className="text-[11px] text-gray-500">{companyName}</p>}
            </div>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
                companyMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
        ) : (
          <div className="flex h-16 items-center px-6">
            <div className="leading-tight">
              <h1 className="text-xl font-bold text-primary-600">Omnilert</h1>
              {companyName && <p className="text-[11px] text-gray-500">{companyName}</p>}
            </div>
          </div>
        )}

        <div
          className={`pointer-events-none absolute left-3 right-3 top-[calc(100%+0.5rem)] z-50 origin-top rounded-xl border border-gray-200 bg-white shadow-lg transition-all duration-200 ease-out ${
            companies.length > 1 && companyMenuOpen
              ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
              : 'translate-y-1 scale-95 opacity-0'
          }`}
        >
          <div className="max-h-72 space-y-1 overflow-y-auto p-2">
            {companies.map((company) => {
              const isCurrent = company.slug === currentCompanySlug;
              return (
                <button
                  key={company.id}
                  type="button"
                  onClick={() => handleCompanySwitch(company.slug)}
                  disabled={isCurrent || switchingCompany}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                    isCurrent
                      ? 'cursor-default bg-gray-100 text-gray-500'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: company.themeColor || '#2563EB' }}
                  />
                  <span className="flex-1">{company.name}</span>
                  {isCurrent && <span className="text-[11px] font-medium">Current</span>}
                </button>
              );
            })}
          </div>
          {switchError && (
            <p className="px-3 pb-2 text-[10px] text-red-600">{switchError}</p>
          )}
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

        <div className="my-2 border-t border-gray-200" />
        {categoryLabel('My Account')}
        <NavLink to="/account/schedule" className={linkClass}>
          <Calendar className="h-5 w-5" />
          Schedule
        </NavLink>
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
        <NavLink to="/account/notifications" className={linkClass}>
          <Bell className="h-5 w-5" />
          Notifications
        </NavLink>
        <NavLink to="/account/profile" className={linkClass}>
          <IdCard className="h-5 w-5" />
          Profile
        </NavLink>
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

            {(hasPermission(PERMISSIONS.EMPLOYEE_VIEW_ALL_PROFILES)
              || hasPermission(PERMISSIONS.SHIFT_VIEW_ALL)
              || hasPermission(PERMISSIONS.EMPLOYEE_REQUIREMENTS_APPROVE)) && (
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
