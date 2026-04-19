import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { formatCompactDuration } from '../src/shared/utils/duration.ts';
import { deriveAdjustedShiftSummary } from '../src/shared/utils/shiftSummaryAdjustments.ts';

const employeeShiftsPageSource = readFileSync(
  new URL('../src/features/employee-shifts/pages/EmployeeShiftsPage.tsx', import.meta.url),
  'utf8',
);

const scheduleTabSource = readFileSync(
  new URL('../src/features/account/components/ScheduleTab.tsx', import.meta.url),
  'utf8',
);

test('deriveAdjustedShiftSummary leaves raw values unchanged when no resolved authorizations exist', () => {
  const summary = deriveAdjustedShiftSummary({
    totalWorkedHours: 3.5,
    totalBreakHours: 0.5,
    totalFieldTaskHours: 0.25,
    authorizations: [
      { auth_type: 'tardiness', status: 'pending', diff_minutes: 10 },
      { auth_type: 'underbreak', status: 'locked', diff_minutes: 30 },
    ],
  });

  assert.deepEqual(summary.raw, {
    workedMinutes: 165,
    breakMinutes: 30,
    fieldTaskMinutes: 15,
    totalActiveMinutes: 210,
  });
  assert.deepEqual(summary.adjusted, summary.raw);
  assert.deepEqual(summary.flags, {
    workedAdjusted: false,
    breakAdjusted: false,
    totalAdjusted: false,
  });
});

test('deriveAdjustedShiftSummary applies approved tardiness and rejected checkout adjustments to total active and worked time', () => {
  const summary = deriveAdjustedShiftSummary({
    totalWorkedHours: 3,
    totalBreakHours: 0.25,
    totalFieldTaskHours: 0,
    authorizations: [
      { auth_type: 'tardiness', status: 'approved', diff_minutes: 20 },
      { auth_type: 'early_check_out', status: 'rejected', diff_minutes: 15 },
      { auth_type: 'late_check_out', status: 'rejected', diff_minutes: 10 },
    ],
  });

  assert.deepEqual(summary.adjusted, {
    workedMinutes: 190,
    breakMinutes: 15,
    fieldTaskMinutes: 0,
    totalActiveMinutes: 205,
  });
  assert.deepEqual(summary.flags, {
    workedAdjusted: true,
    breakAdjusted: false,
    totalAdjusted: true,
  });
});

test('deriveAdjustedShiftSummary applies rejected early check in deductions', () => {
  const summary = deriveAdjustedShiftSummary({
    totalWorkedHours: 2.5,
    totalBreakHours: 0.25,
    totalFieldTaskHours: 0,
    authorizations: [{ auth_type: 'early_check_in', status: 'rejected', diff_minutes: 20 }],
  });

  assert.deepEqual(summary.adjusted, {
    workedMinutes: 115,
    breakMinutes: 15,
    fieldTaskMinutes: 0,
    totalActiveMinutes: 130,
  });
});

test('deriveAdjustedShiftSummary raises break time to one hour when underbreak is rejected', () => {
  const summary = deriveAdjustedShiftSummary({
    totalWorkedHours: 3 + 10 / 60,
    totalBreakHours: 25 / 60,
    totalFieldTaskHours: 0,
    authorizations: [{ auth_type: 'underbreak', status: 'rejected', diff_minutes: 35 }],
  });

  assert.deepEqual(summary.adjusted, {
    workedMinutes: 130,
    breakMinutes: 60,
    fieldTaskMinutes: 0,
    totalActiveMinutes: 190,
  });
  assert.deepEqual(summary.flags, {
    workedAdjusted: true,
    breakAdjusted: true,
    totalAdjusted: false,
  });
});

test('deriveAdjustedShiftSummary safely clamps values at zero', () => {
  const summary = deriveAdjustedShiftSummary({
    totalWorkedHours: 0.5,
    totalBreakHours: 0,
    totalFieldTaskHours: 0,
    authorizations: [
      { auth_type: 'early_check_in', status: 'rejected', diff_minutes: 45 },
      { auth_type: 'underbreak', status: 'rejected', diff_minutes: 60 },
    ],
  });

  assert.deepEqual(summary.adjusted, {
    workedMinutes: 0,
    breakMinutes: 60,
    fieldTaskMinutes: 0,
    totalActiveMinutes: 60,
  });
});

test('formatCompactDuration renders mobile-friendly duration labels', () => {
  assert.equal(formatCompactDuration(0), '0m');
  assert.equal(formatCompactDuration(25 / 60), '25m');
  assert.equal(formatCompactDuration(1), '1h');
  assert.equal(formatCompactDuration(2.75), '2h 45m');
});

test('shift detail panels use the shared summary adjustment helper and compact mobile labels', () => {
  for (const [source, label] of [
    [employeeShiftsPageSource, 'EmployeeShiftsPage'],
    [scheduleTabSource, 'ScheduleTab'],
  ] as const) {
    assert.match(
      source,
      /deriveAdjustedShiftSummary\(/,
      `${label} should derive adjusted shift summary values from the shared helper`,
    );
    assert.match(
      source,
      /formatCompactDuration\(/,
      `${label} should render compact mobile duration labels`,
    );
    assert.match(
      source,
      /ADJUSTED/,
      `${label} should label adjusted summary metrics`,
    );
  }
});
