import { useCallback, useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, MapPin, CheckCheck, Menu, X } from 'lucide-react';
import axios from 'axios';
import { BranchSelector } from '@/shared/components/BranchSelector';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import { useNotificationStore } from '@/shared/store/notificationStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { api } from '@/shared/services/api.client';
import { applyCompanyThemeFromHex, DEFAULT_THEME_COLOR } from '@/shared/utils/theme';
import { PERMISSIONS } from '@omnilert/shared';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TYPE_DOT: Record<string, string> = {
  success: 'bg-green-500',
  warning: 'bg-yellow-500',
  danger: 'bg-red-500',
  info: 'bg-blue-500',
};

interface TopBarProps {
  onOpenSidebar?: () => void;
}

export function TopBar({ onOpenSidebar }: TopBarProps) {
  const user = useAuthStore((s) => s.user);
  const updateUser = useAuthStore((s) => s.updateUser);
  const setTokens = useAuthStore((s) => s.setTokens);
  const logoutStore = useAuthStore((s) => s.logout);
  const { branches, fetchBranches, setSelectedBranchIds } = useBranchStore();
  const { hasPermission } = usePermission();
  const navigate = useNavigate();
  const socket = useSocket('/notifications');
  const shiftSocket = useSocket('/employee-shifts');

  const { unreadCount, setUnreadCount, increment, decrement, reset, pushNotification } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const syncSelectedBranchFromActiveShift = useCallback(async () => {
    try {
      const res = await api.get('/account/schedule');
      const schedule: any[] = res.data.data || [];
      const activeShift = schedule
        .filter((s) => s.status === 'active' && !!s.branch_id)
        .sort(
          (a, b) => new Date(b.shift_start).getTime() - new Date(a.shift_start).getTime(),
        )[0];
      if (activeShift?.branch_id) {
        setSelectedBranchIds([activeShift.branch_id]);
      }
    } catch {
      // Ignore sync failures; user can still use current branch selection.
    }
  }, [setSelectedBranchIds]);

  useEffect(() => {
    fetchBranches().then(() => {
      const userHasAssignedBranches = user?.branchIds && user.branchIds.length > 0;
      const canToggle = hasPermission(PERMISSIONS.ADMIN_TOGGLE_BRANCH) || !userHasAssignedBranches;
      if (!canToggle && user?.branchIds) {
        setSelectedBranchIds(user.branchIds);
      }
      void syncSelectedBranchFromActiveShift();
    });
  }, []);

  // Fetch notification count + recent notifications on mount
  useEffect(() => {
    api.get('/account/notifications/count')
      .then((res) => setUnreadCount(res.data.data.unreadCount))
      .catch(() => {});
    api.get('/account/notifications')
      .then((res) => setNotifications(res.data.data?.slice(0, 20) || []))
      .catch(() => {});
  }, []);

  // Real-time: listen for new notifications
  useEffect(() => {
    if (!socket) return;

    socket.on('notification:new', (data: any) => {
      if (data?.id) {
        setNotifications((prev) => [data, ...prev].slice(0, 20));
        pushNotification(data);
      }
      increment();
    });

    socket.on('auth:force-logout', () => {
      applyCompanyThemeFromHex(DEFAULT_THEME_COLOR);
      logoutStore();
      navigate('/login', { replace: true });
    });

    socket.on('user:branch-assignments-updated', async (data: any) => {
      const nextBranchIds: string[] = Array.isArray(data?.branchIds) ? data.branchIds : [];

      // Sync auth user branch scope in-memory immediately.
      updateUser({ branchIds: nextBranchIds });

      // Rotate JWT so server-side branch authorization (HTTP + sockets) updates immediately.
      const refreshToken = useAuthStore.getState().refreshToken;
      if (refreshToken) {
        try {
          const res = await axios.post('/api/v1/auth/refresh', { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = res.data.data;
          setTokens(accessToken, newRefreshToken);
        } catch {
          // Ignore: client can still recover on next auth refresh cycle.
        }
      }

      await fetchBranches();

      const canToggleBranches =
        hasPermission(PERMISSIONS.ADMIN_TOGGLE_BRANCH) || nextBranchIds.length === 0;
      if (!canToggleBranches) {
        setSelectedBranchIds(nextBranchIds);
      }

      await syncSelectedBranchFromActiveShift();
    });

    return () => {
      socket.off('notification:new');
      socket.off('auth:force-logout');
      socket.off('user:branch-assignments-updated');
    };
  }, [socket, updateUser, setTokens, fetchBranches, hasPermission, setSelectedBranchIds, increment, pushNotification, syncSelectedBranchFromActiveShift, logoutStore, navigate]);

  // Real-time: auto-select designated branch after employee check-in / active shift updates.
  useEffect(() => {
    if (!shiftSocket) return;

    const handleShiftData = (data: any) => {
      if (data?.user_id !== user?.id) return;
      if (data?.status === 'active' && data?.branch_id) {
        setSelectedBranchIds([data.branch_id]);
      }
    };

    const handleShiftLog = (data: any) => {
      if (data?.log_type !== 'check_in') return;
      void syncSelectedBranchFromActiveShift();
    };

    shiftSocket.on('shift:new', handleShiftData);
    shiftSocket.on('shift:updated', handleShiftData);
    shiftSocket.on('shift:log-new', handleShiftLog);

    return () => {
      shiftSocket.off('shift:new', handleShiftData);
      shiftSocket.off('shift:updated', handleShiftData);
      shiftSocket.off('shift:log-new', handleShiftLog);
    };
  }, [shiftSocket, user?.id, setSelectedBranchIds, syncSelectedBranchFromActiveShift]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    if (!isMobile) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleClickNotification = async (n: any) => {
    if (!n.is_read) {
      api.put(`/account/notifications/${n.id}/read`).catch(() => {});
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)));
      decrement();
    }
    setOpen(false);
    navigate('/account/notifications', { state: { highlightNotificationId: n.id } });
  };

  const handleMarkAllRead = async () => {
    await api.put('/account/notifications/read-all').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    reset();
  };

  const userHasAssignedBranches = user?.branchIds && user.branchIds.length > 0;
  const canToggle = hasPermission(PERMISSIONS.ADMIN_TOGGLE_BRANCH) || !userHasAssignedBranches;

  const assignedBranchLabel = !canToggle && user?.branchIds
    ? user.branchIds
        .map((id) => branches.find((b) => b.id === id)?.name)
        .filter(Boolean)
        .join(', ') || null
    : null;
  const unreadNotifications = notifications.filter((n) => !n.is_read);

  return (
    <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-3 sm:px-6">
      <div className="flex items-center lg:hidden">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-800"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      <div className="ml-auto flex items-center gap-4">
        {assignedBranchLabel ? (
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-600">
            <MapPin className="h-3.5 w-3.5 text-gray-400" />
            {assignedBranchLabel}
          </div>
        ) : (
          <BranchSelector />
        )}

        {/* Notification bell */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>

          {open && (
            <>
              {/* Mobile panel */}
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/30 md:hidden"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              />
              <div className="fixed inset-x-3 top-20 bottom-3 z-50 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:hidden">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Mark all read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                      aria-label="Close notifications"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {unreadNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="mt-2 text-sm text-gray-500">No unread notifications</p>
                    </div>
                  ) : (
                    unreadNotifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleClickNotification(n)}
                        className="flex w-full gap-3 bg-primary-50/40 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[n.type] ?? TYPE_DOT.info}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {n.title}
                          </p>
                          <p className="mt-0.5 line-clamp-3 text-xs text-gray-500">{n.message}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{timeAgo(n.created_at)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-gray-100">
                  <button
                    onClick={() => { setOpen(false); navigate('/account/notifications'); }}
                    className="flex w-full items-center justify-center py-3 text-sm font-medium text-primary-600 hover:bg-gray-50"
                  >
                    View all notifications
                  </button>
                </div>
              </div>

              {/* Desktop dropdown */}
              <div className="absolute right-0 top-full z-50 mt-2 hidden w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:block">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="flex items-center gap-1 text-xs text-primary-600 hover:text-primary-700"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      Mark all read
                    </button>
                  )}
                </div>

                <div className="max-h-96 overflow-y-auto">
                  {unreadNotifications.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <Bell className="mx-auto h-8 w-8 text-gray-300" />
                      <p className="mt-2 text-sm text-gray-500">No unread notifications</p>
                    </div>
                  ) : (
                    unreadNotifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleClickNotification(n)}
                        className="flex w-full gap-3 bg-primary-50/40 px-4 py-3 text-left transition-colors hover:bg-gray-50"
                      >
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TYPE_DOT[n.type] ?? TYPE_DOT.info}`} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-900">
                            {n.title}
                          </p>
                          <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{n.message}</p>
                          <p className="mt-1 text-[11px] text-gray-400">{timeAgo(n.created_at)}</p>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                <div className="border-t border-gray-100">
                  <button
                    onClick={() => { setOpen(false); navigate('/account/notifications'); }}
                    className="flex w-full items-center justify-center py-2.5 text-xs font-medium text-primary-600 hover:bg-gray-50"
                  >
                    View all notifications
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt="Profile"
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
              {user?.firstName?.[0]}
              {user?.lastName?.[0]}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
