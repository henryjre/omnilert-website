import type { Knex } from 'knex';
import { db } from '../config/database.js';
import { AppError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import { createAndDispatchNotification } from './notification.service.js';
import {
  getResourceIdByWebsiteUserKeyAndCompanyId,
  updatePlanningSlotResource,
  updatePlanningSlotState,
} from './odoo.service.js';

type CompanyRow = {
  id: string;
  name: string;
  slug: string;
  db_name: string;
  is_active: boolean;
};

type ShiftRow = {
  id: string;
  branch_id: string;
  user_id: string | null;
  employee_name: string;
  employee_avatar_url: string | null;
  duty_type: string | null;
  shift_start: string;
  shift_end: string;
  allocated_hours: string | number | null;
  status: string;
  odoo_shift_id: number;
  pending_approvals: number;
  branch_name: string | null;
  branch_odoo_id: string | null;
};

type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  user_key: string | null;
  is_active: boolean;
  employment_status: string;
};

type ShiftExchangeRequestRow = {
  id: string;
  requester_user_id: string;
  accepting_user_id: string;
  requested_by: string;
  requester_company_id: string;
  requester_company_db_name: string;
  requester_branch_id: string;
  requester_shift_id: string;
  requester_shift_odoo_id: number;
  accepting_company_id: string;
  accepting_company_db_name: string;
  accepting_branch_id: string;
  accepting_shift_id: string;
  accepting_shift_odoo_id: number;
  status: 'pending' | 'approved' | 'rejected';
  approval_stage: 'awaiting_employee' | 'awaiting_hr' | 'resolved';
  employee_decision_at: string | null;
  employee_rejection_reason: string | null;
  hr_decision_by: string | null;
  hr_decision_at: string | null;
  hr_rejection_reason: string | null;
  created_at: string;
  updated_at: string;
};

type TenantContext = {
  company: CompanyRow;
  tenantDb: Knex;
};

type ShiftOption = {
  company_id: string;
  company_name: string;
  company_slug: string;
  company_db_name: string;
  shift_id: string;
  odoo_shift_id: number;
  branch_id: string;
  branch_name: string | null;
  branch_odoo_id: string | null;
  user_id: string;
  employee_name: string;
  employee_avatar_url: string | null;
  duty_type: string | null;
  shift_start: string;
  shift_end: string;
  allocated_hours: string | number | null;
};

type ShiftExchangeDetail = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  approval_stage: 'awaiting_employee' | 'awaiting_hr' | 'resolved';
  created_at: string;
  updated_at: string;
  employee_decision_at: string | null;
  employee_rejection_reason: string | null;
  hr_decision_at: string | null;
  hr_rejection_reason: string | null;
  requester: {
    user_id: string;
    name: string;
    email: string;
    company_id: string;
    company_name: string;
    company_slug: string;
    branch_id: string;
    branch_name: string | null;
    shift_id: string;
    shift_start: string | null;
    shift_end: string | null;
    duty_type: string | null;
    odoo_shift_id: number;
  };
  accepting: {
    user_id: string;
    name: string;
    email: string;
    company_id: string;
    company_name: string;
    company_slug: string;
    branch_id: string;
    branch_name: string | null;
    shift_id: string;
    shift_start: string | null;
    shift_end: string | null;
    duty_type: string | null;
    odoo_shift_id: number;
  };
  requested_by: {
    user_id: string;
    name: string;
  };
  hr_decision_by: {
    user_id: string;
    name: string;
  } | null;
  can_respond: boolean;
  can_approve: boolean;
  can_reject: boolean;
  approval_mode: 'hr' | 'management_fallback' | null;
};

type ApproverMode = 'hr' | 'management_fallback';

const SHIFT_EXCHANGE_TABLE = 'shift_exchange_requests';
const HR_ROLE_NAME = 'human resources';
const MANAGEMENT_ROLE_NAME = 'management';

function roleNameEquals(value: string, expectedLowercase: string): boolean {
  return value.trim().toLowerCase() === expectedLowercase;
}

function hasRole(roleNames: string[], expectedLowercase: string): boolean {
  return roleNames.some((name) => roleNameEquals(name, expectedLowercase));
}

function formatUserName(user: Pick<UserRow, 'first_name' | 'last_name'> | null): string {
  if (!user) return 'Unknown User';
  const full = `${user.first_name} ${user.last_name}`.trim();
  return full || 'Unknown User';
}

function isSuspended(user: Pick<UserRow, 'employment_status'>): boolean {
  return String(user.employment_status ?? '').toLowerCase() === 'suspended';
}

async function getActiveCompanyById(masterDb: Knex, companyId: string): Promise<CompanyRow> {
  const company = await masterDb('companies')
    .where({ id: companyId, is_active: true })
    .first('id', 'name', 'slug', 'db_name', 'is_active');
  if (!company) {
    throw new AppError(404, `Company not found or inactive: ${companyId}`);
  }
  return company as CompanyRow;
}

async function getTenantContextByCompanyId(
  masterDb: Knex,
  companyId: string,
  cache: Map<string, TenantContext>,
): Promise<TenantContext> {
  const cached = cache.get(companyId);
  if (cached) return cached;
  const company = await getActiveCompanyById(masterDb, companyId);
  const tenantDb = await db.getTenantDb(String(company.db_name));
  const context = { company, tenantDb };
  cache.set(companyId, context);
  return context;
}

