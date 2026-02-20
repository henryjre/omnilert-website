import { db } from '../config/database.js';
import { getIO } from '../config/socket.js';
import { enqueueEarlyCheckInAuthJob } from './attendanceQueue.service.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';

export async function resolveCompanyByOdooBranchId(odooCompanyId: number) {
  const masterDb = db.getMasterDb();
  const companies = await masterDb('companies').where({ is_active: true });

  for (const company of companies) {
    try {
      const tenantDb = await db.getTenantDb(company.db_name);
      const branch = await tenantDb('branches')
        .where({ odoo_branch_id: String(odooCompanyId) })
        .first();
      if (branch) {
        return company;
      }
    } catch {
      // skip unreachable tenant DBs
    }
  }

  throw new AppError(404, `No company found for Odoo company_id: ${odooCompanyId}`);
}

export async function processPosVerification(
  companyDbName: string,
  payload: {
    branchId: string;
    transactionId: string;
    title: string;
    description?: string;
    amount?: number;
    data?: Record<string, unknown>;
  },
) {
  const tenantDb = await db.getTenantDb(companyDbName);

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
  companyDbName: string,
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
  const tenantDb = await db.getTenantDb(companyDbName);

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
  companyDbName: string,
  payload: {
    id: number;
    company_id: number;
    start_datetime: string;
    end_datetime: string;
    x_employee_avatar?: string;
    x_employee_contact_name: string;
    x_role_color: number;
    x_role_name: string;
    x_website_id?: string;
    [key: string]: unknown;
  },
) {
  const tenantDb = await db.getTenantDb(companyDbName);

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.company_id) })
    .first();
  if (!branch) throw new AppError(404, `Branch not found for odoo_branch_id: ${payload.company_id}`);

  // Parse UTC datetimes (Odoo sends "YYYY-MM-DD HH:MM:SS" without timezone indicator)
  const shiftStart = new Date(payload.start_datetime + ' UTC');
  const shiftEnd = new Date(payload.end_datetime + ' UTC');
  const allocatedHours = (shiftEnd.getTime() - shiftStart.getTime()) / 3600000;

  // Resolve internal user_id from x_website_id if present
  let userId: string | null = null;
  if (payload.x_website_id) {
    const user = await tenantDb('users').where({ id: payload.x_website_id }).first();
    if (user) userId = user.id;
  }

  const existing = await tenantDb('employee_shifts')
    .where({ odoo_shift_id: payload.id, branch_id: branch.id })
    .first();

  let shift: Record<string, unknown>;

  if (existing) {
    // Diff tracked fields to create a change log
    const TRACKED_FIELDS = [
      'start_datetime', 'end_datetime',
      'x_role_name', 'x_role_color',
      'x_employee_contact_name', 'x_employee_avatar',
      'x_website_id',
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
  } else {
    const [inserted] = await tenantDb('employee_shifts')
      .insert({
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
  }

  return shift;
}

export async function processPlanningSlotDelete(
  companyDbName: string,
  payload: {
    _id?: number;
    id?: number;
    company_id: number;
    start_datetime?: string;
    [key: string]: unknown;
  },
) {
  const tenantDb = await db.getTenantDb(companyDbName);

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

  await tenantDb.transaction(async (trx) => {
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

export async function processAttendance(
  companyDbName: string,
  payload: {
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
    [key: string]: unknown;
  },
) {
  const tenantDb = await db.getTenantDb(companyDbName);

  const branch = await tenantDb('branches')
    .where({ odoo_branch_id: String(payload.x_company_id) })
    .first();
  if (!branch) throw new AppError(404, `Branch not found for x_company_id: ${payload.x_company_id}`);

  // Resolve shift if x_planning_slot_id is set
  let shift: Record<string, unknown> | null = null;
  if (payload.x_planning_slot_id !== false && payload.x_planning_slot_id != null) {
    shift = await tenantDb('employee_shifts')
      .where({ odoo_shift_id: payload.x_planning_slot_id, branch_id: branch.id })
      .first() ?? null;
  }

  const isCheckOut = !!payload.check_out;
  const logType = isCheckOut ? 'check_out' : 'check_in';
  const eventTime = new Date(
    isCheckOut ? payload.check_out! + ' UTC' : payload.check_in + ' UTC',
  );

  const [log] = await tenantDb('shift_logs')
    .insert({
      shift_id: shift ? (shift.id as string) : null,
      branch_id: branch.id,
      log_type: logType,
      odoo_attendance_id: payload.id,
      event_time: eventTime,
      worked_hours: payload.worked_hours ?? null,
      cumulative_minutes: payload.x_cumulative_minutes,
      odoo_payload: JSON.stringify(payload),
    })
    .returning('*');

  // On check-out, update total_worked_hours and check_in_status on the shift
  let updatedTotalWorkedHours: number | null = null;
  if (isCheckOut && shift) {
    const totalWorkedHours = payload.x_cumulative_minutes / 60;
    await tenantDb('employee_shifts')
      .where({ id: shift.id as string })
      .update({ total_worked_hours: totalWorkedHours, check_in_status: 'checked_out', updated_at: new Date() });
    updatedTotalWorkedHours = totalWorkedHours;
  }

  // On check-in, update status to 'active' and check_in_status to 'checked_in'
  if (!isCheckOut && shift) {
    await tenantDb('employee_shifts')
      .where({ id: shift.id as string })
      .update({ status: 'active', check_in_status: 'checked_in', updated_at: new Date() });

    // Reassign checked-in employee to this branch while preserving assignments to main branches.
    if (shift.user_id) {
      const userId = shift.user_id as string;
      const userBranchAssignments = await tenantDb('user_branches').where({ user_id: userId }).select('branch_id');
      const mainBranchRows = await tenantDb('branches').where({ is_main_branch: true }).select('id');
      const mainBranchIds = mainBranchRows.map((row: { id: string }) => row.id);
      const alreadyAssignedToCheckedInBranch = userBranchAssignments.some(
        (assignment: { branch_id: string }) => assignment.branch_id === branch.id,
      );

      await tenantDb.transaction(async (trx) => {
        let deleteQuery = trx('user_branches').where({ user_id: userId });
        if (mainBranchIds.length > 0) {
          deleteQuery = deleteQuery.whereNotIn('branch_id', mainBranchIds);
        }
        await deleteQuery.delete();

        if (!alreadyAssignedToCheckedInBranch) {
          await trx('user_branches')
            .insert({
              user_id: userId,
              branch_id: branch.id,
              is_primary: false,
            })
            .onConflict(['user_id', 'branch_id'])
            .ignore();
        }
      });

      // Push updated branch assignments to the active web client for immediate UI sync.
      try {
        const updatedAssignments = await tenantDb('user_branches')
          .where({ user_id: userId })
          .select('branch_id');
        const updatedBranchIds = updatedAssignments.map((row: { branch_id: string }) => row.branch_id);
        getIO()
          .of('/notifications')
          .to(`user:${userId}`)
          .emit('user:branch-assignments-updated', { branchIds: updatedBranchIds });
      } catch {
        logger.warn('Socket.IO not available for branch assignment update emit');
      }
    }
  }

  // Authorization detection — only when linked to a shift
  if (shift) {
    const shiftStart = new Date(shift.shift_start as string);
    const shiftEnd = new Date(shift.shift_end as string);

    if (!isCheckOut) {
      // CHECK-IN
      const diffMs = shiftStart.getTime() - eventTime.getTime();
      const diffMinutes = Math.round(diffMs / 60000);

      if (diffMinutes > 0) {
        // Checked in before shift start - schedule delayed early check-in authorization.
        if (shiftStart.getTime() > eventTime.getTime()) {
          const scheduleAt = new Date(shiftStart.getTime() + 60_000);
          await enqueueEarlyCheckInAuthJob(
            {
              companyDbName,
              branchId: branch.id as string,
              shiftId: shift.id as string,
              shiftLogId: log.id as string,
              userId: (shift.user_id as string) ?? null,
              checkInEventTime: eventTime.toISOString(),
            },
            scheduleAt,
          );
        }
      } else if (diffMinutes < 0) {
        // Checked in after shift start — tardiness
        const absDiff = Math.abs(diffMinutes);
        const [auth] = await tenantDb('shift_authorizations')
          .insert({
            shift_id: shift.id as string,
            shift_log_id: log.id,
            branch_id: branch.id,
            user_id: (shift.user_id as string) ?? null,
            auth_type: 'tardiness',
            diff_minutes: absDiff,
            needs_employee_reason: true,
            status: 'pending',
          })
          .returning('*');
        await tenantDb('employee_shifts')
          .where({ id: shift.id as string })
          .increment('pending_approvals', 1);
        if (shift.user_id) {
          const [notif] = await tenantDb('employee_notifications').insert({
            user_id: shift.user_id as string,
            title: 'Tardiness Authorization Required',
            message: `You checked in ${formatDiffMinutes(absDiff)} late for your shift. Please submit a reason in the Authorization Requests tab.`,
            type: 'warning',
            link_url: '/account/schedule',
          }).returning('*');
          try {
            getIO().of('/notifications').to(`user:${shift.user_id}`).emit('notification:new', notif);
          } catch { /* socket unavailable */ }
        }
        try {
          getIO().of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:authorization-new', auth);
        } catch { /* socket unavailable */ }
      }
    } else {
      // CHECK-OUT
      const diffMs = shiftEnd.getTime() - eventTime.getTime();
      const diffMinutes = Math.round(diffMs / 60000);

      if (diffMinutes > 0) {
        // Checked out before shift end — early check-out (no approval needed)
        const [auth] = await tenantDb('shift_authorizations')
          .insert({
            shift_id: shift.id as string,
            shift_log_id: log.id,
            branch_id: branch.id,
            user_id: (shift.user_id as string) ?? null,
            auth_type: 'early_check_out',
            diff_minutes: diffMinutes,
            needs_employee_reason: false,
            status: 'no_approval_needed',
          })
          .returning('*');
        try {
          getIO().of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:authorization-new', auth);
        } catch { /* socket unavailable */ }
      } else if (diffMinutes < 0) {
        // Checked out after shift end — late check-out
        const absDiff = Math.abs(diffMinutes);
        const [auth] = await tenantDb('shift_authorizations')
          .insert({
            shift_id: shift.id as string,
            shift_log_id: log.id,
            branch_id: branch.id,
            user_id: (shift.user_id as string) ?? null,
            auth_type: 'late_check_out',
            diff_minutes: absDiff,
            needs_employee_reason: true,
            status: 'pending',
          })
          .returning('*');
        await tenantDb('employee_shifts')
          .where({ id: shift.id as string })
          .increment('pending_approvals', 1);
        if (shift.user_id) {
          const [notif] = await tenantDb('employee_notifications').insert({
            user_id: shift.user_id as string,
            title: 'Late Check Out — Reason Required',
            message: `You checked out ${formatDiffMinutes(absDiff)} after your scheduled shift end. Please submit a reason in the Authorization Requests tab.`,
            type: 'warning',
            link_url: '/account/schedule',
          }).returning('*');
          try {
            getIO().of('/notifications').to(`user:${shift.user_id}`).emit('notification:new', notif);
          } catch { /* socket unavailable */ }
        }
        try {
          getIO().of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:authorization-new', auth);
        } catch { /* socket unavailable */ }
      }
    }
  }

  try {
    const io = getIO();
    io.of('/employee-shifts')
      .to(`branch:${branch.id}`)
      .emit('shift:log-new', {
        ...log,
        total_worked_hours: updatedTotalWorkedHours,
      });
    // Emit updated shift so list view refreshes status/check_in_status
    if (shift) {
      const refreshedShift = await tenantDb('employee_shifts').where({ id: shift.id as string }).first();
      if (refreshedShift) {
        io.of('/employee-shifts').to(`branch:${branch.id}`).emit('shift:updated', refreshedShift);
      }
    }
  } catch {
    logger.warn('Socket.IO not available for attendance log emit');
  }

  return log;
}

export async function processDiscountOrder(
  companyDbName: string,
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_id?: string;
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
  const tenantDb = await db.getTenantDb(companyDbName);

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

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title,
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'discount_order',
      cashier_user_id: payload.x_website_id || null,
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
  companyDbName: string,
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_id?: string;
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
  const tenantDb = await db.getTenantDb(companyDbName);

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

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: 'Refund Order',
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'refund_order',
      cashier_user_id: payload.x_website_id || null,
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
  companyDbName: string,
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_id?: string;
    x_customer_website_id?: string;
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
  const tenantDb = await db.getTenantDb(companyDbName);

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

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: 'Token Pay Order',
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'token_pay_order',
      cashier_user_id: payload.x_website_id || null,
      customer_user_id: payload.x_customer_website_id || null,
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
  companyDbName: string,
  payload: {
    company_id: number;
    pos_reference: string;
    date_order: string;
    cashier: string;
    amount_total: number;
    x_session_name?: string;
    x_company_name?: string;
    x_website_id?: string;
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
  const tenantDb = await db.getTenantDb(companyDbName);

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

  const [verification] = await tenantDb('pos_verifications')
    .insert({
      branch_id: branch.id,
      pos_session_id: posSessionId,
      odoo_payload: JSON.stringify(payload),
      title: 'Non-Cash Order',
      amount: payload.amount_total,
      status: 'pending',
      verification_type: 'non_cash_order',
      cashier_user_id: payload.x_website_id || null,
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
  companyDbName: string,
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
  const tenantDb = await db.getTenantDb(companyDbName);

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
  companyDbName: string,
  payload: {
    company_id: number;
    amount_total: number;
    create_date?: string;
    payment_ref: string;
    [key: string]: unknown;
  },
) {
  const tenantDb = await db.getTenantDb(companyDbName);

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
  companyDbName: string,
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
  const tenantDb = await db.getTenantDb(companyDbName);

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

