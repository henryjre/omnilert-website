import React, { useEffect, useState } from 'react';
import type {
  AccountAuditResultDetail,
} from '@omnilert/shared';
import { motion } from 'framer-motion';
import {
  Award,
  Calendar,
  CheckCircle2,
  Crown,
  ShieldCheck,
  Sparkles,
  Star,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Formatters                                                         */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Performance tier system                                            */
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

function getOverallTier(audit: AccountAuditResultDetail): PerformanceTier {
  const { overall_value, overall_max } = audit.summary;
  if (overall_value != null && overall_max != null && overall_max > 0) {
    return getPerformanceTier(overall_value, overall_max);
  }
  const cs = audit.scc_result?.customer_service_criteria;
  if (!cs) return 'developing';
  const vals = [cs.customer_interaction, cs.cashiering, cs.suggestive_selling_and_upselling, cs.service_efficiency].filter(
    (v): v is number => v != null,
  );
  if (vals.length === 0) return 'developing';
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  return getPerformanceTier(avg, 5);
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

interface TierTheme {
  title: string;
  tagline: string;
  grade: string;
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
    grade: 'A+',
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
    grade: 'B+',
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
    grade: 'C',
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
    grade: 'D',
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
    grade: 'F',
    heroGradient: 'from-gray-700 via-gray-600 to-slate-500',
    heroBorder: 'border-gray-500/30',
    heroText: 'text-white',
    heroSubtext: 'text-gray-300',
    iconBg: 'bg-white/8',
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
/*  Animated score ring                                                */
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
          {value != null ? value : '-'}
        </span>
        {max != null && (
          <span className="text-[10px] font-semibold opacity-40 leading-none mt-0.5">/ {max}</span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skill dots (XP-style)                                              */
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
/*  Animated rating bar                                                */
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
/*  Compliance badge                                                   */
/* ------------------------------------------------------------------ */

function ComplianceBadge({ value }: { value: boolean | null }) {
  if (value === true) {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 ring-1 ring-inset ring-emerald-200"
      >
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
        <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Pass</span>
      </motion.div>
    );
  }
  if (value === false) {
    return (
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 500, damping: 20 }}
        className="flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 ring-1 ring-inset ring-red-200"
      >
        <XCircle className="h-3.5 w-3.5 text-red-600" />
        <span className="text-[10px] font-bold text-red-700 uppercase tracking-wider">Fail</span>
      </motion.div>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 bg-gray-50 px-2.5 py-1">
      <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">N/A</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Achievement banner                                                 */
/* ------------------------------------------------------------------ */

function AchievementBanner({ passCount, total }: { passCount: number; total: number }) {
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
        <p className="text-xs font-bold text-amber-800 uppercase tracking-wide">
          {passCount}/{total} Standards Met
        </p>
        <p className="text-[10px] text-amber-600">
          {total - passCount} area{total - passCount > 1 ? 's' : ''} need{total - passCount === 1 ? 's' : ''} attention to reach full compliance.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Markdown report                                                    */
/* ------------------------------------------------------------------ */

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
      raw.split(/(\*\*[^*]+\*\*)/g).map((part, idx) =>
        part.startsWith('**') && part.endsWith('**')
          ? <strong key={idx} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
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
      elements.push(<p key={key++} className="text-sm text-gray-700">{renderInline(content)}</p>);
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: 'easeOut' as const } },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

/* ------------------------------------------------------------------ */
/*  Criteria definitions                                               */
/* ------------------------------------------------------------------ */

const customerServiceCriteria = [
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
    label: 'Suggestive Selling & Upselling',
    description: 'Relevant add-on offers, confident recommendations, natural timing',
  },
  {
    key: 'service_efficiency',
    label: 'Service Efficiency',
    description: 'Steady pace, organized workflow, minimal idle time, smooth service handoff',
  },
] as const;

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function AccountAuditResultDetailPanel({ audit }: { audit: AccountAuditResultDetail }) {
  const overallTier = getOverallTier(audit);
  const theme = tierThemes[overallTier];
  const { overall_value, overall_max } = audit.summary;
  const letterGrade = getLetterGrade(overall_value, overall_max);
  const RankIcon = theme.rankIcon;

  const complianceCriteria = audit.scc_result
    ? [
      { key: 'productivity_rate', label: 'Productivity Rate', value: audit.scc_result.compliance_criteria.productivity_rate },
      { key: 'uniform_compliance', label: 'Uniform Compliance', value: audit.scc_result.compliance_criteria.uniform_compliance },
      { key: 'hygiene_compliance', label: 'Hygiene Compliance', value: audit.scc_result.compliance_criteria.hygiene_compliance },
      { key: 'sop_compliance', label: 'SOP Compliance', value: audit.scc_result.compliance_criteria.sop_compliance },
    ]
    : [];

  const customerServiceValues = audit.scc_result?.customer_service_criteria;

  const compliancePassCount = complianceCriteria.filter((c) => c.value === true).length;
  const complianceTotal = complianceCriteria.filter((c) => c.value !== null).length;

  return (
    <motion.div
      className="flex-1 space-y-5 overflow-y-auto px-6 py-5"
      variants={staggerContainer}
      initial="hidden"
      animate="show"
    >
      {/* ── Performance Hero ── */}
      <motion.section
        variants={fadeUp}
        className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${theme.heroGradient} p-5 ${theme.heroBorder} border`}
      >
        {/* Decorative shapes */}
        <div className="pointer-events-none absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/[0.06]" />
        <div className="pointer-events-none absolute -bottom-3 -left-3 h-16 w-16 rounded-full bg-white/[0.04]" />
        <div className="pointer-events-none absolute right-12 top-12 h-8 w-8 rounded-full bg-white/[0.03]" />

        <div className="relative flex items-start gap-4">
          {/* Score ring or grade badge */}
          {overall_value != null && overall_max != null ? (
            <div className="flex flex-col items-center gap-1.5">
              <ScoreRing
                value={overall_value}
                max={overall_max}
                stroke={theme.ringStroke}
                track={theme.ringTrack}
                size={80}
              />
              <motion.span
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.6, type: 'spring', stiffness: 400, damping: 15 }}
                className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-extrabold ${theme.gradeBg} ${theme.gradeText} ${theme.gradeGlow}`}
              >
                {letterGrade}
              </motion.span>
            </div>
          ) : (
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${theme.iconBg} backdrop-blur-sm`}>
              <ShieldCheck className="h-7 w-7 text-white" />
            </div>
          )}

          <div className="min-w-0 flex-1 pt-1">
            <p className={`text-xs font-semibold uppercase tracking-wider ${theme.heroSubtext} opacity-70`}>
              Performance Review
            </p>
            <div className="mt-1 flex items-center gap-2">
              <RankIcon className={`h-5 w-5 shrink-0 ${theme.heroText}`} />
              <p className={`text-lg font-extrabold ${theme.heroText} leading-tight`}>{theme.title}</p>
            </div>
            <p className={`mt-1.5 text-sm ${theme.heroSubtext} leading-relaxed italic`}>
              &ldquo;{theme.tagline}&rdquo;
            </p>

          </div>
        </div>

        {/* Result line */}
        <div className={`relative mt-4 rounded-xl ${theme.iconBg} px-3.5 py-2.5`}>
          <p className={`text-sm font-medium ${theme.heroText} opacity-90 leading-relaxed`}>
            {audit.summary.result_line}
          </p>
        </div>
      </motion.section>

      {/* ── Compliance Standards ── */}
      {complianceCriteria.length > 0 && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">Compliance Standards</p>
          </div>

          <AchievementBanner passCount={compliancePassCount} total={complianceTotal} />

          <div className="grid grid-cols-2 gap-2">
            {complianceCriteria.map((criterion, i) => {
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
                  {/* Top accent bar */}
                  <div className={`absolute inset-x-0 top-0 h-0.5 ${
                    isPass ? 'bg-emerald-400' : isFail ? 'bg-red-400' : 'bg-gray-200'
                  }`} />

                  {/* Status icon circle */}
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 400, damping: 18 }}
                    className={`relative flex h-11 w-11 items-center justify-center rounded-full ${
                      isPass ? 'bg-emerald-100' : isFail ? 'bg-red-100' : 'bg-gray-100'
                    }`}
                  >
                    <div className={`absolute inset-0 rounded-full border-2 ${
                      isPass ? 'border-emerald-300' : isFail ? 'border-red-300' : 'border-dashed border-gray-300'
                    }`} />
                    {isPass && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                    {isFail && <XCircle className="h-5 w-5 text-red-600" />}
                    {criterion.value === null && <span className="text-base font-bold text-gray-300">–</span>}
                  </motion.div>

                  {/* Label */}
                  <p className={`text-[11px] font-semibold leading-tight ${
                    isFail ? 'text-red-900' : 'text-gray-800'
                  }`}>
                    {criterion.label}
                  </p>

                  {/* Status pill */}
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${
                    isPass
                      ? 'bg-emerald-600 text-white'
                      : isFail
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}>
                    {isPass ? 'Pass' : isFail ? 'Fail' : 'N/A'}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Service Skill Assessment ── */}
      {customerServiceValues && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">Service Skills</p>
          </div>
          <div className="grid gap-3">
            {customerServiceCriteria.map((criterion, i) => {
              const value = customerServiceValues[criterion.key];
              const tier = getPerformanceTier(value, 5);
              const sCfg = skillTierConfig[tier];
              const isStrong = tier === 'outstanding' || tier === 'proficient';
              const isWeak = tier === 'underperforming' || tier === 'below_standards';

              return (
                <motion.div
                  key={criterion.key}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.09, duration: 0.4 }}
                  className={`rounded-xl border bg-white px-4 py-3.5 ${
                    value === null ? 'border-gray-100 opacity-80' :
                    isWeak ? 'border-red-200' :
                    tier === 'developing' ? 'border-amber-200' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {isStrong && (
                        <TrendingUp className={`h-3.5 w-3.5 shrink-0 ${tier === 'outstanding' ? 'text-amber-500' : 'text-blue-500'}`} />
                      )}
                      {isWeak && <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                      {tier === 'developing' && <Target className="h-3.5 w-3.5 shrink-0 text-amber-500" />}
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
                      <RatingBar value={value} tier={tier} />
                    </div>
                    <div className="flex items-center gap-2">
                      <SkillDots value={value} tier={tier} />
                      <span className={`text-sm font-extrabold tabular-nums ${
                        value === null ? 'text-gray-400' :
                        tier === 'outstanding' ? 'text-amber-700' :
                        tier === 'proficient' ? 'text-blue-700' :
                        tier === 'developing' ? 'text-amber-700' :
                        'text-red-700'
                      }`}>
                        {value ?? '-'}<span className="text-gray-400 font-normal text-xs">/5</span>
                      </span>
                    </div>
                  </div>

                  {/* Motivational micro-copy per skill */}
                  {tier === 'outstanding' && (
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
                  {tier === 'below_standards' && (
                    <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-600">
                      <XCircle className="h-3 w-3" />
                      Requires immediate coaching and follow-up.
                    </p>
                  )}
                  {tier === 'underperforming' && (
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
      )}

      {/* ── Performance Insights ── */}
      {audit.ai_report && (
        <motion.section variants={fadeUp} className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <p className="text-sm font-bold text-gray-900 uppercase tracking-wide">Performance Insights</p>
          </div>
          <div className="rounded-xl border border-violet-100 bg-gradient-to-br from-violet-50/80 to-purple-50/40 px-4 py-3.5">
            <MarkdownReport text={audit.ai_report} />
          </div>
        </motion.section>
      )}

      {/* ── Footer timestamps ── */}
      <motion.div
        variants={fadeUp}
        className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-400"
      >
        {audit.observed_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Observed {formatDateTime(audit.observed_at)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Completed {formatDateTime(audit.completed_at)}
        </span>
      </motion.div>
    </motion.div>
  );
}
