const MANILA_TIME_ZONE = 'Asia/Manila';

const MANILA_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  month: 'long',
  day: '2-digit',
  year: 'numeric',
});

const MANILA_TIME_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: MANILA_TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function parseUtcLikeDateTime(value: string | Date | null | undefined): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== 'string') return null;

  const normalized = value.trim();
  if (!normalized) return null;

  const hasExplicitTimezone = /(?:Z|[+-]\d{2}:\d{2}|UTC)$/i.test(normalized);
  const looksIso = normalized.includes('T');
  const candidate = hasExplicitTimezone || looksIso ? normalized : `${normalized} UTC`;
  const parsed = new Date(candidate);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

export function formatDateTimeInManila(value: string | Date | null | undefined): string | null {
  const parsed = parseUtcLikeDateTime(value);
  if (!parsed) return null;

  return `${MANILA_DATE_FORMATTER.format(parsed)} at ${MANILA_TIME_FORMATTER.format(parsed)}`;
}
