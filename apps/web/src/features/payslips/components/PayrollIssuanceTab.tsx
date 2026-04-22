import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { PERMISSIONS, canReviewSubmittedRequest } from '@omnilert/shared';
import { CheckCircle, Clock, FileCog, FileEdit, Plus, Send, UserCheck, XCircle } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Pagination } from '@/shared/components/ui/Pagination';
import { Spinner } from '@/shared/components/ui/Spinner';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import {
  approvePayrollAdjustmentRequest,
  confirmPayrollAdjustmentRequest,
  fetchPayrollAdjustmentRequestDetail,
  fetchPayrollAdjustmentRequests,
  fetchPayrollBranchUsers,
  rejectPayrollAdjustmentRequest,
  updatePayrollAdjustmentProcessing,
} from '@/features/payslips/services/payrollManagement.api';
import { PayrollIssuanceCard } from './PayrollIssuanceCard';
import { PayrollIssuanceCreateModal } from './PayrollIssuanceCreateModal';
import { PayrollIssuanceDetailPanel } from './PayrollIssuanceDetailPanel';
import {
  buildPayrollBranchOptions,
  type PayrollRequestDetailRecord,
  type PayrollRequestRecord,
  type PayrollRequestStatusTab,
} from './payrollIssuance.shared';

const PAGE_SIZE = 10;
const SYNC_LIMIT = 200;

const STATUS_TABS: ViewOption<PayrollRequestStatusTab>[] = [
  { id: 'all', label: 'All', icon: FileCog },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'processing', label: 'Processing', icon: FileEdit },
  { id: 'employee_approval', label: 'Employee Approval', icon: UserCheck },
  { id: 'in_progress', label: 'In Progress', icon: Send },
  { id: 'completed', label: 'Completed', icon: CheckCircle },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

function getErrorMessage(error: unknown, fallback: string): string {
  const axiosErr = error as { response?: { data?: { error?: string; message?: string } } };
  return (
    axiosErr?.response?.data?.error ??
    axiosErr?.response?.data?.message ??
    (error instanceof Error ? error.message : fallback)
  );
}

function IssuanceSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-10 w-16 rounded-full bg-gray-200" />
            <div className="h-4 w-40 rounded bg-gray-200" />
          </div>
          <div className="h-3 w-24 rounded bg-gray-100" />
          <div className="h-3 w-28 rounded bg-gray-100" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-5 w-20 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

