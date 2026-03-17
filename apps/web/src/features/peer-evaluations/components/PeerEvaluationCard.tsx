import { ArrowRight } from 'lucide-react';
import { Badge } from '@/shared/components/ui/Badge';
import { Card } from '@/shared/components/ui/Card';
import type { PeerEvaluation, PeerEvalStatus, PeerEvaluationUser } from '../services/peerEvaluation.api';

interface PeerEvaluationCardProps {
  evaluation: PeerEvaluation;
  selected: boolean;
  onSelect: () => void;
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

function UserAvatar({ user }: { user: PeerEvaluationUser }) {
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={fullName}
        className="h-7 w-7 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
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

export function PeerEvaluationCard({ evaluation, selected, onSelect }: PeerEvaluationCardProps) {
  const evaluator = evaluation.evaluator;
  const evaluated = evaluation.evaluated;

  const evaluatorName = evaluator
    ? `${evaluator.first_name} ${evaluator.last_name}`.trim()
    : 'Unknown';
  const evaluatedName = evaluated
    ? `${evaluated.first_name} ${evaluated.last_name}`.trim()
    : 'Unknown';

  const scoresDisplay =
    evaluation.status === 'completed'
      ? `${evaluation.q1_score} / ${evaluation.q2_score} / ${evaluation.q3_score}`
      : '— / — / —';

  return (
    <div
      className={`min-w-0 cursor-pointer overflow-hidden rounded-xl transition-shadow hover:shadow-md ${selected ? 'ring-2 ring-primary-500' : ''}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onSelect()}
    >
      <Card className="flex h-full flex-col gap-3 p-4">
        {/* Header: evaluator → evaluated */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {evaluator ? (
              <UserAvatar user={evaluator} />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">?</div>
            )}
            <span className="truncate text-sm font-medium text-gray-900">{evaluatorName}</span>
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400" />
            {evaluated ? (
              <UserAvatar user={evaluated} />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">?</div>
            )}
            <span className="truncate text-sm font-medium text-gray-900">{evaluatedName}</span>
          </div>
          <Badge variant={statusBadgeVariant(evaluation.status)} className="shrink-0">
            {evaluation.status.charAt(0).toUpperCase() + evaluation.status.slice(1)}
          </Badge>
        </div>

        {/* Footer */}
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-gray-500">
          <div className="flex items-center gap-1.5">
            <span>{formatDate(evaluation.created_at)}</span>
            <span className="text-gray-300">·</span>
            <span>{evaluation.overlap_minutes} min overlap</span>
          </div>
          <span className={`font-mono font-medium ${evaluation.status === 'completed' ? 'text-gray-700' : 'text-gray-400'}`}>
            {scoresDisplay}
          </span>
        </div>
      </Card>
    </div>
  );
}
