import { describe, it, expect } from 'vitest';
import {
  OVERTIME_BLOCKER_AUTH_TYPES,
  computeOvertimeBlockerState,
  deriveOvertimeMinutes,
} from '../overtimeDependency.service.js';

describe('OVERTIME_BLOCKER_AUTH_TYPES', () => {
  it('includes every non-overtime auth type that keeps managed overtime locked', () => {
    expect(OVERTIME_BLOCKER_AUTH_TYPES.has('early_check_in')).toBe(true);
    expect(OVERTIME_BLOCKER_AUTH_TYPES.has('tardiness')).toBe(true);
    expect(OVERTIME_BLOCKER_AUTH_TYPES.has('early_check_out')).toBe(true);
    expect(OVERTIME_BLOCKER_AUTH_TYPES.has('late_check_out')).toBe(true);
    expect(OVERTIME_BLOCKER_AUTH_TYPES.has('interim_duty')).toBe(true);
    expect(OVERTIME_BLOCKER_AUTH_TYPES.has('underbreak')).toBe(true);
  });
});

describe('computeOvertimeBlockerState', () => {
  it('returns blocked=false when no blocker auths are pending', () => {
    const auths = [
      { auth_type: 'tardiness', status: 'approved' },
      { auth_type: 'overtime', status: 'pending' },
    ];
    const result = computeOvertimeBlockerState(auths);
    expect(result.blocked).toBe(false);
    expect(result.blockerAuthTypes).toEqual([]);
  });

  it('returns blocked=true with pending blocker auth types', () => {
    const auths = [
      { auth_type: 'early_check_in', status: 'pending' },
      { auth_type: 'tardiness', status: 'pending' },
      { auth_type: 'underbreak', status: 'pending' },
      { auth_type: 'overtime', status: 'pending' },
    ];
    const result = computeOvertimeBlockerState(auths);
    expect(result.blocked).toBe(true);
    expect(result.blockerAuthTypes).toContain('early_check_in');
    expect(result.blockerAuthTypes).toContain('tardiness');
    expect(result.blockerAuthTypes).toContain('underbreak');
  });
});

describe('deriveOvertimeMinutes', () => {
  it('returns 0 when net worked equals allocated', () => {
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 8,
      totalBreakHours: 1,
      allocatedHours: 7,
      resolvedAdjustments: [],
    });
    expect(minutes).toBe(0);
  });

  it('adds diff_minutes for approved tardiness', () => {
    // netWorked=8h=480min, allocated=8h=480. tardiness approved +30 => paid=510 => overtime=30
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 8,
      totalBreakHours: 0,
      allocatedHours: 8,
      resolvedAdjustments: [{ auth_type: 'tardiness', status: 'approved', diff_minutes: 30 }],
    });
    expect(minutes).toBe(30);
  });

  it('adds diff_minutes for rejected early_check_out', () => {
    // netWorked=8h=480min, allocated=8h=480. early_check_out rejected +30 => paid=510 => overtime=30
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 9,
      totalBreakHours: 1,
      allocatedHours: 8,
      resolvedAdjustments: [{ auth_type: 'early_check_out', status: 'rejected', diff_minutes: 30 }],
    });
    expect(minutes).toBe(30);
  });

  it('subtracts diff_minutes for rejected late_check_out', () => {
    // netWorked=9h=540min, allocated=8h=480. late_check_out rejected -30 => paid=510 => overtime=30
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 10,
      totalBreakHours: 1,
      allocatedHours: 8,
      resolvedAdjustments: [{ auth_type: 'late_check_out', status: 'rejected', diff_minutes: 30 }],
    });
    expect(minutes).toBe(30);
  });

  it('returns 0 when derived overtime is negative', () => {
    const minutes = deriveOvertimeMinutes({
      totalWorkedHours: 7,
      totalBreakHours: 1,
      allocatedHours: 9,
      resolvedAdjustments: [],
    });
    expect(minutes).toBe(0);
  });
});
