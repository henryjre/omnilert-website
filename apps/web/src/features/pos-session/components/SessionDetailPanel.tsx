import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { Building2, CheckCircle, Clock, DollarSign, GitBranch, X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { usePermission } from '@/shared/hooks/usePermission';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSIONS } from '@omnilert/shared';
import { VerificationDetailSection } from './VerificationDetailSection';
import { fmtDateTime, fmt, statusVariant } from '../utils/posHelpers';

interface BranchInfo {
  companyName: string;
  branchName: string;
}

interface SessionDetailPanelProps {
  session: any;
  branchInfo?: BranchInfo;
  onClose: () => void;
  onUpdate: () => void;
}

export function SessionDetailPanel({
  session,
  branchInfo,
  onClose,
  onUpdate,
}: SessionDetailPanelProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
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

  const handleConfirmAuditComplete = async () => {
    setConfirmModalOpen(false);
    setActionLoading(true);
    try {
      await api.post(`/pos-sessions/${session.id}/audit-complete`);
      showSuccessToast('Session marked as audit complete.');
      onUpdate();
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to complete session audit');
    } finally {
      setActionLoading(false);
    }
  };

  const closingReports = session.closing_reports
    ? typeof session.closing_reports === 'string'
      ? JSON.parse(session.closing_reports)
      : session.closing_reports
    : null;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between border-b px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold text-gray-900">
              {session.session_name || `Session ${session.odoo_session_id}`}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {session.opened_at && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Opened: {fmtDateTime(session.opened_at)}
                </span>
              )}
              {branchInfo && (
                <>
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {branchInfo.companyName}
                  </span>
                  <span className="flex items-center gap-1 text-primary-600">
                    <GitBranch className="h-3 w-3" />
                    {branchInfo.branchName}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="ml-4 flex shrink-0 items-center gap-3">
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

        {/* Body */}
        <div className="flex-1 space-y-6 px-6 py-5">
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
                {payload.cash_register_balance_start != null &&
                  payload.cash_register_balance_end != null && (
                    <>
                      <span className="text-gray-500">Difference:</span>
                      <span
                        className={`font-medium ${
                          payload.cash_register_balance_end -
                            payload.cash_register_balance_start !==
                          0
                            ? 'text-red-600'
                            : 'text-green-600'
                        }`}
                      >
                        {fmt(
                          payload.cash_register_balance_end -
                            payload.cash_register_balance_start,
                        )}
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
                  <p className="mb-1 text-xs font-semibold text-blue-600">Opening Notes</p>
                  <pre className="whitespace-pre-wrap rounded bg-blue-100/50 p-2 font-mono text-xs text-gray-700">
                    {payload.opening_notes}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Verifications */}
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
          {closingReports && (
            <div className="space-y-4">
              {closingReports.salesReport && (
                <div className="rounded-lg bg-green-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-green-700">
                    <DollarSign className="h-3 w-3" />
                    Sales Report
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <span className="text-gray-500">Gross Sales:</span>
                    <span className="font-semibold text-gray-900">
                      {fmt(closingReports.salesReport.grossSales)}
                    </span>
                    {closingReports.salesReport.discountGroups?.map((g: any) => (
                      <span key={g.name} className="contents">
                        <span className="pl-2 text-gray-500">– {g.name}:</span>
                        <span className="font-medium text-red-600">{fmt(g.totalAmount)}</span>
                      </span>
                    ))}
                    {closingReports.salesReport.refundClaims > 0 && (
                      <>
                        <span className="pl-2 text-gray-500">– Refund Claims:</span>
                        <span className="font-medium text-red-600">
                          {fmt(closingReports.salesReport.refundClaims)}
                        </span>
                      </>
                    )}
                    <span className="mt-1 border-t border-green-200 pt-1.5 text-gray-500">
                      Net Sales:
                    </span>
                    <span className="mt-1 border-t border-green-200 pt-1.5 font-bold text-green-700">
                      {fmt(closingReports.salesReport.netSales)}
                    </span>
                  </div>
                </div>
              )}

              {closingReports.nonCashReport?.methods?.length > 0 && (
                <div className="rounded-lg bg-teal-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-teal-700">
                    <DollarSign className="h-3 w-3" />
                    Non-Cash Report
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {closingReports.nonCashReport.methods.map((m: any) => (
                      <span key={m.name} className="contents">
                        <span className="text-gray-500">{m.name}:</span>
                        <span className="font-medium text-gray-900">{fmt(m.amount)}</span>
                      </span>
                    ))}
                    <span className="mt-1 border-t border-teal-200 pt-1.5 text-gray-500">
                      Total Non-Cash:
                    </span>
                    <span className="mt-1 border-t border-teal-200 pt-1.5 font-bold text-teal-700">
                      {fmt(closingReports.nonCashReport.totalNonCash)}
                    </span>
                  </div>
                </div>
              )}

              {closingReports.cashReport && (
                <div className="rounded-lg bg-blue-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-blue-700">
                    <DollarSign className="h-3 w-3" />
                    Cash Report
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    <span className="text-gray-500">Cash Payments:</span>
                    <span className="font-medium text-gray-900">
                      {fmt(closingReports.cashReport.cashPayments)}
                    </span>
                  </div>
                  <p className="mb-1 mt-3 text-xs font-semibold text-blue-600">Cash In</p>
                  {closingReports.cashReport.cashIns?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {closingReports.cashReport.cashIns.map((c: any, i: number) => (
                        <span key={i} className="contents">
                          <span className="pl-2 text-gray-500">{c.reason}:</span>
                          <span className="font-medium text-green-600">{fmt(c.amount)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="pl-2 text-xs text-gray-400">No cash in found.</p>
                  )}
                  <p className="mb-1 mt-3 text-xs font-semibold text-blue-600">Cash Out</p>
                  {closingReports.cashReport.cashOuts?.length > 0 ? (
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                      {closingReports.cashReport.cashOuts.map((c: any, i: number) => (
                        <span key={i} className="contents">
                          <span className="pl-2 text-gray-500">{c.reason}:</span>
                          <span className="font-medium text-red-600">{fmt(c.amount)}</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="pl-2 text-xs text-gray-400">No cash out found.</p>
                  )}
                </div>
              )}

              {closingReports.closingRegister && (
                <div className="rounded-lg bg-amber-50 p-4">
                  <p className="mb-3 flex items-center gap-1 text-xs font-semibold text-amber-700">
                    <DollarSign className="h-3 w-3" />
                    Closing Register Details
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                    {closingReports.closingRegister.closingCashCounted != null && (
                      <>
                        <span className="text-gray-500">Closing Cash (Counted):</span>
                        <span className="font-medium">
                          {fmt(closingReports.closingRegister.closingCashCounted)}
                        </span>
                      </>
                    )}
                    {closingReports.closingRegister.closingCashExpected != null && (
                      <>
                        <span className="text-gray-500">Closing Cash (Expected):</span>
                        <span className="font-medium">
                          {fmt(closingReports.closingRegister.closingCashExpected)}
                        </span>
                      </>
                    )}
                    {closingReports.closingRegister.closingCashDifference != null && (
                      <>
                        <span className="text-gray-500">Difference:</span>
                        <span
                          className={`font-medium ${
                            closingReports.closingRegister.closingCashDifference !== 0
                              ? 'text-red-600'
                              : 'text-green-600'
                          }`}
                        >
                          {fmt(closingReports.closingRegister.closingCashDifference)}
                        </span>
                      </>
                    )}
                  </div>
                  {closingReports.closingRegister.closingNotes && (
                    <div className="mt-3">
                      <p className="mb-1 text-xs font-semibold text-amber-600">Closing Notes</p>
                      <pre className="whitespace-pre-wrap rounded bg-amber-100/50 p-2 font-mono text-xs text-gray-700">
                        {closingReports.closingRegister.closingNotes}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {session.status === 'closed' && hasPermission(PERMISSIONS.POS_MANAGE_AUDITS) && (
          <div className="border-t px-6 py-4">
            <Button
              onClick={() => setConfirmModalOpen(true)}
              disabled={actionLoading || pendingAuditCount > 0}
              title={pendingAuditCount > 0 ? 'All verifications must be audited first' : undefined}
              className="w-full"
            >
              {actionLoading ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <CheckCircle className="mr-2 h-4 w-4" />
              )}
              {actionLoading ? 'Processing...' : 'Audit Complete'}
            </Button>
          </div>
        )}
        {session.status === 'audit_complete' && session.audited_at && (
          <div className="border-t px-6 py-4">
            <p className="text-sm text-gray-500">Audited on {fmtDateTime(session.audited_at)}</p>
          </div>
        )}

        {/* Confirm audit complete modal (z-[60] stacks above z-50 panel) */}
        <AnimatePresence>
          {confirmModalOpen && (
            <AnimatedModal
              maxWidth="max-w-sm"
              zIndexClass="z-[60]"
              onBackdropClick={actionLoading ? undefined : () => setConfirmModalOpen(false)}
            >
              <div className="p-6">
                <h3 className="text-base font-semibold text-gray-900">Confirm Audit Complete</h3>
                <p className="mt-2 text-sm text-gray-500">
                  Are you sure you want to mark this session as audit complete? This action cannot
                  be undone.
                </p>
                <div className="mt-5 flex justify-end gap-3">
                  <Button
                    variant="secondary"
                    onClick={() => setConfirmModalOpen(false)}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="success"
                    onClick={handleConfirmAuditComplete}
                    disabled={actionLoading}
                  >
                    {actionLoading ? 'Processing...' : 'Confirm'}
                  </Button>
                </div>
              </div>
            </AnimatedModal>
          )}
        </AnimatePresence>
    </div>
  );
}
