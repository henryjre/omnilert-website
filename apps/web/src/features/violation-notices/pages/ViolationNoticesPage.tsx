import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useSearchParams } from 'react-router-dom';
import type { ViolationNotice, ViolationNoticeDetail, ViolationNoticeMessage, GroupedUsersResponse } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuth } from '@/features/auth/hooks/useAuth';
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Clock,
  FileText,
  Filter,
  LayoutGrid,
  MessageCircle,
  Plus,
  TriangleAlert,
  Users,
  XCircle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ElementType } from 'react';
import { Button } from '@/shared/components/ui/Button';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { useBranchStore } from '@/shared/store/branchStore';
import {
  deleteVNMessage,
  editVNMessage,
  getGroupedUsers,
  getViolationNotice,
  getVNMentionables,
  leaveVNDiscussion,
  listViolationNotices,
  listVNMessages,
  markVNRead,
  sendVNMessage,
  toggleVNMute,
  toggleVNReaction,
  type ViolationNoticeFilters,
} from '../services/violationNotice.api';
import type { MentionableUser, MentionableRole } from '../../case-reports/services/caseReport.api';
import { ViolationNoticeCard } from '../components/ViolationNoticeCard';
import { ViolationNoticeDetailPanel } from '../components/ViolationNoticeDetailPanel';
import { CreateVNModal } from '../components/CreateVNModal';
import { GroupedUserSelect } from '../components/GroupedUserSelect';

type StatusTab = 'all' | 'queued' | 'discussion' | 'issuance' | 'disciplinary_meeting' | 'completed' | 'rejected';

type OptimisticMessage = ViolationNoticeMessage & { isPending?: boolean };

const DEFAULT_FILTERS: ViolationNoticeFilters = { sort_order: 'desc' };

