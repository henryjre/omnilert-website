import assert from 'node:assert/strict';
import test from 'node:test';

const {
  OVERTIME_BLOCKER_AUTH_TYPES,
  computeOvertimeBlockerState,
  deriveOvertimeMinutes,
} = await import('../overtimeDependency.service.js');

test('OVERTIME_BLOCKER_AUTH_TYPES includes all four blocker types', () => {
  assert(OVERTIME_BLOCKER_AUTH_TYPES.has('tardiness'));
  assert(OVERTIME_BLOCKER_AUTH_TYPES.has('early_check_out'));
  assert(OVERTIME_BLOCKER_AUTH_TYPES.has('late_check_out'));
  assert(OVERTIME_BLOCKER_AUTH_TYPES.has('underbreak'));
});

test('computeOvertimeBlockerState returns blocked=false when no blocker auths are pending', () => {
  const auths = [
    { auth_type: 'tardiness', status: 'approved' },
    { auth_type: 'overtime', status: 'pending' },
  ];
  const result = computeOvertimeBlockerState(auths);
  assert.strictEqual(result.blocked, false);
  assert.deepStrictEqual(result.blockerAuthTypes, []);
});

test('computeOvertimeBlockerState returns blocked=true with pending blocker auth types', () => {
  const auths = [
    { auth_type: 'tardiness', status: 'pending' },
    { auth_type: 'underbreak', status: 'pending' },
    { auth_type: 'overtime', status: 'pending' },
  ];
  const result = computeOvertimeBlockerState(auths);
  assert.strictEqual(result.blocked, true);
  assert(result.blockerAuthTypes.includes('tardiness'));
  assert(result.blockerAuthTypes.includes('underbreak'));
});

test('deriveOvertimeMinutes returns 0 when net worked equals effective allocated', () => {
  const minutes = deriveOvertimeMinutes({
    totalWorkedHours: 9,
    totalBreakHours: 1,
    allocatedHours: 9,
    resolvedAdjustments: [],
  });
  assert.strictEqual(minutes, 0);
});

test('deriveOvertimeMinutes adds diff_minutes for approved tardiness', () => {
  // netWorked=8h=480min, effectiveAllocated=(8-1)*60=420. tardiness approved +30 => paid=510 => overtime=90
  const minutes = deriveOvertimeMinutes({
    totalWorkedHours: 8,
    totalBreakHours: 0,
    allocatedHours: 8,
    resolvedAdjustments: [{ auth_type: 'tardiness', status: 'approved', diff_minutes: 30 }],
  });
  assert.strictEqual(minutes, 90);
});

test('deriveOvertimeMinutes adds diff_minutes for rejected early_check_out', () => {
  // netWorked=8h=480min, effectiveAllocated=(9-1)*60=480. early_check_out rejected +30 => paid=510 => overtime=30
  const minutes = deriveOvertimeMinutes({
    totalWorkedHours: 9,
    totalBreakHours: 1,
    allocatedHours: 9,
    resolvedAdjustments: [{ auth_type: 'early_check_out', status: 'rejected', diff_minutes: 30 }],
  });
  assert.strictEqual(minutes, 30);
});

test('deriveOvertimeMinutes subtracts diff_minutes for rejected late_check_out', () => {
  // netWorked=9h=540min, effectiveAllocated=(9-1)*60=480. late_check_out rejected -30 => paid=510 => overtime=30
  const minutes = deriveOvertimeMinutes({
    totalWorkedHours: 10,
    totalBreakHours: 1,
    allocatedHours: 9,
    resolvedAdjustments: [{ auth_type: 'late_check_out', status: 'rejected', diff_minutes: 30 }],
  });
  assert.strictEqual(minutes, 30);
});

test('deriveOvertimeMinutes returns 0 when derived overtime is negative', () => {
  const minutes = deriveOvertimeMinutes({
    totalWorkedHours: 7,
    totalBreakHours: 1,
    allocatedHours: 9,
    resolvedAdjustments: [],
  });
  assert.strictEqual(minutes, 0);
});
