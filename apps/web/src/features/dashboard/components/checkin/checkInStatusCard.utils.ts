const MANILA_TIME_ZONE = 'Asia/Manila';

const MANILA_DAY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: MANILA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const MANILA_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const MANILA_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  month: 'short',
  day: '2-digit',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

function toManilaDayKey(date: Date): string {
  return MANILA_DAY_FORMATTER.format(date);
}

export function parseOdooUtcDateTime(value: string | null | undefined): Date | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;

  const parsed = new Date(`${normalized} UTC`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatCheckInTimeInManila(checkInTime: Date, now: Date = new Date()): string {
  if (toManilaDayKey(checkInTime) === toManilaDayKey(now)) {
    return MANILA_TIME_FORMATTER.format(checkInTime);
  }

  return MANILA_DATE_TIME_FORMATTER.format(checkInTime);
}

export function formatDurationSince(startTime: Date, now: Date = new Date()): string {
  const diffMs = Math.max(0, now.getTime() - startTime.getTime());
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs} hr${hrs !== 1 ? 's' : ''} ${rem} min${rem !== 1 ? 's' : ''}`;
}

