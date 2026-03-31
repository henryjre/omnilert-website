import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { StoreAudit, StoreAuditAttachment, StoreAuditMessage } from '@omnilert/shared';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  Eye,
  Paperclip,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import { ImagePreviewModal } from '@/features/case-reports/components/ImagePreviewModal';
import { AnimatedModal } from '@/shared/components/ui/AnimatedModal';
import { normalizeFileForUpload } from '@/shared/utils/fileUpload';
import { Button } from '@/shared/components/ui/Button';
import { useAppToast } from '@/shared/hooks/useAppToast';
import { api } from '@/shared/services/api.client';
import { resolveServiceCrewCctvAuditPanelTiming } from './serviceCrewCctvAuditTiming';
import { StarRatingInput } from './StarRatingInput';
import { YesNoPill, type YesNoPillValue } from './YesNoPill';
import { normalizeAuditedEmployeeName } from '@/shared/utils/string';

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
    const renderInline = (raw: string): React.ReactNode[] =>
      raw.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
        part.startsWith('**') && part.endsWith('**')
          ? (
              <strong key={index} className="font-semibold text-gray-900">
                {part.slice(2, -2)}
              </strong>
            )
          : part,
      );

    if (isBullet) {
      elements.push(
        <div key={key++} className="flex gap-2 text-sm text-gray-700">
          <span className="mt-0.5 shrink-0 text-gray-400">-</span>
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

function StarDisplay({ value }: { value: number | null }) {
  if (value === null) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 ring-1 ring-inset ring-gray-200">
        Not Auditable
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`inline-flex h-6 w-6 items-center justify-center rounded-lg border ${
            index < (value ?? 0)
              ? 'border-amber-200/80 bg-amber-50/95 shadow-[0_2px_6px_rgba(245,158,11,0.1)]'
              : 'border-amber-100/70 bg-white/75'
          }`}
        >
          <Star
            className={`h-3.5 w-3.5 ${
              index < (value ?? 0) ? 'fill-amber-400 text-amber-500' : 'text-amber-200'
            }`}
          />
        </span>
      ))}
      <span className="ml-1 text-xs font-medium text-gray-700">{value} / 5</span>
    </span>
  );
}

type ComplianceCriterionKey =
  | 'productivity_rate'
  | 'uniform_compliance'
  | 'hygiene_compliance'
  | 'sop_compliance';

type CustomerServiceCriterionKey =
  | 'customer_interaction'
  | 'cashiering'
  | 'suggestive_selling_and_upselling'
  | 'service_efficiency';

type ComplianceAnswer = YesNoPillValue;

type AnswersState = {
  productivity_rate: ComplianceAnswer;
  uniform_compliance: ComplianceAnswer;
  hygiene_compliance: ComplianceAnswer;
  sop_compliance: ComplianceAnswer;
  customer_interaction: number | null;
  cashiering: number | null;
  suggestive_selling_and_upselling: number | null;
  service_efficiency: number | null;
};

const COMPLIANCE_CRITERIA: Array<{
  key: ComplianceCriterionKey;
  label: string;
  question: string;
}> = [
  {
    key: 'productivity_rate',
    label: 'Productivity Rate',
    question: 'Was the employee actively working (not idle) during the spot audit?',
  },
  {
    key: 'uniform_compliance',
    label: 'Uniform Compliance',
    question: 'Was the employee wearing the correct uniform and meeting grooming standards?',
  },
  {
    key: 'hygiene_compliance',
    label: 'Hygiene Compliance',
    question: 'Was the employee following food safety and sanitation standards?',
  },
  {
    key: 'sop_compliance',
    label: 'SOP Compliance',
    question: 'Was the employee following the correct operational procedures and product preparation workflows?',
  },
];

