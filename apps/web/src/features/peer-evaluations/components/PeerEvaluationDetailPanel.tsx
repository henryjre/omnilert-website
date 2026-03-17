import { X } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import type { PeerEvaluation, PeerEvalStatus, PeerEvaluationUser } from '../services/peerEvaluation.api';

interface PeerEvaluationDetailPanelProps {
  evaluation: PeerEvaluation | null;
  onClose: () => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  return `hsl(${hashName(name) % 360}, 65%, 55%)`;
}

function UserAvatar({ user, size = 'md' }: { user: PeerEvaluationUser; size?: 'sm' | 'md' }) {
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : 'h-10 w-10 text-sm';
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={fullName}
        className={`${sizeClass} rounded-full object-cover`}
      />
    );
  }
  return (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-full font-semibold text-white`}
      style={{ backgroundColor: getAvatarColor(fullName) }}
    >
      {getInitials(fullName)}
    </div>
  );
}

function statusBadgeVariant(status: PeerEvalStatus): 'warning' | 'success' | 'default' {
  if (status === 'pending') return 'warning';
  if (status === 'completed') return 'success';
  return 'default';
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface ScoreRowProps {
  label: string;
  score: number | null;
}

function ScoreRow({ label, score }: ScoreRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-gray-700">{label}</span>
      {score !== null ? (
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <div
                key={n}
                className={`h-2.5 w-2.5 rounded-full ${n <= score ? 'bg-primary-500' : 'bg-gray-200'}`}
              />
            ))}
          </div>
          <span className="min-w-[2.5rem] text-right text-sm font-semibold text-gray-900">{score}/5</span>
        </div>
      ) : (
        <span className="text-sm text-gray-400">—</span>
      )}
    </div>
  );
}

export function PeerEvaluationDetailPanel({ evaluation, onClose }: PeerEvaluationDetailPanelProps) {
  if (!evaluation) return null;

  const evaluator = evaluation.evaluator;
  const evaluated = evaluation.evaluated;
  const evaluatorName = evaluator ? `${evaluator.first_name} ${evaluator.last_name}`.trim() : 'Unknown';
  const evaluatedName = evaluated ? `${evaluated.first_name} ${evaluated.last_name}`.trim() : 'Unknown';

  const isCompleted = evaluation.status === 'completed';
  const isExpired = evaluation.status === 'expired';

  const q1 = isCompleted ? evaluation.q1_score : null;
  const q2 = isCompleted ? evaluation.q2_score : null;
  const q3 = isCompleted ? evaluation.q3_score : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[560px] flex-col bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Peer Evaluation</h2>
            <Badge variant={statusBadgeVariant(evaluation.status)}>
              {evaluation.status.charAt(0).toUpperCase() + evaluation.status.slice(1)}
            </Badge>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Evaluator → Evaluated */}
          <div className="flex items-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              {evaluator ? (
                <UserAvatar user={evaluator} />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm text-gray-500">?</div>
              )}
              <span className="max-w-[100px] text-center text-xs font-medium text-gray-700 leading-tight">{evaluatorName}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Evaluator</span>
            </div>

            <div className="flex-1 border-t-2 border-dashed border-gray-200" />

            <div className="flex flex-col items-center gap-1.5">
              {evaluated ? (
                <UserAvatar user={evaluated} />
              ) : (
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm text-gray-500">?</div>
              )}
              <span className="max-w-[100px] text-center text-xs font-medium text-gray-700 leading-tight">{evaluatedName}</span>
              <span className="text-[10px] uppercase tracking-wide text-gray-400">Evaluated</span>
            </div>
          </div>

          {/* Shift info */}
          <div className="rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-600">
            Evaluated on {formatDate(evaluation.shift_date ?? evaluation.created_at)} &bull; {evaluation.overlap_minutes} min overlap
          </div>

          {/* Scores */}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-gray-900">Scores</h3>
            {!isCompleted && (
              <p className="mb-3 text-xs text-gray-400">
                {isExpired
                  ? 'Evaluation expired — scores shown are defaults.'
                  : 'Scores are defaults (5/5/5) — evaluation not yet submitted.'}
              </p>
            )}
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white px-4">
              <ScoreRow label="Cooperation During Shift" score={q1} />
              <ScoreRow label="Professional Communication" score={q2} />
              <ScoreRow label="Reliability & Accountability" score={q3} />
            </div>
          </div>

          {/* Additional message */}
          {evaluation.additional_message && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Additional Message</h3>
              <blockquote className="rounded-lg border-l-4 border-gray-200 bg-gray-50 px-4 py-3 text-sm italic text-gray-600">
                {evaluation.additional_message}
              </blockquote>
            </div>
          )}

          {/* Timestamps */}
          <div className="space-y-1 text-xs text-gray-400">
            <p>Created: {formatDateTime(evaluation.created_at)}</p>
            {evaluation.status === 'pending' && evaluation.expires_at && (
              <p>Expires: {formatDateTime(evaluation.expires_at)}</p>
            )}
            {evaluation.submitted_at && (
              <p>Submitted: {formatDateTime(evaluation.submitted_at)}</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
