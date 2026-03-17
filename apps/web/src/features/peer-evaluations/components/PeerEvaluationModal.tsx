import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock } from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';

// ── Types ──────────────────────────────────────────────────────────────────────

interface EvaluatedUser {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

interface PendingEvaluation {
  id: string;
  evaluator_user_id: string;
  evaluated_user_id: string;
  shift_id: string;
  status: 'pending' | 'completed' | 'expired';
  q1_score: number;
  q2_score: number;
  q3_score: number;
  additional_message: string | null;
  overlap_minutes: number;
  expires_at: string;
  submitted_at: string | null;
  created_at: string;
  shift_date?: string | null;
  evaluator: EvaluatedUser | null;
  evaluated: EvaluatedUser | null;
}

export interface PeerEvaluationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEvaluationId?: string | null;
}

// ── Avatar helpers ─────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function hashName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  return Math.abs(hash);
}

function getAvatarColor(name: string): string {
  const hue = hashName(name) % 360;
  return `hsl(${hue}, 65%, 55%)`;
}

// ── Date helpers ───────────────────────────────────────────────────────────────

function formatShiftDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getExpiryText(expiresAt: string): { text: string; urgent: boolean } {
  const now = Date.now();
  const expiry = new Date(expiresAt).getTime();
  const diffMs = expiry - now;

  if (diffMs <= 0) return { text: 'Expired', urgent: true };

  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours < 1) {
    const mins = Math.floor(diffMs / (1000 * 60));
    return { text: `Expires in ${mins} minute${mins === 1 ? '' : 's'}`, urgent: true };
  }
  if (diffHours < 24) {
    const hours = Math.floor(diffHours);
    return { text: `Expires in ${hours} hour${hours === 1 ? '' : 's'}`, urgent: diffHours < 2 };
  }
  const days = Math.floor(diffHours / 24);
  return { text: `Expires in ${days} day${days === 1 ? '' : 's'}`, urgent: false };
}

// ── Likert scale question definition ──────────────────────────────────────────

const QUESTIONS = [
  {
    key: 'q1_score' as const,
    label: 'Cooperation During Shift',
    description: 'How well did this person support the team during this shift?',
  },
  {
    key: 'q2_score' as const,
    label: 'Professional Communication',
    description: "How was this person's tone and interaction with teammates?",
  },
  {
    key: 'q3_score' as const,
    label: 'Reliability & Accountability',
    description: 'How dependable was this person during this shift?',
  },
] as const;

const SCORE_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Good',
  4: 'Very Good',
  5: 'Excellent',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function EvaluatedAvatar({ user }: { user: EvaluatedUser }) {
  const fullName = `${user.first_name} ${user.last_name}`;
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={fullName}
        className="h-10 w-10 rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <div
      className="h-10 w-10 flex items-center justify-center rounded-full font-semibold text-white text-sm shrink-0"
      style={{ backgroundColor: getAvatarColor(fullName) }}
    >
      {getInitials(fullName)}
    </div>
  );
}

interface LikertQuestionProps {
  label: string;
  description: string;
  value: number;
  onChange: (score: number) => void;
  disabled?: boolean;
}