const CUSTOMER_SERVICE_CRITERIA: Array<{
  key: CustomerServiceCriterionKey;
  label: string;
  description: string;
}> = [
  {
    key: 'customer_interaction',
    label: 'Customer Interaction',
    description: 'Greeting, eye contact, attentive listening, respectful engagement',
  },
  {
    key: 'cashiering',
    label: 'Cashiering',
    description: 'Accurate order/payment handling, proper POS flow, receipt confirmation',
  },
  {
    key: 'suggestive_selling_and_upselling',
    label: 'Suggestive Selling and Upselling',
    description: 'Relevant add-on offers, confident recommendations, natural timing',
  },
  {
    key: 'service_efficiency',
    label: 'Service Efficiency',
    description: 'Steady pace, organized workflow, minimal idle time, smooth service handoff',
  },
];

function isFinalizedAudit(audit: StoreAudit): boolean {
  return audit.status === 'completed' || audit.status === 'rejected';
}

function buildComplianceAnswer(value: boolean | null, finalized: boolean): ComplianceAnswer {
  if (value === true || value === false) return value;
  return finalized ? 'not_auditable' : null;
}

function buildDefaultAnswers(audit: StoreAudit): AnswersState {
  const finalized = isFinalizedAudit(audit);
  return {
    productivity_rate: buildComplianceAnswer(audit.scc_productivity_rate, finalized),
    uniform_compliance: buildComplianceAnswer(audit.scc_uniform_compliance, finalized),
    hygiene_compliance: buildComplianceAnswer(audit.scc_hygiene_compliance, finalized),
    sop_compliance: buildComplianceAnswer(audit.scc_sop_compliance, finalized),
    customer_interaction: audit.scc_customer_interaction ?? null,
    cashiering: audit.scc_cashiering ?? null,
    suggestive_selling_and_upselling: audit.scc_suggestive_selling_and_upselling ?? null,
    service_efficiency: audit.scc_service_efficiency ?? null,
  };
}

function isComplianceAnswered(value: ComplianceAnswer): boolean {
  return value !== null;
}

function toStoredComplianceValue(value: ComplianceAnswer): boolean | null {
  if (value === true || value === false) return value;
  return null;
}

function getTriStateBadge(value: ComplianceAnswer | boolean | null) {
  if (value === true) return { label: 'Yes', className: 'bg-green-100 text-green-700' };
  if (value === false) return { label: 'No', className: 'bg-red-100 text-red-700' };
  return { label: 'Not Auditable', className: 'bg-gray-100 text-gray-600' };
}

function EmployeeAvatar({
  name,
  avatarUrl,
  onClick,
}: {
  name: string;
  avatarUrl: string | null;
  onClick?: () => void;
}) {
  const content = avatarUrl ? (
    <img src={avatarUrl} alt={name} className="h-16 w-16 rounded-2xl object-cover" />
  ) : (
    <div
      className="flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-semibold text-white"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {getInitials(name)}
    </div>
  );

  if (!avatarUrl || !onClick) {
    return <div className="shrink-0">{content}</div>;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="group shrink-0 rounded-[1.125rem] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
      title="Preview employee photo"
    >
      <div className="relative overflow-hidden rounded-[1.125rem] border border-white/70 shadow-sm">
        {content}
        <div className="absolute inset-0 flex items-end justify-end bg-gradient-to-t from-black/30 via-transparent to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">
            <Eye className="h-3 w-3" />
            View
          </span>
        </div>
      </div>
    </button>
  );
}

