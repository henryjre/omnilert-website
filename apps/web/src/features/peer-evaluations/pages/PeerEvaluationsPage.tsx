import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GroupedUsersResponse } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { ArrowDown, ArrowUp, BarChart2, BriefcaseBusiness, ChevronDown, ChevronUp, Filter, Users } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
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

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'completed', label: 'Completed' },
  { key: 'expired', label: 'Expired' },
] as const;

const DEFAULT_FILTERS: PeerEvalFilters = { sort_order: 'desc' };

export function PeerEvaluationsPage() {
  const socket = useSocket('/peer-evaluations');
  const { hasPermission } = usePermission();
  const [searchParams, setSearchParams] = useSearchParams();

  const [evaluations, setEvaluations] = useState<PeerEvaluation[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeStatus, setActiveStatus] = useState<StatusTab>('all');
  const [filters, setFilters] = useState<PeerEvalFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<PeerEvalFilters>(DEFAULT_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get('evalId'));
  const [selectedEvaluation, setSelectedEvaluation] = useState<PeerEvaluation | null>(null);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);

  const canView = hasPermission(PERMISSIONS.PEER_EVALUATION_VIEW);

  const hasActiveFilters =
    !!filters.date_from ||
    !!filters.date_to ||
    !!filters.user_id ||
    filters.sort_order !== DEFAULT_FILTERS.sort_order ||
    filters.sort_by !== undefined;

  const fetchEvaluations = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const appliedFilters: PeerEvalFilters = {
        ...filters,
        status: activeStatus === 'all' ? undefined : activeStatus,
      };
      const data = await listPeerEvaluations(appliedFilters);
      setEvaluations(data.items);
      setTotal(data.total);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load peer evaluations');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filters, activeStatus]);

  useEffect(() => {
    void fetchEvaluations();
  }, [fetchEvaluations]);

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
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Workplace Relations</h1>
        </div>
        <p className="mt-1 text-sm font-medium text-gray-600 sm:hidden">Employee Peer Evaluations</p>
      </div>

      {/* Category tabs */}
      <div className="flex justify-center gap-1 border-b border-gray-200 sm:justify-start">
        <button
          type="button"
          className="flex items-center gap-2 border-b-2 border-primary-600 px-4 py-2 text-sm font-medium text-primary-600"
        >
          <BarChart2 className="h-4 w-4" />
          <span className="hidden sm:inline">Employee Peer Evaluations</span>
        </button>
        <button
          type="button"
          disabled
          className="flex cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-4 py-2 text-sm font-medium text-gray-300"
        >
          <BriefcaseBusiness className="h-4 w-4" />
          <span className="hidden sm:inline">Management Evaluation</span>
        </button>
      </div>

      {/* Status tabs + filter toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveStatus(tab.key)}
              className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none ${
                activeStatus === tab.key
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

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

      {/* Filter panel */}
      {filtersOpen && (
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
      )}

      {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

      {/* Card grid */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : evaluations.length === 0 ? (
        <Card>
          <CardBody>
            <p className="py-8 text-center text-gray-500">No evaluations found.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {evaluations.map((evaluation) => (
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
      {selectedEvaluation && (
        <PeerEvaluationDetailPanel
          evaluation={selectedEvaluation}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}
