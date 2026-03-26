import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import {
  Building2,
  CheckCircle,
  ChevronRight,
  Clock,
  GitBranch,
} from 'lucide-react';
import { Card, CardBody, CardFooter, CardHeader } from '@/shared/components/ui/Card';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { usePermission } from '@/shared/hooks/usePermission';
import { api } from '@/shared/services/api.client';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { PERMISSIONS } from '@omnilert/shared';
import { fmtDateTime, statusVariant, VERIFICATION_TYPE_CONFIG } from '../utils/posHelpers';

interface BranchInfo {
  companyName: string;
  branchName: string;
}

interface SessionCardProps {
  session: any;
  branchInfo?: BranchInfo;
  onUpdate: () => void;
  onOpenDetail: () => void;
}

export function SessionCard({ session, branchInfo, onUpdate, onOpenDetail }: SessionCardProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { hasPermission } = usePermission();

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
      showSuccessToast('Session marked as audit complete.');
      onUpdate();
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error || 'Failed to complete session audit');
    } finally {
      setActionLoading(false);
    }
  };

  const HIDDEN_PILL_TYPES = new Set(['cf_breakdown', 'pcf_breakdown', 'closing_pcf_breakdown']);

  // Build list of verification type counts for the card body
  const verificationTypeCounts = session.verifications
    ? Object.entries(VERIFICATION_TYPE_CONFIG)
        .filter(([type]) => !HIDDEN_PILL_TYPES.has(type))
        .map(([type, config]) => {
          const count = session.verifications.filter((v: any) => v.verification_type === type)
            .length;
          return count > 0 ? { type, label: config.label, badgeClass: config.badgeClass, count } : null;
        })
        .filter(Boolean)
    : [];

  return (
    <>
      <div
        className="group cursor-pointer"
        onClick={onOpenDetail}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onOpenDetail()}
      >
        <Card className="h-full transition-shadow group-hover:shadow-md">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-semibold text-gray-900">
                  {session.session_name || `Session ${session.odoo_session_id}`}
                </h3>

                {/* Company + Branch */}
                {branchInfo && (
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Building2 className="h-3 w-3 shrink-0" />
                      {branchInfo.companyName}
                    </span>
                    <span className="flex items-center gap-1 text-primary-600">
                      <GitBranch className="h-3 w-3 shrink-0" />
                      {branchInfo.branchName}
                    </span>
                  </div>
                )}

                {/* Times */}
                <div className="mt-1.5 space-y-0.5 text-xs text-gray-400">
                  {session.opened_at && (
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 shrink-0" />
                      Opened: {fmtDateTime(session.opened_at)}
                    </div>
                  )}
                  {session.closed_at && (
                    <div>Closed: {fmtDateTime(session.closed_at)}</div>
                  )}
                  {session.audited_at && (
                    <div>Audited: {fmtDateTime(session.audited_at)}</div>
                  )}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Badge variant={statusVariant(session.status)}>
                  {session.status === 'audit_complete'
                    ? 'Audited'
                    : session.status.replace('_', ' ')}
                </Badge>
                {pendingAuditCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                    <Clock className="h-3 w-3" />
                    {pendingAuditCount} pending audit{pendingAuditCount > 1 ? 's' : ''}
                  </span>
                )}
                <ChevronRight className="mt-1 h-4 w-4 text-gray-300 group-hover:text-gray-500" />
              </div>
            </div>
          </CardHeader>

          {verificationTypeCounts.length > 0 && (
            <CardBody>
              <div className="flex flex-wrap gap-1.5">
                {verificationTypeCounts.map((item: any) => (
                  <span
                    key={item.type}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${item.badgeClass}`}
                  >
                    {item.count} {item.label}
                  </span>
                ))}
              </div>
            </CardBody>
          )}

          {session.status === 'closed' &&
            hasPermission(PERMISSIONS.POS_MANAGE_AUDITS) && (
              <CardFooter>
                <Button
                  onClick={handleAuditComplete}
                  disabled={actionLoading || pendingAuditCount > 0}
                  title={
                    pendingAuditCount > 0
                      ? 'All verifications must be audited first'
                      : undefined
                  }
                  className="w-full"
                  size="sm"
                >
                  <CheckCircle className="mr-1.5 h-3.5 w-3.5" />
                  {actionLoading ? 'Processing...' : 'Audit Complete'}
                </Button>
              </CardFooter>
            )}
        </Card>
      </div>

      <AnimatePresence>
        {confirmModalOpen && (
          <AnimatedModal
            maxWidth="max-w-sm"
            onBackdropClick={actionLoading ? undefined : () => setConfirmModalOpen(false)}
          >
            <div className="p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-semibold text-gray-900">Confirm Audit Complete</h3>
              <p className="mt-2 text-sm text-gray-500">
                Are you sure you want to mark this session as audit complete? This action cannot
                be undone.
              </p>
              <div className="mt-5 flex justify-end gap-3">
                <Button
                  variant="secondary"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmModalOpen(false);
                  }}
                  disabled={actionLoading}
                >
                  Cancel
                </Button>
                <Button
                  variant="success"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleConfirmAuditComplete();
                  }}
                  disabled={actionLoading}
                >
                  {actionLoading ? 'Processing...' : 'Confirm'}
                </Button>
              </div>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>
    </>
  );
}
