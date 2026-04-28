import type { RewardRequestStatus } from '@omnilert/shared';

export function formatRewardDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRewardPoints(value: number): string {
  return parseFloat(Math.abs(value).toFixed(2)).toString();
}

export function formatSignedEpiDelta(value: number): string {
  const abs = parseFloat(Math.abs(value).toFixed(2)).toString();
  return value >= 0 ? `+${abs}` : `-${abs}`;
}

export function rewardStatusLabel(status: RewardRequestStatus): string {
  if (status === 'pending') return 'Pending';
  if (status === 'approved') return 'Approved';
  return 'Rejected';
}

export function rewardStatusVariant(status: RewardRequestStatus): 'warning' | 'success' | 'danger' {
  if (status === 'pending') return 'warning';
  if (status === 'approved') return 'success';
  return 'danger';
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  const axiosError = error as { response?: { data?: { error?: string; message?: string } } };
  return (
    axiosError.response?.data?.error ??
    axiosError.response?.data?.message ??
    (error instanceof Error ? error.message : fallback)
  );
}
