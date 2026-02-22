import { useEffect, useState, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Button } from '@/shared/components/ui/Button';
import { api } from '@/shared/services/api.client';
import { useNotificationStore } from '@/shared/store/notificationStore';
import { ShiftExchangeDetailModal } from '@/features/shift-exchange/components/ShiftExchangeDetailModal';
import { Bell, Check, X } from 'lucide-react';

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

const PAGE_SIZE = 10;

export function EmployeeNotificationsTab() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [actedNotifIds, setActedNotifIds] = useState<Set<string>>(new Set());
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const location = useLocation();
  const decrement = useNotificationStore((s) => s.decrement);
  const latestNotification = useNotificationStore((s) => s.latestNotification);

  // Token Pay modal state
  const [tokenPayModal, setTokenPayModal] = useState<{ notifId: string; verificationId: string } | null>(null);
  const [tokenPayData, setTokenPayData] = useState<any>(null);
  const [tokenPayLoading, setTokenPayLoading] = useState(false);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmVerify, setConfirmVerify] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [shiftExchangeRequestId, setShiftExchangeRequestId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get('/account/notifications')
      .then((res) => setNotifications(res.data.data || []))
      .finally(() => setLoading(false));
  }, []);

  // Real-time: prepend new notifications pushed from TopBar via the store
  useEffect(() => {
    if (!latestNotification) return;
    setNotifications((prev) => {
      if (prev.some((n) => n.id === latestNotification.id)) return prev;
      return [latestNotification, ...prev];
    });
    setPage(1);
  }, [latestNotification]);

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
  }, [location.search]);

  const markAsRead = async (id: string) => {
    await api.put(`/account/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
    decrement();
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
      closeTokenPayModal();
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
      closeTokenPayModal();
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  const typeVariant = (type: string) => {
    switch (type) {
      case 'success':
        return 'success' as const;
      case 'warning':
        return 'warning' as const;
      case 'urgent':
        return 'danger' as const;
      default:
        return 'info' as const;
    }
  };

  if (notifications.length === 0) {
    return (
      <Card>
        <CardBody className="py-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">No notifications</p>
        </CardBody>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE));
  const pagedNotifications = notifications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      <div className="space-y-3">
        {pagedNotifications.map((n) => {
          const tokenPayId = getTokenPayVerificationId(n.link_url);
          const shiftExchangeId = getShiftExchangeId(n.link_url);
          return (
            <div key={n.id} ref={(el) => { cardRefs.current[n.id] = el; }}>
            <Card className={`transition-all duration-300 ${n.is_read ? 'opacity-60' : ''} ${highlightId === n.id ? 'ring-2 ring-primary-400 animate-pulse' : ''}`}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900">{n.title}</p>
                      {tokenPayId && n.verification_status ? (
                        <Badge variant={
                          n.verification_status === 'confirmed' ? 'success'
                          : n.verification_status === 'rejected' ? 'danger'
                          : 'warning'
                        }>
                          {n.verification_status === 'awaiting_customer' ? 'pending' : n.verification_status}
                        </Badge>
                      ) : (
                        <Badge variant={typeVariant(n.type)}>{n.type}</Badge>
                      )}
                      {!n.is_read && (
                        <span className="h-2 w-2 rounded-full bg-primary-500" />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {fmtDateTime(n.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {shiftExchangeId && (
                      <Button
                        variant="secondary"
                        onClick={() => setShiftExchangeRequestId(shiftExchangeId)}
                        className="text-xs"
                      >
                        View Request
                      </Button>
                    )}
                    {tokenPayId && (
                      <Button
                        variant={actedNotifIds.has(n.id) ? 'secondary' : 'primary'}
                        onClick={() => openTokenPayModal(n.id, tokenPayId)}
                        className="text-xs"
                      >
                        View Order
                      </Button>
                    )}
                    {!n.is_read && (
                      <button
                        onClick={() => markAsRead(n.id)}
                        className="text-xs text-primary-600 hover:underline"
                      >
                        Mark read
                      </button>
                    )}
                  </div>
                </div>
              </CardBody>
            </Card>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
          <span>
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Token Pay Verification Modal */}
      {tokenPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl overflow-hidden">
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
        </div>
      )}

      <ShiftExchangeDetailModal
        isOpen={Boolean(shiftExchangeRequestId)}
        requestId={shiftExchangeRequestId}
        onClose={() => setShiftExchangeRequestId(null)}
        onUpdated={() => {
          void api.get('/account/notifications').then((res) => {
            setNotifications(res.data.data || []);
          });
        }}
      />
    </>
  );
}
