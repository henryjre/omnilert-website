import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CssCriteriaScores, StoreAudit } from '@omnilert/shared';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
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
          ? <strong key={i} className="font-semibold text-gray-900">{part.slice(2, -2)}</strong>
          : part
      );
    };

    if (isBullet) {
      elements.push(
        <div key={key++} className="flex gap-2 text-sm text-gray-800">
          <span className="mt-0.5 shrink-0 text-gray-400">–</span>
          <span>{renderInline(content)}</span>
        </div>
      );
    } else {
      elements.push(
        <p key={key++} className="text-sm text-gray-800">{renderInline(content)}</p>
      );
    }
  }

  return <div className="space-y-0.5">{elements}</div>;
}

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

export function CssAuditDetailPanel({
  audit,
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
  canProcess: boolean;
  canComplete: boolean;
  canRequestVN?: boolean;
  actionLoading: boolean;
  panelError: string;
  onProcess: () => void;
  onComplete: (payload: { criteria_scores: CssCriteriaScores; audit_log: string }) => void;
  onRequestVN?: () => void;
}) {
  const navigate = useNavigate();
  const draftKey = `css-audit-draft-${audit.id}`;

  const [criteriaScores, setCriteriaScores] = useState<CriteriaState>(() => {
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { criteriaScores?: CriteriaState };
          if (parsed.criteriaScores) return parsed.criteriaScores;
        }
      } catch { /* ignore */ }
    }
    return buildInitialCriteria(audit.css_criteria_scores);
  });
  const [auditLog, setAuditLog] = useState(() => {
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(draftKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { auditLog?: string };
          if (typeof parsed.auditLog === 'string') return parsed.auditLog;
        }
      } catch { /* ignore */ }
    }
    return audit.css_audit_log ?? '';
  });

  useEffect(() => {
    if (audit.status !== 'processing') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify({ criteriaScores, auditLog }));
    } catch { /* ignore */ }
  }, [draftKey, criteriaScores, auditLog, audit.status]);

  useEffect(() => {
    const saved = audit.status === 'processing' ? (() => {
      try { return localStorage.getItem(draftKey); } catch { return null; }
    })() : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as { criteriaScores?: CriteriaState; auditLog?: string };
        setCriteriaScores(parsed.criteriaScores ?? buildInitialCriteria(audit.css_criteria_scores));
        setAuditLog(parsed.auditLog ?? audit.css_audit_log ?? '');
        return;
      } catch { /* ignore */ }
    }
    setCriteriaScores(buildInitialCriteria(audit.css_criteria_scores));
    setAuditLog(audit.css_audit_log ?? '');
  }, [audit.id, audit.css_criteria_scores, audit.css_audit_log, audit.status, draftKey]);

  const allScored = CSS_CRITERIA.every((c) => criteriaScores[c.key] !== null);
  const computedAverage = allScored
    ? Math.round(
        (CSS_CRITERIA.reduce((sum, c) => sum + (criteriaScores[c.key] as number), 0) / 5) * 100,
      ) / 100
    : null;

  const orderLines = Array.isArray(audit.css_order_lines) ? audit.css_order_lines : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-gray-500">Session</span>
          <span className="font-medium text-gray-900">{audit.css_session_name || '—'}</span>
          <span className="text-gray-500">Reference</span>
          <span className="font-medium text-gray-900">{audit.css_pos_reference || '—'}</span>
          <span className="text-gray-500">Branch</span>
          <span className="font-medium text-gray-900">{audit.branch_name || '—'}</span>
          <span className="text-gray-500">Order Date</span>
          <span className="font-medium text-gray-900">{formatDateTime(audit.css_date_order)}</span>
          <span className="text-gray-500">Cashier</span>
          <span className="font-medium text-gray-900">{audit.css_cashier_name || '—'}</span>
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

        {audit.status === 'processing' && canComplete && (
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
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
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-800">Audit Log</label>
              <textarea
                rows={6}
                value={auditLog}
                onChange={(event) => setAuditLog(event.target.value)}
                placeholder="Write detailed audit findings..."
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              />
            </div>
          </div>
        )}

        {audit.status === 'completed' && (
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Auditor</p>
              <p className="text-sm text-gray-900">{audit.auditor_name || '—'}</p>
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
                        {audit.css_criteria_scores![criterion.key]} / 5
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
                <p className="text-sm text-gray-900">{audit.css_star_rating ?? '—'} / 5</p>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Audit Log</p>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{audit.css_audit_log || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">AI Report</p>
              {audit.css_ai_report
                ? <MarkdownReport text={audit.css_ai_report} />
                : <p className="text-sm text-gray-800">—</p>
              }
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
        {panelError && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-600">{panelError}</p>
        )}
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
              if (!allScored || !auditLog.trim()) return;
              try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
              onComplete({
                criteria_scores: criteriaScores as CssCriteriaScores,
                audit_log: auditLog.trim(),
              });
            }}
            disabled={actionLoading || !allScored || !auditLog.trim()}
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
    </div>
  );
}
