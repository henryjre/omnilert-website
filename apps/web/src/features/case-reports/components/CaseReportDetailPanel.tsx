import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import type { CaseAttachment, CaseMessage } from '@omnilert/shared';
import {
  Bell,
  BellOff,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  File,
  FileWarning,
  GitBranch,
  LogOut,
  MoreHorizontal,
  Paperclip,
  User,
  X,
} from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { useAppToast } from '@/shared/hooks/useAppToast';
import type { CaseReportDetail, MentionableRole, MentionableUser } from '../services/caseReport.api';
import { ChatSection } from './ChatSection';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { ImagePreviewModal } from './ImagePreviewModal';
import { TextInputModal } from './TextInputModal';

interface PendingAttachment {
  tempId: string;
  fileName: string;
  previewUrl: string | null;
  isVideo: boolean;
}

function isImageFile(name: string) {
  return /\.(jpe?g|png|gif|webp|svg|bmp|heic|heif)$/i.test(name);
}

function isVideoFile(name: string) {
  return /\.(mp4|webm|ogg|mov)$/i.test(name);
}

function isMediaFile(name: string) {
  return isImageFile(name) || isVideoFile(name);
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err !== "object" || err === null) return fallback;

  const maybeResponse = (err as { response?: { data?: { error?: string; message?: string } } }).response;
  const maybeData = maybeResponse?.data;
  if (typeof maybeData?.error === "string" && maybeData.error.trim()) return maybeData.error;
  if (typeof maybeData?.message === "string" && maybeData.message.trim()) return maybeData.message;
  return fallback;
}

interface CaseReportDetailPanelProps {
  report: CaseReportDetail | null;
  messages: CaseMessage[];
  currentUserId: string;
  currentUserRoleIds?: string[];
  users: MentionableUser[];
  roles: MentionableRole[];
  canManage: boolean;
  canRequestVN: boolean;
  canClose: boolean;
  initialFlashMessageId?: string | null;
  onFlashMessageConsumed?: () => void;
  onClosePanel: () => void;
  onLeave: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onUpdateCorrectiveAction: (value: string) => Promise<void>;
  onUpdateResolution: (value: string) => Promise<void>;
  onCloseCase: () => Promise<void>;
  onRequestVN: () => Promise<void>;
  onUploadAttachment: (file: File) => Promise<void>;
  onDeleteAttachment: (attachmentId: string) => Promise<void>;
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
}

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

