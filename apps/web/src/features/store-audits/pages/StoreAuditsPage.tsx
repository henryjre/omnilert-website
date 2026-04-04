import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import type { ViewOption } from '@/shared/components/ui/ViewToggle';
import { useSearchParams } from 'react-router-dom';
import type {
  CssCriteriaScores,
  StoreAudit,
  StoreAuditStatus,
  StoreAuditType,
  GroupedUsersResponse,
  ListStoreAuditsResponse,
} from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle, CheckCircle2, ClipboardList, Clock, LayoutGrid, Loader2, ShieldCheck, Star, X, XCircle } from 'lucide-react';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { api } from '@/shared/services/api.client';
import { Button } from '@/shared/components/ui/Button';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { useAuthStore } from '@/features/auth/store/authSlice';
import { useBranchStore } from '@/shared/store/branchStore';
import { getGroupedUsers } from '@/features/violation-notices/services/violationNotice.api';
import { RequestVNModal } from '@/features/violation-notices/components/RequestVNModal';
import { normalizeAuditedEmployeeName } from '@/shared/utils/string';
import { CssAuditCard } from '../components/CssAuditCard';
import { ServiceCrewCctvAuditCard } from '../components/ServiceCrewCctvAuditCard';
import { CssAuditDetailPanel } from '../components/CssAuditDetailPanel';
import { ServiceCrewCctvAuditDetailPanel } from '../components/ServiceCrewCctvAuditDetailPanel';
import { Pagination } from '../../../shared/components/ui/Pagination';
import { resolveStoreAuditPaginationState } from './storeAuditPagination';
import { AuditorRewardCard } from '../components/AuditorRewardCard';

type CategoryTab = 'all' | StoreAuditType;
const PAGE_SIZE = 10;

const STATUS_TABS: ViewOption<StoreAuditStatus>[] = [
  { id: 'pending', label: 'Pending', icon: Clock },
  {
    id: 'processing',
    label: 'Processing',
    icon: Loader2,
    activeClassName: 'text-amber-600',
    activeIndicatorClassName: 'bg-amber-500',
  },
  {
    id: 'completed',
    label: 'Completed',
    icon: CheckCircle,
    activeClassName: 'text-green-600',
    activeIndicatorClassName: 'bg-green-500',
  },
  {
    id: 'rejected',
    label: 'Rejected',
    icon: XCircle,
    activeClassName: 'text-red-600',
    activeIndicatorClassName: 'bg-red-500',
  },
];

function getAuditStatusMeta(status: StoreAuditStatus) {
  switch (status) {
    case 'processing':
      return { label: 'Processing', text: 'text-amber-600' };
    case 'completed':
      return { label: 'Completed', text: 'text-green-600' };
    case 'rejected':
      return { label: 'Rejected', text: 'text-red-600' };
    case 'pending':
    default:
      return { label: 'Pending', text: 'text-slate-600' };
  }
}


function StoreAuditsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-gray-200" />
          <div className="h-7 w-48 rounded bg-gray-200" />
        </div>
      </div>
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[80, 120, 112].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-8 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      <div className="flex gap-1 border-b border-gray-200 pb-px">
        {[72, 96, 96].map((w, i) => (
          <div key={i} style={{ width: w }} className="h-6 animate-pulse rounded-t bg-gray-100" />
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="h-3.5 w-36 rounded bg-gray-200" />
              </div>
              <div className="h-5 w-16 rounded-full bg-gray-200" />
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-3 w-28 rounded bg-gray-100" />
              <div className="h-3 w-20 rounded bg-gray-100" />
            </div>
            <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-2.5">
              <div className="h-3 w-24 rounded bg-gray-200" />
              <div className="h-4 w-4 rounded bg-gray-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function StoreAuditsPage() {
  const socket = useSocket('/store-audits');
  const { hasAnyPermission, hasPermission } = usePermission();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const currentUserId = useAuthStore((state) => state.user?.id ?? null);
  const { branches, selectedBranchIds } = useBranchStore();
  const canProcessAudit = hasPermission(PERMISSIONS.STORE_AUDIT_MANAGE);
  const canRequestVN = hasAnyPermission(PERMISSIONS.STORE_AUDIT_MANAGE, PERMISSIONS.VIOLATION_NOTICE_MANAGE);
  const [searchParams, setSearchParams] = useSearchParams();
  const initialAuditIdRef = useRef<string | null>(searchParams.get('auditId'));
  const groupedUsersReqIdRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [category, setCategory] = useState<CategoryTab>('all');
  const [status, setStatus] = useState<StoreAuditStatus>(
    () => (searchParams.get('auditId') ? 'completed' : 'pending'),
  );
  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

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
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [pendingCompleteData, setPendingCompleteData] = useState<{ id: string; payload: any } | null>(null);
  const [completionLogs, setCompletionLogs] = useState<string[]>([]);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);
  const [pendingCounts, setPendingCounts] = useState<{ all: number; customer_service: number; service_crew_cctv: number }>({ all: 0, customer_service: 0, service_crew_cctv: 0 });
  const [auditorStats, setAuditorStats] = useState<{
    current: { totalEarnings: number; auditsCompleted: number; averageReward: number };
    previous: { totalEarnings: number; auditsCompleted: number };
  } | null>(null);

  const paginationState = useMemo(
    () => resolveStoreAuditPaginationState({ page, pageSize, total }),
    [page, pageSize, total],
  );

  const selectedAudit = useMemo(
    () => audits.find((audit) => audit.id === selectedAuditId)
      ?? (selectedAuditFallback?.id === selectedAuditId ? selectedAuditFallback : null),
    [audits, selectedAuditFallback, selectedAuditId],
  );
  const selectedAuditStatusMeta = selectedAudit ? getAuditStatusMeta(selectedAudit.status) : null;
  const syncSelectedAudit = useCallback((audit: StoreAudit, nextStatus: StoreAuditStatus = audit.status) => {
    setSelectedAuditId(audit.id);
    setSelectedAuditFallback(audit);
    setAudits((prev) => prev.map((item) => (item.id === audit.id ? audit : item)));
    setPage(1);
    setStatus(nextStatus);
  }, []);
  const closeRejectModal = useCallback(() => {
    setShowRejectModal(false);
    setRejectReason('');
  }, []);
  const closeCompleteConfirmation = useCallback(() => {
    if (actionLoading) return;
    setPendingCompleteData(null);
    setCompletionLogs([]);
  }, [actionLoading]);
  const clearAuditDraft = useCallback((audit: StoreAudit) => {
    const draftKey = audit.type === 'customer_service'
      ? `css-audit-draft-${audit.id}`
      : `service-crew-cctv-audit-draft-${audit.id}`;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, []);

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

  const fetchPendingCounts = useCallback(async () => {
    try {
      const res = await api.get('/store-audits', { params: { status: 'pending', page: 1, pageSize: 1000 } });
      const items: StoreAudit[] = (res.data.data as ListStoreAuditsResponse).items ?? [];
      const branchIdSet = new Set(selectedBranchIds);
      const visible = branchIdSet.size === 0 ? items : items.filter((a) => branchIdSet.has(a.branch_id));
      setPendingCounts({
        all: visible.length,
        customer_service: visible.filter((a) => a.type === 'customer_service').length,
        service_crew_cctv: visible.filter((a) => a.type === 'service_crew_cctv').length,
      });
    } catch {
      // silently ignore — counts are supplementary
    }
  }, [selectedBranchIds]);

  useEffect(() => {
    void fetchPendingCounts();
  }, [fetchPendingCounts]);

  const fetchAuditorStats = useCallback(async () => {
    try {
      const res = await api.get('/store-audits/stats');
      setAuditorStats(res.data.data);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchAuditorStats();
  }, [fetchAuditorStats]);

  // Reset page and close detail panel when branch selection changes
  useEffect(() => {
    setPage(1);
    setSelectedAuditId(null);
  }, [selectedBranchIds]);

  useEffect(() => {
    if (!selectedAuditId) {
      setSelectedAuditFallback(null);
      return;
    }

    const pageAudit = audits.find((audit) => audit.id === selectedAuditId);
    if (pageAudit) {
      initialAuditIdRef.current = null;
      setSelectedAuditFallback(pageAudit);
      setStatus(pageAudit.status);
      return;
    }

    if (loading) return;
    initialAuditIdRef.current = null;

    let active = true;
    void api.get(`/store-audits/${selectedAuditId}`)
      .then((response) => {
        if (!active) return;
        const audit = response.data.data as StoreAudit;
        setSelectedAuditFallback(audit);
        setStatus(audit.status);
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
    const requestId = groupedUsersReqIdRef.current + 1;
    groupedUsersReqIdRef.current = requestId;

    void getGroupedUsers({ auditId: selectedAudit.id })
      .then((data) => {
        if (groupedUsersReqIdRef.current !== requestId) return;
        setGroupedUsers(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (groupedUsersReqIdRef.current !== requestId) return;
        setLoadingGroupedUsers(false);
      });
  }, [canRequestVN, selectedAudit, showRequestVNModal]);

  useEffect(() => {
    if (!selectedAudit || selectedAudit.status !== 'processing') {
      closeRejectModal();
    }
  }, [closeRejectModal, selectedAudit]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => {
      void fetchAudits({ silent: true });
      void fetchPendingCounts();
      void fetchAuditorStats();
    };
    const refreshUpdated = (payload: { id?: string }) => {
      void fetchAudits({ silent: true });
      void fetchPendingCounts();
      void fetchAuditorStats();
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
  }, [socket, fetchAudits, fetchPendingCounts]);

  const handleProcess = async (auditId: string) => {
    setActionLoading(true);
    try {
      const response = await api.post(`/store-audits/${auditId}/process`);
      const updatedAudit = response.data.data as StoreAudit;
      syncSelectedAudit(updatedAudit, 'processing');
      showSuccessToast('Audit moved to processing.');
      void fetchPendingCounts();
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
      | {
          productivity_rate: boolean | null;
          uniform_compliance: boolean | null;
          hygiene_compliance: boolean | null;
          sop_compliance: boolean | null;
          customer_interaction: number | null;
          cashiering: number | null;
          suggestive_selling_and_upselling: number | null;
          service_efficiency: number | null;
        },
  ) => {
    setActionLoading(true);
    setCompletionLogs(['Gathering audit trail and note summaries...']);

    const aiLogDelay = 2200;
    const aiLogTimeout = setTimeout(() => {
      setCompletionLogs((prev) => [...prev, 'Generating AI-powered performance analysis...']);
    }, aiLogDelay);

    try {
      const response = await api.post(`/store-audits/${auditId}/complete`, payload);
      const updatedAudit = response.data.data as StoreAudit;
      
      clearTimeout(aiLogTimeout);
      setCompletionLogs((prev) => [
        ...prev,
        'AI analysis completed successfully.',
        'Processing audit rewards...',
      ]);
      
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setCompletionLogs((prev) => [...prev, 'Finalizing records and notifying the employee...']);
      
      // Sync immediately so the panel behind the modal updates to the completed view
      clearAuditDraft(updatedAudit);
      syncSelectedAudit(updatedAudit, 'completed');
      void fetchPendingCounts();
      void fetchAuditorStats();

      await new Promise((resolve) => setTimeout(resolve, 800));

      // 3s Countdown loop
      for (let i = 3; i > 0; i--) {
        setCompletionLogs((prev) => {
          const base = prev.filter((l) => !l.startsWith('Audit complete!'));
          return [...base, `Audit complete! This modal will close in ${i}s...`];
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      closeCompleteConfirmation();
      showSuccessToast('Audit completed successfully.');
    } catch (err: any) {
      clearTimeout(aiLogTimeout);
      showErrorToast(err.response?.data?.error || 'Failed to complete audit');
      setCompletionLogs([]);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async (auditId: string, reason: string) => {
    setActionLoading(true);
    try {
      const response = await api.post(`/store-audits/${auditId}/reject`, { reason });
      const updatedAudit = response.data.data as StoreAudit;
      clearAuditDraft(updatedAudit);
      syncSelectedAudit(updatedAudit, 'rejected');
      closeRejectModal();
      showSuccessToast('Audit rejected.');
      void fetchPendingCounts();
      void fetchAuditorStats();
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to reject audit');
    } finally {
      setActionLoading(false);
    }
  };

  const canClaimAudit = canProcessAudit && processingAuditId === null;

  const handleVNCreated = () => {
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

  const categoryLabel = category === 'all'
    ? 'all audits'
    : category === 'customer_service'
      ? 'customer service audits'
      : 'service crew CCTV audits';
  const activeCategoryLabel = category === 'all'
    ? 'All Categories'
    : category === 'customer_service'
      ? 'Customer Service'
      : 'Service Crew CCTV';

  /** Client-side branch filter — mirrors the CashRequestsTab pattern */
  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);
  const filteredAudits = useMemo(
    () => selectedBranchIdSet.size === 0
      ? audits
      : audits.filter((a) => selectedBranchIdSet.has(a.branch_id)),
    [audits, selectedBranchIdSet],
  );

  return (
    <>
      <div className="space-y-5">
        {/* Mobile: reward card full-width before tabs */}
        <div className="sm:hidden space-y-5">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardList className="h-6 w-6 text-primary-600" />
              <h1 className="text-2xl font-bold text-gray-900">Store Audits</h1>
            </div>
            {branchLabel && (
              <p className="mt-0.5 text-sm font-medium text-primary-600">
                {branchLabel}
              </p>
            )}

          </div>
          <AuditorRewardCard
            totalEarnings={auditorStats?.current.totalEarnings ?? 0}
            auditsCompleted={auditorStats?.current.auditsCompleted ?? 0}
            averageReward={auditorStats?.current.averageReward ?? 0}
            previousPeriodTotalEarnings={auditorStats?.previous.totalEarnings ?? 0}
            previousPeriodAuditsCompleted={auditorStats?.previous.auditsCompleted ?? 0}
          />
        </div>

        {/* Desktop: header + tabs on left, card on right */}
        <div className="hidden sm:flex sm:gap-6 sm:items-start">
          {/* Left column — header + tabs */}
          <div className="min-w-0 flex-1 space-y-5">
            <div>
              <div className="flex items-center gap-2">
                <ClipboardList className="h-6 w-6 text-primary-600" />
                <h1 className="text-2xl font-bold text-gray-900">Store Audits</h1>
                {branchLabel && (
                  <span className="mt-1 hidden text-sm font-medium text-primary-600 sm:inline">
                    {branchLabel}
                  </span>
                )}
              </div>
              {branchLabel && (
                <p className="mt-0.5 text-sm font-medium text-primary-600 sm:hidden">
                  {branchLabel}
                </p>
              )}
            </div>

            <ViewToggle
              options={([
                { id: 'all', label: 'All Categories', icon: LayoutGrid },
                { id: 'customer_service', label: 'Customer Service', icon: Star },
                { id: 'service_crew_cctv', label: 'Service Crew CCTV', icon: ShieldCheck },
              ] as const).map((tab) => ({
                ...tab,
                label: tab.label,
                badge: pendingCounts[tab.id] > 0 && (
                  <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] font-bold text-white">
                    {pendingCounts[tab.id]}
                  </span>
                ),
              }))}
              activeId={category}
              onChange={(id) => {
                setCategory(id);
                setPage(1);
                setSelectedAuditId(null);
              }}
              layoutId="store-audit-category-tabs"
              labelAboveOnMobile
            />

            <ViewToggle
              options={STATUS_TABS}
              activeId={status}
              onChange={(id) => {
                setStatus(id);
                setPage(1);
                setSelectedAuditId(null);
              }}
              layoutId="store-audit-status-tabs"
              labelAboveOnMobile
            />
          </div>

          {/* Right column — reward card */}
          <div className="w-[360px] flex-shrink-0">
            <AuditorRewardCard
              totalEarnings={auditorStats?.current.totalEarnings ?? 0}
              auditsCompleted={auditorStats?.current.auditsCompleted ?? 0}
              averageReward={auditorStats?.current.averageReward ?? 0}
              previousPeriodTotalEarnings={auditorStats?.previous.totalEarnings ?? 0}
              previousPeriodAuditsCompleted={auditorStats?.previous.auditsCompleted ?? 0}
              />
          </div>
        </div>

        {/* Mobile-only tabs (below reward card) */}
        <div className="sm:hidden space-y-5">
          <ViewToggle
            options={([
              { id: 'all', label: 'All Categories', icon: LayoutGrid },
              { id: 'customer_service', label: 'Customer Service', icon: Star },
              { id: 'service_crew_cctv', label: 'Service Crew CCTV', icon: ShieldCheck },
            ] as const).map((tab) => ({
              ...tab,
              label: tab.label,
              badge: pendingCounts[tab.id] > 0 && (
                <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-primary-600 px-1 text-[9px] font-bold text-white">
                  {pendingCounts[tab.id]}
                </span>
              ),
            }))}
            activeId={category}
            onChange={(id) => {
              setCategory(id);
              setPage(1);
              setSelectedAuditId(null);
            }}
            layoutId="store-audit-category-tabs-mobile"
            labelAboveOnMobile
          />

          <ViewToggle
            options={STATUS_TABS}
            activeId={status}
            onChange={(id) => {
              setStatus(id);
              setPage(1);
              setSelectedAuditId(null);
            }}
            layoutId="store-audit-status-tabs-mobile"
            labelAboveOnMobile
          />
        </div>

        {/* Content */}
        <div className="space-y-4">
          {loading ? (
            <StoreAuditsSkeleton />
          ) : total === 0 || filteredAudits.length === 0 ? (
            <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
              {category === 'customer_service'
                ? <Star className="h-4 w-4 shrink-0 text-gray-300" />
                : category === 'service_crew_cctv'
                  ? <ShieldCheck className="h-4 w-4 shrink-0 text-gray-300" />
                  : <ClipboardList className="h-4 w-4 shrink-0 text-gray-300" />
              }
              <p className="text-sm text-gray-400">
                No {status} {categoryLabel}.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {filteredAudits.map((audit) => (
                  audit.type === 'customer_service' ? (
                    <CssAuditCard
                      key={audit.id}
                      audit={audit}
                      selected={audit.id === selectedAuditId}
                      onSelect={() => setSelectedAuditId(audit.id)}
                    />
                  ) : (
                    <ServiceCrewCctvAuditCard
                      key={audit.id}
                      audit={audit}
                      selected={audit.id === selectedAuditId}
                      onSelect={() => setSelectedAuditId(audit.id)}
                    />
                  )
                ))}
              </div>

              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(p) => {
                  setPage(p);
                  setSelectedAuditId(null);
                }}
              />
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedAudit && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => !actionLoading && setSelectedAuditId(null)}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col overflow-hidden bg-white shadow-2xl"
            >
              <div className="flex h-full flex-col">
                <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
                  <div>
                    <p className="text-lg font-semibold text-gray-900">
                      {selectedAudit.type === 'customer_service' ? 'Customer Service Audit' : 'Service Crew CCTV Audit'}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                      <span>{selectedAudit.branch_name || selectedAudit.company?.name || selectedAudit.id}</span>
                      <span aria-hidden="true">&bull;</span>
                      <span className={selectedAuditStatusMeta?.text}>{selectedAuditStatusMeta?.label}</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAuditId(null)}
                    className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="flex flex-1 flex-col min-h-0">
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
                      canReject={
                        canProcessAudit
                        && selectedAudit.status === 'processing'
                        && selectedAudit.auditor_user_id === currentUserId
                      }
                      canRequestVN={canRequestVN && selectedAudit.status === 'completed' && !selectedAudit.vn_requested}
                      actionLoading={actionLoading}
                      panelError=""
                      onProcess={() => void handleProcess(selectedAudit.id)}
                      onComplete={(payload) => setPendingCompleteData({ id: selectedAudit.id, payload })}
                      onReject={() => setShowRejectModal(true)}
                      onRequestVN={() => setShowRequestVNModal(true)}
                    />
                  ) : (
                    <ServiceCrewCctvAuditDetailPanel
                      audit={selectedAudit}
                      currentUserId={currentUserId}
                      canProcess={canClaimAudit && selectedAudit.status === 'pending'}
                      canComplete={
                        canProcessAudit
                        && selectedAudit.status === 'processing'
                        && selectedAudit.auditor_user_id === currentUserId
                      }
                      canReject={
                        canProcessAudit
                        && selectedAudit.status === 'processing'
                        && selectedAudit.auditor_user_id === currentUserId
                      }
                      canRequestVN={canRequestVN && selectedAudit.status === 'completed' && !selectedAudit.vn_requested}
                      actionLoading={actionLoading}
                      panelError=""
                      onProcess={() => void handleProcess(selectedAudit.id)}
                      onComplete={(payload) => setPendingCompleteData({ id: selectedAudit.id, payload })}
                      onReject={() => setShowRejectModal(true)}
                      onRequestVN={() => setShowRequestVNModal(true)}
                    />
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {showRequestVNModal && selectedAudit && (
        <RequestVNModal
          isOpen={showRequestVNModal}
          onClose={() => setShowRequestVNModal(false)}
          onCreated={handleVNCreated}
          groupedUsers={groupedUsers}
          loadingUsers={loadingGroupedUsers}
          sourceStoreAuditId={selectedAudit.id}
          sourceLabel={`Store Audit — ${selectedAudit.type === 'customer_service' ? 'CSS' : 'SCC'} — ${selectedAudit.company?.name || 'Unknown Company'} / ${selectedAudit.branch_name || selectedAudit.id}`}
        />
      )}

      <AnimatePresence>
        {showRejectModal && selectedAudit && (
          <AnimatedModal
            maxWidth="max-w-md"
            zIndexClass="z-[60]"
            onBackdropClick={actionLoading ? undefined : closeRejectModal}
          >
            <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Reject Audit</p>
                <p className="mt-0.5 text-xs text-gray-500">Provide a reason for rejecting this audit.</p>
              </div>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {selectedAudit.type === 'customer_service'
                    ? normalizeAuditedEmployeeName(selectedAudit.css_cashier_name) || 'Customer Service Audit'
                    : normalizeAuditedEmployeeName(selectedAudit.scc_employee_name) || 'Service Crew CCTV Audit'}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {selectedAudit.branch_name || selectedAudit.company?.name || selectedAudit.id}
                </p>
              </div>
              <textarea
                rows={4}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Reason for rejection..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                disabled={actionLoading}
              />
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant="danger"
                disabled={actionLoading || !rejectReason.trim()}
                onClick={() => void handleReject(selectedAudit.id, rejectReason.trim())}
              >
                {actionLoading ? 'Rejecting…' : 'Confirm Reject'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={actionLoading}
                onClick={closeRejectModal}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}

        {pendingCompleteData && selectedAudit && (
          <AnimatedModal
            maxWidth="max-w-md"
            zIndexClass="z-[60]"
            onBackdropClick={actionLoading ? undefined : closeCompleteConfirmation}
          >
            <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-50">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Complete Audit</p>
                <p className="mt-0.5 text-xs text-gray-500">Please confirm if you want to submit this audit.</p>
              </div>
            </div>
            <div className="px-5 py-4">
              {!actionLoading ? (
                <>
                  <div className="rounded-lg bg-gray-50 p-3">
                    <p className="text-sm font-medium text-gray-800">
                      {selectedAudit.type === 'customer_service'
                        ? normalizeAuditedEmployeeName(selectedAudit.css_cashier_name) || 'Customer Service Audit'
                        : normalizeAuditedEmployeeName(selectedAudit.scc_employee_name) || 'Service Crew CCTV Audit'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {selectedAudit.branch_name || selectedAudit.company?.name || selectedAudit.id}
                    </p>
                  </div>
                  <p className="mt-3 text-xs text-gray-500 italic">
                    Note: Once completed, this audit will be moved to history and rewards will be computed.
                  </p>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-green-600 border-t-transparent" />
                    <p className="text-sm font-semibold text-green-700">Finalizing Audit...</p>
                  </div>
                  <div className="rounded-xl border border-green-100 bg-green-50/50 p-4 font-mono text-[11px] leading-relaxed text-green-800 shadow-inner">
                    {completionLogs.map((log, index) => (
                      <div key={index} className="flex gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                        <span className="opacity-40">[{new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                        <span>{log}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 border-t border-gray-200 px-5 py-4">
              <Button
                className="flex-1"
                variant="success"
                disabled={actionLoading}
                onClick={() => void handleComplete(pendingCompleteData.id, pendingCompleteData.payload)}
              >
                {actionLoading ? 'Completing…' : 'Yes, Complete Audit'}
              </Button>
              <Button
                className="flex-1"
                variant="secondary"
                disabled={actionLoading}
                onClick={closeCompleteConfirmation}
              >
                Cancel
              </Button>
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>
    </>
  );
}


