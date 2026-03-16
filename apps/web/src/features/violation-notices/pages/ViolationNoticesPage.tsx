import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ViolationNotice, ViolationNoticeDetail, ViolationNoticeMessage, GroupedUsersResponse } from '@omnilert/shared';
import { PERMISSIONS } from '@omnilert/shared';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { ArrowDown, ArrowUp, ChevronDown, ChevronUp, FileText, Filter, Plus } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
import { DateRangePicker } from '@/shared/components/ui/DateRangePicker';
import { Card, CardBody } from '@/shared/components/ui/Card';
import { Spinner } from '@/shared/components/ui/Spinner';
import { usePermission } from '@/shared/hooks/usePermission';
import { useSocket } from '@/shared/hooks/useSocket';
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

const STATUS_TABS: { key: StatusTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'queued', label: 'Queued' },
  { key: 'discussion', label: 'Discussion' },
  { key: 'issuance', label: 'Issuance' },
  { key: 'disciplinary_meeting', label: 'Disciplinary Meeting' },
  { key: 'completed', label: 'Completed' },
  { key: 'rejected', label: 'Rejected' },
];

export function ViolationNoticesPage() {
  const socket = useSocket('/violation-notices');
  const { hasPermission } = usePermission();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  const canCreate = hasPermission(PERMISSIONS.VIOLATION_NOTICE_CREATE);
  const canConfirm = hasPermission(PERMISSIONS.VIOLATION_NOTICE_CONFIRM);
  const canReject = hasPermission(PERMISSIONS.VIOLATION_NOTICE_REJECT);
  const canIssue = hasPermission(PERMISSIONS.VIOLATION_NOTICE_ISSUE);
  const canComplete = hasPermission(PERMISSIONS.VIOLATION_NOTICE_COMPLETE);
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
      setError('');
      try {
        const data = await listViolationNotices(appliedFilters);
        setNotices(data);
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load violation notices');
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [appliedFilters],
  );

  const fetchDetail = useCallback(async (vnId: string) => {
    try {
      const [detail, nextMessages] = await Promise.all([getViolationNotice(vnId), listVNMessages(vnId)]);
      setSelectedVn(detail);
      setMessages(nextMessages);
      await markVNRead(vnId);
      // Clear the unread badges immediately in the local list
      setNotices((prev) =>
        prev.map((n) => (n.id === vnId ? { ...n, unread_count: 0, unread_reply_count: 0 } : n)),
      );
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load violation notice detail');
    }
  }, []);

  useEffect(() => {
    void fetchReports();
  }, [fetchReports]);

  useEffect(() => {
    void getVNMentionables()
      .then((data) => {
        setMentionables({ users: data.users as MentionableUser[], roles: data.roles as MentionableRole[] });
      })
      .catch(() => undefined);
  }, []);

  // Fetch grouped users for CreateVNModal
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
    const refreshDetail = (payload: { vnId?: string }) => {
      void fetchReports(true);
      if (payload.vnId && payload.vnId === selectedVnId) {
        void fetchDetail(payload.vnId);
      }
    };

    socket.on('violation-notice:created', refresh);
    socket.on('violation-notice:updated', refreshDetail);
    socket.on('violation-notice:status-changed', refreshDetail);
    socket.on('violation-notice:message', refreshDetail);
    socket.on('violation-notice:reaction', refreshDetail);
    socket.on('violation-notice:message:edited', refreshDetail);
    socket.on('violation-notice:message:deleted', refreshDetail);

    return () => {
      socket.off('violation-notice:created', refresh);
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

  // ── Chat handlers ────────────────────────────────────────────────────────────

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

  return (
    <>
      <div className="space-y-4">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-primary-600" />
          <h1 className="text-2xl font-bold text-gray-900">Violation Notices</h1>
        </div>

        {/* Status tabs + filter toggle */}
        <div className="flex flex-col gap-2">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <div className="flex w-max gap-1 rounded-lg bg-gray-100 p-1 sm:w-fit">
              {STATUS_TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusTab(tab.key)}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-center text-sm font-medium transition-colors ${
                    statusTab === tab.key
                      ? 'bg-primary-600 text-white shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canCreate && (
              <Button onClick={openCreateModal} className="flex-1 sm:flex-none">
                <Plus className="mr-1.5 h-4 w-4" />
                <span className="sm:hidden">New Notice</span>
                <span className="hidden sm:inline">New Violation Notice</span>
              </Button>
            )}

            <button
              type="button"
              onClick={toggleFilters}
              className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors sm:flex-none ${
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
              <span className="ml-auto">
                {filtersOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </span>
            </button>
          </div>
        </div>

        {hasActiveFilters && <div className="text-xs text-gray-500">Filters applied</div>}

        {/* Filter panel */}
        {filtersOpen && (
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
        )}

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {/* Card list */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : notices.length === 0 ? (
          <Card>
            <CardBody>
              <p className="py-8 text-center text-gray-500">No violation notices found.</p>
            </CardBody>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {notices.map((vn) => (
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

      {/* Overlay backdrop */}
      {selectedVn && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={closeDetailPanel} />
      )}

      {/* Detail slide-in panel */}
      <div
        className={`fixed inset-y-0 right-0 z-50 w-full max-w-[680px] transform bg-white shadow-2xl transition-transform duration-300 ${
          selectedVn ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedVn && (
          <ViolationNoticeDetailPanel
            vn={selectedVn}
            messages={messages}
            onClose={closeDetailPanel}
            onUpdate={(updated) => setSelectedVn(updated)}
            onSilentRefetch={() => void fetchReports(true)}
            onSendMessage={handleSendMessage}
            onEditMessage={handleEditMessage}
            onDeleteMessage={handleDeleteMessage}
            onToggleReaction={handleToggleReaction}
            mentionables={mentionables}
            initialFlashMessageId={initialFlashMessageId}
            onFlashMessageConsumed={() => setInitialFlashMessageId(null)}
            canConfirm={canConfirm}
            canReject={canReject}
            canIssue={canIssue}
            canComplete={canComplete}
            canManage={canManage}
            currentUserId={user?.id ?? ''}
            currentUserRoleIds={user?.roles.map((r) => r.id)}
          />
        )}
      </div>

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
          groupedUsers={groupedUsers}
          loadingUsers={loadingGroupedUsers}
        />
      )}
    </>
  );
}
