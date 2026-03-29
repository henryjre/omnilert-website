import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET ??= 'test-jwt-secret-12345';
process.env.JWT_REFRESH_SECRET ??= 'test-jwt-refresh-secret';
process.env.SUPER_ADMIN_BOOTSTRAP_SECRET ??= 'test-bootstrap-secret-1234567890';
process.env.SUPER_ADMIN_JWT_SECRET ??= 'test-super-admin-jwt-secret-123456';
process.env.ODOO_DB ??= 'test-odoo-db';
process.env.ODOO_URL ??= 'http://localhost:8069';
process.env.ODOO_USERNAME ??= 'test-odoo-user@example.com';
process.env.ODOO_PASSWORD ??= 'test-odoo-password';
process.env.OPENAI_API_KEY ??= 'test-openai-key';
process.env.OPENAI_ORGANIZATION_ID ??= 'test-openai-org';
process.env.OPENAI_PROJECT_ID ??= 'test-openai-project';

const {
  createAttendanceProcessor,
  emitAttendanceSocketEvent,
  reassignUserToSingleCheckedInBranch,
  shouldPreserveInterimDutyPlanningSlotDelete,
} = await import('./webhook.service.js');

type ShiftRecord = {
  id: string;
  odoo_shift_id: number;
  branch_id: string;
  user_id: string | null;
  employee_name: string;
  employee_avatar_url: string | null;
  duty_type: string;
  duty_color: number;
  shift_start: string | Date;
  shift_end: string | Date;
  allocated_hours: number;
  total_worked_hours: number | null;
  pending_approvals: number;
  status: string;
  check_in_status: string | null;
  odoo_payload: string;
  created_at?: Date;
  updated_at?: Date;
};

function createShift(partial: Partial<ShiftRecord> & Pick<ShiftRecord, 'id' | 'odoo_shift_id' | 'branch_id'>): ShiftRecord {
  return {
    id: partial.id,
    odoo_shift_id: partial.odoo_shift_id,
    branch_id: partial.branch_id,
    user_id: partial.user_id ?? 'user-1',
    employee_name: partial.employee_name ?? '001 - Alex Crew',
    employee_avatar_url: partial.employee_avatar_url ?? null,
    duty_type: partial.duty_type ?? 'Dining',
    duty_color: partial.duty_color ?? 1,
    shift_start: partial.shift_start ?? '2026-03-20T09:00:00.000Z',
    shift_end: partial.shift_end ?? '2026-03-20T17:00:00.000Z',
    allocated_hours: partial.allocated_hours ?? 8,
    total_worked_hours: partial.total_worked_hours ?? null,
    pending_approvals: partial.pending_approvals ?? 0,
    status: partial.status ?? 'open',
    check_in_status: partial.check_in_status ?? null,
    odoo_payload: partial.odoo_payload ?? JSON.stringify({}),
    created_at: partial.created_at ?? new Date('2026-03-20T00:00:00.000Z'),
    updated_at: partial.updated_at ?? new Date('2026-03-20T00:00:00.000Z'),
  };
}

function hasPositiveOverlap(aStart: string | Date, aEnd: string | Date, bStart: string | Date, bEnd: string | Date): boolean {
  const latestStart = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const earliestEnd = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return latestStart < earliestEnd;
}

