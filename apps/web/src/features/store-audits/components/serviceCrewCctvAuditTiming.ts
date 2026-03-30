import type { StoreAudit } from '@omnilert/shared';

export type ServiceCrewCctvAuditPanelTiming =
  | {
      kind: 'processing';
      durationText: string | null;
    }
  | {
      kind: 'completed';
      durationText: string | null;
    }
  | {
      kind: 'rejected';
      durationText: string | null;
    };

function parseValidDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function getElapsedMinutes(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const diffMs = end.getTime() - start.getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return null;
  return Math.floor(diffMs / (60 * 1000));
}

export function formatElapsedMinutes(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '-';

  if (totalMinutes < 60) {
    return `${totalMinutes} ${totalMinutes === 1 ? 'min' : 'mins'}`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourLabel = hours === 1 ? 'hour' : 'hours';
  const minuteLabel = minutes === 1 ? 'min' : 'mins';

  return `${hours} ${hourLabel} ${minutes} ${minuteLabel}`;
}

export function resolveServiceCrewCctvAuditPanelTiming(
  audit: Pick<
    StoreAudit,
    'status' | 'processing_started_at' | 'completed_at' | 'rejected_at'
  >,
  now: Date = new Date(),
): ServiceCrewCctvAuditPanelTiming {
  if (audit.status === 'completed') {
    const processingStartedAt = parseValidDate(audit.processing_started_at);
    const completedAt = parseValidDate(audit.completed_at);
    const elapsedMinutes = getElapsedMinutes(processingStartedAt, completedAt);

    return {
      kind: 'completed',
      durationText: elapsedMinutes === null ? null : formatElapsedMinutes(elapsedMinutes),
    };
  }

  if (audit.status === 'rejected') {
    const processingStartedAt = parseValidDate(audit.processing_started_at);
    const rejectedAt = parseValidDate(audit.rejected_at);
    const elapsedMinutes = getElapsedMinutes(processingStartedAt, rejectedAt);

    return {
      kind: 'rejected',
      durationText: elapsedMinutes === null ? null : formatElapsedMinutes(elapsedMinutes),
    };
  }

  const processingStartedAt = parseValidDate(audit.processing_started_at);
  const elapsedMinutes = getElapsedMinutes(processingStartedAt, now);

  return {
    kind: 'processing',
    durationText: elapsedMinutes === null ? null : formatElapsedMinutes(elapsedMinutes),
  };
}
