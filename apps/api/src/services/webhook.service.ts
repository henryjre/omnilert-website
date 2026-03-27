import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { enqueueEarlyCheckInAuthJob } from './attendanceQueue.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { createAndDispatchNotification } from './notification.service.js';
import {
  batchCheckOutAttendances,
  getActiveAttendancesForWebsiteUserKey,
  getAttendanceIdentityByAttendanceId,
} from './odoo.service.js';
import { emitStoreAuditEvent } from './storeAuditRealtime.service.js';
import { SYSTEM_ROLES } from '@omnilert/shared';

const DISABLED_AUDIT_ODOO_COMPANY_IDS = new Set<number>([2]);
const INTERIM_DUTY_AUTH_TYPE = 'interim_duty';
const PRESERVED_INTERIM_DUTY_STATUSES = new Set(['pending', 'approved', 'rejected']);

export function shouldPreserveInterimDutyPlanningSlotDelete(statuses: string[]): boolean {
  return statuses.some((status) => PRESERVED_INTERIM_DUTY_STATUSES.has(status));
}

export async function resolveCompanyByOdooBranchId(odooCompanyId: number) {
  const branch = await db.getDb()('branches')
    .where({ odoo_branch_id: String(odooCompanyId) })
    .first('company_id');
  if (!branch) {
    throw new AppError(404, `No company found for Odoo company_id: ${odooCompanyId}`);
  }
  const company = await db.getDb()('companies')
    .where({ id: branch.company_id, is_active: true })
    .first();
  if (!company) {
    throw new AppError(404, `No active company found for Odoo company_id: ${odooCompanyId}`);
  }
  return company;
}

async function resolveUserIdByUserKey(
  userKey?: string | null,
): Promise<string | null> {
  if (!userKey) return null;
  const user = await db.getDb()('users').where({ user_key: userKey }).select('id').first();
  return user?.id ?? null;
}

