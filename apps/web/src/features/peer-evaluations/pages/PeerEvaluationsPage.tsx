import { useCallback, useEffect, useMemo, useState } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { AlarmClockOff, AlertTriangle, ArrowDown, ArrowUp, BarChart2, BriefcaseBusiness, CircleCheck, ChevronDown, ChevronUp, Clock, Filter, LayoutGrid, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useBranchStore } from '@/shared/store/branchStore';
import { getGroupedUsers } from '@/features/violation-notices/services/violationNotice.api';
import { GroupedUserSelect } from '@/features/violation-notices/components/GroupedUserSelect';
import {
  getPeerEvaluationById,
  listPeerEvaluations,
  type PeerEvalFilters,
  type PeerEvaluation,
} from '../services/peerEvaluation.api';
import { PeerEvaluationCard } from '../components/PeerEvaluationCard';
import { PeerEvaluationDetailPanel } from '../components/PeerEvaluationDetailPanel';

type StatusTab = 'all' | 'pending' | 'completed' | 'expired';

const STATUS_TABS: { id: StatusTab; label: string; icon: LucideIcon }[] = [
  { id: 'all',       label: 'All',       icon: LayoutGrid  },
  { id: 'pending',   label: 'Pending',   icon: Clock       },
  { id: 'completed', label: 'Completed', icon: CircleCheck },
  { id: 'expired',   label: 'Expired',   icon: AlarmClockOff },
];

const DEFAULT_FILTERS: PeerEvalFilters = { sort_order: 'desc' };

