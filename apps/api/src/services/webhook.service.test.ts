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

const { db } = await import('../config/database.js');
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

type ShiftActivityRecord = {
  id: string;
  user_id: string;
  shift_id: string;
  activity_type: 'break' | 'field_task';
  start_time: string | Date;
  end_time: string | Date | null;
  duration_minutes: number | null;
  activity_details: string | null;
  is_calculated: boolean;
  created_at?: Date;
  updated_at?: Date;
};

type WorkEntryRecord = {
  id: number;
  employee_id: number;
  date: string;
  work_entry_type_id: number;
  duration: number;
  name: string;
};

type HarnessShape = ReturnType<typeof createAttendanceHarness>;

function createShift(
  partial: Partial<ShiftRecord> & Pick<ShiftRecord, 'id' | 'odoo_shift_id' | 'branch_id'>,
): ShiftRecord {
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

function hasPositiveOverlap(
  aStart: string | Date,
  aEnd: string | Date,
  bStart: string | Date,
  bEnd: string | Date,
): boolean {
  const latestStart = Math.max(new Date(aStart).getTime(), new Date(bStart).getTime());
  const earliestEnd = Math.min(new Date(aEnd).getTime(), new Date(bEnd).getTime());
  return latestStart < earliestEnd;
}

function parseActivityDetails(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function createActivity(
  partial: Partial<ShiftActivityRecord> &
    Pick<ShiftActivityRecord, 'id' | 'user_id' | 'shift_id' | 'activity_type'>,
): ShiftActivityRecord {
  return {
    id: partial.id,
    user_id: partial.user_id,
    shift_id: partial.shift_id,
    activity_type: partial.activity_type,
    start_time: partial.start_time ?? '2026-03-20T00:30:00.000Z',
    end_time: partial.end_time ?? null,
    duration_minutes: partial.duration_minutes ?? null,
    activity_details: partial.activity_details ?? null,
    is_calculated: partial.is_calculated ?? false,
    created_at: partial.created_at ?? new Date('2026-03-20T00:30:00.000Z'),
    updated_at: partial.updated_at ?? new Date('2026-03-20T00:30:00.000Z'),
  };
}

function createAttendanceHarness(options?: {
  shifts?: ShiftRecord[];
  logs?: Array<Record<string, unknown>>;
  activities?: ShiftActivityRecord[];
  workEntries?: WorkEntryRecord[];
  websiteUserKey?: string | null;
  resolvedUserId?: string | null;
  resolvedEmployeeName?: string;
  odooEmployee?: { id: number; name: string } | null;
  setBreakWorkEntryDurationError?: Error;
  userRolesByUserId?: Record<string, Array<{ id: string; name: string }>>;
  activeAttendancesByWebsiteKey?: Record<
    string,
    Array<{
      id: number;
      company_id: number;
      check_in: string;
    }>
  >;
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
  const logs: Array<Record<string, unknown>> = [...(options?.logs ?? [])];
  const activities = [...(options?.activities ?? [])];
  const workEntries = [...(options?.workEntries ?? [])];
  const auths: Array<Record<string, unknown>> = [];
  const queuedJobs: Array<{ payload: Record<string, unknown>; runAt: Date }> = [];
  const peerEvaluationJobs: Array<Record<string, unknown>> = [];
  const notifications: Array<Record<string, unknown>> = [];
  const socketEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
  const branchAssignments: Array<{ userId: string; branchId: string }> = [];
  const checkoutOps: Array<{ attendanceIds: number[]; checkOutTime: Date }> = [];
  const users =
    options?.websiteUserKey && (options?.resolvedUserId ?? 'user-1')
      ? [{ id: options?.resolvedUserId ?? 'user-1', user_key: options.websiteUserKey }]
      : [];
  const breakWorkEntryAttempts: Array<{
    employeeId: number;
    date: string;
    durationMinutes: number;
    workEntryTypeId: number;
    description: string;
  }> = [];
  const breakWorkEntryOps: Array<{
    action: 'created' | 'updated';
    workEntryId: number;
    employeeId: number;
    date: string;
    durationMinutes: number;
    totalDurationHours: number;
  }> = [];

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

  const activeAttendancesByWebsiteKey = new Map<
    string,
    Array<{
      id: number;
      company_id: number;
      check_in: string;
    }>
  >();
  for (const [websiteUserKey, attendances] of Object.entries(
    options?.activeAttendancesByWebsiteKey ?? {},
  )) {
    activeAttendancesByWebsiteKey.set(
      websiteUserKey,
      attendances.map((attendance) => ({ ...attendance })),
    );
  }

  let logCount = 0;
  let authCount = 0;
  let activityCount = activities.length;
  let interimShiftCount = 0;
  let workEntryCount = workEntries.reduce((max, entry) => Math.max(max, entry.id), 0);
  const defaultOdooEmployee =
    options?.odooEmployee === undefined ? { id: 7001, name: '001 - Alex Crew' } : options.odooEmployee;

  return {
    branches,
    shifts,
    logs,
    activities,
    workEntries,
    auths,
    queuedJobs,
    peerEvaluationJobs,
    notifications,
    socketEvents,
    branchAssignments,
    checkoutOps,
    users,
    breakWorkEntryAttempts,
    breakWorkEntryOps,
    roleMembershipByUserId,
    disabledRoleIdsByUserId,
    activeAttendancesByWebsiteKey,
    deps: {
      now: () => now,
      findBranchByOdooCompanyId: async (odooCompanyId: number) =>
        branches.find((branch) => branch.odoo_branch_id === String(odooCompanyId)) ?? null,
      findShiftByPlanningSlotId: async (planningSlotId: number, branchId: string) =>
        shifts.find(
          (shift) => shift.odoo_shift_id === planningSlotId && shift.branch_id === branchId,
        ) ?? null,
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
        let shift = shifts.find(
          (row) => row.odoo_shift_id === odooShiftId && row.branch_id === input.branch_id,
        );
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
      findOverlappingShiftInOtherBranches: async (input: {
        userId: string | null;
        branchId: string;
        attendanceStart: Date;
        attendanceEnd: Date;
      }) => {
        if (!input.userId) return null;
        return (
          shifts.find(
            (shift) =>
              shift.user_id === input.userId &&
              shift.branch_id !== input.branchId &&
              hasPositiveOverlap(
                shift.shift_start,
                shift.shift_end,
                input.attendanceStart,
                input.attendanceEnd,
              ),
          ) ?? null
        );
      },
      resolveAttendanceIdentity: async (payload: Record<string, unknown>) => ({
        userId: options?.resolvedUserId ?? 'user-1',
        websiteUserKey:
          String(payload.x_website_key ?? options?.websiteUserKey ?? '').trim() || null,
        employeeName:
          options?.resolvedEmployeeName ?? String(payload.x_employee_contact_name ?? ''),
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
        (activeAttendancesByWebsiteKey.get(websiteUserKey) ?? []).map((attendance) => ({
          ...attendance,
        })),
      findExistingCheckOutLog: async (attendanceId: number) =>
        (logs.find(
          (log) => log.odoo_attendance_id === attendanceId && log.log_type === 'check_out',
        ) ?? null) as Record<string, unknown> | null,
      findLatestCheckInLog: async (attendanceId: number) =>
        ([...logs]
          .reverse()
          .find(
            (log) => log.odoo_attendance_id === attendanceId && log.log_type === 'check_in',
          ) ?? null) as Record<string, unknown> | null,
      findOpenShiftActivity: async (shiftId: string, userId: string) =>
        (activities.find(
          (activity) =>
            activity.shift_id === shiftId && activity.user_id === userId && activity.end_time == null,
        ) ?? null) as ShiftActivityRecord | null,
      startShiftActivity: async (input: Record<string, unknown>) => {
        const shift = shifts.find((row) => row.id === input.shiftId);
        assert.ok(shift, `shift ${String(input.shiftId)} must exist before starting an activity`);
        const startedAt = (input.occurredAt as Date | undefined) ?? now;
        const activity = createActivity({
          id: `activity-${++activityCount}`,
          user_id: String(input.userId),
          shift_id: String(input.shiftId),
          activity_type: input.activityType as 'break' | 'field_task',
          start_time: startedAt,
          activity_details: input.details ? JSON.stringify(input.details) : null,
        });
        activities.push(activity);

        const logType = activity.activity_type === 'break' ? 'break_start' : 'field_task_start';
        const log = {
          id: `log-${++logCount}`,
          company_id: 'company-1',
          shift_id: activity.shift_id,
          branch_id: shift.branch_id,
          log_type: logType,
          changes: JSON.stringify({ activity_id: activity.id, details: input.details ?? null }),
          event_time: startedAt,
          odoo_payload: JSON.stringify({}),
        };
        logs.push(log);
        return { activity, log };
      },
      listOpenManagementInterruptBreaks: async (userId: string, managementAttendanceId: number) =>
        activities.filter((activity) => {
          if (activity.user_id !== userId || activity.activity_type !== 'break' || activity.end_time != null) {
            return false;
          }
          const details = parseActivityDetails(activity.activity_details);
          return (
            details.source === 'management_interrupt' &&
            Number(details.management_attendance_id ?? 0) === managementAttendanceId
          );
        }),
      endShiftActivity: async (input: Record<string, unknown>) => {
        const activity = activities.find(
          (row) =>
            row.id === input.activityId &&
            row.shift_id === input.shiftId &&
            row.user_id === input.userId &&
            row.end_time == null,
        );
        assert.ok(activity, `activity ${String(input.activityId)} must exist before ending`);
        const endedAt = (input.endedAt as Date | undefined) ?? now;
        const durationMinutes = Math.max(
          0,
          Math.round((endedAt.getTime() - new Date(activity.start_time).getTime()) / 60000),
        );
        activity.end_time = endedAt;
        activity.duration_minutes = durationMinutes;

        const shift = shifts.find((row) => row.id === activity.shift_id);
        assert.ok(shift, `shift ${activity.shift_id} must exist before ending an activity`);
        const logType = activity.activity_type === 'break' ? 'break_end' : 'field_task_end';
        const log = {
          id: `log-${++logCount}`,
          company_id: 'company-1',
          shift_id: activity.shift_id,
          branch_id: shift.branch_id,
          log_type: logType,
          changes: JSON.stringify({ activity_id: activity.id, duration_minutes: durationMinutes }),
          event_time: endedAt,
          odoo_payload: JSON.stringify({}),
        };
        logs.push(log);
        return { activity, log };
      },
      listOpenShiftActivitiesByShiftId: async (shiftId: string) =>
        activities.filter((activity) => activity.shift_id === shiftId && activity.end_time == null),
      listEndedBreakActivitiesByShiftId: async (shiftId: string) =>
        activities.filter(
          (activity) =>
            activity.shift_id === shiftId &&
            activity.activity_type === 'break' &&
            activity.end_time != null,
        ),
      autoEndShiftActivityOnCheckOut: async (input: Record<string, unknown>) => {
        const activity = activities.find(
          (row) => row.id === input.activityId && row.shift_id === input.shiftId && row.end_time == null,
        );
        assert.ok(activity, `activity ${String(input.activityId)} must exist before auto-ending`);
        const endedAt = (input.endedAt as Date | undefined) ?? now;
        const durationMinutes = Math.max(
          0,
          Math.round((endedAt.getTime() - new Date(activity.start_time).getTime()) / 60000),
        );
        activity.end_time = endedAt;
        activity.duration_minutes = durationMinutes;

        const logType = activity.activity_type === 'break' ? 'break_end' : 'field_task_end';
        const log = {
          id: `log-${++logCount}`,
          company_id: String(input.companyId ?? 'company-1'),
          shift_id: activity.shift_id,
          branch_id: String(input.branchId),
          log_type: logType,
          changes: JSON.stringify({
            activity_id: activity.id,
            duration_minutes: durationMinutes,
            note: 'Auto-ended on check-out',
          }),
          event_time: endedAt,
          odoo_payload: JSON.stringify({}),
        };
        logs.push(log);
        return { activity, log };
      },
      listEndedUncalculatedBreakActivities: async (shiftId: string) =>
        activities.filter(
          (activity) =>
            activity.shift_id === shiftId &&
            activity.activity_type === 'break' &&
            activity.end_time != null &&
            !activity.is_calculated,
        ),
      markShiftActivitiesCalculated: async (activityIds: string[]) => {
        const targetIds = new Set(activityIds);
        let updatedCount = 0;

        for (const activity of activities) {
          if (
            targetIds.has(activity.id) &&
            activity.activity_type === 'break' &&
            activity.end_time != null &&
            !activity.is_calculated
          ) {
            activity.is_calculated = true;
            updatedCount += 1;
          }
        }

        return updatedCount;
      },
      getTotalEndedBreakMinutesByUserAndDate: async (input: { userId: string; date: string }) =>
        shifts
          .filter(
            (shift) =>
              shift.user_id === input.userId &&
              new Date(shift.shift_start).toISOString().split('T')[0] === input.date,
          )
          .map((shift) => shift.id)
          .reduce((sum, shiftId) => {
            const shiftBreakMinutes = activities
              .filter(
                (activity) =>
                  activity.shift_id === shiftId &&
                  activity.activity_type === 'break' &&
                  activity.end_time != null,
              )
              .reduce((activitySum, activity) => activitySum + (Number(activity.duration_minutes) || 0), 0);
            return sum + shiftBreakMinutes;
          }, 0),
      findOdooEmployeeByWebsiteUserKey: async (websiteUserKey: string) =>
        websiteUserKey && defaultOdooEmployee ? { ...defaultOdooEmployee } : null,
      setBreakWorkEntryDuration: async (input: Record<string, unknown>) => {
        const employeeId = Number(input.employeeId);
        const date = String(input.date);
        const durationMinutes = Number(input.durationMinutes);
        const workEntryTypeId = Number(input.workEntryTypeId ?? 129);
        const description = String(input.description ?? 'Break - Synced from Omnilert');

        breakWorkEntryAttempts.push({
          employeeId,
          date,
          durationMinutes,
          workEntryTypeId,
          description,
        });

        if (options?.setBreakWorkEntryDurationError) {
          throw options.setBreakWorkEntryDurationError;
        }

        const durationHours = durationMinutes / 60;
        const existingEntry = workEntries.find(
          (entry) =>
            entry.employee_id === employeeId &&
            entry.date === date &&
            entry.work_entry_type_id === workEntryTypeId,
        );

        if (existingEntry) {
          existingEntry.duration = durationHours;
          existingEntry.name = description;
          breakWorkEntryOps.push({
            action: 'updated',
            workEntryId: existingEntry.id,
            employeeId,
            date,
            durationMinutes,
            totalDurationHours: existingEntry.duration,
          });
          return { id: existingEntry.id, action: 'updated', durationHours: existingEntry.duration };
        }

        const createdEntry: WorkEntryRecord = {
          id: ++workEntryCount,
          employee_id: employeeId,
          date,
          work_entry_type_id: workEntryTypeId,
          duration: durationHours,
          name: description,
        };
        workEntries.push(createdEntry);
        breakWorkEntryOps.push({
          action: 'created',
          workEntryId: createdEntry.id,
          employeeId,
          date,
          durationMinutes,
          totalDurationHours: createdEntry.duration,
        });
        return { id: createdEntry.id, action: 'created', durationHours: createdEntry.duration };
      },
      deleteEarlyCheckOutAuthByShiftLogId: async (shiftLogId: string) => {
        const idx = auths.findIndex(
          (a) => a.shift_log_id === shiftLogId && a.auth_type === 'early_check_out',
        );
        if (idx === -1) return false;
        const [deletedAuth] = auths.splice(idx, 1);
        if (deletedAuth?.status === 'pending' && typeof deletedAuth.shift_id === 'string') {
          const shift = shifts.find((row) => row.id === deletedAuth.shift_id);
          if (shift) {
            shift.pending_approvals = Math.max(0, Number(shift.pending_approvals ?? 0) - 1);
          }
        }
        return true;
      },
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
      enqueuePeerEvaluationJob: async (payload: Record<string, unknown>) => {
        peerEvaluationJobs.push(payload);
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

function createHarnessTenantDb(harness: HarnessShape) {
  const getTableRows = (tableName: string): Array<Record<string, unknown>> => {
    switch (tableName) {
      case 'employee_shifts':
        return harness.shifts as Array<Record<string, unknown>>;
      case 'shift_activities':
        return harness.activities as Array<Record<string, unknown>>;
      case 'shift_logs':
        return harness.logs;
      case 'users':
        return harness.users as Array<Record<string, unknown>>;
      case 'shift_authorizations':
        return harness.auths;
      default:
        return [];
    }
  };

  const createQuery = (tableName: string) => {
    const rows = getTableRows(tableName);
    const predicates: Array<(row: Record<string, unknown>) => boolean> = [];
    let selectedFields: string[] | null = null;
    let orderByField: string | null = null;
    let orderDirection: 'asc' | 'desc' = 'asc';

    const getMatchedRows = () => {
      const matched = rows.filter((row) => predicates.every((predicate) => predicate(row)));
      if (!orderByField) return matched;

      return [...matched].sort((left, right) => {
        const leftValue = left[orderByField!];
        const rightValue = right[orderByField!];
        if (leftValue === rightValue) return 0;
        if (leftValue == null) return orderDirection === 'asc' ? -1 : 1;
        if (rightValue == null) return orderDirection === 'asc' ? 1 : -1;
        return leftValue < rightValue
          ? orderDirection === 'asc'
            ? -1
            : 1
          : orderDirection === 'asc'
            ? 1
            : -1;
      });
    };

    const applySelection = (matchedRows: Array<Record<string, unknown>>) => {
      if (!selectedFields) return matchedRows;
      return matchedRows.map((row) => {
        const selected: Record<string, unknown> = {};
        for (const field of selectedFields ?? []) {
          selected[field] = row[field];
        }
        return selected;
      });
    };

    const query: Record<string, any> = {
      where(condition: Record<string, unknown>) {
        predicates.push((row) =>
          Object.entries(condition).every(([key, value]) => row[key] === value),
        );
        return query;
      },
      whereNotNull(field: string) {
        predicates.push((row) => row[field] != null);
        return query;
      },
      whereNull(field: string) {
        predicates.push((row) => row[field] == null);
        return query;
      },
      select(...fields: string[]) {
        selectedFields = fields.flat();
        return query;
      },
      orderBy(field: string, direction: 'asc' | 'desc' = 'asc') {
        orderByField = field;
        orderDirection = direction;
        return query;
      },
      first() {
        const matchedRows = getMatchedRows();
        const selectedRows = applySelection(matchedRows);
        return Promise.resolve(selectedRows[0] ?? null);
      },
      insert(input: Record<string, unknown> | Array<Record<string, unknown>>) {
        const inserted = (Array.isArray(input) ? input : [input]).map((row) => ({ ...row }));
        rows.push(...inserted);
        return {
          returning: async () => inserted,
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(inserted).then(resolve, reject),
        };
      },
      update(updates: Record<string, unknown>) {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          Object.assign(row, updates);
        }
        return {
          returning: async () => matchedRows,
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve(matchedRows.length).then(resolve, reject),
        };
      },
      increment(column: string, amount = 1) {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          const currentValue = Number(row[column] ?? 0);
          row[column] = currentValue + amount;
        }
        return Promise.resolve(matchedRows.length);
      },
      decrement(column: string, amount = 1) {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          const currentValue = Number(row[column] ?? 0);
          row[column] = currentValue - amount;
        }
        return Promise.resolve(matchedRows.length);
      },
      delete() {
        const matchedRows = getMatchedRows();
        for (const row of matchedRows) {
          const index = rows.indexOf(row);
          if (index >= 0) rows.splice(index, 1);
        }
        return Promise.resolve(matchedRows.length);
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(applySelection(getMatchedRows())).then(resolve, reject);
      },
    };

    return query;
  };

  return ((tableName: string) => createQuery(tableName)) as any;
}

function installHarnessDb(harness: HarnessShape, registerCleanup: (cleanup: () => void) => void) {
  const originalGetDb = db.getDb.bind(db);
  (db as any).getDb = () => createHarnessTenantDb(harness);
  registerCleanup(() => {
    (db as any).getDb = originalGetDb;
  });
}

test('reassignUserToSingleCheckedInBranch is exported and accepts (userId, branchId) arguments', () => {
  assert.equal(typeof reassignUserToSingleCheckedInBranch, 'function');
  assert.equal(reassignUserToSingleCheckedInBranch.length, 2);
});

test('shouldPreserveInterimDutyPlanningSlotDelete preserves rejected interim-duty history', () => {
  assert.equal(shouldPreserveInterimDutyPlanningSlotDelete(['rejected']), true);
  assert.equal(shouldPreserveInterimDutyPlanningSlotDelete(['pending']), true);
  assert.equal(shouldPreserveInterimDutyPlanningSlotDelete(['approved']), true);
  assert.equal(shouldPreserveInterimDutyPlanningSlotDelete(['no_approval_needed']), false);
  assert.equal(shouldPreserveInterimDutyPlanningSlotDelete([]), false);
});

test('createAttendanceProcessor creates a synthetic interim-duty shift for unlinked attendance on checkout', async (t) => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
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

  const interimPayload = JSON.parse(String(interimShift?.odoo_payload ?? '{}')) as Record<
    string,
    unknown
  >;
  assert.equal(interimPayload.interim_reason, 'no_planning_schedule');
  assert.equal(interimPayload.source_attendance_id, 9001);

  assert.ok(harness.logs.length >= 2);
  assert.ok(harness.logs.every((log) => log.shift_id === interimShift?.id));
  assert.equal(harness.auths.length, 1);
  assert.equal(harness.auths[0]?.auth_type, 'interim_duty');
  assert.equal(harness.auths[0]?.status, 'pending');
  assert.equal(harness.auths[0]?.diff_minutes, 480);
  assert.equal(harness.auths[0]?.needs_employee_reason, true);
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

test('createAttendanceProcessor restores the planned shift and reclassifies a fully pre-shift attendance as interim duty', async (t) => {
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
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
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
  assert.equal(harness.auths[0]?.needs_employee_reason, true);
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

  const interimPayload = JSON.parse(String(interimShift?.odoo_payload ?? '{}')) as Record<
    string,
    unknown
  >;
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
  assert.equal(harness.auths[0]?.status, 'pending');
  assert.equal(harness.auths[0]?.needs_employee_reason, true);
  assert.equal(plannedShift.pending_approvals, 1);
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

test('createAttendanceProcessor management check-in starts a break for mapped service crew attendance and only checks out non-service-crew attendances', async () => {
  const serviceShift = createShift({
    id: 'shift-service-break',
    odoo_shift_id: 91020,
    branch_id: 'branch-service',
    user_id: 'user-1',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [serviceShift],
    logs: [
      {
        id: 'log-service-check-in',
        shift_id: serviceShift.id,
        branch_id: serviceShift.branch_id,
        log_type: 'check_in',
        odoo_attendance_id: 9102,
        event_time: new Date('2026-03-20T00:30:00.000Z'),
        odoo_payload: JSON.stringify({}),
      },
    ],
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
  assert.deepEqual(harness.checkoutOps[0]?.attendanceIds, [9103]);
  assert.equal(harness.checkoutOps[0]?.checkOutTime.toISOString(), '2026-03-20T01:00:00.000Z');
  assert.equal(harness.activities.length, 1);
  assert.equal(harness.activities[0]?.activity_type, 'break');
  assert.equal(harness.activities[0]?.shift_id, serviceShift.id);
  const details = parseActivityDetails(harness.activities[0]?.activity_details ?? null);
  assert.equal(details.source, 'management_interrupt');
  assert.equal(details.management_attendance_id, 9101);
  assert.equal(details.interrupted_attendance_id, 9102);
  const breakStartLog = harness.logs.find((log) => log.log_type === 'break_start');
  assert.ok(breakStartLog, 'break_start log should be created for the interrupted service crew shift');
  assert.equal(breakStartLog?.shift_id, serviceShift.id);
  assert.equal(
    new Date(breakStartLog?.event_time as string | Date).toISOString(),
    '2026-03-20T01:00:00.000Z',
  );

  const disabled = harness.disabledRoleIdsByUserId.get('user-1');
  assert.ok(disabled?.has('role-service-crew'));
  assert.equal(disabled?.has('role-management'), false);
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'));
});

test('createAttendanceProcessor management check-in falls back to checkout when the interrupted service crew attendance is unmapped', async () => {
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
        { id: 9111, company_id: 1, check_in: '2026-03-20 01:00:00' },
        { id: 9112, company_id: 2, check_in: '2026-03-20 00:30:00' },
      ],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9111,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 1,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.activities.length, 0);
  assert.equal(harness.checkoutOps.length, 1);
  assert.deepEqual(harness.checkoutOps[0]?.attendanceIds, [9112]);
});

test('createAttendanceProcessor management check-in falls back to checkout when the interrupted service crew shift already has an open activity', async () => {
  const serviceShift = createShift({
    id: 'shift-service-open-activity',
    odoo_shift_id: 91220,
    branch_id: 'branch-service',
    user_id: 'user-1',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [serviceShift],
    logs: [
      {
        id: 'log-service-check-in-open-activity',
        shift_id: serviceShift.id,
        branch_id: serviceShift.branch_id,
        log_type: 'check_in',
        odoo_attendance_id: 9122,
        event_time: new Date('2026-03-20T00:30:00.000Z'),
        odoo_payload: JSON.stringify({}),
      },
    ],
    activities: [
      createActivity({
        id: 'activity-field-task-open',
        user_id: 'user-1',
        shift_id: serviceShift.id,
        activity_type: 'field_task',
        start_time: '2026-03-20T00:45:00.000Z',
      }),
    ],
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
        { id: 9121, company_id: 1, check_in: '2026-03-20 01:00:00' },
        { id: 9122, company_id: 2, check_in: '2026-03-20 00:30:00' },
      ],
    },
  });
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9121,
    check_in: '2026-03-20 01:00:00',
    x_company_id: 1,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.activities.length, 1, 'no new break should be created when an activity is already open');
  assert.equal(harness.checkoutOps.length, 1);
  assert.deepEqual(harness.checkoutOps[0]?.attendanceIds, [9122]);
  assert.equal(
    harness.logs.filter((log) => log.log_type === 'break_start').length,
    0,
    'break_start log should not be created during fallback checkout',
  );
});

test('createAttendanceProcessor management checkout auto-ends linked break activities on the interrupted service crew shift', async () => {
  const serviceShift = createShift({
    id: 'shift-service-interrupted',
    odoo_shift_id: 91302,
    branch_id: 'branch-service',
    user_id: 'user-1',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const linkedBreak = createActivity({
    id: 'activity-management-interrupt',
    user_id: 'user-1',
    shift_id: serviceShift.id,
    activity_type: 'break',
    start_time: '2026-03-20T00:45:00.000Z',
    activity_details: JSON.stringify({
      source: 'management_interrupt',
      management_attendance_id: 9131,
      interrupted_attendance_id: 9132,
    }),
  });
  const harness = createAttendanceHarness({
    shifts: [serviceShift],
    activities: [linkedBreak],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  const deps = {
    ...harness.deps,
    listActiveAttendancesByWebsiteUserKey: async () => [],
  };
  const processAttendance = createAttendanceProcessor(deps as any);

  await processAttendance({
    id: 9131,
    check_in: '2026-03-20 01:00:00',
    check_out: '2026-03-20 01:45:00',
    worked_hours: 0.75,
    x_company_id: 1,
    x_cumulative_minutes: 45,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    new Date(harness.activities[0]?.end_time as string | Date).toISOString(),
    '2026-03-20T01:45:00.000Z',
  );
  assert.equal(harness.activities[0]?.duration_minutes, 60);
  const breakEndLog = harness.logs.find((log) => log.log_type === 'break_end');
  assert.ok(breakEndLog, 'break_end log should be created when management checks out');
  assert.equal(breakEndLog?.shift_id, serviceShift.id);
  assert.equal(
    new Date(breakEndLog?.event_time as string | Date).toISOString(),
    '2026-03-20T01:45:00.000Z',
  );
});

test('createAttendanceProcessor management checkout reverts role scope to service crew when only service crew attendance remains active', async () => {
  const serviceShift = createShift({
    id: 'shift-service-revert',
    odoo_shift_id: 91402,
    branch_id: 'branch-service',
    user_id: 'user-1',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [serviceShift],
    activities: [
      createActivity({
        id: 'activity-management-interrupt-revert',
        user_id: 'user-1',
        shift_id: serviceShift.id,
        activity_type: 'break',
        start_time: '2026-03-20T00:45:00.000Z',
        activity_details: JSON.stringify({
          source: 'management_interrupt',
          management_attendance_id: 9141,
          interrupted_attendance_id: 9142,
        }),
      }),
    ],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    userRolesByUserId: {
      'user-1': [
        { id: 'role-management', name: 'Management' },
        { id: 'role-service-crew', name: 'Service Crew' },
      ],
    },
    initialDisabledRoleIdsByUserId: {
      'user-1': ['role-service-crew'],
    },
  });
  const deps = {
    ...harness.deps,
    listActiveAttendancesByWebsiteUserKey: async () => [
      { id: 9142, company_id: 2, check_in: '2026-03-20 00:30:00' },
    ],
  };
  const processAttendance = createAttendanceProcessor(deps as any);

  await processAttendance({
    id: 9141,
    check_in: '2026-03-20 01:00:00',
    check_out: '2026-03-20 01:45:00',
    worked_hours: 0.75,
    x_company_id: 1,
    x_cumulative_minutes: 45,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  const disabled = harness.disabledRoleIdsByUserId.get('user-1');
  assert.ok(disabled?.has('role-management'));
  assert.equal(disabled?.has('role-service-crew'), false);
  assert.ok(
    harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'),
    'role restoration should emit user:auth-scope-updated',
  );
});

test('createAttendanceProcessor checkout creates a type-129 break work entry for newly ended uncalculated breaks and marks them calculated', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-sync-create',
    odoo_shift_id: 9301,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-02T07:00:00.000Z',
    shift_end: '2026-04-02T18:00:00.000Z',
    allocated_hours: 12,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-break-sync-create',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-02T10:00:00.000Z',
        end_time: '2026-04-02T10:30:00.000Z',
        duration_minutes: 30,
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9301,
    check_in: '2026-04-02 07:00:00',
    check_out: '2026-04-02 12:00:00',
    worked_hours: 5,
    x_company_id: 12,
    x_cumulative_minutes: 300,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 9301,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.breakWorkEntryAttempts.length, 1);
  assert.equal(harness.breakWorkEntryOps.length, 1);
  assert.equal(harness.breakWorkEntryOps[0]?.action, 'created');
  assert.equal(harness.breakWorkEntryOps[0]?.durationMinutes, 30);
  assert.equal(harness.workEntries.length, 1);
  assert.equal(harness.workEntries[0]?.work_entry_type_id, 129);
  assert.equal(harness.workEntries[0]?.date, '2026-04-02');
  assert.equal(harness.workEntries[0]?.duration, 0.5);
  assert.equal(harness.activities[0]?.is_calculated, true);
});

test('createAttendanceProcessor enqueues peer evaluation without overtime when net worked time exceeds effective allocated hours but not allocated hours', async (t) => {
  const shift = createShift({
    id: 'shift-overtime-1',
    odoo_shift_id: 2501,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-02T00:00:00.000Z',
    shift_end: '2026-04-02T09:00:00.000Z',
    allocated_hours: 8,
    total_worked_hours: 0,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [shift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-peer-eval-only-break',
        user_id: 'user-1',
        shift_id: shift.id,
        activity_type: 'break',
        start_time: '2026-04-02T04:00:00.000Z',
        end_time: '2026-04-02T04:30:00.000Z',
        duration_minutes: 30,
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 12501,
    check_in: '2026-04-02 01:00:00',
    check_out: '2026-04-02 09:00:00',
    worked_hours: 8,
    x_company_id: 12,
    x_cumulative_minutes: 480,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2501,
    x_website_key: 'website-user-1',
  });

  const overtimeAuth = harness.auths.find((auth) => auth.auth_type === 'overtime');
  assert.equal(overtimeAuth, undefined, 'overtime authorization should not be created below allocated hours');
  assert.equal(harness.peerEvaluationJobs.length, 1, 'peer evaluation should be enqueued');
  assert.equal(harness.peerEvaluationJobs[0]?.shiftId, shift.id);
});

test('createAttendanceProcessor does not create overtime authorization at checkout even when net worked time exceeds allocated hours', async (t) => {
  const shift = createShift({
    id: 'shift-overtime-allocated-threshold',
    odoo_shift_id: 2502,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-02T00:00:00.000Z',
    shift_end: '2026-04-02T09:00:00.000Z',
    allocated_hours: 8,
    total_worked_hours: 0,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [shift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-overtime-threshold-break',
        user_id: 'user-1',
        shift_id: shift.id,
        activity_type: 'break',
        start_time: '2026-04-02T04:00:00.000Z',
        end_time: '2026-04-02T05:00:00.000Z',
        duration_minutes: 60,
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 12502,
    check_in: '2026-04-02 01:00:00',
    check_out: '2026-04-02 11:00:00',
    worked_hours: 10,
    x_company_id: 12,
    x_cumulative_minutes: 600,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2502,
    x_website_key: 'website-user-1',
  });

  const overtimeAuth = harness.auths.find((auth) => auth.auth_type === 'overtime');
  assert.equal(overtimeAuth, undefined, 'checkout should no longer create managed overtime authorizations');
  assert.equal(harness.peerEvaluationJobs.length, 1, 'peer evaluation should still be enqueued');
  assert.equal(harness.peerEvaluationJobs[0]?.shiftId, shift.id);
});

test('createAttendanceProcessor does not create overtime authorization when net worked time equals allocated hours', async (t) => {
  const shift = createShift({
    id: 'shift-overtime-boundary-1',
    odoo_shift_id: 2503,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-02T00:00:00.000Z',
    shift_end: '2026-04-02T09:00:00.000Z',
    allocated_hours: 8,
    total_worked_hours: 0,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [shift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-overtime-boundary-break',
        user_id: 'user-1',
        shift_id: shift.id,
        activity_type: 'break',
        start_time: '2026-04-02T04:00:00.000Z',
        end_time: '2026-04-02T05:00:00.000Z',
        duration_minutes: 60,
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 12503,
    check_in: '2026-04-02 01:00:00',
    check_out: '2026-04-02 10:00:00',
    worked_hours: 9,
    x_company_id: 12,
    x_cumulative_minutes: 540,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2503,
    x_website_key: 'website-user-1',
  });

  const overtimeAuth = harness.auths.find((auth) => auth.auth_type === 'overtime');
  assert.equal(overtimeAuth, undefined, 'overtime authorization should not be created at the allocated-hours boundary');
  assert.equal(harness.peerEvaluationJobs.length, 1, 'peer evaluation should still be enqueued at the allocated-hours boundary');
  assert.equal(harness.peerEvaluationJobs[0]?.shiftId, shift.id);
});

test('createAttendanceProcessor checkout overwrites an existing type-129 break work entry to the exact employee-date break total', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-sync-update',
    odoo_shift_id: 9302,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-03T07:00:00.000Z',
    shift_end: '2026-04-03T18:00:00.000Z',
    allocated_hours: 12,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    workEntries: [
      {
        id: 12901,
        employee_id: 7001,
        date: '2026-04-03',
        work_entry_type_id: 129,
        duration: 0.25,
        name: 'Break - Synced from Omnilert',
      },
    ],
    activities: [
      createActivity({
        id: 'activity-break-sync-existing',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-03T09:00:00.000Z',
        end_time: '2026-04-03T09:30:00.000Z',
        duration_minutes: 30,
        is_calculated: true,
      }),
      createActivity({
        id: 'activity-break-sync-management',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-03T11:00:00.000Z',
        end_time: '2026-04-03T11:15:00.000Z',
        duration_minutes: 15,
        activity_details: JSON.stringify({
          source: 'management_interrupt',
          management_attendance_id: 9991,
          interrupted_attendance_id: 9992,
        }),
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9302,
    check_in: '2026-04-03 07:00:00',
    check_out: '2026-04-03 12:00:00',
    worked_hours: 5,
    x_company_id: 12,
    x_cumulative_minutes: 300,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 9302,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.breakWorkEntryAttempts.length, 1);
  assert.equal(harness.breakWorkEntryOps.length, 1);
  assert.equal(harness.breakWorkEntryOps[0]?.action, 'updated');
  assert.equal(harness.breakWorkEntryOps[0]?.durationMinutes, 45);
  assert.equal(harness.workEntries[0]?.duration, 0.75);
  assert.equal(harness.activities[0]?.is_calculated, true);
  assert.equal(harness.activities[1]?.is_calculated, true);
});

test('createAttendanceProcessor checkout creates a type-129 break work entry from the combined same-day break total across multiple shifts', async (t) => {
  const earlierShift = createShift({
    id: 'shift-break-sync-earlier',
    odoo_shift_id: 9305,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-06T07:00:00.000Z',
    shift_end: '2026-04-06T10:00:00.000Z',
    allocated_hours: 3,
    total_worked_hours: 3,
    status: 'ended',
    check_in_status: 'checked_out',
  });
  const activeShift = createShift({
    id: 'shift-break-sync-later',
    odoo_shift_id: 9306,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-06T11:00:00.000Z',
    shift_end: '2026-04-06T18:00:00.000Z',
    allocated_hours: 7,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [earlierShift, activeShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-break-sync-earlier-1',
        user_id: 'user-1',
        shift_id: earlierShift.id,
        activity_type: 'break',
        start_time: '2026-04-06T08:00:00.000Z',
        end_time: '2026-04-06T08:30:00.000Z',
        duration_minutes: 30,
        is_calculated: true,
      }),
      createActivity({
        id: 'activity-break-sync-later-1',
        user_id: 'user-1',
        shift_id: activeShift.id,
        activity_type: 'break',
        start_time: '2026-04-06T12:00:00.000Z',
        end_time: '2026-04-06T12:15:00.000Z',
        duration_minutes: 15,
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9306,
    check_in: '2026-04-06 11:00:00',
    check_out: '2026-04-06 16:00:00',
    worked_hours: 5,
    x_company_id: 12,
    x_cumulative_minutes: 300,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 9306,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.breakWorkEntryAttempts.length, 1);
  assert.equal(harness.breakWorkEntryOps.length, 1);
  assert.equal(harness.breakWorkEntryOps[0]?.action, 'created');
  assert.equal(
    harness.breakWorkEntryOps[0]?.durationMinutes,
    45,
    'checkout should reconcile to the full same-day break total, not only the active shift delta',
  );
  assert.equal(harness.workEntries[0]?.duration, 0.75);
  assert.equal(harness.activities[1]?.is_calculated, true);
});

test('createAttendanceProcessor checkout auto-ends an open break and syncs it to the type-129 break work entry in the same pass', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-sync-open',
    odoo_shift_id: 9303,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-04T07:00:00.000Z',
    shift_end: '2026-04-04T18:00:00.000Z',
    allocated_hours: 12,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-break-sync-open',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-04T11:00:00.000Z',
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9303,
    check_in: '2026-04-04 07:00:00',
    check_out: '2026-04-04 11:20:00',
    worked_hours: 4.33,
    x_company_id: 12,
    x_cumulative_minutes: 260,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 9303,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.activities[0]?.duration_minutes, 20);
  assert.equal(
    new Date(harness.activities[0]?.end_time as string | Date).toISOString(),
    '2026-04-04T11:20:00.000Z',
  );
  assert.equal(harness.activities[0]?.is_calculated, true);
  assert.equal(harness.breakWorkEntryOps.length, 1);
  assert.equal(harness.breakWorkEntryOps[0]?.durationMinutes, 20);
  const breakEndLog = harness.logs.find((log) => log.log_type === 'break_end');
  assert.ok(breakEndLog, 'break_end log should be created when checkout auto-ends an open break');
});

test('createAttendanceProcessor checkout leaves break rows retryable when the type-129 work entry sync fails', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-sync-failure',
    odoo_shift_id: 9304,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-05T07:00:00.000Z',
    shift_end: '2026-04-05T18:00:00.000Z',
    allocated_hours: 12,
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    setBreakWorkEntryDurationError: new Error('Odoo break work entry sync failed'),
    activities: [
      createActivity({
        id: 'activity-break-sync-failure',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-05T09:00:00.000Z',
        end_time: '2026-04-05T09:20:00.000Z',
        duration_minutes: 20,
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 9304,
    check_in: '2026-04-05 07:00:00',
    check_out: '2026-04-05 12:00:00',
    worked_hours: 5,
    x_company_id: 12,
    x_cumulative_minutes: 300,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 9304,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.breakWorkEntryAttempts.length, 1);
  assert.equal(harness.breakWorkEntryOps.length, 0);
  assert.equal(harness.workEntries.length, 0);
  assert.equal(harness.activities[0]?.is_calculated, false);
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
  assert.equal(
    harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'),
    false,
  );
  assert.ok(harness.socketEvents.some((evt) => evt.event === 'user:check-in-status-updated'));
});

test('createAttendanceProcessor skips role gating and auto-checkout when user lacks required role for the check-in type', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-no-management',
    userRolesByUserId: {
      'user-no-management': [{ id: 'role-service-crew', name: 'Service Crew' }],
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
  assert.equal(
    harness.socketEvents.some((evt) => evt.event === 'user:auth-scope-updated'),
    false,
  );
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
  const savedPayload = JSON.parse(String(harness.logs[0]?.odoo_payload ?? '{}')) as {
    x_website_key?: string;
  };
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
      'wk-dual': [{ id: 7001, company_id: 2, check_in: '2026-03-20 09:00:00' }],
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
      'wk-dual-mgmt': [{ id: 8001, company_id: 1, check_in: '2026-03-20 09:00:00' }],
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
  assert.deepEqual(
    authScopeEmit?.payload,
    { userId: 'user-dual-mgmt' },
    'payload must contain userId',
  );
});

test('createAttendanceProcessor skips check-out processing when a check-out log already exists for the same attendance id (idempotency guard)', async () => {
  const harness = createAttendanceHarness({
    websiteUserKey: 'website-user-1',
  });
  const existingLog = {
    id: 'log-existing',
    log_type: 'check_out',
    odoo_attendance_id: 9701,
    branch_id: 'branch-service',
    event_time: '2026-03-20T09:00:00.000Z',
    odoo_payload: '{}',
  };
  const deps = {
    ...harness.deps,
    findExistingCheckOutLog: async (_attendanceId: number) => existingLog,
  };
  const processAttendance = createAttendanceProcessor(deps as any);

  const result = await processAttendance({
    id: 9701,
    check_in: '2026-03-20 01:00:00',
    check_out: '2026-03-20 09:00:00',
    worked_hours: 8,
    x_company_id: 2,
    x_cumulative_minutes: 480,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: false,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.logs.length, 0, 'no new shift log should be created for duplicate check-out');
  assert.equal(harness.auths.length, 0, 'no authorization should be created for duplicate check-out');
  assert.deepEqual(result, existingLog, 'should return the existing log unchanged');
});

test('createAttendanceProcessor skips tardiness when x_prev_attendance_id is set (re-check-in after earlier check-out)', async (t) => {
  const shift = createShift({
    id: 'shift-rechkin',
    odoo_shift_id: 1601,
    branch_id: 'branch-other',
    user_id: 'user-1',
    shift_start: '2026-04-01 04:00:00',
    shift_end: '2026-04-01 13:00:00',
  });
  const harness = createAttendanceHarness({ shifts: [shift] });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  // Check in at 7:41 AM — 3h 41m after shift start (12:00 PM UTC = 4:00 UTC shift start)
  // With x_prev_attendance_id set → this is a re-check-in, not the first of the day
  await processAttendance({
    id: 11240,
    check_in: '2026-04-01 07:41:27',
    x_company_id: 99,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '4023 - Chovie Pineda',
    x_planning_slot_id: 1601,
    x_prev_attendance_id: 11239,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'tardiness').length,
    0,
    'tardiness must not be created for a re-check-in',
  );
  assert.equal(harness.queuedJobs.length, 0, 'no early check-in job should be queued for a re-check-in');
});

test('createAttendanceProcessor skips early check-in job when x_prev_attendance_id is set (re-check-in before shift start)', async (t) => {
  const shift = createShift({
    id: 'shift-rechkin-early',
    odoo_shift_id: 1602,
    branch_id: 'branch-other',
    user_id: 'user-1',
    shift_start: '2026-04-01 10:00:00',
    shift_end: '2026-04-01 18:00:00',
  });
  const harness = createAttendanceHarness({ shifts: [shift] });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  // Check in at 09:45 — 15m before shift start, but with x_prev_attendance_id → re-check-in
  await processAttendance({
    id: 11250,
    check_in: '2026-04-01 09:45:00',
    x_company_id: 99,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '4023 - Chovie Pineda',
    x_planning_slot_id: 1602,
    x_prev_attendance_id: 11249,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.queuedJobs.length, 0, 'no early check-in job should be queued for a re-check-in');
  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'early_check_in').length,
    0,
    'no early check-in auth should be created for a re-check-in',
  );
});

test('createAttendanceProcessor retroactively voids early_check_out when re-check-in follows (break checkout scenario)', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-1',
    odoo_shift_id: 2001,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-01T07:00:00.000Z',
    shift_end: '2026-04-01T18:00:00.000Z',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  // Initial check-in at 7:30 AM → tardiness (30 min late)
  await processAttendance({
    id: 10001,
    check_in: '2026-04-01 07:30:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2001,
    x_website_key: 'website-user-1',
  });

  assert.equal(harness.auths.filter((a) => a.auth_type === 'tardiness').length, 1, 'tardiness should be created');

  // Break checkout at 12:00 PM → triggers early_check_out (false positive)
  await processAttendance({
    id: 10001,
    check_in: '2026-04-01 07:30:00',
    check_out: '2026-04-01 12:00:00',
    worked_hours: 4.5,
    x_company_id: 12,
    x_cumulative_minutes: 270,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2001,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'early_check_out').length,
    1,
    'early_check_out should be initially created',
  );
  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'underbreak').length,
    1,
    'underbreak should also be created when the break checkout leaves the shift below 60 total break minutes',
  );
  assert.equal(
    plannedShift.pending_approvals,
    3,
    'tardiness + early_check_out + underbreak should all count as pending before re-check-in',
  );

  // Re-check-in at 1:00 PM with x_prev_attendance_id → should void the early_check_out
  await processAttendance({
    id: 10002,
    check_in: '2026-04-01 13:00:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2001,
    x_prev_attendance_id: 10001,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'early_check_out').length,
    0,
    'early_check_out must be voided after re-check-in',
  );
  assert.ok(
    harness.socketEvents.some((e) => e.event === 'shift:authorization-voided'),
    'shift:authorization-voided must be emitted',
  );
  assert.equal(
    plannedShift.pending_approvals,
    1,
    'voiding the false-positive early_check_out and underbreak should restore pending approvals to the remaining tardiness auth only',
  );
});

test('createAttendanceProcessor preserves synced break work entry across re-check-in and final checkout', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-recheck-sync',
    odoo_shift_id: 2018,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-18T04:00:00.000Z',
    shift_end: '2026-04-18T10:00:00.000Z',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
    activities: [
      createActivity({
        id: 'activity-break-3m',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-18T04:37:00.000Z',
        end_time: '2026-04-18T04:39:00.000Z',
        duration_minutes: 3,
      }),
      createActivity({
        id: 'activity-break-2m',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'break',
        start_time: '2026-04-18T04:46:00.000Z',
        end_time: '2026-04-18T04:49:00.000Z',
        duration_minutes: 2,
      }),
      createActivity({
        id: 'activity-field-task-open',
        user_id: 'user-1',
        shift_id: plannedShift.id,
        activity_type: 'field_task',
        start_time: '2026-04-18T04:58:00.000Z',
      }),
    ],
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  await processAttendance({
    id: 12001,
    check_in: '2026-04-18 04:17:00',
    check_out: '2026-04-18 05:00:00',
    worked_hours: 0.72,
    x_company_id: 12,
    x_cumulative_minutes: 43,
    x_employee_contact_name: '3065 - Carl Anthony Camaya',
    x_planning_slot_id: 2018,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    harness.breakWorkEntryOps.length,
    1,
    'first checkout should sync the completed 5-minute break total to Odoo',
  );
  assert.equal(harness.breakWorkEntryOps[0]?.action, 'created');
  assert.equal(harness.breakWorkEntryOps[0]?.durationMinutes, 5);
  assert.equal(harness.workEntries.length, 1);
  assert.equal(harness.workEntries[0]?.work_entry_type_id, 129);
  assert.equal(harness.workEntries[0]?.duration, 5 / 60);
  assert.equal(harness.activities[0]?.is_calculated, true);
  assert.equal(harness.activities[1]?.is_calculated, true);
  assert.equal(harness.activities[2]?.duration_minutes, 2);
  harness.workEntries.splice(0, harness.workEntries.length);

  await processAttendance({
    id: 12002,
    check_in: '2026-04-18 05:00:00',
    x_company_id: 12,
    x_cumulative_minutes: 0,
    x_employee_contact_name: '3065 - Carl Anthony Camaya',
    x_planning_slot_id: 2018,
    x_prev_attendance_id: 12001,
    x_website_key: 'website-user-1',
  });

  await processAttendance({
    id: 12002,
    check_in: '2026-04-18 05:00:00',
    check_out: '2026-04-18 07:59:00',
    worked_hours: 2.98,
    x_company_id: 12,
    x_cumulative_minutes: 179,
    x_employee_contact_name: '3065 - Carl Anthony Camaya',
    x_planning_slot_id: 2018,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    harness.breakWorkEntryOps.length,
    2,
    'final checkout should restore the missing 5-minute break entry from the employee-date total even without new break deltas',
  );
  assert.equal(harness.workEntries.length, 1);
  assert.equal(harness.breakWorkEntryOps[1]?.action, 'created');
  assert.equal(harness.breakWorkEntryOps[1]?.durationMinutes, 5);
  assert.equal(harness.workEntries[0]?.work_entry_type_id, 129);
  assert.equal(harness.workEntries[0]?.duration, 5 / 60);
  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'underbreak').length,
    1,
    'underbreak should be recreated on the final checkout because only 5 total break minutes were recorded',
  );
});

test('createAttendanceProcessor preserves the final early_check_out when no re-check-in follows', async (t) => {
  const plannedShift = createShift({
    id: 'shift-break-2',
    odoo_shift_id: 2002,
    branch_id: 'branch-main',
    user_id: 'user-1',
    shift_start: '2026-04-01T07:00:00.000Z',
    shift_end: '2026-04-01T18:00:00.000Z',
    status: 'active',
    check_in_status: 'checked_in',
  });
  const harness = createAttendanceHarness({
    shifts: [plannedShift],
    websiteUserKey: 'website-user-1',
    resolvedUserId: 'user-1',
  });
  installHarnessDb(harness, (cleanup) => t.after(cleanup));
  const processAttendance = createAttendanceProcessor(harness.deps as any);

  // Final checkout at 5:00 PM (1 hour early) — no subsequent re-check-in
  await processAttendance({
    id: 10003,
    check_in: '2026-04-01 07:00:00',
    check_out: '2026-04-01 17:00:00',
    worked_hours: 10,
    x_company_id: 12,
    x_cumulative_minutes: 600,
    x_employee_contact_name: '001 - Alex Crew',
    x_planning_slot_id: 2002,
    x_website_key: 'website-user-1',
  });

  assert.equal(
    harness.auths.filter((a) => a.auth_type === 'early_check_out').length,
    1,
    'final early_check_out must be preserved',
  );
  assert.equal(
    harness.socketEvents.some((e) => e.event === 'shift:authorization-voided'),
    false,
    'no void event should be emitted for a final checkout',
  );
});