export function CaseReportDetailPanel({
  report,
  messages,
  currentUserId,
  currentUserRoleIds,
  users,
  roles,
  canManage,
  canRequestVN,
  canClose,
  initialFlashMessageId,
  onFlashMessageConsumed,
  onClosePanel,
  onLeave,
  onToggleMute,
  onUpdateCorrectiveAction,
  onUpdateResolution,
  onCloseCase,
  onRequestVN,
  onUploadAttachment,
  onDeleteAttachment,
  onSendMessage,
  onReactMessage,
  onEditMessage,
  onDeleteMessage,
}: CaseReportDetailPanelProps) {
  const navigate = useNavigate();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [editingField, setEditingField] = useState<'corrective_action' | 'resolution' | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(true);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [closingCase, setClosingCase] = useState(false);
  const [requestingVN, setRequestingVN] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [previewItems, setPreviewItems] = useState<{ url: string; fileName: string }[] | null>(null);
  const [previewIndex, setPreviewIndex] = useState(0);

  const chatLocked = useMemo(
    () => report?.status === 'closed' && !canManage,
    [canManage, report?.status],
  );

  const canEdit = report?.status === 'open' || canManage;
  const isCreator = report?.created_by === currentUserId;

  if (!report) return null;

  return (
    <>
      <div className="flex h-full flex-col bg-white">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <FileWarning className="h-5 w-5 shrink-0 text-primary-600" />
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold text-gray-900">{report.title}</h2>
              <p className="text-xs text-gray-500">
                Case {String(report.case_number).padStart(4, '0')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge variant={report.status === 'open' ? 'success' : 'default'}>
              {report.status === 'open' ? 'Open' : 'Closed'}
            </Badge>

            {/* ⋯ more menu */}
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
                    <div
                      className="fixed inset-0 z-[59]"
                      onClick={() => setMoreMenuOpen(false)}
                    />
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
                        {report.is_muted
                          ? <><Bell className="h-4 w-4 text-gray-400" /> Unmute Discussion</>
                          : <><BellOff className="h-4 w-4 text-gray-400" /> Mute Discussion</>
                        }
                      </button>
                      {report.is_joined && (
                        <button
                          type="button"
                          onClick={() => { setMoreMenuOpen(false); void onLeave(); }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50"
                        >
                          <LogOut className="h-4 w-4" /> Leave Discussion
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

        <div className="flex min-h-0 flex-1 flex-col">

          {/* ── Collapsible details ────────────────────────────────────── */}
          <AnimatePresence initial={false}>
            {detailsVisible && (
              <motion.div
                key="details"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: 'easeInOut' }}
                style={{ overflow: 'hidden' }}
              >
                <div className="max-h-[50vh] space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">

                  {/* ── Info ──────────────────────────────────────────── */}
                  <section>
                    <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Info
                    </h3>
                    <dl className="space-y-2.5">
                      {report.company_name && (
                        <div className="flex items-start gap-2">
                          <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                          <div>
                            <dt className="text-xs text-gray-500">Company</dt>
                            <dd className="text-sm font-medium text-gray-900">{report.company_name}</dd>
                          </div>
                        </div>
                      )}
                      <div className="flex items-start gap-2">
                        <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Branch</dt>
                          <dd className={`text-sm font-medium ${report.branch_name ? 'text-gray-900' : 'text-gray-400'}`}>
                            {report.branch_name ?? 'No branch'}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <User className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Reported by</dt>
                          <dd className="text-sm font-medium text-gray-900">
                            {report.created_by_name ?? 'Unknown'}
                          </dd>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                        <div>
                          <dt className="text-xs text-gray-500">Opened</dt>
                          <dd className="text-sm font-medium text-gray-900">{formatDate(report.created_at)}</dd>
                        </div>
                      </div>
                      {report.status === 'closed' && (
                        <>
                          <div className="flex items-start gap-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                            <div>
                              <dt className="text-xs text-gray-500">Closed by</dt>
                              <dd className="text-sm font-medium text-gray-900">
                                {report.closed_by_name ?? 'Unknown'}
                              </dd>
                            </div>
                          </div>
                          <div className="flex items-start gap-2">
                            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                            <div>
                              <dt className="text-xs text-gray-500">Closed</dt>
                              <dd className="text-sm font-medium text-gray-900">{formatDate(report.closed_at)}</dd>
                            </div>
                          </div>
                        </>
                      )}
                    </dl>
                  </section>

                  {/* ── Description ───────────────────────────────────── */}
                  <section>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      Description
                    </h3>
                    <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {report.description}
                    </p>
                  </section>

                  {/* ── Corrective Action ─────────────────────────────── */}
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Corrective Action
                      </h3>
                      {(isCreator || canManage) && canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingField('corrective_action')}>
                          {report.corrective_action ? 'Edit' : 'Add'}
                        </Button>
                      )}
                    </div>
                    <p className={`break-all whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm leading-6 ${
                      report.corrective_action
                        ? 'border-gray-200 bg-gray-50 text-gray-700'
                        : 'border-dashed border-gray-200 bg-transparent text-gray-400'
                    }`}>
                      {report.corrective_action || 'Not yet added'}
                    </p>
                  </section>

                  {/* ── Resolution ────────────────────────────────────── */}
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Resolution
                      </h3>
                      {(isCreator || canManage) && canEdit && (
                        <Button variant="ghost" size="sm" onClick={() => setEditingField('resolution')}>
                          {report.resolution ? 'Edit' : 'Add'}
                        </Button>
                      )}
                    </div>
                    <p className={`break-all whitespace-pre-wrap rounded-xl border px-4 py-3 text-sm leading-6 ${
                      report.resolution
                        ? 'border-gray-200 bg-gray-50 text-gray-700'
                        : 'border-dashed border-gray-200 bg-transparent text-gray-400'
                    }`}>
                      {report.resolution || 'Not yet added'}
                    </p>
                  </section>

                  {/* ── Attachments ───────────────────────────────────── */}
                  <section>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Attachments
                      </h3>
                      {(isCreator || canManage) && canEdit && (
                        <Button variant="secondary" size="sm" onClick={() => attachmentInputRef.current?.click()}>
                          <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                          Add File
                        </Button>
                      )}
                    </div>
                    {(() => {
                      const mediaAttachments: CaseAttachment[] = report.attachments.filter((a) => isMediaFile(a.file_name));
                      const docAttachments: CaseAttachment[] = report.attachments.filter((a) => !isMediaFile(a.file_name));
                      const allMediaItems = mediaAttachments.map((a) => ({ url: a.file_url, fileName: a.file_name }));

                      return (
                        <div className="space-y-3">
                          {/* Media gallery */}
                          {(mediaAttachments.length > 0 || pendingAttachments.some((p) => p.isVideo || p.previewUrl)) && (
                            <div className="flex flex-wrap gap-2">
                              {/* Confirmed media */}
                              {mediaAttachments.map((attachment, idx) => (
                                <div key={attachment.id} className="group relative">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setPreviewItems(allMediaItems);
                                      setPreviewIndex(idx);
                                    }}
                                    className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200 bg-gray-100"
                                  >
                                    {isVideoFile(attachment.file_name) ? (
                                      <video src={attachment.file_url} className="h-full w-full object-cover" muted />
                                    ) : (
                                      <img src={attachment.file_url} alt={attachment.file_name} className="h-full w-full object-cover" />
                                    )}
                                  </button>
                                  {(isCreator || canManage) && (
                                    <button
                                      type="button"
                                      onClick={() => void onDeleteAttachment(attachment.id)}
                                      className="absolute -right-1 -top-1 hidden rounded-full bg-white p-0.5 text-gray-400 shadow hover:text-red-500 group-hover:flex"
                                      title="Remove"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {/* Pending (uploading) media */}
                              {pendingAttachments.filter((p) => p.previewUrl || p.isVideo).map((p) => (
                                <div key={p.tempId} className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
                                  {p.previewUrl && (
                                    p.isVideo
                                      ? <video src={p.previewUrl} className="h-full w-full object-cover opacity-50" muted />
                                      : <img src={p.previewUrl} alt={p.fileName} className="h-full w-full object-cover opacity-50" />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Document pills */}
                          {(docAttachments.length > 0 || pendingAttachments.filter((p) => !p.previewUrl && !p.isVideo).length > 0) && (
                            <div className="flex flex-wrap gap-2">
                              {docAttachments.map((attachment) => (
                                <div key={attachment.id} className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 py-1.5 pl-2.5 pr-1">
                                  <File className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                                  <a
                                    href={attachment.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="max-w-[160px] truncate text-sm text-primary-700 hover:underline"
                                  >
                                    {attachment.file_name}
                                  </a>
                                  {(isCreator || canManage) && (
                                    <button
                                      type="button"
                                      onClick={() => void onDeleteAttachment(attachment.id)}
                                      className="ml-0.5 rounded-full p-0.5 text-gray-400 hover:bg-red-100 hover:text-red-500"
                                      title="Remove"
                                    >
                                      <X className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {/* Pending doc pills */}
                              {pendingAttachments.filter((p) => !p.previewUrl && !p.isVideo).map((p) => (
                                <div key={p.tempId} className="flex animate-pulse items-center gap-1.5 rounded-xl border border-gray-200 bg-gray-100 py-1.5 pl-2.5 pr-3">
                                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                                  <span className="max-w-[140px] truncate text-sm text-gray-400">{p.fileName}</span>
                                </div>
                              ))}
                            </div>
                          )}

                          {report.attachments.length === 0 && pendingAttachments.length === 0 && (
                            <p className="text-sm text-gray-400">No attachments yet</p>
                          )}
                        </div>
                      );
                    })()}
                    <input
                      ref={attachmentInputRef}
                      type="file"
                      accept="application/pdf,image/*,video/*"
                      className="hidden"
                      onChange={async (event) => {
                        let file = event.target.files?.[0];
                        event.target.value = '';
                        if (!file) return;

                        file = await normalizeFileForUpload(file);

                        const isVid = isVideoFile(file.name);
                        const isImg = isImageFile(file.name);
                        const previewUrl = (isVid || isImg) ? URL.createObjectURL(file) : null;
                        const tempId = `pending-${Date.now()}`;
                        setPendingAttachments((prev) => [...prev, { tempId, fileName: file.name, previewUrl, isVideo: isVid }]);
                        try {
                          await onUploadAttachment(file);
                        } finally {
                          setPendingAttachments((prev) => prev.filter((p) => p.tempId !== tempId));
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                        }
                      }}
                    />
                  </section>

                  {/* ── Linked VN ─────────────────────────────────────── */}
                  {report.linked_vn_id && (
                    <section>
                      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                        Violation Notice
                      </h3>
                      <button
                        type="button"
                        onClick={() => navigate(`/violation-notices?vnId=${report.linked_vn_id}`)}
                        className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Violation Notice
                      </button>
                    </section>
                  )}

                </div>

                {/* ── Action footer (inside collapsible) ──────────────── */}
                {((isCreator || canManage) && report.status !== 'closed') || (canRequestVN && !report.vn_requested && !report.linked_vn_id) ? (
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3 sm:px-6">
                    {(isCreator || canManage) && report.status !== 'closed' && (
                      <Button
                        disabled={closingCase || !canClose || !report.corrective_action || !report.resolution}
                        onClick={async () => {
                          setClosingCase(true);
                          try {
                            await onCloseCase();
                            showSuccessToast("Case closed successfully.");
                          } catch (err: unknown) {
                            const message = getApiErrorMessage(err, "Failed to close case.");
                            showErrorToast(message);
                          } finally {
                            setClosingCase(false);
                          }
                        }}
                      >
                        {closingCase ? 'Closing…' : 'Close Case'}
                      </Button>
                    )}
                    {canRequestVN && !report.vn_requested && !report.linked_vn_id && (
                      <Button
                        variant="danger"
                        disabled={requestingVN}
                        onClick={async () => {
                          setRequestingVN(true);
                          try {
                            await onRequestVN();
                            showSuccessToast("Violation notice requested.");
                          } catch (err: unknown) {
                            const message = getApiErrorMessage(err, "Failed to request violation notice.");
                            showErrorToast(message);
                          } finally {
                            setRequestingVN(false);
                          }
                        }}
                      >
                        {requestingVN ? 'Requesting…' : 'Request VN'}
                      </Button>
                    )}
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Chat area ───────────────────────────────────────────────── */}
          <div className="flex min-h-0 flex-1 flex-col border-t border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
            {/* Toggle bar */}
            <div className="mb-2 flex justify-center">
              <button
                type="button"
                onClick={() => setDetailsVisible((v) => !v)}
                className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600"
              >
                <motion.span
                  animate={{ rotate: detailsVisible ? 180 : 0 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  style={{ display: 'inline-flex' }}
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
                {detailsVisible ? 'Hide details' : 'Show details'}
              </button>
            </div>
            <ChatSection
              className="min-h-0 flex-1"
              messages={messages}
              currentUserId={currentUserId}
              currentUserRoleIds={currentUserRoleIds}
              canManage={canManage}
              chatLocked={chatLocked}
              isClosed={report.status === 'closed'}
              users={users}
              roles={roles}
              initialFlashMessageId={initialFlashMessageId}
              onFlashMessageConsumed={onFlashMessageConsumed}
              onSend={onSendMessage}
              onReact={onReactMessage}
              onEdit={onEditMessage}
              onDelete={onDeleteMessage}
            />
          </div>
        </div>
      </div>

      <TextInputModal
        isOpen={editingField === 'corrective_action'}
        title="Corrective Action"
        initialValue={report.corrective_action}
        onClose={() => setEditingField(null)}
        onSubmit={onUpdateCorrectiveAction}
      />
      <TextInputModal
        isOpen={editingField === 'resolution'}
        title="Resolution"
        initialValue={report.resolution}
        onClose={() => setEditingField(null)}
        onSubmit={onUpdateResolution}
      />
      <ImagePreviewModal
        items={previewItems}
        index={previewIndex}
        onIndexChange={setPreviewIndex}
        onClose={() => setPreviewItems(null)}
      />
    </>
  );
}
