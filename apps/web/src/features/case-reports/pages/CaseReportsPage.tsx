import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { CaseMessage, CaseReport } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { FileWarning, Filter } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import {
  closeCase,
  createCaseReport,
  deleteCaseMessage,
  editCaseMessage,
  getCaseReport,
  getMentionables,
  leaveCaseDiscussion,
  listCaseMessages,
  listCaseReports,
  markCaseRead,
  requestViolationNotice,
  sendCaseMessage,
  toggleCaseMute,
  toggleCaseReaction,
  updateCorrectiveAction,
  updateResolution,
  uploadCaseAttachment,
  type CaseReportDetail,
  type CaseReportFilters,
  type MentionableRole,
  type MentionableUser,
} from '../services/caseReport.api';
import { CaseReportCard } from '../components/CaseReportCard';
import { CaseReportDetailPanel } from '../components/CaseReportDetailPanel';
import { CreateCaseModal } from '../components/CreateCaseModal';

type StatusTab = 'all' | 'open' | 'closed';

const DEFAULT_FILTERS: CaseReportFilters = { sort_order: 'desc' };

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open' },
  { key: 'closed', label: 'Closed' },
];

export function CaseReportsPage() {
  const socket = useSocket('/case-reports');
  const { hasPermission } = usePermission();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(searchParams.get('caseId'));
  const [selectedReport, setSelectedReport] = useState<CaseReportDetail | null>(null);
  const [messages, setMessages] = useState<CaseMessage[]>([]);
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [roles, setRoles] = useState<MentionableRole[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<CaseReportFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CaseReportFilters>(DEFAULT_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = hasPermission(PERMISSIONS.CASE_REPORT_CREATE);
  const canClose = hasPermission(PERMISSIONS.CASE_REPORT_CLOSE);
  const canManage = hasPermission(PERMISSIONS.CASE_REPORT_MANAGE);

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.date_from) ||
    Boolean(filters.date_to) ||
    Boolean(filters.vn_only) ||
    filters.sort_order !== 'desc';

  const appliedFilters = useMemo(() => ({
    ...filters,
    status: statusTab === 'all' ? undefined : statusTab,
  }), [filters, statusTab]);

  const fetchReports = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const data = await listCaseReports(appliedFilters);
      setReports(data.items);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load case reports');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [appliedFilters]);

  const fetchDetail = useCallback(async (caseId: string) => {
    try {
      const [detail, nextMessages] = await Promise.all([getCaseReport(caseId), listCaseMessages(caseId)]);
      setSelectedReport(detail);
      setMessages(nextMessages);
      await markCaseRead(caseId);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load case detail');
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    void getMentionables().then((data) => {
      setUsers(data.users);
      setRoles(data.roles);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedReport(null);
      setMessages([]);
      return;
    }
    void fetchDetail(selectedCaseId);
  }, [fetchDetail, selectedCaseId]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => { void fetchReports(true); };
    const refreshDetail = (payload: { caseId?: string }) => {
      void fetchReports(true);
      if (payload.caseId && payload.caseId === selectedCaseId) {
        void fetchDetail(payload.caseId);
      }
    };

    socket.on('case-report:created', refresh);
    socket.on('case-report:updated', refresh);
    socket.on('case-report:attachment', refreshDetail);
    socket.on('case-report:message', refreshDetail);
    socket.on('case-report:reaction', refreshDetail);
    return () => {
      socket.off('case-report:created', refresh);
      socket.off('case-report:updated', refresh);
      socket.off('case-report:attachment', refreshDetail);
      socket.off('case-report:message', refreshDetail);
      socket.off('case-report:reaction', refreshDetail);
    };
  }, [fetchDetail, fetchReports, selectedCaseId, socket]);

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

  const openCount = reports.filter((r) => r.status === 'open').length;

  return (
    <>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <FileWarning className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Case Reports</h1>
          {openCount > 0 && (
            <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
              {openCount} open
            </span>
          )}
        </div>

        {/* Status tabs + filter toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="mx-auto flex w-full items-center justify-center gap-1 rounded-lg bg-gray-100 p-1 sm:mx-0 sm:w-fit sm:justify-start">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusTab(tab.key)}
                className={`flex-1 rounded-md px-4 py-1.5 text-center text-sm font-medium transition-colors sm:flex-none ${statusTab === tab.key
                    ? 'bg-primary-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                  }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex w-full items-center gap-2 sm:w-auto">
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)} className="w-full sm:w-auto">
                <Plus className="mr-1.5 h-4 w-4" />
                New Case Report
              </Button>
            )}

            <button
              type="button"
              onClick={toggleFilters}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${hasActiveFilters
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
        </div>

        {hasActiveFilters && (
          <div className="text-xs text-gray-500">Filters applied</div>
        )}

        {/* Filter panel */}
        {filtersOpen && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {/* Search */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Search</label>
                <input
                  type="text"
                  placeholder="Title, case number..."
                  value={draftFilters.search ?? ''}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>

              {/* Date range */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Date Range</label>
                <DateRangePicker
                  dateFrom={draftFilters.date_from ?? ''}
                  dateTo={draftFilters.date_to ?? ''}
                  onChange={(from, to) => setDraftFilters((f) => ({ ...f, date_from: from, date_to: to }))}
                />
              </div>

              {/* Sort order */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Sort By</label>
                <div className="flex gap-1.5">
                  <select
                    value="case_number"
                    disabled
                    className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  >
                    <option value="case_number">Case Number</option>
                  </select>
                  <button
                    type="button"
                    title="Newest first"
                    onClick={() => setDraftFilters((f) => ({ ...f, sort_order: 'desc' }))}
                    className={`flex h-[34px] w-8 shrink-0 items-center justify-center rounded border text-sm transition-colors ${draftFilters.sort_order === 'desc'
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Oldest first"
                    onClick={() => setDraftFilters((f) => ({ ...f, sort_order: 'asc' }))}
                    className={`flex h-[34px] w-8 shrink-0 items-center justify-center rounded border text-sm transition-colors ${draftFilters.sort_order === 'asc'
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                      }`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {/* VN toggle */}
              <div className="flex items-end">
                <div className="flex w-full items-center rounded border border-gray-300 bg-white px-3 py-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                    <button
                      type="button"
                      onClick={() => setDraftFilters((f) => ({ ...f, vn_only: !f.vn_only }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${draftFilters.vn_only ? 'bg-primary-600' : 'bg-gray-300'
                        }`}
                      aria-label="Toggle VN Requested"
                      aria-pressed={Boolean(draftFilters.vn_only)}
                      role="switch"
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${draftFilters.vn_only ? 'translate-x-6' : 'translate-x-1'
                          }`}
                      />
                    </button>
                    <span>Violation Notice</span>
                  </label>
                </div>
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

        {/* Card list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : reports.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-gray-500">No case reports found.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {reports.map((report) => (
              <CaseReportCard
                key={report.id}
                report={report}
                selected={report.id === selectedCaseId}
                onSelect={() => {
                  setSelectedCaseId(report.id);
                  setSearchParams({ caseId: report.id });
                }}
                onLeave={async () => {
                  await leaveCaseDiscussion(report.id);
                  await fetchReports(true);
                }}
                onToggleMute={async () => {
                  await toggleCaseMute(report.id);
                  await fetchReports(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {selectedReport && (
        <div
          className="fixed inset-0 z-40 bg-black/30"
          onClick={() => {
            setSelectedCaseId(null);
            setSelectedReport(null);
            setSearchParams({});
          }}
        />
      )}

      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[680px] transform bg-white shadow-2xl transition-transform duration-300 ${selectedReport ? 'translate-x-0' : 'translate-x-full'
          }`}
      >
        <CaseReportDetailPanel
          report={selectedReport}
          messages={messages}
          currentUserId={user?.id ?? ''}
          users={users}
          roles={roles}
          canManage={canManage}
          canClose={canClose}
          onClosePanel={() => {
            setSelectedCaseId(null);
            setSelectedReport(null);
            setSearchParams({});
          }}
          onUpdateCorrectiveAction={async (value) => {
            if (!selectedCaseId) return;
            const detail = await updateCorrectiveAction(selectedCaseId, value);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onUpdateResolution={async (value) => {
            if (!selectedCaseId) return;
            const detail = await updateResolution(selectedCaseId, value);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onCloseCase={async () => {
            if (!selectedCaseId) return;
            const detail = await closeCase(selectedCaseId);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onRequestVN={async () => {
            if (!selectedCaseId) return;
            const detail = await requestViolationNotice(selectedCaseId);
            setSelectedReport(detail);
            await fetchReports(true);
          }}
          onUploadAttachment={async (file) => {
            if (!selectedCaseId) return;
            await uploadCaseAttachment(selectedCaseId, file);
            await fetchDetail(selectedCaseId);
            await fetchReports(true);
          }}
          onSendMessage={async (input) => {
            if (!selectedCaseId) return;
            await sendCaseMessage({ caseId: selectedCaseId, ...input });
            await fetchDetail(selectedCaseId);
            await fetchReports(true);
          }}
          onReactMessage={async (messageId, emoji) => {
            if (!selectedCaseId) return;
            await toggleCaseReaction(selectedCaseId, messageId, emoji);
            await fetchDetail(selectedCaseId);
          }}
          onEditMessage={async (messageId, newContent) => {
            if (!selectedCaseId) return;
            await editCaseMessage(selectedCaseId, messageId, newContent);
            await fetchDetail(selectedCaseId);
          }}
          onDeleteMessage={async (messageId) => {
            if (!selectedCaseId) return;
            await deleteCaseMessage(selectedCaseId, messageId);
            await fetchDetail(selectedCaseId);
          }}
        />
      </div>

      <CreateCaseModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async (payload) => {
          const created = await createCaseReport(payload);
          await fetchReports(true);
          setSelectedCaseId(created.id);
          setSearchParams({ caseId: created.id });
        }}
      />
    </>
  );
}