async function getShiftById(tenantDb: Knex, shiftId: string): Promise<ShiftRow | null> {
  const row = await tenantDb('employee_shifts as es')
    .leftJoin('branches as branches', 'es.branch_id', 'branches.id')
    .where('es.id', shiftId)
    .select(
      'es.id',
      'es.branch_id',
      'es.user_id',
      'es.employee_name',
      'es.employee_avatar_url',
      'es.duty_type',
      'es.shift_start',
      'es.shift_end',
      'es.allocated_hours',
      'es.status',
      'es.odoo_shift_id',
      'es.pending_approvals',
      'branches.name as branch_name',
      'branches.odoo_branch_id as branch_odoo_id',
    )
    .first();
  return (row as ShiftRow | undefined) ?? null;
}

async function listOpenShiftsWithUsers(tenantDb: Knex): Promise<ShiftRow[]> {
  const rows = await tenantDb('employee_shifts as es')
    .leftJoin('branches as branches', 'es.branch_id', 'branches.id')
    .where('es.status', 'open')
    .whereNotNull('es.user_id')
    .select(
      'es.id',
      'es.branch_id',
      'es.user_id',
      'es.employee_name',
      'es.employee_avatar_url',
      'es.duty_type',
      'es.shift_start',
      'es.shift_end',
      'es.allocated_hours',
      'es.status',
      'es.odoo_shift_id',
      'es.pending_approvals',
      'branches.name as branch_name',
      'branches.odoo_branch_id as branch_odoo_id',
    )
    .orderBy('es.shift_start', 'asc');
  return rows as ShiftRow[];
}

async function loadUsersByIds(masterDb: Knex, userIds: string[]): Promise<Record<string, UserRow>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return {};
  const rows = await masterDb('users')
    .whereIn('id', unique)
    .select('id', 'first_name', 'last_name', 'email', 'user_key', 'is_active', 'employment_status');
  const map: Record<string, UserRow> = {};
  for (const row of rows) {
    map[String(row.id)] = row as UserRow;
  }
  return map;
}

async function hasPendingRequestForShift(
  masterDb: Knex,
  companyId: string,
  shiftId: string,
): Promise<boolean> {
  const row = await masterDb(SHIFT_EXCHANGE_TABLE)
    .where('status', 'pending')
    .andWhere((builder) => {
      builder
        .where((inner) => inner.where('requester_company_id', companyId).andWhere('requester_shift_id', shiftId))
        .orWhere((inner) => inner.where('accepting_company_id', companyId).andWhere('accepting_shift_id', shiftId));
    })
    .first('id');
  return Boolean(row);
}

async function loadDesignationSets(masterDb: Knex, userIds: string[]): Promise<{
  accessSet: Set<string>;
  branchSet: Set<string>;
}> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) {
    return { accessSet: new Set(), branchSet: new Set() };
  }

  const [accessRows, branchRows] = await Promise.all([
    masterDb('user_company_access')
      .whereIn('user_id', unique)
      .andWhere('is_active', true)
      .select('user_id', 'company_id'),
    masterDb('user_company_branches')
      .whereIn('user_id', unique)
      .select('user_id', 'company_id', 'branch_id'),
  ]);

  const accessSet = new Set<string>(
    accessRows.map((row: any) => `${row.user_id}:${row.company_id}`),
  );
  const branchSet = new Set<string>(
    branchRows.map((row: any) => `${row.user_id}:${row.company_id}:${row.branch_id}`),
  );
  return { accessSet, branchSet };
}

