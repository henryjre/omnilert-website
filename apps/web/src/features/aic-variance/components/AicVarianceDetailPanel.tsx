import { useLayoutEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { AicMessage, AicTask, AicTaskMessage, CaseTask, CaseTaskMessage, GroupedUsersResponse } from '@omnilert/shared';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Bell,
  BellOff,
  Boxes,
  Building2,
  CalendarDays,
  CheckSquare,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  GitBranch,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Plus,
  User,
  X,
} from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useAppToast } from '@/shared/hooks/useAppToast';
import type { AicRecordDetail, MentionableRole, MentionableUser } from '../services/aicVariance.api';
import { ChatSection } from '@/shared/components/chat/ChatSection';
import { TaskList } from '@/shared/components/chat/TaskList';
import { TaskDetailPanel } from '@/shared/components/chat/TaskDetailPanel';
import { TaskCreationModal } from '@/shared/components/chat/TaskCreationModal';
import { AicProductsSection } from './AicProductsSection';

const detailPanelTabs = ['details', 'discussion', 'tasks'] as const;
type DetailPanelTab = (typeof detailPanelTabs)[number];

function formatDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAicDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">{children}</p>
  );
}

const tabOptions = [
  { id: 'details', label: 'Details', icon: Boxes },
  { id: 'discussion', label: 'Discussion', icon: MessageCircle },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
];

function adaptAicTaskToCaseTask(task: AicTask, recordId: string): CaseTask {
  return {
    ...task,
    case_id: recordId,
    discussion_message_id: task.discussion_message_id ?? null,
  } as CaseTask;
}

function adaptAicTaskMessageToCaseTaskMessage(message: AicTaskMessage): CaseTaskMessage {
  return {
    ...message,
    mentions: (message.mentions ?? []).map((mention, index) => ({
      id: `${message.id}-mention-${index}`,
      message_id: message.id,
      mentioned_user_id: mention.mentioned_user_id ?? null,
      mentioned_role_id: mention.mentioned_role_id ?? null,
      mentioned_name: mention.mentioned_name ?? null,
    })),
  };
}

