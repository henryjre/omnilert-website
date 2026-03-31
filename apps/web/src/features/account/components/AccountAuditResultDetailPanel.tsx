import React, { useCallback, useMemo, useState } from 'react';
import type {
  AccountAuditResultAttachment,
  AccountAuditResultDetail,
} from '@omnilert/shared';
import { motion } from 'framer-motion';
import {
  Building2,
  Calendar,
  ExternalLink,
  FileText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { ImagePreviewModal } from '../../case-reports/components/ImagePreviewModal';

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

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
};

const staggerContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

function renderTriState(value: boolean | null) {
  if (value === true) {
    return { label: 'Yes', className: 'bg-green-50 text-green-700 ring-green-200' };
  }
  if (value === false) {
    return { label: 'No', className: 'bg-red-50 text-red-700 ring-red-200' };
  }
  return { label: 'Not Auditable', className: 'bg-gray-100 text-gray-600 ring-gray-200' };
}

function ratingFill(value: number | null) {
  if (!value) return '0%';
  return `${Math.max(0, Math.min(100, (value / 5) * 100))}%`;
}

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
    label: 'Suggestive Selling and Upselling',
    description: 'Relevant add-on offers, confident recommendations, natural timing',
  },
  {
    key: 'service_efficiency',
    label: 'Service Efficiency',
    description: 'Steady pace, organized workflow, minimal idle time, smooth service handoff',
  },
] as const;

export function AccountAuditResultDetailPanel({ audit }: { audit: AccountAuditResultDetail }) {

  const complianceCriteria = audit.scc_result
    ? [
      {
        key: 'productivity_rate',
        label: 'Productivity Rate',
        value: audit.scc_result.compliance_criteria.productivity_rate,
      },
      {
        key: 'uniform_compliance',
        label: 'Uniform Compliance',
        value: audit.scc_result.compliance_criteria.uniform_compliance,
      },
      {
        key: 'hygiene_compliance',
        label: 'Hygiene Compliance',
        value: audit.scc_result.compliance_criteria.hygiene_compliance,
      },
      {
        key: 'sop_compliance',
        label: 'SOP Compliance',
        value: audit.scc_result.compliance_criteria.sop_compliance,
      },
    ]
    : [];

  const customerServiceValues = audit.scc_result?.customer_service_criteria;

  return (
    <>
      <motion.div
        className="flex-1 space-y-6 overflow-y-auto px-6 py-5"
        variants={staggerContainer}
        initial="hidden"
        animate="show"
      >
        <motion.section
          variants={fadeUp}
          className="rounded-2xl bg-gradient-to-br from-blue-50 via-sky-50 to-cyan-50 p-5"
        >
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
              <ShieldCheck className="h-7 w-7" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-bold text-blue-900">{audit.type_label}</p>
              <p className="mt-1 text-sm text-blue-800/80">{audit.summary.result_line}</p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-blue-800/70">
                {audit.company?.name && (
                  <span className="flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {audit.company.name}
                  </span>
                )}
                {audit.observed_at && (
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Audit Time {formatShortDate(audit.observed_at)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Completed {formatShortDate(audit.completed_at)}
                </span>
              </div>
            </div>
          </div>
        </motion.section>

        {complianceCriteria.length > 0 && (
          <motion.section variants={fadeUp} className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <p className="text-sm font-semibold text-gray-900">Compliance Criteria</p>
            </div>
            <div className="grid gap-3">
              {complianceCriteria.map((criterion) => {
                const state = renderTriState(criterion.value);
                return (
                  <div
                    key={criterion.key}
                    className="flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3"
                  >
                    <p className="text-sm font-medium text-gray-900">{criterion.label}</p>
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${state.className}`}>
                      {state.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}

        {customerServiceValues && (
          <motion.section variants={fadeUp} className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-amber-500" />
              <p className="text-sm font-semibold text-gray-900">Customer Service Criteria</p>
            </div>
            <div className="grid gap-3">
              {customerServiceCriteria.map((criterion) => {
                const value = customerServiceValues[criterion.key];
                return (
                  <div key={criterion.key} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">{criterion.label}</p>
                      <span className="text-xs font-semibold text-amber-700">{value ?? '-'} / 5</span>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">{criterion.description}</p>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: ratingFill(value) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.section>
        )}

        {audit.ai_report && (
          <motion.section variants={fadeUp} className="space-y-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-violet-500" />
              <p className="text-sm font-semibold text-gray-900">AI Report</p>
            </div>
            <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3.5">
              <MarkdownReport text={audit.ai_report} />
            </div>
          </motion.section>
        )}


        <motion.div
          variants={fadeUp}
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-400"
        >
          {audit.observed_at && (
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              Audit Time {formatDateTime(audit.observed_at)}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Completed {formatDateTime(audit.completed_at)}
          </span>
        </motion.div>
      </motion.div>

    </>
  );
}