function createAttendanceHarness(options?: {
  shifts?: ShiftRecord[];
  websiteUserKey?: string | null;
  resolvedUserId?: string | null;
  resolvedEmployeeName?: string;
  userRolesByUserId?: Record<string, Array<{ id: string; name: string }>>;
  activeAttendancesByWebsiteKey?: Record<string, Array<{
    id: number;
    company_id: number;
    check_in: string;
  }>>;
  initialDisabledRoleIdsByUserId?: Record<string, string[]>;
}) {
  const tenantDb = { name: 'tenant-db' };
  const now = new Date('2026-03-21T12:00:00.000Z');
  const branches = [
    { id: 'branch-management', odoo_branch_id: '1', name: 'Management HQ' },
    { id: 'branch-service', odoo_branch_id: '2', name: 'Service Crew Hub' },
    { id: 'branch-main', odoo_branch_id: '12', name: 'Main Branch' },
    { id: 'branch-other', odoo_branch_id: '99', name: 'Other Branch' },
  ];
  const shifts = [...(options?.shifts ?? [])];
  const logs: Array<Record<string, unknown>> = [];
  const auths: Array<Record<string, unknown>> = [];
  const queuedJobs: Array<{ payload: Record<string, unknown>; runAt: Date }> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const socketEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const branchAssignments: Array<{ userId: string; branchId: string }> = [];
  const checkoutOps: Array<{ attendanceIds: number[]; checkOutTime: Date }> = [];

  const roleMembershipByUserId = new Map<string, Array<{ roleId: string; roleName: string }>>();
  const defaultResolvedUserId = options?.resolvedUserId ?? 'user-1';
  const configuredRoleMembership = options?.userRolesByUserId ?? {
    [defaultResolvedUserId]: [
      { id: 'role-management', name: 'Management' },
      { id: 'role-service-crew', name: 'Service Crew' },
    ],
  };
  for (const [userId, roles] of Object.entries(configuredRoleMembership)) {
    roleMembershipByUserId.set(
      userId,
      roles.map((role) => ({
        roleId: role.id,
        roleName: role.name,
      })),
    );
  }

  const disabledRoleIdsByUserId = new Map<string, Set<string>>();
  for (const [userId, roleIds] of Object.entries(options?.initialDisabledRoleIdsByUserId ?? {})) {
    disabledRoleIdsByUserId.set(userId, new Set(roleIds));
  }

  const activeAttendancesByWebsiteKey = new Map<string, Array<{
    id: number;
    company_id: number;
    check_in: string;
  }>>();
  for (const [websiteUserKey, attendances] of Object.entries(options?.activeAttendancesByWebsiteKey ?? {})) {
    activeAttendancesByWebsiteKey.set(websiteUserKey, attendances.map((attendance) => ({ ...attendance })));
  }

  let logCount = 0;
  let authCount = 0;
  let interimShiftCount = 0;

  return {
    branches,
    shifts,
    logs,
    auths,
    queuedJobs,
    notifications,
    socketEvents,
    branchAssignments,
    checkoutOps,
    roleMembershipByUserId,
    disabledRoleIdsByUserId,
    activeAttendancesByWebsiteKey,
    deps: {
      now: () => now,
      findBranchByOdooCompanyId: async (odooCompanyId: number) =>
        branches.find((branch) => branch.odoo_branch_id === String(odooCompanyId)) ?? null,
      findShiftByPlanningSlotId: async (planningSlotId: number, branchId: string) =>
        shifts.find((shift) => shift.odoo_shift_id === planningSlotId && shift.branch_id === branchId) ?? null,
      findShiftById: async (shiftId: string) =>
        shifts.find((shift) => shift.id === shiftId) ?? null,
      createShiftLog: async (input: Record<string, unknown>) => {
        const record = { id: `log-${++logCount}`, ...input };
        logs.push(record);
        return record;
      },
      updateShiftById: async (shiftId: string, updates: Record<string, unknown>) => {
        const shift = shifts.find((row) => row.id === shiftId) ?? null;
        if (!shift) return null;
        Object.assign(shift, updates);
        return shift;
      },
      incrementShiftPendingApprovals: async (shiftId: string) => {
        const shift = shifts.find((row) => row.id === shiftId) ?? null;
        if (!shift) return null;
        shift.pending_approvals += 1;
        return shift;
      },
      createShiftAuthorization: async (input: Record<string, unknown>) => {
        const record = { id: `auth-${++authCount}`, ...input };
        auths.push(record);
        return record;
      },
      upsertInterimShift: async (input: Record<string, unknown>) => {
        const odooShiftId = Number(input.odoo_shift_id);
        let shift = shifts.find((row) => row.odoo_shift_id === odooShiftId && row.branch_id === input.branch_id);
        if (!shift) {
          shift = createShift({
            id: `shift-interim-${++interimShiftCount}`,
            odoo_shift_id: odooShiftId,
            branch_id: String(input.branch_id),
            user_id: (input.user_id as string | null) ?? null,
            employee_name: String(input.employee_name),
            employee_avatar_url: (input.employee_avatar_url as string | null) ?? null,
            duty_type: String(input.duty_type),
            duty_color: Number(input.duty_color),
            shift_start: input.shift_start as string | Date,
            shift_end: input.shift_end as string | Date,
            allocated_hours: Number(input.allocated_hours),
            total_worked_hours: Number(input.total_worked_hours),
            pending_approvals: Number(input.pending_approvals ?? 0),
            status: String(input.status),
            check_in_status: (input.check_in_status as string | null) ?? null,
            odoo_payload: String(input.odoo_payload),
          });
          shifts.push(shift);
        } else {
          Object.assign(shift, input);
        }
        return shift;
      },
      reassignLogsToShift: async (attendanceId: number, shiftId: string) => {
        for (const log of logs) {
          if (log.odoo_attendance_id === attendanceId) {
            log.shift_id = shiftId;
          }
        }
      },
      findOverlappingShiftInOtherBranches: async (
        input: { userId: string | null; branchId: string; attendanceStart: Date; attendanceEnd: Date },
      ) => {
        if (!input.userId) return null;
        return shifts.find((shift) =>
          shift.user_id === input.userId
          && shift.branch_id !== input.branchId
          && hasPositiveOverlap(shift.shift_start, shift.shift_end, input.attendanceStart, input.attendanceEnd)
        ) ?? null;
      },
      resolveAttendanceIdentity: async (payload: Record<string, unknown>) => ({
        userId: options?.resolvedUserId ?? 'user-1',
        websiteUserKey: String(payload.x_website_key ?? options?.websiteUserKey ?? '').trim() || null,
        employeeName: options?.resolvedEmployeeName ?? String(payload.x_employee_contact_name ?? ''),
      }),
      listUserRoleMembership: async (userId: string) => roleMembershipByUserId.get(userId) ?? [],
      disableUserRole: async (userId: string, roleId: string) => {
        let disabled = disabledRoleIdsByUserId.get(userId);
        if (!disabled) {
          disabled = new Set<string>();
          disabledRoleIdsByUserId.set(userId, disabled);
        }
        disabled.add(roleId);
      },
      enableUserRole: async (userId: string, roleId: string) => {
        const disabled = disabledRoleIdsByUserId.get(userId);
        if (!disabled) return;
        disabled.delete(roleId);
      },
      clearUserDisabledRoles: async (userId: string) => {
        const disabled = disabledRoleIdsByUserId.get(userId);
        if (!disabled) return 0;
        const count = disabled.size;
        disabled.clear();
        return count;
      },
      listActiveAttendancesByWebsiteUserKey: async (websiteUserKey: string) =>
        (activeAttendancesByWebsiteKey.get(websiteUserKey) ?? []).map((attendance) => ({ ...attendance })),
      checkOutAttendancesByIds: async (attendanceIds: number[], checkOutTime: Date) => {
        checkoutOps.push({ attendanceIds: [...attendanceIds], checkOutTime });
        const attendanceIdsSet = new Set(attendanceIds);
        for (const [websiteUserKey, attendances] of activeAttendancesByWebsiteKey.entries()) {
          activeAttendancesByWebsiteKey.set(
            websiteUserKey,
            attendances.filter((attendance) => !attendanceIdsSet.has(attendance.id)),
          );
        }
      },
      reassignUserToSingleCheckedInBranch: async (userId: string, branchId: string) => {
        branchAssignments.push({ userId, branchId });
      },
      enqueueEarlyCheckInAuthJob: async (payload: Record<string, unknown>, runAt: Date) => {
        queuedJobs.push({ payload, runAt });
      },
      createAndDispatchNotification: async (input: Record<string, unknown>) => {
        notifications.push(input);
      },
      emitSocketEvent: (event: string, payload: Record<string, unknown>) => {
        socketEvents.push({ event, payload });
      },
    },
  };
}