async function enrichDesignationSetsFromTenantUserBranches(input: {
  masterDb: Knex;
  designation: { accessSet: Set<string>; branchSet: Set<string> };
  userIds: string[];
  companyIds: string[];
  tenantCache: Map<string, TenantContext>;
}) {
  const uniqueUserIds = Array.from(new Set(input.userIds.filter(Boolean)));
  const uniqueCompanyIds = Array.from(new Set(input.companyIds.filter(Boolean)));
  if (uniqueUserIds.length === 0 || uniqueCompanyIds.length === 0) return;

  for (const companyId of uniqueCompanyIds) {
    try {
      const context = await getTenantContextByCompanyId(input.masterDb, companyId, input.tenantCache);
      const rows = await context.tenantDb('user_branches')
        .whereIn('user_id', uniqueUserIds)
        .select('user_id', 'branch_id');
      for (const row of rows as Array<{ user_id: string; branch_id: string }>) {
        if (!row.user_id || !row.branch_id) continue;
        input.designation.branchSet.add(`${row.user_id}:${companyId}:${row.branch_id}`);
      }
    } catch (error) {
      logger.warn(
        {
          companyId,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to load tenant user_branches for shift-exchange designation fallback',
      );
    }
  }
}

function isDesignatedToCompanyBranch(
  designation: { accessSet: Set<string>; branchSet: Set<string> },
  userId: string,
  companyId: string,
  branchId: string,
): boolean {
  return (
    designation.accessSet.has(`${userId}:${companyId}`)
    && designation.branchSet.has(`${userId}:${companyId}:${branchId}`)
  );
}

async function getApproverMode(masterDb: Knex, companyIds: string[]): Promise<ApproverMode> {
  const uniqueCompanyIds = Array.from(new Set(companyIds.filter(Boolean)));
  if (uniqueCompanyIds.length === 0) {
    throw new AppError(400, 'No company scope found for shift exchange approval');
  }

  const hrRow = await masterDb('users')
    .join('user_roles', 'users.id', 'user_roles.user_id')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .join('user_company_access as uca', 'users.id', 'uca.user_id')
    .whereIn('uca.company_id', uniqueCompanyIds)
    .andWhere('uca.is_active', true)
    .andWhere('users.is_active', true)
    .andWhereRaw('LOWER(roles.name) = ?', [HR_ROLE_NAME])
    .first('users.id');

  return hrRow ? 'hr' : 'management_fallback';
}

async function ensureApproverAccess(input: {
  masterDb: Knex;
  actingUserId: string;
  actingRoleNames: string[];
  companyIds: string[];
}): Promise<ApproverMode> {
  const mode = await getApproverMode(input.masterDb, input.companyIds);
  const hasCompanyAccess = await input.masterDb('user_company_access')
    .where({ user_id: input.actingUserId, is_active: true })
    .whereIn('company_id', input.companyIds)
    .first('id');
  if (!hasCompanyAccess) {
    throw new AppError(403, 'Approver is not assigned to the involved companies');
  }

  if (mode === 'hr') {
    if (!hasRole(input.actingRoleNames, HR_ROLE_NAME)) {
      throw new AppError(403, 'Only Human Resources can approve this shift exchange');
    }
    return mode;
  }

  if (!hasRole(input.actingRoleNames, MANAGEMENT_ROLE_NAME)) {
    throw new AppError(403, 'Only Management can approve this shift exchange');
  }
  return mode;
}

async function listApprovers(input: {
  masterDb: Knex;
  companyIds: string[];
  excludeUserIds: string[];
}): Promise<{ mode: ApproverMode; approvers: Array<{ user_id: string; company_id: string; company_db_name: string }> }> {
  const mode = await getApproverMode(input.masterDb, input.companyIds);
  const roleName = mode === 'hr' ? HR_ROLE_NAME : MANAGEMENT_ROLE_NAME;
  const rows = await input.masterDb('users')
    .join('user_roles', 'users.id', 'user_roles.user_id')
    .join('roles', 'user_roles.role_id', 'roles.id')
    .join('user_company_access as uca', 'users.id', 'uca.user_id')
    .join('companies', 'uca.company_id', 'companies.id')
    .whereIn('uca.company_id', input.companyIds)
    .andWhere('uca.is_active', true)
    .andWhere('users.is_active', true)
    .andWhereRaw('LOWER(roles.name) = ?', [roleName])
    .whereNotIn('users.id', input.excludeUserIds)
    .select(
      'users.id as user_id',
      'uca.company_id as company_id',
      'companies.db_name as company_db_name',
    )
    .orderBy('users.id', 'asc');

  const dedup = new Map<string, { user_id: string; company_id: string; company_db_name: string }>();
  for (const row of rows as Array<{ user_id: string; company_id: string; company_db_name: string }>) {
    if (!dedup.has(row.user_id)) {
      dedup.set(row.user_id, row);
    }
  }
  return { mode, approvers: Array.from(dedup.values()) };
}

async function getRequestById(masterDb: Knex, requestId: string): Promise<ShiftExchangeRequestRow> {
  const row = await masterDb(SHIFT_EXCHANGE_TABLE).where({ id: requestId }).first();
  if (!row) throw new AppError(404, 'Shift exchange request not found');
  return row as ShiftExchangeRequestRow;
}

function canViewRequest(row: ShiftExchangeRequestRow, actingUserId: string): boolean {
  return (
    row.requester_user_id === actingUserId
    || row.accepting_user_id === actingUserId
  );
}

async function toShiftExchangeDetail(input: {
  masterDb: Knex;
  row: ShiftExchangeRequestRow;
  actingUserId?: string;
  actingRoleNames?: string[];
}): Promise<ShiftExchangeDetail> {
  const { row } = input;
  const tenantCache = new Map<string, TenantContext>();
  const [requesterCtx, acceptingCtx] = await Promise.all([
    getTenantContextByCompanyId(input.masterDb, row.requester_company_id, tenantCache),
    getTenantContextByCompanyId(input.masterDb, row.accepting_company_id, tenantCache),
  ]);

  const [requesterShift, acceptingShift, users] = await Promise.all([
    getShiftById(requesterCtx.tenantDb, row.requester_shift_id),
    getShiftById(acceptingCtx.tenantDb, row.accepting_shift_id),
    loadUsersByIds(
      input.masterDb,
      [row.requester_user_id, row.accepting_user_id, row.requested_by, row.hr_decision_by ?? ''].filter(Boolean),
    ),
  ]);

  let approvalMode: ApproverMode | null = null;
  let canApprove = false;
  let canReject = false;
  const canRespond = Boolean(
    input.actingUserId
      && input.actingUserId === row.accepting_user_id
      && row.status === 'pending'
      && row.approval_stage === 'awaiting_employee',
  );

  if (input.actingUserId && input.actingRoleNames && row.status === 'pending' && row.approval_stage === 'awaiting_hr') {
    try {
      approvalMode = await ensureApproverAccess({
        masterDb: input.masterDb,
        actingUserId: input.actingUserId,
        actingRoleNames: input.actingRoleNames,
        companyIds: [row.requester_company_id, row.accepting_company_id],
      });
      canApprove = true;
      canReject = true;
    } catch {
      approvalMode = null;
      canApprove = false;
      canReject = false;
    }
  }

  const requesterUser = users[row.requester_user_id] ?? null;
  const acceptingUser = users[row.accepting_user_id] ?? null;
  const requestedByUser = users[row.requested_by] ?? null;
  const hrDecisionByUser = row.hr_decision_by ? (users[row.hr_decision_by] ?? null) : null;

  return {
    id: row.id,
    status: row.status,
    approval_stage: row.approval_stage,
    created_at: row.created_at,
    updated_at: row.updated_at,
    employee_decision_at: row.employee_decision_at,
    employee_rejection_reason: row.employee_rejection_reason,
    hr_decision_at: row.hr_decision_at,
    hr_rejection_reason: row.hr_rejection_reason,
    requester: {
      user_id: row.requester_user_id,
      name: formatUserName(requesterUser),
      email: requesterUser?.email ?? '',
      company_id: requesterCtx.company.id,
      company_name: requesterCtx.company.name,
      company_slug: requesterCtx.company.slug,
      branch_id: row.requester_branch_id,
      branch_name: requesterShift?.branch_name ?? null,
      shift_id: row.requester_shift_id,
      shift_start: requesterShift?.shift_start ?? null,
      shift_end: requesterShift?.shift_end ?? null,
      duty_type: requesterShift?.duty_type ?? null,
      odoo_shift_id: row.requester_shift_odoo_id,
    },
    accepting: {
      user_id: row.accepting_user_id,
      name: formatUserName(acceptingUser),
      email: acceptingUser?.email ?? '',
      company_id: acceptingCtx.company.id,
      company_name: acceptingCtx.company.name,
      company_slug: acceptingCtx.company.slug,
      branch_id: row.accepting_branch_id,
      branch_name: acceptingShift?.branch_name ?? null,
      shift_id: row.accepting_shift_id,
      shift_start: acceptingShift?.shift_start ?? null,
      shift_end: acceptingShift?.shift_end ?? null,
      duty_type: acceptingShift?.duty_type ?? null,
      odoo_shift_id: row.accepting_shift_odoo_id,
    },
    requested_by: {
      user_id: row.requested_by,
      name: formatUserName(requestedByUser),
    },
    hr_decision_by: hrDecisionByUser
      ? {
        user_id: row.hr_decision_by as string,
        name: formatUserName(hrDecisionByUser),
      }
      : null,
    can_respond: canRespond,
    can_approve: canApprove,
    can_reject: canReject,
    approval_mode: approvalMode,
  };
}

export async function listShiftExchangeOptions(input: {
  requesterUserId: string;
  currentCompanyId: string;
  fromShiftId: string;
}) {
  const masterDb = db.getMasterDb();
  const tenantCache = new Map<string, TenantContext>();
  const requesterCtx = await getTenantContextByCompanyId(masterDb, input.currentCompanyId, tenantCache);
  const fromShift = await getShiftById(requesterCtx.tenantDb, input.fromShiftId);

  if (!fromShift) throw new AppError(404, 'Source shift not found');
  if (fromShift.status !== 'open') throw new AppError(400, 'Source shift must be open');
  if (!fromShift.user_id || fromShift.user_id !== input.requesterUserId) {
    throw new AppError(403, 'Only the owner of this shift can request an exchange');
  }

  const requesterUser = (await loadUsersByIds(masterDb, [input.requesterUserId]))[input.requesterUserId];
  if (!requesterUser || !requesterUser.is_active) throw new AppError(403, 'Requester is inactive');
  if (isSuspended(requesterUser)) throw new AppError(403, 'Suspended users cannot exchange shifts');

  if (await hasPendingRequestForShift(masterDb, requesterCtx.company.id, fromShift.id)) {
    throw new AppError(409, 'This shift already has a pending exchange request');
  }

  const accessibleCompanies = await masterDb('user_company_access as uca')
    .join('companies as companies', 'uca.company_id', 'companies.id')
    .where('uca.user_id', input.requesterUserId)
    .andWhere('uca.is_active', true)
    .andWhere('companies.is_active', true)
    .select('companies.id', 'companies.name', 'companies.slug', 'companies.db_name')
    .orderBy('companies.name', 'asc');

  const candidateRows: ShiftOption[] = [];
  for (const company of accessibleCompanies as CompanyRow[]) {
    const context = await getTenantContextByCompanyId(masterDb, company.id, tenantCache);
    const rows = await listOpenShiftsWithUsers(context.tenantDb);
    for (const row of rows) {
      if (!row.user_id) continue;
      if (company.id === requesterCtx.company.id && row.id === fromShift.id) continue;
      candidateRows.push({
        company_id: company.id,
        company_name: company.name,
        company_slug: company.slug,
        company_db_name: company.db_name,
        shift_id: row.id,
        odoo_shift_id: row.odoo_shift_id,
        branch_id: row.branch_id,
        branch_name: row.branch_name,
        branch_odoo_id: row.branch_odoo_id,
        user_id: row.user_id,
        employee_name: row.employee_name,
        employee_avatar_url: row.employee_avatar_url,
        duty_type: row.duty_type,
        shift_start: row.shift_start,
        shift_end: row.shift_end,
        allocated_hours: row.allocated_hours,
      });
    }
  }

  const targetUserIds = Array.from(new Set(candidateRows.map((row) => row.user_id)));
  const usersById = await loadUsersByIds(masterDb, [input.requesterUserId, ...targetUserIds]);
  const designation = await loadDesignationSets(masterDb, [input.requesterUserId, ...targetUserIds]);
  await enrichDesignationSetsFromTenantUserBranches({
    masterDb,
    designation,
    userIds: [input.requesterUserId, ...targetUserIds],
    companyIds: [requesterCtx.company.id, ...candidateRows.map((row) => row.company_id)],
    tenantCache,
  });

  const options: ShiftOption[] = [];
  for (const option of candidateRows) {
    const targetUser = usersById[option.user_id];
    if (!targetUser || !targetUser.is_active) continue;
    if (isSuspended(targetUser)) continue;
    if (targetUser.id === input.requesterUserId) continue;

    // For same-company exchanges, allow eligible open shifts without cross-branch designation gating.
    // For inter-company exchanges, require both employees to be designated in the destination company/branch.
    if (option.company_id !== requesterCtx.company.id) {
      const requesterCanWorkTarget = isDesignatedToCompanyBranch(
        designation,
        input.requesterUserId,
        option.company_id,
        option.branch_id,
      );
      const targetCanWorkRequester = isDesignatedToCompanyBranch(
        designation,
        option.user_id,
        requesterCtx.company.id,
        fromShift.branch_id,
      );
      if (!requesterCanWorkTarget || !targetCanWorkRequester) continue;
    }

    if (await hasPendingRequestForShift(masterDb, option.company_id, option.shift_id)) continue;
    options.push(option);
  }

  return {
    fromShift: {
      company_id: requesterCtx.company.id,
      company_name: requesterCtx.company.name,
      company_slug: requesterCtx.company.slug,
      shift_id: fromShift.id,
      odoo_shift_id: fromShift.odoo_shift_id,
      branch_id: fromShift.branch_id,
      branch_name: fromShift.branch_name,
      branch_odoo_id: fromShift.branch_odoo_id,
      user_id: fromShift.user_id,
      employee_name: fromShift.employee_name,
      employee_avatar_url: fromShift.employee_avatar_url,
      duty_type: fromShift.duty_type,
      shift_start: fromShift.shift_start,
      shift_end: fromShift.shift_end,
      allocated_hours: fromShift.allocated_hours,
    },
    options,
  };
}

export async function createShiftExchangeRequest(input: {
  requesterUserId: string;
  currentCompanyId: string;
  fromShiftId: string;
  toShiftId: string;
  toCompanyId: string;
}) {
  const masterDb = db.getMasterDb();
  const optionPayload = await listShiftExchangeOptions({
    requesterUserId: input.requesterUserId,
    currentCompanyId: input.currentCompanyId,
    fromShiftId: input.fromShiftId,
  });

  const chosen = optionPayload.options.find(
    (option) => option.shift_id === input.toShiftId && option.company_id === input.toCompanyId,
  );
  if (!chosen) {
    throw new AppError(400, 'Selected target shift is not eligible for exchange');
  }

  const requesterCompany = await getActiveCompanyById(masterDb, input.currentCompanyId);
  const now = new Date();
  const [created] = await masterDb(SHIFT_EXCHANGE_TABLE)
    .insert({
      requester_user_id: input.requesterUserId,
      accepting_user_id: chosen.user_id,
      requested_by: input.requesterUserId,
      requester_company_id: requesterCompany.id,
      requester_company_db_name: requesterCompany.db_name,
      requester_branch_id: optionPayload.fromShift.branch_id,
      requester_shift_id: optionPayload.fromShift.shift_id,
      requester_shift_odoo_id: optionPayload.fromShift.odoo_shift_id,
      accepting_company_id: chosen.company_id,
      accepting_company_db_name: chosen.company_db_name,
      accepting_branch_id: chosen.branch_id,
      accepting_shift_id: chosen.shift_id,
      accepting_shift_odoo_id: chosen.odoo_shift_id,
      status: 'pending',
      approval_stage: 'awaiting_employee',
      created_at: now,
      updated_at: now,
    })
    .returning('*');

  const users = await loadUsersByIds(masterDb, [input.requesterUserId, chosen.user_id]);
  const requesterName = formatUserName(users[input.requesterUserId] ?? null);
  const acceptingTenantDb = await db.getTenantDb(chosen.company_db_name);
  await createAndDispatchNotification({
    tenantDb: acceptingTenantDb,
    userId: chosen.user_id,
    title: 'Shift Exchange Request',
    message: `${requesterName} requested to exchange shifts with you.`,
    type: 'warning',
    linkUrl: `/account/notifications?shiftExchangeId=${created.id}`,
  });

  return toShiftExchangeDetail({
    masterDb,
    row: created as ShiftExchangeRequestRow,
    actingUserId: input.requesterUserId,
    actingRoleNames: [],
  });
}

export async function getShiftExchangeDetail(input: {
  requestId: string;
  actingUserId: string;
  actingRoleNames: string[];
}) {
  const masterDb = db.getMasterDb();
  const row = await getRequestById(masterDb, input.requestId);
  if (!canViewRequest(row, input.actingUserId)) {
    await ensureApproverAccess({
      masterDb,
      actingUserId: input.actingUserId,
      actingRoleNames: input.actingRoleNames,
      companyIds: [row.requester_company_id, row.accepting_company_id],
    });
  }

  return toShiftExchangeDetail({
    masterDb,
    row,
    actingUserId: input.actingUserId,
    actingRoleNames: input.actingRoleNames,
  });
}

export async function respondToShiftExchange(input: {
  requestId: string;
  actingUserId: string;
  action: 'accept' | 'reject';
  reason?: string;
}) {
  const masterDb = db.getMasterDb();
  const row = await getRequestById(masterDb, input.requestId);
  if (row.accepting_user_id !== input.actingUserId) {
    throw new AppError(403, 'Only the accepting employee can respond');
  }
  if (row.status !== 'pending' || row.approval_stage !== 'awaiting_employee') {
    throw new AppError(400, 'This shift exchange request can no longer be responded to');
  }

  const users = await loadUsersByIds(masterDb, [row.requester_user_id, row.accepting_user_id]);
  const requester = users[row.requester_user_id];
  const accepting = users[row.accepting_user_id];
  if (!requester || !accepting) {
    throw new AppError(404, 'Employee account not found');
  }
  if (!requester.is_active || !accepting.is_active) {
    throw new AppError(409, 'Inactive employees cannot continue shift exchanges');
  }
  if (isSuspended(requester) || isSuspended(accepting)) {
    throw new AppError(409, 'Suspended employees cannot continue shift exchanges');
  }

  const now = new Date();
  let updated: ShiftExchangeRequestRow;
  if (input.action === 'reject') {
    const [result] = await masterDb(SHIFT_EXCHANGE_TABLE)
      .where({ id: row.id })
      .update({
        status: 'rejected',
        approval_stage: 'resolved',
        employee_decision_at: now,
        employee_rejection_reason: input.reason?.trim() || null,
        updated_at: now,
      })
      .returning('*');
    updated = result as ShiftExchangeRequestRow;

    const requesterTenantDb = await db.getTenantDb(row.requester_company_db_name);
    const acceptingName = formatUserName(accepting);
    const reasonSuffix = input.reason?.trim() ? ` Reason: ${input.reason.trim()}` : '';
    await createAndDispatchNotification({
      tenantDb: requesterTenantDb,
      userId: row.requester_user_id,
      title: 'Shift Exchange Rejected',
      message: `${acceptingName} rejected your shift exchange request.${reasonSuffix}`,
      type: 'danger',
      linkUrl: `/account/notifications?shiftExchangeId=${row.id}`,
    });
  } else {
    const [result] = await masterDb(SHIFT_EXCHANGE_TABLE)
      .where({ id: row.id })
      .update({
        approval_stage: 'awaiting_hr',
        employee_decision_at: now,
        employee_rejection_reason: null,
        updated_at: now,
      })
      .returning('*');
    updated = result as ShiftExchangeRequestRow;

    const approverResult = await listApprovers({
      masterDb,
      companyIds: [row.requester_company_id, row.accepting_company_id],
      excludeUserIds: [row.requester_user_id, row.accepting_user_id],
    });
    const requesterName = formatUserName(requester);
    const acceptingName = formatUserName(accepting);
    await Promise.all(
      approverResult.approvers.map(async (approver) => {
        const tenantDb = await db.getTenantDb(approver.company_db_name);
        await createAndDispatchNotification({
          tenantDb,
          userId: approver.user_id,
          title: 'Shift Exchange Pending Approval',
          message: `${requesterName} and ${acceptingName} shift exchange is pending ${approverResult.mode === 'hr' ? 'HR' : 'Management'} approval.`,
          type: 'warning',
          linkUrl: `/authorization-requests?shiftExchangeId=${row.id}`,
        });
      }),
    );
  }

  return toShiftExchangeDetail({
    masterDb,
    row: updated,
    actingUserId: input.actingUserId,
    actingRoleNames: [],
  });
}

function toStageLabel(row: Pick<ShiftExchangeRequestRow, 'status' | 'approval_stage'>): string {
  if (row.status !== 'pending') {
    return row.status === 'approved' ? 'Approved' : 'Rejected';
  }
  if (row.approval_stage === 'awaiting_employee') return 'Awaiting Employee Acceptance';
  if (row.approval_stage === 'awaiting_hr') return 'Pending HR Approval';
  return 'Pending';
}

function parsePositiveInt(value: string | number | null | undefined, fieldLabel: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new AppError(400, `${fieldLabel} is missing or invalid`);
  }
  return parsed;
}

