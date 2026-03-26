import { ArrowRight, Building2, CheckCircle2, Clock, GitBranch, ClipboardList, XCircle, X } from "lucide-react";
import { Badge } from '@/shared/components/ui/Badge';
import { useBranchStore } from "@/shared/store/branchStore";
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

function UserAvatar({ user, size = 'md' }: { user: PeerEvaluationUser; size?: 'sm' | 'md' | 'lg' }) {
  const fullName = `${user.first_name} ${user.last_name}`.trim();
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm';
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

function UnknownAvatar({ size = 'lg' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizeClass = size === 'sm' ? 'h-8 w-8 text-xs' : size === 'lg' ? 'h-14 w-14 text-base' : 'h-10 w-10 text-sm';
  return (
    <div className={`${sizeClass} flex items-center justify-center rounded-full bg-gray-200 font-semibold text-gray-400`}>
      ?
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

  const formatter = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });

  return formatter.format(parsed);
}

function formatDateTime(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  const formatter = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return formatter.format(parsed);
}

function computeAverageScore(q1: number, q2: number, q3: number): number {
  return (q1 + q2 + q3) / 3;
}

interface ScoreRowProps {
  label: string;
  score: number | null;
}

function ScoreRow({ label, score }: ScoreRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-gray-600">{label}</span>
      {score !== null ? (
        <div className="flex items-center gap-2 shrink-0">
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

  const isCompleted = evaluation.status === "completed";
  const isExpired = evaluation.status === "expired";
  const statusLabel = evaluation.status.charAt(0).toUpperCase() + evaluation.status.slice(1);

  const branches = useBranchStore((s) => s.branches);
  const branchId = evaluation.branch_id ?? null;
  const branch = branchId ? branches.find((b) => b.id === branchId) : undefined;
  const companyName = branch?.companyName ?? null;
  const branchName = branch?.name ?? branchId ?? "—";

  const evaluationDate = formatDate(evaluation.shift_date ?? evaluation.created_at);

  const averageScore = computeAverageScore(evaluation.q1_score, evaluation.q2_score, evaluation.q3_score);
  const averageDisplay = Number.isFinite(averageScore)
    ? averageScore % 1 === 0
      ? String(averageScore)
      : averageScore.toFixed(2)
    : "—";

  const q1 = isCompleted ? evaluation.q1_score : null;
  const q2 = isCompleted ? evaluation.q2_score : null;
  const q3 = isCompleted ? evaluation.q3_score : null;

  const overlapMinutes = evaluation.overlap_minutes;

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 sm:px-6 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <ClipboardList className="h-5 w-5 shrink-0 text-primary-600" />
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-gray-900">Peer Evaluation</h2>
            <p className="truncate text-xs text-gray-500">{evaluationDate}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={statusBadgeVariant(evaluation.status)}>{statusLabel}</Badge>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close panel"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto space-y-4 px-4 py-5 sm:px-6">

        {/* Status banner */}
        <div
          className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
            isCompleted
              ? "border-green-200 bg-green-50"
              : isExpired
              ? "border-red-200 bg-red-50"
              : "border-amber-200 bg-amber-50"
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                isCompleted ? "bg-green-100" : isExpired ? "bg-red-100" : "bg-amber-100"
              }`}
            >
              {isCompleted ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : isExpired ? (
                <XCircle className="h-5 w-5 text-red-600" />
              ) : (
                <Clock className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <p
              className={`text-sm font-semibold ${
                isCompleted ? "text-green-800" : isExpired ? "text-red-800" : "text-amber-800"
              }`}
            >
              {isCompleted ? "Evaluation Completed" : isExpired ? "Evaluation Expired" : "Evaluation Pending"}
            </p>
          </div>
          <p
            className={`text-xs font-medium ${
              isCompleted ? "text-green-700" : isExpired ? "text-red-700" : "text-amber-700"
            }`}
          >
            {evaluationDate}
          </p>
        </div>

        {/* Who evaluated who */}
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Evaluation</p>
          </div>
          <div className="flex items-center justify-between gap-2 px-4 py-5">
            {/* Evaluator */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              {evaluator ? <UserAvatar user={evaluator} size="lg" /> : <UnknownAvatar size="lg" />}
              <div className="min-w-0 w-full">
                <p className="truncate text-sm font-semibold text-gray-900">{evaluatorName}</p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">Evaluator</p>
              </div>
            </div>

            {/* Arrow */}
            <div className="shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100">
              <ArrowRight className="h-4 w-4 text-gray-500" />
            </div>

            {/* Evaluated */}
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              {evaluated ? <UserAvatar user={evaluated} size="lg" /> : <UnknownAvatar size="lg" />}
              <div className="min-w-0 w-full">
                <p className="truncate text-sm font-semibold text-gray-900">{evaluatedName}</p>
                <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-400">Evaluated</p>
              </div>
            </div>
          </div>
        </div>

        {/* Company + Branch + Overlap */}
        <dl className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-start gap-3 px-4 py-3">
            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-gray-500">Company</dt>
              <dd className="mt-1 truncate text-sm font-medium text-gray-900">{companyName ?? "—"}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3">
            <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-gray-500">Branch</dt>
              <dd className="mt-1 truncate text-sm font-medium text-primary-700">{branchName}</dd>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
            <div className="min-w-0">
              <dt className="text-xs font-medium text-gray-500">Shift Overlap</dt>
              <dd className="mt-1 text-sm font-medium text-gray-900">
                {overlapMinutes ? `${overlapMinutes} min` : "—"}
              </dd>
            </div>
          </div>
        </dl>

        {/* Scorecard */}
        <section>
          <div className="mb-2 px-1">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400">Scorecard</h3>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="divide-y divide-gray-100">
              <ScoreRow label="Cooperation During Shift" score={q1} />
              <ScoreRow label="Professional Communication" score={q2} />
              <ScoreRow label="Reliability & Accountability" score={q3} />
            </div>

            {/* Average total row */}
            <div className="flex items-center justify-between border-t-2 border-gray-200 bg-gray-50 px-4 py-3">
              <span className="text-sm font-semibold text-gray-700">Average</span>
              {isCompleted ? (
                <span className="text-lg font-bold text-gray-900">
                  {averageDisplay} <span className="text-sm font-semibold text-gray-500">/ 5</span>
                </span>
              ) : (
                <span className="text-sm text-gray-400">—</span>
              )}
            </div>
          </div>

          {!isCompleted && (
            <p className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
              {isExpired
                ? "This evaluation expired before submission — scores are unavailable."
                : "Scores will appear here after the evaluator submits."}
            </p>
          )}
        </section>

        {/* Additional message */}
        {evaluation.additional_message && (
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Additional Message</h3>
            <blockquote className="rounded-lg border-l-4 border-gray-200 bg-gray-50 px-4 py-3 text-sm italic text-gray-600">
              {evaluation.additional_message}
            </blockquote>
          </section>
        )}

        {/* Timeline */}
        <div className="space-y-1 text-xs text-gray-400">
          <p>Filed: {formatDateTime(evaluation.created_at)}</p>
          {evaluation.status === "pending" && evaluation.expires_at && (
            <p>Expires: {formatDateTime(String(evaluation.expires_at))}</p>
          )}
          {evaluation.submitted_at && <p>Submitted: {formatDateTime(String(evaluation.submitted_at))}</p>}
        </div>
      </div>
    </div>
  );
}