test('reassignUserToSingleCheckedInBranch is exported and accepts (userId, branchId) arguments', () => {
  assert.equal(typeof reassignUserToSingleCheckedInBranch, 'function');
  assert.equal(reassignUserToSingleCheckedInBranch.length, 2);
});

test('shouldPreserveInterimDutyPlanningSlotDelete preserves rejected interim-duty history', () => {
  assert.equal(
    shouldPreserveInterimDutyPlanningSlotDelete(['rejected']),
    true,
  );
  assert.equal(
    shouldPreserveInterimDutyPlanningSlotDelete(['pending']),
    true,
  );
  assert.equal(
    shouldPreserveInterimDutyPlanningSlotDelete(['approved']),
    true,
  );
  assert.equal(
    shouldPreserveInterimDutyPlanningSlotDelete(['no_approval_needed']),
    false,
  );
  assert.equal(
    shouldPreserveInterimDutyPlanningSlotDelete([]),
    false,
  );
});

test('createAttendanceProcessor creates a synthetic interim-duty shift for unlinked attendance on checkout', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9001,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_employee_avatar: 'https://example.com/alex.png',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  await processAttendance({
    id: 9001,
    check_in: '2026-03-20 01:00:00',
    check_out: '2026-03-20 09:00:00',
    worked_hours: 8,
    x_company_id: 12,
    x_cumulative_minutes: 480,
    x_employee_contact_name: '001 - Alex Crew',
    x_employee_avatar: 'https://example.com/alex.png',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  const interimShift = harness.shifts.find((shift) => shift.odoo_shift_id === -9001);
  assert.ok(interimShift);
  assert.equal(interimShift?.duty_type, 'Interim Duty');
  assert.equal(interimShift?.user_id, 'user-1');
  assert.equal(interimShift?.status, 'ended');
  assert.equal(interimShift?.check_in_status, 'checked_out');
  assert.equal(interimShift?.allocated_hours, 8);
  assert.equal(interimShift?.total_worked_hours, 8);

  const interimPayload = JSON.parse(String(interimShift?.odoo_payload ?? '{}')) as Record<string, unknown>;
  assert.equal(interimPayload.interim_reason, 'no_planning_schedule');
  assert.equal(interimPayload.source_attendance_id, 9001);

  assert.equal(harness.logs.length, 2);
  assert.ok(harness.logs.every((log) => log.shift_id === interimShift?.id));
  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'interim_duty');
  assert.equal(harness.auths[0]?.status, 'pending');
  assert.equal(harness.auths[0]?.diff_minutes, 480);
  assert.equal(harness.auths[0]?.shift_id, interimShift?.id);
  assert.equal(interimShift?.pending_approvals, 1);
});

