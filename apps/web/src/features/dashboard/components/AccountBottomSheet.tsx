import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Calendar,
  ChevronRight,
  ClipboardList,
  DollarSign,
  FileText,
  LogOut,
  Receipt,
  Settings,
  Wallet,
  X,
} from 'lucide-react';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { usePermission } from '@/shared/hooks/usePermission';
import { AnimatedNavLink } from './sidebar-nav';
import { PERMISSIONS } from '@omnilert/shared';

const sheetLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-primary-50 text-primary-700 shadow-sm'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

interface AccountBottomSheetProps {
  open: boolean;
  onClose: () => void;
}

export function AccountBottomSheet({ open, onClose }: AccountBottomSheetProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { hasPermission } = usePermission();

  const handleLogout = () => {
    logout();
    onClose();
  };

  const handleGoToProfile = () => {
    navigate('/account/profile');
    onClose();
  };

  return ReactDOM.createPortal(
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Sheet panel */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl"
          >
            {/* Drag handle */}
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
                My Account
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close account menu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* User info tile */}
            <button
              type="button"
              onClick={handleGoToProfile}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50"
            >
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt="Profile"
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
                  {user?.firstName?.[0]}{user?.lastName?.[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">
                  {user?.firstName} {user?.lastName}
                </p>
                <p className="truncate text-xs text-gray-500">{user?.email}</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-gray-400" />
            </button>

            <div className="mx-4 border-t border-gray-100" />

            {/* Nav links */}
            <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {/* Group 1 — Personal */}
              <div className="mb-1 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Personal</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              {hasPermission(PERMISSIONS.ACCOUNT_VIEW_SCHEDULE) && (
                <AnimatedNavLink to="/account/schedule" className={sheetLinkClass} onClick={onClose}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <Calendar className="h-4 w-4" />
                  </span>
                  My Schedule
                </AnimatedNavLink>
              )}
              <AnimatedNavLink to="/account/payslip" className={sheetLinkClass} onClick={onClose}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Receipt className="h-4 w-4" />
                </span>
                My Payslip
              </AnimatedNavLink>
              <AnimatedNavLink to="/account/token-pay" className={sheetLinkClass} onClick={onClose}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Wallet className="h-4 w-4" />
                </span>
                My Token Pay
              </AnimatedNavLink>

              {/* Group 2 — Requests & Results */}
              {(hasPermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST) ||
                hasPermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST) ||
                hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS)) && (
                <div className="my-3 flex items-center gap-3">
                  <div className="h-px flex-1 bg-gray-200" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Requests &amp; Results</span>
                  <div className="h-px flex-1 bg-gray-200" />
                </div>
              )}
              {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_AUTH_REQUEST) && (
                <AnimatedNavLink to="/account/authorization-requests" className={sheetLinkClass} onClick={onClose}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <FileText className="h-4 w-4" />
                  </span>
                  My Authorization Requests
                </AnimatedNavLink>
              )}
              {hasPermission(PERMISSIONS.ACCOUNT_MANAGE_CASH_REQUEST) && (
                <AnimatedNavLink to="/account/cash-requests" className={sheetLinkClass} onClick={onClose}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <DollarSign className="h-4 w-4" />
                  </span>
                  My Cash Requests
                </AnimatedNavLink>
              )}
              {hasPermission(PERMISSIONS.ACCOUNT_VIEW_AUDIT_RESULTS) && (
                <AnimatedNavLink to="/account/audit-results" className={sheetLinkClass} onClick={onClose}>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                    <ClipboardList className="h-4 w-4" />
                  </span>
                  My Audit Results
                </AnimatedNavLink>
              )}

              {/* Group 3 — Account */}
              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Account</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <AnimatedNavLink to="/account/settings" className={sheetLinkClass} onClick={onClose}>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-200 bg-gray-100">
                  <Settings className="h-4 w-4" />
                </span>
                My Settings
              </AnimatedNavLink>
            </nav>

            {/* Sign out */}
            <div className="border-t border-gray-100 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
              <motion.button
                type="button"
                onClick={handleLogout}
                whileHover={{ x: 4 }}
                whileTap={{ scale: 0.98 }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900"
              >
                <LogOut className="h-4 w-4" />
                Sign Out
              </motion.button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