export async function processPosVerification(
  payload: {
    branchId: string;
    transactionId: string;
    title: string;
    description?: string;
    amount?: number;
    data?: Record<string, unknown>;
  },
) {
  const tenantDb = db.getDb();

  // Map Odoo branch ID to internal branch
  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: payload.branchId })
    .orWhere({ id: payload.branchId })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for ID: ${payload.branchId}`);
  }

  // Insert verification record
  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      odoo_payload: JSON.stringify(payload),
      title: payload.title,
      description: payload.description || null,
      amount: payload.amount || null,
      status: 'pending',
    })
    .returning('*');

  // Emit real-time event
  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odooPayload: payload,
        images: [],
      });
  } catch (err) {
    logger.warn('Socket.IO not available for POS verification emit');
  }

  return verification;
}

export async function processPosSession(
  payload: {
    _action?: string;
    _id?: number;
    _model?: string;
    id?: number;
    name: string;
    display_name?: string;
    company_id: number;
    cash_register_balance_start?: number;
    cash_register_balance_end?: number;
    opening_notes?: string;
    x_closing_pcf?: number;
    x_company_name?: string;
  },
) {
  const tenantDb = db.getDb();

  // company_id maps to the branch's odoo_branch_id
  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // name (e.g. "POS/01858") is the unique session identifier
  const existing = await tenantDb('pos_sessions')
    .where({ odoo_session_id: payload.name, branch_id: branch.id })
    .first();

  let session;
  if (existing) {
    [session] = await tenantDb('pos_sessions')
      .where({ id: existing.id })
      .update({
        odoo_payload: JSON.stringify(payload),
        session_name: payload.display_name || payload.name,
        updated_at: new Date(),
      })
      .returning('*');

    // If verifications were never created (e.g. session pre-dates this feature), create them now
    const existingVerCount = await tenantDb('pos_verifications')
      .where({ pos_session_id: existing.id })
      .count('id as count')
      .first();

    if (!existingVerCount || Number(existingVerCount.count) === 0) {
      const cfVerification = await tenantDb('pos_verifications')
        .insert({
          company_id: branch.company_id,
          branch_id: branch.id,
          pos_session_id: session.id,
          odoo_payload: JSON.stringify(payload),
          title: 'Opening Change Fund Breakdown',
          amount: payload.cash_register_balance_end ?? null,
          status: 'pending',
          verification_type: 'cf_breakdown',
        })
        .returning('*')
        .then((rows: any[]) => rows[0]);

      const pcfVerification = await tenantDb('pos_verifications')
        .insert({
          company_id: branch.company_id,
          branch_id: branch.id,
          pos_session_id: session.id,
          odoo_payload: JSON.stringify(payload),
          title: 'Opening PCF Breakdown',
          amount: payload.x_closing_pcf ?? null,
          status: 'pending',
          verification_type: 'pcf_breakdown',
        })
        .returning('*')
        .then((rows: any[]) => rows[0]);

      try {
        const io = getIO();
        io.of('/pos-session')
          .to(`branch:${branch.id}`)
          .emit('pos-session:updated', { ...session, verifications: [] });
        io.of('/pos-verification')
          .to(`branch:${branch.id}`)
          .emit('pos-verification:new', { ...cfVerification, images: [] });
        io.of('/pos-verification')
          .to(`branch:${branch.id}`)
          .emit('pos-verification:new', { ...pcfVerification, images: [] });
      } catch {
        logger.warn('Socket.IO not available for POS session emit');
      }
    } else {
      try {
        const io = getIO();
        io.of('/pos-session')
          .to(`branch:${branch.id}`)
          .emit('pos-session:updated', { ...session, verifications: [] });
      } catch {
        logger.warn('Socket.IO not available for POS session emit');
      }
    }
  } else {
    [session] = await tenantDb('pos_sessions')
      .insert({
        company_id: branch.company_id,
        branch_id: branch.id,
        odoo_session_id: payload.name,
        odoo_payload: JSON.stringify(payload),
        session_name: payload.display_name || payload.name,
        status: 'open',
      })
      .returning('*');

    // Auto-create CF and PCF breakdown verifications for the new session
    const cfVerification = await tenantDb('pos_verifications')
      .insert({
        company_id: branch.company_id,
        branch_id: branch.id,
        pos_session_id: session.id,
        odoo_payload: JSON.stringify(payload),
        title: 'Opening Change Fund Breakdown',
        amount: payload.cash_register_balance_end ?? null,
        status: 'pending',
        verification_type: 'cf_breakdown',
      })
      .returning('*')
      .then((rows: any[]) => rows[0]);

    const pcfVerification = await tenantDb('pos_verifications')
      .insert({
        company_id: branch.company_id,
        branch_id: branch.id,
        pos_session_id: session.id,
        odoo_payload: JSON.stringify(payload),
        title: 'Opening PCF Breakdown',
        amount: payload.x_closing_pcf ?? null,
        status: 'pending',
        verification_type: 'pcf_breakdown',
      })
      .returning('*')
      .then((rows: any[]) => rows[0]);

    try {
      const io = getIO();
      io.of('/pos-session')
        .to(`branch:${branch.id}`)
        .emit('pos-session:new', { ...session, verifications: [] });
      io.of('/pos-verification')
        .to(`branch:${branch.id}`)
        .emit('pos-verification:new', { ...cfVerification, images: [] });
      io.of('/pos-verification')
        .to(`branch:${branch.id}`)
        .emit('pos-verification:new', { ...pcfVerification, images: [] });
    } catch {
      logger.warn('Socket.IO not available for POS session emit');
    }
  }

  return session;
}

export async function processEmployeeShift(
  payload: {
    id: number;
    company_id: number;
    start_datetime: string;
    end_datetime: string;
    x_employee_avatar?: string;
    x_employee_contact_name: string;
    x_role_color: number;
    x_role_name: string;
    x_website_key?: string;
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();
  if (!branch) throw new AppError(404, `Branch not found for odoo_branch_id: ${payload.company_id}`);

  // Parse UTC datetimes (Odoo sends "YYYY-MM-DD HH:MM:SS" without timezone indicator)
  const shiftStart = new Date(payload.start_datetime + ' UTC');
  const shiftEnd = new Date(payload.end_datetime + ' UTC');
  const allocatedHours = (shiftEnd.getTime() - shiftStart.getTime()) / 3600000;

  const userId = await resolveUserIdByUserKey(payload.x_website_key);

  const existing = await tenantDb('employee_shifts')
    .where({ odoo_shift_id: payload.id, branch_id: branch.id })
    .first();

  let shift: Record<string, unknown>;
  const shiftLabel = payload.x_role_name || 'Scheduled Shift';
  const shiftWindow = `${shiftStart.toLocaleString()} - ${shiftEnd.toLocaleString()}`;

  if (existing) {
    // Diff tracked fields to create a change log
    const TRACKED_FIELDS = [
      'start_datetime', 'end_datetime',
      'x_role_name', 'x_role_color',
      'x_employee_contact_name', 'x_employee_avatar',
      'x_website_key',
    ];
    const existingPayload = existing.odoo_payload as Record<string, unknown>;
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const field of TRACKED_FIELDS) {
      const oldVal = existingPayload?.[field];
      const newVal = (payload as Record<string, unknown>)[field];
      if (String(oldVal) !== String(newVal)) {
        changes[field] = { from: oldVal, to: newVal };
      }
    }

    const [updated] = await tenantDb('employee_shifts')
      .where({ id: existing.id })
      .update({
        user_id: userId,
        employee_name: payload.x_employee_contact_name,
        employee_avatar_url: payload.x_employee_avatar || null,
        duty_type: payload.x_role_name,
        duty_color: payload.x_role_color,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        allocated_hours: allocatedHours,
        odoo_payload: JSON.stringify(payload),
        updated_at: new Date(),
      })
      .returning('*');
    shift = updated;

    if (Object.keys(changes).length > 0) {
      const [log] = await tenantDb('shift_logs')
        .insert({
          company_id: branch.company_id,
          shift_id: existing.id,
          branch_id: branch.id,
          log_type: 'shift_updated',
          changes: JSON.stringify(changes),
          event_time: new Date(),
          odoo_payload: JSON.stringify(payload),
        })
        .returning('*');

      try {
        const io = getIO();
        io.of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:log-new', log);
      } catch {
        logger.warn('Socket.IO not available for shift log emit');
      }
    }

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:updated', shift);
    } catch {
      logger.warn('Socket.IO not available for employee shift update emit');
    }

    const existingUserId = (existing.user_id as string | null) ?? null;

    // Notify the same assigned user when their shift's time or duty type changes.
    const relevantShiftFieldChanged = Object.keys(changes).some(
      (f) => ['start_datetime', 'end_datetime', 'x_role_name'].includes(f),
    );
    if (userId && userId === existingUserId && relevantShiftFieldChanged) {
      await createAndDispatchNotification({
        userId,
        title: 'Shift Updated',
        message: `Your ${shiftLabel} (${shiftWindow}) has been updated.`,
        type: 'warning',
        linkUrl: `/account/schedule?shiftId=${String(shift.id)}&highlight=shift_updated`,
      });
    }

    // Notify the newly assigned user if the shift was re-assigned.
    if (userId && userId !== existingUserId) {
      await createAndDispatchNotification({
        userId,
        title: 'New Shift Assigned',
        message: `You have been assigned a ${shiftLabel} (${shiftWindow}).`,
        type: 'info',
        linkUrl: `/account/schedule?shiftId=${String(shift.id)}`,
      });
    }
  } else {
    const [inserted] = await tenantDb('employee_shifts')
      .insert({
        company_id: branch.company_id,
        odoo_shift_id: payload.id,
        branch_id: branch.id,
        user_id: userId,
        employee_name: payload.x_employee_contact_name,
        employee_avatar_url: payload.x_employee_avatar || null,
        duty_type: payload.x_role_name,
        duty_color: payload.x_role_color,
        shift_start: shiftStart,
        shift_end: shiftEnd,
        allocated_hours: allocatedHours,
        odoo_payload: JSON.stringify(payload),
      })
      .returning('*');
    shift = inserted;

    try {
      const io = getIO();
      io.of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:new', shift);
    } catch {
      logger.warn('Socket.IO not available for employee shift new emit');
    }

    if (userId) {
      await createAndDispatchNotification({
        userId,
        title: 'New Shift Assigned',
        message: `You have been assigned a ${shiftLabel} (${shiftWindow}).`,
        type: 'info',
        linkUrl: `/account/schedule?shiftId=${String(shift.id)}`,
      });
    }
  }

  return shift;
}

export async function processPlanningSlotDelete(
  payload: {
    _id?: number;
    id?: number;
    company_id: number;
    start_datetime?: string;
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const odooShiftId = payload.id ?? payload._id;
  if (!odooShiftId) {
    throw new AppError(400, 'Missing planning slot id (id or _id) for delete action');
  }

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();
  if (!branch) throw new AppError(404, `Branch not found for odoo_branch_id: ${payload.company_id}`);

  const existing = await tenantDb('employee_shifts')
    .where({ odoo_shift_id: odooShiftId, branch_id: branch.id })
    .first();
  if (!existing) {
    throw new AppError(404, `Shift not found for odoo_shift_id: ${odooShiftId}`);
  }

  const interimDutyStatuses = (await tenantDb('shift_authorizations')
      .where({ shift_id: existing.id, auth_type: INTERIM_DUTY_AUTH_TYPE })
      .select('status'))
    .map((row: { status: string | null }) => String(row.status ?? '').trim());
  const preserveInterimDutyHistory = shouldPreserveInterimDutyPlanningSlotDelete(interimDutyStatuses);

  if (preserveInterimDutyHistory) {
    return {
      id: existing.id,
      odoo_shift_id: existing.odoo_shift_id,
      branch_id: existing.branch_id,
      deleted: false,
      preserved: true,
    };
  }

  // Capture human-readable shift info before the row is deleted.
  const deletedShiftLabel = (existing.duty_type as string | null) || 'Scheduled Shift';
  const deletedShiftStart = new Date(existing.shift_start as string);
  const deletedShiftEnd = new Date(existing.shift_end as string);
  const deletedShiftWindow = `${deletedShiftStart.toLocaleString()} - ${deletedShiftEnd.toLocaleString()}`;
  const deletedUserId = (existing.user_id as string | null) ?? null;

  await db.getDb().transaction(async (trx) => {
    await trx('shift_exchange_requests')
      .where('requester_shift_id', existing.id)
      .orWhere('accepting_shift_id', existing.id)
      .delete();
    await trx('shift_authorizations').where({ shift_id: existing.id }).delete();
    await trx('shift_logs').where({ shift_id: existing.id }).delete();
    await trx('employee_shifts').where({ id: existing.id }).delete();
  });

  try {
    const io = getIO();
    io.of('/employee-shifts')
      .to(`branch:${branch.id}`)
      .emit('shift:deleted', {
        id: existing.id,
        odoo_shift_id: existing.odoo_shift_id,
        branch_id: existing.branch_id,
        user_id: existing.user_id,
      });
  } catch {
    logger.warn('Socket.IO not available for employee shift delete emit');
  }

  // Notify the assigned user that their shift has been removed.
  // No deep-link is provided since the shift record no longer exists in the DB;
  // the link takes the user to their general schedule instead.
  if (deletedUserId) {
    await createAndDispatchNotification({
      userId: deletedUserId,
      title: 'Shift Cancelled',
      message: `Your ${deletedShiftLabel} (${deletedShiftWindow}) has been removed from your schedule.`,
      type: 'danger',
      linkUrl: null,
    });
  }

  return {
    id: existing.id,
    odoo_shift_id: existing.odoo_shift_id,
    branch_id: existing.branch_id,
    deleted: true,
  };
}

function formatDiffMinutes(minutes: number): string {
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export async function reassignUserToSingleCheckedInBranch(
  userId: string,
  branchId: string,
) {
  await db.getDb().transaction(async (trx) => {
    const branch = await trx('branches')
      .where({ id: branchId })
      .first('company_id');

    if (!branch?.company_id) {
      throw new AppError(404, `Branch not found for reassignment: ${branchId}`);
    }

    await trx('user_branches')
      .where({ user_id: userId })
      .delete();

    await trx('user_branches')
      .insert({
        company_id: branch.company_id,
        user_id: userId,
        branch_id: branchId,
        is_primary: false,
      })
      .onConflict(['user_id', 'branch_id'])
      .ignore();
  });
}

export interface AttendancePayload {
  id: number;
  check_in: string;
  check_out?: string;
  worked_hours?: number;
  x_company_id: number;
  x_cumulative_minutes: number;
  x_employee_avatar?: string;
  x_employee_contact_name: string;
  x_planning_slot_id: number | false;
  x_prev_attendance_id?: number | false;
  x_shift_end?: string;
  x_shift_start?: string;
  x_website_key?: string;
  [key: string]: unknown;
}

interface AttendanceBranchRow {
  id: string;
  odoo_branch_id?: string;
  name?: string;
  [key: string]: unknown;
}

interface AttendanceShiftRow {
  id: string;
  odoo_shift_id: number;
  branch_id: string;
  user_id?: string | null;
  employee_name?: string;
  employee_avatar_url?: string | null;
  duty_type?: string;
  duty_color?: number;
  shift_start: string | Date;
  shift_end: string | Date;
  allocated_hours?: number;
  total_worked_hours?: number | null;
  pending_approvals?: number;
  status?: string;
  check_in_status?: string | null;
  odoo_payload?: string | Record<string, unknown>;
  [key: string]: unknown;
}

interface AttendanceShiftLogRow {
  id: string;
  shift_id?: string | null;
  branch_id: string;
  log_type: string;
  odoo_attendance_id: number;
  event_time: string | Date;
  worked_hours?: number | null;
  cumulative_minutes?: number | null;
  odoo_payload: string | Record<string, unknown>;
  [key: string]: unknown;
}

interface AttendanceShiftAuthorizationRow {
  id: string;
  auth_type: string;
  status: string;
  [key: string]: unknown;
}

interface ResolvedAttendanceIdentity {
  userId: string | null;
  websiteUserKey: string | null;
  employeeName: string;
}

interface UserRoleMembership {
  roleId: string;
  roleName: string;
}

interface IdentityActiveAttendance {
  id: number;
  company_id: number;
  check_in: string;
}

type CheckInRoleType = typeof SYSTEM_ROLES.MANAGEMENT | typeof SYSTEM_ROLES.SERVICE_CREW;

interface AttendanceProcessorDeps {
  now: () => Date;
  findBranchByOdooCompanyId: (odooCompanyId: number) => Promise<AttendanceBranchRow | null>;
  findShiftByPlanningSlotId: (planningSlotId: number, branchId: string) => Promise<AttendanceShiftRow | null>;
  findShiftById: (shiftId: string) => Promise<AttendanceShiftRow | null>;
  createShiftLog: (input: Record<string, unknown>) => Promise<AttendanceShiftLogRow>;
  updateShiftById: (shiftId: string, updates: Record<string, unknown>) => Promise<AttendanceShiftRow | null>;
  incrementShiftPendingApprovals: (shiftId: string) => Promise<AttendanceShiftRow | null>;
  createShiftAuthorization: (input: Record<string, unknown>) => Promise<AttendanceShiftAuthorizationRow>;
  upsertInterimShift: (input: Record<string, unknown>) => Promise<AttendanceShiftRow>;
  reassignLogsToShift: (attendanceId: number, shiftId: string) => Promise<void>;
  findOverlappingShiftInOtherBranches: (
    input: { userId: string | null; branchId: string; attendanceStart: Date; attendanceEnd: Date },
  ) => Promise<AttendanceShiftRow | null>;
  resolveAttendanceIdentity: (payload: AttendancePayload) => Promise<ResolvedAttendanceIdentity>;
  listUserRoleMembership: (userId: string) => Promise<UserRoleMembership[]>;
  disableUserRole: (userId: string, roleId: string) => Promise<void>;
  enableUserRole: (userId: string, roleId: string) => Promise<void>;
  clearUserDisabledRoles: (userId: string) => Promise<number>;
  listActiveAttendancesByWebsiteUserKey: (websiteUserKey: string) => Promise<IdentityActiveAttendance[]>;
  checkOutAttendancesByIds: (attendanceIds: number[], checkOutTime: Date) => Promise<void>;
  reassignUserToSingleCheckedInBranch: (
    userId: string,
    branchId: string,
  ) => Promise<void>;
  enqueueEarlyCheckInAuthJob: (
    payload: Parameters<typeof enqueueEarlyCheckInAuthJob>[0],
    runAt: Date,
  ) => ReturnType<typeof enqueueEarlyCheckInAuthJob>;
  createAndDispatchNotification: (
    input: Parameters<typeof createAndDispatchNotification>[0],
  ) => ReturnType<typeof createAndDispatchNotification>;
  emitSocketEvent: (event: string, payload: Record<string, unknown>) => void;
}

interface SocketNamespaceEmitter {
  to: (room: string) => {
    emit: (event: string, payload: Record<string, unknown>) => void;
  };
}

interface SocketEmitterLike {
  of: (namespace: string) => SocketNamespaceEmitter;
}

export function emitAttendanceSocketEvent(
  io: SocketEmitterLike,
  event: string,
  payload: Record<string, unknown>,
): void {
  if (event === 'user:branch-assignments-updated') {
    const userId = String(payload.userId ?? '').trim();
    if (!userId) return;
    io.of('/user-events').to(`user:${userId}`).emit(event, {
      branchIds: Array.isArray(payload.branchIds) ? payload.branchIds : [],
    });
    return;
  }

  if (event === 'user:auth-scope-updated' || event === 'user:check-in-status-updated') {
    const userId = String(payload.userId ?? '').trim();
    if (!userId) return;
    io.of('/user-events').to(`user:${userId}`).emit(event, {
      userId,
    });
    return;
  }

  const branchId = String(payload.branch_id ?? payload.branchId ?? '').trim();
  if (!branchId) return;
  io.of('/employee-shifts').to(`branch:${branchId}`).emit(event, payload);
}

function parseOdooUtcDateTime(value: string): Date {
  return new Date(`${value} UTC`);
}

function roundHoursFromMs(ms: number): number {
  return Math.round((ms / 3_600_000) * 100) / 100;
}

function hasPositiveWindowOverlap(
  rangeStart: Date,
  rangeEnd: Date,
  shiftStart: Date,
  shiftEnd: Date,
): boolean {
  return Math.max(rangeStart.getTime(), shiftStart.getTime())
    < Math.min(rangeEnd.getTime(), shiftEnd.getTime());
}

function resolveCheckInRoleType(odooCompanyId: number): CheckInRoleType {
  return odooCompanyId === 1 ? SYSTEM_ROLES.MANAGEMENT : SYSTEM_ROLES.SERVICE_CREW;
}

function resolveOppositeRoleType(roleType: CheckInRoleType): CheckInRoleType {
  return roleType === SYSTEM_ROLES.MANAGEMENT
    ? SYSTEM_ROLES.SERVICE_CREW
    : SYSTEM_ROLES.MANAGEMENT;
}

async function defaultResolveAttendanceIdentity(
  payload: AttendancePayload,
): Promise<ResolvedAttendanceIdentity> {
  let websiteUserKey = typeof payload.x_website_key === 'string'
    ? payload.x_website_key.trim()
    : '';
  let userId = websiteUserKey
    ? await resolveUserIdByUserKey(websiteUserKey)
    : null;
  let employeeName = String(payload.x_employee_contact_name ?? '').trim();

  if (!websiteUserKey || !userId) {
    try {
      const fallbackIdentity = await getAttendanceIdentityByAttendanceId(payload.id);
      if (fallbackIdentity?.websiteUserKey) {
        websiteUserKey = fallbackIdentity.websiteUserKey;
        if (!userId) {
          userId = await resolveUserIdByUserKey(
            fallbackIdentity.websiteUserKey,
          );
        }
      }
      if (!employeeName && fallbackIdentity?.employeeName) {
        employeeName = fallbackIdentity.employeeName;
      }
    } catch (error) {
      logger.warn(
        {
          attendanceId: payload.id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to resolve fallback attendance identity from Odoo',
      );
    }
  }

  return {
    userId: userId ?? null,
    websiteUserKey: websiteUserKey || null,
    employeeName,
  };
}

const defaultAttendanceProcessorDeps: AttendanceProcessorDeps = {
  now: () => new Date(),
  findBranchByOdooCompanyId: async (odooCompanyId) =>
    (await db.getDb()('branches')
      .where({ odoo_branch_id: String(odooCompanyId) })
      .first()) as AttendanceBranchRow | null,
  findShiftByPlanningSlotId: async (planningSlotId, branchId) =>
    (await db.getDb()('employee_shifts')
      .where({ odoo_shift_id: planningSlotId, branch_id: branchId })
      .first()) as AttendanceShiftRow | null,
  findShiftById: async (shiftId) =>
    (await db.getDb()('employee_shifts')
      .where({ id: shiftId })
      .first()) as AttendanceShiftRow | null,
  createShiftLog: async (input) =>
    (await db.getDb()('shift_logs')
      .insert(input)
      .returning('*'))[0] as AttendanceShiftLogRow,
  updateShiftById: async (shiftId, updates) =>
    ((await db.getDb()('employee_shifts')
      .where({ id: shiftId })
      .update(updates)
      .returning('*'))[0] ?? null) as AttendanceShiftRow | null,
  incrementShiftPendingApprovals: async (shiftId) =>
    ((await db.getDb()('employee_shifts')
      .where({ id: shiftId })
      .increment('pending_approvals', 1)
      .returning('*'))[0] ?? null) as AttendanceShiftRow | null,
  createShiftAuthorization: async (input) =>
    (await db.getDb()('shift_authorizations')
      .insert(input)
      .returning('*'))[0] as AttendanceShiftAuthorizationRow,
  upsertInterimShift: async (input) => {
    const knex = db.getDb();
    const existing = await knex('employee_shifts')
      .where({
        odoo_shift_id: input.odoo_shift_id,
        branch_id: input.branch_id,
      })
      .first();

    if (existing) {
      return ((await knex('employee_shifts')
        .where({ id: existing.id })
        .update(input)
        .returning('*'))[0] ?? existing) as AttendanceShiftRow;
    }

    return (await knex('employee_shifts')
      .insert(input)
      .returning('*'))[0] as AttendanceShiftRow;
  },
  reassignLogsToShift: async (attendanceId, shiftId) => {
    await db.getDb()('shift_logs')
      .where({ odoo_attendance_id: attendanceId })
      .update({ shift_id: shiftId });
  },
  findOverlappingShiftInOtherBranches: async (input) => {
    if (!input.userId) return null;
    return (await db.getDb()('employee_shifts')
      .where({ user_id: input.userId })
      .whereNot('branch_id', input.branchId)
      .andWhere('shift_start', '<', input.attendanceEnd)
      .andWhere('shift_end', '>', input.attendanceStart)
      .orderBy('shift_start', 'asc')
      .first()) as AttendanceShiftRow | null;
  },
  resolveAttendanceIdentity: defaultResolveAttendanceIdentity,
  listUserRoleMembership: async (userId) =>
    (await db.getDb()('user_roles as ur')
      .join('roles as r', 'ur.role_id', 'r.id')
      .where('ur.user_id', userId)
      .select('r.id as roleId', 'r.name as roleName')) as UserRoleMembership[],
  disableUserRole: async (userId, roleId) => {
    await db.getDb()('user_role_disables')
      .insert({
        user_id: userId,
        role_id: roleId,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict(['user_id', 'role_id'])
      .merge({ updated_at: new Date() });
  },
  enableUserRole: async (userId, roleId) => {
    await db.getDb()('user_role_disables')
      .where({ user_id: userId, role_id: roleId })
      .delete();
  },
  clearUserDisabledRoles: async (userId) => Number(await db.getDb()('user_role_disables')
    .where({ user_id: userId })
    .delete()),
  listActiveAttendancesByWebsiteUserKey: async (websiteUserKey) =>
    (await getActiveAttendancesForWebsiteUserKey(websiteUserKey))
      .map((attendance) => ({
        id: attendance.id,
        company_id: attendance.company_id,
        check_in: attendance.check_in,
      })),
  checkOutAttendancesByIds: async (attendanceIds, checkOutTime) => {
    await batchCheckOutAttendances(attendanceIds, checkOutTime);
  },
  reassignUserToSingleCheckedInBranch: (userId, branchId) =>
    reassignUserToSingleCheckedInBranch(
      userId,
      branchId,
    ),
  enqueueEarlyCheckInAuthJob: (payload, runAt) => enqueueEarlyCheckInAuthJob(payload, runAt),
  createAndDispatchNotification: (input) => createAndDispatchNotification(input),
  emitSocketEvent: (event, payload) => {
    try {
      const io = getIO();
      emitAttendanceSocketEvent(io as SocketEmitterLike, event, payload);
    } catch {
      logger.warn(`Socket.IO not available for ${event} emit`);
    }
  },
};

async function resolveInterimReason(
  deps: AttendanceProcessorDeps,
  input: {
    userId: string | null;
    branchId: string;
    attendanceStart: Date;
    attendanceEnd: Date;
  },
): Promise<'no_planning_schedule' | 'scheduled_other_branch'> {
  const otherBranchShift = await deps.findOverlappingShiftInOtherBranches(input);
  return otherBranchShift ? 'scheduled_other_branch' : 'no_planning_schedule';
}

async function applyCheckInRoleScopeAndAttendanceGuard(input: {
  deps: AttendanceProcessorDeps;
  payload: AttendancePayload;
  checkInTime: Date;
  resolvedIdentity: ResolvedAttendanceIdentity;
}): Promise<void> {
  const { deps, payload, checkInTime, resolvedIdentity } = input;
  const userId = resolvedIdentity.userId;
  const websiteUserKey = resolvedIdentity.websiteUserKey;

  if (!userId || !websiteUserKey) {
    return;
  }

  const roleMembership = await deps.listUserRoleMembership(userId);
  const roleByName = new Map<string, UserRoleMembership>(
    roleMembership.map((role) => [role.roleName, role]),
  );

  if (roleByName.has(SYSTEM_ROLES.ADMINISTRATOR)) {
    return;
  }

  const checkInRoleType = resolveCheckInRoleType(payload.x_company_id);
  const oppositeRoleType = resolveOppositeRoleType(checkInRoleType);
  const checkInRole = roleByName.get(checkInRoleType);
  const oppositeRole = roleByName.get(oppositeRoleType);

  if (!checkInRole) {
    return;
  }

  await deps.enableUserRole(userId, checkInRole.roleId);
  if (oppositeRole) {
    await deps.disableUserRole(userId, oppositeRole.roleId);
  }

  const activeAttendances = await deps.listActiveAttendancesByWebsiteUserKey(websiteUserKey);
  const attendanceIdsToCheckOut = checkInRoleType === SYSTEM_ROLES.MANAGEMENT
    ? activeAttendances
      .filter((attendance) => attendance.id !== payload.id)
      .map((attendance) => attendance.id)
    : activeAttendances
      .filter((attendance) => attendance.id !== payload.id && attendance.company_id === 1)
      .map((attendance) => attendance.id);

  if (attendanceIdsToCheckOut.length > 0) {
    await deps.checkOutAttendancesByIds(attendanceIdsToCheckOut, checkInTime);
  }

  deps.emitSocketEvent('user:auth-scope-updated', { userId });
}

export function createAttendanceProcessor(
  overrides: Partial<AttendanceProcessorDeps> = {},
) {
  const deps: AttendanceProcessorDeps = { ...defaultAttendanceProcessorDeps, ...overrides };

  return async function processAttendance(
    payload: AttendancePayload,
  ): Promise<AttendanceShiftLogRow> {
    const branch = await deps.findBranchByOdooCompanyId(payload.x_company_id);
    if (!branch) throw new AppError(404, `Branch not found for x_company_id: ${payload.x_company_id}`);

    let shift = payload.x_planning_slot_id !== false && payload.x_planning_slot_id != null
      ? await deps.findShiftByPlanningSlotId(payload.x_planning_slot_id, branch.id)
      : null;

    const isCheckOut = Boolean(payload.check_out);
    const logType = isCheckOut ? 'check_out' : 'check_in';
    const eventTime = isCheckOut
      ? parseOdooUtcDateTime(payload.check_out!)
      : parseOdooUtcDateTime(payload.check_in);

    let log = await deps.createShiftLog({
      company_id: branch.company_id,
      shift_id: shift ? shift.id : null,
      branch_id: branch.id,
      log_type: logType,
      odoo_attendance_id: payload.id,
      event_time: eventTime,
      worked_hours: payload.worked_hours ?? null,
      cumulative_minutes: payload.x_cumulative_minutes,
      odoo_payload: JSON.stringify(payload),
    });

    const resolvedIdentity = await deps.resolveAttendanceIdentity(payload);

    let updatedTotalWorkedHours: number | null = null;
    let createdInterimShift = false;
    let restoredScheduledShift: AttendanceShiftRow | null = null;
    let activeShift: AttendanceShiftRow | null = shift;
    let skipStandardAuthorizationFlow = false;

    if (!isCheckOut) {
      await applyCheckInRoleScopeAndAttendanceGuard({
        deps,
        payload,
        checkInTime: eventTime,
        resolvedIdentity,
      });
    }

    if (isCheckOut) {
      const attendanceStart = parseOdooUtcDateTime(payload.check_in);
      const attendanceEnd = eventTime;
      const linkedShiftHasOverlap = shift
        ? hasPositiveWindowOverlap(
          attendanceStart,
          attendanceEnd,
          new Date(shift.shift_start),
          new Date(shift.shift_end),
        )
        : false;
      const allowsInterimDuty = payload.x_company_id !== 1;

      let interimReason: 'no_planning_schedule' | 'scheduled_other_branch' | null = null;
      if (allowsInterimDuty && (!shift || !linkedShiftHasOverlap)) {
        interimReason = await resolveInterimReason(deps, {
          userId: (shift?.user_id as string | null | undefined) ?? resolvedIdentity.userId,
          branchId: branch.id,
          attendanceStart,
          attendanceEnd,
        });
      }

      if (interimReason) {
        skipStandardAuthorizationFlow = true;
        const interimOdooShiftId = payload.id * -1;
        const existingInterimShift = await deps.findShiftByPlanningSlotId(
          interimOdooShiftId,
          branch.id,
        );
        const totalWorkedHours = Math.round((payload.x_cumulative_minutes / 60) * 100) / 100;
        const allocatedHours = Math.max(
          0,
          roundHoursFromMs(attendanceEnd.getTime() - attendanceStart.getTime()),
        );
        const interimShift = await deps.upsertInterimShift({
          company_id: branch.company_id,
          odoo_shift_id: interimOdooShiftId,
          branch_id: branch.id,
          user_id: resolvedIdentity.userId ?? (shift?.user_id as string | null | undefined) ?? null,
          employee_name: resolvedIdentity.employeeName || String(payload.x_employee_contact_name ?? ''),
          employee_avatar_url: payload.x_employee_avatar ?? (shift?.employee_avatar_url as string | null | undefined) ?? null,
          duty_type: 'Interim Duty',
          duty_color: 0,
          shift_start: attendanceStart,
          shift_end: attendanceEnd,
          allocated_hours: allocatedHours,
          total_worked_hours: totalWorkedHours,
          status: 'ended',
          check_in_status: 'checked_out',
          odoo_payload: JSON.stringify({
            source: 'attendance',
            source_attendance_id: payload.id,
            source_planning_slot_id: payload.x_planning_slot_id === false ? null : payload.x_planning_slot_id ?? null,
            interim_reason: interimReason,
            linked_shift_id: shift?.id ?? null,
            linked_shift_odoo_id: shift?.odoo_shift_id ?? null,
            website_user_key: resolvedIdentity.websiteUserKey,
            attendance_payload: payload,
          }),
          updated_at: deps.now(),
        });

        createdInterimShift = !existingInterimShift;
        updatedTotalWorkedHours = totalWorkedHours;
        await deps.reassignLogsToShift(payload.id, interimShift.id);
        log = { ...log, shift_id: interimShift.id };
        activeShift = interimShift;

        const interimDutyAuth = await deps.createShiftAuthorization({
          company_id: branch.company_id,
          shift_id: interimShift.id,
          shift_log_id: log.id,
          branch_id: branch.id,
          user_id: interimShift.user_id ?? null,
          auth_type: INTERIM_DUTY_AUTH_TYPE,
          diff_minutes: Math.max(0, Math.round(Number(payload.x_cumulative_minutes ?? 0))),
          needs_employee_reason: false,
          status: 'pending',
        });
        await deps.incrementShiftPendingApprovals(interimShift.id as string);
        deps.emitSocketEvent('shift:authorization-new', interimDutyAuth as Record<string, unknown>);

        if (shift) {
          restoredScheduledShift = await deps.updateShiftById(shift.id, {
            status: 'open',
            check_in_status: null,
            total_worked_hours: null,
            updated_at: deps.now(),
          });
        }
      }
    }

    if (!isCheckOut && shift) {
      const shiftEnd = new Date(shift.shift_end);
      if (eventTime.getTime() >= shiftEnd.getTime()) {
        skipStandardAuthorizationFlow = true;
      } else {
        activeShift = await deps.updateShiftById(shift.id, {
          status: 'active',
          check_in_status: 'checked_in',
          updated_at: deps.now(),
        }) ?? shift;

        if (shift.user_id) {
          const userId = shift.user_id as string;
          const checkedInBranchId = branch.id as string;
          await deps.reassignUserToSingleCheckedInBranch(userId, checkedInBranchId);
          deps.emitSocketEvent('user:branch-assignments-updated', {
            userId,
            branchIds: [checkedInBranchId],
          });
        }
      }
    }

    if (isCheckOut && shift && !skipStandardAuthorizationFlow) {
      const totalWorkedHours = payload.x_cumulative_minutes / 60;
      activeShift = await deps.updateShiftById(shift.id, {
        total_worked_hours: totalWorkedHours,
        check_in_status: 'checked_out',
        updated_at: deps.now(),
      }) ?? shift;
      updatedTotalWorkedHours = totalWorkedHours;
    }

    if (shift && !skipStandardAuthorizationFlow) {
      const shiftStart = new Date(shift.shift_start);
      const shiftEnd = new Date(shift.shift_end);

      if (!isCheckOut) {
        const diffMs = shiftStart.getTime() - eventTime.getTime();
        const diffMinutes = Math.round(diffMs / 60_000);

        if (diffMinutes > 0) {
          const scheduleAt = new Date(shiftStart.getTime() + 60_000);
          await deps.enqueueEarlyCheckInAuthJob(
            {
              companyId: branch.company_id as string,
              branchId: branch.id as string,
              shiftId: shift.id as string,
              shiftLogId: log.id as string,
              userId: (shift.user_id as string) ?? null,
              checkInEventTime: eventTime.toISOString(),
            },
            scheduleAt,
          );
        } else if (diffMinutes < 0) {
          const absDiff = Math.abs(diffMinutes);
          const auth = await deps.createShiftAuthorization({
            company_id: branch.company_id,
            shift_id: shift.id as string,
            shift_log_id: log.id,
            branch_id: branch.id,
            user_id: (shift.user_id as string) ?? null,
            auth_type: 'tardiness',
            diff_minutes: absDiff,
            needs_employee_reason: true,
            status: 'pending',
          });
          await deps.incrementShiftPendingApprovals(shift.id as string);
          if (shift.user_id) {
          await deps.createAndDispatchNotification({
              userId: shift.user_id as string,
              title: 'Tardiness Authorization Required',
              message: `You checked in ${formatDiffMinutes(absDiff)} late for your shift. Please submit a reason in the Authorization Requests tab.`,
              type: 'warning',
              linkUrl: '/account/schedule',
            });
          }
          deps.emitSocketEvent('shift:authorization-new', auth as Record<string, unknown>);
        }
      } else {
        const diffMs = shiftEnd.getTime() - eventTime.getTime();
        const diffMinutes = Math.round(diffMs / 60_000);

        if (diffMinutes > 0) {
          const auth = await deps.createShiftAuthorization({
            company_id: branch.company_id,
            shift_id: shift.id as string,
            shift_log_id: log.id,
            branch_id: branch.id,
            user_id: (shift.user_id as string) ?? null,
            auth_type: 'early_check_out',
            diff_minutes: diffMinutes,
            needs_employee_reason: false,
            status: 'no_approval_needed',
          });
          deps.emitSocketEvent('shift:authorization-new', auth as Record<string, unknown>);
        } else if (diffMinutes < 0) {
          const absDiff = Math.abs(diffMinutes);
          const auth = await deps.createShiftAuthorization({
            company_id: branch.company_id,
            shift_id: shift.id as string,
            shift_log_id: log.id,
            branch_id: branch.id,
            user_id: (shift.user_id as string) ?? null,
            auth_type: 'late_check_out',
            diff_minutes: absDiff,
            needs_employee_reason: true,
            status: 'pending',
          });
          await deps.incrementShiftPendingApprovals(shift.id as string);
          if (shift.user_id) {
            await deps.createAndDispatchNotification({
              userId: shift.user_id as string,
              title: 'Late Check Out - Reason Required',
              message: `You checked out ${formatDiffMinutes(absDiff)} after your scheduled shift end. Please submit a reason in the Authorization Requests tab.`,
              type: 'warning',
              linkUrl: '/account/schedule',
            });
          }
          deps.emitSocketEvent('shift:authorization-new', auth as Record<string, unknown>);
        }
      }
    }

    if (restoredScheduledShift) {
      deps.emitSocketEvent('shift:updated', restoredScheduledShift as Record<string, unknown>);
    }

    if (activeShift) {
      deps.emitSocketEvent(
        createdInterimShift ? 'shift:new' : 'shift:updated',
        activeShift as Record<string, unknown>,
      );
    }

    if (isCheckOut && resolvedIdentity.userId && resolvedIdentity.websiteUserKey) {
      const activeAttendances = await deps.listActiveAttendancesByWebsiteUserKey(
        resolvedIdentity.websiteUserKey,
      );
      if (activeAttendances.length === 0) {
        const clearedCount = await deps.clearUserDisabledRoles(resolvedIdentity.userId);
        if (clearedCount > 0) {
          deps.emitSocketEvent('user:auth-scope-updated', {
            userId: resolvedIdentity.userId,
          });
        }
      }
    }

    deps.emitSocketEvent('shift:log-new', {
      ...log,
      branch_id: branch.id,
      shift_id: log.shift_id ?? activeShift?.id ?? null,
      total_worked_hours: updatedTotalWorkedHours,
    });

    const checkInStatusUserId =
      resolvedIdentity.userId
      ?? (activeShift?.user_id as string | null | undefined)
      ?? (shift?.user_id as string | null | undefined)
      ?? null;

    if (checkInStatusUserId) {
      deps.emitSocketEvent('user:check-in-status-updated', {
        userId: checkInStatusUserId,
      });
    }

    if (resolvedIdentity.userId) {
      deps.emitSocketEvent('user:check-in-status-updated', {
        userId: resolvedIdentity.userId,
      });
    }

    return log;
  };
}

export const processAttendance = createAttendanceProcessor();

export async function processDiscountOrder(
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_key?: string;
    x_order_lines: {
      product_name: string;
      qty: number;
      uom_name: string;
      price_unit: number;
      discount?: number;
    }[];
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  // Resolve branch by Odoo company_id
  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // Derive title from the discount line (price_unit < 0)
  const discountLine = payload.x_order_lines.find((l) => l.price_unit < 0);
  const title = discountLine ? `${discountLine.product_name} Order` : 'Discount Order';

  // Link to POS session by session name if provided
  let posSessionId: string | null = null;
  if (payload.x_session_name) {
    const session = await tenantDb('pos_sessions')
      .where({ branch_id: branch.id, session_name: payload.x_session_name })
      .first();
    if (session) posSessionId = session.id;
  }

  const cashierUserId = await resolveUserIdByUserKey(payload.x_website_key);

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title,
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'discount_order',
      cashier_user_id: cashierUserId,
    })
    .returning('*');

  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odoo_payload: payload,
        images: [],
      });
  } catch {
    logger.warn('Socket.IO not available for discount order emit');
  }

  return verification;
}

export async function processRefundOrder(
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_key?: string;
    x_order_lines: {
      product_name: string;
      qty: number;
      uom_name: string;
      price_unit: number;
      discount?: number;
    }[];
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // Link to POS session by session name if provided
  let posSessionId: string | null = null;
  if (payload.x_session_name) {
    const session = await tenantDb('pos_sessions')
      .where({ branch_id: branch.id, session_name: payload.x_session_name })
      .first();
    if (session) posSessionId = session.id;
  }

  const cashierUserId = await resolveUserIdByUserKey(payload.x_website_key);

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: 'Refund Order',
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'refund_order',
      cashier_user_id: cashierUserId,
    })
    .returning('*');

  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odoo_payload: payload,
        images: [],
      });
  } catch {
    logger.warn('Socket.IO not available for refund order emit');
  }

  return verification;
}

export async function processTokenPayOrder(
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_key?: string;
    x_customer_website_key?: string;
    x_order_lines: {
      product_name: string;
      qty: number;
      uom_name: string;
      price_unit: number;
      discount?: number;
    }[];
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // Link to POS session by session name if provided
  let posSessionId: string | null = null;
  if (payload.x_session_name) {
    const session = await tenantDb('pos_sessions')
      .where({ branch_id: branch.id, session_name: payload.x_session_name })
      .first();
    if (session) posSessionId = session.id;
  }

  const cashierUserId = await resolveUserIdByUserKey(payload.x_website_key);
  const customerUserId = await resolveUserIdByUserKey(payload.x_customer_website_key);

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: 'Token Pay Order',
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'token_pay_order',
      cashier_user_id: cashierUserId,
      customer_user_id: customerUserId,
    })
    .returning('*');

  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odoo_payload: payload,
        images: [],
      });
  } catch {
    logger.warn('Socket.IO not available for token pay order emit');
  }

  return verification;
}

export async function processNonCashOrder(
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_key?: string;
    x_order_lines: {
      product_name: string;
      qty: number;
      uom_name: string;
      price_unit: number;
      discount?: number;
    }[];
    x_payments?: {
      id?: number;
      name: string;
      amount: number;
    }[];
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // Link to POS session by session name if provided
  let posSessionId: string | null = null;
  if (payload.x_session_name) {
    const session = await tenantDb('pos_sessions')
      .where({ branch_id: branch.id, session_name: payload.x_session_name })
      .first();
    if (session) posSessionId = session.id;
  }

  const cashierUserId = await resolveUserIdByUserKey(payload.x_website_key);

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: 'Non-Cash Order',
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'non_cash_order',
      cashier_user_id: cashierUserId,
    })
    .returning('*');

  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odoo_payload: payload,
        images: [],
      });
  } catch {
    logger.warn('Socket.IO not available for non-cash order emit');
  }

  return verification;
}

export async function processISPEPurchaseOrder(
  payload: {
    company_id: number;
    name: string;
    date_approve?: string;
    partner_ref?: string;
    amount_total: number;
    x_pos_session?: string;
    x_order_line_details?: {
      product_id?: number;
      product_name: string;
      quantity: number;
      uom_name: string;
      price_unit: number;
    }[];
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // Link to POS session by session name if provided
  let posSessionId: string | null = null;
  if (payload.x_pos_session) {
    const session = await tenantDb('pos_sessions')
      .where({ branch_id: branch.id, session_name: payload.x_pos_session })
      .first();
    if (session) posSessionId = session.id;
  }

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: `ISPE Purchase Order ${payload.name}`,
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'ispe_purchase_order',
      cashier_user_id: null,
    })
    .returning('*');

  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odoo_payload: payload,
        images: [],
      });
  } catch {
    logger.warn('Socket.IO not available for ISPE purchase order emit');
  }

  return verification;
}

export async function processRegisterCash(
  payload: {
    company_id: number;
    amount_total: number;
    create_date?: string;
    payment_ref: string;
    [key: string]: unknown;
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  // Parse direction and session name from payment_ref
  // Format: {session_name}-in-{reason} or {session_name}-out-{reason}
  const isOut = payload.payment_ref.includes('-out-');
  const sessionName = payload.payment_ref.split(/-in-|-out-/)[0];

  let posSessionId: string | null = null;
  if (sessionName) {
    const session = await tenantDb('pos_sessions')
      .where({ branch_id: branch.id, session_name: sessionName })
      .first();
    if (session) posSessionId = session.id;
  }

  const verificationType = isOut ? 'register_cash_out' : 'register_cash_in';
  const title = isOut ? 'Register Cash Out' : 'Register Cash In';

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title,
      amount: payload.amount_total,
      status: 'pending',
      verification_type: verificationType,
      cashier_user_id: null,
    })
    .returning('*');

  try {
    const io = getIO();
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', {
        ...verification,
        odoo_payload: payload,
        images: [],
      });
  } catch {
    logger.warn('Socket.IO not available for register cash emit');
  }

  return verification;
}

// ── POS Session Close ──────────────────────────────────────────────

export async function processPosSessionClose(
  payload: {
    _action?: string;
    _id?: number;
    _model?: string;
    id?: number;
    name: string;
    display_name?: string;
    company_id: number;
    cash_register_balance_start?: number;
    cash_register_balance_end?: number;
    cash_register_balance_end_real?: number;
    cash_register_difference?: number;
    closing_notes?: string;
    x_company_name?: string;
    x_opening_pcf?: number;
    x_ispe_total?: number;
    x_pos_name?: string;
    x_discount_orders?: { order_id: number; price_unit: number; product_name: string; qty: number; product_id?: number; discount?: number; uom_name?: string }[];
    x_refund_orders?: { order_id: number; price_unit: number; product_name: string; qty: number; product_id?: number; discount?: number; uom_name?: string }[];
    x_payment_methods?: { amount: number; payment_method_id: number; payment_method_name: string }[];
    x_statement_lines?: { amount: number; payment_ref: string }[];
  },
) {
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  const existing = await tenantDb('pos_sessions')
    .where({ odoo_session_id: payload.name, branch_id: branch.id })
    .first();

  if (!existing) {
    throw new AppError(404, `Session not found: ${payload.name}`);
  }

  // ── Compute closing reports ──

  const paymentMethods = payload.x_payment_methods ?? [];
  const discountOrders = payload.x_discount_orders ?? [];
  const refundOrders = payload.x_refund_orders ?? [];
  const statementLines = payload.x_statement_lines ?? [];

  // Sales Report
  const netSales = paymentMethods.reduce((sum, pm) => sum + pm.amount, 0);

  const discountGroups: { name: string; totalAmount: number }[] = [];
  const discountMap = new Map<string, number>();
  for (const d of discountOrders) {
    const abs = Math.abs(d.price_unit * d.qty);
    discountMap.set(d.product_name, (discountMap.get(d.product_name) ?? 0) + abs);
  }
  for (const [name, totalAmount] of discountMap) {
    discountGroups.push({ name, totalAmount });
  }

  const totalDiscounts = discountGroups.reduce((sum, g) => sum + g.totalAmount, 0);
  const tokenPayTotal = discountGroups.find((g) => g.name === 'Token Pay')?.totalAmount ?? 0;
  const refundClaims = refundOrders.reduce((sum, r) => sum + Math.abs(r.price_unit * r.qty), 0);
  const grossSales = netSales + refundClaims + totalDiscounts;

  const salesReport = { grossSales, discountGroups, tokenPayTotal, refundClaims, netSales };

  // Non-Cash Report
  const nonCashMethods = paymentMethods
    .filter((pm) => pm.payment_method_name !== 'Cash')
    .map((pm) => ({ name: pm.payment_method_name, amount: pm.amount }));
  const totalNonCash = nonCashMethods.reduce((sum, m) => sum + m.amount, 0);
  const nonCashReport = { methods: nonCashMethods, totalNonCash };

  // Cash Report
  const cashPayments = paymentMethods.find((pm) => pm.payment_method_name === 'Cash')?.amount ?? 0;

  const parseReason = (ref: string) => ref.split(/-in-|-out-/).slice(1).join('') || ref;

  const cashIns = statementLines
    .filter((l) => l.amount > 0)
    .map((l) => ({ reason: parseReason(l.payment_ref), amount: l.amount }));
  const cashOuts = statementLines
    .filter((l) => l.amount < 0)
    .map((l) => ({ reason: parseReason(l.payment_ref), amount: Math.abs(l.amount) }));

  const cashReport = { cashPayments, cashIns, cashOuts };

  // Closing Register Details
  const closingRegister = {
    closingNotes: payload.closing_notes ?? null,
    closingCashCounted: payload.cash_register_balance_end_real ?? null,
    closingCashExpected: payload.cash_register_balance_end ?? null,
    closingCashDifference: payload.cash_register_difference ?? null,
  };

  const closingReports = { salesReport, nonCashReport, cashReport, closingRegister };

  // ── Compute closing PCF expected ──

  const isPCFLine = (ref: string) => {
    const lower = ref.toLowerCase();
    return lower.includes('pcf') || lower.includes('petty');
  };

  const pcfCashOut = statementLines
    .filter((l) => l.amount < 0 && isPCFLine(l.payment_ref))
    .reduce((sum, l) => sum + Math.abs(l.amount), 0);
  const pcfCashIn = statementLines
    .filter((l) => l.amount > 0 && isPCFLine(l.payment_ref))
    .reduce((sum, l) => sum + l.amount, 0);
  const totalPCFTopup = pcfCashOut - pcfCashIn;

  const closingPCFExpected =
    (payload.x_opening_pcf ?? 0) + totalPCFTopup + (payload.x_ispe_total ?? 0);

  // ── Update session ──

  const [session] = await tenantDb('pos_sessions')
    .where({ id: existing.id })
    .update({
      odoo_payload: JSON.stringify(payload),
      session_name: payload.display_name || payload.name,
      status: 'closed',
      closed_at: new Date(),
      closing_reports: JSON.stringify(closingReports),
      updated_at: new Date(),
    })
    .returning('*');

  // ── Create closing PCF breakdown verification ──

  const [closingPCFVerification] = await tenantDb('pos_verifications')
    .insert({
      company_id: branch.company_id,
      branch_id: branch.id,
      pos_session_id: session.id,
      odoo_payload: JSON.stringify(payload),
      title: 'Closing PCF Report',
      amount: closingPCFExpected,
      status: 'pending',
      verification_type: 'closing_pcf_breakdown',
    })
    .returning('*');

  // ── Emit socket events ──

  try {
    const io = getIO();
    io.of('/pos-session')
      .to(`branch:${branch.id}`)
      .emit('pos-session:updated', { ...session, verifications: [] });
    io.of('/pos-verification')
      .to(`branch:${branch.id}`)
      .emit('pos-verification:new', { ...closingPCFVerification, images: [] });
  } catch {
    logger.warn('Socket.IO not available for POS session close emit');
  }

  return session;
}

export function computeCssReward(amountTotal: number): number {
  const [min, max] = amountTotal < 150
    ? [7, 10]
    : amountTotal < 400
      ? [10, 15]
      : amountTotal < 800
        ? [15, 25]
        : [25, 30];
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

export async function createCssAudit(payload: {
  id?: number;
  company_id: number;
  pos_reference: string;
  date_order: string;
  cashier: string;
  amount_total: number;
  x_session_name?: string;
  x_company_name?: string;
  x_website_key?: string;
  x_order_lines: Array<{
    product_name: string;
    qty: number;
    price_unit: number;
  }>;
  x_payments?: Array<{
    id?: number;
    name: string;
    amount: number;
  }>;
}): Promise<void> {
  if (DISABLED_AUDIT_ODOO_COMPANY_IDS.has(Number(payload.company_id))) {
    logger.info(
      { odooCompanyId: payload.company_id, posReference: payload.pos_reference },
      'Skipping CSS audit creation for temporarily disabled Odoo company',
    );
    return;
  }

  const company = await resolveCompanyByOdooBranchId(payload.company_id);
  const tenantDb = db.getDb();

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first('id');

  if (!branch) {
    throw new AppError(404, `Branch not found for company_id: ${payload.company_id}`);
  }

  const record = {
    company_id: company.id,
    type: 'customer_service',
    status: 'pending',
    branch_id: branch.id,
    monetary_reward: computeCssReward(payload.amount_total),
    css_odoo_order_id: payload.id ?? null,
    css_pos_reference: payload.pos_reference,
    css_session_name: payload.x_session_name ?? null,
    css_company_name: payload.x_company_name ?? null,
    css_cashier_name: payload.cashier,
    css_cashier_user_key: payload.x_website_key ?? null,
    css_date_order: payload.date_order ? new Date(`${payload.date_order.replace(' ', 'T')}Z`) : null,
    css_amount_total: payload.amount_total,
    css_order_lines: JSON.stringify(payload.x_order_lines ?? []),
    css_payments: JSON.stringify(payload.x_payments ?? []),
    created_at: new Date(),
    updated_at: new Date(),
  };

  let audit: any;
  try {
    [audit] = await tenantDb('store_audits').insert(record).returning('*');
  } catch (error: any) {
    if (error?.code === '23505') {
      return;
    }
    throw error;
  }

  emitStoreAuditEvent(String(company.id), 'store-audit:new', audit);
}
