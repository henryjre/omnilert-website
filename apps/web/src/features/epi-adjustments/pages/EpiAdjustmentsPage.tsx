import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CircleCheck, Clock, LayoutGrid, Plus, Star, XCircle } from 'lucide-react';
import { PERMISSIONS } from '@omnilert/shared';
import type { RewardRequestDetail, RewardRequestStatus, RewardRequestSummary } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ViewToggle, type ViewOption } from '@/shared/components/ui/ViewToggle';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { usePermission } from '@/shared/hooks/usePermission';
import { useBranchStore } from '@/shared/store/branchStore';
import { EpiAdjustmentCreateModal } from '../components/EpiAdjustmentCreateModal';
import { EpiAdjustmentDetailPanel } from '../components/EpiAdjustmentDetailPanel';
import { EpiAdjustmentRequestCard } from '../components/EpiAdjustmentRequestCard';
import { getApiErrorMessage } from '../components/epiAdjustmentFormatters';
import { fetchRewardRequestDetail, fetchRewardRequests } from '../services/epiAdjustments.api';

type StatusTab = 'all' | RewardRequestStatus;

const PAGE_SIZE = 10;

const STATUS_TABS: ViewOption<StatusTab>[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'pending', label: 'Pending', icon: Clock },
  { id: 'approved', label: 'Approved', icon: CircleCheck },
  { id: 'rejected', label: 'Rejected', icon: XCircle },
];

function EpiAdjustmentSkeleton() {
  return (
    <div className="w-full animate-pulse rounded-xl border border-gray-200 bg-white px-4 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 gap-2">
          <div className="h-9 w-9 rounded-full bg-gray-200" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-36 rounded bg-gray-200" />
            <div className="h-3 w-24 rounded bg-gray-100" />
            <div className="h-3 w-full rounded bg-gray-100" />
          </div>
        </div>
        <div className="h-5 w-20 rounded-full bg-gray-200" />
      </div>
    </div>
  );
}

export function EpiAdjustmentsPage() {
  const { hasPermission } = usePermission();
  const { error: showError } = useAppToast();
  const {
    branches,
    selectedBranchIds,
    loading: branchesLoading,
    fetchBranches,
  } = useBranchStore();
  const canIssue = hasPermission(PERMISSIONS.REWARDS_ISSUE);

  const [items, setItems] = useState<RewardRequestSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchContextRequested, setBranchContextRequested] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<RewardRequestDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (branches.length > 0 || branchesLoading || branchContextRequested) return;
    setBranchContextRequested(true);
    void fetchBranches();
  }, [branchContextRequested, branches.length, branchesLoading, fetchBranches]);

  const selectedCompanyId = useMemo(() => {
    const selectedBranch =
      selectedBranchIds
        .map((branchId) => branches.find((branch) => branch.id === branchId))
        .find((branch) => branch !== undefined) ?? branches[0];
    return selectedBranch?.companyId ?? null;
  }, [branches, selectedBranchIds]);

  const branchContextReady = branches.length > 0 || (branchContextRequested && !branchesLoading);

  const loadRequests = useCallback(async (tab: StatusTab, nextPage: number, companyId?: string | null) => {
    setLoading(true);
    try {
      const result = await fetchRewardRequests({
        companyId,
        status: tab === 'all' ? undefined : tab,
        page: nextPage,
        limit: PAGE_SIZE,
      });
      setItems(result.items);
      setTotalPages(result.pagination.totalPages);
    } catch (error: unknown) {
      showError(getApiErrorMessage(error, 'Failed to load reward requests.'));
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    if (!branchContextReady) {
      setLoading(true);
      return;
    }
    void loadRequests(statusTab, page, selectedCompanyId);
  }, [branchContextReady, loadRequests, page, selectedCompanyId, statusTab]);

  useEffect(() => {
    setPage(1);
    setSelectedId(null);
  }, [selectedCompanyId]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }

    let active = true;
    setDetailLoading(true);
    fetchRewardRequestDetail(selectedId, selectedCompanyId)
      .then((detail) => {
        if (active) setSelectedDetail(detail);
      })
      .catch((error: unknown) => {
        if (!active) return;
        showError(getApiErrorMessage(error, 'Failed to load reward details.'));
        setSelectedId(null);
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedCompanyId, selectedId, showError]);

  const handleTabChange = useCallback((tab: StatusTab) => {
    setStatusTab(tab);
    setPage(1);
    setSelectedId(null);
  }, []);

  const handleUpdated = useCallback((updated: RewardRequestDetail) => {
    setSelectedDetail(updated);
    const belongsInCurrentTab = statusTab === 'all' || updated.status === statusTab;
    setItems((prev) => {
      if (!belongsInCurrentTab) {
        return prev.filter((item) => item.id !== updated.id);
      }
      return prev.map((item) => (item.id === updated.id ? updated : item));
    });
    if (!belongsInCurrentTab) {
      void loadRequests(statusTab, page, selectedCompanyId);
    }
  }, [loadRequests, page, selectedCompanyId, statusTab]);

  const handleSubmitted = useCallback(() => {
    if (statusTab === 'pending') {
      setPage(1);
      void loadRequests('pending', 1, selectedCompanyId);
      return;
    }
    setStatusTab('pending');
    setPage(1);
  }, [loadRequests, selectedCompanyId, statusTab]);

  const showEmptyState = useMemo(() => !loading && items.length === 0, [items.length, loading]);

  return (
    <>
      <div className="space-y-5">
        <div>
          <div className="flex items-center gap-3">
            <Star className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">EPI Adjustment</h1>
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Submit and approve recognition requests that adjust official EPI.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={handleTabChange}
            layoutId="epi-adjustments-status-tabs"
            labelAboveOnMobile
          />
          {canIssue && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="w-full gap-1.5 whitespace-nowrap sm:w-44"
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Create Adjustment
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <EpiAdjustmentSkeleton key={index} />
            ))}
          </div>
        ) : showEmptyState ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Star className="h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-sm text-gray-400">
              {statusTab === 'all' ? 'No EPI adjustment requests yet.' : `No ${statusTab} EPI adjustment requests found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((request) => (
              <EpiAdjustmentRequestCard
                key={request.id}
                request={request}
                selected={selectedId === request.id}
                onClick={setSelectedId}
              />
            ))}

            {totalPages > 1 && (
              <div className="border-t border-gray-100 pt-4">
                <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
              </div>
            )}
          </div>
        )}
      </div>

      {createPortal(
        <>
          <AnimatePresence>
            {selectedId && (
              <motion.div
                key="reward-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={() => setSelectedId(null)}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedId && (
              <motion.div
                key={selectedId}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] shadow-2xl"
              >
                {selectedDetail && !detailLoading ? (
                  <EpiAdjustmentDetailPanel
                    request={selectedDetail}
                    onClose={() => setSelectedId(null)}
                    onUpdated={handleUpdated}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center bg-white text-sm text-gray-400">
                    Loading details...
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}

      <EpiAdjustmentCreateModal
        open={createOpen}
        companyId={selectedCompanyId}
        onClose={() => setCreateOpen(false)}
        onSubmitted={handleSubmitted}
      />
    </>
  );
}
