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

test('EmployeeShiftsPage labels open shifts as Upcoming in status config and tabs', () => {
  assert.match(
    employeeShiftsPageSource,
    /open:\s*\{\s*label:\s*'Upcoming',\s*cls:\s*'bg-blue-100 text-blue-700'\s*\}/,
    'EmployeeShiftsPage should label open shifts as Upcoming in the status badge config',
  );
  assert.match(
    employeeShiftsPageSource,
    /\{\s*id:\s*'open',\s*label:\s*'Upcoming',\s*icon:\s*CalendarDays\s*\}/,
    'EmployeeShiftsPage should label the open schedule tab as Upcoming',
  );
});

test('ScheduleTab labels open shifts as Upcoming in status config and tabs', () => {
  assert.match(
    scheduleTabSource,
    /open:\s*\{\s*label:\s*'Upcoming',\s*cls:\s*'bg-blue-100 text-blue-700'\s*\}/,
    'ScheduleTab should label open shifts as Upcoming in the status badge config',
  );
  assert.match(
    scheduleTabSource,
    /\{\s*id:\s*'open',\s*label:\s*'Upcoming',\s*icon:\s*Clock\s*\}/,
    'ScheduleTab should label the open schedule tab as Upcoming',
  );
});
