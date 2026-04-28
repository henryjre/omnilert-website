import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  ViolationNoticeDetail,
  ViolationNoticeMessage,
  ViolationNoticeStatus,
  ViolationNoticeCategory,
} from '@omnilert/shared';
import {
  Bell,
  BellOff,
  Building2,
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  File,
  FileCheck,
  FileText,
  FileX,
  GitBranch,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  TrendingDown,
  TriangleAlert,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/shared/components/ui/Badge';
import { Button } from '@/shared/components/ui/Button';
import { ViewToggle } from '@/shared/components/ui/ViewToggle';
import { useAppToast } from '@/shared/hooks/useAppToast';
import type { MentionableRole, MentionableUser } from '../../case-reports/services/caseReport.api';
import { ChatSection } from '../../case-reports/components/ChatSection';
import { ImagePreviewModal } from '../../case-reports/components/ImagePreviewModal';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import {
  confirmVN,
  rejectVN,
  issueVN,
  completeVN,
  uploadIssuanceFile,
  uploadDisciplinaryFile,
  confirmIssuance,
} from '../services/violationNotice.api';

export interface SendMessagePayload {
  content: string;
  parentMessageId?: string | null;
  mentionedUserIds: string[];
  mentionedRoleIds: string[];
  files: File[];
}

interface ViolationNoticeDetailPanelProps {
  vn: ViolationNoticeDetail;
  messages: ViolationNoticeMessage[];
  onClose: () => void;
  onUpdate: (vn: ViolationNoticeDetail) => void;
  onSilentRefetch: () => void;
  onLeave?: () => Promise<void>;
  onToggleMute?: () => Promise<void>;
  onSendMessage: (payload: SendMessagePayload) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  mentionables: { users: MentionableUser[]; roles: MentionableRole[] };
  initialFlashMessageId?: string | null;
  onFlashMessageConsumed?: () => void;
  canConfirm: boolean;
  canReject: boolean;
  canIssue: boolean;
  canComplete: boolean;
  canManage: boolean;
  currentUserId: string;
  currentUserRoleIds?: string[];
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

const detailPanelTabSlideTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 30,
} as const;

type DetailPanelTab = 'details' | 'discussion';

function getStatusVariant(status: ViolationNoticeStatus): 'success' | 'danger' | 'warning' | 'default' {
  switch (status) {
    case 'queued': return 'warning';
    case 'discussion': return 'default';
    case 'issuance': return 'warning';
    case 'disciplinary_meeting': return 'default';
    case 'completed': return 'success';
    case 'rejected': return 'danger';
    default: return 'default';
  }
}

function formatStatus(status: ViolationNoticeStatus): string {
  return status.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function formatCategory(category: ViolationNoticeCategory): string {
  switch (category) {
    case 'manual': return 'Manual';
    case 'case_reports': return 'Case Report';
    case 'store_audits': return 'Store Audit';
    default: return category;
  }
}

function isImageFile(name: string) {
  return /\.(jpe?g|png|gif|webp|svg|bmp|heic|heif)$/i.test(name);
}

function isVideoFile(name: string) {
  return /\.(mp4|webm|ogg|mov)$/i.test(name);
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err !== 'object' || err === null) return fallback;

  const maybeResponse = (err as { response?: { data?: { error?: string; message?: string } } }).response;
  const maybeData = maybeResponse?.data;
  if (typeof maybeData?.error === 'string' && maybeData.error.trim()) return maybeData.error;
  if (typeof maybeData?.message === 'string' && maybeData.message.trim()) return maybeData.message;
  return fallback;
}

interface PendingFile {
  tempId: string;
  fileName: string;
  previewUrl: string | null;
  isVideo: boolean;
}

export function ViolationNoticeDetailPanel({
  vn,
  messages,
  onClose,
  onUpdate,
  onSilentRefetch,
  onLeave,
  onToggleMute,
  onSendMessage,
  onEditMessage,
  onDeleteMessage,
  onToggleReaction,
  mentionables,
  initialFlashMessageId,
  onFlashMessageConsumed,
  canConfirm,
  canReject,
  canIssue,
  canComplete,
  canManage,
  currentUserId,
  currentUserRoleIds,
}: ViolationNoticeDetailPanelProps) {
  const navigate = useNavigate();
  const { success: showSuccessToast, error: showErrorToast } = useAppToast();
  const issuanceFileRef = useRef<HTMLInputElement | null>(null);
  const disciplinaryFileRef = useRef<HTMLInputElement | null>(null);

  const [rejectMode, setRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [epiDecrease, setEpiDecrease] = useState<number>(0);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  // Disciplinary proof preview
  const [pendingDisciplinaryFiles, setPendingDisciplinaryFiles] = useState<PendingFile[]>([]);
  const [disciplinaryPreviewItems, setDisciplinaryPreviewItems] = useState<{ url: string; fileName: string }[] | null>(null);
  const [disciplinaryPreviewIndex, setDisciplinaryPreviewIndex] = useState(0);

  const [activeTabState, setActiveTabState] = useState<{
    vnId: string;
    tab: DetailPanelTab;
  }>(() => ({ vnId: vn.id, tab: 'details' }));
  const activeTab = activeTabState.vnId === vn.id ? activeTabState.tab : 'details';

  // Reset to the details tab whenever a different violation notice opens.
  useEffect(() => {
    setActiveTabState({ vnId: vn.id, tab: 'details' });
  }, [vn.id]);

  // Adapt VN messages to CaseMessage shape expected by ChatSection
  const adaptedMessages = messages.map((msg) => ({
    ...msg,
    is_system: msg.type === 'system',
    violation_notice_id: undefined,
  }));

  async function handleConfirm() {
    setActionLoading(true);
    try {
      const updated = await confirmVN(vn.id);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      showSuccessToast("Violation notice confirmed.");
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, "Failed to confirm violation notice."));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectConfirm() {
    if (!rejectionReason.trim()) return;
    setActionLoading(true);
    try {
      const updated = await rejectVN(vn.id, rejectionReason.trim());
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      setRejectMode(false);
      setRejectionReason('');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIssue() {
    setActionLoading(true);
    try {
      const updated = await issueVN(vn.id);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      showSuccessToast("Violation notice issued.");
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, "Failed to issue violation notice."));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAdvanceToDisciplinary() {
    setActionLoading(true);
    try {
      const updated = await confirmIssuance(vn.id);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      showSuccessToast("Advanced to disciplinary meeting.");
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, "Failed to advance to disciplinary meeting."));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleComplete() {
    setActionLoading(true);
    try {
      const updated = await completeVN(vn.id, epiDecrease);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      showSuccessToast("Violation notice completed.");
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, "Failed to complete violation notice."));
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIssuanceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (vn.issuance_file_name === file.name && vn.issuance_file_url) {
      if (issuanceFileRef.current) issuanceFileRef.current.value = '';
      return;
    }
    setActionLoading(true);
    try {
      const updated = await uploadIssuanceFile(vn.id, file);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      showSuccessToast("Issuance document uploaded.");
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, "Failed to upload issuance document."));
    } finally {
      setActionLoading(false);
      if (issuanceFileRef.current) issuanceFileRef.current.value = '';
    }
  }

  async function handleDisciplinaryFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    let file = e.target.files?.[0];
    if (!file) return;
    file = await normalizeFileForUpload(file);
    if (vn.disciplinary_file_name === file.name && vn.disciplinary_file_url) {
      if (disciplinaryFileRef.current) disciplinaryFileRef.current.value = '';
      return;
    }

    const isVid = isVideoFile(file.name);
    const isImg = isImageFile(file.name);
    const previewUrl = (isVid || isImg) ? URL.createObjectURL(file) : null;
    const tempId = `pending-${Date.now()}`;
    setPendingDisciplinaryFiles((prev) => [...prev, { tempId, fileName: file!.name, previewUrl, isVideo: isVid }]);

    setActionLoading(true);
    try {
      const updated = await uploadDisciplinaryFile(vn.id, file);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
      showSuccessToast("Disciplinary proof uploaded.");
    } catch (err: unknown) {
      showErrorToast(getApiErrorMessage(err, "Failed to upload disciplinary proof."));
    } finally {
      setActionLoading(false);
      setPendingDisciplinaryFiles((prev) => prev.filter((p) => p.tempId !== tempId));
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (disciplinaryFileRef.current) disciplinaryFileRef.current.value = '';
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">
              VN-{String(vn.vn_number).padStart(4, '0')}
            </h2>
            <p className="text-xs text-gray-500">{formatCategory(vn.category)}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={getStatusVariant(vn.status)}>{formatStatus(vn.status)}</Badge>

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
                    {onToggleMute && (
                      <button
                        type="button"
                        onClick={() => { setMoreMenuOpen(false); void onToggleMute(); }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        {vn.is_muted
                          ? <><Bell className="h-4 w-4 text-gray-400" /> Unmute Discussion</>
                          : <><BellOff className="h-4 w-4 text-gray-400" /> Mute Discussion</>
                        }
                      </button>
                    )}
                    {onLeave && vn.is_joined && (
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
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* ── Tab bar ─────────────────────────────────────────────────────────── */}
      <ViewToggle
        options={[
          { id: 'details', label: 'Details', icon: FileText },
          { id: 'discussion', label: 'Discussion', icon: MessageCircle },
        ]}
        activeId={activeTab}
        onChange={(id) => {
          if (id === activeTab) return;
          setActiveTabState({ vnId: vn.id, tab: id as DetailPanelTab });
        }}
        size="default"
        showIcons={true}
        showLabelOnMobile={true}
      />

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <AnimatePresence initial={false}>
          {activeTab === 'details' && (
        <motion.div
          key={`vn-details-${vn.id}`}
          initial={{ x: '-100%', opacity: 0 }}
          animate={{ x: '0%', opacity: 1 }}
          exit={{ x: '-100%', opacity: 0 }}
          transition={detailPanelTabSlideTransition}
          className="absolute inset-0 flex min-h-0 flex-col bg-white"
          style={{
            willChange: 'transform',
          }}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">

            {/* ── Info ──────────────────────────────────────────────── */}
            <section>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Info</h3>
              <dl className="space-y-2.5">
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Target Employees</dt>
                    <dd className="mt-1 flex flex-wrap gap-1.5">
                      {vn.targets.length === 0 ? (
                        <span className="text-sm text-gray-400">No targets assigned</span>
                      ) : (
                        vn.targets.map((target) => (
                          <span
                            key={target.id}
                            className="inline-flex items-center rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800 ring-1 ring-amber-200"
                          >
                            {target.user_name ?? 'Unknown'}
                          </span>
                        ))
                      )}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Created by</dt>
                    <dd className="text-sm font-medium text-gray-900">{vn.created_by_name ?? 'Unknown'}</dd>
                  </div>
                </div>
                {vn.company_name && (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Company</dt>
                      <dd className="text-sm font-medium text-gray-900">{vn.company_name}</dd>
                    </div>
                  </div>
                )}
                {vn.branch_name && (
                  <div className="flex items-start gap-2">
                    <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                    <div>
                      <dt className="text-xs text-gray-500">Branch</dt>
                      <dd className="text-sm font-medium text-gray-900">{vn.branch_name}</dd>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                  <div>
                    <dt className="text-xs text-gray-500">Filed</dt>
                    <dd className="text-sm font-medium text-gray-900">{formatDate(vn.created_at)}</dd>
                  </div>
                </div>
              </dl>
            </section>

            {/* ── Description ──────────────────────────────────────── */}
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Description</h3>
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{vn.description}</p>
            </section>

            {/* ── Linked source ────────────────────────────────────── */}
            {(vn.source_case_report_id || vn.source_store_audit_id) && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Linked Source</h3>
                {vn.source_case_report_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/case-reports?caseId=${vn.source_case_report_id}`)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Case Report
                  </button>
                )}
                {vn.source_store_audit_id && (
                  <button
                    type="button"
                    onClick={() => navigate(`/store-audits?auditId=${vn.source_store_audit_id}`)}
                    className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Store Audit
                  </button>
                )}
              </section>
            )}

            {/* ── Issuance PDF ─────────────────────────────────────── */}
            {(vn.status === 'issuance' || vn.issuance_file_url) && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Issuance Document
                </h3>
                <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-3">
                  {vn.issuance_file_url ? (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
                        <FileText className="h-5 w-5 text-amber-500" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <a
                          href={vn.issuance_file_url}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-sm font-medium text-primary-700 hover:underline"
                        >
                          {vn.issuance_file_name ?? 'Issuance File'}
                        </a>
                        <p className="text-xs text-gray-400">PDF Document</p>
                      </div>
                      {canIssue && vn.status === 'issuance' && (
                        <button
                          type="button"
                          onClick={() => issuanceFileRef.current?.click()}
                          disabled={actionLoading}
                          className="shrink-0 text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
                        >
                          Replace
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
                        <FileText className="h-5 w-5 text-gray-300" />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-400 italic">No issuance document yet</p>
                      </div>
                      {canIssue && vn.status === 'issuance' && (
                        <button
                          type="button"
                          onClick={() => issuanceFileRef.current?.click()}
                          disabled={actionLoading}
                          className="shrink-0 text-xs text-amber-600 hover:text-amber-700 underline font-medium disabled:opacity-50"
                        >
                          Upload PDF
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <input
                  ref={issuanceFileRef}
                  type="file"
                  accept="application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleIssuanceFileChange(e)}
                />
                {canIssue && vn.status === 'issuance' && vn.issuance_file_url && (
                  <div className="mt-3">
                    <Button onClick={() => void handleAdvanceToDisciplinary()} disabled={actionLoading}>
                      Advance to Disciplinary Meeting
                    </Button>
                  </div>
                )}
              </section>
            )}

            {/* ── Disciplinary Meeting ─────────────────────────────── */}
            {(vn.status === 'disciplinary_meeting' || vn.disciplinary_file_url) && (
              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Disciplinary Meeting Proof
                </h3>

                {(() => {
                  const confirmedItems = vn.disciplinary_file_url
                    ? [{ url: vn.disciplinary_file_url, fileName: vn.disciplinary_file_name ?? 'Proof' }]
                    : [];
                  const hasMedia = confirmedItems.length > 0 || pendingDisciplinaryFiles.length > 0;

                  return (
                    <div className="space-y-3">
                      {hasMedia ? (
                        <div className="flex flex-wrap gap-2">
                          {confirmedItems.map((item, idx) => (
                            <div key={item.url} className="group relative">
                              <button
                                type="button"
                                onClick={() => {
                                  setDisciplinaryPreviewItems(confirmedItems);
                                  setDisciplinaryPreviewIndex(idx);
                                }}
                                className="relative h-20 w-20 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 hover:border-amber-300"
                              >
                                {isVideoFile(item.fileName) ? (
                                  <video src={item.url} className="h-full w-full object-cover" muted />
                                ) : isImageFile(item.fileName) ? (
                                  <img src={item.url} alt={item.fileName} className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 bg-gray-50 text-gray-400">
                                    <File className="h-5 w-5" />
                                    <span className="max-w-[4.5rem] truncate px-1 text-[10px]">{item.fileName}</span>
                                  </div>
                                )}
                                <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/15 rounded-xl" />
                              </button>
                            </div>
                          ))}

                          {pendingDisciplinaryFiles.map((p) => (
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
                      ) : (
                        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-3">
                          <p className="text-sm text-gray-400 italic">No proof uploaded yet</p>
                        </div>
                      )}

                      {vn.status === 'disciplinary_meeting' && (
                        <button
                          type="button"
                          onClick={() => disciplinaryFileRef.current?.click()}
                          disabled={actionLoading}
                          className="text-xs text-amber-600 hover:text-amber-700 underline font-medium disabled:opacity-50"
                        >
                          {vn.disciplinary_file_url ? 'Replace Proof' : 'Upload Proof'}
                        </button>
                      )}
                    </div>
                  );
                })()}

                <input
                  ref={disciplinaryFileRef}
                  type="file"
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  style={{ display: 'none' }}
                  onChange={(e) => void handleDisciplinaryFileChange(e)}
                />

                {canComplete && vn.status === 'disciplinary_meeting' && vn.disciplinary_file_url && (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">EPI Decrease (0–5)</label>
                      <input
                        type="number"
                        min={0}
                        max={5}
                        step={0.5}
                        value={epiDecrease}
                        onChange={(e) => setEpiDecrease(Math.min(5, Math.max(0, Number(e.target.value))))}
                        className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                      <p className="mt-1 text-xs text-gray-500">Amount to deduct from employee's EPI score.</p>
                    </div>
                    <Button onClick={() => void handleComplete()} disabled={actionLoading}>
                      Complete VN
                    </Button>
                  </div>
                )}
              </section>
            )}

            {/* ── Status action area ──────────────────────────────── */}
            <section>
              {vn.status === 'queued' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canConfirm && (
                    <Button className="w-full justify-center sm:w-auto" onClick={() => void handleConfirm()} disabled={actionLoading}>
                      Confirm VN
                    </Button>
                  )}
                  {canReject && !rejectMode && (
                    <Button variant="danger" className="w-full justify-center sm:w-auto" onClick={() => setRejectMode(true)} disabled={actionLoading}>
                      Reject
                    </Button>
                  )}
                </div>
              )}

              {vn.status === 'discussion' && (
                <div className="flex flex-col gap-2 sm:flex-row">
                  {canIssue && (
                    <Button className="w-full justify-center sm:w-auto" onClick={() => void handleIssue()} disabled={actionLoading}>
                      Issue VN
                    </Button>
                  )}
                  {canReject && !rejectMode && (
                    <Button variant="danger" className="w-full justify-center sm:w-auto" onClick={() => setRejectMode(true)} disabled={actionLoading}>
                      Reject VN
                    </Button>
                  )}
                </div>
              )}

              {vn.status === 'completed' && (
                <div className="rounded-2xl bg-green-50 px-4 py-3 text-sm text-gray-700 space-y-2">
                  {vn.confirmed_by_name && (
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 shrink-0 text-green-500" />
                      <span>Confirmed by <span className="font-medium">{vn.confirmed_by_name}</span></span>
                    </div>
                  )}
                  {vn.issued_by_name && (
                    <div className="flex items-center gap-2">
                      <FileCheck className="h-4 w-4 shrink-0 text-green-500" />
                      <span>Issued by <span className="font-medium">{vn.issued_by_name}</span></span>
                    </div>
                  )}
                  {vn.completed_by_name && (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                      <span>Completed by <span className="font-medium">{vn.completed_by_name}</span></span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1 pt-2 border-t border-green-100">
                    <TrendingDown className={`h-4 w-4 shrink-0 ${vn.epi_decrease != null && vn.epi_decrease > 0 ? 'text-red-400' : 'text-gray-400'}`} />
                    <span>EPI Decrease:</span>
                    {vn.epi_decrease != null && vn.epi_decrease > 0
                      ? <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">-{vn.epi_decrease} pts</span>
                      : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">None</span>
                    }
                  </div>
                </div>
              )}

              {vn.status === 'rejected' && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-gray-700 space-y-2">
                  {vn.rejection_reason && (
                    <div className="flex items-start gap-2">
                      <FileX className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <span><span className="font-medium">Reason: </span>{vn.rejection_reason}</span>
                    </div>
                  )}
                  {vn.rejected_by_name && (
                    <div className="flex items-center gap-2">
                      <UserCheck className="h-4 w-4 shrink-0 text-red-400" />
                      <span>Rejected by <span className="font-medium">{vn.rejected_by_name}</span></span>
                    </div>
                  )}
                </div>
              )}

              {rejectMode && (
                <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-red-700">Provide a rejection reason:</p>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
                    placeholder="Enter reason for rejection..."
                  />
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      variant="danger"
                      className="w-full justify-center sm:w-auto"
                      onClick={() => void handleRejectConfirm()}
                      disabled={actionLoading || !rejectionReason.trim()}
                    >
                      Confirm Rejection
                    </Button>
                    <Button
                      variant="secondary"
                      className="w-full justify-center sm:w-auto"
                      onClick={() => { setRejectMode(false); setRejectionReason(''); }}
                      disabled={actionLoading}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </motion.div>
          )}

          {activeTab === 'discussion' && (
        <motion.div
          key={`vn-discussion-${vn.id}`}
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: '0%', opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={detailPanelTabSlideTransition}
          style={{
            willChange: 'transform',
          }}
          className="absolute inset-0 z-10 flex min-h-0 flex-1 flex-col bg-white px-4 py-3 sm:px-6 sm:py-4"
        >
          <ChatSection
            className="min-h-0 flex-1"
            messages={adaptedMessages as unknown as Parameters<typeof ChatSection>[0]['messages']}
            currentUserId={currentUserId}
            currentUserRoleIds={currentUserRoleIds}
            canManage={canManage}
            chatLocked={false}
            isClosed={vn.status === 'completed' && !canManage}
            closedLabel="Violation Notice Complete"
            users={mentionables.users}
            roles={mentionables.roles}
            initialFlashMessageId={initialFlashMessageId}
            onFlashMessageConsumed={onFlashMessageConsumed}
            onSend={onSendMessage}
            onReact={onToggleReaction}
            onEdit={onEditMessage}
            onDelete={onDeleteMessage}
          />
        </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Disciplinary proof lightbox */}
      <ImagePreviewModal
        items={disciplinaryPreviewItems}
        index={disciplinaryPreviewIndex}
        onIndexChange={setDisciplinaryPreviewIndex}
        onClose={() => setDisciplinaryPreviewItems(null)}
      />
    </div>
  );
}
