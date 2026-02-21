import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { api } from '@/shared/services/api.client';
import { PERMISSIONS } from '@omnilert/shared';
import { Monitor, CheckCircle, Image as ImageIcon, Clock, DollarSign, X, Layers, ChevronRight, Star } from 'lucide-react';
import { ImageModal } from '@/features/pos-verification/components/ImageModal';

// --- Helpers (module-level so both card and panel can use them) ---

function fmtOdooDate(dateStr: string): string {
  // Odoo sends "YYYY-MM-DD HH:MM:SS" without timezone — treat as UTC
  const utcStr = dateStr.includes('T') ? dateStr : dateStr.replace(' ', 'T') + 'Z';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(utcStr));
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

const fmt = (n: number | undefined | null) =>
  n != null
    ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(n)
    : '—';

function parseBreakdown(raw: unknown): { denomination: number; quantity: number }[] {
  // Handle both already-parsed arrays and JSON string payloads safely
  if (!raw) {
    return [];
  }

  let value: unknown = raw;

  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }

  if (!Array.isArray(value)) {
    return [];
  }

  const items: { denomination: number; quantity: number }[] = [];

  for (const entry of value) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "denomination" in entry &&
      "quantity" in entry
    ) {
      const denom = (entry as { denomination: unknown }).denomination;
      const qty = (entry as { quantity: unknown }).quantity;

      if (typeof denom === "number" && typeof qty === "number" && qty >= 0) {
        items.push({ denomination: denom, quantity: qty });
      }
    }
  }

  return items;
}

function breakdownTotal(items: { denomination: number; quantity: number }[]): number {
  return items.filter((i) => i.quantity > 0).reduce((sum, i) => sum + i.denomination * i.quantity, 0);
}

function statusVariant(status: string) {
  switch (status) {
    case 'audit_complete': return 'success' as const;
    case 'closed': return 'default' as const;
    default: return 'info' as const;
  }
}

function verStatusVariant(status: string) {
  switch (status) {
    case 'confirmed': return 'success' as const;
    case 'rejected': return 'danger' as const;
    default: return 'warning' as const;
  }
}

// --- Page ---

const PAGE_SIZE = 10;

