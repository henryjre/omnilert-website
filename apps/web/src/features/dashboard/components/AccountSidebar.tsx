import { motion } from 'framer-motion';
import { linkClass, AnimatedNavLink } from './sidebar-nav';
import {
  Calendar,
  CheckSquare,
  Receipt,
  Wallet,
  FileText,
  DollarSign,
  ClipboardList,
  Bell,
  IdCard,
  Settings,
  LogOut,
  X,
} from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { PERMISSIONS } from '@omnilert/shared';

interface AccountSidebarProps {
  className?: string;
  onClose: () => void;
}

export function AccountSidebar({ className = '', onClose }: AccountSidebarProps) {
  const { hasPermission } = usePermission();
  const { logout, user } = useAuth();

  const handleLogout = () => {
    onClose();
    logout();
  };

  return (
    <aside className={`flex h-[100dvh] w-64 flex-col border-l border-gray-200 bg-white ${className}`}>
      {/* Header */}
      <div className="border-b border-gray-200">
        <div className="flex h-16 items-center justify-between px-6">
          <h1 className="text-sm font-semibold uppercase tracking-wide text-gray-400">My Account</h1>
          <motion.button
            type="button"
            onClick={onClose}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="Close account menu"
          >
            <X className="h-4 w-4" />
          </motion.button>
        </div>
      </div>

      {/* Navigation */}
      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE) && (
          <AnimatedNavLink to="/account/schedule" className={linkClass} onClick={onClose}>
            <Calendar className="h-5 w-5" />
            My Schedule
          </AnimatedNavLink>
        )}
        <AnimatedNavLink to="/account/tasks" className={linkClass} onClick={onClose}>
          <CheckSquare className="h-5 w-5" />
          My Tasks
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/payslip" className={linkClass} onClick={onClose}>
          <Receipt className="h-5 w-5" />
          My Payslip
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/token-pay" className={linkClass} onClick={onClose}>
          <Wallet className="h-5 w-5" />
          My Token Pay
        </AnimatedNavLink>
        {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST) && (
          <AnimatedNavLink to="/account/authorization-requests" className={linkClass} onClick={onClose}>
            <FileText className="h-5 w-5" />
            My Authorization Requests
          </AnimatedNavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST) && (
          <AnimatedNavLink to="/account/cash-requests" className={linkClass} onClick={onClose}>
            <DollarSign className="h-5 w-5" />
            My Cash Requests
          </AnimatedNavLink>
        )}
        {hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS) && (
          <AnimatedNavLink to="/account/audit-results" className={linkClass} onClick={onClose}>
            <ClipboardList className="h-5 w-5" />
            My Audit Results
          </AnimatedNavLink>
        )}
        <AnimatedNavLink to="/account/notifications" className={linkClass} onClick={onClose}>
          <Bell className="h-5 w-5" />
          My Notifications
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/profile" className={linkClass} onClick={onClose}>
          <IdCard className="h-5 w-5" />
          My Profile
        </AnimatedNavLink>
        <AnimatedNavLink to="/account/settings" className={linkClass} onClick={onClose}>
          <Settings className="h-5 w-5" />
          My Settings
        </AnimatedNavLink>
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
          onClick={handleLogout}
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