export function ServiceCrewCctvAuditDetailPanel({
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
    productivity_rate: boolean | null;
    uniform_compliance: boolean | null;
    hygiene_compliance: boolean | null;
    sop_compliance: boolean | null;
    customer_interaction: number | null;
    cashiering: number | null;
    suggestive_selling_and_upselling: number | null;
    service_efficiency: number | null;
  }) => void;
  onReject?: () => void;
  onRequestVN?: () => void;
}) {
  const navigate = useNavigate();
  const { error: showErrorToast } = useAppToast();
  const draftKey = `service-crew-cctv-audit-draft-${audit.id}`;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const employeeName = normalizeAuditedEmployeeName(audit.scc_employee_name) || 'Service Crew CCTV Audit';
  const branchLabel = audit.branch_name || audit.company?.name || '-';

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
  const [showProfilePreview, setShowProfilePreview] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => new Date());

  useEffect(() => {
    if (audit.status !== 'processing') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
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
      }
    }
    setAnswers(fallback);
  }, [
    audit.id,
    audit.scc_productivity_rate,
    audit.scc_uniform_compliance,
    audit.scc_hygiene_compliance,
    audit.scc_sop_compliance,
    audit.scc_customer_interaction,
    audit.scc_cashiering,
    audit.scc_suggestive_selling_and_upselling,
    audit.scc_service_efficiency,
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
    if (audit.status !== 'processing' || !audit.processing_started_at) return undefined;

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
  }, [audit.processing_started_at, audit.status]);

  useEffect(() => {
    if (!isFinalizedAudit(audit)) return;
    try {
      localStorage.removeItem(draftKey);
    } catch {
    }
  }, [audit, draftKey]);

  const visibleMessages = useMemo(
    () => messages.filter((message) => !message.is_deleted),
    [messages],
  );
  const hasVisibleMessages = visibleMessages.length > 0;
  const canMutateMessages = audit.status === 'processing' && canComplete;
  const timing = useMemo(
    () => resolveServiceCrewCctvAuditPanelTiming(audit, currentTime),
    [audit, currentTime],
  );
  const completedMediaAttachments = useMemo(
    () => visibleMessages.flatMap((message) => message.attachments),
    [visibleMessages],
  );
  const mediaOnlyAttachments = useMemo(
    () => completedMediaAttachments.filter(
      (attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment),
    ),
    [completedMediaAttachments],
  );
  const hasMonetaryReward = Number(audit.monetary_reward ?? 0) > 0;
  const moneyFormatter = new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  });
  const allComplianceAnswered = COMPLIANCE_CRITERIA.every((criterion) =>
    isComplianceAnswered(answers[criterion.key]),
  );
  const allCustomerServiceRated = CUSTOMER_SERVICE_CRITERIA.every(
    (criterion) => answers[criterion.key] !== null,
  ) || CUSTOMER_SERVICE_CRITERIA.every(
    (criterion) => answers[criterion.key] === null,
  );
  const allAnswered = allComplianceAnswered && allCustomerServiceRated;

  const baseAuditDetailRows = [
    { label: 'Employee', value: employeeName },
    { label: 'Branch', value: branchLabel },
    { label: 'Audit Time', value: formatDateTime(audit.created_at) },
    ...(hasMonetaryReward
      ? [
          {
            label: 'Audit Reward',
            value: moneyFormatter.format(Number(audit.monetary_reward ?? 0)),
          },
        ]
      : []),
  ];
  const finalizedAuditDetailRows = [
    ...baseAuditDetailRows,
    ...(timing.durationText
      ? [{ label: 'Processing Time', value: timing.durationText }]
      : []),
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
        setMessages((current) =>
          current.map((message) => (message.id === updated.id ? updated : message)),
        );
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
    (
      attachment: StoreAuditAttachment,
      source: StoreAuditAttachment[],
      variant: 'message' | 'gallery' = 'message',
    ) => {
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
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className="animate-pulse rounded-lg border border-gray-200 bg-white p-3">
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
                    <p
                      className={`mt-1 whitespace-pre-wrap text-sm ${
                        message.is_deleted ? 'italic text-gray-400' : 'text-gray-700'
                      }`}
                    >
                      {message.content || '(No text)'}
                    </p>
                  )}

                  {message.attachments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {message.attachments.map((attachment) =>
                        renderAttachment(attachment, message.attachments),
                      )}
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

  const renderStatusBanner = (tone: 'pending' | 'processing' | 'completed' | 'rejected') => {
    const statusStyles = {
      pending: {
        wrapper: 'border-b border-slate-200 bg-slate-50',
        title: 'text-slate-900',
        meta: 'text-slate-600',
      },
      processing: {
        wrapper: 'border-b border-blue-100 bg-blue-50',
        title: 'text-blue-900',
        meta: 'text-blue-700',
      },
      completed: {
        wrapper: 'border-b border-green-100 bg-green-50',
        title: 'text-green-900',
        meta: 'text-green-700',
      },
      rejected: {
        wrapper: 'border-b border-red-100 bg-red-50',
        title: 'text-red-900',
        meta: 'text-red-700',
      },
    }[tone];

    return (
      <div className={`${statusStyles.wrapper} px-6 py-5`}>
        <div className="flex items-start gap-4">
          <EmployeeAvatar
            name={employeeName}
            avatarUrl={audit.audited_user_avatar_url ?? null}
            onClick={audit.audited_user_avatar_url ? () => setShowProfilePreview(true) : undefined}
          />
          <div className="min-w-0 flex-1">
            <p className={`text-lg font-semibold ${statusStyles.title}`}>{employeeName}</p>
            <p className={`mt-1 text-xs ${statusStyles.meta}`}>{branchLabel}</p>
            {audit.auditor_name && tone !== 'pending' && (
              <p className={`mt-1 text-xs ${statusStyles.meta}`}>Auditor: {audit.auditor_name}</p>
            )}
          </div>
          {hasMonetaryReward && (
            <div className="shrink-0 rounded-xl bg-white/70 px-3 py-2 text-right shadow-sm ring-1 ring-inset ring-white/80">
              <div className={`flex items-center gap-1 text-xs ${statusStyles.meta}`}>
                <Banknote className="h-3.5 w-3.5" />
                <span>Reward</span>
              </div>
              <p className={`text-sm font-bold ${statusStyles.title}`}>
                {moneyFormatter.format(Number(audit.monetary_reward ?? 0))}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderComplianceCriteria = (editable: boolean) => (
    <div className="border-b border-gray-200 px-6 py-5">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-blue-500" />
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Compliance Criteria</p>
      </div>
      <div className="space-y-2">
        {COMPLIANCE_CRITERIA.map((criterion) => {
          const value = answers[criterion.key];
          const badge = getTriStateBadge(value);

          return (
            <div key={criterion.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-800">{criterion.label}</p>
                  <p className="mt-1 text-xs leading-5 text-gray-500">{criterion.question}</p>
                </div>
                {editable ? (
                  <div className="w-full md:w-auto md:shrink-0">
                    <YesNoPill
                      value={value}
                      onChange={(nextValue) =>
                        setAnswers((prev) => ({ ...prev, [criterion.key]: nextValue }))
                      }
                      disabled={actionLoading}
                      showNotAuditable
                    />
                  </div>
                ) : (
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.className}`}>
                    {badge.label}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  const renderCustomerServiceCriteria = (editable: boolean) => (
    <div className="border-b border-gray-200 px-6 py-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-amber-500" />
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Customer Service Criteria</p>
        </div>
        {editable && (
          <button
            type="button"
            onClick={() => {
              setAnswers((prev) => ({
                ...prev,
                customer_interaction: null,
                cashiering: null,
                suggestive_selling_and_upselling: null,
                service_efficiency: null,
              }));
            }}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-tight text-gray-500 hover:bg-gray-50 hover:text-gray-700 focus:outline-none focus:ring-1 focus:ring-gray-300"
          >
            <XCircle className="h-3 w-3" />
            Not Auditable
          </button>
        )}
      </div>
      <div className="space-y-2">
        {CUSTOMER_SERVICE_CRITERIA.map((criterion) => (
          <div key={criterion.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-800">{criterion.label}</p>
                <p className="mt-1 text-xs leading-5 text-gray-500">{criterion.description}</p>
              </div>
              {editable ? (
                <div className="w-full md:w-auto md:shrink-0 md:self-center">
                  <StarRatingInput
                    value={answers[criterion.key]}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [criterion.key]: value }))}
                    disabled={actionLoading}
                  />
                </div>
              ) : (
                <div className="shrink-0 md:self-center">
                  <StarDisplay value={answers[criterion.key]} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        {audit.status === 'pending' && (
          <div className="space-y-0">
            {renderStatusBanner('pending')}
            {renderAuditDetailsSection(baseAuditDetailRows, 'px-6 py-5')}
          </div>
        )}

        {audit.status === 'processing' && (
          <div className="space-y-0">
            {renderStatusBanner('processing')}
            {renderAuditDetailsSection(baseAuditDetailRows, 'border-b border-gray-200 px-6 py-5')}
            {canComplete && renderComplianceCriteria(true)}
            {canComplete && renderCustomerServiceCriteria(true)}

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
                            onClick={() =>
                              setSelectedFiles((current) => current.filter((item) => item !== file))
                            }
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
                    placeholder="Add observation, finding, or note..."
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
                      disabled={
                        actionLoading ||
                        sendingMessage ||
                        (!messageDraft.trim() && selectedFiles.length === 0)
                      }
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <Send className="h-3.5 w-3.5" />
                        {sendingMessage ? 'Sending...' : 'Add Note'}
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
            {renderStatusBanner('rejected')}
            {renderAuditDetailsSection(finalizedAuditDetailRows, 'border-b border-gray-200 px-6 py-5')}
            {renderComplianceCriteria(false)}
            {renderCustomerServiceCriteria(false)}

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

        {audit.status === 'completed' && (
          <div className="space-y-0">
            {renderStatusBanner('completed')}
            {renderAuditDetailsSection(finalizedAuditDetailRows, 'border-b border-gray-200 px-6 py-5')}
            {renderComplianceCriteria(false)}
            {renderCustomerServiceCriteria(false)}

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

            {audit.scc_ai_report && (
              <div className="border-b border-gray-200 px-6 py-5">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary-500" />
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Report</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4">
                  <MarkdownReport text={audit.scc_ai_report} />
                </div>
              </div>
            )}

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

      <div className="border-t border-gray-200 px-6 py-4">
        {panelError && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>
        )}

        {audit.status === 'pending' && canProcess && (
          <Button className="w-full" onClick={onProcess} disabled={actionLoading}>
            <span className="inline-flex items-center gap-2">
              <ClipboardCheck className="h-4 w-4" />
              {actionLoading ? 'Processing...' : 'Process Audit'}
            </span>
          </Button>
        )}

        {audit.status === 'processing' && (canComplete || canReject) && (
          <div className="flex gap-3">
            {canReject && (
              <Button
                className="flex-1"
                variant="danger"
                onClick={onReject}
                disabled={actionLoading || !onReject}
              >
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
                  }
                  onComplete({
                    productivity_rate: toStoredComplianceValue(answers.productivity_rate),
                    uniform_compliance: toStoredComplianceValue(answers.uniform_compliance),
                    hygiene_compliance: toStoredComplianceValue(answers.hygiene_compliance),
                    sop_compliance: toStoredComplianceValue(answers.sop_compliance),
                    customer_interaction: answers.customer_interaction,
                    cashiering: answers.cashiering,
                    suggestive_selling_and_upselling: answers.suggestive_selling_and_upselling,
                    service_efficiency: answers.service_efficiency,
                  });
                }}
                disabled={actionLoading || messagesLoading || !allAnswered || !hasVisibleMessages}
              >
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {actionLoading ? 'Completing...' : 'Complete Audit'}
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
        onIndexChange={(index) =>
          setPreviewMedia((current) => (current ? { ...current, index } : null))
        }
        onClose={() => setPreviewMedia(null)}
      />

      <AnimatePresence>
        {showProfilePreview && audit.audited_user_avatar_url && (
          <AnimatedModal
            maxWidth="max-w-2xl"
            zIndexClass="z-[70]"
            onBackdropClick={() => setShowProfilePreview(false)}
          >
            <div className="border-b border-gray-200 px-5 py-4">
              <p className="font-semibold text-gray-900">{employeeName}</p>
              <p className="mt-1 text-sm text-gray-500">Employee profile preview</p>
            </div>
            <div className="bg-slate-950 p-4">
              <img
                src={audit.audited_user_avatar_url}
                alt={employeeName}
                className="max-h-[70vh] w-full rounded-xl object-contain"
              />
            </div>
          </AnimatedModal>
        )}
      </AnimatePresence>
    </div>
  );
}
