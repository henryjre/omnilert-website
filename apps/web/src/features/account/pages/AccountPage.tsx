import { NavLink, Outlet } from 'react-router-dom';
import { Calendar, FileText, DollarSign, Bell, Settings } from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';

export function AccountPage() {
  const { hasPermission } = usePermission();

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
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">My Account</h1>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-4">
          {tabs.filter((t) => t.show).map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`
              }
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <Outlet />
    </div>
  );
}
