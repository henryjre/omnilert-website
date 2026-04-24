import { useEffect, useState, useRef } from 'react';
import { Pagination } from '@/shared/components/ui/Pagination';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from "@/shared/components/ui/Spinner";
import { AnimatedModal } from "@/shared/components/ui/AnimatedModal";
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from "framer-motion";
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useSocket } from '@/shared/hooks/useSocket';
import { useNotificationStore } from '@/shared/store/notificationStore';
import { ShiftExchangeDetailModal } from '@/features/shift-exchange/components/ShiftExchangeDetailModal';
import { PeerEvaluationModal } from '../../peer-evaluations/components/PeerEvaluationModal';
import { ShiftAuthReasonModal } from './ShiftAuthReasonModal';
import { Bell, Check, X, Trash2, CheckCheck, Mail } from 'lucide-react';

const SWIPE_MAX_PX = 96;
const SWIPE_COMMIT_PX = 72;
const SWIPE_LOCK_THRESHOLD_PX = 10;

function NotificationSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-l-4 border-gray-200 border-l-gray-200 bg-white p-3 sm:p-4">
      <div className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-40 rounded bg-gray-200" />
            <div className="h-3 w-full rounded bg-gray-200" />
            <div className="h-3 w-3/4 rounded bg-gray-200" />
            <div className="h-3 w-24 rounded bg-gray-200" />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-24 rounded-lg bg-gray-200" />
          <div className="h-7 w-16 rounded bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

function fmtDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const datePart = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
  const timePart = new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
  return `${datePart} at ${timePart}`;
}

function fmtOdooDate(dateStr: string): string {
  const d = new Date(dateStr + ' UTC');
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d);
}

function fmt(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

function getTokenPayVerificationId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const prefix = '/account?tokenPayVerificationId=';
  if (linkUrl.startsWith(prefix)) {
    return linkUrl.slice(prefix.length) || null;
  }
  return null;
}

function getShiftExchangeId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]shiftExchangeId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getPeerEvaluationId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]peerEvaluationId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getAuthId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]authId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getMessageId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]messageId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getShiftId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]shiftId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getRequestId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]requestId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

function getPayslipAdjustmentId(linkUrl: string | null | undefined): string | null {
  if (!linkUrl) return null;
  const match = linkUrl.match(/[?&]adjustmentId=([0-9a-f-]{36})/i);
  return match?.[1] ?? null;
}

const PAGE_SIZE = 10;

interface MobileSwipeNotificationCardProps {
  notification: any;
  isDeleting: boolean;
  onDelete: (n: any) => Promise<void>;
  onSetReadState: (id: string, isRead: boolean) => Promise<boolean>;
  children: React.ReactNode;
}

