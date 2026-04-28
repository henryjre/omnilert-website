import { useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Calendar, CheckSquare, Bell, User } from 'lucide-react';
import { useNotificationStore } from '@/shared/store/notificationStore';

interface BottomNavProps {
  onOpenAccountSheet: () => void;
  accountSheetOpen: boolean;
}

export function BottomNav({ onOpenAccountSheet, accountSheetOpen }: BottomNavProps) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const isActive = (path: string, exact = false) =>
    exact ? pathname === path : pathname.startsWith(path);

  const tabClass = (active: boolean) =>
    `flex flex-col items-center justify-center gap-0.5 flex-1 pt-2 pb-1 text-[10px] font-medium transition-colors ${
      active ? 'text-primary-600' : 'text-gray-500'
    }`;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-30 lg:hidden bg-white border-t border-gray-200 shadow-[0_-1px_4px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)]">
      <div className="flex items-end justify-around px-1">
        {/* Dashboard */}
        <button
          type="button"
          onClick={() => navigate('/dashboard')}
          className={tabClass(isActive('/dashboard', true))}
        >
          <LayoutDashboard className="h-5 w-5" />
          Dashboard
        </button>

        {/* Schedule */}
        <button
          type="button"
          onClick={() => navigate('/account/schedule')}
          className={tabClass(isActive('/account/schedule'))}
        >
          <Calendar className="h-5 w-5" />
          Schedule
        </button>

        {/* Tasks */}
        <button
          type="button"
          onClick={() => navigate('/account/tasks')}
          className={tabClass(isActive('/account/tasks'))}
        >
          <CheckSquare className="h-5 w-5" />
          Tasks
        </button>

        {/* Notifications */}
        <button
          type="button"
          onClick={() => navigate('/account/notifications')}
          className={tabClass(isActive('/account/notifications'))}
        >
          <span className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500" />
            )}
          </span>
          Notifications
        </button>

        {/* Account */}
        <button
          type="button"
          onClick={onOpenAccountSheet}
          className={tabClass(accountSheetOpen)}
        >
          <User className="h-5 w-5" />
          Account
        </button>
      </div>
    </nav>
  );
}
