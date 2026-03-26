import React, { useCallback, useMemo, useState } from 'react';
import type {
  AccountAuditResultAttachment,
  AccountAuditResultDetail,
} from '@omnilert/shared';
import { motion } from 'framer-motion';
import {
  Building2, Calendar, Check, ExternalLink, FileText,
  ShieldCheck, Sparkles, Star, X as XIcon,
} from 'lucide-react';
import { ImagePreviewModal } from '../../case-reports/components/ImagePreviewModal';

// ─── Formatters ───────────────────────────────────────────────────────────────

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

function formatShortDate(value: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

// ─── Motivational helpers ─────────────────────────────────────────────────────

function cssMotivation(score: number): { headline: string; sub: string } {
  if (score >= 4.5) return { headline: "Outstanding Performance!", sub: "You're setting the gold standard for customer service." };
  if (score >= 4.0) return { headline: "Excellent Work!",          sub: "Your dedication really shows in your scores."           };
  if (score >= 3.0) return { headline: "Good Job!",                sub: "A few more tweaks and you'll be at the top."            };
  if (score >= 2.0) return { headline: "Room to Grow",             sub: "Focus on the highlighted areas below."                  };
  return               { headline: "Keep Practicing",          sub: "Every improvement starts with awareness. You've got this." };
}

function complianceMotivation(passed: number, total: number): { headline: string; sub: string } {
  if (passed === total)    return { headline: "Perfect Compliance!", sub: "Full marks — you're the benchmark for the team."  };
  if (passed >= total - 1) return { headline: "Almost There!",       sub: "Just one more check to hit a perfect score."      };
  if (passed >= total / 2) return { headline: "Halfway Compliant",   sub: "You're making progress. Let's close the gap."     };
  if (passed > 0)          return { headline: "Needs Attention",     sub: "Several areas require your focus."                };
  return                   { headline: "Needs Improvement",      sub: "Let's build better habits together."                 };
}

function criteriaColor(score: number | string): string {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'bg-gray-200';
  if (n >= 4) return 'bg-green-500';
  if (n >= 3) return 'bg-amber-400';
  return 'bg-red-400';
}

function criteriaTextColor(score: number | string): string {
  const n = Number(score);
  if (!Number.isFinite(n)) return 'text-gray-400';
  if (n >= 4) return 'text-green-700';
  if (n >= 3) return 'text-amber-600';
  return 'text-red-600';
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

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

// ─── Attachment helpers ───────────────────────────────────────────────────────

function isImageAttachment(a: AccountAuditResultAttachment): boolean {
  if (a.content_type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.file_name);
}

function isVideoAttachment(a: AccountAuditResultAttachment): boolean {
  if (a.content_type?.startsWith('video/')) return true;
  return /\.(mp4|webm|ogg|mov|m4v|avi)$/i.test(a.file_name);
}

function toPreviewItems(attachments: AccountAuditResultAttachment[]) {
  return attachments
    .filter((a) => isImageAttachment(a) || isVideoAttachment(a))
    .map((a) => ({ url: a.file_url, fileName: a.file_name }));
}

// ─── Animation variants ───────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0,  transition: { duration: 0.35, ease: 'easeOut' as const } },
};

const staggerContainer = {
  hidden: {},
  show:   { transition: { staggerChildren: 0.07 } },
};

const scaleIn = {
  hidden: { opacity: 0, scale: 0.85 },
  show:   { opacity: 1, scale: 1,   transition: { type: 'spring' as const, damping: 18, stiffness: 260 } },
};

// ─── CSS Hero ─────────────────────────────────────────────────────────────────

function CssHero({ audit }: { audit: AccountAuditResultDetail }) {
  const { css_result, company, observed_at, completed_at } = audit;
  const score = Number(css_result?.overall_rating ?? 0);
  const { headline, sub } = cssMotivation(score);

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-50 p-5"
    >
      <div className="flex items-start gap-5">
        {/* Score bubble */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.1 }}
          className="flex shrink-0 flex-col items-center justify-center rounded-2xl bg-amber-400 px-4 py-3 text-white shadow-md"
        >
          <span className="text-4xl font-extrabold leading-none">
            {Number.isFinite(score) ? score.toFixed(1) : '-'}
          </span>
          <span className="mt-0.5 text-xs font-semibold opacity-80">out of 5</span>
        </motion.div>

        {/* Motivation + stars */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-base font-bold text-amber-800">{headline}</p>
          </div>
          <p className="mt-0.5 text-sm text-amber-700/80">{sub}</p>

          {/* Stars */}
          <motion.div
            className="mt-2.5 flex items-center gap-0.5"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {Array.from({ length: 5 }, (_, i) => (
              <motion.div key={i} variants={scaleIn}>
                <Star
                  className={`h-5 w-5 transition-colors ${
                    i < Math.floor(score)
                      ? 'fill-amber-400 text-amber-400'
                      : i < score
                        ? 'fill-amber-200 text-amber-300'
                        : 'fill-gray-100 text-gray-200'
                  }`}
                />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-100 pt-3 text-xs text-amber-700/70">
        {company?.name && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {company.name}
          </span>
        )}
        {observed_at && (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Observed {formatShortDate(observed_at)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Completed {formatShortDate(completed_at)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Compliance Hero ──────────────────────────────────────────────────────────

function ComplianceHero({ audit }: { audit: AccountAuditResultDetail }) {
  const { compliance_result, company, completed_at } = audit;
  const passed = compliance_result?.passed_count ?? 0;
  const total  = compliance_result?.total_checks ?? 4;
  const { headline, sub } = complianceMotivation(passed, total);
  const allPassed = passed === total;

  return (
    <motion.div
      variants={fadeUp}
      className="rounded-2xl bg-gradient-to-br from-blue-50 via-indigo-50 to-sky-50 p-5"
    >
      <div className="flex items-start gap-5">
        {/* Score bubble */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', damping: 14, stiffness: 200, delay: 0.1 }}
          className={`flex shrink-0 flex-col items-center justify-center rounded-2xl px-4 py-3 text-white shadow-md ${
            allPassed ? 'bg-green-500' : passed >= total / 2 ? 'bg-blue-500' : 'bg-orange-400'
          }`}
        >
          <span className="text-4xl font-extrabold leading-none">{passed}</span>
          <span className="mt-0.5 text-xs font-semibold opacity-80">of {total}</span>
        </motion.div>

        {/* Motivation */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4 shrink-0 text-blue-500" />
            <p className="text-base font-bold text-blue-800">{headline}</p>
          </div>
          <p className="mt-0.5 text-sm text-blue-700/80">{sub}</p>

          {/* Mini progress dots */}
          <motion.div
            className="mt-2.5 flex items-center gap-1.5"
            variants={staggerContainer}
            initial="hidden"
            animate="show"
          >
            {Array.from({ length: total }, (_, i) => (
              <motion.div
                key={i}
                variants={scaleIn}
                className={`h-3 w-3 rounded-full ${i < passed ? 'bg-blue-500' : 'bg-blue-100'}`}
              />
            ))}
          </motion.div>
        </div>
      </div>

      {/* Meta row */}
      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-blue-100 pt-3 text-xs text-blue-700/70">
        {company?.name && (
          <span className="flex items-center gap-1">
            <Building2 className="h-3 w-3" />
            {company.name}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Calendar className="h-3 w-3" />
          Completed {formatShortDate(completed_at)}
        </span>
      </div>
    </motion.div>
  );
}

// ─── CSS Criteria Scores ──────────────────────────────────────────────────────

function CssCriteria({ audit }: { audit: AccountAuditResultDetail }) {
  const { css_result } = audit;
  if (!css_result) return null;

  const criteria = [
    { key: 'greeting',           label: 'Greeting & First Impression',          value: css_result.criteria_scores?.greeting           },
    { key: 'order_accuracy',     label: 'Order Accuracy & Confirmation',         value: css_result.criteria_scores?.order_accuracy     },
    { key: 'suggestive_selling', label: 'Suggestive Selling / Revenue Initiative', value: css_result.criteria_scores?.suggestive_selling },
    { key: 'service_efficiency', label: 'Service Efficiency & Flow',             value: css_result.criteria_scores?.service_efficiency },
    { key: 'professionalism',    label: 'Professionalism & Closing Experience',  value: css_result.criteria_scores?.professionalism    },
  ];

  return (
    <motion.section variants={fadeUp} className="space-y-3">
      <div className="flex items-center gap-2">
        <Star className="h-4 w-4 text-amber-500" />
        <p className="text-sm font-semibold text-gray-900">Criteria Breakdown</p>
      </div>

      <motion.div
        className="space-y-3"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {criteria.map(({ key, label, value }) => {
          const numValue = value != null ? Number(value) : null;
          const pct = numValue != null ? (numValue / 5) * 100 : 0;

          return (
            <motion.div key={key} variants={fadeUp} className="space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-gray-600">{label}</span>
                <span className={`text-xs font-bold ${numValue != null ? criteriaTextColor(numValue) : 'text-gray-400'}`}>
                  {numValue != null ? `${numValue} / 5` : '— / 5'}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <motion.div
                  className={`h-full rounded-full ${numValue != null ? criteriaColor(numValue) : 'bg-gray-200'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut', delay: 0.1 }}
                />
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.section>
  );
}

// ─── Compliance Check Grid ────────────────────────────────────────────────────

function ComplianceChecks({ audit }: { audit: AccountAuditResultDetail }) {
  const { compliance_result } = audit;
  if (!compliance_result) return null;

  const checks = [
    { key: 'productivity_rate', label: 'Productivity Rate', value: compliance_result.checks.productivity_rate },
    { key: 'uniform',           label: 'Uniform',           value: compliance_result.checks.uniform           },
    { key: 'hygiene',           label: 'Hygiene',           value: compliance_result.checks.hygiene           },
    { key: 'sop',               label: 'SOP',               value: compliance_result.checks.sop               },
  ];

  return (
    <motion.section variants={fadeUp} className="space-y-3">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-blue-500" />
        <p className="text-sm font-semibold text-gray-900">Compliance Checks</p>
      </div>

      <motion.div
        className="grid grid-cols-2 gap-2"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {checks.map(({ key, label, value }) => {
          const passed = value === true;
          const failed = value === false;
          return (
            <motion.div
              key={key}
              variants={scaleIn}
              className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                passed
                  ? 'border-green-200 bg-green-50'
                  : failed
                    ? 'border-red-200 bg-red-50'
                    : 'border-gray-200 bg-gray-50'
              }`}
            >
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  passed
                    ? 'bg-green-500 text-white'
                    : failed
                      ? 'bg-red-400 text-white'
                      : 'bg-gray-300 text-white'
                }`}
              >
                {passed ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : failed ? (
                  <XIcon className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <span className="text-xs">-</span>
                )}
              </div>
              <div>
                <p className={`text-xs font-semibold ${passed ? 'text-green-800' : failed ? 'text-red-700' : 'text-gray-500'}`}>
                  {label}
                </p>
                <p className={`text-[11px] ${passed ? 'text-green-600' : failed ? 'text-red-500' : 'text-gray-400'}`}>
                  {passed ? 'Passed' : failed ? 'Not Met' : 'No Data'}
                </p>
              </div>
            </motion.div>
          );
        })}
      </motion.div>
    </motion.section>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AccountAuditResultDetailPanel({ audit }: { audit: AccountAuditResultDetail }) {
  const [previewMedia, setPreviewMedia] = useState<{
    items: { url: string; fileName: string }[];
    index: number;
  } | null>(null);

  const mediaAttachments = useMemo(
    () => audit.audit_trail
      .flatMap((entry) => entry.attachments)
      .filter((a) => isImageAttachment(a) || isVideoAttachment(a)),
    [audit.audit_trail],
  );

  const openPreview = useCallback(
    (attachment: AccountAuditResultAttachment, source: AccountAuditResultAttachment[]) => {
      const items = toPreviewItems(source);
      const index = items.findIndex((item) => item.url === attachment.file_url);
      if (index >= 0) setPreviewMedia({ items, index });
    },
    [],
  );

  const isCss = audit.type === 'customer_service';

  return (
    <>
      <motion.div
        className="flex-1 space-y-6 overflow-y-auto px-6 py-5"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        {/* Hero scorecard */}
        {isCss ? (
          <CssHero audit={audit} />
        ) : (
          <ComplianceHero audit={audit} />
        )}

        {/* Criteria breakdown (CSS only) */}
        <CssCriteria audit={audit} />

        {/* Compliance check grid */}
        <ComplianceChecks audit={audit} />

        {/* AI Report */}
        {audit.ai_report && (
          <motion.section variants={fadeUp} className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <p className="text-sm font-semibold text-gray-900">AI Insights</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3.5">
              <MarkdownReport text={audit.ai_report} />
            </div>
          </motion.section>
        )}

        {/* Audit Trail */}
        {audit.audit_trail.length > 0 && (
          <motion.section variants={fadeUp} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Trail</p>
            <div className="space-y-3">
              {audit.audit_trail.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-400">{formatMessageTime(entry.created_at)}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      Audit Note
                    </span>
                  </div>
                  {entry.content && (
                    <p className="mt-2.5 whitespace-pre-wrap text-sm text-gray-800">{entry.content}</p>
                  )}
                  {entry.attachments.length > 0 && (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {entry.attachments.map((attachment) => {
                        const previewable = isImageAttachment(attachment) || isVideoAttachment(attachment);
                        return (
                          <div key={attachment.id} className="rounded-lg border border-gray-200 p-3">
                            <div className="flex items-start gap-2">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900">{attachment.file_name}</p>
                                <p className="mt-0.5 text-xs text-gray-500">{formatFileSize(attachment.file_size)}</p>
                                <div className="mt-1.5 flex flex-wrap gap-2">
                                  {previewable && (
                                    <button
                                      type="button"
                                      onClick={() => openPreview(attachment, entry.attachments)}
                                      className="text-xs font-medium text-primary-700 hover:underline"
                                    >
                                      Preview
                                    </button>
                                  )}
                                  <a
                                    href={attachment.file_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    Open File
                                  </a>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* Media grid (only shown when trail entries don't already display them inline) */}
        {mediaAttachments.length > 0 && audit.audit_trail.every((e) => e.attachments.length === 0) && (
          <motion.section variants={fadeUp} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Media</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {mediaAttachments.map((attachment) => (
                <button
                  key={attachment.id}
                  type="button"
                  onClick={() => openPreview(attachment, mediaAttachments)}
                  className="rounded-lg border border-gray-200 p-3 text-left transition-colors hover:border-primary-300 hover:bg-primary-50"
                >
                  <p className="truncate text-sm font-medium text-gray-900">{attachment.file_name}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatFileSize(attachment.file_size)}</p>
                </button>
              ))}
            </div>
          </motion.section>
        )}

        {/* Timestamps footer */}
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

      <ImagePreviewModal
        items={previewMedia?.items ?? null}
        index={previewMedia?.index ?? 0}
        onIndexChange={(index) => setPreviewMedia((current) => (current ? { ...current, index } : current))}
        onClose={() => setPreviewMedia(null)}
      />
    </>
  );
}
