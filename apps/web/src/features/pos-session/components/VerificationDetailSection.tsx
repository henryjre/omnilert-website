import { useState } from 'react';
import { Image as ImageIcon, Layers, Star } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { usePermission } from '@/shared/hooks/usePermission';
import { PERMISSIONS } from '@omnilert/shared';
import { ImagePreviewModal } from '@/features/case-reports/components/ImagePreviewModal';
import { AuditRatingModal } from './AuditRatingModal';
import {
  fmtOdooDate,
  fmtDateTime,
  fmt,
  parseBreakdown,
  breakdownTotal,
  verStatusVariant,
  getVerificationTypeConfig,
} from '../utils/posHelpers';

interface VerificationDetailSectionProps {
  verification: any;
  onAuditUpdate: () => void;
}

function OrderTable({ lines, qtyField = 'qty' }: { lines: any[]; qtyField?: string }) {
  const phFmt = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
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
            const qty = line[qtyField] ?? line.qty ?? 0;
            return (
              <tr key={i}>
                <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                <td className="px-3 py-2 text-right text-gray-700">
                  {qty} {line.uom_name}
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-900">
                  {phFmt.format(line.price_unit)}
                </td>
                <td className="px-3 py-2 text-right font-semibold text-gray-900">
                  {phFmt.format(line.price_unit * qty)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot className="border-t-2 border-gray-200 bg-gray-50">
          <tr>
            <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-700">
              Total
            </td>
            <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
              {phFmt.format(
                lines.reduce((sum: number, l: any) => {
                  const qty = l[qtyField] ?? l.qty ?? 0;
                  return sum + l.price_unit * qty;
                }, 0),
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function VerificationDetailSection({
  verification: v,
  onAuditUpdate,
}: VerificationDetailSectionProps) {
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { hasPermission } = usePermission();
  const canAudit = hasPermission(PERMISSIONS.POS_MANAGE_AUDITS);

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
  const isOrderType =
    isDiscountOrder ||
    isRefundOrder ||
    isNonCashOrder ||
    isTokenPayOrder ||
    isISPEPurchaseOrder ||
    isRegisterCash;

  const typeConfig = getVerificationTypeConfig(v.verification_type);

  const odooPayload: any = isOrderType
    ? typeof v.odoo_payload === 'string'
      ? JSON.parse(v.odoo_payload)
      : v.odoo_payload
    : null;

  const breakdownItems = parseBreakdown(v.breakdown);
  const activeItems = breakdownItems.filter((i) => i.quantity > 0);
  const counted = breakdownTotal(activeItems);
  const expected = v.amount ?? null;
  const diff = expected != null ? counted - expected : null;

  const isPending = v.status === 'pending';

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200">
      {/* Section header */}
      <div
        className={`flex items-center justify-between border-b px-4 py-3 ${typeConfig.headerClass}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{v.title}</span>
          {typeConfig.label && (
            <span
              className={`hidden items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium sm:inline-flex ${typeConfig.badgeClass}`}
            >
              <Layers className="h-3 w-3" />
              {typeConfig.label}
            </span>
          )}
        </div>
        <Badge variant={verStatusVariant(v.status)}>{v.status}</Badge>
      </div>

      <div className="space-y-4 px-4 py-4">
        {v.status === 'awaiting_customer' ? (
          <p className="text-sm font-medium text-yellow-600">
            ⏳ Awaiting Customer Verification
          </p>
        ) : isPending ? (
          <p className="text-sm font-medium text-amber-600">
            {isOrderType
              ? '⏳ Pending — awaiting confirmation'
              : '⏳ Pending — breakdown not yet submitted'}
          </p>
        ) : (
          <>
            {/* Discount order */}
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
                    <span className="font-semibold text-primary-600">{fmt(v.amount)}</span>
                  </div>
                  {odooPayload.x_order_lines?.length > 0 && (
                    <OrderTable lines={odooPayload.x_order_lines} />
                  )}
                </div>
              );
            })()}

            {/* Refund order */}
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
                  <span className="font-semibold text-amber-600">{fmt(v.amount)}</span>
                </div>
                {odooPayload.x_order_lines?.length > 0 && (
                  <OrderTable lines={odooPayload.x_order_lines} />
                )}
              </div>
            )}

            {/* Non-cash order */}
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
                  <span className="font-semibold text-primary-600">{fmt(v.amount)}</span>
                </div>
                {odooPayload.x_order_lines?.length > 0 && (
                  <OrderTable lines={odooPayload.x_order_lines} />
                )}
              </div>
            )}

            {/* Token pay order */}
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
                      <span className="font-medium text-gray-900">
                        {v.customer_name ?? v.customer_user_id}
                      </span>
                    </>
                  )}
                  <span className="text-gray-500">Order Total</span>
                  <span className="font-semibold text-primary-600">{fmt(v.amount)}</span>
                </div>
                {odooPayload.x_order_lines?.length > 0 && (
                  <OrderTable lines={odooPayload.x_order_lines} />
                )}
                {v.customer_rejection_reason && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <strong>Rejected by customer:</strong> {v.customer_rejection_reason}
                  </div>
                )}
              </div>
            )}

            {/* ISPE purchase order */}
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
                  <span className="font-semibold text-primary-600">{fmt(v.amount)}</span>
                </div>
                {odooPayload.x_order_line_details?.length > 0 && (
                  <OrderTable lines={odooPayload.x_order_line_details} qtyField="quantity" />
                )}
              </div>
            )}

            {/* Register cash in/out */}
            {isRegisterCash && odooPayload && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                {odooPayload.payment_ref && (() => {
                  const reason = odooPayload.payment_ref.split(/-in-|-out-/).slice(1).join('');
                  return reason ? (
                    <>
                      <span className="text-gray-500">
                        {isRegisterCashOut ? 'Cash Out Reason' : 'Cash In Reason'}
                      </span>
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
                    <span className="text-gray-500">
                      {isRegisterCashOut ? 'Cash Out Amount' : 'Cash In Amount'}
                    </span>
                    <span className="font-semibold text-gray-900">{fmt(v.amount)}</span>
                  </>
                )}
              </div>
            )}

            {/* Denomination breakdown table */}
            {activeItems.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Denomination Breakdown
                </p>
                <div className="space-y-1">
                  {activeItems.map((item) => (
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

            {/* Expected vs counted (CF / PCF) */}
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

            {/* Closing PCF expected vs counted */}
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
                  {v.status === 'confirmed' ? 'Confirmed' : v.status === 'rejected' ? 'Rejected' : 'Reviewed'} by:
                </span>{' '}
                {v.reviewer_name}
                {v.reviewed_at && (
                  <span className="ml-2">on {fmtDateTime(v.reviewed_at)}</span>
                )}
              </div>
            )}

            {/* Attached images */}
            {v.images && v.images.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <ImageIcon className="mr-1 inline h-3 w-3" />
                  Attached Images
                </p>
                <div className="flex flex-wrap gap-2">
                  {v.images.map((img: any, i: number) => {
                    const url = img.file_path || `/api/v1/uploads/${img.file_name}`;
                    const fileName = img.file_name ?? '';
                    const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileName);
                    return (
                      <button
                        key={i}
                        onClick={() => { setPreviewIndex(i); setPreviewOpen(true); }}
                        className="block"
                      >
                        {isVideo ? (
                          <video
                            src={url}
                            muted
                            className="h-24 w-24 rounded-lg border border-gray-200 object-cover hover:opacity-80"
                          />
                        ) : (
                          <img
                            src={url}
                            alt={fileName}
                            className="h-24 w-24 rounded-lg border border-gray-200 object-cover hover:opacity-80"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Review notes / Refund reason */}
            {v.review_notes && (
              <p className="text-xs text-gray-500">
                <span className="font-medium">
                  {v.status === 'rejected' ? 'Rejection Reason' : isRefundOrder ? 'Refund Reason' : 'Notes'}:
                </span>{' '}
                {v.review_notes}
              </p>
            )}

            {/* Audit rating or Audit button */}
            {v.audit_rating != null ? (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-700">
                  Audit Rating
                </p>
                <div className="mb-1 flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-4 w-4 ${
                        star <= v.audit_rating
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-gray-300'
                      }`}
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

      <AuditRatingModal
        open={auditModalOpen}
        verificationId={v.id}
        onClose={() => setAuditModalOpen(false)}
        onSaved={onAuditUpdate}
      />

      <ImagePreviewModal
        items={previewOpen ? (v.images || []).map((img: any) => ({
          url: img.file_path || `/api/v1/uploads/${img.file_name}`,
          fileName: img.file_name ?? '',
        })) : null}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
