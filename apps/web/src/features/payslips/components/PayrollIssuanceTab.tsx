import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Clock, Plus, Send, XCircle } from 'lucide-react';
import { PERMISSIONS } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import { PayrollIssuanceCard } from './PayrollIssuanceCard';
import { PayrollIssuanceCreateModal } from './PayrollIssuanceCreateModal';
import { PayrollIssuanceDetailPanel } from './PayrollIssuanceDetailPanel';
import {
  buildPayrollBranchOptions,
  createPayrollMockEmployees,
  createPayrollSeedRequests,
  type PayrollRequestRecord,
  type PayrollRequestStatus,
} from './payrollIssuance.shared';

const PAGE_SIZE = 10;

const STATUS_TABS: ViewOption<PayrollRequestStatus>[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'approved', label: 'Approved', icon: CheckCircle },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

function IssuanceSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 rounded-full bg-gray-200" />
            <div className="h-6 w-6 rounded-full bg-gray-200" />
            <div className="h-4 w-32 rounded bg-gray-200" />
          </div>
          <div className="h-3 w-20 rounded bg-gray-100" />
          <div className="h-3 w-24 rounded bg-gray-100" />
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <div className="h-4 w-20 rounded bg-gray-200" />
          <div className="h-5 w-16 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

export function PayrollIssuanceTab() {
  const { hasPermission } = usePermission();
  const currentUser = useAuthStore((state) => state.user);
  const {
    companyBranchGroups,
    selectedBranchIds,
    loading: branchesLoading,
  } = useBranchStore();

  const canIssue = hasPermission(PERMISSIONS.PAYSLIPS_ISSUE);
  const submittedByName = [currentUser?.firstName, currentUser?.lastName].filter(Boolean).join(' ') || 'Payroll Team';

  const [createdRequests, setCreatedRequests] = useState<PayrollRequestRecord[]>([]);
  const [page, setPage] = useState(1);
  const [statusTab, setStatusTab] = useState<PayrollRequestStatus>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);

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

  const employees = useMemo(
    () => createPayrollMockEmployees(availableBranches),
    [availableBranches],
  );

  const seededRequests = useMemo(
    () => createPayrollSeedRequests(employees, submittedByName),
    [employees, submittedByName],
  );

  const allRequests = useMemo(
    () => [...createdRequests, ...seededRequests],
    [createdRequests, seededRequests],
  );

  const filteredRequests = useMemo(() => {
    const availableBranchIds = new Set(availableBranches.map((branch) => branch.id));
    return allRequests.filter(
      (request) => request.status === statusTab && availableBranchIds.has(request.branchId),
    );
  }, [allRequests, availableBranches, statusTab]);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [statusTab, selectedBranchIds]);

  const totalPages = Math.max(1, Math.ceil(filteredRequests.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const paginatedRequests = filteredRequests.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const selectedRequest = allRequests.find((request) => request.id === selectedId) ?? null;

  const handleTabChange = useCallback((tab: PayrollRequestStatus) => {
    setStatusTab(tab);
    setPage(1);
    setSelectedId(null);
  }, []);

  const handlePageChange = useCallback((nextPage: number) => {
    setPage(nextPage);
    setSelectedId(null);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedId(null);
  }, []);

  const handleSubmitted = useCallback((requests: PayrollRequestRecord[]) => {
    setCreatedRequests((prev) => [...requests, ...prev]);
    setStatusTab('pending');
    setPage(1);
    setSelectedId(null);
    setCreateModalOpen(false);
  }, []);

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={handleTabChange}
            layoutId="payroll-issuance-status-tabs"
            className="sm:flex-1"
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

        {branchesLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <IssuanceSkeleton key={index} />
            ))}
          </div>
        ) : paginatedRequests.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Send className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              No {statusTab} payroll requests found.
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
                  onPageChange={handlePageChange}
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
        submittedByName={submittedByName}
        onClose={() => setCreateModalOpen(false)}
        onSubmitted={handleSubmitted}
      />

      {createPortal(
        <>
          <AnimatePresence>
            {selectedRequest ? (
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
            {selectedRequest ? (
              <motion.div
                key={selectedRequest.id}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] shadow-2xl"
              >
                <PayrollIssuanceDetailPanel
                  request={selectedRequest}
                  onClose={handleClosePanel}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>,
        document.body,
      )}
    </>
  );
}
