import { useEffect, useState } from 'react';
import type { StoreAudit } from '@omnilert/shared';
import { Button } from '@/shared/components/ui/Button';
import { StarRatingInput } from './StarRatingInput';

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

    // Replace **bold** with <strong>
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
  actionLoading,
  panelError,
  onProcess,
  onComplete,
}: {
  audit: StoreAudit;
  canProcess: boolean;
  canComplete: boolean;
  actionLoading: boolean;
  panelError: string;
  onProcess: () => void;
  onComplete: (payload: { star_rating: number; audit_log: string }) => void;
}) {
  const [starRating, setStarRating] = useState<number | null>(audit.css_star_rating ?? null);
  const [auditLog, setAuditLog] = useState(audit.css_audit_log ?? '');

  useEffect(() => {
    setStarRating(audit.css_star_rating ?? null);
    setAuditLog(audit.css_audit_log ?? '');
  }, [audit.id, audit.css_star_rating, audit.css_audit_log]);

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
            <div>
              <p className="mb-2 text-sm font-medium text-gray-800">Star Rating</p>
              <StarRatingInput value={starRating} onChange={setStarRating} disabled={actionLoading} />
            </div>
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Star Rating</p>
              <p className="text-sm text-gray-900">{audit.css_star_rating ?? '—'} / 5</p>
            </div>
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
              if (!starRating || !auditLog.trim()) return;
              onComplete({ star_rating: starRating, audit_log: auditLog.trim() });
            }}
            disabled={actionLoading || !starRating || !auditLog.trim()}
          >
            {actionLoading ? 'Completing...' : 'Audit Complete'}
          </Button>
        )}
        {audit.status === 'completed' && (
          <Button className="w-full" variant="secondary" disabled>
            Request VN
          </Button>
        )}
        {/* TODO: implement VN request */}
      </div>
    </div>
  );
}
