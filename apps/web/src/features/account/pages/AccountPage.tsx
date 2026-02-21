import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Calendar, FileText, DollarSign, Bell, Settings, ClipboardCheck } from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';

export function AccountPage() {
  const { hasPermission } = usePermission();
  const location = useLocation();

  const tabs = [
    { to: '/account/schedule', label: 'Schedule', icon: Calendar, show: true },
    {
      to: '/account/authorization-requests',
      label: 'Authorization Requests',
      icon: FileText,
      show: hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUTH_REQUESTS),
    },
    {
      to: '/account/cash-requests',
      label: 'Cash Requests',
      icon: DollarSign,
      show: hasPermission(PERMISSIONS.ACCOUNT_VIEW_CASH_REQUESTS),
    },
    { to: '/account/notifications', label: 'Notifications', icon: Bell, show: true },
    { to: '/account/settings', label: 'Settings', icon: Settings, show: true },
    { to: '/account/employment', label: 'Employment', icon: ClipboardCheck, show: true },
  ];

  const visibleTabs = tabs.filter((t) => t.show);
  const activeTab = visibleTabs.find((tab) => location.pathname.startsWith(tab.to));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Account</h1>
        <p className="mt-1 text-sm font-medium text-gray-600 sm:hidden">
          {activeTab?.label ?? 'Overview'}
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex w-full sm:min-w-max sm:gap-2 sm:overflow-x-auto md:gap-4">
          {visibleTabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              aria-label={tab.label}
              title={tab.label}
              className={({ isActive }) =>
                `flex flex-1 items-center justify-center gap-1.5 border-b-2 px-1 py-3 text-xs font-medium transition-colors sm:flex-none sm:justify-start sm:gap-2 sm:px-1 sm:text-sm ${
                  isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`
              }
            >
              <tab.icon className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
