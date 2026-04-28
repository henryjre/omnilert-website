import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBranchStore } from '@/shared/store/branchStore';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useSearchParams } from 'react-router-dom';
import type { ElementType } from 'react';
import type { CaseMessage, CaseReport, CaseTask, CaseTaskMessage, GroupedUsersResponse } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  ArrowDown,
  ArrowUp,
  FileWarning,
  Filter,
  FolderCheck,
  FolderOpen,
  LayoutGrid,
  MessageCircle,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import {
  closeCase,
  completeCaseTask,
  createCaseReport,
  createCaseTask,
  deleteCaseAttachment,
  deleteCaseMessage,
  editCaseMessage,
  getCaseReport,
  getMentionables,
  leaveCaseDiscussion,
  listCaseMessages,
  listCaseReports,
  listCaseTasks,
  listCaseTaskMessages,
  markCaseRead,
  sendCaseMessage,
  sendCaseTaskMessage,
  toggleCaseMute,
  toggleCaseReaction,
  toggleTaskReaction,
  uploadCaseAttachment,
  type CaseReportDetail,
  type CaseReportFilters,
  type MentionableRole,
  type MentionableUser,
} from '../services/caseReport.api';
import { CaseReportCard } from '../components/CaseReportCard';
import { CaseReportDetailPanel } from '../components/CaseReportDetailPanel';
import { CreateCaseModal } from '../components/CreateCaseModal';
import { RequestVNModal } from '@/features/violation-notices/components/RequestVNModal';
import { getGroupedUsers } from '@/features/violation-notices/services/violationNotice.api';

type StatusTab = 'all' | 'open' | 'closed';

type OptimisticMessage = CaseMessage & { isPending?: boolean };

const DEFAULT_FILTERS: CaseReportFilters = { sort_order: 'desc' };

