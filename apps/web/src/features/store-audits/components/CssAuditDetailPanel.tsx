import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  CssCriteriaScores,
  StoreAudit,
  StoreAuditAttachment,
  StoreAuditMessage,
} from '@omnilert/shared';
import { ExternalLink, Paperclip, Pencil, Send, Trash2, X } from 'lucide-react';
import { ImagePreviewModal } from '@/features/case-reports/components/ImagePreviewModal';
import { Button } from '@/shared/components/ui/Button';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { api } from '@/shared/services/api.client';
import { StarRatingInput } from './StarRatingInput';

const CSS_CRITERIA: { key: keyof CssCriteriaScores; label: string; description: string }[] = [
  {
    key: 'greeting',
    label: 'Greeting & First Impression',
    description: 'Acknowledgment within 5 sec, eye contact, verbal greeting, positive expression',
  },
  {
    key: 'order_accuracy',
    label: 'Order Accuracy & Confirmation',
    description: 'Repeats/confirms order, clarifies unclear requests, attentive posture',
  },
  {
    key: 'suggestive_selling',
    label: 'Suggestive Selling / Revenue Initiative',
    description: 'At least one upsell attempt, offer of add-on, natural delivery',
  },
  {
    key: 'service_efficiency',
    label: 'Service Efficiency & Flow',
    description: 'Smooth workflow, no idle pauses, appropriate speed, organized handling',
  },
  {
    key: 'professionalism',
    label: 'Professionalism & Closing Experience',
    description: 'Polite tone, respectful body language, proper handover, thanked customer',
  },
];

type CriteriaState = Record<keyof CssCriteriaScores, number | null>;

