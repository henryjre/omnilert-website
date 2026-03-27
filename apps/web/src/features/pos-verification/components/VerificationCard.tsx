import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardBody, CardFooter } from '@/shared/components/ui/Card';
import { Button } from '@/shared/components/ui/Button';
import { Badge } from '@/shared/components/ui/Badge';
import { Spinner } from '@/shared/components/ui/Spinner';
import { Input } from '@/shared/components/ui/Input';
import { usePermission } from '@/shared/hooks/usePermission';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSIONS } from '@omnilert/shared';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  Check,
  X,
  Layers,
  Edit,
  Building2,
  GitBranch,
} from 'lucide-react';
import {
  fmtOdooDate,
  fmtDateTime,
  fmt,
  verStatusVariant,
  getVerificationTypeConfig,
  parseBreakdown,
} from '@/features/pos-session/utils/posHelpers';
import { BreakdownModal } from './BreakdownModal';
import { ImageModal } from './ImageModal';

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];

function formatBreakdown(raw: unknown): string {
  const items = parseBreakdown(raw);
  const active = items.filter((i) => i.quantity > 0);
  if (active.length === 0) return 'No breakdown';
  const total = active.reduce((sum, i) => sum + i.denomination * i.quantity, 0);
  return [
    ...active.map((i) => `${i.quantity} x ${i.denomination.toFixed(2)} ₱`),
    `Total: ${total.toFixed(2)} ₱`,
  ].join('\n');
}

interface VerificationCardProps {
  verification: any;
  onUpdate: () => void;
  userId?: string;
  branchInfo?: { companyName: string; branchName: string };
}