export async function approveShiftExchange(input: {
  requestId: string;
  actingUserId: string;
  actingRoleNames: string[];
}) {
  const masterDb = db.getMasterDb();
  const row = await getRequestById(masterDb, input.requestId);
  if (row.status !== 'pending' || row.approval_stage !== 'awaiting_hr') {
    throw new AppError(400, 'This shift exchange request is not awaiting HR approval');
  }

  await ensureApproverAccess({
    masterDb,
    actingUserId: input.actingUserId,
    actingRoleNames: input.actingRoleNames,
    companyIds: [row.requester_company_id, row.accepting_company_id],
  });

  const users = await loadUsersByIds(masterDb, [
    row.requester_user_id,
    row.accepting_user_id,
    input.actingUserId,
  ]);
  const requesterUser = users[row.requester_user_id];
  const acceptingUser = users[row.accepting_user_id];
  const approverUser = users[input.actingUserId];
  if (!requesterUser || !acceptingUser || !approverUser) {
    throw new AppError(404, 'Employee account not found');
  }
  if (!requesterUser.is_active || !acceptingUser.is_active) {
    throw new AppError(409, 'Inactive employees cannot continue shift exchanges');
  }
  if (isSuspended(requesterUser) || isSuspended(acceptingUser)) {
    throw new AppError(409, 'Suspended employees cannot continue shift exchanges');
  }
  if (!requesterUser.user_key || !acceptingUser.user_key) {
    throw new AppError(409, 'One of the employees has no website key for Odoo resource mapping');
  }

  const tenantCache = new Map<string, TenantContext>();
  const [requesterCtx, acceptingCtx] = await Promise.all([
    getTenantContextByCompanyId(masterDb, row.requester_company_id, tenantCache),
    getTenantContextByCompanyId(masterDb, row.accepting_company_id, tenantCache),
  ]);
  const [requesterShift, acceptingShift] = await Promise.all([
    getShiftById(requesterCtx.tenantDb, row.requester_shift_id),
    getShiftById(acceptingCtx.tenantDb, row.accepting_shift_id),
  ]);
  if (!requesterShift || !acceptingShift) {
    throw new AppError(409, 'One of the shifts no longer exists');
  }
  if (requesterShift.status !== 'open' || acceptingShift.status !== 'open') {
    throw new AppError(409, 'Both shifts must still be open for final approval');
  }

  const requesterCompanyOdooId = parsePositiveInt(
    requesterShift.branch_odoo_id,
    'Requester branch Odoo company ID',
  );
  const acceptingCompanyOdooId = parsePositiveInt(
    acceptingShift.branch_odoo_id,
    'Accepting branch Odoo company ID',
  );

  try {
    await Promise.all([
      updatePlanningSlotState(row.requester_shift_odoo_id, 'draft'),
      updatePlanningSlotState(row.accepting_shift_odoo_id, 'draft'),
    ]);

    const [acceptingResourceInRequesterCompany, requesterResourceInAcceptingCompany] = await Promise.all([
      getResourceIdByWebsiteUserKeyAndCompanyId(String(acceptingUser.user_key), requesterCompanyOdooId),
      getResourceIdByWebsiteUserKeyAndCompanyId(String(requesterUser.user_key), acceptingCompanyOdooId),
    ]);

    if (!acceptingResourceInRequesterCompany || !requesterResourceInAcceptingCompany) {
      throw new AppError(409, 'Could not resolve cross-company employee resources for slot swap');
    }

    await Promise.all([
      updatePlanningSlotResource(row.requester_shift_odoo_id, acceptingResourceInRequesterCompany),
      updatePlanningSlotResource(row.accepting_shift_odoo_id, requesterResourceInAcceptingCompany),
    ]);

    await Promise.all([
      updatePlanningSlotState(row.requester_shift_odoo_id, 'published'),
      updatePlanningSlotState(row.accepting_shift_odoo_id, 'published'),
    ]);
  } catch (error) {
    logger.error({ requestId: row.id, error }, 'Shift exchange Odoo approval flow failed');
    throw error instanceof AppError
      ? error
      : new AppError(500, 'Failed to apply shift exchange in Odoo; request remains pending HR');
  }

  const now = new Date();
  const [updated] = await masterDb(SHIFT_EXCHANGE_TABLE)
    .where({ id: row.id })
    .update({
      status: 'approved',
      approval_stage: 'resolved',
      hr_decision_by: input.actingUserId,
      hr_decision_at: now,
      hr_rejection_reason: null,
      updated_at: now,
    })
    .returning('*');

  const requesterTenantDb = await db.getTenantDb(row.requester_company_db_name);
  const acceptingTenantDb = await db.getTenantDb(row.accepting_company_db_name);
  await Promise.all([
    createAndDispatchNotification({
      tenantDb: requesterTenantDb,
      userId: row.requester_user_id,
      title: 'Shift Exchange Approved',
      message: 'Your shift exchange request has been approved.',
      type: 'success',
      linkUrl: `/account/notifications?shiftExchangeId=${row.id}`,
    }),
    createAndDispatchNotification({
      tenantDb: acceptingTenantDb,
      userId: row.accepting_user_id,
      title: 'Shift Exchange Approved',
      message: 'Your shift exchange request has been approved.',
      type: 'success',
      linkUrl: `/account/notifications?shiftExchangeId=${row.id}`,
    }),
  ]);

  return toShiftExchangeDetail({
    masterDb,
    row: updated as ShiftExchangeRequestRow,
    actingUserId: input.actingUserId,
    actingRoleNames: input.actingRoleNames,
  });
}

