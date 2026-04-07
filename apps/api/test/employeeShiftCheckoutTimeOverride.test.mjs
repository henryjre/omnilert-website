import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const controllerFile = new URL('../src/controllers/employeeShift.controller.ts', import.meta.url);
const source = readFileSync(controllerFile, 'utf8');

test('employee shift end controller reads optional checkOutTime from the request body', () => {
  assert.match(
    source,
    /const requestedCheckOutTime = req\.body\?\.checkOutTime;/,
    'endShift should read an optional checkOutTime from the request body',
  );
});

test('employee shift end controller validates provided checkOutTime before checkout', () => {
  assert.match(
    source,
    /const checkOutTime = requestedCheckOutTime \? new Date\(requestedCheckOutTime\) : new Date\(\);/,
    'endShift should derive the checkout date from checkOutTime when provided',
  );
  assert.match(
    source,
    /if \(Number\.isNaN\(checkOutTime\.getTime\(\)\)\) \{\s*throw new AppError\(400,\s*'Invalid checkOutTime'\);\s*\}/,
    'endShift should reject invalid checkOutTime values',
  );
});

test('employee shift end controller forwards selected checkOutTime to Odoo and preserves fallback behavior', () => {
  assert.match(
    source,
    /await batchCheckOutAttendances\(\[Number\(lastCheckIn\.odoo_attendance_id\)\], checkOutTime\);/,
    'endShift should pass the selected or fallback checkout time to Odoo',
  );
  assert.doesNotMatch(
    source,
    /await batchCheckOutAttendances\(\[Number\(lastCheckIn\.odoo_attendance_id\)\], new Date\(\)\);/,
    'endShift should not hardcode new Date() at the Odoo checkout callsite anymore',
  );
});
