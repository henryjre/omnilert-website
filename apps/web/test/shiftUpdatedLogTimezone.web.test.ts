import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const employeeShiftsPageSource = readFileSync(
  new URL('../src/features/employee-shifts/pages/EmployeeShiftsPage.tsx', import.meta.url),
  'utf8',
);

const scheduleTabSource = readFileSync(
  new URL('../src/features/account/components/ScheduleTab.tsx', import.meta.url),
  'utf8',
);

test('EmployeeShiftsPage uses Manila-aware formatting for shift-updated timestamps', () => {
  assert.match(
    employeeShiftsPageSource,
    /from ['"]@\/shared\/utils\/dateTime['"]/,
    'EmployeeShiftsPage should use a shared Manila date-time helper',
  );
  assert.match(
    employeeShiftsPageSource,
    /return formatDateTimeInManila\((?:dt|iso)\) \?\? (?:dt|iso);/,
    'EmployeeShiftsPage should format shift summary timestamps in Manila time',
  );
  assert.match(
    employeeShiftsPageSource,
    /return formatDateTimeInManila\(iso\) \?\? iso;/,
    'EmployeeShiftsPage should format log event timestamps in Manila time',
  );
  assert.match(
    employeeShiftsPageSource,
    /return formatDateTimeInManila\(value\) \?\? value;/,
    'EmployeeShiftsPage should format shift_updated field values in Manila time',
  );
});

test('ScheduleTab uses Manila-aware formatting for shift-updated timestamps', () => {
  assert.match(
    scheduleTabSource,
    /from ['"]@\/shared\/utils\/dateTime['"]/,
    'ScheduleTab should use a shared Manila date-time helper',
  );
  assert.match(
    scheduleTabSource,
    /return formatDateTimeInManila\((?:dt|iso)\) \?\? (?:dt|iso);/,
    'ScheduleTab should format shift summary timestamps in Manila time',
  );
  assert.match(
    scheduleTabSource,
    /return formatDateTimeInManila\(iso\) \?\? iso;/,
    'ScheduleTab should format log event timestamps in Manila time',
  );
  assert.match(
    scheduleTabSource,
    /return formatDateTimeInManila\(value\) \?\? value;/,
    'ScheduleTab should format shift_updated field values in Manila time',
  );
});