export async function rejectShiftExchange(input: {
  requestId: string;
  actingUserId: string;
  actingRoleNames: string[];
  reason: string;
}) {
  const masterDb = db.getMasterDb();
  const row = await getRequestById(masterDb, input.requestId);
  if (row.status !== 'pending' || row.approval_stage !== 'awaiting_hr') {
    throw new AppError(400, 'This shift exchange request is not awaiting HR approval');
  }

  const reason = input.reason.trim();
  if (!reason) {
    throw new AppError(400, 'Rejection reason is required');
  }

  await ensureApproverAccess({
    masterDb,
    actingUserId: input.actingUserId,
    actingRoleNames: input.actingRoleNames,
    companyIds: [row.requester_company_id, row.accepting_company_id],
  });

  const now = new Date();
  const [updated] = await masterDb(SHIFT_EXCHANGE_TABLE)
    .where({ id: row.id })
    .update({
      status: 'rejected',
      approval_stage: 'resolved',
      hr_decision_by: input.actingUserId,
      hr_decision_at: now,
      hr_rejection_reason: reason,
      updated_at: now,
    })
    .returning('*');

  const requesterTenantDb = await db.getTenantDb(row.requester_company_db_name);
  const acceptingTenantDb = await db.getTenantDb(row.accepting_company_db_name);
  await Promise.all([
    createAndDispatchNotification({
      tenantDb: requesterTenantDb,
      userId: row.requester_user_id,
      title: 'Shift Exchange Rejected',
      message: `Your shift exchange request was rejected by HR. Reason: ${reason}`,
      type: 'danger',
      linkUrl: `/account/notifications?shiftExchangeId=${row.id}`,
    }),
    createAndDispatchNotification({
      tenantDb: acceptingTenantDb,
      userId: row.accepting_user_id,
      title: 'Shift Exchange Rejected',
      message: `Your shift exchange request was rejected by HR. Reason: ${reason}`,
      type: 'danger',
      linkUrl: `/account/notifications?shiftExchangeId=${row.id}`,
    }),
  ]);

  return toShiftExchangeDetail({
    masterDb,
    row: updated as ShiftExchangeRequestRow,
    actingUserId: input.actingUserId,
    actingRoleNames: input.actingRoleNames,
  });
}

