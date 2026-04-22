import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle, Clock, LayoutGrid, Plus, Send, XCircle } from 'lucide-react';
import { PERMISSIONS } from '@omnilert/shared';
import type { TokenPayIssuanceRequest } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { Pagination } from '@/shared/components/ui/Pagination';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { usePermission } from '@/shared/hooks/usePermission';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { fetchIssuanceRequests } from '../services/tokenPayManagement.api';
import { TokenPayIssuanceCard } from './TokenPayIssuanceCard';
import { TokenPayIssuanceDetailPanel } from './TokenPayIssuanceDetailPanel';
import { TokenPayIssueModal } from './TokenPayIssueModal';

// ── Status tabs ───────────────────────────────────────────────────────────────

type StatusTab = 'all' | 'pending' | 'completed' | 'rejected';

const STATUS_TABS = [
  { id: 'all' as StatusTab,       label: 'All',      icon: LayoutGrid  },
  { id: 'pending' as StatusTab,   label: 'Pending',  icon: Clock       },
  { id: 'completed' as StatusTab, label: 'Approved', icon: CheckCircle },
  { id: 'rejected' as StatusTab,  label: 'Rejected', icon: XCircle     },
];

const PAGE_SIZE = 10;

// ── Skeleton ──────────────────────────────────────────────────────────────────

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

// ── Main component ────────────────────────────────────────────────────────────

export function TokenPayIssuanceTab() {
  const { hasPermission } = usePermission();
  const { error: showError } = useAppToast();

  const canIssue = hasPermission(PERMISSIONS.TOKEN_PAY_ISSUE);

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<TokenPayIssuanceRequest[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusTab, setStatusTab] = useState<StatusTab>('pending');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [issueModalOpen, setIssueModalOpen] = useState(false);

  const loadRequests = useCallback(
    async (tab: StatusTab, pg: number) => {
      setLoading(true);
      try {
        const result = await fetchIssuanceRequests({
          status: tab === 'all' ? undefined : tab,
          page: pg,
          limit: PAGE_SIZE,
        });
        setItems(result.items);
        setTotalPages(result.pagination.totalPages);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load issuance requests';
        showError(message);
      } finally {
        setLoading(false);
      }
    },
    [showError],
  );

  useEffect(() => {
    void loadRequests(statusTab, page);
  }, [loadRequests, statusTab, page]);

  const handleTabChange = useCallback((tab: StatusTab) => {
    setStatusTab(tab);
    setPage(1);
    setSelectedId(null);
  }, []);

  const handlePageChange = useCallback((pg: number) => {
    setPage(pg);
    setSelectedId(null);
  }, []);

  const handleClosePanel = useCallback(() => setSelectedId(null), []);

  const handleUpdated = useCallback((updated: TokenPayIssuanceRequest) => {
    setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
  }, []);

  const handleIssueSubmitted = useCallback(() => {
    // Reload the pending tab to show the new request
    if (statusTab === 'pending') {
      void loadRequests('pending', 1);
      setPage(1);
    } else {
      setStatusTab('pending');
      setPage(1);
    }
  }, [statusTab, loadRequests]);

  const selectedRequest = useMemo(
    () => items.find((r) => r.id === selectedId) ?? null,
    [items, selectedId],
  );

  return (
    <>
      <div className="space-y-4">
        {/* Top bar: status tabs + issue button */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={handleTabChange}
            layoutId="issuance-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />

          {canIssue && (
            <Button
              type="button"
              variant="primary"
              size="sm"
              className="flex shrink-0 items-center gap-1.5"
              onClick={() => setIssueModalOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Issue Token Pay
            </Button>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <IssuanceSkeleton key={i} />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Send className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              {statusTab === 'all'
                ? 'No issuance requests yet.'
                : `No ${statusTab === 'completed' ? 'approved' : statusTab} requests found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((request) => (
              <TokenPayIssuanceCard
                key={request.id}
                request={request}
                selected={selectedId === request.id}
                onClick={setSelectedId}
              />
            ))}

            {totalPages > 1 && (
              <div className="border-t border-gray-100 pt-4">
                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Portaled detail panel */}
      {createPortal(
        <>
          <AnimatePresence>
            {selectedRequest && (
              <motion.div
                key="issuance-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />
            )}
          </AnimatePresence>

          <AnimatePresence>
            {selectedRequest && (
              <motion.div
                key={selectedRequest.id}
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[520px] shadow-2xl"
              >
                <TokenPayIssuanceDetailPanel
                  request={selectedRequest}
                  onClose={handleClosePanel}
                  onUpdated={handleUpdated}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </>,
        document.body,
      )}

      {/* Issue / Deduct modal */}
      <TokenPayIssueModal
        open={issueModalOpen}
        onClose={() => setIssueModalOpen(false)}
        onSubmitted={handleIssueSubmitted}
      />
    </>
  );
}
