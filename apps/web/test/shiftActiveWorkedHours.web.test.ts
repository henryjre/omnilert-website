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

test('EmployeeShiftsPage adds live session time on top of accumulated worked hours and counts field task in Worked Hours', () => {
  assert.match(
    employeeShiftsPageSource,
    /const liveSessionHours = isActive && checkInTime\s*\?\s*\(now - checkInTime\) \/ 3_600_000\s*:\s*0;\s*const totalWorkedHours = Number\(shift\.total_worked_hours \|\| 0\) \+ liveSessionHours;/,
    'EmployeeShiftsPage should preserve accumulated total_worked_hours when a shift is re-opened after re-check-in',
  );
  assert.match(
    employeeShiftsPageSource,
    /const adjustedWorkedHours =\s*\(adjustedSummary\.adjusted\.workedMinutes \+ adjustedSummary\.adjusted\.fieldTaskMinutes\) \/ 60;/,
    'EmployeeShiftsPage should count field task time inside the Worked Hours progress metric',
  );
});

test('ScheduleTab adds live session time on top of accumulated worked hours and counts field task in Worked Hours', () => {
  assert.match(
    scheduleTabSource,
    /const liveSessionHours = isActive && checkInTime\s*\?\s*\(now - checkInTime\) \/ 3_600_000\s*:\s*0;\s*const totalWorkedHours = Number\(shift\.total_worked_hours \|\| 0\) \+ liveSessionHours;/,
    'ScheduleTab should preserve accumulated total_worked_hours when a shift is re-opened after re-check-in',
  );
  assert.match(
    scheduleTabSource,
    /const adjustedWorkedHours =\s*\(adjustedSummary\.adjusted\.workedMinutes \+ adjustedSummary\.adjusted\.fieldTaskMinutes\) \/ 60;/,
    'ScheduleTab should count field task time inside the Worked Hours progress metric',
  );
});