export async function listShiftExchangeRequestsForAuthorization(input: {
  currentCompanyId: string;
  branchIds: string[];
  status?: string;
}) {
  const masterDb = db.getMasterDb();
  let query = masterDb(SHIFT_EXCHANGE_TABLE)
    .where((builder) => {
      builder
        .where('requester_company_id', input.currentCompanyId)
        .orWhere('accepting_company_id', input.currentCompanyId);
    });

  if (input.status) {
    query = query.andWhere('status', input.status);
  }
  if (input.branchIds.length > 0) {
    query = query.andWhere((builder) => {
      builder
        .where((inner) => inner.where('requester_company_id', input.currentCompanyId).whereIn('requester_branch_id', input.branchIds))
        .orWhere((inner) => inner.where('accepting_company_id', input.currentCompanyId).whereIn('accepting_branch_id', input.branchIds));
    });
  }

  const rows = await query.orderBy('created_at', 'desc');
  if (rows.length === 0) return [];

  const userIds = Array.from(
    new Set(
      rows.flatMap((row: any) => [row.requester_user_id, row.accepting_user_id, row.requested_by].filter(Boolean)),
    ),
  );
  const usersById = await loadUsersByIds(masterDb, userIds);
  const tenantCache = new Map<string, TenantContext>();

  const result = await Promise.all(
    (rows as ShiftExchangeRequestRow[]).map(async (row) => {
      const [requesterCtx, acceptingCtx] = await Promise.all([
        getTenantContextByCompanyId(masterDb, row.requester_company_id, tenantCache),
        getTenantContextByCompanyId(masterDb, row.accepting_company_id, tenantCache),
      ]);
      const [requesterShift, acceptingShift] = await Promise.all([
        getShiftById(requesterCtx.tenantDb, row.requester_shift_id),
        getShiftById(acceptingCtx.tenantDb, row.accepting_shift_id),
      ]);

      const requesterUser = usersById[row.requester_user_id] ?? null;
      const acceptingUser = usersById[row.accepting_user_id] ?? null;

      return {
        id: row.id,
        auth_type: 'shift_exchange',
        status: row.status,
        approval_stage: row.approval_stage,
        stage_label: toStageLabel(row),
        created_at: row.created_at,
        updated_at: row.updated_at,
        requester_user_id: row.requester_user_id,
        requester_name: formatUserName(requesterUser),
        accepting_user_id: row.accepting_user_id,
        accepting_name: formatUserName(acceptingUser),
        requester_company_id: row.requester_company_id,
        requester_company_name: requesterCtx.company.name,
        requester_branch_id: row.requester_branch_id,
        requester_branch_name: requesterShift?.branch_name ?? null,
        requester_shift_id: row.requester_shift_id,
        requester_shift_start: requesterShift?.shift_start ?? null,
        requester_shift_end: requesterShift?.shift_end ?? null,
        requester_shift_duty_type: requesterShift?.duty_type ?? null,
        accepting_company_id: row.accepting_company_id,
        accepting_company_name: acceptingCtx.company.name,
        accepting_branch_id: row.accepting_branch_id,
        accepting_branch_name: acceptingShift?.branch_name ?? null,
        accepting_shift_id: row.accepting_shift_id,
        accepting_shift_start: acceptingShift?.shift_start ?? null,
        accepting_shift_end: acceptingShift?.shift_end ?? null,
        accepting_shift_duty_type: acceptingShift?.duty_type ?? null,
        employee_rejection_reason: row.employee_rejection_reason,
        hr_rejection_reason: row.hr_rejection_reason,
      };
    }),
  );

  return result;
}
