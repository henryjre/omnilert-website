import { useEffect, useState } from 'react';
import type { AnalyticsGranularity, AnalyticsRangeSelection } from './analyticsRangeBuckets';
import { normalizeRangeYmd } from './analyticsRangeBuckets';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const GRANULARITIES = new Set<AnalyticsGranularity>(['day', 'week', 'month', 'year']);

function isLocalYmd(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isAnalyticsGranularity(value: unknown): value is AnalyticsGranularity {
  return typeof value === 'string' && GRANULARITIES.has(value as AnalyticsGranularity);
}

function normalizeSelection(selection: AnalyticsRangeSelection): AnalyticsRangeSelection {
  const { rangeStartYmd, rangeEndYmd } = normalizeRangeYmd(
    selection.rangeStartYmd,
    selection.rangeEndYmd,
  );
  return {
    granularity: selection.granularity,
    rangeStartYmd,
    rangeEndYmd,
  };
}

function tryGetSessionStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function parseStoredAnalyticsRange(raw: string | null): AnalyticsRangeSelection | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AnalyticsRangeSelection> | null;
    if (
      !parsed ||
      !isAnalyticsGranularity(parsed.granularity) ||
      !isLocalYmd(parsed.rangeStartYmd) ||
      !isLocalYmd(parsed.rangeEndYmd)
    ) {
      return null;
    }

    return normalizeSelection({
      granularity: parsed.granularity,
      rangeStartYmd: parsed.rangeStartYmd,
      rangeEndYmd: parsed.rangeEndYmd,
    });
  } catch {
    return null;
  }
}

export function restorePersistedAnalyticsRange(
  storageKey: string,
  fallbackSelection: AnalyticsRangeSelection,
  storage: StorageLike | null = tryGetSessionStorage(),
): AnalyticsRangeSelection {
  const normalizedFallback = normalizeSelection(fallbackSelection);
  if (!storage) return normalizedFallback;

  try {
    return parseStoredAnalyticsRange(storage.getItem(storageKey)) ?? normalizedFallback;
  } catch {
    return normalizedFallback;
  }
}

export function persistAnalyticsRange(
  storageKey: string,
  selection: AnalyticsRangeSelection,
  storage: StorageLike | null = tryGetSessionStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(storageKey, JSON.stringify(normalizeSelection(selection)));
  } catch {
    // Ignore session storage write failures so the page keeps working.
  }
}

export function usePersistedAnalyticsRange(
  storageKey: string,
  fallbackSelection: AnalyticsRangeSelection,
) {
  const [selection, setSelection] = useState<AnalyticsRangeSelection>(() =>
    restorePersistedAnalyticsRange(storageKey, fallbackSelection),
  );

  useEffect(() => {
    persistAnalyticsRange(storageKey, selection);
  }, [selection, storageKey]);

  return [selection, setSelection] as const;
}
