import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AicMessage, AicRecord, AicTask, AicTaskMessage } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ArrowDown, ArrowUp, Boxes, Filter, LayoutGrid, PackageCheck, PackageOpen } from 'lucide-react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import type { ViewOption } from '@/shared/components/ui/ViewToggle';
import {
  completeAicTask,
  createAicTask,
  deleteAicMessage,
  editAicMessage,
  getAicRecord,
  getMentionables,
  leaveAicDiscussion,
  listAicMessages,
  listAicRecords,
  listAicTaskMessages,
  listAicTasks,
  markAicRead,
  requestViolationNotice,
  sendAicMessage,
  sendAicTaskMessage,
  toggleAicMute,
  toggleAicReaction,
  toggleAicTaskReaction,
  type AicFilters,
  type AicRecordDetail,
  type MentionableRole,
  type MentionableUser,
} from '../services/aicVariance.api';
import { AicVarianceCard } from '../components/AicVarianceCard';
import { AicVarianceDetailPanel } from '../components/AicVarianceDetailPanel';
import { RequestVNModal } from '@/features/violation-notices/components/RequestVNModal';
import { getGroupedUsers } from '@/features/violation-notices/services/violationNotice.api';
import type { GroupedUsersResponse } from '@omnilert/shared';

type StatusTab = 'all' | 'open' | 'resolved';

const DEFAULT_FILTERS: AicFilters = { sort_order: 'desc' };

const STATUS_TABS: ViewOption<StatusTab>[] = [
  { id: 'all', label: 'All', icon: LayoutGrid },
  { id: 'open', label: 'Open', icon: PackageOpen },
  {
    id: 'resolved',
    label: 'Resolved',
    icon: PackageCheck,
  },
];

function AicSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
      <div className="space-y-2">
        <div className="h-3 w-1/4 rounded bg-gray-200" />
        <div className="h-4 w-3/4 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="h-5 w-16 rounded-full bg-gray-200" />
        <div className="h-3 w-20 rounded bg-gray-200" />
      </div>
    </div>
  );
}

