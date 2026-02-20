import { useEffect, useState, useCallback, useRef } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Input } from '@/shared/components/ui/Input';
import { useSocket } from '@/shared/hooks/useSocket';
import { useBranchStore } from '@/shared/store/branchStore';
import { usePosVerificationStore } from '@/shared/store/posVerificationStore';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { api } from '@/shared/services/api.client';
import { PERMISSIONS } from '@omnilert/shared';
import { useDropzone } from 'react-dropzone';
import { Upload, Check, X, Image as ImageIcon, ShieldCheck, Layers, Edit } from 'lucide-react';
import { BreakdownModal } from '../components/BreakdownModal';
import { ImageModal } from '../components/ImageModal';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

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

function parseBreakdownForDisplay(raw: unknown): { denomination: number; quantity: number }[] {
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

function formatBreakdown(items: unknown): string {
  const parsed = parseBreakdownForDisplay(items);
  const active = parsed.filter((i) => i.quantity > 0);
  if (active.length === 0) return 'No breakdown';
  const total = active.reduce((sum, i) => sum + i.denomination * i.quantity, 0);
  return [
    ...active.map((i) => `${i.quantity} x ${i.denomination.toFixed(2)} ₱`),
    `Total: ${total.toFixed(2)} ₱`,
  ].join('\n');
}

export function PosVerificationPage() {
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const initialLoadDone = useRef(false);
  const selectedBranchIds = useBranchStore((s) => s.selectedBranchIds);
  const setPendingCount = usePosVerificationStore((s) => s.setPendingCount);
  const socket = useSocket('/pos-verification');
  const { user } = useAuth();

  const fetchVerifications = useCallback(() => {
    if (selectedBranchIds.length === 0) return;
    if (!initialLoadDone.current) setLoading(true);
    api
      .get('/pos-verifications', { params: { branchIds: selectedBranchIds.join(',') } })
      .then((res) => {
        const data: any[] = res.data.data || [];
        // Show pending and awaiting_customer verifications
        setVerifications(data.filter((v) => v.status === 'pending' || v.status === 'awaiting_customer'));
      })
      .finally(() => {
        setLoading(false);
        initialLoadDone.current = true;
      });
  }, [selectedBranchIds]);

  useEffect(() => {
    initialLoadDone.current = false;
    fetchVerifications();
  }, [fetchVerifications]);

  // Keep sidebar badge in sync
  useEffect(() => {
    setPendingCount(verifications.filter((v) => v.status === 'pending' || v.status === 'awaiting_customer').length);
  }, [verifications, setPendingCount]);

  // Join branch rooms for real-time updates
  useEffect(() => {
    if (!socket || selectedBranchIds.length === 0) return;
    for (const id of selectedBranchIds) {
      socket.emit('join-branch', id);
    }
    return () => {
      for (const id of selectedBranchIds) {
        socket.emit('leave-branch', id);
      }
    };
  }, [socket, selectedBranchIds]);

  // Listen for real-time events
  useEffect(() => {
    if (!socket) return;

    socket.on('pos-verification:new', (data: any) => {
      setVerifications((prev) => [data, ...prev]);
    });

    socket.on('pos-verification:updated', (data: any) => {
      if (data.status !== 'pending' && data.status !== 'awaiting_customer') {
        setVerifications((prev) => prev.filter((v) => v.id !== data.id));
      } else {
        setVerifications((prev) => prev.map((v) => (v.id === data.id ? data : v)));
      }
    });

    socket.on('pos-verification:image-uploaded', (data: any) => {
      setVerifications((prev) =>
        prev.map((v) =>
          v.id === data.verificationId
            ? { ...v, images: [...(v.images || []), { file_name: data.fileName, file_path: data.imageUrl }] }
            : v,
        ),
      );
    });

    return () => {
      socket.off('pos-verification:new');
      socket.off('pos-verification:updated');
      socket.off('pos-verification:image-uploaded');
    };
  }, [socket]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">POS Verification</h1>
        <Badge variant="warning">{verifications.length} pending</Badge>
      </div>

      {verifications.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <ShieldCheck className="mx-auto h-12 w-12 text-gray-300" />
            <p className="mt-3 text-sm text-gray-500">No pending verifications</p>
            <p className="text-xs text-gray-400">
              Pending verifications will appear here in real-time when Odoo sends them
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {verifications.map((v) => (
            <VerificationCard key={v.id} verification={v} onUpdate={fetchVerifications} userId={user?.id} />
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationCard({
  verification,
  onUpdate,
  userId,
}: {
  verification: any;
  onUpdate: () => void;
  userId?: string;
}) {
  const [uploading, setUploading] = useState(false);
  const [notes, setNotes] = useState('');
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [refundReasonMode, setRefundReasonMode] = useState(false);
  const [refundReason, setRefundReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [breakdownQtys, setBreakdownQtys] = useState<Record<number, number>>(
    () => Object.fromEntries(DENOMINATIONS.map((d) => [d, 0])),
  );
  const [breakdownModalOpen, setBreakdownModalOpen] = useState(false);
  const [hasBreakdown, setHasBreakdown] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [imageModalIndex, setImageModalIndex] = useState(0);
  const { hasPermission } = usePermission();

  const hasImages = verification.images && verification.images.length > 0;
  const isPending = verification.status === 'pending';
  const isBreakdownType =
    verification.verification_type === 'cf_breakdown' ||
    verification.verification_type === 'pcf_breakdown' ||
    verification.verification_type === 'closing_pcf_breakdown';

  const breakdownTotal = DENOMINATIONS.reduce(
    (sum, d) => sum + d * (breakdownQtys[d] || 0),
    0,
  );

  // Keep hasBreakdown in sync with breakdownTotal to prevent reset on re-render
  useEffect(() => {
    if (breakdownTotal > 0) {
      setHasBreakdown(true);
    }
  }, [breakdownTotal]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append('image', acceptedFiles[0]);
        await api.post(`/pos-verifications/${verification.id}/images`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        // Do not call onUpdate() here; the image-uploaded socket event
        // will update this verification's images without remounting
        // the card, so local breakdown state is preserved.
      } catch (err) {
        console.error('Upload failed:', err);
      } finally {
        setUploading(false);
      }
    },
    [verification.id, onUpdate],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png', '.webp', '.gif'] },
    maxFiles: 1,
    disabled: !isPending,
  });

  const handleAction = async (action: 'confirm' | 'reject', overrideNotes?: string) => {
    setActionLoading(true);
    try {
      const breakdownItems =
        action === 'confirm' && isBreakdownType && breakdownTotal > 0
          ? DENOMINATIONS
              .map((denomination) => ({
                denomination,
                quantity: breakdownQtys[denomination] || 0,
              }))
              .filter((item) => item.quantity > 0)
          : undefined;

      await api.post(`/pos-verifications/${verification.id}/${action}`, {
        notes: overrideNotes ?? (action === 'reject' ? rejectReason : notes),
        breakdownItems,
      });
      onUpdate();
    } catch (err) {
      console.error(`${action} failed:`, err);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenBreakdownModal = () => {
    setBreakdownModalOpen(true);
  };

  const handleConfirmBreakdown = (quantities: Record<number, number>) => {
    setBreakdownQtys(quantities);
    setHasBreakdown(true);
    setBreakdownModalOpen(false);
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'success' as const;
      case 'rejected':
        return 'danger' as const;
      default:
        return 'warning' as const;
    }
  };

  const typeLabel =
    verification.verification_type === 'cf_breakdown'
      ? 'CF Breakdown'
      : verification.verification_type === 'pcf_breakdown'
        ? 'PCF Breakdown'
        : verification.verification_type === 'discount_order'
          ? 'Discount Order'
          : verification.verification_type === 'refund_order'
            ? 'Refund Order'
            : verification.verification_type === 'non_cash_order'
              ? 'Non-Cash Order'
              : verification.verification_type === 'token_pay_order'
                ? 'Token Pay Order'
                : verification.verification_type === 'ispe_purchase_order'
                  ? 'ISPE Purchase Order'
                  : verification.verification_type === 'register_cash_out'
                    ? 'Register Cash Out'
                    : verification.verification_type === 'register_cash_in'
                      ? 'Register Cash In'
                      : verification.verification_type === 'closing_pcf_breakdown'
                        ? 'Closing PCF Report'
                        : null;

  const typeBadgeClass =
    verification.verification_type === 'cf_breakdown'
      ? 'bg-blue-200 text-blue-800'
      : verification.verification_type === 'pcf_breakdown'
        ? 'bg-violet-200 text-violet-800'
        : verification.verification_type === 'discount_order'
          ? 'bg-orange-200 text-orange-800'
          : verification.verification_type === 'refund_order'
            ? 'bg-purple-200 text-purple-800'
            : verification.verification_type === 'non_cash_order'
              ? 'bg-teal-200 text-teal-800'
              : verification.verification_type === 'token_pay_order'
                ? 'bg-indigo-200 text-indigo-800'
                : verification.verification_type === 'ispe_purchase_order'
                  ? 'bg-amber-200 text-amber-800'
                  : verification.verification_type === 'register_cash_out'
                    ? 'bg-red-200 text-red-800'
                    : verification.verification_type === 'register_cash_in'
                      ? 'bg-green-200 text-green-800'
                      : verification.verification_type === 'closing_pcf_breakdown'
                        ? 'bg-cyan-200 text-cyan-800'
                        : 'bg-gray-200 text-gray-700';

  const typeHeaderClass =
    verification.verification_type === 'cf_breakdown'
      ? 'bg-blue-100 border-blue-300'
      : verification.verification_type === 'pcf_breakdown'
        ? 'bg-violet-100 border-violet-300'
        : verification.verification_type === 'discount_order'
          ? 'bg-orange-100 border-orange-300'
          : verification.verification_type === 'refund_order'
            ? 'bg-purple-100 border-purple-300'
            : verification.verification_type === 'non_cash_order'
              ? 'bg-teal-100 border-teal-300'
              : verification.verification_type === 'token_pay_order'
                ? 'bg-indigo-100 border-indigo-300'
                : verification.verification_type === 'ispe_purchase_order'
                  ? 'bg-amber-100 border-amber-300'
                  : verification.verification_type === 'register_cash_out'
                    ? 'bg-red-100 border-red-300'
                    : verification.verification_type === 'register_cash_in'
                      ? 'bg-green-100 border-green-300'
                      : verification.verification_type === 'closing_pcf_breakdown'
                        ? 'bg-cyan-100 border-cyan-300'
                        : '';

  const isDiscountOrder = verification.verification_type === 'discount_order';
  const isRefundOrder = verification.verification_type === 'refund_order';
  const isNonCashOrder = verification.verification_type === 'non_cash_order';
  const isTokenPayOrder = verification.verification_type === 'token_pay_order';
  const isISPEPurchaseOrder = verification.verification_type === 'ispe_purchase_order';
  const isRegisterCashOut = verification.verification_type === 'register_cash_out';
  const isRegisterCashIn = verification.verification_type === 'register_cash_in';
  const isRegisterCash = isRegisterCashOut || isRegisterCashIn;
  const isClosingPCF = verification.verification_type === 'closing_pcf_breakdown';
  const isAwaitingCustomer = verification.status === 'awaiting_customer';
  const canActOnDiscountOrder =
    !isDiscountOrder ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);
  const canActOnRefundOrder =
    !isRefundOrder ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);
  const canActOnNonCashOrder =
    !isNonCashOrder ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);
  const canActOnTokenPayOrder =
    !isTokenPayOrder ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);
  const canActOnISPEPurchaseOrder =
    !isISPEPurchaseOrder ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);
  const canActOnRegisterCash =
    !isRegisterCash ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);
  const canAct = canActOnDiscountOrder && canActOnRefundOrder && canActOnNonCashOrder && canActOnTokenPayOrder && canActOnISPEPurchaseOrder && canActOnRegisterCash;

  // Parse odoo_payload (Knex jsonb may auto-parse; guard for string)
  const odooPayload: any =
    (isDiscountOrder || isRefundOrder || isNonCashOrder || isTokenPayOrder || isISPEPurchaseOrder || isRegisterCash)
      ? typeof verification.odoo_payload === 'string'
        ? JSON.parse(verification.odoo_payload)
        : verification.odoo_payload
      : null;

  return (
    <>
    <Card>
      <CardHeader className={`flex items-start justify-between ${typeHeaderClass}`}>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{verification.title || 'POS Verification'}</h3>
            {typeLabel && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeClass}`}>
                <Layers className="h-3 w-3" />
                {typeLabel}
              </span>
            )}
          </div>
          {verification.amount != null && (
            <p className="mt-1 text-lg font-bold text-primary-600">
              {isRefundOrder ? 'Refund Total' : isRegisterCashOut ? 'Cash Out Amount' : isRegisterCashIn ? 'Cash In Amount' : isDiscountOrder || isNonCashOrder || isTokenPayOrder || isISPEPurchaseOrder ? 'Order Total' : 'Expected'}:{' '}
              {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
                verification.amount,
              )}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAwaitingCustomer && (
            <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              Awaiting Customer Verification
            </span>
          )}
          <Badge variant={statusVariant(verification.status)}>{verification.status}</Badge>
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {verification.description && (
          <p className="text-sm text-gray-600">{verification.description}</p>
        )}

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
                {odooPayload.x_session_name && (
                  <>
                    <span className="text-gray-500">Session</span>
                    <span className="font-medium text-gray-900">{odooPayload.x_session_name}</span>
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
              {odooPayload.x_session_name && (
                <>
                  <span className="text-gray-500">Session</span>
                  <span className="font-medium text-gray-900">{odooPayload.x_session_name}</span>
                </>
              )}
              {odooPayload.cashier && (
                <>
                  <span className="text-gray-500">Cashier</span>
                  <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                </>
              )}
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
              {odooPayload.x_session_name && (
                <>
                  <span className="text-gray-500">Session</span>
                  <span className="font-medium text-gray-900">{odooPayload.x_session_name}</span>
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
              {odooPayload.x_session_name && (
                <>
                  <span className="text-gray-500">Session</span>
                  <span className="font-medium text-gray-900">{odooPayload.x_session_name}</span>
                </>
              )}
              {odooPayload.cashier && (
                <>
                  <span className="text-gray-500">Cashier</span>
                  <span className="font-medium text-gray-900">{odooPayload.cashier}</span>
                </>
              )}
              {(verification.customer_name || verification.customer_user_id) && (
                <>
                  <span className="text-gray-500">Customer</span>
                  <span className="font-medium text-gray-900">{verification.customer_name ?? verification.customer_user_id}</span>
                </>
              )}
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
            {verification.customer_rejection_reason && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                <strong>Rejected by customer:</strong> {verification.customer_rejection_reason}
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
          </div>
        )}

        <p className="text-xs text-gray-400">
          Received: {fmtDateTime(verification.created_at)}
        </p>

        {/* Saved breakdown display */}
        {verification.breakdown && (
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="mb-1 text-xs font-medium text-gray-500">Breakdown</p>
            <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800">
              {formatBreakdown(verification.breakdown)}
            </pre>
          </div>
        )}

        {/* Breakdown entry button (only for CF/PCF types when pending and no saved breakdown) */}
        {isBreakdownType &&
          isPending &&
          !verification.breakdown &&
          hasPermission(PERMISSIONS.POS_VERIFICATION_UPLOAD_IMAGE) && (
            <div>
              {!hasBreakdown ? (
                <Button
                  variant="secondary"
                  onClick={handleOpenBreakdownModal}
                  className="w-full"
                >
                  Add Breakdown
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-green-700 uppercase tracking-wide">
                        Denomination Breakdown
                      </p>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleOpenBreakdownModal}
                      >
                        <Edit className="h-4 w-4 mr-1" />
                        Edit
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {DENOMINATIONS.filter((d) => breakdownQtys[d] > 0).map((denom) => (
                        <div key={denom} className="flex items-center justify-between text-xs">
                          <span className="text-green-800">
                            ₱{denom.toLocaleString()} × {breakdownQtys[denom]}
                          </span>
                          <span className="font-medium text-green-900">
                            ₱{(denom * breakdownQtys[denom]).toLocaleString()}
                          </span>
                        </div>
                      ))}
                      <div className="border-t border-green-300 pt-1 mt-1 flex items-center justify-between text-sm font-bold">
                        <span className="text-green-800">Total:</span>
                        <span className="text-green-900">₱{breakdownTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

        {/* Images - Carousel */}
        {hasImages && (
          <div className="flex flex-wrap gap-2">
            {verification.images.map((img: any, i: number) => {
              const imageUrl = img.file_path || img.file_name || "";
              return (
                <button
                  key={i}
                  onClick={() => {
                    setImageModalIndex(i);
                    setImageModalOpen(true);
                  }}
                  className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-gray-200 hover:opacity-80"
                >
                  <img
                    src={imageUrl}
                    alt={img.file_name || "Image"}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = "/placeholder-image.png";
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Upload area (only when pending, not for refund orders) */}
        {isPending && !isRefundOrder && hasPermission(PERMISSIONS.POS_VERIFICATION_UPLOAD_IMAGE) && (
          <div
            {...getRootProps()}
            className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
              isDragActive ? 'border-primary-500 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <Spinner size="sm" className="mx-auto" />
            ) : (
              <>
                <Upload className="mx-auto h-6 w-6 text-gray-400" />
                <p className="mt-1 text-sm text-gray-500">
                  {isDragActive ? 'Drop image here' : 'Drag & drop an image, or click to upload'}
                </p>
              </>
            )}
          </div>
        )}

        {/* Notes input for confirm (only when pending and has images, not for refund orders) */}
        {isPending && !isAwaitingCustomer && !isRefundOrder && hasImages && !rejectMode && hasPermission(PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT) && canAct && (
          <Input
            placeholder="Optional notes..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        )}

        {/* Reject reason input */}
        {isPending && !isAwaitingCustomer && !isRefundOrder && rejectMode && hasPermission(PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT) && canAct && (
          <textarea
            rows={2}
            placeholder="Reason for rejection (required)..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        )}

        {/* Refund reason textarea */}
        {isPending && !isAwaitingCustomer && isRefundOrder && refundReasonMode && hasPermission(PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT) && canAct && (
          <textarea
            rows={3}
            placeholder="Reason for refund (required)..."
            value={refundReason}
            onChange={(e) => setRefundReason(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        )}
      </CardBody>

      {/* Action buttons — hidden for awaiting_customer (customer must act) */}
      {isPending && !isAwaitingCustomer && hasPermission(PERMISSIONS.POS_VERIFICATION_CONFIRM_REJECT) && canAct && (
        <CardFooter className="flex gap-3">
          {isRefundOrder ? (
            /* Refund order flow: Add Reason → textarea → Confirm Refund */
            !refundReasonMode ? (
              <Button
                variant="primary"
                onClick={() => setRefundReasonMode(true)}
                disabled={actionLoading}
                className="flex-1"
              >
                <Check className="mr-1 h-4 w-4" />
                Add Reason
              </Button>
            ) : (
              <>
                <Button
                  variant="success"
                  onClick={() => handleAction('confirm', refundReason)}
                  disabled={actionLoading || !refundReason.trim()}
                  className="flex-1"
                >
                  <Check className="mr-1 h-4 w-4" />
                  {actionLoading ? 'Confirming...' : 'Confirm Refund'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => { setRefundReasonMode(false); setRefundReason(''); }}
                  disabled={actionLoading}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </>
            )
          ) : !rejectMode ? (
            /* Standard flow: Confirm (requires image, and breakdown for CF/PCF) + Reject (not for breakdown types) */
            <>
              <Button
                variant="success"
                onClick={() => handleAction('confirm')}
                disabled={actionLoading || !hasImages || (isBreakdownType && !hasBreakdown)}
                className="flex-1"
              >
                <Check className="mr-1 h-4 w-4" />
                Confirm
              </Button>
              {!isBreakdownType && (
                <Button
                  variant="danger"
                  onClick={() => setRejectMode(true)}
                  disabled={actionLoading}
                  className="flex-1"
                >
                  <X className="mr-1 h-4 w-4" />
                  Reject
                </Button>
              )}
            </>
          ) : (
            /* Reject reason flow */
            <>
              <Button
                variant="danger"
                onClick={() => handleAction('reject')}
                disabled={actionLoading || !rejectReason.trim()}
                className="flex-1"
              >
                <X className="mr-1 h-4 w-4" />
                {actionLoading ? 'Rejecting...' : 'Confirm Reject'}
              </Button>
              <Button
                variant="secondary"
                onClick={() => { setRejectMode(false); setRejectReason(''); }}
                disabled={actionLoading}
                className="flex-1"
              >
                Cancel
              </Button>
            </>
          )}
        </CardFooter>
      )}

      {/* Show review info for completed verifications */}
      {!isPending && verification.review_notes && (
        <CardFooter>
          <p className="text-sm text-gray-500">
            <span className="font-medium">Notes:</span> {verification.review_notes}
          </p>
        </CardFooter>
      )}
    </Card>

    {/* Breakdown Modal */}
    {isBreakdownType && isPending && !verification.breakdown && (
      <BreakdownModal
        isOpen={breakdownModalOpen}
        onClose={() => setBreakdownModalOpen(false)}
        onConfirm={handleConfirmBreakdown}
        initialQuantities={breakdownQtys}
        expectedAmount={verification.amount ?? undefined}
      />
    )}

    {/* Image Modal */}
    <ImageModal
      images={verification.images || []}
      initialIndex={imageModalIndex}
      isOpen={imageModalOpen}
      onClose={() => setImageModalOpen(false)}
    />
  </>
  );
}
