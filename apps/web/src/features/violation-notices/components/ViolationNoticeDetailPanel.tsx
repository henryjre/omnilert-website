import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type {
  ViolationNoticeDetail,
  ViolationNoticeMessage,
  ViolationNoticeStatus,
  ViolationNoticeCategory,
} from '@omnilert/shared';
import { CheckCircle2, ChevronDown, ExternalLink, FileCheck, FileX, TriangleAlert, UserCheck, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/shared/components/ui/Button';
import type { MentionableRole, MentionableUser } from '../../case-reports/services/caseReport.api';
import { ChatSection } from '../../case-reports/components/ChatSection';
import { ImagePreviewModal } from '../../case-reports/components/ImagePreviewModal';
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
  // Chat handlers
  onSendMessage: (payload: SendMessagePayload) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onToggleReaction: (messageId: string, emoji: string) => Promise<void>;
  mentionables: { users: MentionableUser[]; roles: MentionableRole[] };
  initialFlashMessageId?: string | null;
  onFlashMessageConsumed?: () => void;
  // Permissions
  canConfirm: boolean;
  canReject: boolean;
  canIssue: boolean;
  canComplete: boolean;
  canManage: boolean;
  // Current user context
  currentUserId: string;
  currentUserRoleIds?: string[];
}

function formatDate(value: string | null) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleString();
}

