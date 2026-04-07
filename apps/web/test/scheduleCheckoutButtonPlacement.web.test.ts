import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const scheduleTabSource = readFileSync(
  new URL('../src/features/account/components/ScheduleTab.tsx', import.meta.url),
  'utf8',
);

const employeeShiftsPageSource = readFileSync(
  new URL('../src/features/employee-shifts/pages/EmployeeShiftsPage.tsx', import.meta.url),
  'utf8',
);

const scheduleTabCheckoutActionPattern =
  /\{canEndShift && \(\s*<Button[\s\S]*?onClick=\{\(\) => onEndShift\(shift\.id\)\}[\s\S]*?Check Out[\s\S]*?<\/Button>\s*\)\}/;

const employeeShiftsCheckoutActionPattern =
  /\{canEndShift && \(\s*<Button[\s\S]*?onClick=\{\(\) => onEndShift\?\.\(shift\.id(?:,\s*shift\.shift_end)?\)\}[\s\S]*?Check Out[\s\S]*?<\/Button>\s*\)\}/;

test('ScheduleTab does not render the active shift checkout action', () => {
  assert.doesNotMatch(
    scheduleTabSource,
    scheduleTabCheckoutActionPattern,
    'ScheduleTab should not render the active shift Check Out action button',
  );
});

test('EmployeeShiftsPage keeps the active shift checkout action', () => {
  assert.match(
    employeeShiftsPageSource,
    employeeShiftsCheckoutActionPattern,
    'EmployeeShiftsPage should continue rendering the active shift Check Out action button',
  );
});
