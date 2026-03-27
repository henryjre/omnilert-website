import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import axios from 'axios';
import { BranchSelector } from '@/shared/components/BranchSelector';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import { useNotificationStore } from '@/shared/store/notificationStore';
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

function getShiftExchangeId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]shiftExchangeId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getShiftId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]shiftId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
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
  const { fetchBranches } = useBranchStore();
  const navigate = useNavigate();
  const notificationsSocket = useSocket('/notifications');
  const userEventsSocket = useSocket('/user-events');

  const { unreadCount, setUnreadCount, increment, decrement, reset, pushNotification } = useNotificationStore();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void fetchBranches();
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
    if (!notificationsSocket) return;

    notificationsSocket.on('notification:new', (data: any) => {
      if (data?.id) {
        setNotifications((prev) => [data, ...prev].slice(0, 20));
        pushNotification(data);
      }
      increment();
    });

    return () => {
      notificationsSocket.off('notification:new');
    };
  }, [notificationsSocket, increment, pushNotification]);

  useEffect(() => {
    if (!userEventsSocket) return;

    userEventsSocket.on('auth:force-logout', () => {
      applyCompanyThemeFromHex(DEFAULT_THEME_COLOR);
      logoutStore();
      navigate('/login', { replace: true });
    });

    const handleAuthScopeUpdated = async () => {
      // Always read the latest tokens directly from the store — the closure over
      // `setTokens` is stable but `refreshToken` must be read at call-time to avoid
      // using a stale value from a previous render.
      const refreshToken = useAuthStore.getState().refreshToken;
      const permsBefore = useAuthStore.getState().user?.permissions ?? [];
      console.debug('[DIAG] TopBar user:auth-scope-updated received. permsBefore:', permsBefore);
      if (!refreshToken) return;

      try {
        const res = await axios.post('/api/v1/auth/refresh', { refreshToken });
        const { accessToken, refreshToken: newRefreshToken } = res.data.data;
        console.debug('[DIAG] TopBar /auth/refresh succeeded. Calling setTokens.');
        setTokens(accessToken, newRefreshToken);
        const permsAfter = useAuthStore.getState().user?.permissions ?? [];
        console.debug('[DIAG] TopBar setTokens done. permsAfter:', permsAfter);
      } catch (err) {
        console.error('[DIAG] TopBar /auth/refresh FAILED:', err);
        // Retry once after a short delay to handle transient token rotation races.
        setTimeout(() => {
          const retryRefreshToken = useAuthStore.getState().refreshToken;
          if (!retryRefreshToken) return;
          axios.post('/api/v1/auth/refresh', { refreshToken: retryRefreshToken })
            .then((res) => {
              const { accessToken, refreshToken: newRefreshToken } = res.data.data;
              setTokens(accessToken, newRefreshToken);
            })
            .catch(() => {
              // Both attempts failed; the user's next API call will trigger a 401 → auto-refresh.
            });
        }, 1500);
      }
    };

    userEventsSocket.on('user:auth-scope-updated', handleAuthScopeUpdated);

    userEventsSocket.on('user:branch-assignments-updated', async (data: any) => {
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
    });

    return () => {
      userEventsSocket.off('auth:force-logout');
      userEventsSocket.off('user:auth-scope-updated');
      userEventsSocket.off('user:branch-assignments-updated');
    };
  }, [userEventsSocket, updateUser, setTokens, fetchBranches, logoutStore, navigate]);

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
    if (typeof n.link_url === "string" && (n.link_url.startsWith("/account/authorization-requests") || n.link_url.startsWith("/account/cash-requests"))) {
      navigate(n.link_url);
      return;
    }
    if (n.link_url?.startsWith('/case-reports')) {
      navigate(n.link_url);
      return;
    }
    if (n.link_url === '/account/profile') {
      navigate('/account/profile');
      return;
    }
    if (n.link_url === '/account/settings') {
      navigate('/account/settings');
      return;
    }
    const shiftId = getShiftId(n.link_url);
    if (shiftId) {
      // Navigate using the full link_url to preserve extra params like ?highlight=.
      navigate(n.link_url ?? `/account/schedule?shiftId=${shiftId}`);
      return;
    }
    const shiftExchangeId = getShiftExchangeId(n.link_url);
    const target = shiftExchangeId
      ? `/account/notifications?shiftExchangeId=${shiftExchangeId}`
      : '/account/notifications';
    navigate(target, { state: { highlightNotificationId: n.id } });
  };

  const handleMarkAllRead = async () => {
    await api.put('/account/notifications/read-all').catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    reset();
  };

  const unreadNotifications = notifications.filter((n) => !n.is_read);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center border-b border-gray-200 bg-white px-3 sm:px-6">
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

      {/* BranchSelector: centered on mobile, right-aligned before bell on desktop */}
      <div className="pointer-events-none absolute inset-x-0 flex justify-center md:pointer-events-auto md:static md:ml-auto md:block">
        <BranchSelector />
      </div>

      <div className="ml-auto flex items-center gap-3 md:ml-3">
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

          <AnimatePresence initial={false}>
            {open && (
            <>
              {/* Mobile backdrop */}
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-40 bg-black/30 md:hidden"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
              />

              {/* Mobile panel */}
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                className="fixed inset-x-3 top-20 bottom-3 z-50 flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:hidden"
              >
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
              </motion.div>

              {/* Desktop dropdown */}
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
                className="absolute right-0 top-full z-50 mt-2 hidden w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl md:block"
              >
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
              </motion.div>
            </>
          )}
          </AnimatePresence>
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