function formatStatus(status: ViolationNoticeStatus): string {
  return status
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getStatusClasses(status: ViolationNoticeStatus): string {
  switch (status) {
    case 'queued':
      return 'bg-yellow-100 text-yellow-800';
    case 'discussion':
      return 'bg-blue-100 text-blue-800';
    case 'issuance':
      return 'bg-orange-100 text-orange-800';
    case 'disciplinary_meeting':
      return 'bg-purple-100 text-purple-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'rejected':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function formatCategory(category: ViolationNoticeCategory): string {
  switch (category) {
    case 'manual':
      return 'Manual';
    case 'case_reports':
      return 'Case Report';
    case 'store_audits':
      return 'Store Audit';
    default:
      return category;
  }
}

export function ViolationNoticeDetailPanel({
  vn,
  messages,
  onClose,
  onUpdate,
  onSilentRefetch,
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
  const issuanceFileRef = useRef<HTMLInputElement | null>(null);
  const disciplinaryFileRef = useRef<HTMLInputElement | null>(null);

  const [detailsVisible, setDetailsVisible] = useState(true);
  const [rejectMode, setRejectMode] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [disciplinaryPreviewOpen, setDisciplinaryPreviewOpen] = useState(false);
  const [epiDecrease, setEpiDecrease] = useState<number>(0);

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
    } finally {
      setActionLoading(false);
    }
  }

  async function handleIssuanceFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Skip upload if same file name and size as the already stored file
    if (
      vn.issuance_file_name === file.name &&
      vn.issuance_file_url
    ) {
      if (issuanceFileRef.current) issuanceFileRef.current.value = '';
      return;
    }
    setActionLoading(true);
    try {
      const updated = await uploadIssuanceFile(vn.id, file);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
    } finally {
      setActionLoading(false);
      if (issuanceFileRef.current) issuanceFileRef.current.value = '';
    }
  }

  async function handleDisciplinaryFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Skip upload if same file name as the already stored file
    if (
      vn.disciplinary_file_name === file.name &&
      vn.disciplinary_file_url
    ) {
      if (disciplinaryFileRef.current) disciplinaryFileRef.current.value = '';
      return;
    }
    setActionLoading(true);
    try {
      const updated = await uploadDisciplinaryFile(vn.id, file);
      onUpdate({ ...vn, ...updated });
      onSilentRefetch();
    } finally {
      setActionLoading(false);
      if (disciplinaryFileRef.current) disciplinaryFileRef.current.value = '';
    }
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Fixed header */}
      <div className="flex items-start justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div>
          <div className="flex items-center gap-3">
            <TriangleAlert className="h-5 w-5 text-primary-600" />
            <h2 className="text-xl font-semibold text-gray-900">
              VN-{String(vn.vn_number).padStart(4, '0')}
            </h2>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusClasses(vn.status)}`}
            >
              {formatStatus(vn.status)}
            </span>
          </div>
          {/* Metadata row */}
          <p className="mt-1 text-sm text-gray-500">
            <span className="hidden sm:inline">Created by </span>
            <span>{vn.created_by_name ?? 'Unknown'}</span>
            <span className="mx-1 text-gray-300 sm:hidden"> · </span>
            <span className="hidden sm:inline"> on {formatDate(vn.created_at)}</span>
            <span className="block text-xs text-gray-400 sm:hidden">{formatDate(vn.created_at)}</span>
            <span className="mx-1 text-gray-300">·</span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {formatCategory(vn.category)}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
        {/* Collapsible details section */}
        <AnimatePresence initial={false}>
          {detailsVisible && (
            <motion.div
              key="details"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
              className="space-y-4 px-4 py-3 sm:px-6 sm:py-5"
            >
              {/* Description */}
              <section>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Description</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">{vn.description}</p>
              </section>

              {/* Target employees */}
              {vn.targets.length > 0 && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Target Employees</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {vn.targets.map((target) => (
                      <span
                        key={target.id}
                        className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-700"
                      >
                        {target.user_name ?? 'Unknown'}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {/* Linked source */}
              {vn.source_case_report_id && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Linked Source</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/case-reports?caseId=${vn.source_case_report_id}`)}
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Case Report
                  </button>
                </section>
              )}
              {vn.source_store_audit_id && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Linked Source</p>
                  <button
                    type="button"
                    onClick={() => navigate(`/store-audits?auditId=${vn.source_store_audit_id}`)}
                    className="mt-2 inline-flex items-center gap-1 text-sm text-primary-700 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View Store Audit
                  </button>
                </section>
              )}

              {/* Issuance PDF section */}
              {(vn.status === 'issuance' || vn.issuance_file_url) && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Issuance PDF</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {vn.issuance_file_url ? (
                      <a
                        href={vn.issuance_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-sm text-primary-700 hover:underline"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {vn.issuance_file_name ?? 'Issuance File'}
                      </a>
                    ) : (
                      <span className="text-sm text-gray-400 italic">No file uploaded yet</span>
                    )}
                    {canIssue && vn.status === 'issuance' && (
                      <button
                        type="button"
                        onClick={() => issuanceFileRef.current?.click()}
                        disabled={actionLoading}
                        className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
                      >
                        {vn.issuance_file_url ? 'Replace' : 'Upload PDF'}
                      </button>
                    )}
                    <input
                      ref={issuanceFileRef}
                      type="file"
                      accept="application/pdf"
                      style={{ display: 'none' }}
                      onChange={(e) => void handleIssuanceFileChange(e)}
                    />
                  </div>
                  {canIssue && vn.status === 'issuance' && vn.issuance_file_url && (
                    <div className="mt-2">
                      <Button
                        onClick={() => void handleAdvanceToDisciplinary()}
                        disabled={actionLoading}
                      >
                        Advance to Disciplinary Meeting
                      </Button>
                    </div>
                  )}
                </section>
              )}

              {/* Disciplinary Proof section */}
              {(vn.status === 'disciplinary_meeting' || vn.disciplinary_file_url) && (
                <section>
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Disciplinary Meeting</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {vn.disciplinary_file_url ? (
                      <button
                        type="button"
                        onClick={() => setDisciplinaryPreviewOpen(true)}
                        className="group relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 hover:border-primary-300"
                      >
                        {/\.(mp4|webm|ogg|mov)$/i.test(vn.disciplinary_file_name ?? '') ? (
                          <video
                            src={vn.disciplinary_file_url}
                            className="h-24 w-40 object-cover"
                            muted
                          />
                        ) : /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(vn.disciplinary_file_name ?? '') ? (
                          <img
                            src={vn.disciplinary_file_url}
                            alt={vn.disciplinary_file_name ?? 'Disciplinary Proof'}
                            className="h-24 w-40 object-cover"
                          />
                        ) : (
                          <div className="flex h-24 w-40 flex-col items-center justify-center gap-1 text-gray-500">
                            <ExternalLink className="h-5 w-5" />
                            <span className="max-w-[9rem] truncate px-2 text-xs">{vn.disciplinary_file_name ?? 'View File'}</span>
                          </div>
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/0 transition-colors group-hover:bg-black/20" />
                      </button>
                    ) : (
                      <span className="text-sm text-gray-400 italic">No file uploaded yet</span>
                    )}
                    {vn.status === 'disciplinary_meeting' && (
                      <button
                        type="button"
                        onClick={() => disciplinaryFileRef.current?.click()}
                        disabled={actionLoading}
                        className="text-xs text-gray-400 hover:text-gray-600 underline disabled:opacity-50"
                      >
                        {vn.disciplinary_file_url ? 'Replace' : 'Upload Proof'}
                      </button>
                    )}
                    <input
                      ref={disciplinaryFileRef}
                      type="file"
                      accept="image/*,video/*,.pdf,.doc,.docx"
                      style={{ display: 'none' }}
                      onChange={(e) => void handleDisciplinaryFileChange(e)}
                    />
                  </div>
                  {canComplete && vn.status === 'disciplinary_meeting' && vn.disciplinary_file_url && (
                    <div className="mt-2">
                      <div className="mt-3">
                        <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                          EPI Decrease (0–5)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          step={0.5}
                          value={epiDecrease}
                          onChange={(e) => setEpiDecrease(Math.min(5, Math.max(0, Number(e.target.value))))}
                          className="w-24 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Amount to deduct from employee's EPI score upon completion.</p>
                      </div>
                      <Button onClick={() => void handleComplete()} disabled={actionLoading}>
                        Complete VN
                      </Button>
                    </div>
                  )}
                </section>
              )}

              {/* Status-specific action area */}
              <section>
                {vn.status === 'queued' && (
                  <div className="flex flex-wrap gap-2">
                    {canConfirm && (
                      <Button onClick={() => void handleConfirm()} disabled={actionLoading}>
                        Confirm VN
                      </Button>
                    )}
                    {canReject && !rejectMode && (
                      <Button variant="danger" onClick={() => setRejectMode(true)} disabled={actionLoading}>
                        Reject
                      </Button>
                    )}
                  </div>
                )}

                {vn.status === 'discussion' && (
                  <div className="flex flex-wrap gap-2">
                    {canIssue && (
                      <Button onClick={() => void handleIssue()} disabled={actionLoading}>
                        Issue VN
                      </Button>
                    )}
                    {canReject && !rejectMode && (
                      <Button variant="danger" onClick={() => setRejectMode(true)} disabled={actionLoading}>
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
                    {vn.epi_decrease != null && vn.epi_decrease > 0 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400">EPI Decrease: <span className="font-medium text-red-600">-{vn.epi_decrease}</span></p>
                    )}
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

                {/* Inline reject prompt */}
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
                    <div className="flex gap-2">
                      <Button
                        variant="danger"
                        onClick={() => void handleRejectConfirm()}
                        disabled={actionLoading || !rejectionReason.trim()}
                      >
                        Confirm Rejection
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setRejectMode(false);
                          setRejectionReason('');
                        }}
                        disabled={actionLoading}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </section>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Chat section */}
        <div className="flex min-h-0 flex-1 flex-col border-t border-gray-200 px-4 py-3 sm:px-6 sm:py-5">
          {/* Toggle bar */}
          <div className="mb-2 flex justify-center">
            <button
              type="button"
              onClick={() => setDetailsVisible((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-gray-200 bg-white px-3 py-0.5 text-xs text-gray-400 shadow-sm hover:bg-gray-50 hover:text-gray-600"
              title={detailsVisible ? 'Hide details' : 'Show details'}
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
            className="flex-1 min-h-0"
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
        </div>
      </div>

      {vn.disciplinary_file_url && (
        <ImagePreviewModal
          items={disciplinaryPreviewOpen ? [{ url: vn.disciplinary_file_url, fileName: vn.disciplinary_file_name ?? 'Disciplinary Proof' }] : null}
          index={0}
          onIndexChange={() => {}}
          onClose={() => setDisciplinaryPreviewOpen(false)}
        />
      )}
    </div>
  );
}