export function PosSessionPage() {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const socket = useSocket('/pos-session');

  const fetchSessions = useCallback(() => {
    if (selectedBranchIds.length === 0) return;
    setLoading(true);
    setPage(1);
    api
      .get('/pos-sessions', { params: { branchIds: selectedBranchIds.join(',') } })
      .then((res) => setSessions(res.data.data || []))
      .finally(() => setLoading(false));
  }, [selectedBranchIds]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  useEffect(() => {
    if (!socket || selectedBranchIds.length === 0) return;
    for (const id of selectedBranchIds) socket.emit('join-branch', id);
    return () => { for (const id of selectedBranchIds) socket.emit('leave-branch', id); };
  }, [socket, selectedBranchIds]);

  useEffect(() => {
    if (!socket) return;

    socket.on('pos-session:new', (data: any) => {
      setSessions((prev) => [data, ...prev]);
      setPage(1);
    });

    socket.on('pos-session:updated', (data: any) => {
      setSessions((prev) => prev.map((s) => s.id === data.id ? { ...data, verifications: s.verifications } : s));
      setSelectedSession((prev: any) => prev?.id === data.id ? { ...data, verifications: prev.verifications } : prev);
    });

    socket.on('pos-verification:updated', (data: any) => {
      const updateVers = (vers: any[]) => {
        const idx = vers.findIndex((v: any) => v.id === data.id);
        if (idx === -1) return vers;
        const updated = [...vers];
        updated[idx] = data;
        return updated;
      };
      setSessions((prev) =>
        prev.map((s) => s.verifications ? { ...s, verifications: updateVers(s.verifications) } : s),
      );
      setSelectedSession((prev: any) =>
        prev?.verifications ? { ...prev, verifications: updateVers(prev.verifications) } : prev,
      );
    });

    socket.on('pos-verification:new', (data: any) => {
      // If panel is open for the matching session, add the verification
      setSelectedSession((prev: any) => {
        if (!prev || prev.id !== data.pos_session_id) return prev;
        return { ...prev, verifications: [...(prev.verifications || []), { ...data }] };
      });
    });

    return () => {
      socket.off('pos-session:new');
      socket.off('pos-session:updated');
      socket.off('pos-verification:updated');
      socket.off('pos-verification:new');
    };
  }, [socket]);

  const openDetail = async (sessionId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/pos-sessions/${sessionId}`);
      setSelectedSession(res.data.data);
    } catch (err) {
      console.error('Failed to load session detail:', err);
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">POS Sessions</h1>
          <Badge variant="info">{sessions.length} sessions</Badge>
        </div>

        {sessions.length === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <Monitor className="mx-auto h-12 w-12 text-gray-300" />
              <p className="mt-3 text-sm text-gray-500">No POS sessions</p>
              <p className="text-xs text-gray-400">
                Sessions will appear here in real-time when Odoo sends them
              </p>
            </CardBody>
          </Card>
        ) : (() => {
          const totalPages = Math.max(1, Math.ceil(sessions.length / PAGE_SIZE));
          const pagedSessions = sessions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
          return (
            <>
              <div className="space-y-4">
                {pagedSessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onUpdate={fetchSessions}
                    onOpenDetail={() => openDetail(s.id)}
                  />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between text-sm text-gray-600">
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
            </>
          );
        })()}
      </div>

      {/* Detail panel backdrop */}
      {(selectedSession || detailLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedSession(null)}
        />
      )}

      {/* Detail panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[600px] transform overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ${
          selectedSession ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {detailLoading ? (
          <div className="flex h-full items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : selectedSession ? (
          <SessionDetailPanel
            session={selectedSession}
            onClose={() => setSelectedSession(null)}
            onUpdate={() => openDetail(selectedSession.id)}
          />
        ) : null}
      </div>
    </>
  );
}

// --- Session Card (list view — compact) ---

function SessionCard({
  session,
  onUpdate,
  onOpenDetail,
}: {
  session: any;
  onUpdate: () => void;
  onOpenDetail: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { hasPermission } = usePermission();
  const payload = session.odoo_payload || {};

  const pendingAuditCount = session.verifications
    ? session.verifications.filter((v: any) => v.audit_rating == null).length
    : 0;

  const handleAuditComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModalOpen(true);
  };

  const handleConfirmAuditComplete = async () => {
    setConfirmModalOpen(false);
    setActionLoading(true);
    try {
      await api.post(`/pos-sessions/${session.id}/audit-complete`);
      onUpdate();
    } catch (err) {
      console.error('Audit complete failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div
      className="cursor-pointer rounded-xl transition-shadow hover:shadow-md"
      onClick={onOpenDetail}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onOpenDetail()}
    >
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">
              {session.session_name || `Session ${session.odoo_session_id}`}
            </h3>
            <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
              {session.opened_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Opened: {fmtDateTime(session.opened_at)}
                </span>
              )}
              {session.closed_at && (
                <span>Closed: {fmtDateTime(session.closed_at)}</span>
              )}
              {payload.x_company_name && (
                <span className="text-gray-400">{payload.x_company_name}</span>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {pendingAuditCount > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                <Clock className="h-3 w-3" />
                {pendingAuditCount} pending audit{pendingAuditCount > 1 ? 's' : ''}
              </span>
            )}
            <Badge variant={statusVariant(session.status)}>
              {session.status.replace('_', ' ')}
            </Badge>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
          <div className="flex items-center gap-2 sm:hidden">
            <div className="flex flex-col items-center justify-center gap-1">
              <Badge variant={statusVariant(session.status)}>
                {session.status.replace('_', ' ')}
              </Badge>
              {pendingAuditCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                  <Clock className="h-3 w-3" />
                  {pendingAuditCount} pending audit{pendingAuditCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </div>
        </div>
      </CardHeader>

      <CardBody>
        {session.verifications && session.verifications.length > 0 ? (
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
            {(
              [
                { type: 'discount_order',      label: 'Discount Orders',       color: 'bg-orange-200 text-orange-800' },
                { type: 'refund_order',        label: 'Refund Orders',         color: 'bg-purple-200 text-purple-800' },
                { type: 'non_cash_order',      label: 'Non-Cash Orders',       color: 'bg-teal-200 text-teal-800' },
                { type: 'token_pay_order',     label: 'Token Pay Orders',      color: 'bg-indigo-200 text-indigo-800' },
                { type: 'ispe_purchase_order', label: 'ISPE Purchase Orders',  color: 'bg-amber-200 text-amber-800' },
                { type: 'register_cash_out',   label: 'Register Cash Out',     color: 'bg-red-200 text-red-800' },
                { type: 'register_cash_in',    label: 'Register Cash In',      color: 'bg-green-200 text-green-800' },
              ] as const
            ).map(({ type, label, color }) => {
              const group = session.verifications.filter((v: any) => v.verification_type === type);
              if (group.length === 0) return null;
              return (
                <span key={type} className="flex items-center gap-1">
                  <Badge className={`text-[10px] ${color}`}>
                    {group.length}
                  </Badge>
                  <span>{label}</span>
                </span>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No verifications linked to this session</p>
        )}
      </CardBody>

      {session.status === 'closed' &&
        hasPermission(PERMISSIONS.POS_SESSION_AUDIT_COMPLETE) && (
          <CardFooter>
            <Button
              onClick={handleAuditComplete}
              disabled={actionLoading || pendingAuditCount > 0}
              title={pendingAuditCount > 0 ? 'All verifications must be audited first' : undefined}
              className="w-full"
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              {actionLoading ? 'Processing...' : 'Audit Complete'}
            </Button>
          </CardFooter>
        )}

      {session.status === 'audit_complete' && session.audited_at && (
        <CardFooter>
          <p className="text-sm text-gray-500">
            Audited on {fmtDateTime(session.audited_at)}
          </p>
        </CardFooter>
      )}
    </Card>

    {confirmModalOpen && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
          <h3 className="text-base font-semibold text-gray-900">Confirm Audit Complete</h3>
          <p className="mt-2 text-sm text-gray-500">
            Are you sure you want to mark this session as audit complete? This action cannot be undone.
          </p>
          <div className="mt-5 flex justify-end gap-3">
            <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setConfirmModalOpen(false); }}>
              Cancel
            </Button>
            <Button variant="success" onClick={(e) => { e.stopPropagation(); handleConfirmAuditComplete(); }} disabled={actionLoading}>
              {actionLoading ? 'Processing...' : 'Confirm'}
            </Button>
          </div>
        </div>
      </div>
    )}
    </div>
  );
}

// --- Session Detail Panel ---

function SessionDetailPanel({
  session,
  onClose,
  onUpdate,
}: {
  session: any;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { hasPermission } = usePermission();
  const payload = session.odoo_payload || {};

  const pendingAuditCount = session.verifications
    ? session.verifications.filter((v: any) => v.audit_rating == null).length
    : 0;

  const hasCashDetails =
    payload.cash_register_balance_start != null ||
    payload.cash_register_balance_end != null ||
    payload.x_closing_pcf != null;

  const handleAuditComplete = () => setConfirmModalOpen(true);

  const handleConfirmAuditComplete = async () => {
    setConfirmModalOpen(false);
    setActionLoading(true);
    try {
      await api.post(`/pos-sessions/${session.id}/audit-complete`);
      onUpdate();
    } catch (err) {
      console.error('Audit complete failed:', err);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="flex items-start justify-between border-b px-6 py-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            {session.session_name || `Session ${session.odoo_session_id}`}
          </h2>
          <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
            {session.opened_at && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                Opened: {fmtDateTime(session.opened_at)}
              </span>
            )}
            {payload.x_company_name && (
              <span>{payload.x_company_name}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {pendingAuditCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
              <Clock className="h-3 w-3" />
              {pendingAuditCount} pending audit{pendingAuditCount > 1 ? 's' : ''}
            </span>
          )}
          <Badge variant={statusVariant(session.status)}>
            {session.status.replace('_', ' ')}
          </Badge>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Panel body */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* Register Open Details */}
        {hasCashDetails && (
          <div className="rounded-lg bg-blue-50 p-4">
            <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-blue-700">
              <DollarSign className="h-3 w-3" />
              Register Open Details
            </p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {payload.cash_register_balance_start != null && (
                <>
                  <span className="text-gray-500">Opening Cash (Counted):</span>
                  <span className="font-medium">{fmt(payload.cash_register_balance_start)}</span>
                </>
              )}
              {payload.cash_register_balance_end != null && (
                <>
                  <span className="text-gray-500">Opening Cash (Expected):</span>
                  <span className="font-medium">{fmt(payload.cash_register_balance_end)}</span>
                </>
              )}
              {payload.cash_register_balance_start != null && payload.cash_register_balance_end != null && (
                <>
                  <span className="text-gray-500">Difference:</span>
                  <span className={`font-medium ${
                    payload.cash_register_balance_end - payload.cash_register_balance_start !== 0
                      ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {fmt(payload.cash_register_balance_end - payload.cash_register_balance_start)}
                  </span>
                </>
              )}
              {payload.x_closing_pcf != null && (
                <>
                  <span className="text-gray-500">PCF Expected:</span>
                  <span className="font-medium">{fmt(payload.x_closing_pcf)}</span>
                </>
              )}
            </div>
            {payload.opening_notes && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-blue-600 mb-1">Opening Notes</p>
                <pre className="whitespace-pre-wrap text-xs text-gray-700 font-mono bg-blue-100/50 rounded p-2">
                  {payload.opening_notes}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Verification detail sections */}
        {session.verifications && session.verifications.length > 0 ? (
          <div className="space-y-4">
            {session.verifications.map((v: any) => (
              <VerificationDetailSection key={v.id} verification={v} onAuditUpdate={onUpdate} />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No verifications linked to this session</p>
        )}

        {/* Closing Reports */}
        {session.closing_reports && (() => {
          const reports = typeof session.closing_reports === 'string'
            ? JSON.parse(session.closing_reports)
            : session.closing_reports;

          return (
            <div className="space-y-4">
              {/* Sales Report */}
              {reports.salesReport && (
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-green-700">
                    <DollarSign className="h-3 w-3" />
                    Sales Report
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <span className="text-gray-500">Gross Sales:</span>
                    <span className="font-semibold text-gray-900">{fmt(reports.salesReport.grossSales)}</span>

                    {reports.salesReport.discountGroups?.map((g: any) => (
                      <span key={g.name} className="contents">
                        <span className="text-gray-500 pl-2">– {g.name}:</span>
                        <span className="font-medium text-red-600">{fmt(g.totalAmount)}</span>
                      </span>
                    ))}

                    {reports.salesReport.refundClaims > 0 && (
                      <>
                        <span className="text-gray-500 pl-2">– Refund Claims:</span>
                        <span className="font-medium text-red-600">{fmt(reports.salesReport.refundClaims)}</span>
                      </>
                    )}

                    <span className="text-gray-500 border-t border-green-200 pt-1.5 mt-1">Net Sales:</span>
                    <span className="font-bold text-green-700 border-t border-green-200 pt-1.5 mt-1">{fmt(reports.salesReport.netSales)}</span>
                  </div>
                </div>
              )}

              {/* Non-Cash Report */}
              {reports.nonCashReport && reports.nonCashReport.methods?.length > 0 && (
                <div className="rounded-lg bg-teal-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-teal-700">
                    <DollarSign className="h-3 w-3" />
                    Non-Cash Report
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {reports.nonCashReport.methods.map((m: any) => (
                      <span key={m.name} className="contents">
                        <span className="text-gray-500">{m.name}:</span>
                        <span className="font-medium text-gray-900">{fmt(m.amount)}</span>
                      </span>
                    ))}
                    <span className="text-gray-500 border-t border-teal-200 pt-1.5 mt-1">Total Non-Cash:</span>
                    <span className="font-bold text-teal-700 border-t border-teal-200 pt-1.5 mt-1">{fmt(reports.nonCashReport.totalNonCash)}</span>
                  </div>
                </div>
              )}

              {/* Cash Report */}
              {reports.cashReport && (
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <DollarSign className="h-3 w-3" />
                    Cash Report
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <span className="text-gray-500">Cash Payments:</span>
                    <span className="font-medium text-gray-900">{fmt(reports.cashReport.cashPayments)}</span>
                  </div>

                  <p className="mt-3 mb-1 text-xs font-semibold text-blue-600">Cash In</p>
                  {reports.cashReport.cashIns?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {reports.cashReport.cashIns.map((c: any, i: number) => (
                        <span key={i} className="contents">
                          <span className="text-gray-500 pl-2">{c.reason}:</span>
                          <span className="font-medium text-green-600">{fmt(c.amount)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 pl-2">No cash in found.</p>
                  )}

                  <p className="mt-3 mb-1 text-xs font-semibold text-blue-600">Cash Out</p>
                  {reports.cashReport.cashOuts?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {reports.cashReport.cashOuts.map((c: any, i: number) => (
                        <span key={i} className="contents">
                          <span className="text-gray-500 pl-2">{c.reason}:</span>
                          <span className="font-medium text-red-600">{fmt(c.amount)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 pl-2">No cash out found.</p>
                  )}
                </div>
              )}

              {/* Closing Register Details */}
              {reports.closingRegister && (
                <div className="rounded-lg bg-amber-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-amber-700">
                    <DollarSign className="h-3 w-3" />
                    Closing Register Details
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {reports.closingRegister.closingCashCounted != null && (
                      <>
                        <span className="text-gray-500">Closing Cash (Counted):</span>
                        <span className="font-medium">{fmt(reports.closingRegister.closingCashCounted)}</span>
                      </>
                    )}
                    {reports.closingRegister.closingCashExpected != null && (
                      <>
                        <span className="text-gray-500">Closing Cash (Expected):</span>
                        <span className="font-medium">{fmt(reports.closingRegister.closingCashExpected)}</span>
                      </>
                    )}
                    {reports.closingRegister.closingCashDifference != null && (
                      <>
                        <span className="text-gray-500">Difference:</span>
                        <span className={`font-medium ${reports.closingRegister.closingCashDifference !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {fmt(reports.closingRegister.closingCashDifference)}
                        </span>
                      </>
                    )}
                  </div>
                  {reports.closingRegister.closingNotes && (
                    <div className="mt-3">
                      <p className="text-xs font-semibold text-amber-600 mb-1">Closing Notes</p>
                      <pre className="whitespace-pre-wrap text-xs text-gray-700 font-mono bg-amber-100/50 rounded p-2">
                        {reports.closingRegister.closingNotes}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Panel footer */}
      {session.status === 'closed' && hasPermission(PERMISSIONS.POS_SESSION_AUDIT_COMPLETE) && (
        <div className="border-t px-6 py-4">
          <Button
            onClick={handleAuditComplete}
            disabled={actionLoading || pendingAuditCount > 0}
            title={pendingAuditCount > 0 ? 'All verifications must be audited first' : undefined}
            className="w-full"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            {actionLoading ? 'Processing...' : 'Audit Complete'}
          </Button>
        </div>
      )}
      {session.status === 'audit_complete' && session.audited_at && (
        <div className="border-t px-6 py-4">
          <p className="text-sm text-gray-500">
            Audited on {fmtDateTime(session.audited_at)}
          </p>
        </div>
      )}

      {confirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-semibold text-gray-900">Confirm Audit Complete</h3>
            <p className="mt-2 text-sm text-gray-500">
              Are you sure you want to mark this session as audit complete? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setConfirmModalOpen(false)}>
                Cancel
              </Button>
              <Button variant="success" onClick={handleConfirmAuditComplete} disabled={actionLoading}>
                {actionLoading ? 'Processing...' : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Audit Rating Modal ---

function AuditRatingModal({
  verificationId,
  onClose,
  onSaved,
}: {
  verificationId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [details, setDetails] = useState('');
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    if (rating === 0) return;
    setSaving(true);
    try {
      await api.post(`/pos-verifications/${verificationId}/audit`, { rating, details: details || undefined });
      onSaved();
      onClose();
    } catch (err) {
      console.error('Audit rating failed:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-gray-900">Audit Rating</h3>

        {/* Star picker */}
        <div className="mb-4 flex items-center justify-center gap-2">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              className="focus:outline-none"
            >
              <Star
                className={`h-8 w-8 transition-colors ${
                  star <= (hover || rating)
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-gray-300'
                }`}
              />
            </button>
          ))}
        </div>
        <p className="mb-3 text-center text-xs text-gray-400">
          {rating === 0 ? 'Select a rating' : `${rating} star${rating > 1 ? 's' : ''}`}
        </p>

        {/* Details */}
        <textarea
          placeholder="Short details (optional)..."
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none resize-none"
        />

        <div className="mt-4 flex gap-3">
          <Button variant="secondary" onClick={onClose} className="flex-1" disabled={saving}>
            Cancel
          </Button>
          <Button variant="success" onClick={handleConfirm} className="flex-1" disabled={saving || rating === 0}>
            {saving ? <Spinner size="sm" /> : 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// --- Verification Detail Section ---

function VerificationDetailSection({
  verification: v,
  onAuditUpdate,
}: {
  verification: any;
  onAuditUpdate: () => void;
}) {
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalIndex, setImageModalIndex] = useState(0);
  const { hasPermission } = usePermission();
  const canAudit = hasPermission(PERMISSIONS.POS_SESSION_AUDIT_COMPLETE);

  const isCF = v.verification_type === 'cf_breakdown';
  const isPCF = v.verification_type === 'pcf_breakdown';
  const isDiscountOrder = v.verification_type === 'discount_order';
  const isRefundOrder = v.verification_type === 'refund_order';
  const isNonCashOrder = v.verification_type === 'non_cash_order';
  const isTokenPayOrder = v.verification_type === 'token_pay_order';
  const isISPEPurchaseOrder = v.verification_type === 'ispe_purchase_order';
  const isRegisterCashOut = v.verification_type === 'register_cash_out';
  const isRegisterCashIn = v.verification_type === 'register_cash_in';
  const isRegisterCash = isRegisterCashOut || isRegisterCashIn;
  const isClosingPCF = v.verification_type === 'closing_pcf_breakdown';

  const typeLabel = isCF ? 'CF Breakdown' : isPCF ? 'PCF Breakdown' : isClosingPCF ? 'Closing PCF Report' : isDiscountOrder ? 'Discount Order' : isRefundOrder ? 'Refund Order' : isNonCashOrder ? 'Non-Cash Order' : isTokenPayOrder ? 'Token Pay Order' : isISPEPurchaseOrder ? 'ISPE Purchase Order' : isRegisterCashOut ? 'Register Cash Out' : isRegisterCashIn ? 'Register Cash In' : null;

  const typeBadgeClass = isCF
    ? 'bg-blue-200 text-blue-800'
    : isPCF
      ? 'bg-violet-200 text-violet-800'
      : isClosingPCF
        ? 'bg-cyan-200 text-cyan-800'
        : isDiscountOrder
          ? 'bg-orange-200 text-orange-800'
          : isRefundOrder
            ? 'bg-purple-200 text-purple-800'
            : isNonCashOrder
              ? 'bg-teal-200 text-teal-800'
              : isTokenPayOrder
                ? 'bg-indigo-200 text-indigo-800'
                : isISPEPurchaseOrder
                  ? 'bg-amber-200 text-amber-800'
                  : isRegisterCashOut
                    ? 'bg-red-200 text-red-800'
                    : isRegisterCashIn
                      ? 'bg-green-200 text-green-800'
                      : 'bg-gray-200 text-gray-700';

  const typeHeaderClass = isCF
    ? 'bg-blue-100 border-blue-300'
    : isPCF
      ? 'bg-violet-100 border-violet-300'
      : isClosingPCF
        ? 'bg-cyan-100 border-cyan-300'
        : isDiscountOrder
          ? 'bg-orange-100 border-orange-300'
          : isRefundOrder
            ? 'bg-purple-100 border-purple-300'
            : isNonCashOrder
              ? 'bg-teal-100 border-teal-300'
              : isTokenPayOrder
                ? 'bg-indigo-100 border-indigo-300'
                : isISPEPurchaseOrder
                  ? 'bg-amber-100 border-amber-300'
                  : isRegisterCashOut
                    ? 'bg-red-100 border-red-300'
                    : isRegisterCashIn
                      ? 'bg-green-100 border-green-300'
                      : 'bg-gray-50 border-gray-200';

  // Parse odoo_payload for order types (may be string or object)
  const odooPayload: any = (isDiscountOrder || isRefundOrder || isNonCashOrder || isTokenPayOrder || isISPEPurchaseOrder || isRegisterCash)
    ? typeof v.odoo_payload === 'string'
      ? JSON.parse(v.odoo_payload)
      : v.odoo_payload
    : null;
  const breakdownItems = parseBreakdown(v.breakdown);
  const activeItems = breakdownItems.filter((i) => i.quantity > 0);
  const counted = activeItems.reduce(
    (sum: number, item: { denomination: number; quantity: number }) =>
      sum + item.denomination * item.quantity,
    0,
  );
  const expected = v.amount ?? null;
  const diff = expected != null ? counted - expected : null;

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden">
      {/* Section header */}
      <div className={`flex items-center justify-between px-4 py-3 border-b ${typeHeaderClass}`}>
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 text-sm">{v.title}</span>
          {typeLabel && (
            <span className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${typeBadgeClass}`}>
              <Layers className="h-3 w-3" />
              {typeLabel}
            </span>
          )}
        </div>
        <Badge variant={verStatusVariant(v.status)}>{v.status}</Badge>
      </div>

      <div className="px-4 py-4 space-y-4">
        {v.status === 'awaiting_customer' ? (
          <p className="text-sm text-yellow-600 font-medium">
            ⏳ Awaiting Customer Verification
          </p>
        ) : v.status === 'pending' ? (
          <p className="text-sm text-amber-600 font-medium">
            {isDiscountOrder || isRefundOrder || isNonCashOrder || isTokenPayOrder || isISPEPurchaseOrder || isRegisterCash ? '⏳ Pending — awaiting confirmation' : '⏳ Pending — breakdown not yet submitted'}
          </p>
        ) : (
          <>
            {/* Discount order details */}
            {isDiscountOrder && odooPayload && (() => {
              const discountLine = odooPayload.x_order_lines?.find((l: any) => l.price_unit < 0);
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                    {odooPayload.pos_reference && (
                      <>
                        <span className="text-gray-500">Order Reference</span>
                        <span className="font-medium text-gray-900">{odooPayload.pos_reference}</span>
                      </>
                    )}
                    {odooPayload.date_order && (
                      <>
                        <span className="text-gray-500">Order Date</span>
                        <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.date_order)}</span>
                      </>
                    )}
                    {odooPayload.cashier && (
                      <>
                        <span className="text-gray-500">Cashier</span>
                        <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                      </>
                    )}
                    {discountLine && (
                      <>
                        <span className="text-gray-500">Discount</span>
                        <span className="font-medium text-gray-900">{discountLine.product_name}</span>
                      </>
                    )}
                    <span className="text-gray-500">Order Total</span>
                    <span className="font-semibold text-primary-600">
                      {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v.amount ?? 0)}
                    </span>
                  </div>
                  {odooPayload.x_order_lines && odooPayload.x_order_lines.length > 0 && (
                    <div className="overflow-x-auto rounded border border-gray-200">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                            <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {odooPayload.x_order_lines.map((line: any, i: number) => (
                            <tr key={i} className={line.price_unit < 0 ? 'bg-red-50' : ''}>
                              <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                              <td className="px-3 py-2 text-right text-gray-700">{line.qty} {line.uom_name}</td>
                              <td className="px-3 py-2 text-right font-medium text-gray-900">
                                {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit)}
                              </td>
                              <td className="px-3 py-2 text-right font-semibold text-gray-900">
                                {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit * line.qty)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                          <tr>
                            <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
                            <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                                odooPayload.x_order_lines.reduce((sum: number, l: any) => sum + l.price_unit * l.qty, 0)
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Refund order details */}
            {isRefundOrder && odooPayload && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {odooPayload.pos_reference && (
                    <>
                      <span className="text-gray-500">Order Reference</span>
                      <span className="font-medium text-gray-900">{odooPayload.pos_reference}</span>
                    </>
                  )}
                  {odooPayload.date_order && (
                    <>
                      <span className="text-gray-500">Order Date</span>
                      <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.date_order)}</span>
                    </>
                  )}
                  {odooPayload.cashier && (
                    <>
                      <span className="text-gray-500">Cashier</span>
                      <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                    </>
                  )}
                  <span className="text-gray-500">Refund Total</span>
                  <span className="font-semibold text-amber-600">
                    {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v.amount ?? 0)}
                  </span>
                </div>
                {odooPayload.x_order_lines && odooPayload.x_order_lines.length > 0 && (
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {odooPayload.x_order_lines.map((line: any, i: number) => (
                          <tr key={i} className={line.qty < 0 ? 'bg-amber-50' : ''}>
                            <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{line.qty} {line.uom_name}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit * line.qty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                              odooPayload.x_order_lines.reduce((sum: number, l: any) => sum + l.price_unit * l.qty, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Non-cash order details */}
            {isNonCashOrder && odooPayload && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {odooPayload.pos_reference && (
                    <>
                      <span className="text-gray-500">Order Reference</span>
                      <span className="font-medium text-gray-900">{odooPayload.pos_reference}</span>
                    </>
                  )}
                  {odooPayload.date_order && (
                    <>
                      <span className="text-gray-500">Order Date</span>
                      <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.date_order)}</span>
                    </>
                  )}
                  {odooPayload.cashier && (
                    <>
                      <span className="text-gray-500">Cashier</span>
                      <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                    </>
                  )}
                  {odooPayload.x_payments?.[0] && (
                    <>
                      <span className="text-gray-500">Payment Method</span>
                      <span className="font-medium text-gray-900">{odooPayload.x_payments[0].name}</span>
                    </>
                  )}
                  <span className="text-gray-500">Order Total</span>
                  <span className="font-semibold text-primary-600">
                    {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v.amount ?? 0)}
                  </span>
                </div>
                {odooPayload.x_order_lines && odooPayload.x_order_lines.length > 0 && (
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {odooPayload.x_order_lines.map((line: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{line.qty} {line.uom_name}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit * line.qty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                              odooPayload.x_order_lines.reduce((sum: number, l: any) => sum + l.price_unit * l.qty, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Token pay order details */}
            {isTokenPayOrder && odooPayload && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {odooPayload.pos_reference && (
                    <>
                      <span className="text-gray-500">Order Reference</span>
                      <span className="font-medium text-gray-900">{odooPayload.pos_reference}</span>
                    </>
                  )}
                  {odooPayload.date_order && (
                    <>
                      <span className="text-gray-500">Order Date</span>
                      <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.date_order)}</span>
                    </>
                  )}
                  {odooPayload.cashier && (
                    <>
                      <span className="text-gray-500">Cashier</span>
                      <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                    </>
                  )}
                  {(v.customer_name || v.customer_user_id) && (
                    <>
                      <span className="text-gray-500">Customer</span>
                      <span className="font-medium text-gray-900">{v.customer_name ?? v.customer_user_id}</span>
                    </>
                  )}
                  <span className="text-gray-500">Order Total</span>
                  <span className="font-semibold text-primary-600">
                    {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v.amount ?? 0)}
                  </span>
                </div>
                {odooPayload.x_order_lines && odooPayload.x_order_lines.length > 0 && (
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {odooPayload.x_order_lines.map((line: any, i: number) => (
                          <tr key={i} className={line.price_unit < 0 ? 'bg-indigo-50' : ''}>
                            <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{line.qty} {line.uom_name}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit * line.qty)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                              odooPayload.x_order_lines.reduce((sum: number, l: any) => sum + l.price_unit * l.qty, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
                {v.customer_rejection_reason && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                    <strong>Rejected by customer:</strong> {v.customer_rejection_reason}
                  </div>
                )}
              </div>
            )}

            {/* ISPE purchase order details */}
            {isISPEPurchaseOrder && odooPayload && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {odooPayload.name && (
                    <>
                      <span className="text-gray-500">PO Reference</span>
                      <span className="font-medium text-gray-900">{odooPayload.name}</span>
                    </>
                  )}
                  {odooPayload.date_approve && (
                    <>
                      <span className="text-gray-500">Confirmation Date</span>
                      <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.date_approve)}</span>
                    </>
                  )}
                  {odooPayload.partner_ref && (
                    <>
                      <span className="text-gray-500">Vendor Reference</span>
                      <span className="font-medium text-gray-900">{odooPayload.partner_ref}</span>
                    </>
                  )}
                  {odooPayload.x_pos_session && (
                    <>
                      <span className="text-gray-500">Session</span>
                      <span className="font-medium text-gray-900">{odooPayload.x_pos_session}</span>
                    </>
                  )}
                  <span className="text-gray-500">Order Total</span>
                  <span className="font-semibold text-primary-600">
                    {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(v.amount ?? 0)}
                  </span>
                </div>
                {odooPayload.x_order_line_details && odooPayload.x_order_line_details.length > 0 && (
                  <div className="overflow-x-auto rounded border border-gray-200">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                          <th className="px-3 py-2 text-right font-medium text-gray-500">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {odooPayload.x_order_line_details.map((line: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                            <td className="px-3 py-2 text-right text-gray-700">{line.quantity} {line.uom_name}</td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit)}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-900">
                              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(line.price_unit * line.quantity)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                              odooPayload.x_order_line_details.reduce((sum: number, l: any) => sum + l.price_unit * l.quantity, 0)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Register Cash In/Out details */}
            {isRegisterCash && odooPayload && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {odooPayload.payment_ref && (() => {
                  const reason = odooPayload.payment_ref.split(/-in-|-out-/).slice(1).join('');
                  return reason ? (
                    <>
                      <span className="text-gray-500">{isRegisterCashOut ? 'Cash Out Reason' : 'Cash In Reason'}</span>
                      <span className="font-medium text-gray-900">{reason}</span>
                    </>
                  ) : null;
                })()}
                {odooPayload.create_date && (
                  <>
                    <span className="text-gray-500">Date</span>
                    <span className="font-medium text-gray-900">{fmtOdooDate(odooPayload.create_date)}</span>
                  </>
                )}
                {v.amount != null && (
                  <>
                    <span className="text-gray-500">{isRegisterCashOut ? 'Cash Out Amount' : 'Cash In Amount'}</span>
                    <span className="font-semibold text-gray-900">{fmt(v.amount)}</span>
                  </>
                )}
              </div>
            )}

            {/* Breakdown table */}
            {activeItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Denomination Breakdown</p>
                <div className="space-y-1">
                  {activeItems.map((item: any) => (
                    <div key={item.denomination} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        ₱{item.denomination.toLocaleString()} × {item.quantity}
                      </span>
                      <span className="font-medium text-gray-800">
                        {fmt(item.denomination * item.quantity)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Expected vs Counted */}
            {(isCF || isPCF) && (
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  {isCF && (
                    <>
                      <span className="text-gray-500">Opening Cash Expected (Odoo):</span>
                      <span className="font-medium">{fmt(expected)}</span>
                      <span className="text-gray-500">Opening Cash Counted (Website):</span>
                      <span className="font-medium">{fmt(counted)}</span>
                    </>
                  )}
                  {isPCF && (
                    <>
                      <span className="text-gray-500">Opening PCF Expected:</span>
                      <span className="font-medium">{fmt(expected)}</span>
                      <span className="text-gray-500">Opening PCF Counted:</span>
                      <span className="font-medium">{fmt(counted)}</span>
                    </>
                  )}
                  {diff != null && (
                    <>
                      <span className="text-gray-500">Difference:</span>
                      <span className={`font-semibold ${diff !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(diff)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Closing PCF Expected vs Counted */}
            {isClosingPCF && (
              <div className="rounded-lg bg-gray-50 p-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                  <span className="text-gray-500">Closing PCF Expected:</span>
                  <span className="font-medium">{fmt(expected)}</span>
                  <span className="text-gray-500">Closing PCF Counted:</span>
                  <span className="font-medium">{fmt(counted)}</span>
                  {diff != null && (
                    <>
                      <span className="text-gray-500">Difference:</span>
                      <span className={`font-semibold ${diff !== 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {fmt(diff)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Confirming user */}
            {v.reviewer_name && (
              <div className="text-xs text-gray-500">
                <span className="font-medium text-gray-700">
                  {v.status === 'confirmed' ? 'Confirmed' : 'Reviewed'} by:
                </span>{' '}
                {v.reviewer_name}
                {v.reviewed_at && (
                  <span className="ml-2">
                    on {fmtDateTime(v.reviewed_at)}
                  </span>
                )}
              </div>
            )}

            {/* Images */}
            {v.images && v.images.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <ImageIcon className="mr-1 inline h-3 w-3" />
                  Attached Images
                </p>
                <div className="flex flex-wrap gap-2">
                  {v.images.map((img: any, i: number) => (
                    <button
                      key={i}
                      onClick={() => {
                        setImageModalIndex(i);
                        setImageModalOpen(true);
                      }}
                      className="block"
                    >
                      <img
                        src={img.file_path || `/api/v1/uploads/${img.file_name}`}
                        alt={img.file_name}
                        className="h-24 w-24 rounded-lg border border-gray-200 object-cover hover:opacity-80"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Review notes / Refund reason */}
            {v.review_notes && (
              <p className="text-xs text-gray-500">
                <span className="font-medium">{isRefundOrder ? 'Refund Reason' : 'Notes'}:</span> {v.review_notes}
              </p>
            )}

            {/* Audit rating display or Audit button */}
            {v.audit_rating != null ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2">
                <p className="mb-1 text-xs font-semibold text-yellow-700 uppercase tracking-wide">Audit Rating</p>
                <div className="flex items-center gap-0.5 mb-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${star <= v.audit_rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
                    />
                  ))}
                  <span className="ml-1.5 text-xs text-gray-600">{v.audit_rating}/5</span>
                </div>
                {v.audit_details && (
                  <p className="text-xs text-gray-600">{v.audit_details}</p>
                )}
                {v.auditor_name && (
                  <p className="mt-1.5 text-xs text-gray-500">
                    <span className="font-medium text-gray-600">Audited by:</span> {v.auditor_name}
                    {v.audited_at && (
                      <span className="ml-1.5">on {fmtDateTime(v.audited_at)}</span>
                    )}
                  </p>
                )}
              </div>
            ) : (
              canAudit && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAuditModalOpen(true)}
                >
                  <Star className="mr-1.5 h-3.5 w-3.5" />
                  Audit
                </Button>
              )
            )}
          </>
        )}
      </div>

      {/* Audit rating modal */}
      {auditModalOpen && (
        <AuditRatingModal
          verificationId={v.id}
          onClose={() => setAuditModalOpen(false)}
          onSaved={onAuditUpdate}
        />
      )}

      {/* Image modal */}
      <ImageModal
        images={v.images || []}
        initialIndex={imageModalIndex}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />
    </div>
  );
}