export function PayrollIssuanceTab() {
  const { hasPermission } = usePermission();
  const { error: showError, success: showSuccess } = useAppToast();
  const currentUser = useAuthStore((state) => state.user);
  const {
    companyBranchGroups,
    selectedBranchIds,
    branches,
    loading: branchesLoading,
  } = useBranchStore();

  const canIssue = hasPermission(PERMISSIONS.PAYSLIPS_ISSUE);
  const canManage = hasPermission(PERMISSIONS.PAYSLIPS_MANAGE);

  const [requests, setRequests] = useState<PayrollRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState<PayrollRequestStatusTab>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<PayrollRequestDetailRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [branchUsers, setBranchUsers] = useState<GroupedUsersResponse | null>(null);
  const [branchUsersLoading, setBranchUsersLoading] = useState(false);
  const [branchUsersByKey, setBranchUsersByKey] = useState<Record<string, GroupedUsersResponse>>({});

  const availableBranchGroups = useMemo(() => {
    const selectedBranchIdSet = new Set(selectedBranchIds);
    return companyBranchGroups
      .map((group) => ({
        ...group,
        branches: group.branches.filter((branch) => selectedBranchIdSet.has(branch.id)),
      }))
      .filter((group) => group.branches.length > 0);
  }, [companyBranchGroups, selectedBranchIds]);

  const availableBranches = useMemo(
    () => buildPayrollBranchOptions(availableBranchGroups),
    [availableBranchGroups],
  );

  const refreshRequests = useCallback(async () => {
    if (branchesLoading) return;
    if (branches.length === 0) {
      setRequests([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    const selectedBranchIdSet = new Set(selectedBranchIds);
    const selectedBranches = branches.filter(
      (branch) => selectedBranchIdSet.size === 0 || selectedBranchIdSet.has(branch.id),
    );

    const branchIdsByCompany = new Map<string, string[]>();
    for (const branch of selectedBranches) {
      const companyBranchIds = branchIdsByCompany.get(branch.companyId) ?? [];
      companyBranchIds.push(branch.id);
      branchIdsByCompany.set(branch.companyId, companyBranchIds);
    }

    try {
      const results = await Promise.allSettled(
        Array.from(branchIdsByCompany.entries()).map(([companyId, branchIds]) =>
          fetchPayrollAdjustmentRequests({
            companyId,
            status: statusTab === 'all' ? undefined : statusTab,
            branchIds,
            page: 1,
            limit: SYNC_LIMIT,
          }),
        ),
      );

      const merged: PayrollRequestRecord[] = [];
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        merged.push(...result.value.items);
      }

      const deduped = Array.from(
        new Map(merged.map((request) => [request.id, request])).values(),
      ).sort(
        (left, right) =>
          new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime(),
      );

      setRequests(deduped);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to load payroll adjustment requests.'));
    } finally {
      setLoading(false);
    }
  }, [branchesLoading, branches, selectedBranchIds, showError, statusTab]);

  useEffect(() => {
    void refreshRequests();
  }, [refreshRequests]);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
    setSelectedRequestDetail(null);
  }, [statusTab, selectedBranchIds]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedRequestDetail(null);
      setBranchUsers(null);
      setBranchUsersLoading(false);
      return;
    }

    const partial = requests.find((request) => request.id === selectedId);
    if (!partial) return;

    let active = true;
    setDetailLoading(true);
    setBranchUsers(null);

    void fetchPayrollAdjustmentRequestDetail({
      companyId: partial.companyId,
      requestId: partial.id,
    })
      .then((detail) => {
        if (!active) return;
        setSelectedRequestDetail(detail);
      })
      .catch((error: unknown) => {
        if (!active) return;
        showError(getErrorMessage(error, 'Failed to load payroll adjustment details.'));
        setSelectedId(null);
        setSelectedRequestDetail(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, showError]);

  const canEditProcessing = Boolean(
    selectedRequestDetail
      && canManage
      && selectedRequestDetail.status === 'processing'
      && selectedRequestDetail.processingOwnerUserId === currentUser?.id,
  );

  useEffect(() => {
    if (!selectedRequestDetail || !canEditProcessing) {
      setBranchUsers(null);
      setBranchUsersLoading(false);
      return;
    }

    const cacheKey = `${selectedRequestDetail.companyId}:${selectedRequestDetail.branchId}`;
    const cached = branchUsersByKey[cacheKey];
    if (cached) {
      setBranchUsers(cached);
      return;
    }

    let active = true;
    setBranchUsersLoading(true);

    void fetchPayrollBranchUsers({
      branchId: selectedRequestDetail.branchId,
      companyId: selectedRequestDetail.companyId,
    })
      .then((response) => {
        if (!active) return;
        setBranchUsersByKey((prev) => ({ ...prev, [cacheKey]: response }));
        setBranchUsers(response);
      })
      .catch((error: unknown) => {
        if (!active) return;
        showError(getErrorMessage(error, 'Failed to load branch users.'));
        setBranchUsers({ management: [], service_crew: [], other: [] });
      })
      .finally(() => {
        if (active) setBranchUsersLoading(false);
      });

    return () => {
      active = false;
    };
  }, [branchUsersByKey, canEditProcessing, selectedRequestDetail, showError]);

  const totalPages = Math.max(1, Math.ceil(requests.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedRequests = requests.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const selectedRequest = requests.find((request) => request.id === selectedId) ?? null;

  const canConfirmSelected = Boolean(
    selectedRequestDetail
      && canManage
      && selectedRequestDetail.status === 'pending'
      && currentUser?.id
      && canReviewSubmittedRequest({
        actingUserId: currentUser.id,
        requestUserId: selectedRequestDetail.createdByUserId,
      }),
  );

  const canRejectSelected = Boolean(
    selectedRequestDetail
      && (
        (selectedRequestDetail.status === 'pending' && canConfirmSelected)
        || (selectedRequestDetail.status === 'processing' && canEditProcessing)
      ),
  );

  const handleClosePanel = useCallback(() => {
    setSelectedId(null);
    setSelectedRequestDetail(null);
    setBranchUsers(null);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!selectedRequestDetail) return;

    setActionLoading(true);
    try {
      await confirmPayrollAdjustmentRequest({
        companyId: selectedRequestDetail.companyId,
        requestId: selectedRequestDetail.id,
      });
      showSuccess('Payroll adjustment moved to Processing.');
      const [updated] = await Promise.all([
        fetchPayrollAdjustmentRequestDetail({
          companyId: selectedRequestDetail.companyId,
          requestId: selectedRequestDetail.id,
        }),
        refreshRequests(),
      ]);
      setSelectedRequestDetail(updated);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to confirm payroll adjustment.'));
    } finally {
      setActionLoading(false);
    }
  }, [refreshRequests, selectedRequestDetail, showError, showSuccess]);

  const handleReject = useCallback(async (reason: string) => {
    if (!selectedRequestDetail) return;

    setActionLoading(true);
    try {
      await rejectPayrollAdjustmentRequest({
        companyId: selectedRequestDetail.companyId,
        requestId: selectedRequestDetail.id,
        payload: { reason },
      });
      showSuccess('Payroll adjustment rejected.');
      handleClosePanel();
      await refreshRequests();
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to reject payroll adjustment.'));
    } finally {
      setActionLoading(false);
    }
  }, [handleClosePanel, refreshRequests, selectedRequestDetail, showError, showSuccess]);

  const handleApprove = useCallback(async (payload: {
    targetUserIds: string[];
    totalAmount: number;
    payrollPeriods: number;
  }) => {
    if (!selectedRequestDetail) return;

    setActionLoading(true);
    try {
      await updatePayrollAdjustmentProcessing({
        companyId: selectedRequestDetail.companyId,
        requestId: selectedRequestDetail.id,
        payload,
      });
      await approvePayrollAdjustmentRequest({
        companyId: selectedRequestDetail.companyId,
        requestId: selectedRequestDetail.id,
      });
      showSuccess('Payroll adjustment sent for employee authorization.');
      const [updated] = await Promise.all([
        fetchPayrollAdjustmentRequestDetail({
          companyId: selectedRequestDetail.companyId,
          requestId: selectedRequestDetail.id,
        }),
        refreshRequests(),
      ]);
      setSelectedRequestDetail(updated);
    } catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to approve payroll adjustment.'));
    } finally {
      setActionLoading(false);
    }
  }, [refreshRequests, selectedRequestDetail, showError, showSuccess]);

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={(tab) => {
              setStatusTab(tab);
              setPage(1);
              setSelectedId(null);
            }}
            layoutId="payroll-issuance-status-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />

          {canIssue ? (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="flex shrink-0 items-center gap-1.5"
              disabled={availableBranches.length === 0}
              onClick={() => {
                setSelectedId(null);
                setCreateModalOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Create Request
            </Button>
          ) : null}
        </div>

        {loading || branchesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <IssuanceSkeleton key={index} />
            ))}
          </div>
        ) : paginatedRequests.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Send className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              No payroll adjustment requests found.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedRequests.map((request) => (
              <PayrollIssuanceCard
                key={request.id}
                request={request}
                selected={selectedId === request.id}
                onClick={setSelectedId}
              />
            ))}

            {totalPages > 1 ? (
              <div className="border-t border-gray-100 pt-4">
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                />
              </div>
            ) : null}
          </div>
        )}
      </div>

      <PayrollIssuanceCreateModal
        open={createModalOpen}
        branches={availableBranches}
        branchGroups={availableBranchGroups}
        onClose={() => setCreateModalOpen(false)}
        onSubmitted={() => {
          setCreateModalOpen(false);
          setStatusTab('pending');
          setPage(1);
          void refreshRequests();
        }}
      />

      {createPortal(
        <>
          <AnimatePresence>
            {selectedId ? (
              <motion.div
                key="payroll-issuance-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />
            ) : null}
          </AnimatePresence>

          <AnimatePresence>
            {selectedId ? (
              <motion.div
                key={selectedId}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] shadow-2xl"
              >
                {detailLoading || !selectedRequestDetail ? (
                  <div className="flex h-full items-center justify-center bg-white">
                    <div className="flex items-center gap-3 text-sm text-gray-500">
                      <Spinner size="sm" />
                      Loading payroll adjustment...
                    </div>
                  </div>
                ) : (
                  <PayrollIssuanceDetailPanel
                    request={selectedRequestDetail}
                    groupedUsers={branchUsers}
                    groupedUsersLoading={branchUsersLoading}
                    actionLoading={actionLoading}
                    onClose={handleClosePanel}
                    onConfirm={canConfirmSelected ? handleConfirm : undefined}
                    onApprove={canEditProcessing ? handleApprove : undefined}
                    onReject={canRejectSelected ? handleReject : undefined}
                  />
                )}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
