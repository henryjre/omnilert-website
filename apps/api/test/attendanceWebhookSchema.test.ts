import assert from 'node:assert/strict';
import test from 'node:test';
import { odooAttendancePayloadSchema } from '../../../packages/shared/src/validation/attendance.schema.ts';

test('odoo attendance schema preserves x_website_key for webhook identity propagation', () => {
  const parsed = odooAttendancePayloadSchema.parse({
    id: 9001,
    check_in: '2026-03-20 09:00:00',
    x_company_id: 1,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alice Manager',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(parsed.x_website_key, 'website-user-1');
});
