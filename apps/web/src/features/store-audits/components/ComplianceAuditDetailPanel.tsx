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
  non_idle: boolean | null;
  cellphone: boolean | null;
  uniform: boolean | null;
  hygiene: boolean | null;
  sop: boolean | null;
};

const QUESTIONS: Array<{ key: keyof AnswersState; label: string }> = [
  { key: 'non_idle', label: 'Employee was non-idle during shift' },
  { key: 'cellphone', label: 'No personal cellphone use while on duty' },
  { key: 'uniform', label: 'Proper uniform and grooming observed' },
  { key: 'hygiene', label: 'Hygiene standards were followed' },
  { key: 'sop', label: 'Standard operating procedures were followed' },
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
    non_idle: boolean;
    cellphone: boolean;
    uniform: boolean;
    hygiene: boolean;
    sop: boolean;
  }) => void;
  onRequestVN?: () => void;
}) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<AnswersState>({
    non_idle: audit.comp_non_idle,
    cellphone: audit.comp_cellphone,
    uniform: audit.comp_uniform,
    hygiene: audit.comp_hygiene,
    sop: audit.comp_sop,
  });

  useEffect(() => {
    setAnswers({
      non_idle: audit.comp_non_idle,
      cellphone: audit.comp_cellphone,
      uniform: audit.comp_uniform,
      hygiene: audit.comp_hygiene,
      sop: audit.comp_sop,
    });
  }, [
    audit.id,
    audit.comp_non_idle,
    audit.comp_cellphone,
    audit.comp_uniform,
    audit.comp_hygiene,
    audit.comp_sop,
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
          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
            {QUESTIONS.map((question) => (
              <div key={question.key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-800">{question.label}</p>
                <YesNoPill
                  value={answers[question.key]}
                  onChange={(value) => setAnswers((prev) => ({ ...prev, [question.key]: value }))}
                  disabled={audit.status === 'completed' || actionLoading || !canComplete}
                />
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
              onComplete({
                non_idle: Boolean(answers.non_idle),
                cellphone: Boolean(answers.cellphone),
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
