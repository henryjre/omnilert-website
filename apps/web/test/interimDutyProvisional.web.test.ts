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

test('EmployeeShiftsPage renders active interim duty as open-ended and uncapped', () => {
  assert.match(
    employeeShiftsPageSource,
    /function isActiveInterimDutyShift\(shift: any\): boolean \{\s*return isInterimDutyShift\(shift\) && shift\?\.status === 'active';\s*\}/,
    'EmployeeShiftsPage should detect active interim-duty shifts',
  );
  assert.match(
    employeeShiftsPageSource,
    /return isActiveInterimDutyShift\(shift\) \? 'In Progress' : fmtShift\(shift\.shift_end\);/,
    'EmployeeShiftsPage should replace the fake scheduled end with In Progress for active interim duty',
  );
  assert.match(
    employeeShiftsPageSource,
    /max=\{isActiveInterimDuty \? null : effectiveAllocatedHours\}[\s\S]*uncapped=\{isActiveInterimDuty\}/,
    'EmployeeShiftsPage should render the Worked Hours progress bar in uncapped mode for active interim duty',
  );
});

test('ScheduleTab renders active interim duty as open-ended and uncapped', () => {
  assert.match(
    scheduleTabSource,
    /function isActiveInterimDutyShift\(shift: any\): boolean \{\s*return isInterimDutyShift\(shift\) && shift\?\.status === 'active';\s*\}/,
    'ScheduleTab should detect active interim-duty shifts',
  );
  assert.match(
    scheduleTabSource,
    /return isActiveInterimDutyShift\(shift\) \? 'In Progress' : fmtShift\(shift\.shift_end\);/,
    'ScheduleTab should replace the fake scheduled end with In Progress for active interim duty',
  );
  assert.match(
    scheduleTabSource,
    /max=\{isActiveInterimDuty \? null : effectiveAllocatedHours\}[\s\S]*uncapped=\{isActiveInterimDuty\}/,
    'ScheduleTab should render the Worked Hours progress bar in uncapped mode for active interim duty',
  );
});

test('ScheduleTab listens for activity realtime updates and interim-linked detail refresh', () => {
  assert.match(
    scheduleTabSource,
    /socket\.on\('shift:activity-started', \(data: \{ shiftId: string; activity: any \}\) => \{/,
    'ScheduleTab should subscribe to shift:activity-started events',
  );
  assert.match(
    scheduleTabSource,
    /socket\.on\('shift:activity-ended', \(data: \{ shiftId: string; activity: any \}\) => \{/,
    'ScheduleTab should subscribe to shift:activity-ended events',
  );
  assert.match(
    scheduleTabSource,
    /getLinkedShiftIdFromInterimPayload\(data\) === selectedShift\.id[\s\S]*refreshSelectedShiftDetail\(selectedShift\.id\)/,
    'ScheduleTab should refetch the selected linked shift detail when a new interim shift claims its logs and activities',
  );
});

test('EmployeeShiftsPage refreshes a selected linked shift when interim reclassification happens live', () => {
  assert.match(
    employeeShiftsPageSource,
    /getLinkedShiftIdFromInterimPayload\(data\) === selectedShift\.id[\s\S]*refreshSelectedShiftDetail\(selectedShift\.id\)/,
    'EmployeeShiftsPage should refetch the selected linked shift detail when a new interim shift claims its logs and activities',
  );
  assert.match(
    employeeShiftsPageSource,
    /isActiveInterimDuty \? new Date\(\)\.toISOString\(\) : shift\.shift_end/,
    'EmployeeShiftsPage should default active interim-duty checkout to the current time instead of the provisional shift_end',
  );
});