export function AicVariancePage() {
  const socket = useSocket('/aic-variance');
  const { hasPermission, hasAnyPermission } = usePermission();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<AicRecord[]>([]);
  const [selectedAicId, setSelectedAicId] = useState<string | null>(() => searchParams.get('aicId'));
  const [selectedRecord, setSelectedRecord] = useState<AicRecordDetail | null>(null);
  const [messages, setMessages] = useState<AicMessage[]>([]);
  const [tasks, setTasks] = useState<AicTask[]>([]);
  const [taskMessages, setTaskMessages] = useState<Record<string, AicTaskMessage[]>>({});
  const [users, setUsers] = useState<MentionableUser[]>([]);
  const [roles, setRoles] = useState<MentionableRole[]>([]);
  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<AicFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<AicFilters>(DEFAULT_FILTERS);
  const [showRequestVNModal, setShowRequestVNModal] = useState(false);
  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);
  const groupedUsersReqIdRef = useRef(0);

  const canManage = hasPermission(PERMISSIONS.AIC_VARIANCE_MANAGE);
  const canRequestVN = hasAnyPermission(
    PERMISSIONS.AIC_VARIANCE_MANAGE,
    PERMISSIONS.VIOLATION_NOTICE_MANAGE,
  );

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.date_from) ||
    Boolean(filters.date_to) ||
    filters.sort_order !== 'desc';

  const appliedFilters = useMemo(
    () => ({
      ...filters,
      status: statusTab === 'all' ? undefined : statusTab,
    }),
    [filters, statusTab],
  );

  const fetchRecords = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      try {
        const data = await listAicRecords(appliedFilters);
        setRecords(data.items);
      } catch (err: any) {
        if (!silent) showErrorToast(err.response?.data?.error || 'Failed to load AIC records');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [appliedFilters, showErrorToast],
  );

  const fetchDetail = useCallback(
    async (aicId: string) => {
      try {
        const [detail, nextMessages, nextTasks] = await Promise.all([
          getAicRecord(aicId),
          listAicMessages(aicId),
          listAicTasks(aicId),
        ]);
        setSelectedRecord(detail);
        setMessages(nextMessages);
        setTasks(nextTasks);
        await markAicRead(aicId);
        setRecords((prev) =>
          prev.map((r) => (r.id === aicId ? { ...r, unread_count: 0, unread_reply_count: 0 } : r)),
        );
      } catch (err: any) {
        showErrorToast(err.response?.data?.error || 'Failed to load AIC detail');
      }
    },
    [showErrorToast],
  );

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  useEffect(() => {
    getMentionables()
      .then((data) => {
        setUsers(data.users || []);
        setRoles(data.roles || []);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!selectedAicId) {
      setGroupedUsers(null);
      setLoadingGroupedUsers(false);
      return;
    }
    const requestId = groupedUsersReqIdRef.current + 1;
    groupedUsersReqIdRef.current = requestId;
    setGroupedUsers(null);
    setLoadingGroupedUsers(true);
    void getGroupedUsers({ aicRecordId: selectedAicId })
      .then((data) => {
        if (groupedUsersReqIdRef.current !== requestId) return;
        setGroupedUsers(data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (groupedUsersReqIdRef.current !== requestId) return;
        setLoadingGroupedUsers(false);
      });
  }, [selectedAicId]);

  useEffect(() => {
    if (!selectedAicId) {
      setSelectedRecord(null);
      setMessages([]);
      setTasks([]);
      setTaskMessages({});
      return;
    }
    void fetchDetail(selectedAicId);
  }, [fetchDetail, selectedAicId]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => void fetchRecords(true);

    const refreshDetail = (payload: { aicId?: string; id?: string }) => {
      const id = payload.aicId ?? payload.id;
      void fetchRecords(true);
      if (id && id === selectedAicId) void fetchDetail(id);
    };

    const refreshTasks = (payload: { aicId?: string; taskId?: string }) => {
      if (!payload.aicId || payload.aicId !== selectedAicId) return;
      void listAicTasks(payload.aicId).then(setTasks).catch(() => undefined);
      void listAicMessages(payload.aicId).then(setMessages).catch(() => undefined);
      if (payload.taskId) {
        void listAicTaskMessages(payload.aicId, payload.taskId)
          .then((msgs) => setTaskMessages((prev) => ({ ...prev, [payload.taskId!]: msgs })))
          .catch(() => undefined);
      }
    };

    socket.on('aic-variance:created', refresh);
    socket.on('aic-variance:updated', refreshDetail);
    socket.on('aic-variance:message', refreshDetail);
    socket.on('aic-variance:reaction', refreshDetail);
    socket.on('aic-variance:task:created', refreshTasks);
    socket.on('aic-variance:task:updated', refreshTasks);

    return () => {
      socket.off('aic-variance:created', refresh);
      socket.off('aic-variance:updated', refreshDetail);
      socket.off('aic-variance:message', refreshDetail);
      socket.off('aic-variance:reaction', refreshDetail);
      socket.off('aic-variance:task:created', refreshTasks);
      socket.off('aic-variance:task:updated', refreshTasks);
    };
  }, [fetchDetail, fetchRecords, selectedAicId, socket]);

  const toggleFilters = () => {
    if (filtersOpen) { setFiltersOpen(false); return; }
    setDraftFilters(filters);
    setFiltersOpen(true);
  };

  const applyFilters = () => { setFilters(draftFilters); setFiltersOpen(false); };
  const clearFilters = () => { setDraftFilters(DEFAULT_FILTERS); setFilters(DEFAULT_FILTERS); setFiltersOpen(false); };
  const cancelFilters = () => { setDraftFilters(filters); setFiltersOpen(false); };

  const closePanel = () => {
    setSelectedAicId(null);
    setSelectedRecord(null);
    setSearchParams({});
  };

  const openCount = records.filter((r) => r.status === 'open').length;

  return (
    <>
      <div className="min-w-0 space-y-5">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-3">
            <Boxes className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">AIC Variance</h1>
            {openCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                {openCount} open
              </span>
            )}
          </div>
          <p className="mt-1 hidden text-sm text-gray-500 sm:block">
            Inventory variance records detected from AIC data.
          </p>
        </div>

        {/* Status tabs + Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={(id) => setStatusTab(id as StatusTab)}
            layoutId="aic-variance-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
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
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Search</label>
                    <input
                      type="text"
                      placeholder="Reference, AIC number..."
                      value={draftFilters.search ?? ''}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, search: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Date From</label>
                    <input
                      type="date"
                      value={draftFilters.date_from ?? ''}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, date_from: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Date To</label>
                    <input
                      type="date"
                      value={draftFilters.date_to ?? ''}
                      onChange={(e) => setDraftFilters((f) => ({ ...f, date_to: e.target.value }))}
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Sort Order</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        title="Newest first"
                        onClick={() => setDraftFilters((f) => ({ ...f, sort_order: 'desc' }))}
                        className={`flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded border text-sm transition-colors ${
                          draftFilters.sort_order === 'desc'
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <ArrowDown className="h-4 w-4" />
                        Newest
                      </button>
                      <button
                        type="button"
                        title="Oldest first"
                        onClick={() => setDraftFilters((f) => ({ ...f, sort_order: 'asc' }))}
                        className={`flex h-[34px] flex-1 items-center justify-center gap-1.5 rounded border text-sm transition-colors ${
                          draftFilters.sort_order === 'asc'
                            ? 'border-primary-600 bg-primary-600 text-white'
                            : 'border-gray-300 bg-white text-gray-500 hover:bg-gray-50'
                        }`}
                      >
                        <ArrowUp className="h-4 w-4" />
                        Oldest
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="rounded-lg bg-primary-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={cancelFilters}
                    className="rounded-lg px-4 py-1.5 text-sm font-medium text-gray-500 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card grid */}
        {loading ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <AicSkeleton key={i} />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <Boxes className="h-4 w-4 shrink-0 text-gray-400" />
            <p className="text-sm text-gray-400">
              {statusTab === 'all' ? 'No AIC variance records found.' : `No ${statusTab} AIC records.`}
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {records.map((record) => (
              <AicVarianceCard
                key={record.id}
                record={record}
                selected={record.id === selectedAicId}
                onSelect={() => {
                  setSelectedAicId(record.id);
                  setSearchParams({ aicId: record.id });
                }}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedAicId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={closePanel}
            />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col bg-white shadow-2xl"
            >
              <AicVarianceDetailPanel
                record={selectedRecord}
                messages={messages}
                tasks={tasks}
                taskMessages={taskMessages}
                currentUserId={user?.id ?? ''}
                currentUserName={user ? `${user.firstName} ${user.lastName}`.trim() : undefined}
                currentUserRoleIds={user?.roles.map((role) => role.id)}
                users={users}
                roles={roles}
                groupedUsers={groupedUsers}
                canManage={canManage}
                onClosePanel={closePanel}
                onLeave={async () => {
                  if (!selectedAicId) return;
                  await leaveAicDiscussion(selectedAicId);
                  await fetchRecords(true);
                  closePanel();
                }}
                onToggleMute={async () => {
                  if (!selectedAicId) return;
                  await toggleAicMute(selectedAicId);
                  await fetchRecords(true);
                  await fetchDetail(selectedAicId);
                }}
                onResolve={async () => {
                  if (!selectedAicId) return;
                  const detail = await import('../services/aicVariance.api').then((m) =>
                    m.resolveAicRecord(selectedAicId),
                  );
                  setSelectedRecord(detail);
                  await fetchRecords(true);
                }}
                onRequestVN={() => {
                  if (!canRequestVN) return;
                  setShowRequestVNModal(true);
                }}
                onSendMessage={async (input) => {
                  if (!selectedAicId) return;
                  await sendAicMessage(selectedAicId, input);
                  await fetchDetail(selectedAicId);
                  await fetchRecords(true);
                }}
                onReactMessage={async (messageId, emoji) => {
                  if (!selectedAicId) return;
                  await toggleAicReaction(selectedAicId, messageId, emoji);
                  await fetchDetail(selectedAicId);
                }}
                onEditMessage={async (messageId, newContent) => {
                  if (!selectedAicId) return;
                  await editAicMessage(selectedAicId, messageId, newContent);
                  await fetchDetail(selectedAicId);
                }}
                onDeleteMessage={async (messageId) => {
                  if (!selectedAicId) return;
                  await deleteAicMessage(selectedAicId, messageId);
                  await fetchDetail(selectedAicId);
                }}
                onCreateTask={async (payload) => {
                  if (!selectedAicId) return;
                  const task = await createAicTask(selectedAicId, {
                    ...payload,
                    sourceMessageId: payload.sourceMessageId ?? undefined,
                  });
                  setTasks((prev) => [...prev, task]);
                  const nextMessages = await listAicMessages(selectedAicId);
                  setMessages(nextMessages);
                }}
                onCompleteTask={async (taskId, userId) => {
                  if (!selectedAicId) return;
                  const updated = await completeAicTask(selectedAicId, taskId, userId);
                  setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
                  const nextMessages = await listAicMessages(selectedAicId);
                  setMessages(nextMessages);
                }}
                onSendTaskMessage={async (taskId, content, files, parentMessageId, mentionedUserIds, mentionedRoleIds) => {
                  if (!selectedAicId) return;
                  const msg = await sendAicTaskMessage(selectedAicId, taskId, { content, files, parentMessageId: parentMessageId ?? undefined, mentionedUserIds, mentionedRoleIds });
                  setTaskMessages((prev) => ({
                    ...prev,
                    [taskId]: [...(prev[taskId] ?? []), msg],
                  }));
                  void listAicTasks(selectedAicId).then(setTasks).catch(() => undefined);
                  void listAicMessages(selectedAicId).then(setMessages).catch(() => undefined);
                }}
                onReactToTaskMessage={async (taskId, messageId, emoji) => {
                  if (!selectedAicId) return;
                  await toggleAicTaskReaction(selectedAicId, taskId, messageId, emoji);
                  const msgs = await listAicTaskMessages(selectedAicId, taskId);
                  setTaskMessages((prev) => ({ ...prev, [taskId]: msgs }));
                }}
                onLoadTaskMessages={async (taskId) => {
                  if (!selectedAicId) return;
                  const msgs = await listAicTaskMessages(selectedAicId, taskId);
                  setTaskMessages((prev) => ({ ...prev, [taskId]: msgs }));
                }}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <RequestVNModal
        isOpen={showRequestVNModal}
        onClose={() => setShowRequestVNModal(false)}
        onCreated={() => {
          setShowRequestVNModal(false);
          void fetchRecords(true);
          if (selectedAicId) void fetchDetail(selectedAicId);
          showSuccessToast('Violation notice requested successfully.');
        }}
        groupedUsers={groupedUsers}
        loadingUsers={loadingGroupedUsers}
        sourceAicRecordId={selectedAicId ?? undefined}
        sourceLabel={`AIC ${String(selectedRecord?.aic_number).padStart(4, '0')}`}
      />
    </>
  );
}