interface AicVarianceDetailPanelProps {
  record: AicRecordDetail | null;
  messages: AicMessage[];
  tasks: AicTask[];
  taskMessages: Record<string, AicTaskMessage[]>;
  currentUserId: string;
  currentUserName?: string;
  currentUserRoleIds?: string[];
  users: MentionableUser[];
  roles: MentionableRole[];
  groupedUsers?: GroupedUsersResponse | null;
  canManage: boolean;
  onClosePanel: () => void;
  onLeave: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onResolve: () => Promise<void>;
  onRequestVN: () => void;
  onSendMessage: (input: {
    content: string;
    parentMessageId?: string | null;
    mentionedUserIds: string[];
    mentionedRoleIds: string[];
    files: File[];
  }) => Promise<void>;
  onReactMessage: (messageId: string, emoji: string) => Promise<void>;
  onEditMessage: (messageId: string, newContent: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onCreateTask: (payload: { description: string; assigneeUserIds: string[]; sourceMessageId?: string | null }) => Promise<void>;
  onCompleteTask: (taskId: string, userId: string) => Promise<void>;
  onSendTaskMessage: (taskId: string, content: string, files?: File[], parentMessageId?: string | null, mentionedUserIds?: string[], mentionedRoleIds?: string[]) => Promise<void>;
  onReactToTaskMessage: (taskId: string, messageId: string, emoji: string) => Promise<void>;
  onLoadTaskMessages: (taskId: string) => Promise<void>;
}

export function AicVarianceDetailPanel({
  record,
  messages,
  tasks,
  taskMessages,
  currentUserId,
  currentUserName,
  currentUserRoleIds,
  users,
  roles,
  groupedUsers = null,
  canManage,
  onClosePanel,
  onLeave,
  onToggleMute,
  onResolve,
  onRequestVN,
  onSendMessage,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
  onCreateTask,
  onCompleteTask,
  onSendTaskMessage,
  onReactToTaskMessage,
  onLoadTaskMessages,
}: AicVarianceDetailPanelProps) {
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailPanelTab>('details');
  const [syncedRecordId, setSyncedRecordId] = useState<string | null>(null);

  const effectiveTab: DetailPanelTab =
    syncedRecordId === record?.id
      ? activeTab
      : record?.is_joined
      ? 'discussion'
      : 'details';

  const handleTabChange = (nextTab: DetailPanelTab) => {
    if (nextTab === effectiveTab) return;
    setActiveTaskId(null);
    setActiveTab(nextTab);
  };

  useLayoutEffect(() => {
    if (!record) return;
    setActiveTaskId(null);
    setActiveTab(record.is_joined ? 'discussion' : 'details');
    setSyncedRecordId(record.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record?.id]);

  const chatLocked = useMemo(
    () => record?.status === 'resolved' && !canManage,
    [canManage, record?.status],
  );

  const adaptedTasks = useMemo(
    () => tasks.map((task) => adaptAicTaskToCaseTask(task, record?.id ?? '')),
    [record?.id, tasks],
  );

  const adaptedTaskMessages = useMemo(() => {
    const next: Record<string, CaseTaskMessage[]> = {};
    for (const [taskId, messagesForTask] of Object.entries(taskMessages)) {
      next[taskId] = messagesForTask.map(adaptAicTaskMessageToCaseTaskMessage);
    }
    return next;
  }, [taskMessages]);

  if (!record) return null;

  const hasViolationNotice = record.vn_requested || Boolean(record.linked_vn_id);
  const canShowResolve = canManage && record.status === 'open';
  const canShowRequestVN = canManage && !hasViolationNotice;

  const handleResolve = async () => {
    setResolving(true);
    try {
      await onResolve();
      showSuccessToast('AIC record marked as resolved');
    } catch (err: any) {
      showErrorToast(err?.response?.data?.error ?? 'Failed to resolve AIC record');
    } finally {
      setResolving(false);
    }
  };

  return (
    <>
      <div className="flex h-full flex-col bg-white">

        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Boxes className="h-5 w-5 shrink-0 text-primary-600" />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-900">Inventory Variance</h2>
              <p className="text-xs text-gray-500">
                AIC {String(record.aic_number).padStart(4, '0')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant="success">
              {record.status === 'open' ? 'Open' : 'Resolved'}
            </Badge>

            {/* More menu */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setMoreMenuOpen((v) => !v)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                title="More options"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              <AnimatePresence>
                {moreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-[59]" onClick={() => setMoreMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -4 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -4 }}
                      transition={{ duration: 0.12 }}
                      className="absolute right-0 top-8 z-[60] w-52 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
                    >
                    <button
                      type="button"
                      onClick={() => { setMoreMenuOpen(false); void onToggleMute(); }}
                      className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {record.is_muted
                        ? <><Bell className="h-4 w-4 text-gray-400" /> Unmute Discussion</>
                        : <><BellOff className="h-4 w-4 text-gray-400" /> Mute Discussion</>
                      }
                    </button>
                    {record.is_joined && (
                      <button
                        type="button"
                        onClick={() => { setMoreMenuOpen(false); void onLeave(); }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                      >
                        <LogOut className="h-4 w-4" />
                        Leave Discussion
                      </button>
                    )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <button
              type="button"
              onClick={onClosePanel}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <ViewToggle
          options={tabOptions}
          activeId={effectiveTab}
          onChange={(id) => handleTabChange(id as DetailPanelTab)}
          size="default"
          showIcons={true}
          showLabelOnMobile={true}
        />

        {/* ── Tab content ──────────────────────────────────────────────── */}
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <section
            className={`absolute inset-0 flex min-h-0 flex-col bg-white${effectiveTab !== 'details' ? ' hidden' : ''}`}
            aria-hidden={effectiveTab !== 'details'}
          >
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {/* Info section */}
              <section>
                <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Info
                </h3>
                <dl className="space-y-2.5">
                {record.company_name && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Company</dt>
                      <dd className="text-sm font-medium text-gray-900">{record.company_name}</dd>
                    </div>
                  </div>
                )}
                {record.branch_name && (
                  <div className="flex items-start gap-2">
                    <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Branch</dt>
                      <dd className="text-sm font-medium text-gray-900">{record.branch_name}</dd>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">AIC Date</dt>
                    <dd className="text-sm font-medium text-gray-900">{formatAicDate(record.aic_date)}</dd>
                  </div>
                </div>
                {record.status === 'resolved' && (
                  <>
                    <div className="flex items-start gap-2">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <dt className="text-xs text-gray-500">Resolved By</dt>
                        <dd className="text-sm font-medium text-gray-900">{record.resolved_by_name ?? 'Unknown'}</dd>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                      <div>
                        <dt className="text-xs text-gray-500">Resolved Date</dt>
                        <dd className="text-sm font-medium text-gray-900">{formatDate(record.resolved_at)}</dd>
                      </div>
                    </div>
                  </>
                )}
                </dl>
              </section>

              {/* Description */}
              <section>
                <SectionLabel>Description</SectionLabel>
                <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{record.reference}</p>
              </section>

              {/* Products */}
              <section>
                <SectionLabel>Products</SectionLabel>
                <AicProductsSection products={record.products} />
              </section>

              {hasViolationNotice && (
                <section>
                  <SectionLabel>Violation Notice</SectionLabel>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <FileWarning className="h-4 w-4 shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900">Violation Notice Requested</p>
                        <p className="truncate text-xs text-gray-500">Linked violation notice</p>
                      </div>
                    </div>
                    {record.linked_vn_id && (
                      <Link
                        to={`/violation-notices?vnId=${record.linked_vn_id}`}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-primary-600 ring-1 ring-gray-200 transition-colors hover:bg-primary-50 hover:text-primary-700 hover:ring-primary-200"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                </section>
              )}

              {/* Summary (only after resolved) */}
              {record.status === 'resolved' && (record.summary || record.resolution) && (
                <section>
                  <SectionLabel>Summary</SectionLabel>
                  <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700">
                    {record.summary && (
                      <div>
                        <p className="mb-1 font-semibold text-gray-800">Summary</p>
                        <p className="whitespace-pre-wrap">{record.summary}</p>
                      </div>
                    )}
                    {record.resolution && (
                      <div>
                        <p className="mb-1 font-semibold text-gray-800">Resolution</p>
                        <p className="whitespace-pre-wrap">{record.resolution}</p>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Action footer */}
            {(canShowResolve || canShowRequestVN) && (
              <div className="flex w-full flex-col gap-2 border-t border-gray-200 px-4 py-3 sm:flex-row sm:px-6">
                {canShowResolve && (
                  <Button
                    className="w-full flex-1 justify-center"
                    onClick={handleResolve}
                    disabled={resolving}
                    variant="primary"
                  >
                    {resolving ? 'Resolving…' : 'Mark as Resolved'}
                  </Button>
                )}
                {canShowRequestVN && (
                  <Button
                    className="w-full flex-1 justify-center"
                    onClick={onRequestVN}
                    variant="danger"
                  >
                    Request VN
                  </Button>
                )}
              </div>
            )}
          </section>

          {/* Discussion */}
          <section
            className={`absolute inset-0 flex min-h-0 flex-col bg-white px-4 py-3 sm:px-6 sm:py-4${effectiveTab !== 'discussion' ? ' hidden' : ''}`}
            aria-hidden={effectiveTab !== 'discussion'}
          >
            <ChatSection
              className="min-h-0 flex-1"
              messages={messages as any}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              currentUserRoleIds={currentUserRoleIds}
              users={users as any}
              roles={roles as any}
              canManage={canManage}
              chatLocked={chatLocked}
              isClosed={record.status === 'resolved'}
              closedLabel="This AIC record has been resolved"
              onSend={onSendMessage as any}
              onReact={onReactMessage}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
              onCreateTask={canManage && !chatLocked ? () => {
                setTaskModalOpen(true);
                setActiveTab('tasks');
              } : undefined}
              tasks={adaptedTasks}
              onOpenTask={async (task) => {
                await onLoadTaskMessages(task.id);
                handleTabChange('tasks');
                setActiveTaskId(task.id);
              }}
            />
          </section>

          {/* Tasks */}
          <section
            className={`absolute inset-0 flex min-h-0 flex-col overflow-hidden bg-white${effectiveTab !== 'tasks' ? ' hidden' : ''}`}
            aria-hidden={effectiveTab !== 'tasks'}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              {canManage && record.status === 'open' && (
                <div className="border-b border-gray-100 px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setTaskModalOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 py-2 text-sm font-medium text-primary-600 transition-colors hover:border-primary-400 hover:bg-primary-50"
                  >
                    <Plus className="h-4 w-4" />
                    New Task
                  </button>
                </div>
              )}
              <TaskList
                tasks={adaptedTasks}
                currentUserId={currentUserId}
                canManage={canManage}
                onTaskClick={async (task) => {
                  await onLoadTaskMessages(task.id);
                  setActiveTaskId(task.id);
                }}
                onComplete={onCompleteTask}
              />
            </div>

            <AnimatePresence>
              {activeTaskId && (() => {
                const task = tasks.find((t) => t.id === activeTaskId);
                if (!task) return null;
                return (
                  <TaskDetailPanel
                    key={activeTaskId}
                    task={adaptAicTaskToCaseTask(task, record.id)}
                    messages={adaptedTaskMessages[activeTaskId] ?? []}
                    currentUserId={currentUserId}
                    currentUserName={currentUserName}
                    currentUserRoleIds={currentUserRoleIds}
                    users={users}
                    roles={roles}
                    canManage={canManage}
                    onBack={() => setActiveTaskId(null)}
                    onComplete={onCompleteTask}
                    onSendMessage={onSendTaskMessage}
                    onReact={(taskId, messageId, emoji) => onReactToTaskMessage(taskId, messageId, emoji)}
                    onJumpToMessage={() => undefined}
                  />
                );
              })()}
            </AnimatePresence>
          </section>
        </div>
      </div>

      <TaskCreationModal
        groupedUsers={groupedUsers as any}
        isOpen={taskModalOpen}
        onSubmit={async (payload) => {
          await onCreateTask(payload);
          setTaskModalOpen(false);
        }}
        onClose={() => setTaskModalOpen(false)}
      />
    </>
  );
}