test('createAttendanceProcessor does not create interim duty for management attendances without a linked shift', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9009,
    check_in: '2026-03-20 01:00:00',
    check_out: '2026-03-20 09:00:00',
    worked_hours: 8,
    x_company_id: 1,
    x_cumulative_minutes: 480,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  const interimShift = harness.shifts.find((shift) => shift.odoo_shift_id === -9009);
  assert.equal(interimShift, undefined);
  assert.equal(harness.logs.length, 1);
  assert.equal(harness.logs[0]?.shift_id, null);
  assert.equal(harness.auths.length, 0);
});

test('createAttendanceProcessor restores the planned shift and reclassifies a fully pre-shift attendance as interim duty', async () => {
  const plannedShift = createShift({
    id: 'shift-100',
    odoo_shift_id: 100,
    branch_id: 'branch-main',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9002,
    check_in: '2026-03-20 07:00:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 100,
    x_website_key: 'website-user-1',
  });

  assert.equal(plannedShift.status, 'active');
  assert.equal(plannedShift.check_in_status, 'checked_in');
  assert.equal(harness.queuedJobs.length, 1);

  await processAttendance({
    id: 9002,
    check_in: '2026-03-20 07:00:00',
    check_out: '2026-03-20 08:00:00',
    worked_hours: 1,
    x_company_id: 12,
    x_cumulative_minutes: 60,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 100,
    x_website_key: 'website-user-1',
  });

  const interimShift = harness.shifts.find((shift) => shift.odoo_shift_id === -9002);
  assert.ok(interimShift);
  assert.equal(plannedShift.status, 'open');
  assert.equal(plannedShift.check_in_status, null);
  assert.equal(plannedShift.total_worked_hours, null);
  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'interim_duty');
  assert.equal(harness.auths[0]?.status, 'pending');
  assert.equal(harness.auths[0]?.shift_id, interimShift?.id);
  assert.equal(interimShift?.pending_approvals, 1);
  assert.ok(harness.logs.every((log) => log.shift_id === interimShift?.id));
});

