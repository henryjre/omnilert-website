import { GitBranch, Star } from "lucide-react";
import { Badge } from '@/shared/components/ui/Badge';
import { Card } from '@/shared/components/ui/Card';
import { useBranchStore } from "@/shared/store/branchStore";
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

function statusBadgeVariant(status: PeerEvalStatus): "warning" | "success" | "danger" | "default" {
  if (status === "pending") return "warning";
  if (status === "completed") return "success";
  if (status === "expired") return "danger";
  return "default";
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(parsed);
}

function computeAverageScore(q1: number, q2: number, q3: number): number {
  return (q1 + q2 + q3) / 3;
}

export function PeerEvaluationCard({ evaluation, selected, onSelect }: PeerEvaluationCardProps) {
  const evaluated = evaluation.evaluated;

  const evaluatedName = evaluated
    ? `${evaluated.first_name} ${evaluated.last_name}`.trim()
    : "Unknown";

  const branches = useBranchStore((s) => s.branches);
  const branchId = evaluation.branch_id ?? null;
  const branch = branchId ? branches.find((b) => b.id === branchId) : undefined;
  const branchName = branch?.name ?? branchId ?? "—";

  const evaluationDate = formatDate(evaluation.shift_date ?? evaluation.created_at);
  const averageScore = computeAverageScore(evaluation.q1_score, evaluation.q2_score, evaluation.q3_score);
  const averageDisplay = Number.isFinite(averageScore)
    ? averageScore % 1 === 0
      ? String(averageScore)
      : averageScore.toFixed(2)
    : "—";

  return (
    <div
      className={`min-w-0 cursor-pointer overflow-hidden rounded-xl transition-shadow hover:shadow-md ${selected ? "ring-2 ring-primary-500" : ""}`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      <Card className="flex h-full flex-col gap-3 p-4">
        {/* Header: evaluated employee + status */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {evaluated ? (
              <UserAvatar user={evaluated} />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">?</div>
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900">{evaluatedName}</p>
              <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                <GitBranch className="h-3.5 w-3.5 text-gray-400" />
                <span className="truncate">{branchName}</span>
              </div>
            </div>
          </div>

          <Badge variant={statusBadgeVariant(evaluation.status)} className="shrink-0">
            {evaluation.status.charAt(0).toUpperCase() + evaluation.status.slice(1)}
          </Badge>
        </div>

        {/* Footer: evaluation date + average score */}
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
          <p className="truncate text-xs text-gray-400">{evaluationDate}</p>
          <div className="flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-mono text-sm font-semibold text-gray-800">{averageDisplay}/5</span>
          </div>
        </div>
      </Card>
    </div>
  );
}
