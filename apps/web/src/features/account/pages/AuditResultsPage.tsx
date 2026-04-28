import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, type Variants } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import type {
  AccountAuditResultDetail,
  AccountAuditResultListItem,
  ListAccountAuditResultsResponse,
} from '@omnilert/shared';
import { GitBranch, X } from 'lucide-react';
import { Spinner } from '../../../shared/components/ui/Spinner';
import { useAppToast } from '../../../shared/hooks/useAppToast';
import { useBranchStore } from '../../../shared/store/branchStore';
import { api } from '../../../shared/services/api.client';
import { resolveStoreAuditPaginationState } from '../../store-audits/pages/storeAuditPagination';
import { AuditResultsPageContent } from '../components/AuditResultsPageContent';
import { AccountAuditResultDetailPanel } from '../components/AccountAuditResultDetailPanel';

const PAGE_SIZE = 10;

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function AuditResultsPage() {
  const { error: showErrorToast } = useAppToast();
  const { selectedBranchIds } = useBranchStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialId = searchParams.get('id');

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AccountAuditResultListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(initialId);
  const [selectedAudit, setSelectedAudit] = useState<AccountAuditResultDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const isFirstRender = React.useRef(true);

  const paginationState = useMemo(
    () => resolveStoreAuditPaginationState({ page, pageSize, total }),
    [page, pageSize, total],
  );

  useEffect(() => {
    let active = true;

    const fetchAuditResults = async () => {
      setLoading(true);
      try {
        const response = await api.get('/account/audit-results', {
          params: {
            branchIds: selectedBranchIds.length > 0 ? selectedBranchIds.join(',') : undefined,
            page,
            pageSize: PAGE_SIZE,
          },
        });

        if (!active) return;

        const data = response.data.data as ListAccountAuditResultsResponse;
        const nextPageSize = Math.max(1, Number(data.pageSize ?? PAGE_SIZE));
        const nextTotal = Math.max(0, Number(data.total ?? 0));
        const resolvedPage = resolveStoreAuditPaginationState({
          page,
          pageSize: nextPageSize,
          total: nextTotal,
        }).page;

        setPageSize(nextPageSize);
        setTotal(nextTotal);

        if (resolvedPage !== page) {
          setPage(resolvedPage);
          return;
        }

        setItems(data.items ?? []);
      } catch (err: unknown) {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string } } };
        showErrorToast(axiosErr.response?.data?.error ?? 'Failed to load audit results');
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void fetchAuditResults();

    return () => {
      active = false;
    };
  }, [page, selectedBranchIds, showErrorToast]);

  /** Reset to page 1 when branch selection changes. Skip on first render. */
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
    // Note: We no longer automatically clear selectedAuditId here to allow
    // deep links to persist even if branch filters are being initialized
    // or changed. The user can manually close the detail panel.
  }, [selectedBranchIds]);

  useEffect(() => {
    if (!selectedAuditId) {
      setSelectedAudit(null);
      return;
    }

    let active = true;
    setDetailLoading(true);

    void api.get(`/account/audit-results/${selectedAuditId}`)
      .then((response) => {
        if (!active) return;
        setSelectedAudit(response.data.data as AccountAuditResultDetail);
      })
      .catch((err: unknown) => {
        if (!active) return;
        const axiosErr = err as { response?: { data?: { error?: string } } };
        setSelectedAuditId(null);
        setSelectedAudit(null);
        showErrorToast(axiosErr.response?.data?.error ?? 'Failed to load audit result');
      })
      .finally(() => {
        if (active) {
          setDetailLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedAuditId, showErrorToast]);

  // Sync selectedAuditId to URL search params
  useEffect(() => {
    if (selectedAuditId) {
      setSearchParams((prev) => {
        prev.set('id', selectedAuditId);
        return prev;
      }, { replace: true });
    } else {
      setSearchParams((prev) => {
        prev.delete('id');
        return prev;
      }, { replace: true });
    }
  }, [selectedAuditId, setSearchParams]);

  const containerVariant: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } };
  const sectionVariant: Variants = { hidden: { opacity: 0, y: 16 }, visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' } } };

  const currentPage = paginationState.page;
  const totalPages = paginationState.totalPages;

  return (
    <motion.div initial="hidden" animate="visible" variants={containerVariant}>
      <motion.div variants={sectionVariant}>
      <AuditResultsPageContent
        loading={loading}
        items={items}
        total={total}
        selectedAuditId={selectedAuditId}
        currentPage={currentPage}
        totalPages={totalPages}
        onSelectAudit={(auditId) => {
          setSelectedAuditId(auditId);
        }}
        onPageChange={(p) => {
          setPage(p);
          setSelectedAuditId(null);
        }}
      />
      </motion.div>

      {/* Detail Panel via Portal */}
      {createPortal(
        <AnimatePresence>
          {selectedAuditId && (
            <>
              {/* Side panel backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={() => setSelectedAuditId(null)}
              />

              {/* Side panel */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
                className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl"
              >
                <div className="flex h-full flex-col">
                  {/* Panel header */}
                  <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                    <div>
                      <p className="text-lg font-semibold text-gray-900">
                        {selectedAudit?.type_label ?? 'Audit Result'}
                      </p>
                      {selectedAudit && (
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                          <GitBranch className="h-3 w-3 shrink-0" />
                          {selectedAudit.branch.name}
                          {selectedAudit.company?.name && (
                            <>
                              <span className="text-gray-300">·</span>
                              {selectedAudit.company.name}
                            </>
                          )}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedAuditId(null)}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  {detailLoading || !selectedAudit ? (
                    <div className="flex flex-1 items-center justify-center">
                      <Spinner size="lg" />
                    </div>
                  ) : (
                    <AccountAuditResultDetailPanel audit={selectedAudit} />
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