const STATUS_TABS: { id: StatusTab; label: string; icon: LucideIcon }[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'open', label: 'Open', icon: FolderOpen },
  { id: 'closed', label: 'Closed', icon: FolderCheck },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function CaseReportSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
      <div className="space-y-2">
        <div className="h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
        <div className="h-3 w-full rounded bg-gray-200" />
        <div className="h-3 w-2/3 rounded bg-gray-200" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-5 w-16 rounded-full bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CaseReportsPage() {
  const socket = useSocket('/case-reports');
  const { hasAnyPermission, hasPermission } = usePermission();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState<CaseReport[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(() =>
    searchParams.get('caseId'),
  );
  const { selectedBranchIds, branches } = useBranchStore();
  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const [initialFlashMessageId, setInitialFlashMessageId] = useState<string | null>(() =>
    searchParams.get('messageId'),
  );
  const [initialFlashTaskId, setInitialFlashTaskId] = useState<string | null>(() =>
    searchParams.get('taskId'),
  );
  const [initialFlashTaskMessageId, setInitialFlashTaskMessageId] = useState<string | null>(() =>
    searchParams.get('taskId') ? searchParams.get('messageId') : null,
  );

  // Sync state when URL params change externally
  useEffect(() => {
    const caseId = searchParams.get('caseId');
    const messageId = searchParams.get('messageId');
    const taskId = searchParams.get('taskId');
    setSelectedCaseId((prev) => (prev !== caseId ? caseId : prev));
    if (taskId) {
      setInitialFlashTaskId(taskId);
      setInitialFlashTaskMessageId(messageId);
    } else if (messageId) {
      setInitialFlashTaskId(null);
      setInitialFlashTaskMessageId(null);
      setInitialFlashMessageId(messageId);
    } else {
      setInitialFlashTaskId(null);
      setInitialFlashTaskMessageId(null);
      setInitialFlashMessageId(null);
    }
  }, [searchParams]);

  const [selectedReport, setSelectedReport] = useState<CaseReportDetail | null>(null);
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [roles, setRoles] = useState<MentionableRole[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<CaseReportFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<CaseReportFilters>(DEFAULT_FILTERS);
  const [createOpen, setCreateOpen] = useState(false);
  const [showRequestVNModal, setShowRequestVNModal] = useState(false);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);
  const groupedUsersReqIdRef = useRef(0);

  // Task state
  const [tasks, setTasks] = useState<CaseTask[]>([]);
  const [taskMessages, setTaskMessages] = useState<Record<string, CaseTaskMessage[]>>({});

  // Branch filtering
  const selectedBranchIdSet = useMemo(() => new Set(selectedBranchIds), [selectedBranchIds]);

  const canCreate = hasPermission(PERMISSIONS.CASE_REPORT_MANAGE);
  const canClose = hasPermission(PERMISSIONS.CASE_REPORT_MANAGE);
  const canManage = hasPermission(PERMISSIONS.CASE_REPORT_MANAGE);
  const canRequestVN = hasAnyPermission(
    PERMISSIONS.CASE_REPORT_MANAGE,
    PERMISSIONS.VIOLATION_NOTICE_MANAGE,
  );

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.date_from) ||
    Boolean(filters.date_to) ||
    Boolean(filters.vn_only) ||
    filters.sort_order !== 'desc';

  const appliedFilters = useMemo(
    () => ({
      ...filters,
      status: statusTab === 'all' ? undefined : statusTab,
    }),
    [filters, statusTab],
  );

  const fetchReports = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      try {
        const data = await listCaseReports(appliedFilters);
        setReports(data.items);
      } catch (err: any) {
        if (!silent) {
          showErrorToast(err.response?.data?.error || 'Failed to load case reports');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [appliedFilters, showErrorToast],
  );

  const fetchDetail = useCallback(
    async (caseId: string) => {
      try {
        const [detail, nextMessages, nextTasks] = await Promise.all([
          getCaseReport(caseId),
          listCaseMessages(caseId),
          listCaseTasks(caseId),
        ]);
        setSelectedReport(detail);
        setMessages(nextMessages);
        setTasks(nextTasks);
        await markCaseRead(caseId);
        setReports((prev) =>
          prev.map((r) => (r.id === caseId ? { ...r, unread_count: 0, unread_reply_count: 0 } : r)),
        );
      } catch (err: any) {
        showErrorToast(err.response?.data?.error || 'Failed to load case detail');
      }
    },
    [showErrorToast],
  );

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    getMentionables()
      .then((data) => {
        setUsers(data.users || []);
        setRoles(data.roles || []);
      })
      .catch((err) => {
        console.error('[CaseReportsPage] Failed to fetch mentionables:', err);
      });
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setGroupedUsers(null);
      setLoadingGroupedUsers(false);
      return;
    }

    const requestId = groupedUsersReqIdRef.current + 1;
    groupedUsersReqIdRef.current = requestId;

    setGroupedUsers(null);
    setLoadingGroupedUsers(true);

    void getGroupedUsers({ caseId: selectedCaseId })
      .then((data) => {
        if (groupedUsersReqIdRef.current !== requestId) return;
        setGroupedUsers(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (groupedUsersReqIdRef.current !== requestId) return;
        setLoadingGroupedUsers(false);
      });
  }, [selectedCaseId]);

  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedReport(null);
      setMessages([]);
      setTasks([]);
      setTaskMessages({});
      return;
    }
    void fetchDetail(selectedCaseId);
    if (socket) socket.emit('case-report:join', { caseId: selectedCaseId });
  }, [fetchDetail, selectedCaseId, socket]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => {
      void fetchReports(true);
    };
    const refreshDetail = (payload: { caseId?: string }) => {
      void fetchReports(true);
      if (payload.caseId && payload.caseId === selectedCaseId) {
        void fetchDetail(payload.caseId);
      }
    };
    const refreshDetailById = (payload: { id?: string; caseId?: string }) => {
      const id = payload.caseId ?? payload.id;
      void fetchReports(true);
      if (id && id === selectedCaseId) {
        void fetchDetail(id);
      }
    };

    const refreshTasks = (payload: { caseId?: string; taskId?: string }) => {
      if (payload.caseId && payload.caseId === selectedCaseId) {
        void listCaseTasks(payload.caseId).then(setTasks).catch(() => undefined);
        void listCaseMessages(payload.caseId).then(setMessages).catch(() => undefined);
        if (payload.taskId) {
          void listCaseTaskMessages(payload.caseId, payload.taskId)
            .then((msgs) => setTaskMessages((prev) => ({ ...prev, [payload.taskId!]: msgs })))
            .catch(() => undefined);
        }
      }
    };

    socket.on('case-report:created', refresh);
    socket.on('case-report:updated', refreshDetailById);
    socket.on('case-report:attachment', refreshDetail);
    socket.on('case-report:message', refreshDetail);
    socket.on('case-report:reaction', refreshDetail);
    socket.on('case-report:task:created', refreshTasks);
    socket.on('case-report:task:updated', refreshTasks);
    return () => {
      socket.off('case-report:created', refresh);
      socket.off('case-report:updated', refreshDetailById);
      socket.off('case-report:attachment', refreshDetail);
      socket.off('case-report:message', refreshDetail);
      socket.off('case-report:reaction', refreshDetail);
      socket.off('case-report:task:created', refreshTasks);
      socket.off('case-report:task:updated', refreshTasks);
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

  // Client-side branch filtering
  const filteredReports = useMemo(() => {
    if (selectedBranchIdSet.size === 0) return reports;
    return reports.filter((r) => r.branch_id == null || selectedBranchIdSet.has(r.branch_id));
  }, [reports, selectedBranchIdSet]);

  // ── Main render ──────────────────────────────────────────────────────────────

  return (
    <>
      <div className="min-w-0 space-y-5">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-3">
            <FileWarning className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Case Reports</h1>
            {openCount > 0 && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                {openCount} open
              </span>
            )}
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
            Document, track, and resolve workplace incidents and operational issues.
          </p>
        </div>

        {/* Status tabs + New Case Report + Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={(id) => setStatusTab(id)}
            layoutId="case-report-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />

          {/* Controls */}
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            {canCreate && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                New Case Report
              </button>
            )}
            <button
              type="button"
              onClick={toggleFilters}
              className={`flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto sm:justify-start ${
                hasActiveFilters
                  ? 'border-primary-300 bg-primary-50 text-primary-700'
                  : 'border-gray-300 bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Filter className="h-4 w-4" />
              <span>Filters</span>
              {hasActiveFilters && (
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary-600 text-[10px] text-white">
                  !
                </span>
              )}
            </button>
          </div>
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
                      onChange={(from, to) =>
                        setDraftFilters((f) => ({ ...f, date_from: from, date_to: to }))
                      }
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
                        title="Oldest first"
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

                  {/* VN toggle */}
                  <div className="flex items-end">
                    <div className="flex w-full items-center rounded border border-gray-300 bg-white px-3 py-2">
                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-700">
                        <button
                          type="button"
                          onClick={() => setDraftFilters((f) => ({ ...f, vn_only: !f.vn_only }))}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            draftFilters.vn_only ? 'bg-primary-600' : 'bg-gray-300'
                          }`}
                          aria-label="Toggle VN Requested"
                          aria-pressed={Boolean(draftFilters.vn_only)}
                          role="switch"
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              draftFilters.vn_only ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <span>Violation Notice</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full sm:w-auto"
                    onClick={clearFilters}
                  >
                    Clear
                  </Button>
                  <Button type="button" className="w-full sm:w-auto" onClick={applyFilters}>
                    Apply
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full sm:w-auto"
                    onClick={cancelFilters}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card list */}
        {loading ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <CaseReportSkeleton key={i} />
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <FileWarning className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              {statusTab === 'all' ? 'No case reports found.' : `No ${statusTab} case reports.`}
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredReports.map((report) => (
              <CaseReportCard
                key={report.id}
                report={report}
                selected={report.id === selectedCaseId}
                onSelect={() => {
                  setSelectedCaseId(report.id);
                  setSearchParams({ caseId: report.id });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedCaseId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={() => {
                setSelectedCaseId(null);
                setSelectedReport(null);
                setInitialFlashTaskId(null);
                setInitialFlashTaskMessageId(null);
                setInitialFlashMessageId(null);
                setSearchParams({});
              }}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col bg-white shadow-2xl"
            >
              <CaseReportDetailPanel
                report={selectedReport}
                messages={messages}
                tasks={tasks}
                taskMessages={taskMessages}
                groupedUsers={groupedUsers}
                currentUserId={user?.id ?? ''}
                currentUserName={user ? `${user.firstName} ${user.lastName}`.trim() : undefined}
                currentUserRoleIds={user?.roles.map((r) => r.id)}
                socket={socket}
                users={users}
                roles={roles}
                canManage={canManage}
                canRequestVN={canRequestVN}
                canClose={canClose}
                initialFlashMessageId={initialFlashMessageId}
                initialFlashTaskId={initialFlashTaskId}
                initialFlashTaskMessageId={initialFlashTaskMessageId}
                onFlashMessageConsumed={() => setInitialFlashMessageId(null)}
                onClosePanel={() => {
                  setSelectedCaseId(null);
                  setSelectedReport(null);
                  setInitialFlashTaskId(null);
                  setInitialFlashTaskMessageId(null);
                  setInitialFlashMessageId(null);
                  setSearchParams({});
                }}
                onLeave={async () => {
                  if (!selectedCaseId) return;
                  await leaveCaseDiscussion(selectedCaseId);
                  await fetchReports(true);
                  setSelectedCaseId(null);
                  setSelectedReport(null);
                  setInitialFlashTaskId(null);
                  setInitialFlashTaskMessageId(null);
                  setInitialFlashMessageId(null);
                  setSearchParams({});
                }}
                onToggleMute={async () => {
                  if (!selectedCaseId) return;
                  await toggleCaseMute(selectedCaseId);
                  await fetchReports(true);
                  if (selectedCaseId) await fetchDetail(selectedCaseId);
                }}
                onCloseCase={async () => {
                  if (!selectedCaseId) return;
                  const detail = await closeCase(selectedCaseId);
                  setSelectedReport(detail);
                  await fetchReports(true);
                }}
                onRequestVN={async () => {
                  if (!selectedCaseId || !canRequestVN) return;
                  setShowRequestVNModal(true);
                }}
                onUploadAttachment={async (file) => {
                  if (!selectedCaseId) return;
                  await uploadCaseAttachment(selectedCaseId, file);
                  await fetchDetail(selectedCaseId);
                  await fetchReports(true);
                }}
                onDeleteAttachment={async (attachmentId) => {
                  if (!selectedCaseId) return;
                  await deleteCaseAttachment(selectedCaseId, attachmentId);
                  await fetchDetail(selectedCaseId);
                }}
                onSendMessage={async (input) => {
                  if (!selectedCaseId) return;
                  const tempId = `optimistic-${Date.now()}`;
                  const optimistic: OptimisticMessage = {
                    id: tempId,
                    case_id: selectedCaseId,
                    user_id: user?.id ?? '',
                    user_name: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
                    user_avatar: user?.avatarUrl ?? undefined,
                    content: input.content,
                    is_system: false,
                    is_deleted: false,
                    is_edited: false,
                    parent_message_id: input.parentMessageId ?? null,
                    reactions: [],
                    attachments: [],
                    mentions: [],
                    created_at: new Date().toISOString(),
                    isPending: true,
                  };
                  setMessages((prev) => [...prev, optimistic]);
                  try {
                    await sendCaseMessage({ caseId: selectedCaseId, ...input });
                    await fetchDetail(selectedCaseId);
                    await fetchReports(true);
                  } catch {
                    setMessages((prev) => prev.filter((m) => m.id !== tempId));
                  }
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
                  const original = messages.find((m) => m.id === messageId);
                  if (original) {
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === messageId
                          ? {
                              ...m,
                              is_deleted: true,
                              content: `${m.user_name ?? 'Someone'} deleted this message`,
                              isPending: true,
                            }
                          : m,
                      ),
                    );
                  }
                  try {
                    await deleteCaseMessage(selectedCaseId, messageId);
                    await fetchDetail(selectedCaseId);
                  } catch {
                    if (original) {
                      setMessages((prev) => prev.map((m) => (m.id === messageId ? original : m)));
                    }
                  }
                }}
                onCreateTask={async (payload) => {
                  if (!selectedCaseId) return;
                  const task = await createCaseTask(selectedCaseId, payload);
                  setTasks((prev) => [...prev, task]);
                  // Refresh messages so the system message appears
                  const nextMessages = await listCaseMessages(selectedCaseId);
                  setMessages(nextMessages);
                }}
                onCompleteTask={async (taskId, userId) => {
                  if (!selectedCaseId) return;
                  const updated = await completeCaseTask(selectedCaseId, taskId, userId);
                  setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
                  const nextMessages = await listCaseMessages(selectedCaseId);
                  setMessages(nextMessages);
                }}
                onSendTaskMessage={async (taskId, content, files, parentMessageId, mentionedUserIds, mentionedRoleIds) => {
                  if (!selectedCaseId) return;
                  const msg = await sendCaseTaskMessage(selectedCaseId, taskId, { content, files, parentMessageId, mentionedUserIds, mentionedRoleIds });
                  setTaskMessages((prev) => ({
                    ...prev,
                    [taskId]: [...(prev[taskId] ?? []), msg],
                  }));
                  void listCaseTasks(selectedCaseId).then(setTasks).catch(() => undefined);
                  void listCaseMessages(selectedCaseId).then(setMessages).catch(() => undefined);
                }}
                onReactToTaskMessage={async (taskId, messageId, emoji) => {
                  if (!selectedCaseId) return;
                  const result = await toggleTaskReaction(selectedCaseId, taskId, messageId, emoji);
                  setTaskMessages((prev) => {
                    const msgs = prev[taskId] ?? [];
                    return {
                      ...prev,
                      [taskId]: msgs.map((m) =>
                        m.id === result.messageId ? { ...m, reactions: result.reactions } : m,
                      ),
                    };
                  });
                }}
                onLoadTaskMessages={async (taskId) => {
                  if (!selectedCaseId) return;
                  const msgs = await listCaseTaskMessages(selectedCaseId, taskId);
                  setTaskMessages((prev) => ({ ...prev, [taskId]: msgs }));
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {createOpen && (
          <CreateCaseModal
            onClose={() => setCreateOpen(false)}
            onSubmit={async (payload) => {
              const created = await createCaseReport(payload);
              await fetchReports(true);
              setSelectedCaseId(created.id);
              setSearchParams({ caseId: created.id });
            }}
          />
        )}
      </AnimatePresence>

      <RequestVNModal
        isOpen={showRequestVNModal}
        onClose={() => setShowRequestVNModal(false)}
        onCreated={() => {
          setShowRequestVNModal(false);
          void fetchReports(true);
          if (selectedCaseId) void fetchDetail(selectedCaseId);
          showSuccessToast('Violation notice requested successfully.');
        }}
        groupedUsers={groupedUsers}
        loadingUsers={loadingGroupedUsers}
        sourceCaseReportId={selectedCaseId ?? undefined}
        sourceLabel={`Case Report #${String(selectedReport?.case_number).padStart(4, '0')}`}
      />
    </>
  );
}