const STATUS_TABS: { id: StatusTab; label: string; icon: LucideIcon }[] = [
  { id: 'all',                  label: 'All',                  icon: LayoutGrid    },
  { id: 'queued',               label: 'Queued',               icon: Clock         },
  { id: 'discussion',           label: 'Discussion',           icon: MessageCircle },
  { id: 'issuance',             label: 'Issuance',             icon: FileText      },
  { id: 'disciplinary_meeting', label: 'Disciplinary Meeting', icon: Users         },
  { id: 'completed',            label: 'Completed',            icon: CircleCheck   },
  { id: 'rejected',             label: 'Rejected',             icon: XCircle       },
];

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function ViolationNoticeSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-white p-4">
      <div className="space-y-2">
        <div className="h-3 w-1/3 rounded bg-gray-200" />
        <div className="h-5 w-1/2 rounded-full bg-gray-200" />
        <div className="h-3 w-2/3 rounded bg-gray-200" />
        <div className="h-3 w-1/2 rounded bg-gray-200" />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-2.5">
        <div className="h-3 w-16 rounded bg-gray-200" />
        <div className="h-3 w-12 rounded bg-gray-200" />
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function ViolationNoticesPage() {
  const socket = useSocket('/violation-notices');
  const { hasPermission } = usePermission();
  const { error: showErrorToast } = useAppToast();
  const { user } = useAuth();
  const { selectedBranchIds, branches } = useBranchStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [notices, setNotices] = useState<ViolationNotice[]>([]);
  const [selectedVnId, setSelectedVnId] = useState<string | null>(() => searchParams.get('vnId'));
  const [initialFlashMessageId, setInitialFlashMessageId] = useState<string | null>(() => searchParams.get('messageId'));

  // Sync state when URL params change externally
  useEffect(() => {
    const vnId = searchParams.get('vnId');
    const messageId = searchParams.get('messageId');
    setSelectedVnId((prev) => (prev !== vnId ? vnId : prev));
    if (messageId) setInitialFlashMessageId(messageId);
  }, [searchParams]);

  const branchLabel = useMemo(() => {
    if (branches.length === 0) return '';
    const selectedBranches = branches.filter((b) => selectedBranchIds.includes(b.id));
    if (selectedBranches.length === 0 || selectedBranches.length === branches.length) return 'All Branches';
    if (selectedBranches.length === 1) return selectedBranches[0].name;
    return `${selectedBranches[0].name} +${selectedBranches.length - 1} more`;
  }, [branches, selectedBranchIds]);

  const [selectedVn, setSelectedVn] = useState<ViolationNoticeDetail | null>(null);
  const [messages, setMessages] = useState<OptimisticMessage[]>([]);
  const [mentionables, setMentionables] = useState<{ users: MentionableUser[]; roles: MentionableRole[] }>({
    users: [],
    roles: [],
  });

  const [statusTab, setStatusTab] = useState<StatusTab>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<ViolationNoticeFilters>(DEFAULT_FILTERS);
  const [draftFilters, setDraftFilters] = useState<ViolationNoticeFilters>(DEFAULT_FILTERS);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const [groupedUsers, setGroupedUsers] = useState<GroupedUsersResponse | null>(null);
  const [loadingGroupedUsers, setLoadingGroupedUsers] = useState(false);

  const canManage = hasPermission(PERMISSIONS.VIOLATION_NOTICE_MANAGE);

  const hasActiveFilters =
    Boolean(filters.search) ||
    Boolean(filters.date_from) ||
    Boolean(filters.date_to) ||
    Boolean(filters.category) ||
    Boolean(filters.target_user_id) ||
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
        const data = await listViolationNotices(appliedFilters);
        setNotices(data);
      } catch (err: any) {
        if (!silent) {
          showErrorToast(err.response?.data?.error || 'Failed to load violation notices');
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [appliedFilters, showErrorToast],
  );

  const fetchDetail = useCallback(
    async (vnId: string) => {
      try {
        const [detail, nextMessages] = await Promise.all([getViolationNotice(vnId), listVNMessages(vnId)]);
        setSelectedVn(detail);
        setMessages(nextMessages);
        await markVNRead(vnId);
        setNotices((prev) =>
          prev.map((n) => (n.id === vnId ? { ...n, unread_count: 0, unread_reply_count: 0 } : n)),
        );
      } catch (err: any) {
        showErrorToast(err.response?.data?.error || 'Failed to load violation notice detail');
      }
    },
    [showErrorToast],
  );

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  const selectedBranchIdSet = useMemo(
    () => new Set(selectedBranchIds),
    [selectedBranchIds],
  );

  const filteredNotices = useMemo(() => {
    if (selectedBranchIdSet.size === 0) return notices;
    return notices.filter((n) => n.branch_id != null && selectedBranchIdSet.has(n.branch_id));
  }, [notices, selectedBranchIdSet]);

  // Reset detail panel only when the currently selected VN is no longer visible
  // after a global branch selection change.
  useEffect(() => {
    if (!selectedVnId) return;

    const stillVisible = filteredNotices.some((vn) => vn.id === selectedVnId);
    if (stillVisible) return;

    setSelectedVnId(null);
    setSelectedVn(null);
    setMessages([]);
    setSearchParams({});
    void fetchReports(true);
  }, [fetchReports, selectedBranchIds, filteredNotices, selectedVnId, setSearchParams]);

  useEffect(() => {
    void getVNMentionables()
      .then((data) => {
        setMentionables({ users: data.users as MentionableUser[], roles: data.roles as MentionableRole[] });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setLoadingGroupedUsers(true);
    void getGroupedUsers()
      .then((data) => setGroupedUsers(data))
      .catch(() => undefined)
      .finally(() => setLoadingGroupedUsers(false));
  }, []);


  useEffect(() => {
    if (!selectedVnId) {
      setSelectedVn(null);
      setMessages([]);
      return;
    }
    void fetchDetail(selectedVnId);
  }, [fetchDetail, selectedVnId]);

  useEffect(() => {
    if (!socket) return;

    const refresh = () => {
      void fetchReports(true);
    };

    const refreshDetail = (payload: { vnId?: string; id?: string }) => {
      void fetchReports(true);
      const vnId = payload.vnId ?? payload.id;
      if (vnId && vnId === selectedVnId) {
        void fetchDetail(vnId);
      }
    };

    socket.on('violation-notice:created', (payload: { id?: string }) => {
      void fetchReports(true);
      if (payload?.id && payload.id === selectedVnId) {
        void fetchDetail(payload.id);
      }
    });
    socket.on('violation-notice:updated', refreshDetail);
    socket.on('violation-notice:status-changed', refreshDetail);
    socket.on('violation-notice:message', refreshDetail);
    socket.on('violation-notice:reaction', refreshDetail);
    socket.on('violation-notice:message:edited', refreshDetail);
    socket.on('violation-notice:message:deleted', refreshDetail);

    return () => {
      socket.off('violation-notice:created');
      socket.off('violation-notice:updated', refreshDetail);
      socket.off('violation-notice:status-changed', refreshDetail);
      socket.off('violation-notice:message', refreshDetail);
      socket.off('violation-notice:reaction', refreshDetail);
      socket.off('violation-notice:message:edited', refreshDetail);
      socket.off('violation-notice:message:deleted', refreshDetail);
    };
  }, [fetchDetail, fetchReports, selectedVnId, socket]);

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

  const openCreateModal = () => {
    setShowCreateModal(true);
    setCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateModalOpen(false);
  };

  const closeDetailPanel = () => {
    setSelectedVnId(null);
    setSelectedVn(null);
    setSearchParams({});
  };

  // ── Chat handlers ──────────────────────────────────────────────────────────

  const handleSendMessage = async (payload: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    files: File[];
  }) => {
    if (!selectedVnId) return;
    const tempId = `optimistic-${Date.now()}`;
    const now = new Date().toISOString();
    const optimistic: OptimisticMessage = {
      id: tempId,
      violation_notice_id: selectedVnId,
      user_id: user?.id ?? '',
      user_name: user ? `${user.firstName} ${user.lastName}`.trim() : undefined,
      user_avatar: user?.avatarUrl ?? undefined,
      content: payload.content,
      type: 'message',
      is_deleted: false,
      is_edited: false,
      parent_message_id: payload.parentMessageId ?? null,
      reactions: [],
      attachments: [],
      mentions: [],
      created_at: now,
      updated_at: now,
      isPending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendVNMessage(selectedVnId, {
        content: payload.content,
        parentMessageId: payload.parentMessageId ?? undefined,
        mentionedUserIds: payload.mentionedUserIds,
        mentionedRoleIds: payload.mentionedRoleIds,
        files: payload.files,
      });
      await fetchDetail(selectedVnId);
      await fetchReports(true);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    if (!selectedVnId) return;
    await editVNMessage(selectedVnId, messageId, content);
    await fetchDetail(selectedVnId);
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!selectedVnId) return;
    const original = messages.find((m) => m.id === messageId);
    if (original) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === messageId
            ? { ...m, is_deleted: true, content: `${m.user_name ?? 'Someone'} deleted this message`, isPending: true }
            : m,
        ),
      );
    }
    try {
      await deleteVNMessage(selectedVnId, messageId);
      await fetchDetail(selectedVnId);
    } catch {
      if (original) {
        setMessages((prev) => prev.map((m) => (m.id === messageId ? original : m)));
      }
    }
  };

  const handleToggleReaction = async (messageId: string, emoji: string) => {
    if (!selectedVnId) return;
    await toggleVNReaction(selectedVnId, messageId, emoji);
    await fetchDetail(selectedVnId);
    await fetchReports(true);
  };

  const handleLeave = async (vnId: string) => {
    await leaveVNDiscussion(vnId);
    await fetchReports(true);
  };

  const handleToggleMute = async (vnId: string) => {
    await toggleVNMute(vnId);
    await fetchReports(true);
  };

  const activeCount = filteredNotices.filter((n) => !['completed', 'rejected'].includes(n.status)).length;

  return (
    <>
      <div className="min-w-0 space-y-5">
        {/* Page header */}
        <div>
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-6 w-6 text-primary-600" />
            <h1 className="text-2xl font-bold text-gray-900">Violation Notices</h1>
            {activeCount > 0 && (
              <span className="rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
                {activeCount} active
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
              Manage employee violation notices through the issuance workflow.
            </p>
        </div>

        {/* Status tabs + New VN + Filters */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <ViewToggle
            options={STATUS_TABS}
            activeId={statusTab}
            onChange={(id) => setStatusTab(id)}
            layoutId="violation-notice-tabs"
            className="sm:flex-1"
            labelAboveOnMobile
          />

          {/* Controls */}
          <div className="flex w-full items-center gap-2 sm:w-auto">
            {canManage && (
              <button
                type="button"
                onClick={openCreateModal}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 sm:w-auto"
              >
                <Plus className="h-4 w-4" />
                New Violation Notice
              </button>
            )}
            <button
              type="button"
              onClick={toggleFilters}
              className={`flex w-full items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:w-auto ${
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
                      placeholder="VN number, description..."
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
                        value="vn_number"
                        disabled
                        className="flex-1 rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      >
                        <option value="vn_number">VN Number</option>
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

                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600">Category</label>
                    <select
                      value={draftFilters.category ?? ''}
                      onChange={(e) =>
                        setDraftFilters((f) => ({
                          ...f,
                          category: (e.target.value as ViolationNoticeFilters['category']) || undefined,
                        }))
                      }
                      className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    >
                      <option value="">All Categories</option>
                      <option value="manual">Manual</option>
                      <option value="case_reports">Case Reports</option>
                      <option value="store_audits">Store Audits</option>
                    </select>
                  </div>

                  {/* Target user */}
                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                    <label className="text-xs font-medium text-gray-600">Target Employee</label>
                    <GroupedUserSelect
                      groupedUsers={groupedUsers}
                      selectedUserIds={draftFilters.target_user_id ? [draftFilters.target_user_id] : []}
                      onChange={(ids) =>
                        setDraftFilters((f) => ({ ...f, target_user_id: ids[0] ?? undefined }))
                      }
                      loading={loadingGroupedUsers}
                      placeholder="Filter by employee..."
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

        {/* Card list */}
        {loading ? (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <ViolationNoticeSkeleton key={i} />
            ))}
          </div>
        ) : filteredNotices.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3.5">
            <TriangleAlert className="h-4 w-4 shrink-0 text-gray-300" />
            <p className="text-sm text-gray-400">
              {statusTab === 'all' ? 'No violation notices found.' : `No ${statusTab.replace('_', ' ')} violation notices.`}
            </p>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredNotices.map((vn) => (
              <ViolationNoticeCard
                key={vn.id}
                vn={vn}
                selected={vn.id === selectedVnId}
                onSelect={() => {
                  setSelectedVnId(vn.id);
                  setSearchParams({ vnId: vn.id });
                }}
                onLeave={() => handleLeave(vn.id)}
                onToggleMute={() => handleToggleMute(vn.id)}
              />
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedVnId && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
              onClick={closeDetailPanel}
            />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[680px] flex-col bg-white shadow-2xl"
            >
              {selectedVn && (
                <ViolationNoticeDetailPanel
                  vn={selectedVn}
                  messages={messages}
                  onClose={closeDetailPanel}
                  onUpdate={(updated) => setSelectedVn(updated)}
                  onSilentRefetch={() => void fetchReports(true)}
                  onLeave={async () => { await handleLeave(selectedVn.id); }}
                  onToggleMute={async () => { await handleToggleMute(selectedVn.id); }}
                  onSendMessage={handleSendMessage}
                  onEditMessage={handleEditMessage}
                  onDeleteMessage={handleDeleteMessage}
                  onToggleReaction={handleToggleReaction}
                  mentionables={mentionables}
                  initialFlashMessageId={initialFlashMessageId}
                  onFlashMessageConsumed={() => setInitialFlashMessageId(null)}
                  canConfirm={canManage}
                  canReject={canManage}
                  canIssue={canManage}
                  canComplete={canManage}
                  canManage={canManage}
                  currentUserId={user?.id ?? ''}
                  currentUserRoleIds={user?.roles.map((r) => r.id)}
                />
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Create VN modal */}
      {(showCreateModal || createModalOpen) && (
        <CreateVNModal
          isOpen={createModalOpen}
          onClose={closeCreateModal}
          onCreated={async (created) => {
            await fetchReports(true);
            setSelectedVnId(created.id);
            setSearchParams({ vnId: created.id });
            closeCreateModal();
          }}
        />
      )}
    </>
  );
}
