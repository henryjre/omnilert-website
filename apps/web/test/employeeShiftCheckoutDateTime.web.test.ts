import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const employeeShiftsPageSource = readFileSync(
  new URL('../src/features/employee-shifts/pages/EmployeeShiftsPage.tsx', import.meta.url),
  'utf8',
);

const dateTimePickerSource = readFileSync(
  new URL('../src/shared/components/ui/DateTimePicker.tsx', import.meta.url),
  'utf8',
);

test('EmployeeShiftsPage tracks checkout confirmation state with a selected checkOutTime', () => {
  assert.match(
    employeeShiftsPageSource,
    /import \{ DateTimePicker \} from ['"]@\/shared\/components\/ui\/DateTimePicker['"];/,
    'EmployeeShiftsPage should import the shared DateTimePicker',
  );
  assert.match(
    employeeShiftsPageSource,
    /interface EndShiftConfirmState \{\s*shiftId: string;\s*step: EndShiftConfirmStep;\s*checkOutTime: string;\s*\}/,
    'checkout confirmation state should store the selected checkOutTime',
  );
  assert.match(
    employeeShiftsPageSource,
    /const requestEndShift = \(shiftId: string,\s*defaultCheckOutTime: string\) => \{\s*setEndShiftConfirm\(\{ shiftId,\s*step: 1,\s*checkOutTime: defaultCheckOutTime \}\);/s,
    'opening the checkout flow should seed checkOutTime from the shift end time',
  );
});

test('EmployeeShiftsPage renders the checkout DateTimePicker in the second confirmation step', () => {
  assert.match(
    employeeShiftsPageSource,
    /<DateTimePicker[\s\S]*value=\{endShiftConfirm\.checkOutTime\}[\s\S]*onChange=\{\(next\) =>[\s\S]*checkOutTime: next[\s\S]*\}/,
    'step 2 should render a controlled DateTimePicker bound to endShiftConfirm.checkOutTime',
  );
  assert.match(
    employeeShiftsPageSource,
    /handleEndShift\(endShiftConfirm\.shiftId,\s*endShiftConfirm\.checkOutTime\)/,
    'final confirmation should submit the selected checkout time',
  );
  assert.match(
    employeeShiftsPageSource,
    /api\.post\(`\/employee-shifts\/\$\{shiftId\}\/end`,\s*\{ checkOutTime \}\)/,
    'the end-shift request should send checkOutTime in the request body',
  );
});

test('DateTimePicker provides a calendar popover plus a time input', () => {
  assert.match(
    dateTimePickerSource,
    /export function DateTimePicker\(/,
    'DateTimePicker should be exported as a shared UI component',
  );
  assert.match(
    dateTimePickerSource,
    /type="time"/,
    'DateTimePicker should include a time input',
  );
  assert.match(
    dateTimePickerSource,
    /Select date and time|Select checkout time/,
    'DateTimePicker trigger should communicate that both date and time are selectable',
  );
});