test('createAttendanceProcessor skips tardiness creation when check-in occurs after the linked shift already ended', async () => {
  const plannedShift = createShift({
    id: 'shift-101',
    odoo_shift_id: 101,
    branch_id: 'branch-main',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9003,
    check_in: '2026-03-20 18:00:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 101,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.auths.length, 0);
  assert.equal(harness.queuedJobs.length, 0);
  assert.equal(plannedShift.status, 'open');
  assert.equal(plannedShift.check_in_status, null);
});

test('createAttendanceProcessor marks cross-branch coverage as scheduled_other_branch interim duty', async () => {
  const otherBranchShift = createShift({
    id: 'shift-other',
    odoo_shift_id: 200,
    branch_id: 'branch-other',
    user_id: 'user-1',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
  });
  const harness = createAttendanceHarness({
    shifts: [otherBranchShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9004,
    check_in: '2026-03-20 09:00:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  await processAttendance({
    id: 9004,
    check_in: '2026-03-20 09:00:00',
    check_out: '2026-03-20 17:00:00',
    worked_hours: 8,
    x_company_id: 12,
    x_cumulative_minutes: 480,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  const interimShift = harness.shifts.find((shift) => shift.odoo_shift_id === -9004);
  assert.ok(interimShift);

  const interimPayload = JSON.parse(String(interimShift?.odoo_payload ?? '{}')) as Record<string, unknown>;
  assert.equal(interimPayload.interim_reason, 'scheduled_other_branch');
  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'interim_duty');
  assert.equal(harness.auths[0]?.status, 'pending');
  assert.equal(harness.auths[0]?.shift_id, interimShift?.id);
});

test('createAttendanceProcessor keeps overlapping early check-ins on the normal authorization path', async () => {
  const plannedShift = createShift({
    id: 'shift-102',
    odoo_shift_id: 102,
    branch_id: 'branch-main',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9005,
    check_in: '2026-03-20 08:30:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 102,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.queuedJobs.length, 1);
  assert.equal(harness.auths.length, 0);
  assert.equal(plannedShift.status, 'active');
  assert.equal(plannedShift.check_in_status, 'checked_in');
});

test('createAttendanceProcessor keeps tardiness on the normal authorization path when attendance overlaps the shift', async () => {
  const plannedShift = createShift({
    id: 'shift-103',
    odoo_shift_id: 103,
    branch_id: 'branch-main',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9006,
    check_in: '2026-03-20 09:15:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 103,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'tardiness');
  assert.equal(harness.auths[0]?.status, 'pending');
});

test('createAttendanceProcessor keeps early check-out on the normal authorization path when attendance overlaps the shift', async () => {
  const plannedShift = createShift({
    id: 'shift-104',
    odoo_shift_id: 104,
    branch_id: 'branch-main',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9007,
    check_in: '2026-03-20 09:00:00',
    check_out: '2026-03-20 16:30:00',
    worked_hours: 7.5,
    x_company_id: 12,
    x_cumulative_minutes: 450,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 104,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'early_check_out');
  assert.equal(harness.auths[0]?.status, 'no_approval_needed');
});

test('createAttendanceProcessor keeps late check-out on the normal authorization path when attendance overlaps the shift', async () => {
  const plannedShift = createShift({
    id: 'shift-105',
    odoo_shift_id: 105,
    branch_id: 'branch-main',
    shift_start: '2026-03-20T09:00:00.000Z',
    shift_end: '2026-03-20T17:00:00.000Z',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9008,
    check_in: '2026-03-20 09:00:00',
    check_out: '2026-03-20 17:30:00',
    worked_hours: 8.5,
    x_company_id: 12,
    x_cumulative_minutes: 510,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 105,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'late_check_out');
  assert.equal(harness.auths[0]?.status, 'pending');
});

test('createAttendanceProcessor management check-in disables service crew and checks out every other active attendance', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    userRolesByUserId: {
      'user-1': [
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    activeAttendancesByWebsiteKey: {
      'website-user-1': [
        { id: 9101, company_id: 1, check_in: '2026-03-20 01:00:00' },
        { id: 9102, company_id: 2, check_in: '2026-03-20 00:30:00' },
        { id: 9103, company_id: 1, check_in: '2026-03-20 00:00:00' },
      ],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9101,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 1,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.checkoutOps.length, 1);
  assert.deepEqual(harness.checkoutOps[0]?.attendanceIds.sort((a, b) => a - b), [9102, 9103]);
  assert.equal(harness.checkoutOps[0]?.checkOutTime.toISOString(), '2026-03-20T01:00:00.000Z');

  const disabled = harness.disabledRoleIdsByUserId.get('user-1');
  assert.ok(disabled?.has('role-service-crew'));
  assert.equal(disabled?.has('role-management'), false);
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'));
});

test('createAttendanceProcessor service crew check-in disables management and checks out active management attendance only', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    userRolesByUserId: {
      'user-1': [
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    activeAttendancesByWebsiteKey: {
      'website-user-1': [
        { id: 9201, company_id: 2, check_in: '2026-03-20 01:00:00' },
        { id: 9202, company_id: 1, check_in: '2026-03-20 00:45:00' },
        { id: 9203, company_id: 3, check_in: '2026-03-20 00:30:00' },
      ],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9201,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 2,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.checkoutOps.length, 1);
  assert.deepEqual(harness.checkoutOps[0]?.attendanceIds, [9202]);

  const disabled = harness.disabledRoleIdsByUserId.get('user-1');
  assert.ok(disabled?.has('role-management'));
  assert.equal(disabled?.has('role-service-crew'), false);
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'));
});

test('createAttendanceProcessor skips role gating and auto-checkout for administrator users', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'admin-user',
    userRolesByUserId: {
      'admin-user': [
        { id: 'role-admin', name: 'Administrator' },
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    activeAttendancesByWebsiteKey: {
      'website-user-1': [
        { id: 9301, company_id: 1, check_in: '2026-03-20 01:00:00' },
        { id: 9302, company_id: 2, check_in: '2026-03-20 00:45:00' },
      ],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9301,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 1,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.checkoutOps.length, 0);
  const disabled = harness.disabledRoleIdsByUserId.get('admin-user');
  assert.equal(disabled?.size ?? 0, 0);
  assert.equal(harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'), false);
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:check-in-status-updated'));
});

test('createAttendanceProcessor skips role gating and auto-checkout when user lacks required role for the check-in type', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-no-management',
    userRolesByUserId: {
      'user-no-management': [
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    activeAttendancesByWebsiteKey: {
      'website-user-1': [
        { id: 9401, company_id: 1, check_in: '2026-03-20 01:00:00' },
        { id: 9402, company_id: 2, check_in: '2026-03-20 00:45:00' },
      ],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9401,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 1,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.checkoutOps.length, 0);
  assert.equal(harness.disabledRoleIdsByUserId.get('user-no-management')?.size ?? 0, 0);
  assert.equal(harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'), false);
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:check-in-status-updated'));
});

test('createAttendanceProcessor checkout re-enables all temporarily disabled roles when no active attendance remains', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    userRolesByUserId: {
      'user-1': [
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    initialDisabledRoleIdsByUserId: {
      'user-1': ['role-management', 'role-service-crew'],
    },
    activeAttendancesByWebsiteKey: {
      'website-user-1': [],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9501,
    check_in: '2026-03-20 01:00:00',
    check_out: '2026-03-20 09:00:00',
    worked_hours: 8,
    x_company_id: 2,
    x_cumulative_minutes: 480,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.disabledRoleIdsByUserId.get('user-1')?.size ?? 0, 0);
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'));
});

test('createAttendanceProcessor persists resolved website key on shift logs when webhook payload omits x_website_key', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9601,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 2,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
  });

  assert.equal(harness.logs.length, 1);
  const savedPayload = JSON.parse(String(harness.logs[0]?.odoo_payload ?? '{}')) as { x_website_key?: string };
  assert.equal(savedPayload.x_website_key, 'website-user-1');
});

function createSocketEmitHarness() {
  const emits: Array<{
    namespace: string;
    room: string;
    event: string;
    payload: Record<string, unknown>;
  }> = [];

  const io = {
    of(namespace: string) {
      return {
        to(room: string) {
          return {
            emit(event: string, payload: Record<string, unknown>) {
              emits.push({ namespace, room, event, payload });
            },
          };
        },
      };
    },
  };

  return { io, emits };
}

test('emitAttendanceSocketEvent routes auth scope updates to /user-events namespace', () => {
  const harness = createSocketEmitHarness();

  emitAttendanceSocketEvent(harness.io, 'user:auth-scope-updated', {
    userId: 'user-1',
  });

  assert.equal(harness.emits.length, 1);
  assert.deepEqual(harness.emits[0], {
    namespace: '/user-events',
    room: 'user:user-1',
    event: 'user:auth-scope-updated',
    payload: { userId: 'user-1' },
  });
});

test('emitAttendanceSocketEvent routes branch assignment updates to /user-events namespace', () => {
  const harness = createSocketEmitHarness();

  emitAttendanceSocketEvent(harness.io, 'user:branch-assignments-updated', {
    userId: 'user-2',
    branchIds: ['branch-a', 'branch-b'],
  });

  assert.equal(harness.emits.length, 1);
  assert.deepEqual(harness.emits[0], {
    namespace: '/user-events',
    room: 'user:user-2',
    event: 'user:branch-assignments-updated',
    payload: { branchIds: ['branch-a', 'branch-b'] },
  });
});

test('emitAttendanceSocketEvent routes shift events to /employee-shifts namespace', () => {
  const harness = createSocketEmitHarness();
  const eventPayload = {
    branch_id: 'branch-main',
    shift_id: 'shift-1',
  };

  emitAttendanceSocketEvent(harness.io, 'shift:updated', eventPayload);

  assert.equal(harness.emits.length, 1);
  assert.deepEqual(harness.emits[0], {
    namespace: '/employee-shifts',
    room: 'branch:branch-main',
    event: 'shift:updated',
    payload: eventPayload,
  });
});

// ---------------------------------------------------------------------------
// Regression: dual-role user check-in permission gating
// Verifies the exact socket event and room that the frontend relies on to
// trigger a JWT refresh after role-scope changes.
// ---------------------------------------------------------------------------

test('service crew check-in emits user:auth-scope-updated to /user-events/user:<id> with correct userId', async () => {
  // This is the exact event the frontend TopBar listens to in order to refresh
  // the JWT. If the namespace, room, or userId payload is wrong, the token
  // refresh never fires and Management permissions remain active.
  const harness = createAttendanceHarness({
    websiteUserKey: 'wk-dual',
    resolvedUserId: 'user-dual',
    userRolesByUserId: {
      'user-dual': [
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    activeAttendancesByWebsiteKey: {
      'wk-dual': [
        { id: 7001, company_id: 2, check_in: '2026-03-20 09:00:00' },
      ],
    },
  });

  // Override emitSocketEvent to record the actual namespace/room/event as
  // emitAttendanceSocketEvent would route them.
  const socketHarness = createSocketEmitHarness();
  const deps = {
    ...harness.deps,
    emitSocketEvent: (event: string, payload: Record<string, unknown>) => {
      emitAttendanceSocketEvent(socketHarness.io, event, payload);
      harness.deps.emitSocketEvent(event, payload);
    },
  };

  const processAttendance = createAttendanceProcessor(deps as any);

  await processAttendance({
    id: 7001,
    check_in: '2026-03-20 09:00:00',
    x_company_id: 2, // Service Crew company
    x_cumulative_minutes: 0,
    x_employee_contact_name: '002 - Bob Crew',
    x_planning_slot_id: false,
    x_website_key: 'wk-dual',
  });

  // Management role must be disabled
  const disabled = harness.disabledRoleIdsByUserId.get('user-dual');
  assert.ok(disabled?.has('role-management'), 'Management role must be in user_role_disables');
  assert.equal(disabled?.has('role-service-crew'), false, 'Service Crew role must NOT be disabled');

  // user:auth-scope-updated must be emitted to the correct namespace and room
  const authScopeEmit = socketHarness.emits.find((e) => e.event === 'user:auth-scope-updated');
  assert.ok(authScopeEmit, 'user:auth-scope-updated must be emitted');
  assert.equal(authScopeEmit?.namespace, '/user-events', 'must target /user-events namespace');
  assert.equal(authScopeEmit?.room, 'user:user-dual', 'must target user:<id> room');
  assert.deepEqual(authScopeEmit?.payload, { userId: 'user-dual' }, 'payload must contain userId');
});

test('management check-in emits user:auth-scope-updated to /user-events/user:<id> with correct userId', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'wk-dual-mgmt',
    resolvedUserId: 'user-dual-mgmt',
    userRolesByUserId: {
      'user-dual-mgmt': [
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    activeAttendancesByWebsiteKey: {
      'wk-dual-mgmt': [
        { id: 8001, company_id: 1, check_in: '2026-03-20 09:00:00' },
      ],
    },
  });

  const socketHarness = createSocketEmitHarness();
  const deps = {
    ...harness.deps,
    emitSocketEvent: (event: string, payload: Record<string, unknown>) => {
      emitAttendanceSocketEvent(socketHarness.io, event, payload);
      harness.deps.emitSocketEvent(event, payload);
    },
  };

  const processAttendance = createAttendanceProcessor(deps as any);

  await processAttendance({
    id: 8001,
    check_in: '2026-03-20 09:00:00',
    x_company_id: 1, // Management company
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alice Manager',
    x_planning_slot_id: false,
    x_website_key: 'wk-dual-mgmt',
  });

  // Service Crew role must be disabled
  const disabled = harness.disabledRoleIdsByUserId.get('user-dual-mgmt');
  assert.ok(disabled?.has('role-service-crew'), 'Service Crew role must be in user_role_disables');
  assert.equal(disabled?.has('role-management'), false, 'Management role must NOT be disabled');

  // user:auth-scope-updated must be emitted to the correct namespace and room
  const authScopeEmit = socketHarness.emits.find((e) => e.event === 'user:auth-scope-updated');
  assert.ok(authScopeEmit, 'user:auth-scope-updated must be emitted');
  assert.equal(authScopeEmit?.namespace, '/user-events', 'must target /user-events namespace');
  assert.equal(authScopeEmit?.room, 'user:user-dual-mgmt', 'must target user:<id> room');
  assert.deepEqual(authScopeEmit?.payload, { userId: 'user-dual-mgmt' }, 'payload must contain userId');
});
