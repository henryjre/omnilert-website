import React, { useCallback, useMemo, useState } from 'react';
import type {
  AccountAuditResultAttachment,
  AccountAuditResultDetail,
} from '@omnilert/shared';
import { ExternalLink, FileText, ShieldCheck, Star } from 'lucide-react';
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
      return parts.map((part, index) =>
        part.startsWith('**') && part.endsWith('**')
          ? (
              <strong key={index} className="font-semibold text-gray-900">
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
      continue;
    }

    elements.push(
      <p key={key++} className="text-sm text-gray-800">
        {renderInline(content)}
      </p>,
    );
  }

  return <div className="space-y-0.5">{elements}</div>;
}

function isImageAttachment(attachment: AccountAuditResultAttachment): boolean {
  if (attachment.content_type?.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(attachment.file_name);
}

function isVideoAttachment(attachment: AccountAuditResultAttachment): boolean {
  if (attachment.content_type?.startsWith('video/')) return true;
  return /\.(mp4|webm|ogg|mov|m4v|avi)$/i.test(attachment.file_name);
}

function toPreviewItems(attachments: AccountAuditResultAttachment[]): Array<{ url: string; fileName: string }> {
  return attachments
    .filter((attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment))
    .map((attachment) => ({
      url: attachment.file_url,
      fileName: attachment.file_name,
    }));
}

export function AccountAuditResultDetailPanel({
  audit,
}: {
  audit: AccountAuditResultDetail;
}) {
  const [previewMedia, setPreviewMedia] = useState<{
    items: { url: string; fileName: string }[];
    index: number;
  } | null>(null);

  const mediaAttachments = useMemo(
    () => audit.audit_trail.flatMap((entry) => entry.attachments)
      .filter((attachment) => isImageAttachment(attachment) || isVideoAttachment(attachment)),
    [audit.audit_trail],
  );

  const openPreview = useCallback(
    (attachment: AccountAuditResultAttachment, source: AccountAuditResultAttachment[]) => {
      const items = toPreviewItems(source);
      const index = items.findIndex((item) => item.url === attachment.file_url);
      if (index >= 0) {
        setPreviewMedia({ items, index });
      }
    },
    [],
  );

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 sm:grid-cols-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Type</p>
            <p className="mt-1 text-sm text-gray-900">{audit.type_label}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Branch</p>
            <p className="mt-1 text-sm text-gray-900">{audit.branch.name}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Summary</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{audit.summary.result_line}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Observed At</p>
            <p className="mt-1 text-sm text-gray-900">{formatDateTime(audit.observed_at)}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Completed At</p>
            <p className="mt-1 text-sm text-gray-900">{formatDateTime(audit.completed_at)}</p>
          </div>
        </div>

        {audit.css_result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-600" />
              <p className="text-sm font-semibold text-gray-900">Criteria Scores</p>
            </div>
            <div className="space-y-1">
              {[
                ['Greeting & First Impression', audit.css_result.criteria_scores?.greeting ?? '-'],
                ['Order Accuracy & Confirmation', audit.css_result.criteria_scores?.order_accuracy ?? '-'],
                ['Suggestive Selling / Revenue Initiative', audit.css_result.criteria_scores?.suggestive_selling ?? '-'],
                ['Service Efficiency & Flow', audit.css_result.criteria_scores?.service_efficiency ?? '-'],
                ['Professionalism & Closing Experience', audit.css_result.criteria_scores?.professionalism ?? '-'],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{label}</span>
                  <span className="font-medium text-gray-900">{value} / 5</span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
              <span className="font-medium text-gray-700">Overall Average</span>
              <span className="font-semibold text-primary-700">
                {typeof audit.css_result.overall_rating === 'number'
                  ? audit.css_result.overall_rating.toFixed(2)
                  : audit.css_result.overall_rating ?? '-'} / 5
              </span>
            </div>
          </div>
        )}

        {audit.compliance_result && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-semibold text-gray-900">Compliance Checks</p>
            </div>
            <div className="space-y-1">
              {[
                {
                  key: 'productivity_rate',
                  label: 'Productivity Rate',
                  value: audit.compliance_result.checks.productivity_rate,
                },
                {
                  key: 'uniform',
                  label: 'Uniform',
                  value: audit.compliance_result.checks.uniform,
                },
                {
                  key: 'hygiene',
                  label: 'Hygiene',
                  value: audit.compliance_result.checks.hygiene,
                },
                {
                  key: 'sop',
                  label: 'SOP',
                  value: audit.compliance_result.checks.sop,
                },
              ].map(({ key, label, value }) => (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-gray-700">{label}</span>
                  <span
                    className={`font-medium ${
                      value === true ? 'text-green-700' : value === false ? 'text-red-700' : 'text-gray-500'
                    }`}
                  >
                    {value === true ? 'Yes' : value === false ? 'No' : '-'}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between border-t border-gray-200 pt-3 text-sm">
              <span className="font-medium text-gray-700">Passed Checks</span>
              <span className="font-semibold text-primary-700">
                {audit.compliance_result.passed_count} / {audit.compliance_result.total_checks}
              </span>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Trail</p>
          {audit.audit_trail.length === 0 ? (
            <p className="text-sm text-gray-600">No audit trail available.</p>
          ) : (
            <div className="space-y-4">
              {audit.audit_trail.map((entry) => (
                <div key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-gray-500">{formatMessageTime(entry.created_at)}</p>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                      Audit Note
                    </span>
                  </div>
                  {entry.content && (
                    <p className="mt-3 whitespace-pre-wrap text-sm text-gray-800">{entry.content}</p>
                  )}
                  {entry.attachments.length > 0 && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {entry.attachments.map((attachment) => {
                        const previewable = isImageAttachment(attachment) || isVideoAttachment(attachment);
                        return (
                          <div key={attachment.id} className="rounded-lg border border-gray-200 p-3">
                            <div className="flex items-start gap-3">
                              <FileText className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium text-gray-900">
                                  {attachment.file_name}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  {formatFileSize(attachment.file_size)}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
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
          )}
        </div>

        {mediaAttachments.length > 0 && (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Audit Media Attachments
            </p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
          </div>
        )}

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">AI Report</p>
          {audit.ai_report ? (
            <MarkdownReport text={audit.ai_report} />
          ) : (
            <p className="text-sm text-gray-600">No AI report available.</p>
          )}
        </div>
      </div>

      <ImagePreviewModal
        items={previewMedia?.items ?? null}
        index={previewMedia?.index ?? 0}
        onIndexChange={(index) => setPreviewMedia((current) => (
          current ? { ...current, index } : current
        ))}
        onClose={() => setPreviewMedia(null)}
      />
    </>
  );
}