function buildInitialCriteria(scores: CssCriteriaScores | null): CriteriaState {
  return {
    greeting: scores?.greeting ?? null,
    order_accuracy: scores?.order_accuracy ?? null,
    suggestive_selling: scores?.suggestive_selling ?? null,
    service_efficiency: scores?.service_efficiency ?? null,
    professionalism: scores?.professionalism ?? null,
  };
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

function formatDateTime(value: string | null): string {
  if (!value) return '-';
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
        <div key={key++} className="flex gap-2 text-sm text-gray-800">
          <span className="mt-0.5 shrink-0 text-gray-400">-</span>
          <span>{renderInline(content)}</span>
        </div>,
      );
    } else {
      elements.push(
        <p key={key++} className="text-sm text-gray-800">
          {renderInline(content)}
        </p>,
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

export function CssAuditDetailPanel({
  audit,
  currentUserId,
  canProcess,
  canComplete,
  canRequestVN,
  actionLoading,
  panelError,
  onProcess,
  onComplete,
  onRequestVN,
}: {
  audit: StoreAudit;
  currentUserId: string | null;
  canProcess: boolean;
  canComplete: boolean;
  canRequestVN?: boolean;
  actionLoading: boolean;
  panelError: string;
  onProcess: () => void;
  onComplete: (payload: { criteria_scores: CssCriteriaScores }) => void;
  onRequestVN?: () => void;
}) {
  const navigate = useNavigate();
  const { error: showErrorToast } = useAppToast();
  const draftKey = `css-audit-draft-${audit.id}`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [criteriaScores, setCriteriaScores] = useState<CriteriaState>(() => {
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { criteriaScores?: CriteriaState };
          if (parsed.criteriaScores) return parsed.criteriaScores;
        }
      } catch {
        // ignore
      }
    }
    return buildInitialCriteria(audit.css_criteria_scores);
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
  const [previewMedia, setPreviewMedia] = useState<{
    items: { url: string; fileName: string }[];
    index: number;
  } | null>(null);

  useEffect(() => {
    if (audit.status !== 'processing') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ criteriaScores }));
    } catch {
      // ignore
    }
  }, [audit.status, criteriaScores, draftKey]);

  useEffect(() => {
    const fallback = buildInitialCriteria(audit.css_criteria_scores);
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { criteriaScores?: CriteriaState };
          setCriteriaScores(parsed.criteriaScores ?? fallback);
          return;
        }
      } catch {
        // ignore
      }
    }
    setCriteriaScores(fallback);
  }, [audit.id, audit.css_criteria_scores, audit.status, draftKey]);
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
    void fetchMessages();
  }, [fetchMessages]);

  const allScored = CSS_CRITERIA.every((criterion) => criteriaScores[criterion.key] !== null);
  const computedAverage = allScored
    ? Math.round(
      (CSS_CRITERIA.reduce((sum, criterion) => sum + (criteriaScores[criterion.key] as number), 0) / 5)
      * 100,
    ) / 100
    : null;

  const orderLines = Array.isArray(audit.css_order_lines) ? audit.css_order_lines : [];
  const visibleMessages = useMemo(() => messages.filter((message) => !message.is_deleted), [messages]);
  const hasVisibleMessages = visibleMessages.length > 0;
  const canMutateMessages = audit.status === 'processing' && canComplete;
  const completedMediaAttachments = useMemo(
    () => visibleMessages.flatMap((message) => message.attachments),
    [visibleMessages],
  );
  const mediaOnlyAttachments = useMemo(
    () => completedMediaAttachments.filter((attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment)),
    [completedMediaAttachments],
  );

  const openPreview = useCallback((attachment: StoreAuditAttachment, source: StoreAuditAttachment[]) => {
    const mediaItems = toPreviewItems(source);
    const index = mediaItems.findIndex((item) => item.url === attachment.file_url);
    if (index >= 0) {
      setPreviewMedia({ items: mediaItems, index });
    }
  }, []);

  const handleFileChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const incoming = Array.from(event.target.files ?? []);
      if (incoming.length === 0) return;

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

      if (invalidTypeFound) {
        showErrorToast('Only image and video attachments are allowed');
      }
      if (oversizeFound) {
        showErrorToast('Each attachment must be 50MB or smaller');
      }

      setSelectedFiles((current) => {
        const combined = [...current, ...accepted];
        if (combined.length > 10) {
          showErrorToast('Maximum of 10 attachments is allowed per message');
        }
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
        response = await api.post(`/store-audits/${audit.id}/messages`, {
          content: trimmedContent,
        });
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
      return <p className="text-sm text-gray-500">Loading audit messages...</p>;
    }

    if (messages.length === 0) {
      return (
        <p className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-4 text-sm text-gray-500">
          No audit messages yet.
        </p>
      );
    }

    return (
      <div className="space-y-3">
        {messages.map((message) => {
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
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <div
                      className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
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
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-gray-500">Session</span>
          <span className="font-medium text-gray-900">{audit.css_session_name || '-'}</span>
          <span className="text-gray-500">Reference</span>
          <span className="font-medium text-gray-900">{audit.css_pos_reference || '-'}</span>
          <span className="text-gray-500">Branch</span>
          <span className="font-medium text-gray-900">{audit.branch_name || '-'}</span>
          <span className="text-gray-500">Order Date</span>
          <span className="font-medium text-gray-900">{formatDateTime(audit.css_date_order)}</span>
          <span className="text-gray-500">Cashier</span>
          <span className="font-medium text-gray-900">{audit.css_cashier_name || '-'}</span>
          <span className="text-gray-500">Amount Total</span>
          <span className="font-medium text-gray-900">
            {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(audit.css_amount_total ?? 0))}
          </span>
        </div>

        {orderLines.length > 0 && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Product</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Qty</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Unit Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orderLines.map((line, index) => (
                  <tr key={`${line.product_name}-${index}`}>
                    <td className="px-3 py-2 text-gray-900">{line.product_name}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{line.qty}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">
                      {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(line.price_unit))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {audit.status === 'processing' && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            {canComplete && (
              <>
                <p className="text-sm font-semibold text-gray-800">CSS Criteria Scores</p>
                <div className="space-y-3">
                  {CSS_CRITERIA.map((criterion) => (
                    <div key={criterion.key} className="rounded-lg border border-gray-200 bg-white p-3">
                      <p className="text-sm font-medium text-gray-800">{criterion.label}</p>
                      <p className="mb-2 text-xs text-gray-500">{criterion.description}</p>
                      <StarRatingInput
                        value={criteriaScores[criterion.key]}
                        onChange={(value) => setCriteriaScores((prev) => ({ ...prev, [criterion.key]: value }))}
                        disabled={actionLoading}
                      />
                    </div>
                  ))}
                </div>
                {computedAverage !== null && (
                  <div className="flex items-center gap-2 rounded-lg bg-primary-50 px-3 py-2">
                    <span className="text-sm text-gray-600">Final Score:</span>
                    <span className="text-sm font-semibold text-primary-700">{computedAverage.toFixed(2)} / 5</span>
                  </div>
                )}
              </>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-gray-800">Audit Log</label>
              {renderMessageTrail(false)}
            </div>

            {canMutateMessages && (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-white p-3">
                {selectedFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2">
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
                  rows={4}
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSendMessage();
                    }
                  }}
                  placeholder="Write detailed audit findings..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Paperclip className="h-4 w-4" />
                    Attach Media
                  </button>

                  <Button
                    onClick={() => void handleSendMessage()}
                    disabled={
                      actionLoading
                      || sendingMessage
                      || (!messageDraft.trim() && selectedFiles.length === 0)
                    }
                  >
                    <span className="inline-flex items-center gap-2">
                      <Send className="h-4 w-4" />
                      {sendingMessage ? 'Sending...' : 'Send Message'}
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
              <p className="text-xs text-amber-700">
                Send at least one non-deleted message before completing this audit.
              </p>
            )}
          </div>
        )}

        {audit.status === 'completed' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Auditor</p>
              <p className="text-sm text-gray-900">{audit.auditor_name || '-'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Rate</p>
              <p className="text-sm text-gray-900">
                {new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(audit.monetary_reward ?? 0))}
              </p>
            </div>
            {audit.css_criteria_scores ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Criteria Scores</p>
                <div className="space-y-1">
                  {CSS_CRITERIA.map((criterion) => (
                    <div key={criterion.key} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700">{criterion.label}</span>
                      <span className="font-medium text-gray-900">
                        {audit.css_criteria_scores?.[criterion.key] ?? '-'} / 5
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-sm">
                  <span className="font-medium text-gray-700">Overall Average</span>
                  <span className="font-semibold text-primary-700">
                    {typeof audit.css_star_rating === 'number' ? audit.css_star_rating.toFixed(2) : audit.css_star_rating} / 5
                  </span>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Star Rating</p>
                <p className="text-sm text-gray-900">{audit.css_star_rating ?? '-'} / 5</p>
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Log</p>
              {messages.length > 0 ? (
                <div className="mt-2">{renderMessageTrail(true)}</div>
              ) : (
                <p className="whitespace-pre-wrap text-sm text-gray-800">{audit.css_audit_log || '-'}</p>
              )}
            </div>

            {messages.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Media Attachments</p>
                {mediaOnlyAttachments.length === 0 ? (
                  <p className="text-sm text-gray-800">-</p>
                ) : (
                  <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {mediaOnlyAttachments.map((attachment) => (
                      <div key={attachment.id} className="space-y-1">
                        {renderAttachment(attachment, mediaOnlyAttachments, 'gallery')}
                        <p className="truncate text-xs text-gray-500" title={attachment.file_name}>
                          {attachment.file_name}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Report</p>
              {audit.css_ai_report ? <MarkdownReport text={audit.css_ai_report} /> : <p className="text-sm text-gray-800">-</p>}
            </div>

            {audit.linked_vn_id && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Violation Notice</p>
                <button
                  type="button"
                  onClick={() => navigate(`/violation-notices?vnId=${audit.linked_vn_id}`)}
                  className="mt-1 inline-flex items-center gap-1 text-sm text-primary-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View Violation Notice
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="border-t border-gray-200 px-6 py-4">
        {panelError && <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>}

        {audit.status === 'pending' && canProcess && (
          <Button className="w-full" onClick={onProcess} disabled={actionLoading}>
            {actionLoading ? 'Processing...' : 'Process'}
          </Button>
        )}

        {audit.status === 'processing' && canComplete && (
          <Button
            className="w-full"
            variant="success"
            onClick={() => {
              if (!allScored || !hasVisibleMessages) return;
              try {
                localStorage.removeItem(draftKey);
              } catch {
                // ignore
              }
              onComplete({
                criteria_scores: criteriaScores as CssCriteriaScores,
              });
            }}
            disabled={actionLoading || messagesLoading || !allScored || !hasVisibleMessages}
          >
            {actionLoading ? 'Completing...' : 'Audit Complete'}
          </Button>
        )}

        {audit.status === 'completed' && !audit.vn_requested && canRequestVN && (
          <Button className="w-full" variant="danger" onClick={onRequestVN}>
            Request VN
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
