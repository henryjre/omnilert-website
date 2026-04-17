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

test('EmployeeShiftsPage shows effective allocated hours and fixed allocated breaks in shift detail', () => {
  assert.match(
    employeeShiftsPageSource,
    /const ALLOCATED_BREAK_HOURS = 1;/,
    'EmployeeShiftsPage should keep allocated breaks fixed at one hour',
  );
  assert.match(
    employeeShiftsPageSource,
    /const effectiveAllocatedHours = Math\.max\(\s*0,\s*Number\(shift\.allocated_hours \|\| 0\) - allocatedBreakHours,\s*\);/,
    'EmployeeShiftsPage should derive effective allocated hours from shift.allocated_hours minus one hour',
  );
  assert.match(
    employeeShiftsPageSource,
    /Allocated Breaks/,
    'EmployeeShiftsPage should render an Allocated Breaks field',
  );
  assert.match(
    employeeShiftsPageSource,
    /formatDuration\(allocatedBreakHours\)/,
    'EmployeeShiftsPage should display the fixed allocated breaks value',
  );
  assert.match(
    employeeShiftsPageSource,
    /formatDuration\(effectiveAllocatedHours\)/,
    'EmployeeShiftsPage should display effective allocated hours',
  );
  assert.match(
    employeeShiftsPageSource,
    /const netWorkedHours = Math\.max\(0, totalWorkedHours - totalBreakHours\);/,
    'EmployeeShiftsPage should continue deriving worked time from total worked hours minus total break hours',
  );
});

test('ScheduleTab shows effective allocated hours and fixed allocated breaks in shift detail', () => {
  assert.match(
    scheduleTabSource,
    /const ALLOCATED_BREAK_HOURS = 1;/,
    'ScheduleTab should keep allocated breaks fixed at one hour',
  );
  assert.match(
    scheduleTabSource,
    /const effectiveAllocatedHours = Math\.max\(\s*0,\s*Number\(shift\.allocated_hours \|\| 0\) - allocatedBreakHours,\s*\);/,
    'ScheduleTab should derive effective allocated hours from shift.allocated_hours minus one hour',
  );
  assert.match(
    scheduleTabSource,
    /Allocated Breaks/,
    'ScheduleTab should render an Allocated Breaks field',
  );
  assert.match(
    scheduleTabSource,
    /formatDuration\(allocatedBreakHours\)/,
    'ScheduleTab should display the fixed allocated breaks value',
  );
  assert.match(
    scheduleTabSource,
    /formatDuration\(effectiveAllocatedHours\)/,
    'ScheduleTab should display effective allocated hours',
  );
  assert.match(
    scheduleTabSource,
    /const netWorkedHours = Math\.max\(0, totalWorkedHours - totalBreakHours\);/,
    'ScheduleTab should continue deriving worked time from total worked hours minus total break hours',
  );
});
