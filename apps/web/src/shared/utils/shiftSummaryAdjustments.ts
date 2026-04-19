export type ShiftSummaryAuthorization = {
  auth_type?: string | null;
  status?: string | null;
  diff_minutes?: number | null;
};

export type ShiftSummaryMetricMinutes = {
  workedMinutes: number;
  breakMinutes: number;
  fieldTaskMinutes: number;
  totalActiveMinutes: number;
};

export type AdjustedShiftSummary = {
  raw: ShiftSummaryMetricMinutes;
  adjusted: ShiftSummaryMetricMinutes;
  flags: {
    workedAdjusted: boolean;
    breakAdjusted: boolean;
    totalAdjusted: boolean;
  };
};

function toNonNegativeRoundedMinutes(hoursDecimal: number | string): number {
  return Math.max(0, Math.round(Number(hoursDecimal || 0) * 60));
}

function toNonNegativeMinutes(value: number | string | null | undefined): number {
  return Math.max(0, Math.round(Number(value || 0)));
}

export function deriveAdjustedShiftSummary(input: {
  totalWorkedHours: number | string;
  totalBreakHours: number | string;
  totalFieldTaskHours: number | string;
  authorizations?: Array<ShiftSummaryAuthorization | null | undefined>;
  requiredBreakMinutes?: number;
}): AdjustedShiftSummary {
  const rawTotalActiveMinutes = toNonNegativeRoundedMinutes(input.totalWorkedHours);
  const rawBreakMinutes = toNonNegativeRoundedMinutes(input.totalBreakHours);
  const rawFieldTaskMinutes = toNonNegativeRoundedMinutes(input.totalFieldTaskHours);
  const rawWorkedMinutes = Math.max(
    0,
    rawTotalActiveMinutes - rawBreakMinutes - rawFieldTaskMinutes,
  );

  let totalActiveDeltaMinutes = 0;
  let adjustedBreakMinutes = rawBreakMinutes;
  let hasRejectedUnderbreak = false;

  for (const auth of input.authorizations ?? []) {
    const authType = String(auth?.auth_type ?? '').trim();
    const status = String(auth?.status ?? '').trim();
    const diffMinutes = toNonNegativeMinutes(auth?.diff_minutes);

    if (status === 'approved' && authType === 'tardiness') {
      totalActiveDeltaMinutes += diffMinutes;
      continue;
    }

    if (status === 'rejected' && authType === 'early_check_in') {
      totalActiveDeltaMinutes -= diffMinutes;
      continue;
    }

    if (status === 'rejected' && authType === 'early_check_out') {
      totalActiveDeltaMinutes += diffMinutes;
      continue;
    }

    if (status === 'rejected' && authType === 'late_check_out') {
      totalActiveDeltaMinutes -= diffMinutes;
      continue;
    }

    if (status === 'rejected' && authType === 'underbreak') {
      hasRejectedUnderbreak = true;
    }
  }

  if (hasRejectedUnderbreak) {
    adjustedBreakMinutes = Math.max(rawBreakMinutes, input.requiredBreakMinutes ?? 60);
  }

  const timeAdjustedTotalActiveMinutes = Math.max(0, rawTotalActiveMinutes + totalActiveDeltaMinutes);
  const adjustedTotalActiveMinutes = Math.max(
    0,
    Math.max(timeAdjustedTotalActiveMinutes, adjustedBreakMinutes + rawFieldTaskMinutes),
  );
  const adjustedWorkedMinutes = Math.max(
    0,
    adjustedTotalActiveMinutes - adjustedBreakMinutes - rawFieldTaskMinutes,
  );

  return {
    raw: {
      workedMinutes: rawWorkedMinutes,
      breakMinutes: rawBreakMinutes,
      fieldTaskMinutes: rawFieldTaskMinutes,
      totalActiveMinutes: rawTotalActiveMinutes,
    },
    adjusted: {
      workedMinutes: adjustedWorkedMinutes,
      breakMinutes: adjustedBreakMinutes,
      fieldTaskMinutes: rawFieldTaskMinutes,
      totalActiveMinutes: adjustedTotalActiveMinutes,
    },
    flags: {
      workedAdjusted: rawWorkedMinutes !== adjustedWorkedMinutes,
      breakAdjusted: rawBreakMinutes !== adjustedBreakMinutes,
      totalAdjusted: rawTotalActiveMinutes !== adjustedTotalActiveMinutes,
    },
  };
}