function PeerEvaluationCardSkeleton() {
  return (
    <div className="animate-pulse flex h-full flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4">
      {/* Header: evaluator -> evaluated */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="h-7 w-7 rounded-full bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
          <div className="h-3.5 w-3.5 shrink-0 rounded bg-gray-200" />
          <div className="h-7 w-7 rounded-full bg-gray-200" />
          <div className="h-4 w-24 rounded bg-gray-200" />
        </div>
        <div className="h-5 w-16 rounded bg-gray-200" />
      </div>

      {/* Footer */}
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-24 rounded bg-gray-200" />
          <div className="h-1 w-1 rounded bg-gray-200" />
          <div className="h-3 w-24 rounded bg-gray-200" />
        </div>
        <div className="h-3.5 w-28 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function PeerEvaluationsPage() {
  const socket = useSocket('/peer-evaluations');
  const { hasPermission } = usePermission();
  const { error: showErrorToast } = useAppToast();
  const { selectedBranchIds, branches } = useBranchStore();
  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);
  const [searchParams, setSearchParams] = useSearchParams();

  const [evaluations, setEvaluations] = useState<PeerEvaluation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<StatusTab>('all');
  const [filters, setFilters] = useState<PeerEvalFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PeerEvalFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('evalId'));
  const [selectedEvaluation, setSelectedEvaluation] = useState<PeerEvaluation | null>(null);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);

  const canView = hasPermission(PERMISSIONS.WORKPLACE_RELATIONS_VIEW);

  const hasActiveFilters =
    !!filters.date_from ||
    !!filters.date_to ||
    !!filters.user_id ||
    filters.sort_order !== DEFAULT_FILTERS.sort_order ||
    filters.sort_by !== undefined;

  const fetchEvaluations = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const appliedFilters: PeerEvalFilters = {
        ...filters,
        status: activeStatus === 'all' ? undefined : activeStatus,
      };
      const data = await listPeerEvaluations(appliedFilters);
      setEvaluations(data.items);
      setTotal(data.total);
    } catch (err: any) {
      if (!silent) {
        showErrorToast(err.response?.data?.error || 'Failed to load peer evaluations');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters, activeStatus, showErrorToast]);

  useEffect(() => {
    void fetchEvaluations();
  }, [fetchEvaluations]);

  // Refresh when branches change
  useEffect(() => {
    void fetchEvaluations(true);
  }, [selectedBranchIds, fetchEvaluations]);

  // Sync selectedId with URL
  useEffect(() => {
    const evalId = searchParams.get('evalId');
    setSelectedId((prev) => (prev !== evalId ? evalId : prev));
  }, [searchParams]);

  // Fetch detail when selectedId changes
  useEffect(() => {
    if (!selectedId) {
      setSelectedEvaluation(null);
      return;
    }
    void getPeerEvaluationById(selectedId)
      .then((data) => setSelectedEvaluation(data))
      .catch(() => setSelectedEvaluation(null));
  }, [selectedId]);

  // Fetch grouped users for user filter
  useEffect(() => {
    setLoadingGroupedUsers(true);
    getGroupedUsers()
      .then(setGroupedUsers)
      .catch(() => undefined)
      .finally(() => setLoadingGroupedUsers(false));
  }, []);

  // Socket listeners
  useEffect(() => {
    if (!socket) return;
    const refresh = () => { void fetchEvaluations(true); };
    socket.on('peer-evaluation:new', refresh);
    socket.on('peer-evaluation:completed', refresh);
    socket.on('peer-evaluation:expired', refresh);
    return () => {
      socket.off('peer-evaluation:new', refresh);
      socket.off('peer-evaluation:completed', refresh);
      socket.off('peer-evaluation:expired', refresh);
    };
  }, [fetchEvaluations, socket]);

  const toggleFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => {
    setFilters(draftFilters);
    setFiltersOpen(false);
  };

  const clearFilters = () => {
    setDraftFilters(DEFAULT_FILTERS);
    setFilters(DEFAULT_FILTERS);
    setFiltersOpen(false);
  };

  const cancelFilters = () => {
    setDraftFilters(filters);
    setFiltersOpen(false);
  };

  const handleSelectCard = (id: string) => {
    setSelectedId(id);
    setSearchParams({ evalId: id });
  };

  const handleClosePanel = () => {
    setSelectedId(null);
    setSelectedEvaluation(null);
    setSearchParams({});
  };

  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);
  const filteredEvaluations = useMemo<PeerEvaluation[]>(
    () =>
      selectedBranchIdSet.size === 0
        ? evaluations
        : evaluations.filter((e) => e.branch_id && selectedBranchIdSet.has(e.branch_id)),
    [evaluations, selectedBranchIdSet],
  );

  if (!canView) {
    return (
      <div className="space-y-5">
        <Card>
          <CardBody>
            <p className="py-8 text-center text-gray-500">You do not have permission to view peer evaluations.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Workplace Relations</h1>
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

        <p className="mt-1 hidden text-sm text-gray-500 sm:block">
          Review employee peer evaluation submissions.
        </p>
      </div>

      <ViewToggle
        options={[
          { id: 'peer', label: 'Employee Peer Evaluations', icon: BarChart2 },
          { id: 'management', label: 'Management Evaluation', icon: BriefcaseBusiness, disabled: true },
        ]}
        activeId="peer"
        onChange={() => {}}
        layoutId="peer-evaluation-category-tabs"
        labelAboveOnMobile
      />

      {/* Status tabs + filter toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ViewToggle
          options={STATUS_TABS}
          activeId={activeStatus}
          onChange={(id) => setActiveStatus(id)}
          layoutId="peer-evaluation-tabs"
          className="sm:flex-1"
          labelAboveOnMobile
        />

        <button
          type="button"
          onClick={toggleFilters}
          className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${
            hasActiveFilters
              ? 'border-primary-300 bg-primary-50 text-primary-700'
              : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">
                !
              </span>
            )}
          </div>
          <span className="ml-auto">
            {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </span>
        </button>
      </div>

      {hasActiveFilters && <div className="text-xs text-gray-500">Filters applied</div>}

      {/* Animated filter panel */}
      <AnimatePresence initial={false}>
        {filtersOpen && (
          <motion.div
            key="filter-panel"
            initial={{ opacity: 0, height: 0, overflow: 'hidden' }}
            animate={{ opacity: 1, height: 'auto', overflow: 'visible' }}
            exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Date range */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Date Range</label>
              <DateRangePicker
                dateFrom={draftFilters.date_from ?? ''}
                dateTo={draftFilters.date_to ?? ''}
                onChange={(from, to) => setDraftFilters((f) => ({ ...f, date_from: from, date_to: to }))}
              />
            </div>

            {/* Sort by */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Sort By</label>
              <div className="flex gap-1.5">
                <select
                  value={draftFilters.sort_by ?? 'created_at'}
                  onChange={(e) =>
                    setDraftFilters((f) => ({
                      ...f,
                      sort_by: e.target.value as PeerEvalFilters['sort_by'],
                    }))
                  }
                  className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="created_at">Created Date</option>
                  <option value="score">Evaluation Score</option>
                </select>
                <button
                  type="button"
                  title="Newest / Highest first"
                  onClick={() => setDraftFilters((f) => ({ ...f, sort_order: 'desc' }))}
                  className={`flex h-[34px] w-8 shrink-0 items-center justify-center rounded border text-sm transition-colors ${
                    draftFilters.sort_order === 'desc'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  title="Oldest / Lowest first"
                  onClick={() => setDraftFilters((f) => ({ ...f, sort_order: 'asc' }))}
                  className={`flex h-[34px] w-8 shrink-0 items-center justify-center rounded border text-sm transition-colors ${
                    draftFilters.sort_order === 'asc'
                      ? 'border-primary-600 bg-primary-600 text-white'
                      : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* User filter */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Evaluated Employee</label>
              <GroupedUserSelect
                groupedUsers={groupedUsers}
                selectedUserIds={draftFilters.user_id ? [draftFilters.user_id] : []}
                onChange={(ids) =>
                  setDraftFilters((f) => ({ ...f, user_id: ids[0] ?? undefined }))
                }
                loading={loadingGroupedUsers}
                placeholder="Filter by evaluated employee..."
                singleSelect={true}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="secondary" className="w-full sm:w-auto" onClick={clearFilters}>
              Clear
            </Button>
            <Button type="button" className="w-full sm:w-auto" onClick={applyFilters}>
              Apply
            </Button>
            <Button type="button" variant="ghost" className="w-full sm:w-auto" onClick={cancelFilters}>
              Cancel
            </Button>
          </div>
        </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card grid */}
      {loading ? (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <PeerEvaluationCardSkeleton key={i} />
          ))}
        </div>
      ) : filteredEvaluations.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <Users className="h-4 w-4 shrink-0 text-gray-300" />
          <p className="text-sm text-gray-400">No evaluations found.</p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredEvaluations.map((evaluation) => (
            <PeerEvaluationCard
              key={evaluation.id}
              evaluation={evaluation}
              selected={evaluation.id === selectedId}
              onSelect={() => handleSelectCard(evaluation.id)}
            />
          ))}
        </div>
      )}

      {/* Detail panel */}
      {createPortal(
        <AnimatePresence>
          {selectedEvaluation && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
                onClick={handleClosePanel}
              />

              {/* Detail panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                className="fixed inset-y-0 right-0 z-50 w-full max-w-[560px] bg-white shadow-2xl"
              >
                <PeerEvaluationDetailPanel
                  evaluation={selectedEvaluation}
                  onClose={handleClosePanel}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