function LikertQuestion({ label, description, value, onChange, disabled }: LikertQuestionProps) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-semibold text-gray-900">{label}</p>
        <p className="text-xs text-gray-500 mt-0.5">{description}</p>
      </div>
      <div role="group" aria-label={label} className="flex gap-2 flex-wrap sm:flex-nowrap">
        {([1, 2, 3, 4, 5] as const).map((score) => {
          const selected = value === score;
          return (
            <button
              key={score}
              type="button"
              disabled={disabled}
              onClick={() => onChange(score)}
              aria-label={`${score} – ${SCORE_LABELS[score]}`}
              className={`flex-1 min-w-[56px] flex flex-col items-center gap-1 rounded-lg border py-2 px-1 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {/* Custom radio circle */}
              <span
                className={`h-4 w-4 rounded-full border-2 flex items-center justify-center transition-colors ${
                  selected
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {selected && (
                  <span className="h-1.5 w-1.5 rounded-full bg-white" />
                )}
              </span>
              <span
                className={`text-[11px] font-medium leading-tight text-center ${
                  selected ? 'text-primary-700' : 'text-gray-600'
                }`}
              >
                {score}
              </span>
              <span
                className={`text-[10px] leading-tight text-center hidden sm:block ${
                  selected ? 'text-primary-600' : 'text-gray-400'
                }`}
              >
                {SCORE_LABELS[score]}
              </span>
            </button>
          );
        })}
      </div>
      {/* Mobile score label — only shown when a score has been selected */}
      {value >= 1 && (
        <p className="text-xs text-primary-600 font-medium sm:hidden">
          {SCORE_LABELS[value]}
        </p>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function PeerEvaluationModal({
  isOpen,
  onClose,
  initialEvaluationId,
}: PeerEvaluationModalProps) {
  const [evaluations, setEvaluations] = useState<PendingEvaluation[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // Stable total captured at fetch time — not refiltered by live expiry checks
  const stableTotalRef = useRef<number>(0);

  // Per-evaluation form state (keyed by evaluation id)
  const [scores, setScores] = useState<Record<string, { q1: number; q2: number; q3: number }>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get<{ data: PendingEvaluation[] }>('/peer-evaluations/pending-mine');
      const pending = (res.data.data ?? []).filter((e) => e.status === 'pending');

      if (pending.length === 0) {
        onClose();
        return;
      }

      setEvaluations(pending);
      // Capture stable total once at fetch time
      stableTotalRef.current = pending.length;

      // Initialize score state for all evaluations — 0 means no selection
      const initialScores: Record<string, { q1: number; q2: number; q3: number }> = {};
      const initialMessages: Record<string, string> = {};
      for (const ev of pending) {
        initialScores[ev.id] = { q1: 0, q2: 0, q3: 0 };
        initialMessages[ev.id] = ev.additional_message ?? '';
      }
      setScores(initialScores);
      setMessages(initialMessages);

      // Determine starting index
      if (initialEvaluationId) {
        const idx = pending.findIndex((e) => e.id === initialEvaluationId);
        setCurrentIndex(idx >= 0 ? idx : 0);
      } else {
        setCurrentIndex(0);
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          'Failed to load evaluations.'
      );
    } finally {
      setLoading(false);
    }
  }, [initialEvaluationId, onClose]);

  useEffect(() => {
    if (!isOpen) return;
    fetchEvaluations();
    // Only fetch when modal opens — intentionally not re-fetching on initialEvaluationId change
    // eslint-disable-line react-hooks/exhaustive-deps
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const advanceOrClose = useCallback((fromIndex: number) => {
    const nextPending = evaluations.findIndex(
      (e, i) =>
        i > fromIndex &&
        e.status === 'pending' &&
        new Date(e.expires_at).getTime() > Date.now()
    );
    if (nextPending !== -1) {
      setCurrentIndex(nextPending);
    } else {
      onClose();
    }
  }, [evaluations, onClose]);

  // Auto-skip expired evaluations when navigating
  useEffect(() => {
    if (evaluations.length === 0) return;
    const current = evaluations[currentIndex];
    if (!current) return;
    if (current.status === 'expired' || new Date(current.expires_at).getTime() <= Date.now()) {
      advanceOrClose(currentIndex);
    }
  }, [currentIndex, evaluations, advanceOrClose]);

  async function handleSubmit() {
    const current = evaluations[currentIndex];
    if (!current) return;
    const score = scores[current.id];
    if (!score) return;
    if (score.q1 < 1 || score.q2 < 1 || score.q3 < 1) return;

    setSubmitting(true);
    setError('');
    try {
      await api.post(`/peer-evaluations/${current.id}/submit`, {
        q1_score: score.q1,
        q2_score: score.q2,
        q3_score: score.q3,
        additional_message: messages[current.id]?.trim() || undefined,
      });
      advanceOrClose(currentIndex);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          'Failed to submit evaluation.'
      );
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    advanceOrClose(currentIndex);
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  if (!isOpen) return null;

  // ── Loading state ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl">
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        </div>
      </div>
    );
  }

  const current = evaluations[currentIndex];
  if (!current) return null;

  const evaluatedName = current.evaluated
    ? `${current.evaluated.first_name} ${current.evaluated.last_name}`
    : 'Unknown Employee';

  const currentScore = scores[current.id] ?? { q1: 0, q2: 0, q3: 0 };
  const currentMessage = messages[current.id] ?? '';
  const expiry = getExpiryText(current.expires_at);
  const stableTotal = stableTotalRef.current;
  const currentPositionLabel = currentIndex + 1;
  const allScoresSelected = currentScore.q1 >= 1 && currentScore.q2 >= 1 && currentScore.q3 >= 1;

  function setQ(key: 'q1' | 'q2' | 'q3', val: number) {
    setScores((prev) => ({
      ...prev,
      [current.id]: { ...prev[current.id], [key]: val },
    }));
  }

  function setMessage(val: string) {
    setMessages((prev) => ({ ...prev, [current.id]: val }));
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Peer Evaluation"
      >

        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {current.evaluated && (
                <EvaluatedAvatar user={current.evaluated} />
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
                  Peer Evaluation
                </p>
                <p className="text-base font-semibold text-gray-900 truncate">{evaluatedName}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Shift overlap: {current.overlap_minutes} min &bull; Evaluated on {formatShiftDate(current.shift_date ?? current.created_at)}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2 shrink-0">
              {stableTotal > 1 && (
                <span className="mt-0.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 font-medium whitespace-nowrap">
                  {currentPositionLabel} of {stableTotal}
                </span>
              )}
              <button
                type="button"
                onClick={handleClose}
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-5">
          <LikertQuestion
            label={QUESTIONS[0].label}
            description={QUESTIONS[0].description}
            value={currentScore.q1}
            onChange={(v) => setQ('q1', v)}
            disabled={submitting}
          />
          <LikertQuestion
            label={QUESTIONS[1].label}
            description={QUESTIONS[1].description}
            value={currentScore.q2}
            onChange={(v) => setQ('q2', v)}
            disabled={submitting}
          />
          <LikertQuestion
            label={QUESTIONS[2].label}
            description={QUESTIONS[2].description}
            value={currentScore.q3}
            onChange={(v) => setQ('q3', v)}
            disabled={submitting}
          />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 px-5 py-4 space-y-3">
          {/* Additional message */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Additional Message{' '}
              <span className="font-normal text-gray-400">(optional)</span>
            </label>
            <textarea
              value={currentMessage}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              maxLength={1000}
              disabled={submitting}
              placeholder="Any additional feedback for this evaluation..."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50 resize-none"
            />
            <p className="mt-0.5 text-right text-xs text-gray-400">
              {currentMessage.length} / 1000
            </p>
          </div>

          {/* Expiry + actions row */}
          <div className="flex items-center gap-3">
            {/* Expiry countdown */}
            <div className={`flex items-center gap-1 text-xs ${expiry.urgent ? 'text-red-500' : 'text-gray-400'}`}>
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{expiry.text}</span>
            </div>

            <div className="flex-1" />

            {/* Skip */}
            <button
              type="button"
              onClick={handleSkip}
              disabled={submitting}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            >
              Skip for now
            </button>

            {/* Submit */}
            <Button onClick={handleSubmit} disabled={submitting || !allScoresSelected} size="md">
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Spinner size="sm" />
                  Submitting...
                </span>
              ) : (
                'Submit Evaluation'
              )}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
