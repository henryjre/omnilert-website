import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { StoreAudit } from '@omnilert/shared';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/shared/components/ui/Button';
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

type AnswersState = {
  productivity_rate: boolean | null;
  uniform: boolean | null;
  hygiene: boolean | null;
  sop: boolean | null;
};

const QUESTIONS: Array<{ key: keyof AnswersState; label: string; question: string }> = [
  { key: 'productivity_rate', label: 'Productivity Rate', question: 'Was the employee actively working (not idle) during the spot audit?' },
  { key: 'uniform', label: 'Uniform Compliance', question: 'Was the employee wearing the correct uniform and meeting grooming standards?' },
  { key: 'hygiene', label: 'Hygiene Compliance', question: 'Was the employee following food safety and sanitation standards?' },
  { key: 'sop', label: 'SOP Compliance', question: 'Was the employee following the correct operational procedures and product preparation workflows?' },
];

export function ComplianceAuditDetailPanel({
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
  onComplete: (payload: {
    productivity_rate: boolean;
    uniform: boolean;
    hygiene: boolean;
    sop: boolean;
  }) => void;
  onRequestVN?: () => void;
}) {
  const navigate = useNavigate();
  const draftKey = `compliance-audit-draft-${audit.id}`;

  const [answers, setAnswers] = useState<AnswersState>(() => {
    if (audit.status === 'processing') {
      try {
        const saved = localStorage.getItem(`compliance-audit-draft-${audit.id}`);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<AnswersState>;
          if (parsed && typeof parsed === 'object') return { ...{ productivity_rate: null, uniform: null, hygiene: null, sop: null }, ...parsed };
        }
      } catch { /* ignore */ }
    }
    return {
      productivity_rate: audit.comp_productivity_rate ?? null,
      uniform: audit.comp_uniform,
      hygiene: audit.comp_hygiene,
      sop: audit.comp_sop,
    };
  });

  useEffect(() => {
    if (audit.status !== 'processing') return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch { /* ignore */ }
  }, [draftKey, answers, audit.status]);

  useEffect(() => {
    const saved = audit.status === 'processing' ? (() => {
      try { return localStorage.getItem(draftKey); } catch { return null; }
    })() : null;
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<AnswersState>;
        if (parsed && typeof parsed === 'object') {
          setAnswers({ productivity_rate: null, uniform: null, hygiene: null, sop: null, ...parsed });
          return;
        }
      } catch { /* ignore */ }
    }
    setAnswers({
      productivity_rate: audit.comp_productivity_rate ?? null,
      uniform: audit.comp_uniform,
      hygiene: audit.comp_hygiene,
      sop: audit.comp_sop,
    });
  }, [
    audit.id,
    audit.comp_productivity_rate,
    audit.comp_uniform,
    audit.comp_hygiene,
    audit.comp_sop,
    audit.status,
    draftKey,
  ]);

  const allAnswered = Object.values(answers).every((value) => value !== null);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <span className="text-gray-500">Employee</span>
          <span className="font-medium text-gray-900">{audit.comp_employee_name || '—'}</span>
          <span className="text-gray-500">Branch</span>
          <span className="font-medium text-gray-900">{audit.branch_name || '—'}</span>
          <span className="text-gray-500">Check-in</span>
          <span className="font-medium text-gray-900">{formatDateTime(audit.comp_check_in_time)}</span>
        </div>

        {(audit.status === 'processing' || audit.status === 'completed') && (
          <div className="space-y-3">
            {QUESTIONS.map((q) => (
              <div key={q.key} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{q.label}</p>
                    <p className="text-xs text-gray-500">{q.question}</p>
                  </div>
                  <YesNoPill
                    value={answers[q.key]}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [q.key]: value }))}
                    disabled={audit.status === 'completed' || actionLoading || !canComplete}
                  />
                </div>
              </div>
            ))}
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
              if (!allAnswered) return;
              try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
              onComplete({
                productivity_rate: Boolean(answers.productivity_rate),
                uniform: Boolean(answers.uniform),
                hygiene: Boolean(answers.hygiene),
                sop: Boolean(answers.sop),
              });
            }}
            disabled={actionLoading || !allAnswered}
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
