import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type {
  CssCriteriaScores,
  StoreAudit,
  StoreAuditStatus,
  StoreAuditType,
  GroupedUsersResponse,
  ListStoreAuditsResponse,
  ViolationNotice,
} from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { ClipboardList, LayoutGrid, ShieldCheck, Star, X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { api } from '@/shared/services/api.client';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { getGroupedUsers } from '@/features/violation-notices/services/violationNotice.api';
import { RequestVNModal } from '@/features/violation-notices/components/RequestVNModal';
import { CssAuditCard } from '../components/CssAuditCard';
import { ComplianceAuditCard } from '../components/ComplianceAuditCard';
import { CssAuditDetailPanel } from '../components/CssAuditDetailPanel';
import { ComplianceAuditDetailPanel } from '../components/ComplianceAuditDetailPanel';
import { StoreAuditPaginationFooter } from '../components/StoreAuditPaginationFooter';
import { resolveStoreAuditPaginationState } from './storeAuditPagination';

type CategoryTab = 'all' | StoreAuditType;
const PAGE_SIZE = 10;

function statusBadge(status: StoreAuditStatus) {
  if (status === 'completed') return 'success' as const;
  if (status === 'processing') return 'info' as const;
  return 'warning' as const;
}

export function StoreAuditsPage() {
  const socket = useSocket('/store-audits');
  const { hasPermission } = usePermission();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const canProcessAudit = hasPermission(PERMISSIONS.STORE_AUDIT_PROCESS);
  const canRequestVN = hasPermission(PERMISSIONS.VIOLATION_NOTICE_CREATE);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAuditIdRef = useRef<string | null>(searchParams.get('auditId'));

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [category, setCategory] = useState<CategoryTab>('all');
  const [status, setStatus] = useState<StoreAuditStatus>(
    () => (searchParams.get('auditId') ? 'completed' : 'pending'),
  );
  const [audits, setAudits] = useState<StoreAudit[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [processingAuditId, setProcessingAuditId] = useState<string | null>(null);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(
    () => searchParams.get('auditId'),
  );
  const [selectedAuditFallback, setSelectedAuditFallback] = useState<StoreAudit | null>(null);
  const [showRequestVNModal, setShowRequestVNModal] = useState(false);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);

  const paginationState = useMemo(
    () => resolveStoreAuditPaginationState({ page, pageSize, total }),
    [page, pageSize, total],
  );

  const selectedAudit = useMemo(
    () => audits.find((audit) => audit.id === selectedAuditId)
      ?? (selectedAuditFallback?.id === selectedAuditId ? selectedAuditFallback : null),
    [audits, selectedAuditFallback, selectedAuditId],
  );

  const fetchAudits = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    try {
      const response = await api.get('/store-audits', {
        params: {
          type: category === 'all' ? undefined : category,
          status,
          page,
          pageSize: PAGE_SIZE,
        },
      });
      const data = response.data.data as ListStoreAuditsResponse;
      const nextPageSize = Math.max(1, Number(data.pageSize ?? PAGE_SIZE));
      const nextTotal = Math.max(0, Number(data.total ?? 0));
      const resolvedPage = resolveStoreAuditPaginationState({
        page,
        pageSize: nextPageSize,
        total: nextTotal,
      }).page;

      setPageSize(nextPageSize);
      setTotal(nextTotal);
      setProcessingAuditId(data.processingAuditId ?? null);

      if (resolvedPage !== page) {
        setPage(resolvedPage);
        return;
      }

      setAudits(data.items ?? []);
    } catch (err: any) {
      if (!options?.silent) {
        showErrorToast(err.response?.data?.error || 'Failed to load store audits');
      }
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [category, page, showErrorToast, status]);

  useEffect(() => {
    void fetchAudits();
  }, [fetchAudits]);

  useEffect(() => {
    if (!selectedAuditId) {
      setSelectedAuditFallback(null);
      return;
    }

    const pageAudit = audits.find((audit) => audit.id === selectedAuditId);
    if (pageAudit) {
      initialAuditIdRef.current = null;
      setSelectedAuditFallback(pageAudit);
      return;
    }

    if (loading) return;

    if (initialAuditIdRef.current !== selectedAuditId) {
      setSelectedAuditId(null);
      return;
    }

    initialAuditIdRef.current = null;
    let active = true;

    void api.get(`/store-audits/${selectedAuditId}`)
      .then((response) => {
        if (!active) return;
        setSelectedAuditFallback(response.data.data as StoreAudit);
      })
      .catch(() => {
        if (!active) return;
        setSelectedAuditId(null);
      });

    return () => {
      active = false;
    };
  }, [audits, loading, selectedAuditId]);

  // Sync selectedAuditId to URL
  useEffect(() => {
    if (selectedAuditId) {
      setSearchParams((prev) => { prev.set('auditId', selectedAuditId); return prev; }, { replace: true });
    } else {
      setSearchParams((prev) => { prev.delete('auditId'); return prev; }, { replace: true });
    }
  }, [selectedAuditId, setSearchParams]);

  useEffect(() => {
    if (!canRequestVN || !showRequestVNModal || !selectedAudit) return;
    setGroupedUsers(null);
    setLoadingGroupedUsers(true);
    getGroupedUsers(selectedAudit.id)
      .then(setGroupedUsers)
      .catch(() => undefined)
      .finally(() => setLoadingGroupedUsers(false));
  }, [canRequestVN, selectedAudit, showRequestVNModal]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => {
      void fetchAudits({ silent: true });
    };
    const refreshUpdated = (payload: { id?: string }) => {
      void fetchAudits({ silent: true });
      if (payload.id && payload.id === selectedAuditId) {
        setAudits((prev) =>
          prev.map((a) => (a.id === payload.id ? { ...a, vn_requested: true } : a)),
        );
        setSelectedAuditFallback((prev) => (
          prev && prev.id === payload.id ? { ...prev, vn_requested: true } : prev
        ));
      }
    };

    socket.on('store-audit:new', refresh);
    socket.on('store-audit:claimed', refresh);
    socket.on('store-audit:completed', refresh);
    socket.on('store-audit:updated', refreshUpdated);

    return () => {
      socket.off('store-audit:new', refresh);
      socket.off('store-audit:claimed', refresh);
      socket.off('store-audit:completed', refresh);
      socket.off('store-audit:updated', refreshUpdated);
    };
  }, [socket, fetchAudits]);

  const handleProcess = async (auditId: string) => {
    setActionLoading(true);
    try {
      await api.post(`/store-audits/${auditId}/process`);
      showSuccessToast('Audit moved to processing.');
      await fetchAudits({ silent: true });
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to process audit');
    } finally {
      setActionLoading(false);
    }
  };

  const handleComplete = async (
    auditId: string,
    payload:
      | { criteria_scores: CssCriteriaScores }
      | { productivity_rate: boolean; uniform: boolean; hygiene: boolean; sop: boolean },
  ) => {
    setActionLoading(true);
    try {
      await api.post(`/store-audits/${auditId}/complete`, payload);
      showSuccessToast('Audit completed successfully.');
      await fetchAudits({ silent: true });
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to complete audit');
    } finally {
      setActionLoading(false);
    }
  };

  const canClaimAudit = canProcessAudit && processingAuditId === null;

  const handleVNCreated = (_vn: ViolationNotice) => {
    setShowRequestVNModal(false);
    if (selectedAuditId) {
      setAudits((prev) =>
        prev.map((a) => (a.id === selectedAuditId ? { ...a, vn_requested: true } : a)),
      );
      setSelectedAuditFallback((prev) => (
        prev && prev.id === selectedAuditId ? { ...prev, vn_requested: true } : prev
      ));
    }
    void fetchAudits({ silent: true });
  };

  const currentPage = paginationState.page;
  const totalPages = paginationState.totalPages;

  return (
    <>
      <div className="space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Store Audits</h1>
            </div>
            <Badge variant={statusBadge(status)}>{total} {status}</Badge>
          </div>
          <p className="mt-1 text-sm font-medium text-gray-600 sm:hidden">
            {category === 'all' ? 'All Categories' : category === 'customer_service' ? 'Customer Service Audit' : 'Compliance Audit'}
          </p>
        </div>

        <div className="flex justify-center gap-1 border-b border-gray-200 sm:justify-start">
          {([
            { key: 'all', label: 'All Categories', icon: LayoutGrid },
            { key: 'customer_service', label: 'Customer Service Audit', icon: Star },
            { key: 'compliance', label: 'Compliance Audit', icon: ShieldCheck },
          ] as const).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setCategory(tab.key);
                setPage(1);
                setSelectedAuditId(null);
              }}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                category === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="h-4 w-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
          {(['pending', 'processing', 'completed'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setStatus(tab);
                setPage(1);
                setSelectedAuditId(null);
              }}
              className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium capitalize transition-colors sm:flex-none ${
                status === tab
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" />
          </div>
        ) : total === 0 ? (
          <Card>
            <CardBody className="py-12 text-center">
              <p className="text-sm text-gray-500">No audits found for the selected filters.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {audits.map((audit) => (
              audit.type === 'customer_service' ? (
                <CssAuditCard
                  key={audit.id}
                  audit={audit}
                  selected={audit.id === selectedAuditId}
                  onSelect={() => {
                    setSelectedAuditId(audit.id);
                  }}
                />
              ) : (
                <ComplianceAuditCard
                  key={audit.id}
                  audit={audit}
                  selected={audit.id === selectedAuditId}
                  onSelect={() => {
                    setSelectedAuditId(audit.id);
                  }}
                />
              )
            ))}

            {totalPages > 1 && (
              <StoreAuditPaginationFooter
                currentPage={currentPage}
                totalPages={totalPages}
                onPrevious={() => {
                  setPage(Math.max(1, currentPage - 1));
                  setSelectedAuditId(null);
                }}
                onNext={() => {
                  setPage(Math.min(totalPages, currentPage + 1));
                  setSelectedAuditId(null);
                }}
              />
            )}
          </div>
        )}
      </div>

      {(selectedAudit || actionLoading) && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => setSelectedAuditId(null)}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[680px] transform overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ${
          selectedAudit ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedAudit && (
          <div className="flex h-full flex-col">
            <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <p className="text-lg font-semibold text-gray-900">
                  {selectedAudit.type === 'customer_service' ? 'Customer Service Audit' : 'Compliance Audit'}
                </p>
                <p className="text-xs text-gray-500">Audit ID: {selectedAudit.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAuditId(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {selectedAudit.type === 'customer_service' ? (
              <CssAuditDetailPanel
                audit={selectedAudit}
                currentUserId={currentUserId}
                canProcess={canClaimAudit && selectedAudit.status === 'pending'}
                canComplete={
                  canProcessAudit
                  && selectedAudit.status === 'processing'
                  && selectedAudit.auditor_user_id === currentUserId
                }
                canRequestVN={canRequestVN && selectedAudit.status === 'completed' && !selectedAudit.vn_requested}
                actionLoading={actionLoading}
                panelError=""
                onProcess={() => void handleProcess(selectedAudit.id)}
                onComplete={(payload) => void handleComplete(selectedAudit.id, payload)}
                onRequestVN={() => setShowRequestVNModal(true)}
              />
            ) : (
              <ComplianceAuditDetailPanel
                audit={selectedAudit}
                currentUserId={currentUserId}
                canProcess={canClaimAudit && selectedAudit.status === 'pending'}
                canComplete={
                  canProcessAudit
                  && selectedAudit.status === 'processing'
                  && selectedAudit.auditor_user_id === currentUserId
                }
                canRequestVN={canRequestVN && selectedAudit.status === 'completed' && !selectedAudit.vn_requested}
                actionLoading={actionLoading}
                panelError=""
                onProcess={() => void handleProcess(selectedAudit.id)}
                onComplete={(payload) => void handleComplete(selectedAudit.id, payload)}
                onRequestVN={() => setShowRequestVNModal(true)}
              />
            )}
          </div>
        )}
      </div>

      {showRequestVNModal && selectedAudit && (
        <RequestVNModal
          isOpen={showRequestVNModal}
          onClose={() => setShowRequestVNModal(false)}
          onCreated={handleVNCreated}
          groupedUsers={groupedUsers}
          loadingUsers={loadingGroupedUsers}
          sourceStoreAuditId={selectedAudit.id}
          sourceLabel={`Store Audit — ${selectedAudit.type === 'customer_service' ? 'CSS' : 'Compliance'} — ${selectedAudit.company?.name || 'Unknown Company'} / ${selectedAudit.branch_name || selectedAudit.id}`}
        />
      )}
    </>
  );
}
