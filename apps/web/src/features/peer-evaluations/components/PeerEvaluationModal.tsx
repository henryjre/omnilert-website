import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Clock } from 'lucide-react';
import { api } from '@/shared/services/api.client';
import { Button } from '@/shared/components/ui/Button';
import { Spinner } from '@/shared/components/ui/Spinner';
import { useAppToast } from '@/shared/hooks/useAppToast';

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

function isEvaluationExpired(evaluation: Pick<PendingEvaluation, 'status' | 'expires_at'>): boolean {
  return evaluation.status === 'expired' || new Date(evaluation.expires_at).getTime() <= Date.now();
}

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

function EvaluatedAvatar({ user }: { user: EvaluatedUser }) {
  const fullName = `${user.first_name} ${user.last_name}`;
  if (user.avatar_url) {
    return (
      <img
        src={user.avatar_url}
        alt={fullName}
        className="h-10 w-10 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
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
        <p className="mt-0.5 text-xs text-gray-500">{description}</p>
      </div>
      <div role="group" aria-label={label} className="flex flex-wrap gap-2 sm:flex-nowrap">
        {([1, 2, 3, 4, 5] as const).map((score) => {
          const selected = value === score;
          return (
            <button
              key={score}
              type="button"
              disabled={disabled}
              onClick={() => onChange(score)}
              aria-label={`${score} - ${SCORE_LABELS[score]}`}
              className={`flex min-w-[56px] flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-2 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
                selected
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <span
                className={`flex h-4 w-4 items-center justify-center rounded-full border-2 transition-colors ${
                  selected
                    ? 'border-primary-600 bg-primary-600'
                    : 'border-gray-300 bg-white'
                }`}
              >
                {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
              </span>
              <span
                className={`text-center text-[11px] font-medium leading-tight ${
                  selected ? 'text-primary-700' : 'text-gray-600'
                }`}
              >
                {score}
              </span>
              <span
                className={`hidden text-center text-[10px] leading-tight sm:block ${
                  selected ? 'text-primary-600' : 'text-gray-400'
                }`}
              >
                {SCORE_LABELS[score]}
              </span>
            </button>
          );
        })}
      </div>
      {value >= 1 && (
        <p className="text-xs font-medium text-primary-600 sm:hidden">
          {SCORE_LABELS[value]}
        </p>
      )}
    </div>
  );
}

export function PeerEvaluationModal({
  isOpen,
  onClose,
  initialEvaluationId,
}: PeerEvaluationModalProps) {
  const { success: showSuccessToast } = useAppToast();
  const [evaluations, setEvaluations] = useState<PendingEvaluation[]>([]);
  const [readOnlyEvaluation, setReadOnlyEvaluation] = useState<PendingEvaluation | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const stableTotalRef = useRef<number>(0);

  const [scores, setScores] = useState<Record<string, { q1: number; q2: number; q3: number }>>({});
  const [messages, setMessages] = useState<Record<string, string>>({});

  const fetchEvaluationDetail = useCallback(async (id: string): Promise<PendingEvaluation | null> => {
    try {
      const res = await api.get<{ data: PendingEvaluation }>(`/peer-evaluations/${id}`);
      return res.data.data ?? null;
    } catch {
      return null;
    }
  }, []);

  const openReadOnlyIfFinalized = useCallback(
    async (id: string, prefetched?: PendingEvaluation | null): Promise<boolean> => {
      const detail = prefetched ?? (await fetchEvaluationDetail(id));
      if (!detail) return false;
      if (detail.status === 'completed' || isEvaluationExpired(detail)) {
        setReadOnlyEvaluation(detail);
        return true;
      }
      return false;
    },
    [fetchEvaluationDetail],
  );

  const fetchEvaluations = useCallback(async () => {
    setLoading(true);
    setError('');
    setEvaluations([]);
    setReadOnlyEvaluation(null);
    setScores({});
    setMessages({});
    setCurrentIndex(0);
    stableTotalRef.current = 0;

    try {
      let initialDetail: PendingEvaluation | null = null;
      if (initialEvaluationId) {
        initialDetail = await fetchEvaluationDetail(initialEvaluationId);
        const openedReadOnly = await openReadOnlyIfFinalized(initialEvaluationId, initialDetail);
        if (openedReadOnly) return;
      }

      const res = await api.get<{ data: PendingEvaluation[] }>('/peer-evaluations/pending-mine');
      const pending = (res.data.data ?? []).filter((e) => e.status === 'pending');

      if (pending.length === 0) {
        if (initialEvaluationId) {
          const openedReadOnly = await openReadOnlyIfFinalized(initialEvaluationId, initialDetail);
          if (openedReadOnly) return;
        }
        onClose();
        return;
      }

      setEvaluations(pending);
      stableTotalRef.current = pending.length;

      const initialScores: Record<string, { q1: number; q2: number; q3: number }> = {};
      const initialMessages: Record<string, string> = {};
      for (const ev of pending) {
        initialScores[ev.id] = { q1: 0, q2: 0, q3: 0 };
        initialMessages[ev.id] = ev.additional_message ?? '';
      }
      setScores(initialScores);
      setMessages(initialMessages);

      if (initialEvaluationId) {
        const idx = pending.findIndex((e) => e.id === initialEvaluationId);
        if (idx >= 0) {
          setCurrentIndex(idx);
        } else {
          const openedReadOnly = await openReadOnlyIfFinalized(initialEvaluationId, initialDetail);
          if (!openedReadOnly) {
            setCurrentIndex(0);
          }
        }
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      setError(
        e?.response?.data?.error ||
          e?.response?.data?.message ||
          'Failed to load evaluations.',
      );
    } finally {
      setLoading(false);
    }
  }, [fetchEvaluationDetail, initialEvaluationId, onClose, openReadOnlyIfFinalized]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchEvaluations();
  }, [fetchEvaluations, isOpen]);

  const advanceOrClose = useCallback(
    (fromIndex: number) => {
      const nextPending = evaluations.findIndex(
        (e, i) =>
          i > fromIndex &&
          e.status === 'pending' &&
          new Date(e.expires_at).getTime() > Date.now(),
      );
      if (nextPending !== -1) {
        setCurrentIndex(nextPending);
      } else {
        onClose();
      }
    },
    [evaluations, onClose],
  );

  useEffect(() => {
    if (readOnlyEvaluation || evaluations.length === 0) return;
    const current = evaluations[currentIndex];
    if (!current) return;
    if (isEvaluationExpired(current)) {
      advanceOrClose(currentIndex);
    }
  }, [advanceOrClose, currentIndex, evaluations, readOnlyEvaluation]);

  async function handleSubmit() {
    if (readOnlyEvaluation) return;

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
      showSuccessToast('Peer evaluation completed.');
      advanceOrClose(currentIndex);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string; message?: string } } };
      const message =
        e?.response?.data?.error ||
        e?.response?.data?.message ||
        'Failed to submit evaluation.';

      const lowered = message.toLowerCase();
      if (lowered.includes('no longer pending') || lowered.includes('expired')) {
        const switchedToReadOnly = await openReadOnlyIfFinalized(current.id);
        if (switchedToReadOnly) {
          setError('');
          return;
        }
      }

      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    if (readOnlyEvaluation) return;
    advanceOrClose(currentIndex);
  }

  function handleClose() {
    if (submitting) return;
    onClose();
  }

  if (!isOpen) return null;

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

  const current = readOnlyEvaluation ?? evaluations[currentIndex];
  if (!current) return null;

  const isReadOnly = Boolean(readOnlyEvaluation);
  const isExpired = isEvaluationExpired(current);
  const statusLabel = isExpired ? 'Expired' : current.status === 'completed' ? 'Completed' : 'Pending';

  const evaluatedName = current.evaluated
    ? `${current.evaluated.first_name} ${current.evaluated.last_name}`
    : 'Unknown Employee';

  const readOnlyScores = {
    q1: Number(current.q1_score ?? 0),
    q2: Number(current.q2_score ?? 0),
    q3: Number(current.q3_score ?? 0),
  };

  const currentScore = isReadOnly
    ? readOnlyScores
    : (scores[current.id] ?? { q1: 0, q2: 0, q3: 0 });

  const currentMessage = isReadOnly
    ? (current.additional_message ?? '')
    : (messages[current.id] ?? '');

  const expiry = getExpiryText(current.expires_at);
  const stableTotal = stableTotalRef.current;
  const currentPositionLabel = currentIndex + 1;
  const allScoresSelected = currentScore.q1 >= 1 && currentScore.q2 >= 1 && currentScore.q3 >= 1;

  function setQ(key: 'q1' | 'q2' | 'q3', val: number) {
    if (isReadOnly) return;
    setScores((prev) => ({
      ...prev,
      [current.id]: { ...prev[current.id], [key]: val },
    }));
  }

  function setMessage(val: string) {
    if (isReadOnly) return;
    setMessages((prev) => ({ ...prev, [current.id]: val }));
  }

  const statusBadgeClass = isExpired
    ? 'bg-amber-100 text-amber-800'
    : 'bg-emerald-100 text-emerald-800';

  const questionValues = [
    {
      id: 'q1' as const,
      label: QUESTIONS[0].label,
      description: QUESTIONS[0].description,
      value: currentScore.q1,
    },
    {
      id: 'q2' as const,
      label: QUESTIONS[1].label,
      description: QUESTIONS[1].description,
      value: currentScore.q2,
    },
    {
      id: 'q3' as const,
      label: QUESTIONS[2].label,
      description: QUESTIONS[2].description,
      value: currentScore.q3,
    },
  ];

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Peer Evaluation"
      >
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              {current.evaluated && <EvaluatedAvatar user={current.evaluated} />}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-primary-600">
                  Peer Evaluation
                </p>
                <p className="truncate text-base font-semibold text-gray-900">{evaluatedName}</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  Shift overlap: {current.overlap_minutes} min &bull; Evaluated on{' '}
                  {formatShiftDate(current.shift_date ?? current.created_at)}
                </p>
                {isReadOnly && (
                  <span className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass}`}>
                    {statusLabel}
                  </span>
                )}
              </div>
            </div>
            <div className="flex shrink-0 items-start gap-2">
              {!isReadOnly && stableTotal > 1 && (
                <span className="mt-0.5 whitespace-nowrap rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
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

        <div className="max-h-[60vh] space-y-5 overflow-y-auto px-5 py-4">
          {questionValues.map((question) => (
            <div key={question.id} className="space-y-1.5">
              <LikertQuestion
                label={question.label}
                description={question.description}
                value={question.value}
                onChange={(v) => setQ(question.id, v)}
                disabled={submitting || isReadOnly}
              />
              {isReadOnly && question.value < 1 && (
                <p className="text-xs italic text-gray-400">No score submitted.</p>
              )}
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t border-gray-200 px-5 py-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Additional Message{' '}
              {!isReadOnly && <span className="font-normal text-gray-400">(optional)</span>}
            </label>
            {isReadOnly ? (
              <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                {currentMessage.trim() ? (
                  <p className="whitespace-pre-wrap">{currentMessage}</p>
                ) : (
                  <p className="italic text-gray-400">No additional message provided.</p>
                )}
              </div>
            ) : (
              <>
                <textarea
                  value={currentMessage}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  disabled={submitting}
                  placeholder="Any additional feedback for this evaluation..."
                  className="w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <p className="mt-0.5 text-right text-xs text-gray-400">
                  {currentMessage.length} / 1000
                </p>
              </>
            )}
          </div>

          {isReadOnly ? (
            <div className="flex items-center gap-3">
              {current.submitted_at && (
                <p className="text-xs text-gray-500">
                  Submitted on {new Date(current.submitted_at).toLocaleString()}
                </p>
              )}
              <div className="flex-1" />
              <Button onClick={handleClose} size="md">
                Close
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-1 text-xs ${expiry.urgent ? 'text-red-500' : 'text-gray-400'}`}>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{expiry.text}</span>
              </div>

              <div className="flex-1" />

              <button
                type="button"
                onClick={handleSkip}
                disabled={submitting}
                className="text-sm text-gray-500 transition-colors hover:text-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Skip for now
              </button>

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
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