function MobileSwipeNotificationCard({
  notification,
  isDeleting,
  onDelete,
  onSetReadState,
  children,
}: MobileSwipeNotificationCardProps) {
  const swipeX = useMotionValue(0);
  const deleteIconX = useTransform(swipeX, (v) => v + SWIPE_MAX_PX / 2);
  const readIconX = useTransform(swipeX, (v) => v - SWIPE_MAX_PX / 2);
  // Fade from subtle (0.35) to full (1) as swipe crosses the commit threshold
  const deleteLaneOpacity = useTransform(swipeX, [-SWIPE_MAX_PX, -SWIPE_COMMIT_PX, 0], [1, 0.35, 0]);
  const readLaneOpacity = useTransform(swipeX, [0, SWIPE_COMMIT_PX, SWIPE_MAX_PX], [0, 0.35, 1]);
  const [lane, setLane] = useState<'delete' | 'read-toggle' | null>(null);
  const [isPending, setIsPending] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; locked: 'h' | 'v' | null } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if ((e.target as HTMLElement).closest('[data-no-swipe]')) return;
    touchStartRef.current = {
      x: e.touches[0].clientX,
      y: e.touches[0].clientY,
      locked: null,
    };
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartRef.current) return;
    if ((e.target as HTMLElement).closest('[data-no-swipe]')) return;
    const start = touchStartRef.current;
    const touch = e.touches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (start.locked === null && Math.abs(deltaX) + Math.abs(deltaY) > SWIPE_LOCK_THRESHOLD_PX) {
      start.locked = Math.abs(deltaX) >= Math.abs(deltaY) ? 'h' : 'v';
      touchStartRef.current = { ...start };
    }

    if (start.locked === 'v') return;
    if (start.locked !== 'h') return;

    e.preventDefault();
    const clamped = Math.max(-SWIPE_MAX_PX, Math.min(SWIPE_MAX_PX, deltaX));
    swipeX.set(clamped);
    if (clamped < -4) {
      setLane('delete');
    } else if (clamped > 4) {
      setLane('read-toggle');
    } else {
      setLane(null);
    }
  }

  async function handleTouchEnd() {
    if (!touchStartRef.current) return;
    touchStartRef.current = null;
    const x = swipeX.get();

    if (isPending || isDeleting) {
      void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
      return;
    }

    if (x < -SWIPE_COMMIT_PX) {
      // Delete: animate off-screen, then invoke
      setIsPending(true);
      await animate(swipeX, -window.innerWidth, { type: 'tween', duration: 0.2 });
      await onDelete(notification);
      setIsPending(false);
      void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
    } else if (x > SWIPE_COMMIT_PX) {
      // Toggle read state
      setIsPending(true);
      const ok = await onSetReadState(notification.id, !notification.is_read);
      setIsPending(false);
      if (!ok) {
        void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
      } else {
        void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
      }
    } else {
      void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
    }
    setLane(null);
  }

  return (
    <div className="relative overflow-hidden rounded-xl sm:overflow-visible sm:rounded-none">
      {/* Left lane (right swipe → read toggle) */}
      <motion.div
        className="absolute inset-0 flex items-center rounded-xl sm:hidden bg-primary-500"
        style={{ opacity: readLaneOpacity }}
      >
        <motion.div style={{ x: readIconX }} className="flex items-center justify-center w-10">
          {notification.is_read
            ? <Mail className="h-5 w-5 text-white" />
            : <CheckCheck className="h-5 w-5 text-white" />}
        </motion.div>
      </motion.div>

      {/* Right lane (left swipe → delete) */}
      <motion.div
        className="absolute inset-0 flex items-center justify-end rounded-xl sm:hidden"
        style={{ backgroundColor: 'rgb(239 68 68)', opacity: deleteLaneOpacity }}
      >
        <motion.div style={{ x: deleteIconX }} className="flex items-center justify-center w-10">
          <Trash2 className="h-5 w-5 text-white" />
        </motion.div>
      </motion.div>

      {/* Card — swipes horizontally on mobile only */}
      <motion.div
        style={{ x: swipeX, touchAction: 'pan-y' }}
        className="relative sm:!transform-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={() => { void handleTouchEnd(); }}
        onTouchCancel={() => {
          touchStartRef.current = null;
          void animate(swipeX, 0, { type: 'spring', stiffness: 400, damping: 30 });
          setLane(null);
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export function EmployeeNotificationsTab() {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [actedNotifIds, setActedNotifIds] = useState<Set<string>>(new Set());
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const notificationsSocket = useSocket('/notifications');
  const increment = useNotificationStore((s) => s.increment);
  const decrement = useNotificationStore((s) => s.decrement);
  const patchNotification = useNotificationStore((s) => s.patchNotification);
  const latestNotification = useNotificationStore((s) => s.latestNotification);
  const latestNotificationPatch = useNotificationStore((s) => s.latestNotificationPatch);

  // Token Pay modal state
  const [tokenPayModal, setTokenPayModal] = useState<{ notifId: string; verificationId: string } | null>(null);
  const [tokenPayData, setTokenPayData] = useState<any>(null);
  const [tokenPayLoading, setTokenPayLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [shiftExchangeRequestId, setShiftExchangeRequestId] = useState<string | null>(null);
  const [peerEvalId, setPeerEvalId] = useState<string | null>(null);
  const [reasonModalAuthId, setReasonModalAuthId] = useState<string | null>(null);
  const [deletingNotificationIds, setDeletingNotificationIds] = useState<Set<string>>(new Set());
  const [deleteAllReadOpen, setDeleteAllReadOpen] = useState(false);
  const [deleteAllReadLoading, setDeleteAllReadLoading] = useState(false);

  useEffect(() => {
    api
      .get('/account/notifications')
      .then((res) => setNotifications(res.data.data || []))
      .catch((err: any) => {
        showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to load notifications.');
      })
      .finally(() => setLoading(false));
  }, [showErrorToast]);

  // Real-time: prepend new notifications pushed from TopBar via the store
  useEffect(() => {
    if (!latestNotification) return;
    setNotifications((prev) => {
      if (prev.some((n) => n.id === latestNotification.id)) return prev;
      return [latestNotification, ...prev];
    });
    setPage(1);
  }, [latestNotification]);

  // Patch local notification state when a same-session read-state change is broadcast
  useEffect(() => {
    if (!latestNotificationPatch) return;
    const { id, changes } = latestNotificationPatch;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, ...changes } : n)),
    );
  }, [latestNotificationPatch]);

  useEffect(() => {
    if (!notificationsSocket) return;

    const handleNotificationDeleted = (data: any) => {
      if (!data?.id) return;
      setNotifications((prev) => prev.filter((notification) => notification.id !== data.id));
    };

    notificationsSocket.on('notification:deleted', handleNotificationDeleted);

    return () => {
      notificationsSocket.off('notification:deleted', handleNotificationDeleted);
    };
  }, [notificationsSocket]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE));
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [notifications.length]);

  // Scroll to and highlight a notification when navigated from the bell dropdown
  useEffect(() => {
    const id = (location.state as any)?.highlightNotificationId;
    if (!id || loading) return;
    // Navigate to the page that contains this notification
    setNotifications((current) => {
      const idx = current.findIndex((n) => n.id === id);
      if (idx !== -1) {
        setPage(Math.floor(idx / PAGE_SIZE) + 1);
      }
      return current;
    });
    setHighlightId(id);
    // Give the DOM a tick to render before scrolling
    const timer = setTimeout(() => {
      cardRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 150);
    // Remove the highlight after the animation completes
    const clearTimer = setTimeout(() => setHighlightId(null), 3000);
    return () => {
      clearTimeout(timer);
      clearTimeout(clearTimer);
    };
  }, [location.state, loading]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const shiftExchangeId = params.get('shiftExchangeId');
    if (shiftExchangeId) {
      setShiftExchangeRequestId(shiftExchangeId);
    }
    const peerEvaluationId = params.get('peerEvaluationId');
    if (peerEvaluationId) {
      setPeerEvalId(peerEvaluationId);
    }
  }, [location.search]);

  const setNotificationReadState = async (notificationId: string, isRead: boolean): Promise<boolean> => {
    try {
      const endpoint = isRead
        ? `/account/notifications/${notificationId}/read`
        : `/account/notifications/${notificationId}/unread`;
      await api.put(endpoint);
      const changes = { is_read: isRead };
      setNotifications((prev) => prev.map((n) => (n.id === notificationId ? { ...n, ...changes } : n)));
      patchNotification(notificationId, changes);
      if (isRead) {
        decrement();
      } else {
        increment();
      }
      return true;
    } catch (err: any) {
      showErrorToast(
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        `Failed to mark notification as ${isRead ? 'read' : 'unread'}.`,
      );
      return false;
    }
  };

  const markAsRead = async (id: string): Promise<boolean> => {
    return setNotificationReadState(id, true);
  };

  const removeNotificationsFromState = (notificationIds: string[]) => {
    if (notificationIds.length === 0) return;
    const idSet = new Set(notificationIds);
    setNotifications((prev) => prev.filter((notification) => !idSet.has(notification.id)));
  };

  const handleDeleteNotification = async (notification: any) => {
    const notificationId = String(notification?.id ?? '').trim();
    if (!notificationId) return;

    setDeletingNotificationIds((prev) => new Set(prev).add(notificationId));
    try {
      await api.delete(`/account/notifications/${notificationId}`);
      removeNotificationsFromState([notificationId]);
      showSuccessToast('Notification deleted.');
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to delete notification.');
    } finally {
      setDeletingNotificationIds((prev) => {
        const next = new Set(prev);
        next.delete(notificationId);
        return next;
      });
    }
  };

  const handleDeleteAllRead = async () => {
    setDeleteAllReadLoading(true);
    try {
      const res = await api.delete('/account/notifications/read-all');
      const deletedIds = Array.isArray(res.data?.data?.deletedIds)
        ? res.data.data.deletedIds.filter((id: unknown): id is string => typeof id === 'string')
        : [];
      removeNotificationsFromState(deletedIds);
      setDeleteAllReadOpen(false);
      showSuccessToast(
        deletedIds.length === 1
          ? '1 read notification deleted.'
          : `${deletedIds.length} read notifications deleted.`,
      );
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to delete read notifications.');
    } finally {
      setDeleteAllReadLoading(false);
    }
  };

  const handleOpenNotificationLink = async (notification: any) => {
    const linkUrl = typeof notification?.link_url === 'string' ? notification.link_url.trim() : '';
    if (!linkUrl) return;
    if (!notification.is_read) {
      const didMarkAsRead = await markAsRead(notification.id);
      if (!didMarkAsRead) return;
    }
    if (linkUrl === '/account/settings') {
      navigate('/account/settings');
      return;
    }
    if (linkUrl === '/account/profile') {
      navigate('/account/profile');
      return;
    }
    if (linkUrl.startsWith('/case-reports') || linkUrl.startsWith('/violation-notices')) {
      navigate(linkUrl);
      return;
    }
    const shiftId = getShiftId(linkUrl);
    if (shiftId) {
      navigate(`/account/schedule?shiftId=${shiftId}`);
    }
  };

  const openTokenPayModal = async (notifId: string, verificationId: string) => {
    setTokenPayModal({ notifId, verificationId });
    setTokenPayLoading(true);
    setRejectMode(false);
    setRejectReason('');
    setConfirmVerify(false);
    try {
      const res = await api.get(`/account/token-pay/${verificationId}`);
      setTokenPayData(res.data.data);
    } catch (err: any) {
      setTokenPayData(null);
      showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to load order verification details.');
    } finally {
      setTokenPayLoading(false);
    }
  };

  const closeTokenPayModal = () => {
    setTokenPayModal(null);
    setTokenPayData(null);
    setRejectMode(false);
    setRejectReason('');
    setConfirmVerify(false);
  };

  const handleVerify = async () => {
    if (!tokenPayModal) return;
    setActionLoading(true);
    try {
      await api.post(`/pos-verifications/${tokenPayModal.verificationId}/customer-verify`);
      await markAsRead(tokenPayModal.notifId);
      setActedNotifIds((prev) => new Set(prev).add(tokenPayModal.notifId));
      setNotifications((prev) => prev.map((n) => n.id === tokenPayModal.notifId ? { ...n, verification_status: 'confirmed' } : n));
      showSuccessToast('Order verified successfully.');
      closeTokenPayModal();
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to verify order.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!tokenPayModal || !rejectReason.trim()) return;
    setActionLoading(true);
    try {
      await api.post(`/pos-verifications/${tokenPayModal.verificationId}/customer-reject`, {
        reason: rejectReason,
      });
      await markAsRead(tokenPayModal.notifId);
      setActedNotifIds((prev) => new Set(prev).add(tokenPayModal.notifId));
      setNotifications((prev) => prev.map((n) => n.id === tokenPayModal.notifId ? { ...n, verification_status: 'rejected', verification_rejection_reason: rejectReason } : n));
      showSuccessToast('Order rejected.');
      closeTokenPayModal();
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to reject order.');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return null;

  /** Maps notification type → a Tailwind left-border color class. */
  const typeBorderClass = (type: string): string => {
    switch (type) {
      case 'success':
        return 'border-l-green-500';
      case 'warning':
        return 'border-l-yellow-500';
      case 'danger':
      case 'urgent':
        return 'border-l-red-500';
      default:
        return 'border-l-blue-500';
    }
  };

  const readNotificationCount = notifications.filter((notification) => notification.is_read).length;

  if (notifications.length === 0) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Notifications</h1>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <Bell className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">No notifications yet.</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE));
  const pagedNotifications = notifications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Bell className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">My Notifications</h1>
        </div>
        <Button
          variant="secondary"
          size="sm"
          data-no-swipe
          onClick={() => setDeleteAllReadOpen(true)}
          disabled={readNotificationCount === 0}
          className="self-start text-xs sm:self-auto"
        >
          Delete all read
        </Button>
      </div>

      <div className="space-y-3">
        {pagedNotifications.map((n) => {
          const tokenPayId = getTokenPayVerificationId(n.link_url);
          const shiftExchangeId = getShiftExchangeId(n.link_url);
          const peerEvaluationId = getPeerEvaluationId(n.link_url);
          const shiftId = getShiftId(n.link_url);
          const messageId = getMessageId(n.link_url);
          const authId = getAuthId(n.link_url);
          const requestId = getRequestId(n.link_url);
          const payslipAdjustmentId = getPayslipAdjustmentId(n.link_url);
          const isDiscussionLink =
            typeof n.link_url === 'string' &&
            (n.link_url.startsWith('/case-reports') || n.link_url.startsWith('/violation-notices'));
          const isAuthRequestLink = typeof n.link_url === "string" && n.link_url.startsWith("/account/authorization-requests");
          const isCashRequestLink = typeof n.link_url === "string" && n.link_url.startsWith("/account/cash-requests");
          const isDeletingNotification = deletingNotificationIds.has(n.id);
          return (
            <div key={n.id} ref={(el) => { cardRefs.current[n.id] = el; }}>
            <MobileSwipeNotificationCard
              notification={n}
              isDeleting={isDeletingNotification}
              onDelete={handleDeleteNotification}
              onSetReadState={setNotificationReadState}
            >
            <Card className={`border-l-4 ${typeBorderClass(n.type)} transition-all duration-300 ${highlightId === n.id ? 'ring-2 ring-primary-400 animate-pulse' : ''}`}>
              <CardBody className="p-3 sm:p-4">
                <div className={`flex flex-col gap-2.5 sm:flex-row sm:items-start sm:gap-3 transition-opacity duration-300 ${n.is_read ? 'opacity-60' : ''}`}>
                  {/* Notification content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      {tokenPayId && n.verification_status && (
                        <Badge variant={
                          n.verification_status === 'confirmed' ? 'success'
                          : n.verification_status === 'rejected' ? 'danger'
                          : 'warning'
                        }>
                          {n.verification_status === 'awaiting_customer' ? 'pending' : n.verification_status}
                        </Badge>
                      )}
                      {!n.is_read && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-primary-500" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-gray-600">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">{fmtDateTime(n.created_at)}</p>
                  </div>

                  {/* Action buttons — below text on mobile, right column on desktop */}
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {messageId && isDiscussionLink && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => { void handleOpenNotificationLink(n); }}
                        className="text-xs"
                      >
                        View Reply
                      </Button>
                    )}
                    {authId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => {
                          if (!n.is_read) { void markAsRead(n.id); }
                          setReasonModalAuthId(authId);
                        }}
                        className="text-xs"
                      >
                        View Authorization
                      </Button>
                    )}
                    {shiftId && !authId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => {
                          if (!n.is_read) { void markAsRead(n.id); }
                          navigate(n.link_url ?? `/account/schedule?shiftId=${shiftId}`);
                        }}
                        className="text-xs"
                      >
                        View Shift
                      </Button>
                    )}
                    {requestId && (isAuthRequestLink || isCashRequestLink) && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => {
                          if (!n.is_read) { void markAsRead(n.id); }
                          navigate(n.link_url ?? (isAuthRequestLink ? `/account/authorization-requests?requestId=${requestId}` : `/account/cash-requests?requestId=${requestId}`));
                        }}
                        className="text-xs"
                      >
                        View Request
                      </Button>
                    )}
                    {peerEvaluationId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => setPeerEvalId(peerEvaluationId)}
                        className="text-xs"
                      >
                        Rate Peer
                      </Button>
                    )}
                    {shiftExchangeId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => setShiftExchangeRequestId(shiftExchangeId)}
                        className="text-xs"
                      >
                        View Request
                      </Button>
                    )}
                    {payslipAdjustmentId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => {
                          if (!n.is_read) { void markAsRead(n.id); }
                          navigate(`/account/payslip?tab=adjustments&adjustmentId=${payslipAdjustmentId}`);
                        }}
                        className="text-xs"
                      >
                        View Adjustment
                      </Button>
                    )}
                    {tokenPayId && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => openTokenPayModal(n.id, tokenPayId)}
                        className="text-xs"
                      >
                        View Order
                      </Button>
                    )}
                    {n.link_url === '/account/settings' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => { void handleOpenNotificationLink(n); }}
                        className="text-xs"
                      >
                        Open Settings
                      </Button>
                    )}
                    {n.link_url === '/account/profile' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-no-swipe
                        onClick={() => { void handleOpenNotificationLink(n); }}
                        className="text-xs"
                      >
                        Open Profile
                      </Button>
                    )}
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => { void markAsRead(n.id); }}
                        disabled={isDeletingNotification}
                        className="hidden text-xs text-primary-600 hover:underline sm:inline"
                      >
                        Mark read
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => { void handleDeleteNotification(n); }}
                      disabled={isDeletingNotification}
                      className="hidden text-xs text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-50 disabled:no-underline sm:inline"
                    >
                      {isDeletingNotification ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </div>
              </CardBody>
            </Card>
            </MobileSwipeNotificationCard>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />

      {/* Token Pay Verification Modal */}
      <AnimatePresence>
        {tokenPayModal && (
          <AnimatedModal onBackdropClick={closeTokenPayModal} maxWidth="max-w-lg">
            <div className="w-full rounded-xl bg-white shadow-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b px-5 py-4">
                <h3 className="font-semibold text-gray-900">Token Pay Order Verification</h3>
                <button
                  onClick={closeTokenPayModal}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {tokenPayLoading ? (
                <div className="flex justify-center py-12">
                  <Spinner size="lg" />
                </div>
              ) : tokenPayData ? (
                <div className="max-h-[70vh] overflow-y-auto p-5 space-y-4">
                {/* Status banner */}
                {tokenPayData.status === 'confirmed' && (
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-800 flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0" />
                    This order has been confirmed.
                  </div>
                )}
                {tokenPayData.status === 'rejected' && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800 space-y-1">
                    <div className="flex items-center gap-2">
                      <X className="h-4 w-4 shrink-0" />
                      This order has been rejected.
                    </div>
                    {tokenPayData.customer_rejection_reason && (
                      <p className="ml-6 text-red-700">
                        Reason: "{tokenPayData.customer_rejection_reason}"
                      </p>
                    )}
                  </div>
                )}

                {/* Order details */}
                {(() => {
                  const odooPayload = typeof tokenPayData.odoo_payload === 'string'
                    ? JSON.parse(tokenPayData.odoo_payload)
                    : tokenPayData.odoo_payload;
                  return (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                        {odooPayload?.pos_reference && (
                          <>
                            <span className="text-gray-500">Order Reference</span>
                            <span className="font-medium text-gray-900">{odooPayload.pos_reference}</span>
                          </>
                        )}
                        {odooPayload?.date_order && (
                          <>
                            <span className="text-gray-500">Order Date</span>
                            <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.date_order)}</span>
                          </>
                        )}
                        {odooPayload?.x_session_name && (
                          <>
                            <span className="text-gray-500">Session</span>
                            <span className="font-medium text-gray-900">{odooPayload.x_session_name}</span>
                          </>
                        )}
                        {odooPayload?.cashier && (
                          <>
                            <span className="text-gray-500">Cashier</span>
                            <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                          </>
                        )}
                        <span className="text-gray-500">Order Total</span>
                        <span className="font-medium text-gray-900">{fmt(tokenPayData.amount ?? 0)}</span>
                      </div>

                      {/* Order lines */}
                      {odooPayload?.x_order_lines?.length > 0 && (
                        <div className="overflow-x-auto rounded border border-gray-200">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                                <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {odooPayload.x_order_lines.map((line: any, i: number) => (
                                <tr key={i} className={line.price_unit < 0 ? 'bg-indigo-50' : ''}>
                                  <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                                  <td className="px-3 py-2 text-right text-gray-700">{line.qty} {line.uom_name}</td>
                                  <td className="px-3 py-2 text-right font-medium text-gray-900">{fmt(line.price_unit)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Uploaded images */}
                      {tokenPayData.images?.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Uploaded Images</p>
                          <div className="flex flex-wrap gap-2">
                            {tokenPayData.images.map((img: any) => (
                              <a
                                key={img.id}
                                href={img.file_path || `/api/v1/uploads/${img.id}`}
                                target="_blank"
                                rel="noreferrer"
                                className="block h-20 w-20 overflow-hidden rounded-lg border border-gray-200 hover:opacity-80"
                              >
                                <img
                                  src={img.file_path || `/api/v1/uploads/${img.id}`}
                                  alt={img.file_name}
                                  className="h-full w-full object-cover"
                                />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* Actions — only when awaiting_customer */}
                {tokenPayData.status === 'awaiting_customer' && (
                  <>
                    {!rejectMode && !confirmVerify && (
                      <div className="flex gap-3 pt-2">
                        <Button
                          variant="primary"
                          onClick={() => setConfirmVerify(true)}
                          className="flex-1"
                        >
                          <Check className="mr-1.5 h-4 w-4" />
                          Verify Order
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setRejectMode(true)}
                          className="flex-1"
                        >
                          <X className="mr-1.5 h-4 w-4" />
                          Reject Order
                        </Button>
                      </div>
                    )}

                    {confirmVerify && (
                      <div className="space-y-3 rounded-lg bg-blue-50 p-4">
                        <p className="text-sm text-gray-700">
                          Confirm that you authorize this Token Pay Order?
                        </p>
                        <div className="flex gap-3">
                          <Button
                            variant="success"
                            onClick={handleVerify}
                            disabled={actionLoading}
                            className="flex-1"
                          >
                            {actionLoading ? 'Verifying...' : 'Confirm Verification'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setConfirmVerify(false)}
                            disabled={actionLoading}
                          >
                            Back
                          </Button>
                        </div>
                      </div>
                    )}

                    {rejectMode && (
                      <div className="space-y-3 rounded-lg bg-red-50 p-4">
                        <textarea
                          placeholder="Reason for rejection..."
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          className="w-full rounded-lg border border-gray-300 p-2.5 text-sm focus:border-primary-500 focus:outline-none"
                          rows={3}
                        />
                        <div className="flex gap-3">
                          <Button
                            variant="danger"
                            onClick={handleReject}
                            disabled={actionLoading || !rejectReason.trim()}
                            className="flex-1"
                          >
                            {actionLoading ? 'Rejecting...' : 'Confirm Rejection'}
                          </Button>
                          <Button
                            variant="secondary"
                            onClick={() => setRejectMode(false)}
                            disabled={actionLoading}
                          >
                            Back
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div className="p-5 text-center text-sm text-gray-500">
                Could not load verification details.
              </div>
            )}
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>

      <ShiftExchangeDetailModal
        isOpen={Boolean(shiftExchangeRequestId)}
        requestId={shiftExchangeRequestId}
        onClose={() => setShiftExchangeRequestId(null)}
        onUpdated={() => {
          void api.get('/account/notifications')
            .then((res) => {
              setNotifications(res.data.data || []);
            })
            .catch((err: any) => {
              showErrorToast(err?.response?.data?.error || err?.response?.data?.message || 'Failed to refresh notifications.');
            });
        }}
      />

      <PeerEvaluationModal
        isOpen={Boolean(peerEvalId)}
        initialEvaluationId={peerEvalId}
        onClose={() => setPeerEvalId(null)}
      />

      <AnimatePresence>
        {deleteAllReadOpen && (
          <AnimatedModal
            onBackdropClick={deleteAllReadLoading ? undefined : () => setDeleteAllReadOpen(false)}
            maxWidth="max-w-md"
          >
            <div className="w-full overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="border-b px-5 py-4">
                <h3 className="font-semibold text-gray-900">Delete all read notifications?</h3>
                <p className="mt-1 text-sm text-gray-500">
                  This will permanently remove {readNotificationCount} read notification{readNotificationCount === 1 ? '' : 's'}.
                </p>
              </div>
              <div className="flex justify-end gap-3 px-5 py-4">
                <Button
                  variant="secondary"
                  onClick={() => setDeleteAllReadOpen(false)}
                  disabled={deleteAllReadLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => { void handleDeleteAllRead(); }}
                  disabled={deleteAllReadLoading || readNotificationCount === 0}
                >
                  {deleteAllReadLoading ? 'Deleting...' : 'Delete all read'}
                </Button>
              </div>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reasonModalAuthId && (
          <ShiftAuthReasonModal
            authId={reasonModalAuthId}
            onClose={() => setReasonModalAuthId(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
