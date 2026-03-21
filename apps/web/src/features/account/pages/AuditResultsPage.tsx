import React, { useEffect, useMemo, useState } from 'react';
import type {
  AccountAuditResultDetail,
  AccountAuditResultListItem,
  ListAccountAuditResultsResponse,
  StoreAuditType,
} from '@omnilert/shared';
import { X } from 'lucide-react';
import { Spinner } from '../../../shared/components/ui/Spinner';
import { useAppToast } from '../../../shared/hooks/useAppToast';
import { api } from '../../../shared/services/api.client';
import { resolveStoreAuditPaginationState } from '../../store-audits/pages/storeAuditPagination';
import { AuditResultsPageContent } from '../components/AuditResultsPageContent';
import { AccountAuditResultDetailPanel } from '../components/AccountAuditResultDetailPanel';

type CategoryTab = 'all' | StoreAuditType;
const PAGE_SIZE = 10;

export function AuditResultsPage() {
  const { error: showErrorToast } = useAppToast();
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<CategoryTab>('all');
  const [items, setItems] = useState<AccountAuditResultListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);
  const [selectedAudit, setSelectedAudit] = useState<AccountAuditResultDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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
            type: category === 'all' ? undefined : category,
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
      } catch (err: any) {
        if (!active) return;
        showErrorToast(err.response?.data?.error || 'Failed to load audit results');
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
  }, [category, page, showErrorToast]);

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
      .catch((err: any) => {
        if (!active) return;
        setSelectedAuditId(null);
        setSelectedAudit(null);
        showErrorToast(err.response?.data?.error || 'Failed to load audit result');
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

  const currentPage = paginationState.page;
  const totalPages = paginationState.totalPages;

  return (
    <>
      <AuditResultsPageContent
        loading={loading}
        items={items}
        total={total}
        category={category}
        selectedAuditId={selectedAuditId}
        currentPage={currentPage}
        totalPages={totalPages}
        onCategoryChange={(nextCategory) => {
          setCategory(nextCategory);
          setPage(1);
          setSelectedAuditId(null);
        }}
        onSelectAudit={(auditId) => {
          setSelectedAuditId(auditId);
        }}
        onPrevious={() => {
          setPage(Math.max(1, currentPage - 1));
          setSelectedAuditId(null);
        }}
        onNext={() => {
          setPage(Math.min(totalPages, currentPage + 1));
          setSelectedAuditId(null);
        }}
      />

      {(selectedAudit || detailLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedAuditId(null)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[680px] transform overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ${
          selectedAuditId ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {(selectedAudit || detailLoading) && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {selectedAudit?.type_label ?? 'Audit Result'}
                </p>
                {selectedAudit && (
                  <p className="text-xs text-gray-500">Audit ID: {selectedAudit.id}</p>
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
        )}
      </div>
    </>
  );
}
