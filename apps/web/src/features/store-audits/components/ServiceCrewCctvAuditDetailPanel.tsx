import type { ChangeEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { StoreAudit, StoreAuditAttachment, StoreAuditMessage } from '@omnilert/shared';
import {
  AlertTriangle,
  Award,
  Ban,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Crown,
  ExternalLink,
  Eye,
  Paperclip,
  Pencil,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  X,
  XCircle,
  Zap,
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
import { FileThumbnail } from '@/shared/components/ui/FileThumbnail';

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

/* ------------------------------------------------------------------ */
/*  Performance tier system (completed view)                          */
/* ------------------------------------------------------------------ */

type PerformanceTier = 'outstanding' | 'proficient' | 'developing' | 'underperforming' | 'below_standards';

function getPerformanceTier(value: number | null, max = 5): PerformanceTier {
  if (value == null) return 'developing';
  const pct = value / max;
  if (pct >= 0.9) return 'outstanding';
  if (pct >= 0.7) return 'proficient';
  if (pct >= 0.5) return 'developing';
  if (pct >= 0.3) return 'underperforming';
  return 'below_standards';
}

function getLetterGrade(value: number | null, max: number | null): string {
  if (value == null || max == null || max <= 0) return '-';
  const pct = value / max;
  if (pct >= 0.95) return 'A+';
  if (pct >= 0.9) return 'A';
  if (pct >= 0.8) return 'B+';
  if (pct >= 0.7) return 'B';
  if (pct >= 0.6) return 'C+';
  if (pct >= 0.5) return 'C';
  if (pct >= 0.4) return 'D';
  return 'F';
}

function getAuditTier(audit: StoreAudit): PerformanceTier {
  const vals = [
    audit.scc_customer_interaction,
    audit.scc_cashiering,
    audit.scc_suggestive_selling_and_upselling,
    audit.scc_service_efficiency,
  ].filter((v): v is number => v != null);
  if (vals.length === 0) return 'developing';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return getPerformanceTier(avg, 5);
}

interface TierTheme {
  title: string;
  tagline: string;
  heroGradient: string;
  heroBorder: string;
  heroText: string;
  heroSubtext: string;
  iconBg: string;
  ringStroke: string;
  ringTrack: string;
  gradeBg: string;
  gradeText: string;
  gradeGlow: string;
  rankIcon: typeof Trophy;
}

const tierThemes: Record<PerformanceTier, TierTheme> = {
  outstanding: {
    title: 'Outstanding',
    tagline: 'Top-tier performance. Keep raising the bar!',
    heroGradient: 'from-amber-500 via-yellow-500 to-amber-400',
    heroBorder: 'border-yellow-300/40',
    heroText: 'text-amber-950',
    heroSubtext: 'text-amber-900/70',
    iconBg: 'bg-amber-900/10',
    ringStroke: '#b45309',
    ringTrack: 'rgba(180,83,9,0.12)',
    gradeBg: 'bg-amber-900/90',
    gradeText: 'text-yellow-300',
    gradeGlow: 'shadow-[0_0_24px_rgba(234,179,8,0.45)]',
    rankIcon: Crown,
  },
  proficient: {
    title: 'Proficient',
    tagline: 'Solid execution. A few areas away from outstanding.',
    heroGradient: 'from-sky-500 via-blue-500 to-indigo-400',
    heroBorder: 'border-blue-300/30',
    heroText: 'text-white',
    heroSubtext: 'text-blue-100',
    iconBg: 'bg-white/15',
    ringStroke: '#3b82f6',
    ringTrack: 'rgba(255,255,255,0.15)',
    gradeBg: 'bg-white/20',
    gradeText: 'text-white',
    gradeGlow: 'shadow-[0_0_16px_rgba(59,130,246,0.3)]',
    rankIcon: Award,
  },
  developing: {
    title: 'Developing',
    tagline: 'Progress noted. Focus on the gaps to level up.',
    heroGradient: 'from-amber-100 via-orange-50 to-yellow-50',
    heroBorder: 'border-amber-200',
    heroText: 'text-amber-900',
    heroSubtext: 'text-amber-800/70',
    iconBg: 'bg-amber-500/10',
    ringStroke: '#d97706',
    ringTrack: 'rgba(217,119,6,0.1)',
    gradeBg: 'bg-amber-600',
    gradeText: 'text-white',
    gradeGlow: '',
    rankIcon: Target,
  },
  underperforming: {
    title: 'Underperforming',
    tagline: 'Improvement plan required. Review flagged areas.',
    heroGradient: 'from-gray-200 via-slate-100 to-gray-100',
    heroBorder: 'border-gray-300',
    heroText: 'text-gray-800',
    heroSubtext: 'text-gray-600',
    iconBg: 'bg-gray-500/10',
    ringStroke: '#ef4444',
    ringTrack: 'rgba(239,68,68,0.08)',
    gradeBg: 'bg-red-600',
    gradeText: 'text-white',
    gradeGlow: '',
    rankIcon: TrendingDown,
  },
  below_standards: {
    title: 'Below Standards',
    tagline: 'Immediate attention needed. Corrective action required.',
    heroGradient: 'from-gray-700 via-gray-600 to-slate-500',
    heroBorder: 'border-gray-500/30',
    heroText: 'text-white',
    heroSubtext: 'text-gray-300',
    iconBg: 'bg-white/[0.08]',
    ringStroke: '#dc2626',
    ringTrack: 'rgba(255,255,255,0.06)',
    gradeBg: 'bg-red-700',
    gradeText: 'text-red-100',
    gradeGlow: '',
    rankIcon: TrendingDown,
  },
};

const skillTierConfig: Record<PerformanceTier, {
  barColor: string;
  barGlow: string;
  label: string;
  labelBg: string;
  dotFill: string;
  dotEmpty: string;
}> = {
  outstanding: {
    barColor: 'bg-gradient-to-r from-yellow-400 via-amber-400 to-yellow-500',
    barGlow: 'shadow-[0_0_10px_rgba(234,179,8,0.35)]',
    label: 'Outstanding',
    labelBg: 'text-amber-800 bg-amber-100 ring-amber-300',
    dotFill: 'bg-amber-400 ring-amber-300',
    dotEmpty: 'bg-amber-100 ring-amber-200',
  },
  proficient: {
    barColor: 'bg-gradient-to-r from-blue-400 to-sky-500',
    barGlow: 'shadow-[0_0_8px_rgba(59,130,246,0.25)]',
    label: 'Proficient',
    labelBg: 'text-blue-800 bg-blue-100 ring-blue-300',
    dotFill: 'bg-blue-400 ring-blue-300',
    dotEmpty: 'bg-blue-100 ring-blue-200',
  },
  developing: {
    barColor: 'bg-gradient-to-r from-amber-400 to-orange-400',
    barGlow: '',
    label: 'Developing',
    labelBg: 'text-amber-800 bg-amber-50 ring-amber-200',
    dotFill: 'bg-amber-400 ring-amber-300',
    dotEmpty: 'bg-gray-100 ring-gray-200',
  },
  underperforming: {
    barColor: 'bg-gradient-to-r from-orange-500 to-red-400',
    barGlow: '',
    label: 'Underperforming',
    labelBg: 'text-red-800 bg-red-50 ring-red-200',
    dotFill: 'bg-red-400 ring-red-300',
    dotEmpty: 'bg-gray-100 ring-gray-200',
  },
  below_standards: {
    barColor: 'bg-gradient-to-r from-red-600 to-red-700',
    barGlow: '',
    label: 'Below Standards',
    labelBg: 'text-red-900 bg-red-100 ring-red-300',
    dotFill: 'bg-red-500 ring-red-400',
    dotEmpty: 'bg-gray-100 ring-gray-200',
  },
};

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const auditPanelFadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const auditPanelStagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

/* ------------------------------------------------------------------ */
/*  Score ring                                                         */
/* ------------------------------------------------------------------ */

function ScoreRing({
  value,
  max,
  stroke,
  track,
  size = 80,
}: {
  value: number | null;
  max: number | null;
  stroke: string;
  track: string;
  size?: number;
}) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 250);
    return () => clearTimeout(t);
  }, []);

  const v = value ?? 0;
  const m = max && max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(1, v / m));
  const r = (size - 10) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - (animated ? pct : 0));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={7} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={stroke}
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-extrabold leading-none" style={{ color: stroke }}>
          {value != null ? (Number.isInteger(value) ? value : value.toFixed(1)) : '-'}
        </span>
        {max != null && (
          <span className="mt-0.5 text-[10px] font-semibold leading-none opacity-40">/ {max}</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skill dots                                                         */
/* ------------------------------------------------------------------ */

function SkillDots({ value, max = 5, tier }: { value: number | null; max?: number; tier: PerformanceTier }) {
  const filled = value != null ? Math.round(Math.max(0, Math.min(max, value))) : 0;
  const cfg = skillTierConfig[tier];
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.4 + i * 0.08, type: 'spring', stiffness: 400, damping: 15 }}
          className={`h-2.5 w-2.5 rounded-full ring-1 ring-inset ${i < filled ? cfg.dotFill : cfg.dotEmpty}`}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Rating bar                                                         */
/* ------------------------------------------------------------------ */

function RatingBar({ value, max = 5, tier }: { value: number | null; max?: number; tier: PerformanceTier }) {
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 350);
    return () => clearTimeout(t);
  }, []);
  const pct = value != null ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const cfg = skillTierConfig[tier];
  return (
    <div className="h-2 overflow-hidden rounded-full bg-gray-100">
      <div
        className={`h-full rounded-full transition-all duration-700 ease-out ${cfg.barColor} ${cfg.barGlow}`}
        style={{ width: animated ? `${pct}%` : '0%' }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Achievement banner                                                 */
/* ------------------------------------------------------------------ */

function CompletedAchievementBanner({ passCount, total }: { passCount: number; total: number }) {
  if (total === 0) return null;
  if (passCount === total) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.5, type: 'spring', stiffness: 300, damping: 20 }}
        className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 px-3.5 py-2 text-white shadow-md shadow-emerald-500/20"
      >
        <Trophy className="h-4 w-4 shrink-0" />
        <div>
          <p className="text-xs font-bold uppercase tracking-wide">Full Compliance Achieved</p>
          <p className="text-[10px] text-emerald-100">All {total} standards met — exemplary adherence.</p>
        </div>
      </motion.div>
    );
  }
  if (passCount === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2">
        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
        <div>
          <p className="text-xs font-bold text-red-800 uppercase tracking-wide">No Standards Met</p>
          <p className="text-[10px] text-red-600">0/{total} — immediate corrective action required.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2">
      <Target className="h-4 w-4 shrink-0 text-amber-600" />
      <div>
        <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">{passCount}/{total} Standards Met</p>
        <p className="text-[10px] text-amber-600">
          {total - passCount} area{total - passCount > 1 ? 's' : ''} need{total - passCount === 1 ? 's' : ''} attention.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Employee avatar                                                    */
/* ------------------------------------------------------------------ */

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
          const parsed = JSON.parse(saved) as { answers?: Partial<AnswersState>; messageDraft?: string };
          if (parsed.answers && typeof parsed.answers === 'object') {
            return { ...buildDefaultAnswers(audit), ...parsed.answers };
          }
        }
      } catch {
      }
    }
    return buildDefaultAnswers(audit);
  });
  const [messages, setMessages] = useState<StoreAuditMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageDraft, setMessageDraft] = useState(() => {
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { messageDraft?: string };
          return parsed.messageDraft ?? '';
        }
      } catch {
      }
    }
    return '';
  });
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
      localStorage.setItem(draftKey, JSON.stringify({ answers, messageDraft }));
    } catch {
    }
  }, [answers, messageDraft, audit.status, draftKey]);

  useEffect(() => {
    const fallback = buildDefaultAnswers(audit);
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { answers?: Partial<AnswersState>; messageDraft?: string };
          if (parsed && typeof parsed === 'object') {
            setAnswers({ ...fallback, ...(parsed.answers || {}) });
            setMessageDraft(parsed.messageDraft ?? '');
            return;
          }
        }
      } catch {
      }
    }
    setAnswers(fallback);
    setMessageDraft('');
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
  const allAnswered = allComplianceAnswered;

  // Gamey completed view — tier + score
  const completedCsVals = [
    audit.scc_customer_interaction,
    audit.scc_cashiering,
    audit.scc_suggestive_selling_and_upselling,
    audit.scc_service_efficiency,
  ].filter((v): v is number => v != null);
  const completedAvgScore = completedCsVals.length > 0
    ? completedCsVals.reduce((a, b) => a + b, 0) / completedCsVals.length
    : null;
  const completedTier = getAuditTier(audit);
  const completedTheme = tierThemes[completedTier];
  const CompletedRankIcon = completedTheme.rankIcon;
  const completedLetterGrade = getLetterGrade(completedAvgScore, 5);
  const completedComplianceCriteria = [
    { key: 'productivity_rate', label: 'Productivity Rate', value: audit.scc_productivity_rate ?? null },
    { key: 'uniform_compliance', label: 'Uniform Compliance', value: audit.scc_uniform_compliance ?? null },
    { key: 'hygiene_compliance', label: 'Hygiene Compliance', value: audit.scc_hygiene_compliance ?? null },
    { key: 'sop_compliance', label: 'SOP Compliance', value: audit.scc_sop_compliance ?? null },
  ];
  const completedPassCount = completedComplianceCriteria.filter((c) => c.value === true).length;
  const completedAuditedCount = completedComplianceCriteria.filter((c) => c.value !== null).length;

  const baseAuditDetailRows = [
    { label: 'Employee', value: employeeName },
    { label: 'Branch', value: branchLabel },
    { label: 'Audit Time', value: formatDateTime(audit.created_at) },
    {
      label: 'Audit End Time',
      value: audit.created_at
        ? formatDateTime(new Date(new Date(audit.created_at).getTime() + 20 * 60 * 1000).toISOString())
        : '-',
    },
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
  const completedAuditDetailRows = [
    ...baseAuditDetailRows,
    ...(audit.completed_at
      ? [{ label: 'Completed At', value: formatDateTime(audit.completed_at) }]
      : []),
    ...(timing.durationText
      ? [{ label: 'Audit Duration', value: timing.durationText }]
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
                    <div className="mb-3 flex flex-wrap gap-3 p-1">
                      {selectedFiles.map((file) => (
                        <FileThumbnail
                          key={`${file.name}-${file.size}-${file.lastModified}`}
                          file={file}
                          onRemove={() =>
                            setSelectedFiles((current) => current.filter((item) => item !== file))
                          }
                        />
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
                    onPaste={async (e) => {
                      const items = Array.from(e.clipboardData.items);
                      const imageItems = items.filter((item) => item.type.startsWith('image/'));
                      if (imageItems.length === 0) return;

                      const newFiles: File[] = [];
                      for (const item of imageItems) {
                        const blob = item.getAsFile();
                        if (blob) {
                          const extension = item.type.split('/')[1] || 'png';
                          const file = new File(
                            [blob],
                            `pasted-image-${Date.now()}.${extension}`,
                            { type: item.type },
                          );
                          newFiles.push(await normalizeFileForUpload(file));
                        }
                      }

                      if (newFiles.length > 0) {
                        // Auto-send logic for pasted images
                        setSendingMessage(true);
                        try {
                          const allFiles = [...selectedFiles, ...newFiles];
                          const form = new FormData();
                          form.append('content', messageDraft.trim());
                          for (const file of allFiles) {
                            form.append('files', file);
                          }

                          const response = await api.post(`/store-audits/${audit.id}/messages`, form);
                          const created = response.data.data as StoreAuditMessage;
                          setMessages((current) => [...current, created]);
                          
                          // Clear drafts
                          setMessageDraft('');
                          setSelectedFiles([]);
                          try {
                            localStorage.removeItem(draftKey);
                          } catch {}
                        } catch (err: any) {
                          showErrorToast(err.response?.data?.error || 'Failed to send pasted image');
                        } finally {
                          setSendingMessage(false);
                        }
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
          <motion.div
            className="space-y-0"
            variants={auditPanelStagger}
            initial="hidden"
            animate="show"
          >
            {/* ── Rejected Hero ── */}
            <motion.section
              variants={auditPanelFadeUp}
              className="relative overflow-hidden border-b border-zinc-700/30 bg-gradient-to-br from-slate-800 via-slate-700 to-zinc-700 px-6 py-6"
            >
              {/* Diagonal stripe texture */}
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.035]"
                style={{
                  backgroundImage: 'repeating-linear-gradient(-45deg, white 0, white 1px, transparent 0, transparent 50%)',
                  backgroundSize: '12px 12px',
                }}
              />
              <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/[0.03]" />
              <div className="pointer-events-none absolute -bottom-4 -left-4 h-20 w-20 rounded-full bg-white/[0.02]" />

              <div className="relative flex items-start gap-4">
                {/* Void badge */}
                <div className="flex h-[80px] w-[80px] shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-inset ring-white/10">
                  <Ban className="h-10 w-10 text-zinc-300" />
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    Audit Closed
                  </p>
                  <p className="mt-1 text-lg font-extrabold leading-tight text-white">Audit Rejected</p>
                  <p className="mt-1.5 text-sm italic leading-relaxed text-zinc-300">
                    &ldquo;This audit was closed before the evaluation could be completed.&rdquo;
                  </p>
                </div>
              </div>

              {/* Employee info strip */}
              <div className="relative mt-4 rounded-xl bg-white/10 px-4 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <EmployeeAvatar
                    name={employeeName}
                    avatarUrl={audit.audited_user_avatar_url ?? null}
                    onClick={audit.audited_user_avatar_url ? () => setShowProfilePreview(true) : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold leading-tight text-white">{employeeName}</p>
                    <p className="text-xs text-zinc-300">{branchLabel}</p>
                    {audit.auditor_name && (
                      <p className="text-xs text-zinc-400">Auditor: {audit.auditor_name}</p>
                    )}
                  </div>
                  {hasMonetaryReward && (
                    <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-right ring-1 ring-inset ring-white/10">
                      <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <Banknote className="h-3.5 w-3.5" />
                        <span>Reward</span>
                      </div>
                      <p className="text-sm font-bold text-white">
                        {moneyFormatter.format(Number(audit.monetary_reward ?? 0))}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Audit Details */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Audit Details</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                {finalizedAuditDetailRows.map(({ label, value }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 + i * 0.05 }}
                    className="flex items-baseline gap-4 px-4 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-gray-100"
                  >
                    <dt className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
                    <dd className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{value}</dd>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Rejection Reason */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <Ban className="h-4 w-4 text-zinc-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Rejection Reason</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                <div className="px-4 py-3.5">
                  <p className="whitespace-pre-wrap text-sm text-zinc-700">
                    {audit.rejection_reason || 'No rejection reason recorded.'}
                  </p>
                </div>
              </div>
            </motion.section>

            {/* Audit Notes */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Audit Notes</p>
              </div>
              {renderMessageTrail(true)}
            </motion.section>

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
          </motion.div>
        )}

        {audit.status === 'completed' && (
          <motion.div
            className="space-y-0"
            variants={auditPanelStagger}
            initial="hidden"
            animate="show"
          >
            {/* ── Performance Hero ── */}
            <motion.section
              variants={auditPanelFadeUp}
              className={`relative overflow-hidden border-b ${completedTheme.heroBorder} bg-gradient-to-br ${completedTheme.heroGradient} px-6 py-6`}
            >
              <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/[0.06]" />
              <div className="pointer-events-none absolute -bottom-3 -left-3 h-16 w-16 rounded-full bg-white/[0.04]" />
              <div className="pointer-events-none absolute right-12 top-12 h-8 w-8 rounded-full bg-white/[0.03]" />

              <div className="relative flex items-start gap-4">
                <div className="flex shrink-0 flex-col items-center gap-1.5">
                  {completedAvgScore != null ? (
                    <ScoreRing
                      value={parseFloat(completedAvgScore.toFixed(1))}
                      max={5}
                      stroke={completedTheme.ringStroke}
                      track={completedTheme.ringTrack}
                      size={80}
                    />
                  ) : (
                    <div className={`flex h-[80px] w-[80px] items-center justify-center rounded-2xl ${completedTheme.iconBg}`}>
                      <ShieldCheck className="h-8 w-8 opacity-60" style={{ color: completedTheme.ringStroke }} />
                    </div>
                  )}
                  {completedAvgScore != null && (
                    <motion.span
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.6, type: 'spring', stiffness: 400, damping: 15 }}
                      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-extrabold ${completedTheme.gradeBg} ${completedTheme.gradeText} ${completedTheme.gradeGlow}`}
                    >
                      {completedLetterGrade}
                    </motion.span>
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-1">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${completedTheme.heroSubtext} opacity-70`}>
                    Performance Review
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <CompletedRankIcon className={`h-5 w-5 shrink-0 ${completedTheme.heroText}`} />
                    <p className={`text-lg font-extrabold ${completedTheme.heroText} leading-tight`}>{completedTheme.title}</p>
                  </div>
                  <p className={`mt-1.5 text-sm ${completedTheme.heroSubtext} leading-relaxed italic`}>
                    &ldquo;{completedTheme.tagline}&rdquo;
                  </p>
                </div>
              </div>

              {/* Employee info strip */}
              <div className={`relative mt-4 rounded-xl ${completedTheme.iconBg} px-4 py-3`}>
                <div className="flex flex-wrap items-center gap-3">
                  <EmployeeAvatar
                    name={employeeName}
                    avatarUrl={audit.audited_user_avatar_url ?? null}
                    onClick={audit.audited_user_avatar_url ? () => setShowProfilePreview(true) : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`font-semibold leading-tight ${completedTheme.heroText}`}>{employeeName}</p>
                    <p className={`text-xs ${completedTheme.heroSubtext}`}>{branchLabel}</p>
                    {audit.auditor_name && (
                      <p className={`text-xs ${completedTheme.heroSubtext} opacity-70`}>Auditor: {audit.auditor_name}</p>
                    )}
                  </div>
                  {hasMonetaryReward && (
                    <div className={`shrink-0 rounded-xl ${completedTheme.iconBg} px-3 py-2 text-right ring-1 ring-inset ring-white/20`}>
                      <div className={`flex items-center gap-1 text-xs ${completedTheme.heroSubtext}`}>
                        <Banknote className="h-3.5 w-3.5" />
                        <span>Reward</span>
                      </div>
                      <p className={`text-sm font-bold ${completedTheme.heroText}`}>
                        {moneyFormatter.format(Number(audit.monetary_reward ?? 0))}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.section>

            {/* Audit Details */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-gray-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Audit Details</p>
              </div>
              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
                {completedAuditDetailRows.map(({ label, value }, i) => (
                  <motion.div
                    key={label}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.08 + i * 0.05 }}
                    className="flex items-baseline gap-4 px-4 py-2.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-gray-100"
                  >
                    <dt className="w-28 shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</dt>
                    <dd className="min-w-0 flex-1 text-sm font-semibold text-gray-900">{value}</dd>
                  </motion.div>
                ))}
              </div>
            </motion.section>

            {/* Compliance Standards */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Compliance Standards</p>
              </div>
              <CompletedAchievementBanner passCount={completedPassCount} total={completedAuditedCount} />
              <div className="grid grid-cols-2 gap-2">
                {completedComplianceCriteria.map((criterion, i) => {
                  const isPass = criterion.value === true;
                  const isFail = criterion.value === false;
                  return (
                    <motion.div
                      key={criterion.key}
                      initial={{ opacity: 0, scale: 0.85, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ delay: 0.15 + i * 0.08, type: 'spring', stiffness: 280, damping: 22 }}
                      className={`relative flex flex-col items-center gap-2.5 overflow-hidden rounded-2xl border px-3 py-4 text-center ${
                        isPass
                          ? 'border-emerald-200/80 bg-gradient-to-b from-emerald-50 to-white'
                          : isFail
                            ? 'border-red-200/80 bg-gradient-to-b from-red-50 to-white'
                            : 'border-dashed border-gray-200 bg-gray-50/60'
                      }`}
                    >
                      <div className={`absolute inset-x-0 top-0 h-0.5 ${isPass ? 'bg-emerald-400' : isFail ? 'bg-red-400' : 'bg-gray-200'}`} />
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 400, damping: 18 }}
                        className={`relative flex h-11 w-11 items-center justify-center rounded-full ${isPass ? 'bg-emerald-100' : isFail ? 'bg-red-100' : 'bg-gray-100'}`}
                      >
                        <div className={`absolute inset-0 rounded-full border-2 ${isPass ? 'border-emerald-300' : isFail ? 'border-red-300' : 'border-dashed border-gray-300'}`} />
                        {isPass && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                        {isFail && <XCircle className="h-5 w-5 text-red-600" />}
                        {criterion.value === null && <span className="text-base font-bold text-gray-300">–</span>}
                      </motion.div>
                      <p className={`text-[11px] font-semibold leading-tight ${isFail ? 'text-red-900' : 'text-gray-800'}`}>
                        {criterion.label}
                      </p>
                      <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                        isPass ? 'bg-emerald-600 text-white' : isFail ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'
                      }`}>
                        {isPass ? 'Pass' : isFail ? 'Fail' : 'N/A'}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>

            {/* Service Skills */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Service Skills</p>
              </div>
              <div className="grid gap-3">
                {CUSTOMER_SERVICE_CRITERIA.map((criterion, i) => {
                  const value = answers[criterion.key];
                  const skillTier = getPerformanceTier(value, 5);
                  const sCfg = skillTierConfig[skillTier];
                  const isStrong = skillTier === 'outstanding' || skillTier === 'proficient';
                  const isWeak = skillTier === 'underperforming' || skillTier === 'below_standards';
                  return (
                    <motion.div
                      key={criterion.key}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.25 + i * 0.09, duration: 0.4 }}
                      className={`rounded-xl border bg-white px-4 py-3.5 ${
                        value === null ? 'border-gray-100 opacity-80' :
                        isWeak ? 'border-red-200' :
                        skillTier === 'developing' ? 'border-amber-200' : 'border-gray-200'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isStrong && <TrendingUp className={`h-3.5 w-3.5 shrink-0 ${skillTier === 'outstanding' ? 'text-amber-500' : 'text-blue-500'}`} />}
                          {isWeak && <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                          {skillTier === 'developing' && <Target className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
                          <p className="text-sm font-semibold text-gray-900">{criterion.label}</p>
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${
                          value === null ? 'bg-gray-100 text-gray-500 ring-gray-300' : sCfg.labelBg
                        }`}>
                          {value === null ? 'Not Auditable' : sCfg.label}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">{criterion.description}</p>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <RatingBar value={value} tier={skillTier} />
                        </div>
                        <div className="flex items-center gap-2">
                          <SkillDots value={value} tier={skillTier} />
                          <span className={`text-sm font-extrabold tabular-nums ${
                            value === null ? 'text-gray-400' :
                            skillTier === 'outstanding' ? 'text-amber-700' :
                            skillTier === 'proficient' ? 'text-blue-700' :
                            skillTier === 'developing' ? 'text-amber-700' :
                            'text-red-700'
                          }`}>
                            {value ?? '-'}<span className="font-normal text-xs text-gray-400">/5</span>
                          </span>
                        </div>
                      </div>
                      {skillTier === 'outstanding' && (
                        <motion.p
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.6 }}
                          className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-amber-600"
                        >
                          <Star className="h-3 w-3" />
                          Exceeding expectations — role model performance.
                        </motion.p>
                      )}
                      {skillTier === 'below_standards' && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-600">
                          <XCircle className="h-3 w-3" />
                          Requires immediate coaching and follow-up.
                        </p>
                      )}
                      {skillTier === 'underperforming' && (
                        <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                          <Target className="h-3 w-3" />
                          Targeted improvement needed in this area.
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.section>

            {/* Audit Notes */}
            <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-indigo-500" />
                <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Audit Notes</p>
              </div>
              {renderMessageTrail(true)}
            </motion.section>

            {mediaOnlyAttachments.length > 0 && (
              <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="h-4 w-4 text-gray-500" />
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Media</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[10px] font-bold text-gray-500">
                    {mediaOnlyAttachments.length} file{mediaOnlyAttachments.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {mediaOnlyAttachments.map((attachment, i) => (
                    <motion.div
                      key={attachment.id}
                      initial={{ opacity: 0, scale: 0.88 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.1 + i * 0.07, type: 'spring', stiffness: 280, damping: 22 }}
                      className="space-y-1"
                    >
                      <div className="overflow-hidden rounded-xl border border-gray-200 shadow-[0_2px_6px_rgba(15,23,42,0.06)]">
                        {renderAttachment(attachment, mediaOnlyAttachments, 'gallery')}
                      </div>
                      <p className="truncate px-0.5 text-xs text-gray-400" title={attachment.file_name}>
                        {attachment.file_name}
                      </p>
                    </motion.div>
                  ))}
                </div>
              </motion.section>
            )}

            {audit.scc_ai_report && (
              <motion.section variants={auditPanelFadeUp} className="space-y-3 border-b border-gray-200 px-6 py-5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-500" />
                  <p className="text-sm font-bold uppercase tracking-wide text-gray-900">Performance Insights</p>
                </div>
                <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-purple-50/40 px-4 py-3.5">
                  <MarkdownReport text={audit.scc_ai_report} />
                </div>
              </motion.section>
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
          </motion.div>
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