export function VerificationCard({
  verification,
  onUpdate,
  userId,
  branchInfo,
}: VerificationCardProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
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

  const typeConfig = getVerificationTypeConfig(verification.verification_type);
  const hasImages = verification.images && verification.images.length > 0;
  const isPending = verification.status === 'pending';
  const isBreakdownType =
    verification.verification_type === 'cf_breakdown' ||
    verification.verification_type === 'pcf_breakdown' ||
    verification.verification_type === 'closing_pcf_breakdown';

  const currentBreakdownTotal = DENOMINATIONS.reduce(
    (sum, d) => sum + d * (breakdownQtys[d] || 0),
    0,
  );

  useEffect(() => {
    if (currentBreakdownTotal > 0) {
      setHasBreakdown(true);
    }
  }, [currentBreakdownTotal]);

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

  const canActOnType = (typeFlag: boolean) =>
    !typeFlag ||
    !verification.cashier_user_id ||
    userId === verification.cashier_user_id ||
    hasPermission(PERMISSIONS.ADMIN_MANAGE_USERS);

  const canAct =
    canActOnType(isDiscountOrder) &&
    canActOnType(isRefundOrder) &&
    canActOnType(isNonCashOrder) &&
    canActOnType(isTokenPayOrder) &&
    canActOnType(isISPEPurchaseOrder) &&
    canActOnType(isRegisterCash);

  const odooPayload: any =
    isDiscountOrder || isRefundOrder || isNonCashOrder || isTokenPayOrder || isISPEPurchaseOrder || isRegisterCash
      ? typeof verification.odoo_payload === 'string'
        ? JSON.parse(verification.odoo_payload)
        : verification.odoo_payload
      : null;

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
      } catch (err) {
        showErrorToast((err as any)?.response?.data?.error || 'Failed to upload image');
      } finally {
        setUploading(false);
      }
    },
    [verification.id, showErrorToast],
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
        action === 'confirm' && isBreakdownType && currentBreakdownTotal > 0
          ? DENOMINATIONS.map((denomination) => ({
              denomination,
              quantity: breakdownQtys[denomination] || 0,
            })).filter((item) => item.quantity > 0)
          : undefined;

      await api.post(`/pos-verifications/${verification.id}/${action}`, {
        notes: overrideNotes ?? (action === 'reject' ? rejectReason : notes),
        breakdownItems,
      });
      showSuccessToast(action === 'confirm' ? 'Verification confirmed.' : 'Verification rejected.');
      onUpdate();
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || `Failed to ${action} verification`);
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBreakdown = (quantities: Record<number, number>) => {
    setBreakdownQtys(quantities);
    setHasBreakdown(true);
    setBreakdownModalOpen(false);
  };

  const amountLabel = isRefundOrder
    ? 'Refund Total'
    : isRegisterCashOut
      ? 'Cash Out Amount'
      : isRegisterCashIn
        ? 'Cash In Amount'
        : isDiscountOrder || isNonCashOrder || isTokenPayOrder || isISPEPurchaseOrder
          ? 'Order Total'
          : 'Expected';

  return (
    <>
      <Card>
        <CardHeader className={`space-y-1.5 sm:space-y-0 ${typeConfig.headerClass}`}>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold leading-tight text-gray-900">
                  {verification.title || 'POS Verification'}
                </h3>
                <span
                  className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${typeConfig.badgeClass}`}
                >
                  <Layers className="h-3 w-3" />
                  {typeConfig.label}
                </span>
              </div>

              {branchInfo && (
                <div className="mt-1 flex items-center gap-3 text-xs">
                  <span className="flex items-center gap-1 text-gray-500">
                    <Building2 className="h-3 w-3" />
                    {branchInfo.companyName}
                  </span>
                  <span className="flex items-center gap-1 text-primary-600">
                    <GitBranch className="h-3 w-3" />
                    {branchInfo.branchName}
                  </span>
                </div>
              )}

              {verification.amount != null && (
                <p className="mt-1 text-lg font-bold text-primary-600 sm:text-xl">
                  {amountLabel}: {fmt(verification.amount)}
                </p>
              )}
            </div>

            <Badge variant={verStatusVariant(verification.status)}>{verification.status}</Badge>
          </div>

          {isAwaitingCustomer && !isTokenPayOrder && (
            <div>
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-[11px] font-medium text-yellow-800 sm:text-xs">
                Awaiting Customer Verification
              </span>
            </div>
          )}
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
                  <OrderLinesTable
                    lines={odooPayload.x_order_lines}
                    highlightNegativePrice
                  />
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
                <OrderLinesTable lines={odooPayload.x_order_lines} highlightNegativeQty />
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
                <OrderLinesTable lines={odooPayload.x_order_lines} />
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
                    <span className="font-medium text-gray-900">
                      {verification.customer_name ?? verification.customer_user_id}
                    </span>
                  </>
                )}
              </div>
              {odooPayload.x_order_lines && odooPayload.x_order_lines.length > 0 && (
                <OrderLinesTable
                  lines={odooPayload.x_order_lines}
                  highlightNegativePrice
                  highlightClass="bg-indigo-50"
                />
              )}
              {verification.customer_rejection_reason && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
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
                          <td className="px-3 py-2 text-right font-medium text-gray-900">{fmt(line.price_unit)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(line.price_unit * line.quantity)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
                        <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                          {fmt(odooPayload.x_order_line_details.reduce((sum: number, l: any) => sum + l.price_unit * l.quantity, 0))}
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

          <p className="text-xs text-gray-400">Received: {fmtDateTime(verification.created_at)}</p>

          {/* Saved breakdown display */}
          {verification.breakdown && (
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="mb-1 text-xs font-medium text-gray-500">Breakdown</p>
              <pre className="whitespace-pre-wrap font-mono text-sm text-gray-800">
                {formatBreakdown(verification.breakdown)}
              </pre>
            </div>
          )}

          {/* Breakdown entry button */}
          {isBreakdownType && isPending && !verification.breakdown && hasPermission(PERMISSIONS.POS_MANAGE_VERIFICATIONS) && (
            <div>
              {!hasBreakdown ? (
                <Button variant="secondary" onClick={() => setBreakdownModalOpen(true)} className="w-full">
                  Add Breakdown
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-green-700">
                        Denomination Breakdown
                      </p>
                      <Button variant="ghost" size="sm" onClick={() => setBreakdownModalOpen(true)}>
                        <Edit className="mr-1 h-4 w-4" />
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
                      <div className="mt-1 flex items-center justify-between border-t border-green-300 pt-1 text-sm font-bold">
                        <span className="text-green-800">Total:</span>
                        <span className="text-green-900">₱{currentBreakdownTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Images */}
          {hasImages && (
            <div className="flex flex-wrap gap-2">
              {verification.images.map((img: any, i: number) => {
                const imageUrl = img.file_path || img.file_name || '';
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
                      alt={img.file_name || 'Image'}
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = '/placeholder-image.png';
                      }}
                    />
                  </button>
                );
              })}
            </div>
          )}

          {/* Upload area */}
          {isPending && !isRefundOrder && hasPermission(PERMISSIONS.POS_MANAGE_VERIFICATIONS) && (
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

          {/* Notes input for confirm */}
          {isPending && !isAwaitingCustomer && !isRefundOrder && hasImages && !rejectMode && hasPermission(PERMISSIONS.POS_MANAGE_VERIFICATIONS) && canAct && (
            <Input
              placeholder="Optional notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          )}

          {/* Reject reason input */}
          {isPending && !isAwaitingCustomer && !isRefundOrder && rejectMode && hasPermission(PERMISSIONS.POS_MANAGE_VERIFICATIONS) && canAct && (
            <textarea
              rows={2}
              placeholder="Reason for rejection (required)..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          )}

          {/* Refund reason textarea */}
          {isPending && !isAwaitingCustomer && isRefundOrder && refundReasonMode && hasPermission(PERMISSIONS.POS_MANAGE_VERIFICATIONS) && canAct && (
            <textarea
              rows={3}
              placeholder="Reason for refund (required)..."
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            />
          )}

          {isAwaitingCustomer && isTokenPayOrder && (
            <p className="text-center text-xs text-amber-700">Awaiting customer verification.</p>
          )}
        </CardBody>

        {/* Action buttons */}
        {isPending && !isAwaitingCustomer && hasPermission(PERMISSIONS.POS_MANAGE_VERIFICATIONS) && canAct && (
          <CardFooter className="flex gap-3">
            {isRefundOrder ? (
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

        {!isPending && verification.review_notes && (
          <CardFooter>
            <p className="text-sm text-gray-500">
              <span className="font-medium">Notes:</span> {verification.review_notes}
            </p>
          </CardFooter>
        )}
      </Card>

      {isBreakdownType && isPending && !verification.breakdown && (
        <BreakdownModal
          isOpen={breakdownModalOpen}
          onClose={() => setBreakdownModalOpen(false)}
          onConfirm={handleConfirmBreakdown}
          initialQuantities={breakdownQtys}
          expectedAmount={verification.amount ?? undefined}
        />
      )}

      <ImageModal
        images={verification.images || []}
        initialIndex={imageModalIndex}
        isOpen={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />
    </>
  );
}

// --- Shared order lines table ---

interface OrderLinesTableProps {
  lines: any[];
  highlightNegativePrice?: boolean;
  highlightNegativeQty?: boolean;
  highlightClass?: string;
}

function OrderLinesTable({
  lines,
  highlightNegativePrice,
  highlightNegativeQty,
  highlightClass = 'bg-red-50',
}: OrderLinesTableProps) {
  const total = lines.reduce((sum: number, l: any) => sum + l.price_unit * l.qty, 0);
  return (
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
          {lines.map((line: any, i: number) => {
            const isHighlighted =
              (highlightNegativePrice && line.price_unit < 0) ||
              (highlightNegativeQty && line.qty < 0);
            return (
              <tr key={i} className={isHighlighted ? highlightClass : ''}>
                <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                <td className="px-3 py-2 text-right text-gray-700">{line.qty} {line.uom_name}</td>
                <td className="px-3 py-2 text-right font-medium text-gray-900">{fmt(line.price_unit)}</td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">{fmt(line.price_unit * line.qty)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
          <tr>
            <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">Total</td>
            <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">{fmt(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
