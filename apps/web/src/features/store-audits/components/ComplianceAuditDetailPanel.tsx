import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StoreAudit, StoreAuditAttachment, StoreAuditMessage } from '@omnilert/shared';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  Paperclip,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { ImagePreviewModal } from '@/features/case-reports/components/ImagePreviewModal';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { Button } from '@/shared/components/ui/Button';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { api } from '@/shared/services/api.client';
import { resolveComplianceAuditPanelTiming } from './complianceAuditTiming';
import { YesNoPill } from './YesNoPill';

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: 'long',
    day: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
}

function formatMessageTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(parsed);
}

function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  const hue = hashName(name) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

function isImageAttachment(attachment: StoreAuditAttachment): boolean {
  if (attachment.content_type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.file_name);
}

function isVideoAttachment(attachment: StoreAuditAttachment): boolean {
  if (attachment.content_type?.startsWith('video/')) return true;
  return /\.(mp4|webm|ogg|mov|m4v|avi)$/i.test(attachment.file_name);
}

function toPreviewItems(attachments: StoreAuditAttachment[]): Array<{ url: string; fileName: string }> {
  return attachments
    .filter((attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment))
    .map((attachment) => ({
      url: attachment.file_url,
      fileName: attachment.file_name,
    }));
}

function MarkdownReport({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.trim() === '') {
      elements.push(<div key={key++} className="h-2" />);
      continue;
    }

    const isBullet = /^[-*]\s/.test(line);
    const content = isBullet ? line.replace(/^[-*]\s/, '') : line;

    const renderInline = (raw: string): React.ReactNode[] => {
      const parts = raw.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**')
          ? (
              <strong key={i} className="font-semibold text-gray-900">
                {part.slice(2, -2)}
              </strong>
            )
          : part,
      );
    };

    if (isBullet) {
      elements.push(
        <div key={key++} className="flex gap-2 text-sm text-gray-700">
          <span className="mt-0.5 shrink-0 text-gray-400">•</span>
          <span>{renderInline(content)}</span>
        </div>,
      );
    } else {
      elements.push(
        <p key={key++} className="text-sm text-gray-700">
          {renderInline(content)}
        </p>,
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

type AnswersState = {
  productivity_rate: boolean | null;
  uniform: boolean | null;
  hygiene: boolean | null;
  sop: boolean | null;
};

const QUESTIONS: Array<{ key: keyof AnswersState; label: string; question: string }> = [
  {
    key: 'productivity_rate',
    label: 'Productivity Rate',
    question: 'Was the employee actively working (not idle) during the spot audit?',
  },
  {
    key: 'uniform',
    label: 'Uniform Compliance',
    question: 'Was the employee wearing the correct uniform and meeting grooming standards?',
  },
  {
    key: 'hygiene',
    label: 'Hygiene Compliance',
    question: 'Was the employee following food safety and sanitation standards?',
  },
  {
    key: 'sop',
    label: 'SOP Compliance',
    question: 'Was the employee following the correct operational procedures and product preparation workflows?',
  },
];

function buildDefaultAnswers(audit: StoreAudit): AnswersState {
  return {
    productivity_rate: audit.comp_productivity_rate ?? null,
    uniform: audit.comp_uniform,
    hygiene: audit.comp_hygiene,
    sop: audit.comp_sop,
  };
}

function getPositiveAnswerCount(answers: AnswersState): number {
  return Object.values(answers).filter((value) => value === true).length;
}

export function ComplianceAuditDetailPanel({
  audit,
  currentUserId,
  canProcess,
  canComplete,
  canReject,
  canRequestVN,
  actionLoading,
  panelError,
  onProcess,
  onComplete,
  onReject,
  onRequestVN,
}: {
  audit: StoreAudit;
  currentUserId: string | null;
  canProcess: boolean;
  canComplete: boolean;
  canReject?: boolean;
  canRequestVN?: boolean;
  actionLoading: boolean;
  panelError: string;
  onProcess: () => void;
  onComplete: (payload: {
    productivity_rate: boolean;
    uniform: boolean;
    hygiene: boolean;
    sop: boolean;
  }) => void;
  onReject?: () => void;
  onRequestVN?: () => void;
}) {
  const navigate = useNavigate();
  const { error: showErrorToast } = useAppToast();
  const draftKey = `compliance-audit-draft-${audit.id}`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [answers, setAnswers] = useState<AnswersState>(() => {
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<AnswersState>;
          if (parsed && typeof parsed === 'object') {
            return { ...buildDefaultAnswers(audit), ...parsed };
          }
        }
      } catch {
        // ignore
      }
    }
    return buildDefaultAnswers(audit);
  });

  const [messages, setMessages] = useState<StoreAuditMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [savingMessageId, setSavingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [showAllMessages, setShowAllMessages] = useState(false);
  const [previewMedia, setPreviewMedia] = useState<{
    items: { url: string; fileName: string }[];
    index: number;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    if (audit.status !== 'processing') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
      // ignore
    }
  }, [answers, audit.status, draftKey]);

  useEffect(() => {
    const fallback = buildDefaultAnswers(audit);
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<AnswersState>;
          if (parsed && typeof parsed === 'object') {
            setAnswers({ ...fallback, ...parsed });
            return;
          }
        }
      } catch {
        // ignore
      }
    }
    setAnswers(fallback);
  }, [
    audit.id,
    audit.comp_productivity_rate,
    audit.comp_uniform,
    audit.comp_hygiene,
    audit.comp_sop,
    audit.status,
    draftKey,
  ]);

  const fetchMessages = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!options?.silent) setMessagesLoading(true);
      try {
        const response = await api.get(`/store-audits/${audit.id}/messages`);
        const data = Array.isArray(response.data.data)
          ? (response.data.data as StoreAuditMessage[])
          : [];
        setMessages(data);
      } catch (err: any) {
        if (!options?.silent) {
          showErrorToast(err.response?.data?.error || 'Failed to load audit messages');
        }
      } finally {
        if (!options?.silent) setMessagesLoading(false);
      }
    },
    [audit.id, showErrorToast],
  );

  useEffect(() => {
    setMessageDraft('');
    setSelectedFiles([]);
    setEditingMessageId(null);
    setEditingContent('');
    setPreviewMedia(null);
    setShowAllMessages(false);
    void fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    setCurrentTime(new Date());

    if (audit.status === 'completed' || audit.status === 'rejected') return undefined;

    let intervalId: number | null = null;
    const timeoutId = window.setTimeout(() => {
      setCurrentTime(new Date());
      intervalId = window.setInterval(() => {
        setCurrentTime(new Date());
      }, 60 * 1000);
    }, 60 * 1000 - (Date.now() % (60 * 1000)));

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [audit.completed_at, audit.comp_check_in_time, audit.id, audit.status]);

  useEffect(() => {
    if (audit.status !== 'completed' && audit.status !== 'rejected') return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // ignore
    }
  }, [audit.status, draftKey]);

  const allAnswered = Object.values(answers).every((value) => value !== null);
  const positiveCount = getPositiveAnswerCount(answers);
  const visibleMessages = useMemo(() => messages.filter((message) => !message.is_deleted), [messages]);
  const hasVisibleMessages = visibleMessages.length > 0;
  const canMutateMessages = audit.status === 'processing' && canComplete;
  const timing = useMemo(
    () => resolveComplianceAuditPanelTiming(audit, currentTime),
    [audit, currentTime],
  );

  const completedMediaAttachments = useMemo(
    () => visibleMessages.flatMap((message) => message.attachments),
    [visibleMessages],
  );
  const mediaOnlyAttachments = useMemo(
    () => completedMediaAttachments.filter((attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment)),
    [completedMediaAttachments],
  );
  const hasMonetaryReward = Number(audit.monetary_reward ?? 0) > 0;
  const moneyFormatter = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  const pendingAuditDetailRows = [
    { label: 'Company', value: audit.company?.name || '—' },
    { label: 'Branch', value: audit.branch_name || '—' },
    { label: 'Employee', value: audit.comp_employee_name || '—' },
    { label: 'Created', value: formatDateTime(audit.created_at) },
    ...(timing.kind === 'active'
      ? [
          { label: 'Active Since', value: formatDateTime(timing.activeSince) },
          { label: 'Minutes Active', value: timing.durationText ?? '—' },
        ]
      : [
          { label: 'Audit Duration', value: timing.durationText ?? '—' },
        ]),
    ...(hasMonetaryReward
      ? [
          {
            label: 'Audit Reward',
            value: moneyFormatter.format(Number(audit.monetary_reward ?? 0)),
          },
        ]
      : []),
  ];
  const completedAuditDetailRows = [
    { label: 'Company', value: audit.company?.name || '—' },
    { label: 'Branch', value: audit.branch_name || '—' },
    { label: 'Employee', value: audit.comp_employee_name || '—' },
    { label: 'Created', value: formatDateTime(audit.created_at) },
    { label: 'Duration', value: timing.durationText ?? '—' },
  ];

  const openPreview = useCallback((attachment: StoreAuditAttachment, source: StoreAuditAttachment[]) => {
    const mediaItems = toPreviewItems(source);
    const index = mediaItems.findIndex((item) => item.url === attachment.file_url);
    if (index >= 0) {
      setPreviewMedia({ items: mediaItems, index });
    }
  }, []);

  const renderAuditDetailsSection = (
    rows: Array<{ label: string; value: string }>,
    sectionClassName: string,
  ) => (
    <div className={sectionClassName}>
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-4 w-4 text-gray-400" />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Details</p>
      </div>
      <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
        {rows.map(({ label, value }) => (
          <div key={label} className="flex items-baseline gap-4 px-4 py-2.5">
            <dt className="w-28 shrink-0 text-xs text-gray-500">{label}</dt>
            <dd className="min-w-0 flex-1 text-sm font-medium text-gray-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );

  const handleFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const raw = Array.from(event.target.files ?? []);
      if (raw.length === 0) return;
      const incoming = await Promise.all(raw.map(normalizeFileForUpload));

      let invalidTypeFound = false;
      let oversizeFound = false;
      const accepted: File[] = [];

      for (const file of incoming) {
        if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
          invalidTypeFound = true;
          continue;
        }
        if (file.size > 50 * 1024 * 1024) {
          oversizeFound = true;
          continue;
        }
        accepted.push(file);
      }

      if (invalidTypeFound) showErrorToast('Only image and video attachments are allowed');
      if (oversizeFound) showErrorToast('Each attachment must be 50MB or smaller');

      setSelectedFiles((current) => {
        const combined = [...current, ...accepted];
        if (combined.length > 10) showErrorToast('Maximum of 10 attachments is allowed per message');
        return combined.slice(0, 10);
      });

      event.target.value = '';
    },
    [showErrorToast],
  );

  const handleSendMessage = useCallback(async () => {
    if (!canMutateMessages) return;

    const trimmedContent = messageDraft.trim();
    if (!trimmedContent && selectedFiles.length === 0) {
      showErrorToast('Message must have text or at least one attachment');
      return;
    }

    setSendingMessage(true);
    try {
      let response;
      if (selectedFiles.length === 0) {
        response = await api.post(`/store-audits/${audit.id}/messages`, { content: trimmedContent });
      } else {
        const form = new FormData();
        form.append('content', trimmedContent);
        for (const file of selectedFiles) {
          form.append('files', file);
        }
        response = await api.post(`/store-audits/${audit.id}/messages`, form);
      }

      const created = response.data.data as StoreAuditMessage;
      setMessages((current) => [...current, created]);
      setMessageDraft('');
      setSelectedFiles([]);
    } catch (err: any) {
      showErrorToast(err.response?.data?.error || 'Failed to send audit message');
    } finally {
      setSendingMessage(false);
    }
  }, [audit.id, canMutateMessages, messageDraft, selectedFiles, showErrorToast]);

  const handleSaveEdit = useCallback(
    async (messageId: string) => {
      const trimmed = editingContent.trim();
      if (!trimmed) {
        showErrorToast('Message content is required');
        return;
      }

      setSavingMessageId(messageId);
      try {
        const response = await api.patch(`/store-audits/${audit.id}/messages/${messageId}`, {
          content: trimmed,
        });
        const updated = response.data.data as StoreAuditMessage;
        setMessages((current) => current.map((message) => (message.id === updated.id ? updated : message)));
        setEditingMessageId(null);
        setEditingContent('');
      } catch (err: any) {
        showErrorToast(err.response?.data?.error || 'Failed to edit audit message');
      } finally {
        setSavingMessageId(null);
      }
    },
    [audit.id, editingContent, showErrorToast],
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      if (!window.confirm('Delete this message?')) return;

      setDeletingMessageId(messageId);
      try {
        await api.delete(`/store-audits/${audit.id}/messages/${messageId}`);
        await fetchMessages({ silent: true });
        if (editingMessageId === messageId) {
          setEditingMessageId(null);
          setEditingContent('');
        }
      } catch (err: any) {
        showErrorToast(err.response?.data?.error || 'Failed to delete audit message');
      } finally {
        setDeletingMessageId(null);
      }
    },
    [audit.id, editingMessageId, fetchMessages, showErrorToast],
  );

  const renderAttachment = useCallback(
    (attachment: StoreAuditAttachment, source: StoreAuditAttachment[], variant: 'message' | 'gallery' = 'message') => {
      const isImage = isImageAttachment(attachment);
      const isVideo = isVideoAttachment(attachment);
      const thumbClass = variant === 'gallery'
        ? 'h-28 w-full object-cover'
        : 'max-h-[170px] max-w-[220px] object-cover';

      if (isImage) {
        return (
          <img
            key={attachment.id}
            src={attachment.file_url}
            alt={attachment.file_name}
            className={`${thumbClass} cursor-pointer rounded-lg border border-gray-200 hover:opacity-90`}
            onClick={() => openPreview(attachment, source)}
          />
        );
      }

      if (isVideo) {
        return (
          <button
            key={attachment.id}
            type="button"
            onClick={() => openPreview(attachment, source)}
            className={`group relative overflow-hidden rounded-lg border border-gray-200 bg-black ${
              variant === 'gallery' ? 'h-28 w-full' : 'max-h-[170px] max-w-[220px]'
            }`}
          >
            <video
              src={attachment.file_url}
              className={`${thumbClass} opacity-75`}
              muted
              preload="metadata"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white transition group-hover:bg-black/70">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 pl-0.5">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        );
      }

      return (
        <a
          key={attachment.id}
          href={attachment.file_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-primary-700 hover:bg-gray-100"
        >
          {attachment.file_name}
        </a>
      );
    },
    [openPreview],
  );

  const renderMessageTrail = (readOnly: boolean) => {
    if (messagesLoading) {
      return (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded bg-gray-200" />
                  <div className="h-3 w-full rounded bg-gray-200" />
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (messages.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
          No audit notes yet.
        </p>
      );
    }

    const displayMessages = readOnly && !showAllMessages && messages.length > 5
      ? messages.slice(0, 5)
      : messages;

    return (
      <div className="space-y-2">
        {displayMessages.map((message) => {
          const messageOwner = message.user_name?.trim() || 'Unknown User';
          const isOwn = message.user_id === currentUserId;
          const canEditDelete = !readOnly && canMutateMessages && isOwn && !message.is_deleted;
          const isEditing = editingMessageId === message.id;

          return (
            <div key={message.id} className="rounded-lg border border-gray-200 bg-white p-3">
              <div className="flex items-start gap-3">
                <div className="shrink-0">
                  {message.user_avatar ? (
                    <img
                      src={message.user_avatar}
                      alt={messageOwner}
                      className="h-8 w-8 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: getAvatarColor(messageOwner) }}
                    >
                      {getInitials(messageOwner)}
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{messageOwner}</span>
                    <span className="text-xs text-gray-400">{formatMessageTime(message.created_at)}</span>
                    {message.is_edited && !message.is_deleted && (
                      <span className="text-xs italic text-gray-400">edited</span>
                    )}
                  </div>

                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={3}
                        value={editingContent}
                        onChange={(event) => setEditingContent(event.target.value)}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => void handleSaveEdit(message.id)}
                          disabled={savingMessageId === message.id || !editingContent.trim()}
                        >
                          {savingMessageId === message.id ? 'Saving...' : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setEditingMessageId(null);
                            setEditingContent('');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className={`mt-1 whitespace-pre-wrap text-sm ${message.is_deleted ? 'italic text-gray-400' : 'text-gray-700'}`}>
                      {message.content || '(No text)'}
                    </p>
                  )}

                  {message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) => renderAttachment(attachment, message.attachments))}
                    </div>
                  )}
                </div>

                {canEditDelete && !isEditing && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessageId(message.id);
                        setEditingContent(message.content);
                      }}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                      title="Edit message"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMessage(message.id)}
                      disabled={deletingMessageId === message.id}
                      className="rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                      title="Delete message"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {readOnly && messages.length > 5 && (
          <button
            type="button"
            onClick={() => setShowAllMessages((prev) => !prev)}
            className="w-full rounded-lg border border-dashed border-gray-300 py-2 text-xs text-gray-500 hover:bg-gray-50"
          >
            {showAllMessages ? 'Show fewer messages' : `Show all ${messages.length} messages`}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">

        {/* ── PENDING STATE ──────────────────────────────────────────── */}
        {audit.status === 'pending' && (
          renderAuditDetailsSection(pendingAuditDetailRows, 'px-6 py-5')
        )}

        {/* ── PROCESSING STATE ───────────────────────────────────────── */}
        {audit.status === 'processing' && (
          <div className="space-y-0">
            {/* Subject banner */}
            <div className="border-b border-blue-100 bg-blue-50 px-6 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-800 ring-1 ring-inset ring-blue-200">
                      <ShieldCheck className="h-3 w-3" />
                      Compliance Audit
                    </span>
                    <span className="text-xs text-blue-700">In Progress</span>
                  </div>
                  <p className="mt-1 truncate font-semibold text-blue-900">
                    {audit.comp_employee_name || '—'}
                  </p>
                  <p className="text-xs text-blue-700">{audit.branch_name || ''}</p>
                </div>
                <div className="shrink-0 text-right">
                  {timing.durationText && (
                    <div>
                      <p className="text-xs text-blue-600">{timing.kind === 'active' ? 'Active for' : 'Duration'}</p>
                      <p className="text-sm font-semibold text-blue-900">{timing.durationText}</p>
                    </div>
                  )}
                  {audit.auditor_name && (
                    <div className="mt-1">
                      <p className="text-xs text-blue-600">Auditor</p>
                      <p className="text-sm font-medium text-blue-900">{audit.auditor_name}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {renderAuditDetailsSection(pendingAuditDetailRows, 'border-b border-gray-200 px-6 py-5')}

            {/* Scoring section */}
            {canComplete && (
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="mb-3 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-blue-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Compliance Criteria</p>
                </div>
                <div className="space-y-2">
                  {QUESTIONS.map((question) => (
                    <div key={question.key} className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-800">{question.label}</p>
                          <p className="mt-0.5 text-xs text-gray-500">{question.question}</p>
                        </div>
                        <div className="shrink-0">
                          <YesNoPill
                            value={answers[question.key]}
                            onChange={(value) => setAnswers((prev) => ({ ...prev, [question.key]: value }))}
                            disabled={actionLoading}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {allAnswered && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-primary-50 px-4 py-3">
                    <span className="text-sm font-medium text-primary-700">Compliance Score</span>
                    <span className="text-lg font-bold text-primary-700">{positiveCount} / {QUESTIONS.length} passed</span>
                  </div>
                )}
              </div>
            )}

            {/* Audit notes / log */}
            <div className="px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Notes</p>
              </div>

              {renderMessageTrail(false)}

              {canMutateMessages && (
                <div className="mt-3 rounded-xl border border-gray-200 bg-white p-3">
                  {selectedFiles.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2">
                      {selectedFiles.map((file) => (
                        <span
                          key={`${file.name}-${file.size}`}
                          className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700"
                        >
                          <span className="max-w-[180px] truncate">{file.name}</span>
                          <span className="text-[11px] text-gray-500">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles((current) => current.filter((item) => item !== file))}
                            className="rounded-full p-0.5 hover:bg-gray-300"
                            title="Remove attachment"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <textarea
                    rows={3}
                    value={messageDraft}
                    onChange={(event) => setMessageDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void handleSendMessage();
                      }
                    }}
                    placeholder="Add observation, finding, or note…"
                    className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                      Attach Media
                    </button>

                    <Button
                      size="sm"
                      onClick={() => void handleSendMessage()}
                      disabled={actionLoading || sendingMessage || (!messageDraft.trim() && selectedFiles.length === 0)}
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5" />
                        {sendingMessage ? 'Sending…' : 'Add Note'}
                      </span>
                    </Button>
                  </div>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </div>
              )}

              {canComplete && !hasVisibleMessages && !messagesLoading && (
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p className="text-xs text-amber-700">
                    Add at least one audit note before completing this audit.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {audit.status === 'rejected' && (
          <div className="space-y-0">
            <div className="border-b border-red-100 bg-red-50 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-red-900">Audit Rejected</p>
                  <p className="mt-0.5 text-xs text-red-700">{formatDateTime(audit.rejected_at ?? null)}</p>
                  {audit.auditor_name && (
                    <p className="mt-0.5 text-xs text-red-700">by {audit.auditor_name}</p>
                  )}
                </div>
                {hasMonetaryReward && (
                  <div className="shrink-0 rounded-lg bg-red-100 px-3 py-1.5 text-right">
                    <div className="flex items-center gap-1 text-xs text-red-700">
                      <Banknote className="h-3.5 w-3.5" />
                      <span>Rate</span>
                    </div>
                    <p className="text-sm font-bold text-red-800">
                      {moneyFormatter.format(Number(audit.monetary_reward ?? 0))}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {renderAuditDetailsSection(completedAuditDetailRows, 'border-b border-gray-200 px-6 py-5')}

            <div className="border-b border-gray-200 px-6 py-5">
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4">
                <div className="flex items-start gap-3">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                  <div>
                    <p className="text-sm font-semibold text-red-900">Rejection Reason</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-red-800">
                      {audit.rejection_reason || 'No rejection reason recorded.'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-b border-gray-200 px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Notes</p>
              </div>
              {renderMessageTrail(true)}
            </div>

            {mediaOnlyAttachments.length > 0 && (
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Media Attachments</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {mediaOnlyAttachments.map((attachment) => (
                    <div key={attachment.id} className="space-y-1">
                      {renderAttachment(attachment, mediaOnlyAttachments, 'gallery')}
                      <p className="truncate text-xs text-gray-400" title={attachment.file_name}>
                        {attachment.file_name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── COMPLETED STATE ────────────────────────────────────────── */}
        {audit.status === 'completed' && (
          <div className="space-y-0">
            {/* Receipt header */}
            <div className="border-b border-green-100 bg-green-50 px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-green-900">Audit Completed</p>
                  <p className="mt-0.5 text-xs text-green-700">{formatDateTime(audit.completed_at ?? null)}</p>
                  {audit.auditor_name && (
                    <p className="mt-0.5 text-xs text-green-700">by {audit.auditor_name}</p>
                  )}
                </div>
                {Number(audit.monetary_reward ?? 0) > 0 && (
                  <div className="shrink-0 rounded-lg bg-green-100 px-3 py-1.5 text-right">
                    <div className="flex items-center gap-1 text-xs text-green-700">
                      <Banknote className="h-3.5 w-3.5" />
                      <span>Rate</span>
                    </div>
                    <p className="text-sm font-bold text-green-800">
                      {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(audit.monetary_reward ?? 0))}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {renderAuditDetailsSection(completedAuditDetailRows, 'border-b border-gray-200 px-6 py-5')}

            {/* Scorecard */}
            <div className="border-b border-gray-200 px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Compliance Scorecard</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200">
                {QUESTIONS.map((question, index) => {
                  const value = answers[question.key];
                  return (
                    <div
                      key={question.key}
                      className={`flex items-center justify-between gap-4 px-4 py-3 ${
                        index < QUESTIONS.length - 1 ? 'border-b border-gray-100' : ''
                      }`}
                    >
                      <span className="text-sm text-gray-700">{question.label}</span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          value === true
                            ? 'bg-green-100 text-green-700'
                            : value === false
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {value === true ? 'Pass' : value === false ? 'Fail' : '—'}
                      </span>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t-2 border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-semibold text-gray-800">Overall Score</span>
                  <span className="text-base font-bold text-primary-700">
                    {positiveCount} / {QUESTIONS.length} passed
                  </span>
                </div>
              </div>
            </div>

            {/* Audit log */}
            <div className="border-b border-gray-200 px-6 py-5">
              <div className="mb-3 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-gray-400" />
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Notes</p>
              </div>
              {renderMessageTrail(true)}
            </div>

            {/* Media gallery */}
            {mediaOnlyAttachments.length > 0 && (
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="mb-3 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-gray-400" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Media Attachments</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {mediaOnlyAttachments.map((attachment) => (
                    <div key={attachment.id} className="space-y-1">
                      {renderAttachment(attachment, mediaOnlyAttachments, 'gallery')}
                      <p className="truncate text-xs text-gray-400" title={attachment.file_name}>
                        {attachment.file_name}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Report */}
            {audit.comp_ai_report && (
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Report</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <MarkdownReport text={audit.comp_ai_report} />
                </div>
              </div>
            )}

            {/* Linked VN */}
            {audit.linked_vn_id && (
              <div className="px-6 py-5">
                <button
                  type="button"
                  onClick={() => navigate(`/violation-notices?vnId=${audit.linked_vn_id}`)}
                  className="inline-flex items-center gap-1.5 text-sm text-primary-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Violation Notice
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="border-t border-gray-200 px-6 py-4">
        {panelError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>}

        {audit.status === 'pending' && canProcess && (
          <Button className="w-full" onClick={onProcess} disabled={actionLoading}>
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              {actionLoading ? 'Processing…' : 'Process Audit'}
            </span>
          </Button>
        )}

        {audit.status === 'processing' && (canComplete || canReject) && (
          <div className="flex gap-3">
            {canReject && (
              <Button className="flex-1" variant="danger" onClick={onReject} disabled={actionLoading || !onReject}>
                <span className="inline-flex items-center gap-2">
                  <XCircle className="h-4 w-4" />
                  Reject Audit
                </span>
              </Button>
            )}

            {canComplete && (
              <Button
                className="flex-1"
                variant="success"
                onClick={() => {
                  if (!allAnswered || !hasVisibleMessages) return;
                  try {
                    localStorage.removeItem(draftKey);
                  } catch {
                    // ignore
                  }
                  onComplete({
                    productivity_rate: Boolean(answers.productivity_rate),
                    uniform: Boolean(answers.uniform),
                    hygiene: Boolean(answers.hygiene),
                    sop: Boolean(answers.sop),
                  });
                }}
                disabled={actionLoading || messagesLoading || !allAnswered || !hasVisibleMessages}
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {actionLoading ? 'Completing…' : 'Complete Audit'}
                </span>
              </Button>
            )}
          </div>
        )}

        {audit.status === 'completed' && canRequestVN && (
          <Button className="w-full" variant="danger" onClick={onRequestVN}>
            Request Violation Notice
          </Button>
        )}
      </div>

      <ImagePreviewModal
        items={previewMedia?.items ?? null}
        index={previewMedia?.index ?? 0}
        onIndexChange={(index) => setPreviewMedia((current) => (current ? { ...current, index } : null))}
        onClose={() => setPreviewMedia(null)}
      />
    </div>
  );
}
